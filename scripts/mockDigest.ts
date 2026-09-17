/**
 * Mock digest generator (LOCAL ONLY — never writes to data/digests).
 *
 * Rebuilds a week's digest with the CURRENT selection code (classification
 * precision + gpt-4.1 reranker + diversity repair) and generates AI summaries
 * for the picks, then renders a side-by-side HTML comparing the NEW selection
 * against the LIVE (production) digest for the same week. No podcast, no cover,
 * no translation, no editorial — just the articles + summaries per category.
 *
 * Usage:
 *   npm run digest:mock -- --week=2026-W37     (defaults to the current live week)
 * Output: mock/digest-<week>-comparison.html  (open with file://)
 */

import { promises as fs } from 'fs';
import path from 'path';
import { loadEnv } from '../lib/env';
import { buildWeeklyDigest } from '../digest/buildWeeklyDigest';
import { generateSummariesForDigest } from '../digest/generateSummaries';
import { getCurrentDigestWeek } from '../lib/utils/getCurrentDigestWeek';
import type { Topic, WeeklyDigest, Article } from '../lib/types';

loadEnv();

const CATEGORIES: { key: Topic; label: string }[] = [
  { key: 'AI_and_Strategy', label: 'AI & Strategy' },
  { key: 'Ecommerce_Retail_Tech', label: 'Ecommerce & Retail Tech' },
  { key: 'Luxury_and_Consumer', label: 'Luxury & Consumer' },
  { key: 'Jewellery_Industry', label: 'Jewellery Industry' },
];

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function summaryOf(a: Article): string {
  return (a.aiSummary && a.aiSummary.trim()) || (a.snippet && a.snippet.trim()) || '(no summary)';
}

function renderColumn(items: Article[], otherUrls: Set<string>): string {
  if (!items.length) return '<p class="empty">— none —</p>';
  return items.map((a, i) => {
    const isNew = !otherUrls.has(a.url);
    return `
      <div class="art ${isNew ? 'diff' : 'same'}">
        <div class="rank">${i + 1}${isNew ? ' <span class="tag">changed</span>' : ''}</div>
        <a class="title" href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.title)}</a>
        <div class="src">${esc(a.source)}</div>
        <div class="sum">${esc(summaryOf(a))}</div>
      </div>`;
  }).join('');
}

function urlsOf(d: WeeklyDigest, key: Topic): Set<string> {
  return new Set((d.topics[key]?.top ?? []).map(a => a.url));
}

async function loadLive(week: string): Promise<WeeklyDigest | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(process.cwd(), 'data', 'digests', `${week}.json`), 'utf-8'));
  } catch {
    return null;
  }
}

async function main() {
  let week = getCurrentDigestWeek();
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--week=')) week = arg.slice('--week='.length);
  }

  console.log(`[mock] Building NEW selection for ${week} (current code)...`);
  const fresh = await buildWeeklyDigest(week);
  console.log(`[mock] Generating summaries for the selected articles...`);
  await generateSummariesForDigest(fresh);

  const live = await loadLive(week);
  if (!live) console.warn(`[mock] No live digest found at data/digests/${week}.json — showing NEW only.`);

  const sections = CATEGORIES.map(({ key, label }) => {
    const newItems = fresh.topics[key]?.top ?? [];
    const liveItems = live?.topics[key]?.top ?? [];
    const newUrls = new Set(newItems.map(a => a.url));
    const liveUrls = live ? urlsOf(live, key) : new Set<string>();
    const changed = newItems.filter(a => !liveUrls.has(a.url)).length;
    return `
      <section>
        <h2>${esc(label)} <span class="delta">${changed}/${newItems.length} changed vs live</span></h2>
        <div class="cols">
          <div class="col">
            <h3>NEW — mock (gpt-4.1 + precision)</h3>
            ${renderColumn(newItems, liveUrls)}
          </div>
          <div class="col">
            <h3>LIVE — current production</h3>
            ${renderColumn(liveItems, newUrls)}
          </div>
        </div>
      </section>`;
  }).join('');

  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Mock digest ${esc(week)} — comparison</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 14px/1.5 -apple-system, system-ui, sans-serif; margin: 0; background: #f6f7f9; color: #1a1a1a; }
  header { padding: 20px 28px; background: #10233b; color: #fff; }
  header h1 { margin: 0 0 4px; font-size: 20px; }
  header p { margin: 0; opacity: .8; font-size: 13px; }
  section { margin: 24px auto; max-width: 1200px; padding: 0 16px; }
  h2 { font-size: 16px; border-bottom: 2px solid #c9a44a; padding-bottom: 6px; }
  .delta { font-size: 12px; font-weight: 400; color: #b26b00; margin-left: 8px; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .col h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: #666; margin: 8px 0; }
  .art { background: #fff; border: 1px solid #e4e7ea; border-radius: 6px; padding: 10px 12px; margin-bottom: 8px; }
  .art.diff { border-left: 3px solid #c9a44a; background: #fffdf6; }
  .rank { font-size: 11px; color: #999; margin-bottom: 2px; }
  .tag { background: #c9a44a; color: #fff; border-radius: 3px; padding: 0 5px; font-size: 10px; }
  .title { font-weight: 600; color: #10233b; text-decoration: none; display: block; }
  .title:hover { text-decoration: underline; }
  .src { font-size: 12px; color: #7a7f87; margin: 2px 0 6px; }
  .sum { font-size: 13px; color: #333; }
  .empty { color: #999; font-style: italic; }
  @media (prefers-color-scheme: dark) {
    body { background: #14161a; color: #e8e8e8; }
    .art { background: #1d2026; border-color: #2a2e35; }
    .art.diff { background: #241f14; }
    .title { color: #cfe0ff; } .sum { color: #cfd2d6; }
  }
</style></head><body>
<header>
  <h1>Mock digest — ${esc(week)}</h1>
  <p>NEW selection (current code) vs LIVE production. Gold = article not present in the other column. Local preview only — not published.</p>
</header>
${sections}
</body></html>`;

  const outDir = path.join(process.cwd(), 'mock');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `digest-${week}-comparison.html`);
  await fs.writeFile(outPath, html, 'utf-8');
  console.log(`\n[mock] ✓ Wrote ${outPath}`);
  console.log(`[mock] Open: file:///${outPath.replace(/\\/g, '/')}`);
}

main().catch(err => { console.error('[mock] Fatal:', err); process.exit(1); });
