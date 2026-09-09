/**
 * Turns raw findings into a scored, delta-tracked SeoReport.
 *
 * Scoring is deliberately simple in Stage 1 (no GSC impact weighting yet —
 * that lands in Phase 3). It exists so week-over-week comparisons mean
 * something even before real search data is available.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { SEVERITY_WEIGHT, AGING_STEP, AGING_CAP_WEEKS } from '../config';
import type { Finding, SeoReport, AuditInputs, Category, CategoryScores } from '../types';

const REPORT_DIR = path.join(process.cwd(), 'data', 'seo');

const EMPTY_CATEGORY_SCORES: CategoryScores = {
  technical: 0,
  onpage: 0,
  'structured-data': 0,
  indexing: 0,
  performance: 0,
  opportunity: 0,
};

function scoreFinding(f: Finding): number {
  const severityWeight = SEVERITY_WEIGHT[f.severity] ?? SEVERITY_WEIGHT.low;
  const agingMultiplier = 1 + AGING_STEP * Math.min(f.weeksOpen, AGING_CAP_WEEKS);
  return Math.round(severityWeight * agingMultiplier);
}

function scoreFromFindings(findings: Finding[]): number {
  const total = findings.reduce((sum, f) => sum + f.score, 0);
  return Math.max(0, 100 - Math.min(100, Math.round(total / 20)));
}

async function loadPreviousReport(week: string): Promise<SeoReport | null> {
  try {
    const files = await fs.readdir(REPORT_DIR);
    const [thisYear, thisWeekNum] = week.split('-W').map(Number);
    const weeks = files
      .filter(f => /^report-\d{4}-W\d{1,2}\.json$/.test(f))
      .map(f => f.replace('report-', '').replace('.json', ''))
      .filter(w => {
        const [y, wn] = w.split('-W').map(Number);
        return y < thisYear || (y === thisYear && wn < thisWeekNum);
      })
      .sort((a, b) => {
        const [ya, wa] = a.split('-W').map(Number);
        const [yb, wb] = b.split('-W').map(Number);
        return ya !== yb ? ya - yb : wa - wb;
      });
    const previousWeek = weeks[weeks.length - 1];
    if (!previousWeek) return null;
    const raw = await fs.readFile(path.join(REPORT_DIR, `report-${previousWeek}.json`), 'utf-8');
    return JSON.parse(raw) as SeoReport;
  } catch {
    return null;
  }
}

export async function buildReport(week: string, siteUrl: string, findings: Finding[], inputs: AuditInputs): Promise<SeoReport> {
  const previous = await loadPreviousReport(week);
  const previousById = new Map(previous?.findings.map(f => [f.id, f]) ?? []);

  // Carry forward firstSeenWeek / weeksOpen for findings that persist.
  const enriched = findings.map(f => {
    const prior = previousById.get(f.id);
    const firstSeenWeek = prior?.firstSeenWeek ?? week;
    const weeksOpen = prior ? prior.weeksOpen + 1 : 1;
    return { ...f, firstSeenWeek, weeksOpen, score: 0 };
  }).map(f => ({ ...f, score: scoreFinding(f) }));

  const currentIds = new Set(enriched.map(f => f.id));
  const previousIds = new Set(previousById.keys());

  const newFindings = enriched.filter(f => !previousIds.has(f.id)).map(f => f.id);
  const resolvedFindings = [...previousIds].filter(id => !currentIds.has(id));
  const persistingFindings = enriched.filter(f => previousIds.has(f.id)).map(f => f.id);

  const overall = scoreFromFindings(enriched);
  const byCategory: CategoryScores = { ...EMPTY_CATEGORY_SCORES };
  for (const cat of Object.keys(byCategory) as Category[]) {
    byCategory[cat] = scoreFromFindings(enriched.filter(f => f.category === cat));
  }

  return {
    version: 1,
    week,
    generatedAtISO: new Date().toISOString(),
    siteUrl,
    inputs,
    score: { overall, byCategory },
    findings: enriched.sort((a, b) => b.score - a.score),
    delta: {
      previousWeek: previous?.week,
      newFindings,
      resolvedFindings,
      persistingFindings,
      scoreChange: previous ? overall - previous.score.overall : 0,
    },
  };
}
