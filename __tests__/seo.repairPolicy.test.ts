/**
 * Safety-boundary tests for the repair agent.
 *
 * These are the most important tests in the SEO system. Everything else guards
 * correctness; these guard against an unattended agent with write access doing
 * something irreversible. Each assertion below corresponds to a path that could
 * break payments, credentials, or every URL on the site.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  isPathAllowed,
  isRepairable,
  escalationReason,
  buildAllowedTools,
  buildDisallowedTools,
  DENIED_WRITE_PATHS,
  MAX_REPAIRS_PER_RUN,
  MAX_ATTEMPTS_PER_FINDING,
} from '../seo/repair/policy';

test('paths that could break the business are never writable', () => {
  const mustBeBlocked = [
    '.env',
    '.env.local',
    'lib/db/schema.ts',
    'lib/stripe/client.ts',
    'app/api/stripe/webhook/route.ts',
    'lib/env.ts',
    'next.config.ts',
    'lib/utils/weekSlug.ts',
    'middleware.ts',
    '.github/workflows/weekly-digest.yml',
    '.github/workflows/seo-monitor.yml',
    'package.json',
    'data/digests/2026-W36.json',
    'data/articles.json',
  ];

  for (const p of mustBeBlocked) {
    assert.equal(isPathAllowed(p), false, `${p} must NOT be writable by the repair agent`);
  }
});

test('the agent cannot widen its own limits', () => {
  // If policy.ts were writable, every other guarantee here is void.
  assert.equal(isPathAllowed('seo/repair/policy.ts'), false,
    'the policy file itself must never be writable');
});

test('SEO files the agent legitimately needs are writable', () => {
  const mustBeAllowed = [
    'lib/seo/urlInventory.ts',
    'lib/seo/metaText.ts',
    'lib/seo/jsonLd.ts',
    'seo/audit/staticAudit.ts',
    'app/sitemap.ts',
    'app/robots.ts',
    'app/components/Breadcrumbs.tsx',
    '__tests__/seo.urlInventory.test.ts',
  ];

  for (const p of mustBeAllowed) {
    assert.equal(isPathAllowed(p), true, `${p} should be writable`);
  }
});

test('a path outside both lists is denied by default', () => {
  // Default-deny, not default-allow: a file nobody thought about stays blocked.
  assert.equal(isPathAllowed('app/page.tsx'), false);
  assert.equal(isPathAllowed('some/new/thing.ts'), false);
  assert.equal(isPathAllowed('scripts/sendWeeklyEmailDigest.ts'), false);
});

test('windows-style backslash paths are normalised before checking', () => {
  // A path separator difference must not be a way around the deny list.
  assert.equal(isPathAllowed('lib\\db\\schema.ts'), false);
  assert.equal(isPathAllowed('.github\\workflows\\seo-monitor.yml'), false);
});

test('only code-defect findings are repairable', () => {
  assert.equal(isRepairable('LIVE_NOINDEX_ON_INDEXABLE'), true);
  assert.equal(isRepairable('LIVE_CANONICAL_MISSING'), true);
  assert.equal(isRepairable('STATIC_DIGEST_MISSING_FROM_SITEMAP'), true);

  // Not code defects — an agent editing files cannot fix these.
  assert.equal(isRepairable('GSC_TRAFFIC_CLIFF'), false);
  assert.equal(isRepairable('LIVE_FETCH_FAILED'), false);
  assert.equal(isRepairable('LIVE_NON_200'), false);

  // Editorial voice work, not breakage.
  assert.equal(isRepairable('LIVE_TITLE_LENGTH'), false);
});

test('non-repairable findings carry an explanation for the human', () => {
  for (const code of ['GSC_TRAFFIC_CLIFF', 'LIVE_FETCH_FAILED', 'LIVE_NON_200', 'LIVE_TITLE_LENGTH']) {
    const reason = escalationReason(code);
    assert(reason && reason.length > 20, `${code} should explain why it is not auto-repaired`);
  }
});

test('CLI tool flags deny every protected path and all publishing commands', () => {
  const denied = buildDisallowedTools().join(' ');

  for (const p of DENIED_WRITE_PATHS) {
    assert(denied.includes(p), `disallowedTools must cover ${p}`);
  }
  for (const cmd of ['git push', 'gh pr merge', 'npm install', 'rm']) {
    assert(denied.includes(cmd), `disallowedTools must block "${cmd}"`);
  }
});

test('the agent is granted no network tools', () => {
  const allowed = buildAllowedTools().join(' ');
  const denied = buildDisallowedTools().join(' ');

  assert(!allowed.includes('WebFetch'), 'WebFetch must not be allowed');
  assert(!allowed.includes('WebSearch'), 'WebSearch must not be allowed');
  assert(denied.includes('WebFetch') && denied.includes('WebSearch'),
    'network tools should be explicitly denied, not merely omitted');
  assert(!allowed.includes('curl'), 'no shell network access');
});

test('blast radius is bounded per run and per finding', () => {
  assert(MAX_REPAIRS_PER_RUN >= 1 && MAX_REPAIRS_PER_RUN <= 3,
    'a single run should fix a small number of things, not sweep the repo');
  assert(MAX_ATTEMPTS_PER_FINDING >= 1 && MAX_ATTEMPTS_PER_FINDING <= 3,
    'the circuit breaker must trip quickly to avoid retrying forever');
});
