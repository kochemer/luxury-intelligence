/**
 * How much the agents are allowed to do without a human.
 *
 * One place, read from the environment, so authority can be widened or pulled
 * back by flipping a repo variable — no code change, no deploy. That matters
 * because the moment you want to revoke authority is usually the moment you
 * least want to be editing code.
 *
 * The levels are additive and deliberately ordered by how hard the action is
 * to undo:
 *
 *   observe   report only; nothing is written anywhere        (safest)
 *   propose   repair opens pull requests for review
 *   recover   rollback may revert a bad production deployment
 *   autonomy  repair merges its own work when every gate passes
 *
 * `guardrails()` below is separate from all of this on purpose: those limits
 * hold at every level, including the highest, and are verified at runtime
 * rather than trusted.
 */

import {
  DENIED_WRITE_PATHS,
  DENIED_BASH,
  MAX_REPAIRS_PER_RUN,
  buildAllowedTools,
} from './repair/policy';

export type AuthorityLevel = 'observe' | 'propose' | 'recover' | 'autonomy';

const LEVEL_ORDER: AuthorityLevel[] = ['observe', 'propose', 'recover', 'autonomy'];

export interface Authority {
  level: AuthorityLevel;
  /** Repair may push a branch and open a pull request. */
  canOpenPullRequests: boolean;
  /** Recovery may roll a bad production deployment back. */
  canRollbackDeployments: boolean;
  /**
   * Recovery may also revert the offending commit on main.
   *
   * Needed whenever merges can happen without review: a Vercel rollback
   * changes which build serves traffic but leaves the bad commit on main, so
   * the next unrelated push silently redeploys it. Reverting the deployment
   * without reverting the code is a fix that undoes itself.
   */
  canRevertCommits: boolean;
  /** Repair may merge its own pull request once all six gates pass. */
  canMergePullRequests: boolean;
  maxRepairsPerRun: number;
}

function atLeast(level: AuthorityLevel, required: AuthorityLevel): boolean {
  return LEVEL_ORDER.indexOf(level) >= LEVEL_ORDER.indexOf(required);
}

function parseLevel(raw: string | undefined): AuthorityLevel {
  const value = raw?.trim().toLowerCase();
  if (value && (LEVEL_ORDER as string[]).includes(value)) return value as AuthorityLevel;
  // Unrecognised or unset means observe. An authority setting must never be
  // granted by a typo.
  return 'observe';
}

export function getAuthority(): Authority {
  const level = parseLevel(process.env.SEO_AGENT_AUTHORITY);

  return {
    level,
    canOpenPullRequests: atLeast(level, 'propose'),
    canRollbackDeployments: atLeast(level, 'recover'),
    canRevertCommits: atLeast(level, 'autonomy'),
    canMergePullRequests: atLeast(level, 'autonomy'),
    maxRepairsPerRun: MAX_REPAIRS_PER_RUN,
  };
}

export function describeAuthority(authority: Authority): string {
  const granted = [
    authority.canOpenPullRequests && 'open PRs',
    authority.canRollbackDeployments && 'roll back deployments',
    authority.canRevertCommits && 'revert commits',
    authority.canMergePullRequests && 'merge its own PRs',
  ].filter(Boolean);

  return granted.length === 0
    ? `${authority.level} — reports only, writes nothing`
    : `${authority.level} — may ${granted.join(', ')}`;
}

/**
 * Runtime tripwire on the limits that hold at every authority level.
 *
 * These are re-checked on every run rather than assumed, because the failure
 * this defends against is the policy itself being weakened — by a careless
 * edit, a bad merge, or an agent that found a way to touch policy.ts despite
 * the deny rule. A guardrail nobody verifies is a guardrail you only discover
 * was missing afterwards.
 *
 * Throws rather than warns. Refusing to run is always recoverable; running
 * without limits may not be.
 */
export function assertGuardrails(): void {
  const failures: string[] = [];

  // Paths whose loss could destroy the project or leak credentials, as opposed
  // to merely breaking SEO. Every one must still be denied.
  const mustBeDenied = [
    '.env',                  // credentials
    'lib/db/',               // database
    'lib/stripe/',           // payments
    'app/api/stripe/',       // payment webhooks
    '.github/',              // CI, including the agents' own workflows
    'next.config.ts',        // redirect map for every URL
    'lib/utils/weekSlug.ts', // slug scheme for every digest URL
    'middleware.ts',         // canonical/redirect handling
    'package.json',          // dependencies
    'data/digests/',         // published content
    'seo/repair/policy.ts',  // the limits themselves
  ];

  for (const path of mustBeDenied) {
    if (!DENIED_WRITE_PATHS.includes(path)) {
      failures.push(`DENIED_WRITE_PATHS no longer contains "${path}"`);
    }
  }

  // Commands that could destroy history or publish unreviewed work.
  const mustBeDeniedCommands = ['rm:', 'git push:', 'git reset:', 'git checkout:', 'gh pr merge:'];
  const deniedBash = DENIED_BASH.join(' ');
  for (const command of mustBeDeniedCommands) {
    if (!deniedBash.includes(command)) {
      failures.push(`DENIED_BASH no longer blocks "${command}"`);
    }
  }

  // The agent must never hold destructive or network tools, whatever else it has.
  const allowed = buildAllowedTools().join(' ');
  for (const forbidden of ['rm', 'WebFetch', 'WebSearch', 'curl', 'git push']) {
    if (allowed.includes(forbidden)) {
      failures.push(`ALLOWED tools unexpectedly include "${forbidden}"`);
    }
  }

  if (MAX_REPAIRS_PER_RUN > 3) {
    failures.push(`MAX_REPAIRS_PER_RUN is ${MAX_REPAIRS_PER_RUN}; a single run must stay small`);
  }

  if (failures.length > 0) {
    throw new Error(
      'Refusing to run: the agent guardrails have been weakened.\n\n' +
      failures.map(f => `  ✗ ${f}`).join('\n') +
      '\n\nThese limits are independent of authority level and must hold even at ' +
      '"autonomy". Restore them in seo/repair/policy.ts before running again.'
    );
  }
}
