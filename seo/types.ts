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
   * Google's own indexing count, when the indexing audit ran. Optional because
   * only the weekly pass asks Google; the daily and on-demand audits do not.
   * Stored so next week has something to compare against — the week-over-week
   * change in indexed pages is the most direct measure of whether crawling is
   * catching up.
   */
  indexing?: { indexed: number; inspected: number };
  /**
   * Search traffic from Search Console, when the weekly pass pulled it. The
   * outcome every other number here is in service of.
   */
  traffic?: TrafficSummary;
  /**
   * People who visited last week, from Amplitude with bots filtered out. The
   * other half of the loop: Search Console says what Google showed, this says
   * who came. Absent when no Amplitude secret key is configured.
   */
  visitors?: VisitorSummary;
  /**
   * Categories this run actually audited. Anything absent is reported as
   * "not checked" rather than scored 100 — a category nobody looked at must
   * never render as a clean bill of health.
   */
  coveredCategories: Category[];
}

/** `null` means "not audited in this run", which is distinct from "audited, no findings" (100). */
export interface TrafficTotals {
  impressions: number;
  clicks: number;
  /** Average position, 1 = top. */
  position: number;
}

/** Plain-language traffic sources, from the referring domain. */
export type VisitorChannel =
  | 'Search'
  | 'AI assistants'
  | 'LinkedIn'
  | 'Teams / Outlook'
  | 'Other social'
  | 'Other sites'
  | 'Direct / email';

export interface VisitorSummary {
  /** The last 7 complete days (UTC). */
  window: { start: string; end: string };
  /**
   * Where the numbers come from. 'counter' (since 2026-10-05) is the site's
   * cookieless counter and covers every visitor, counting a person once per
   * day they visit. 'amplitude' only sees visitors who accepted cookies.
   * Absent on reports written before the counter existed (= amplitude).
   */
  source?: 'counter' | 'amplitude';
  /** Set when counting began inside the window, so the week is partial. */
  countingSince?: string;
  /** Unique people, bots excluded. */
  people: number;
  /** Same measure for the 7 days before; null when nothing was counted then. */
  previousPeople: number | null;
  /** Tracked visitors removed by the bot filter this week. */
  botsExcluded: number;
  channels: Array<{ channel: VisitorChannel; visitors: number }>;
  /** Top referring sites, direct traffic excluded. */
  referrers: Array<{ domain: string; visitors: number }>;
}

export interface TrafficSummary {
  window: { start: string; end: string };
  /** The 28-day window ending ~3 days ago (Search Console's data lag). */
  current: TrafficTotals;
  /** The 28 days before that. */
  previous: TrafficTotals;
  pagesWithImpressions: number;
  topPages: { path: string; impressions: number; clicks: number; position: number }[];
  /** Only queries above Google's privacy threshold are ever reported. */
  topQueries: { query: string; impressions: number; clicks: number; position: number }[];
}

export type CategoryScores = Record<Category, number | null>;

export interface ReportDelta {
  previousWeek?: string;
  newFindings: string[];
  resolvedFindings: string[];
  persistingFindings: string[];
  scoreChange: number;
  /** Last report's indexing count, carried forward so the change can be shown. */
  previousIndexing?: { indexed: number; inspected: number };
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
