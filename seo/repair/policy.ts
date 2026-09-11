/**
 * What an unattended repair agent is allowed to do.
 *
 * This file is the safety boundary. Everything here is enforced by the harness
 * (deny rules evaluated before the model acts) rather than by asking the model
 * nicely in a prompt — a prompt is a suggestion, a deny rule is not.
 *
 * Two independent limits apply to every run:
 *   1. Only finding codes in REPAIRABLE_CODES are ever attempted.
 *   2. Only paths under ALLOWED_WRITE_PATHS can be written, and never any path
 *      matching DENIED_WRITE_PATHS.
 *
 * Widening either list is a reviewed code change, which is the point.
 */

/**
 * Finding codes the agent may attempt to repair.
 *
 * The test for inclusion is: "is this a defect in this repository's code or
 * configuration, with a verifiable correct state?" Things that are true but
 * not code defects (a traffic drop, an unreachable host) are excluded — an
 * agent editing files cannot fix those, and letting it try invites damage.
 */
export const REPAIRABLE_CODES = new Set<string>([
  // Indexing contradictions — the site telling Google two opposite things.
  'LIVE_NOINDEX_ON_INDEXABLE',
  'LIVE_CANONICAL_MISSING',
  'LIVE_CANONICAL_MISMATCH',
  'LIVE_UNEXPECTED_REDIRECT',
  'STATIC_DIGEST_MISSING_FROM_SITEMAP',
  'STATIC_SITEMAP_URL_MISMATCH',
  'STATIC_ROBOTS_DISALLOW_CONFLICT',
  'LIVE_ROBOTS_NO_SITEMAP',

  // Structured data defects — verifiable against a schema.
  'LIVE_JSONLD_INVALID',
  'LIVE_JSONLD_MISSING_ARTICLE',
  'LIVE_JSONLD_MISSING_BREADCRUMBLIST',

  // On-page structure.
  'LIVE_H1_MISSING',
  'STATIC_ALT_TEXT_MISSING',
]);

/**
 * Codes that are real problems but explicitly NOT the agent's to fix.
 * Listed rather than merely omitted so the reasoning is visible, and so the
 * repair run can escalate them to a human by name instead of silently ignoring.
 */
export const ESCALATE_ONLY_CODES: Record<string, string> = {
  GSC_TRAFFIC_CLIFF:
    'A traffic drop is not a code defect. It needs a human to check Search Console for a manual action, an algorithm update, or an indexing problem.',
  LIVE_FETCH_FAILED:
    'The site is unreachable. That is infrastructure (hosting, DNS, deploy), not something a code change can repair.',
  LIVE_NON_200:
    'A page returning a non-200 may be a routing bug, a bad deploy, or intentional removal. Too ambiguous to repair unattended.',
  LIVE_TITLE_LENGTH:
    'Rewriting a title is editorial voice work, not breakage repair. It belongs to the (deferred) optimisation loop.',
  LIVE_DESC_LENGTH:
    'Rewriting a description is editorial voice work, not breakage repair.',
};

/**
 * Paths the agent may write to. Everything in the SEO system itself, plus the
 * specific app files that produce indexing signals.
 */
export const ALLOWED_WRITE_PATHS: string[] = [
  'lib/seo/',
  'seo/',
  'app/sitemap.ts',
  'app/robots.ts',
  'app/components/JsonLd.tsx',
  'app/components/Breadcrumbs.tsx',
  '__tests__/seo.',
];

/**
 * Paths that are never writable, whatever else is allowed.
 *
 * These are either (a) capable of breaking the business rather than the SEO,
 * (b) load-bearing for every URL on the site, or (c) the agent's own safety
 * rails, which it must not be able to loosen.
 */
export const DENIED_WRITE_PATHS: string[] = [
  '.env',                       // credentials
  'lib/db/',                    // database schema and access
  'lib/stripe/',                // payments
  'app/api/stripe/',            // payment webhooks
  'lib/env.ts',                 // credential loading
  'next.config.ts',             // the /week/* redirect map — breaks live URLs
  'lib/utils/weekSlug.ts',      // the slug scheme every digest URL depends on
  'middleware.ts',              // www/trailing-slash/canonical redirects
  '.github/',                   // its own workflows and safety rails
  'package.json',               // no adding dependencies unattended
  'package-lock.json',
  'seo/repair/policy.ts',       // this file: the agent cannot widen its own limits
  'data/digests/',              // published content
  'data/articles.json',
];

/**
 * Shell commands the agent may run. Verification needs a build and a test run;
 * nothing here can publish, deploy, or rewrite history.
 */
export const ALLOWED_BASH: string[] = [
  'Bash(npm run build)',
  'Bash(npm test)',
  'Bash(npm run lint)',
  'Bash(npm run seo:audit:*)',
  'Bash(npx tsc --noEmit)',
  'Bash(git status:*)',
  'Bash(git diff:*)',
  'Bash(git add:*)',
  'Bash(git commit:*)',
];

/**
 * Explicitly denied commands. `git push` and `gh pr merge` are absent from the
 * allow list already, but denying them outright means they stay blocked even
 * if the allow list is later widened carelessly — the orchestrator does the
 * pushing, not the agent.
 */
export const DENIED_BASH: string[] = [
  'Bash(git push:*)',
  'Bash(git reset:*)',
  'Bash(git checkout:*)',
  'Bash(git rebase:*)',
  'Bash(gh pr merge:*)',
  'Bash(npm publish:*)',
  'Bash(npm install:*)',
  'Bash(vercel:*)',
  'Bash(rm:*)',
  'Bash(curl:*)',   // no outbound calls; findings arrive as structured input
];

/** Maximum repair attempts for one finding before it escalates to a human. */
export const MAX_ATTEMPTS_PER_FINDING = 2;

/** Maximum findings repaired in a single run, to bound the blast radius. */
export const MAX_REPAIRS_PER_RUN = 1;

export function isRepairable(code: string): boolean {
  return REPAIRABLE_CODES.has(code);
}

export function escalationReason(code: string): string | null {
  return ESCALATE_ONLY_CODES[code] ?? null;
}

/**
 * Second line of defence: verify a changed path against the policy after the
 * agent has run. The harness deny rules should already have prevented this,
 * so anything caught here means a rule was wrong — the repair is rejected.
 */
export function isPathAllowed(repoRelativePath: string): boolean {
  const p = repoRelativePath.replace(/\\/g, '/');
  if (DENIED_WRITE_PATHS.some(denied => p === denied || p.startsWith(denied))) return false;
  return ALLOWED_WRITE_PATHS.some(allowed => p === allowed || p.startsWith(allowed));
}

/** Build the --disallowedTools argument list for the Claude Code CLI. */
export function buildDisallowedTools(): string[] {
  return [
    ...DENIED_BASH,
    // Edit(path) rules govern every file-writing tool, Write included.
    ...DENIED_WRITE_PATHS.map(p => `Edit(//${p}**)`),
    'WebFetch',
    'WebSearch',
  ];
}

/** Build the --allowedTools argument list for the Claude Code CLI. */
export function buildAllowedTools(): string[] {
  return [
    'Read',
    'Glob',
    'Grep',
    ...ALLOWED_WRITE_PATHS.map(p => `Edit(//${p}**)`),
    ...ALLOWED_BASH,
  ];
}
