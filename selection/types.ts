/**
 * Shared types for the v2 selection funnel (selection/*).
 * Spec: docs/superpowers/specs/2026-11-10-selection-funnel-design.md
 *
 * Every stage is keyed by article URL. Stages never mutate Article objects;
 * they return records that the orchestrator (selection/runFunnel.ts) joins.
 */
import type { Article, Topic } from '../lib/types';

export const FUNNEL_VERSION = 'v2';

// ---------- Stage 1: hard filters (deterministic) ----------

export interface HardFilterResult {
  url: string;
  /** true = removed before any LLM sees it */
  drop: boolean;
  /** machine-readable reasons, e.g. "url:sponsored", "source:pr-wire", "label:advertorial" */
  reasons: string[];
  /** weaker hints passed to triage/judge, never a drop on their own, e.g. "text:in-partnership-with" */
  softFlags: string[];
}

// ---------- Stage 2: story clusters ----------

export interface StoryCluster {
  clusterId: string;
  /** article URLs in this cluster */
  members: string[];
  /** number of distinct sources covering the story (coverage signal) */
  coverage: number;
}

// ---------- Stage 3: LLM triage (cheap model, every article) ----------

export type ArticleType =
  | 'hard_news'
  | 'analysis'
  | 'opinion'
  | 'feature_profile'
  | 'interview'
  | 'listicle_roundup'
  | 'how_to_explainer'
  | 'review'
  | 'press_release'
  | 'sponsored'
  | 'podcast_video'
  | 'event_promo'
  | 'other';

export type AdRisk = 'low' | 'medium' | 'high';

export interface TriageResult {
  url: string;
  /** null = fits none of the four categories */
  category: Topic | null;
  type: ArticleType;
  /** 1-5, anchored in the spec (5 = landmark for the category's reader) */
  significance: number;
  adRisk: AdRisk;
  /** <= 15 words */
  reason: string;
  /** true when the LLM failed and we used classifier category + neutral defaults */
  fallback?: boolean;
}

// ---------- Stage 4: shortlist (deterministic) ----------

export interface ShortlistEntry {
  url: string;
  category: Topic;
  clusterId: string;
  coverage: number;
  shortlistScore: number;
}

// ---------- Stage 5: full text ----------

export type PaywallStatus = 'not_paywalled' | 'likely_paywalled' | 'unknown';

export interface FullTextResult {
  url: string;
  /** extracted body, truncated (see spec); '' when unavailable */
  text: string;
  wordCount: number;
  paywall: PaywallStatus;
  /** 'fetched' | 'snippet_only' (fetch failed / paywalled) */
  status: 'fetched' | 'snippet_only';
  /** disclosure phrases found in the body, e.g. "sponsored by" (Stage 1 rules re-run on full text) */
  disclosures: string[];
}

// ---------- Stage 6: quality judge (strong model, shortlist only) ----------

export interface JudgeScores {
  significance: number; // 1-5
  substance: number; // 1-5 new facts, data, named sources, original reporting
  insight: number; // 1-5 explains why / what next
  writing: number; // 1-5 clear, structured, not filler
  independence: number; // 1-5 (5 = independent journalism, 1 = ad/advertorial/PR)
}

export interface JudgeResult {
  url: string;
  scores: JudgeScores;
  /** weighted composite 1-5, see spec */
  quality: number;
  hiddenAd: boolean;
  type: ArticleType;
  /** <= 20 words, "why it matters" for the reader */
  why: string;
  /** true when the LLM failed and scores were derived from triage */
  fallback?: boolean;
}

// ---------- Stage 7: editor pick ----------

export type SelectionTier = 'lead' | 'more';

export interface EditorPick {
  url: string;
  rank: number; // 1-based
  tier: SelectionTier;
  /** <= 15 words */
  editorWhy: string;
}

// ---------- Output attached to each selected article ----------

export interface SelectionExplain {
  funnelVersion: typeof FUNNEL_VERSION;
  tier: SelectionTier;
  rank: number;
  clusterId: string;
  coverage: number;
  triage: Pick<TriageResult, 'type' | 'significance' | 'adRisk' | 'reason'>;
  judge?: Pick<JudgeResult, 'scores' | 'quality' | 'why'>;
  editorWhy?: string;
  paywall?: PaywallStatus;
}

export type SelectedArticle = Article & { selection: SelectionExplain };

/** Per-category input/output of the whole funnel. */
export type FunnelOutput = Record<Topic, SelectedArticle[]>;
