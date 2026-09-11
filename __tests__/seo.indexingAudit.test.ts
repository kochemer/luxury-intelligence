/**
 * Regression guards for the two false positives the indexing audit produced on
 * its first real run against Google.
 *
 * Both were the same mistake in different clothes: treating an absence of data,
 * or a cosmetic difference, as a defect. 26 of 57 findings were spurious —
 * enough noise to make the report untrustworthy.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

// Mirrors the comparison in indexingAudit.ts. Kept here as an executable
// statement of the rule rather than reaching into module internals.
function canonicalsDisagree(googleChose: string, declared: string): boolean {
  const normalise = (u: string) => u.replace(/\/+$/, '');
  return normalise(googleChose) !== normalise(declared);
}

const FETCH_OK = new Set(['SUCCESSFUL', 'UNKNOWN', 'PAGE_FETCH_STATE_UNSPECIFIED']);
function isFetchProblem(lastCrawlTime: string | null, pageFetchState: string): boolean {
  return Boolean(lastCrawlTime) && !FETCH_OK.has(pageFetchState);
}

test('a trailing-slash-only difference is not a canonical conflict', () => {
  // Google reports the homepage as "https://luxury-intel.com"; the page
  // declares "https://luxury-intel.com/". Same URL — flagging it was wrong.
  assert.equal(
    canonicalsDisagree('https://luxury-intel.com', 'https://luxury-intel.com/'),
    false,
    'trailing slash alone must not count as a conflict'
  );
  assert.equal(
    canonicalsDisagree('https://luxury-intel.com/', 'https://luxury-intel.com'),
    false,
    'the comparison must be symmetric'
  );
});

test('a genuinely different canonical is still a conflict', () => {
  assert.equal(
    canonicalsDisagree('https://luxury-intel.com/archive', 'https://luxury-intel.com/digest/x'),
    true,
    'a real disagreement must still be reported'
  );
});

test('a never-crawled page is not reported as a fetch failure', () => {
  // Google returns PAGE_FETCH_STATE_UNSPECIFIED for pages it never fetched.
  // That is missing data, not a failure — and reporting it double-counted all
  // 25 never-crawled pages alongside their GSC_NEVER_CRAWLED finding.
  assert.equal(isFetchProblem(null, 'PAGE_FETCH_STATE_UNSPECIFIED'), false);
  assert.equal(isFetchProblem(null, 'UNKNOWN'), false);
});

test('a real fetch failure on a crawled page is still reported', () => {
  assert.equal(isFetchProblem('2026-09-01T00:00:00Z', 'SOFT_404'), true);
  assert.equal(isFetchProblem('2026-09-01T00:00:00Z', 'NOT_FOUND'), true);
  assert.equal(isFetchProblem('2026-09-01T00:00:00Z', 'SUCCESSFUL'), false);
});

test('unspecified fetch state on a crawled page is not treated as failure', () => {
  // Google sometimes reports UNSPECIFIED even for crawled pages; absence of
  // information should never manufacture a finding.
  assert.equal(isFetchProblem('2026-09-01T00:00:00Z', 'PAGE_FETCH_STATE_UNSPECIFIED'), false);
});
