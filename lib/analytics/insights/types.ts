/**
 * Shared types for the "Historical insights" tiles on /analytics: the tile the
 * page renders, the facts a tile is checked against, and what the weekly agent
 * proposes. The UI imports only the tile/stored types; the rest is for the
 * agent and its checks.
 */

// ── What the page renders ────────────────────────────────────────────────────

export type InsightChart =
  | { kind: 'weekly'; labels: string[]; values: number[]; highlight: number }      // labels = week-start YYYY-MM-DD
  | { kind: 'share'; part: number; whole: number; partLabel: string; restLabel: string }
  | { kind: 'bars'; rows: Array<{ label: string; value: number }> };                 // ≤ 5 rows

export interface InsightTile {
  eyebrow: string;
  hero: string;
  unit: string;
  summary: string;
  detail: string;
  chart?: InsightChart;
}

export type InsightSource = 'amplitude' | 'counter' | 'search' | 'subscribers';

export interface StoredInsight {
  id: number;
  tile: InsightTile;
  sources: InsightSource[];
  /** YYYY-MM-DD */
  addedOn: string;
  addedBy: 'seed' | 'agent';
}

// ── The data pack ────────────────────────────────────────────────────────────

export interface Period { start: string; end: string } // inclusive YYYY-MM-DD

/** One number with a stable id. Aggregates only, never per-person data. */
export interface Fact {
  id: string;
  label: string;
  period: Period;
  value: number;
  source: InsightSource;
}

/** An ordered list of numbers (a weekly chart's bars). `key` is a week-start or month label. */
export interface SeriesFact {
  id: string;
  label: string;
  period: Period;
  points: Array<{ key: string; value: number }>;
  source: InsightSource;
}

export interface DataPack {
  /** YYYY-MM-DD the pack was built. */
  today: string;
  facts: Fact[];
  series: SeriesFact[];
  /** Names of the blocks that failed to load (logged, not fatal). */
  failedBlocks: string[];
}

// ── What the agent proposes ──────────────────────────────────────────────────

/** Chart as the model writes it: references to facts, never numbers. */
export type ChartRef =
  | { kind: 'weekly'; seriesId: string; highlight: string }  // highlight = a point key of the series
  | { kind: 'share'; partId: string; wholeId: string; partLabel: string; restLabel: string }
  | { kind: 'bars'; rows: Array<{ label: string; factId: string }> };

export interface Proposal {
  eyebrow: string;
  hero: string;
  unit: string;
  summary: string;
  detail: string;
  chart?: ChartRef;
  /** Fact / series ids the tile rests on. Every number in the text must come from these. */
  evidence: string[];
  /**
   * Id of the active insight this one replaces. Not part of the model's insight
   * object: the caller copies it over from the decision before checking.
   */
  retire?: number;
}

export interface AgentDecision {
  decision: 'add' | 'none';
  reason: string;
  insight?: Proposal;
  /** Id of the active insight to retire; required when 6 are active. */
  retire?: number;
}

// ── What is stored and compared ──────────────────────────────────────────────

/** A fact the tile was checked against, with its value at write time. */
export interface EvidenceRef {
  id: string;
  /** Null for a series cited only for its dates. For a charted series, the highlighted bar's value. */
  value: number | null;
  /** The highlighted key, for a series. */
  key?: string;
}

/** A stored insight with its evidence (the checks need it; the page does not). */
export interface InsightRecord extends StoredInsight {
  evidence: EvidenceRef[];
  retiredOn: string | null;
  retiredBy: 'agent' | 'owner' | null;
}

/** The part of a stored insight the checks look at. */
export type ExistingInsight = Pick<InsightRecord, 'id' | 'evidence'>;

/** A proposal that passed every check, ready to store. */
export interface CheckedInsight {
  tile: InsightTile;
  evidence: EvidenceRef[];
  sources: InsightSource[];
  retire?: number;
}
