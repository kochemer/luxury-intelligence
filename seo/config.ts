/**
 * Thresholds for the SEO auditor. Centralised so every check agrees on the
 * same limits and so future stages (GSC, auto-fix) can reuse them.
 */

export const TITLE_MAX_RENDERED = 60; // includes the " | Luxury Intelligence" suffix
export const DESCRIPTION_MIN = 70;
export const DESCRIPTION_MAX = 155;

export const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 100,
  high: 60,
  medium: 30,
  low: 12,
  info: 3,
};

/**
 * Hard ceiling on the overall score given the worst severity present.
 *
 * Without this, the score is dominated by finding *count* rather than
 * severity — 37 cosmetic title-length findings scored 39/100 while a single
 * critical "site is de-indexed" finding scored 94/100. That is backwards, and
 * actively dangerous for a system that will eventually gate autonomous
 * decisions on this number. A critical finding must always produce a bad
 * score, no matter how few there are.
 *
 * Volume still matters, but only *within* the band its severity allows.
 */
export const SEVERITY_SCORE_CEILING: Record<string, number> = {
  critical: 25,
  high: 55,
  medium: 80,
  low: 95,
  info: 100,
};

// Aging multiplier: a finding that's been open for `weeksOpen` weeks gets a
// nudge so persistently-ignored issues don't stay invisible in the score.
export const AGING_STEP = 0.1;
export const AGING_CAP_WEEKS = 5;

export const STATIC_PAGE_LAST_MODIFIED_MAX_AGE_MONTHS = 6;

// ── Live HTTP audit (Stage 2) ───────────────────────────────────────────────
/** Parallel page fetches. Deliberately modest — this points at production. */
export const LIVE_CONCURRENCY = 4;
export const LIVE_TIMEOUT_MS = 10_000;
export const LIVE_USER_AGENT = 'LuxuryIntelSeoAgent/1.0 (+https://luxury-intel.com)';

// ── Daily monitor (breakage detection) ──────────────────────────────────────
/** Impression drop (%) between 28-day windows that counts as a traffic cliff. */
export const TRAFFIC_CLIFF_DROP_PCT = 50;
/**
 * Minimum prior-window impressions before cliff detection applies. Below this,
 * a "50% drop" is a handful of impressions moving around — noise, not an
 * incident. luxury-intel.com currently sits near this line, so the guard is
 * doing real work rather than being theoretical.
 */
export const TRAFFIC_CLIFF_MIN_IMPRESSIONS = 500;

// ── Automated recovery (rollback) ───────────────────────────────────────────
/** Pages probed when deciding whether the site is down. */
export const OUTAGE_SAMPLE_SIZE = 8;
/**
 * How many sampled pages must fail before this counts as an outage worth
 * rolling production back for.
 *
 * Above 1 on purpose. A single page 404ing is often deliberate — a page
 * removed, a route renamed — and rolling the whole site back over it would
 * cause the outage it is meant to prevent. Systemic failure is the signal.
 */
export const OUTAGE_MIN_FAILED_PAGES = 3;
/** Time allowed for a rollback to propagate before re-checking. */
export const RECOVERY_SETTLE_MS = 20_000;

// ── Indexing audit (what Google reports) ────────────────────────────────────
/**
 * How long since Google last downloaded the sitemap before that is a problem.
 *
 * Google re-fetches an active sitemap every few days. A month of silence means
 * it has stopped, and every page published since is unannounced.
 */
export const SITEMAP_STALE_DAYS = 30;
/** URL-count gap between what Google recorded and what the sitemap now serves. */
export const SITEMAP_COUNT_DRIFT = 5;

// ── Optimisation opportunities (best-practice scoring) ──────────────────────
/** At or below this many inbound internal links, a page is weakly linked. */
export const WEAK_INBOUND_LINK_THRESHOLD = 2;
/**
 * Visible-text length below which a page counts as thin.
 *
 * Deliberately low. The aim is to catch pages that are genuinely almost empty
 * — the kind Google marks "Crawled – currently not indexed" — not to impose a
 * word count on legitimately short pages.
 */
export const THIN_CONTENT_CHARS = 1200;
