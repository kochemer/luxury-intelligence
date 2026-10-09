#!/usr/bin/env node
// Documentation drift check. Rules and rationale: docs/README.md §6.
//
//   node scripts/checkDocs.mjs                      consistency checks (CI, npm run docs:check)
//   node scripts/checkDocs.mjs --commit-msg <file>  + co-change rule on staged files (git commit-msg hook)
//
// Plain Node, no dependencies, so CI can run it without `npm ci`.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);

const tracked = git('ls-files', '-z').split('\0').filter(Boolean);

const topDirs = [...new Set(tracked.filter((f) => f.includes('/')).map((f) => f.split('/')[0]))];
const rootFiles = new Set(tracked.filter((f) => !f.includes('/')));

// Everything an agent is expected to read. Archive is history, not documentation.
const docFiles = tracked.filter(
  (f) => f.endsWith('.md') && !f.startsWith('docs/archive/') && !f.startsWith('data/') && !f.includes('node_modules/'),
); // data/**/*.md are generated reports, not docs
const claudeMd = read('CLAUDE.md');
const corpus = docFiles.map((f) => (existsSync(join(ROOT, f)) ? read(f) : '')).join('\n');

// ── 1. Environment variables used in code are documented somewhere ──────────
const ENV_IGNORE = new Set(['NODE_ENV', 'CI', 'NEXT_RUNTIME', 'VERCEL', 'VERCEL_ENV', 'VERCEL_URL', 'PORT', 'TEST_URL']);
const CODE_RE = /\.(ts|tsx|mjs|js)$/;
const codeFiles = tracked.filter(
  (f) => CODE_RE.test(f) && !f.startsWith('docs/') && !f.startsWith('tmp/') && !f.includes('node_modules/') && !f.startsWith('public/'),
);
const envUses = new Map();
for (const f of codeFiles) {
  if (!existsSync(join(ROOT, f))) continue;
  const src = read(f);
  for (const m of src.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)|process\.env\[['"]([A-Z][A-Z0-9_]+)['"]\]/g)) {
    const name = m[1] || m[2];
    if (ENV_IGNORE.has(name) || name.startsWith('GITHUB_')) continue;
    if (!envUses.has(name)) envUses.set(name, f);
  }
}
for (const [name, file] of envUses) {
  if (!corpus.includes(name)) fail(`env var ${name} (used in ${file}) is not documented. Add it to the env table in CLAUDE.md, or the tuning list in docs/operations.md.`);
}

// ── 2. npm scripts are documented ───────────────────────────────────────────
const pkg = JSON.parse(read('package.json'));
for (const name of Object.keys(pkg.scripts || {})) {
  if (['dev', 'build', 'start', 'lint', 'test', 'prepare'].includes(name)) continue;
  if (!corpus.includes(name)) fail(`npm script "${name}" is not mentioned in any doc. Add it to CLAUDE.md Commands or the relevant doc.`);
}

// ── 3. Top-level directories appear in CLAUDE.md ────────────────────────────
for (const d of topDirs) {
  if (!claudeMd.includes(`\`${d}/`) && !claudeMd.includes(`\`${d}\``)) fail(`top-level directory ${d}/ is not in the CLAUDE.md directory table.`);
}

// ── 4. App routes and API routes are documented ─────────────────────────────
const NOT_ROUTES = new Set(['components', 'context', 'api', 'es', 'da']);
const subdirs = (p) => (existsSync(join(ROOT, p)) ? readdirSync(join(ROOT, p)).filter((n) => statSync(join(ROOT, p, n)).isDirectory()) : []);
for (const d of subdirs('app')) {
  if (NOT_ROUTES.has(d) || /^[_(\[]/.test(d)) continue;
  if (!corpus.includes(`/${d}`)) fail(`route /${d} (app/${d}/) is not mentioned in any doc.`);
}
for (const d of subdirs('app/api')) {
  if (!corpus.includes(`api/${d}`)) fail(`API route /api/${d} is not mentioned in any doc.`);
}

// ── 5. Database tables are listed in CLAUDE.md ──────────────────────────────
if (existsSync(join(ROOT, 'lib/db/schema.ts'))) {
  for (const m of read('lib/db/schema.ts').matchAll(/pgTable\(\s*['"]([a-z0-9_]+)['"]/g)) {
    if (!claudeMd.includes(m[1])) fail(`DB table ${m[1]} (lib/db/schema.ts) is not in the CLAUDE.md Database section.`);
  }
}

// ── 6. Workflows are described in docs/operations.md ────────────────────────
const ops = existsSync(join(ROOT, 'docs/operations.md')) ? read('docs/operations.md') : '';
for (const f of tracked.filter((f) => f.startsWith('.github/workflows/'))) {
  const base = f.split('/').pop();
  if (!ops.includes(base)) fail(`workflow ${base} is not described in docs/operations.md.`);
}

// ── 7. Every doc is in the doc map; staleness warning ───────────────────────
const map = existsSync(join(ROOT, 'docs/README.md')) ? read('docs/README.md') : '';
for (const f of docFiles) {
  if (f === 'docs/README.md') continue;
  if (!map.includes(f)) fail(`${f} is not in the doc map (docs/README.md). Add it with a status, or move it to docs/archive/.`);
}
const STALE_DAYS = 120;
for (const row of map.matchAll(/^\|\s*`([^`]+)`.*\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*$/gm)) {
  const age = (Date.now() - Date.parse(row[2])) / 86_400_000;
  if (age > STALE_DAYS) warnings.push(`${row[1]} last checked ${row[2]} (${Math.round(age)} days ago). Verify it against the code and update the date.`);
}

// ── 8. Paths cited in the core docs exist ───────────────────────────────────
const CORE_DOCS = ['CLAUDE.md', 'AGENTS.md', 'README.md', 'docs/README.md', 'docs/operations.md', 'video-short/README.md'];
const missing = [];
for (const doc of CORE_DOCS.filter((d) => existsSync(join(ROOT, d)))) {
  for (const m of read(doc).matchAll(/`([^`\s]+)`/g)) {
    let p = m[1].replace(/#.*$/, '').replace(/:\d+$/, '');
    if (!/^[\w.\-\/\[\]]+$/.test(p) || /YYYY|Www|\.\.\./.test(p)) continue;
    // Only check repo-rooted paths (first segment is a real top-level dir, or a
    // root file name); bare names in tables are relative to their row.
    const rooted = p.includes('/') ? topDirs.includes(p.split('/')[0]) : rootFiles.has(p) || /^[A-Z][\w-]*\.md$/.test(p);
    // A doc below the root may cite paths relative to its own directory.
    const local = p.includes('/') && doc.includes('/') && existsSync(join(ROOT, dirname(doc), p.split('/')[0]));
    if (!rooted && !local) continue;
    const candidates = [p, join(dirname(doc), p)];
    if (!candidates.some((c) => existsSync(join(ROOT, c)))) missing.push({ doc, p });
  }
}
if (missing.length) {
  // Gitignored paths (build output, local-only data) are allowed to be absent.
  let ignored = new Set();
  try {
    // Ask about both forms: a doc below the root may cite a path relative to its
    // own directory (video-short/README.md cites `explainer/out/...`), and only
    // the repo-rooted form matches .gitignore.
    const forms = missing.flatMap((x) => [x.p, `${dirname(x.doc)}/${x.p}`]);
    ignored = new Set(execFileSync('git', ['check-ignore', '--no-index', '--stdin'], { cwd: ROOT, encoding: 'utf8', input: forms.join('\n') }).split('\n'));
  } catch { /* exit 1 = none ignored */ }
  const untrackedOk = new Set(['luxury-intel-roadmap-2026-09.md']); // owner's planning doc, untracked on purpose
  for (const { doc, p } of missing) {
    if (!ignored.has(p) && !ignored.has(`${dirname(doc)}/${p}`) && !untrackedOk.has(p)) fail(`${doc} cites \`${p}\`, which does not exist.`);
  }
}

// ── 9. Co-change rule (commit-msg hook only) ────────────────────────────────
// Touching an area with a home doc requires touching that doc in the same
// commit, or an explicit `Docs-Skip: <reason>` trailer in the message.
const CO_CHANGE = [
  { code: /^pipeline\//, docs: ['docs/pipeline.md'] },
  { code: /^(ingestion|discovery|classification|digest|scoring|podcast|email)\//, docs: ['docs/pipeline.md', 'RANKING_METHODOLOGY.md', 'DISCOVERY_USAGE.md', 'docs/PAYWALL_AWARE_SELECTION.md'] },
  { code: /^(\.github\/workflows\/|next\.config\.ts$|vercel\.json$)/, docs: ['docs/operations.md'] },
  { code: /^(seo|lib\/seo)\//, docs: ['docs/seo-system.md', 'docs/seo-status.md', 'docs/seo-decisions.md', 'docs/seo-backlog.md'] },
  { code: /^(markets|lib\/markets)\//, docs: ['CLAUDE.md', 'docs/superpowers/specs/2026-10-04-markets-pages-design.md'] },
  { code: /^video-short\/(src|template)\//, docs: ['video-short/README.md'] },
  { code: /^(lib\/db\/schema\.ts$|middleware\.ts$|lib\/env\.ts$)/, docs: ['CLAUDE.md'] },
];
const msgIdx = process.argv.indexOf('--commit-msg');
if (msgIdx !== -1) {
  const msg = readFileSync(process.argv[msgIdx + 1], 'utf8').split('\n').filter((l) => !l.startsWith('#')).join('\n');
  const skip = msg.match(/^Docs-Skip:\s*(.{10,})$/m);
  const staged = git('diff', '--cached', '--name-only', '-z').split('\0').filter(Boolean);
  if (!skip) {
    for (const rule of CO_CHANGE) {
      const hits = staged.filter((f) => rule.code.test(f));
      if (hits.length && !rule.docs.some((d) => staged.includes(d))) {
        fail(`${hits[0]}${hits.length > 1 ? ` (+${hits.length - 1} more)` : ''} changed, but none of its docs did: ${rule.docs.join(', ')}.\n    Update the doc if your change made it wrong or incomplete. If no doc needs to change, add a trailer to the commit message:\n    Docs-Skip: <why no doc is affected, at least 10 chars>`);
      }
    }
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
for (const w of warnings) console.warn(`docs:check warning: ${w}`);
if (errors.length) {
  console.error(`\ndocs:check failed (${errors.length}). The repo's docs no longer match the code. See docs/README.md.\n`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error('');
  process.exit(1);
}
console.log('docs:check ok');
