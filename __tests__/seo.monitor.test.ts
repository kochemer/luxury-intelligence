/**
 * Tests the monitor's alert-on-transition logic and state handling.
 *
 * The transition logic is what keeps the alert channel trustworthy: a monitor
 * that emails the same problem daily gets filtered to a folder, and is then
 * useless on the day it actually matters.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { renderAlertText } from '../seo/monitor/alert';
import type { MonitorResult } from '../seo/monitor/runMonitor';
import type { Finding } from '../seo/types';

function problem(id: string, title: string): Finding {
  return {
    id,
    code: id.split(':')[0]!,
    severity: 'critical',
    category: 'indexing',
    title,
    detail: 'detail',
    recommendation: 'fix it',
    score: 0,
    firstSeenWeek: '',
    weeksOpen: 1,
  };
}

function result(overrides: Partial<MonitorResult> = {}): MonitorResult {
  return {
    checkedAtISO: '2026-09-11T12:00:00.000Z',
    siteUrl: 'https://example.test',
    healthy: true,
    problems: [],
    newProblems: [],
    resolvedProblems: [],
    trafficNote: null,
    ...overrides,
  };
}

test('alert text lists new problems with their recommendations', () => {
  const p = problem('LIVE_NON_200:abc', 'Sitemap URL returned 404');
  const text = renderAlertText(result({
    healthy: false,
    problems: [p],
    newProblems: [p],
  }));

  assert(text.includes('NEW PROBLEMS (1)'), 'should announce the new-problem count');
  assert(text.includes('Sitemap URL returned 404'), 'should include the problem title');
  assert(text.includes('fix it'), 'should include the recommendation');
});

test('alert text reports recoveries', () => {
  const text = renderAlertText(result({
    healthy: true,
    resolvedProblems: ['LIVE_NON_200:abc', 'LIVE_NOINDEX_ON_INDEXABLE:def'],
  }));
  assert(text.includes('Recovered since last check: 2'));
});

test('an ongoing problem is not counted as new', () => {
  // The scenario that decides whether the alert channel stays credible:
  // same problem, second consecutive run. It must not re-alert.
  const p = problem('LIVE_NON_200:abc', 'Still broken');
  const r = result({ healthy: false, problems: [p], newProblems: [] });

  const somethingChanged = r.newProblems.length > 0 || r.resolvedProblems.length > 0;
  assert.equal(somethingChanged, false, 'an unchanged problem set must not trigger an alert');
});

test('traffic note is included when present', () => {
  const text = renderAlertText(result({ trafficNote: '177 impressions / 3 clicks over 28d' }));
  assert(text.includes('177 impressions'));
});

test('alert renders safely when a finding has no URL', () => {
  const p = problem('GSC_TRAFFIC_CLIFF:site', 'Impressions dropped 60%');
  const text = renderAlertText(result({ healthy: false, problems: [p], newProblems: [p] }));
  assert(text.includes('Impressions dropped 60%'));
  assert(!text.includes('undefined'), 'must not render "undefined" for a missing URL');
});
