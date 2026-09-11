/**
 * Turns raw findings into a scored, delta-tracked SeoReport.
 *
 * Scoring is deliberately simple in Stage 1 (no GSC impact weighting yet —
 * that lands in Phase 3). It exists so week-over-week comparisons mean
 * something even before real search data is available.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { SEVERITY_WEIGHT, SEVERITY_SCORE_CEILING, AGING_STEP, AGING_CAP_WEEKS } from '../config';
import type { Finding, SeoReport, AuditInputs, Category, CategoryScores, Severity } from '../types';

const REPORT_DIR = path.join(process.cwd(), 'data', 'seo');

const ALL_CATEGORIES: Category[] = [
  'technical', 'onpage', 'structured-data', 'indexing', 'performance', 'opportunity',
];

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

function scoreFinding(f: Finding): number {
  const severityWeight = SEVERITY_WEIGHT[f.severity] ?? SEVERITY_WEIGHT.low;
  const agingMultiplier = 1 + AGING_STEP * Math.min(f.weeksOpen, AGING_CAP_WEEKS);
  return Math.round(severityWeight * agingMultiplier);
}

/**
 * Score a set of findings, 0-100 (higher is better).
 *
 * The worst severity present picks a *band*; finding volume then positions the
 * score within that band. Bands never overlap, so a report containing any
 * critical finding always scores worse than one whose worst finding is a high,
 * and so on — no matter how many of the lesser findings there are.
 *
 * This ordering is the whole point. A count-only score rated a single critical
 * finding (site de-indexed) at 94/100 while 37 cosmetic title-length findings
 * scored 39/100 — exactly backwards. A first attempt at a fix capped the
 * ceiling but let volume erode straight through the floor, so 37 mediums and
 * one critical both landed on 19. Hence an explicit floor per band.
 */
function scoreFromFindings(findings: Finding[]): number {
  if (findings.length === 0) return 100;

  const worstIndex = SEVERITY_ORDER.findIndex(s => findings.some(f => f.severity === s));
  const worstSeverity = SEVERITY_ORDER[worstIndex] ?? 'info';

  const ceiling = SEVERITY_SCORE_CEILING[worstSeverity] ?? 100;
  // Floor is the next-worse band's ceiling, derived from the same table rather
  // than a second constant that could drift out of step with it.
  const floor = worstIndex <= 0 ? 0 : (SEVERITY_SCORE_CEILING[SEVERITY_ORDER[worstIndex - 1]!] ?? 0);

  const total = findings.reduce((sum, f) => sum + f.score, 0);
  const volumePenalty = Math.min(ceiling - floor, Math.round(total / 20));

  return Math.max(floor, ceiling - volumePenalty);
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
  // Note: weeksOpen counts *consecutive reports the finding appeared in*, not
  // elapsed calendar weeks. If a week is skipped (no report generated), the
  // count under-reports the true age. Re-running the same week is idempotent,
  // since the previous-report lookup only considers strictly earlier weeks.
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

  // A category nobody audited scores null ("not checked"), never 100 — otherwise
  // an unchecked area reads as a clean bill of health.
  const covered = new Set(inputs.coveredCategories);
  const byCategory = Object.fromEntries(
    ALL_CATEGORIES.map(cat => [
      cat,
      covered.has(cat) ? scoreFromFindings(enriched.filter(f => f.category === cat)) : null,
    ])
  ) as CategoryScores;

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
