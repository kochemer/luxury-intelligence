/**
 * Year in review data model. Written by the build in review/, read by the
 * pages and the film. Lives in lib/ so the app can import it without the
 * Node-only build code.
 */

export interface ReviewWindow {
  /** First Monday counted (UTC date). The archive is too thin before it. */
  startISO: string;
  /** Exclusive end: the Monday after the last full week. */
  endISO: string;
  weeks: number;
}

export interface CompanyRow {
  ticker: string;
  company: string;
  /** Articles naming the company or one of its brands, steady sources, in the window. */
  articles: number;
  /** Those articles as a % of all steady-source articles in the window. */
  shareOfCoverage: number;
  /** Share price change, first close of the year to the last close in the window, %. */
  changeYtd: number;
  /** Share price change across the review window only, %. */
  changeWindow: number;
  /** Weekly closes rebased to 100 at the first close of the year. */
  series: number[];
  weeklyArticles: number[];
}

export interface LagStat {
  /** Weeks. Positive: coverage first, share price after. */
  lag: number;
  r: number;
  n: number;
  /** Two-sided permutation p-value (coverage series shuffled in time, per company). */
  p: number;
}

export interface EventGroup {
  n: number;
  /** Mean excess return vs the equal-weight basket, %. */
  sameWeek: number;
  /** Mean absolute excess return, %. */
  sameWeekAbs: number;
  nextWeek: number;
  next4Weeks: number;
}

export interface Backtest {
  /** Companies with enough weekly coverage to test. */
  companies: string[];
  minArticlesPerWeek: number;
  trailingWeeks: number;
  /** Coverage surprise against the direction of the excess return. */
  direction: LagStat[];
  /** Coverage surprise against the size of the excess return. */
  size: LagStat[];
  /** The loudest 10% of company-weeks against the rest. */
  events: { loud: EventGroup; rest: EventGroup };
  loudest: { company: string; weekStart: string; articles: number; z: number; excessReturn: number }[];
}

export interface ThemeRow {
  name: string;
  definition: string;
  /** Constant background (product drops, red carpet): shown apart from the trends. */
  background: boolean;
  articles: number;
  outlets: number;
  /** % of articles per month, each outlet weighted equally. */
  monthlyShare: number[];
  firstHalf: number;
  secondHalf: number;
  /** secondHalf / firstHalf; null when the first half is zero. */
  ratio: number | null;
  examples: { title: string; source: string; url: string; date: string }[];
}

export interface ThemeSection {
  market: 'luxury';
  outlets: string[];
  articles: number;
  /** % of articles that fit no theme. */
  unlabelled: number;
  months: string[];
  rows: ThemeRow[];
}

export interface YearReview {
  year: number;
  builtAtISO: string;
  window: ReviewWindow;
  /** All articles in the window, and the steady-source panel the counts use. */
  archive: { articles: number; sources: number };
  panel: { articles: number; sources: number };
  companies: CompanyRow[];
  backtest: Backtest;
  themes: ThemeSection;
}
