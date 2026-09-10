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
