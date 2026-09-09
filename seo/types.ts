/**
 * Shared types for the SEO agent (Stage 1: evidence + reporting only).
 *
 * Stage 1 produces Finding[] from deterministic, no-network checks and writes
 * a scored report. Nothing in this stage applies any fix. The `Ledger` types
 * are defined now (Stage 4 territory) because report findings will eventually
 * need to reference ledger entries by a stable id — defining the shape early
 * avoids a breaking rename later.
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
  urlsAudited: number;
  llmUsed: boolean;
}

export interface CategoryScores {
  technical: number;
  onpage: number;
  'structured-data': number;
  indexing: number;
  performance: number;
  opportunity: number;
}

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
 * A single applied or proposed fix, recorded so a later run can check
 * whether it actually helped. Not used until Stage 4 (auto-fix); the shape
 * is fixed now so early findings can already reference a future ledger
 * entry id without a migration.
 */
export interface LedgerEntry {
  id: string;
  findingCode: string;
  url?: string;
  file: string;
  field: string;
  before: string | null;
  after: string;
  rationale: string;
  shippedAtISO: string;
  gitSha?: string;
  baseline?: { clicks: number; impressions: number; ctr: number; position: number; windowStart: string; windowEnd: string };
  evaluateAfterISO: string;
  outcome: 'pending' | 'improved' | 'no-effect' | 'regressed' | 'reverted';
  evaluatedAtISO?: string;
}
