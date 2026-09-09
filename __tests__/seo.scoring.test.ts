/**
 * Verifies seo/report/buildReport.ts scoring and week-over-week delta logic
 * against synthetic fixtures. Writes a throwaway "previous week" report into
 * data/seo/ and cleans it up afterward, since buildReport reads prior weeks
 * from disk by design (mirrors how digest tests read real data/digests/*.json).
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { promises as fs } from 'fs';
import path from 'path';
import { buildReport } from '../seo/report/buildReport';
import type { Finding } from '../seo/types';

const REPORT_DIR = path.join(process.cwd(), 'data', 'seo');
const FIXTURE_PREV_WEEK = '1999-W01';
const FIXTURE_CURR_WEEK = '1999-W02';
const FIXTURE_PREV_PATH = path.join(REPORT_DIR, `report-${FIXTURE_PREV_WEEK}.json`);

function finding(overrides: Partial<Finding> & Pick<Finding, 'id' | 'code'>): Finding {
  return {
    severity: 'medium',
    category: 'onpage',
    title: 'fixture finding',
    detail: 'fixture detail',
    recommendation: 'fixture recommendation',
    score: 0,
    firstSeenWeek: '',
    weeksOpen: 1,
    ...overrides,
  };
}

async function withFixturePreviousReport<T>(findings: Finding[], fn: () => Promise<T>): Promise<T> {
  await fs.mkdir(REPORT_DIR, { recursive: true });
  const prevReport = await buildReport(FIXTURE_PREV_WEEK, 'https://example.test', findings, {
    gscAvailable: false,
    liveChecked: false,
    urlsAudited: 0,
    llmUsed: false,
  });
  // Overwrite prevReport's own carried-forward delta so it looks like a fresh baseline.
  await fs.writeFile(FIXTURE_PREV_PATH, JSON.stringify(prevReport, null, 2), 'utf-8');
  try {
    return await fn();
  } finally {
    await fs.rm(FIXTURE_PREV_PATH, { force: true });
  }
}

test('new/resolved/persisting findings are computed correctly against a prior week', async () => {
  const persisting = finding({ id: 'CODE_A:aaaaaaaa', code: 'CODE_A' });
  const resolved = finding({ id: 'CODE_B:bbbbbbbb', code: 'CODE_B' });
  const added = finding({ id: 'CODE_C:cccccccc', code: 'CODE_C' });

  await withFixturePreviousReport([persisting, resolved], async () => {
    const report = await buildReport(FIXTURE_CURR_WEEK, 'https://example.test', [persisting, added], {
      gscAvailable: false,
      liveChecked: false,
      urlsAudited: 0,
      llmUsed: false,
    });

    assert.deepEqual(report.delta.newFindings.sort(), ['CODE_C:cccccccc']);
    assert.deepEqual(report.delta.resolvedFindings.sort(), ['CODE_B:bbbbbbbb']);
    assert.deepEqual(report.delta.persistingFindings.sort(), ['CODE_A:aaaaaaaa']);
    assert.equal(report.delta.previousWeek, FIXTURE_PREV_WEEK);

    const persistingResult = report.findings.find(f => f.id === persisting.id)!;
    assert.equal(persistingResult.weeksOpen, 2, 'a persisting finding should have weeksOpen incremented');
    assert.equal(persistingResult.firstSeenWeek, FIXTURE_PREV_WEEK, 'firstSeenWeek should carry forward from the prior report');

    const addedResult = report.findings.find(f => f.id === added.id)!;
    assert.equal(addedResult.weeksOpen, 1);
    assert.equal(addedResult.firstSeenWeek, FIXTURE_CURR_WEEK);
  });
});

test('an empty finding list scores a perfect report', async () => {
  const report = await buildReport('1999-W20', 'https://example.test', [], {
    gscAvailable: false,
    liveChecked: false,
    urlsAudited: 0,
    llmUsed: false,
  });
  assert.equal(report.score.overall, 100);
  for (const catScore of Object.values(report.score.byCategory)) {
    assert.equal(catScore, 100);
  }
});

test('higher severity produces a higher per-finding score', async () => {
  const critical = finding({ id: 'CRIT:11111111', code: 'CRIT', severity: 'critical' });
  const low = finding({ id: 'LOW:22222222', code: 'LOW', severity: 'low' });

  const report = await buildReport('1999-W21', 'https://example.test', [critical, low], {
    gscAvailable: false,
    liveChecked: false,
    urlsAudited: 0,
    llmUsed: false,
  });

  const criticalScore = report.findings.find(f => f.id === critical.id)!.score;
  const lowScore = report.findings.find(f => f.id === low.id)!.score;
  assert(criticalScore > lowScore, `critical (${criticalScore}) should score higher than low (${lowScore})`);
});
