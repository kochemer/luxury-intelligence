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
import type { Finding, AuditInputs } from '../seo/types';

const BASE_INPUTS: AuditInputs = {
  gscAvailable: false,
  liveChecked: false,
  urlsAudited: 0,
  urlsMetaChecked: 0,
  llmUsed: false,
  coveredCategories: ['technical', 'onpage', 'indexing'],
};

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
  const prevReport = await buildReport(FIXTURE_PREV_WEEK, 'https://example.test', findings, BASE_INPUTS);
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
    const report = await buildReport(FIXTURE_CURR_WEEK, 'https://example.test', [persisting, added], BASE_INPUTS);

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

test('an empty finding list scores a perfect report for audited categories only', async () => {
  const report = await buildReport('1999-W20', 'https://example.test', [], {
    ...BASE_INPUTS,
    coveredCategories: ['technical', 'onpage', 'indexing'],
  });
  assert.equal(report.score.overall, 100);

  for (const cat of ['technical', 'onpage', 'indexing'] as const) {
    assert.equal(report.score.byCategory[cat], 100, `${cat} was audited and clean, should be 100`);
  }
  // Categories nobody looked at must be null ("not checked"), never 100 —
  // otherwise an unaudited area reads as a clean bill of health.
  for (const cat of ['structured-data', 'performance', 'opportunity'] as const) {
    assert.equal(report.score.byCategory[cat], null, `${cat} was not audited, should be null not a score`);
  }
});

test('higher severity produces a higher per-finding score', async () => {
  const critical = finding({ id: 'CRIT:11111111', code: 'CRIT', severity: 'critical' });
  const low = finding({ id: 'LOW:22222222', code: 'LOW', severity: 'low' });

  const report = await buildReport('1999-W21', 'https://example.test', [critical, low], BASE_INPUTS);

  const criticalScore = report.findings.find(f => f.id === critical.id)!.score;
  const lowScore = report.findings.find(f => f.id === low.id)!.score;
  assert(criticalScore > lowScore, `critical (${criticalScore}) should score higher than low (${lowScore})`);
});

test('one critical finding scores worse than many low-severity findings', async () => {
  // Regression guard. The original count-based score rated a single critical
  // finding (site de-indexed) at 94/100 while 37 cosmetic title-length
  // findings scored 39/100 — exactly backwards, and dangerous for a system
  // that will eventually gate autonomous decisions on this number.
  const oneCritical = [finding({ id: 'CRIT:aaaaaaaa', code: 'CRIT', severity: 'critical' })];
  const manyMedium = Array.from({ length: 37 }, (_, i) =>
    finding({ id: `MED:${String(i).padStart(8, '0')}`, code: 'MED', severity: 'medium' })
  );

  const criticalReport = await buildReport('1999-W22', 'https://example.test', oneCritical, BASE_INPUTS);
  const mediumReport = await buildReport('1999-W23', 'https://example.test', manyMedium, BASE_INPUTS);

  assert(
    criticalReport.score.overall < mediumReport.score.overall,
    `a single critical (${criticalReport.score.overall}) must score worse than 37 mediums (${mediumReport.score.overall})`
  );
  assert(
    criticalReport.score.overall <= 25,
    `any critical finding must force a clearly bad score, got ${criticalReport.score.overall}`
  );
});

test('severity ceilings hold regardless of finding count', async () => {
  const oneHigh = [finding({ id: 'HIGH:aaaaaaaa', code: 'HIGH', severity: 'high' })];
  const report = await buildReport('1999-W24', 'https://example.test', oneHigh, BASE_INPUTS);
  assert(report.score.overall <= 55, `a high finding must cap the score at 55, got ${report.score.overall}`);
});
