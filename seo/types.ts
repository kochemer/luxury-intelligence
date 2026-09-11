/**
 * Shared types for the SEO system.
 *
 * `Finding` is the common currency: every producer emits it and every consumer
 * reads it, which is what lets four quite different sources compose into one
 * ranked report —
 *
 *   seo/audit/staticAudit.ts    repo + digest data, no network
 *   seo/audit/liveAudit.ts      the deployed site's actual HTML
 *   seo/audit/indexingAudit.ts  what Google reports about each page
 *   seo/optimize/linkGraph.ts   best-practice opportunities
 *
 * Severity carries a specific meaning that the scorer depends on: `critical`
 * and `high` mean something is *wrong* and are the only severities the monitor
 * alerts on or the repair agent will act on. `medium` and below include
 * opportunities, where nothing is broken. Mixing those up would either spam
 * the alert channel or let real breakage pass unnoticed.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type Category =
  | 'technical'
  | 'onpage'
  | 'structured-data'
  | 'indexing'
  | 'performance'
  | 'opportunity';

export interface Finding {
  /** Stable across runs: `${code}:${sha1(url ?? scope).slice(0,8)}` */
  id: string;
  code: string;
  severity: Severity;
  category: Category;
  title: string;
  detail: string;
  url?: string;
  evidence?: Record<string, unknown>;
  recommendation: string;
  score: number;
  firstSeenWeek: string;
  weeksOpen: number;
}

export interface AuditInputs {
  gscAvailable: boolean;
  gscSnapshot?: string;
  liveChecked: boolean;
  /** How many distinct URLs the audit actually examined (not how many had findings). */
  urlsAudited: number;
  /** How many of those URLs got title/description checks. Stage 1 only covers digest pages. */
  urlsMetaChecked: number;
  /** How many URLs were actually fetched over HTTP (0 when live checks were skipped). */
  urlsFetched: number;
  llmUsed: boolean;
  /**
   * Categories this run actually audited. Anything absent is reported as
   * "not checked" rather than scored 100 — a category nobody looked at must
   * never render as a clean bill of health.
   */
  coveredCategories: Category[];
}

/** `null` means "not audited in this run", which is distinct from "audited, no findings" (100). */
export type CategoryScores = Record<Category, number | null>;

export interface ReportDelta {
  previousWeek?: string;
  newFindings: string[];
  resolvedFindings: string[];
  persistingFindings: string[];
  scoreChange: number;
}

export interface SeoReport {
  version: 1;
  week: string;
  generatedAtISO: string;
  siteUrl: string;
  inputs: AuditInputs;
  score: { overall: number; byCategory: CategoryScores };
  findings: Finding[];
  delta: ReportDelta;
}

/**
 * NOTE: the repair-attempt record lives in seo/repair/ledger.ts as
 * `RepairAttempt`, not here.
 *
 * An unused `LedgerEntry` interface previously sat in this file, sketched
 * before the repair system was built. What shipped has a different shape, so
 * the sketch was dead code describing a design that does not exist — exactly
 * the kind of stale artefact that makes a codebase lie about itself.
 */
