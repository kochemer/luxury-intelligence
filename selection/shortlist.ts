/**
 * Stage 4: shortlist (pure). Spec §4.
 */
import type { Article, Topic } from '../lib/types';
import type { ArticleType, HardFilterResult, ShortlistEntry, StoryCluster, TriageResult } from './types';

export const TOPICS: Topic[] = ['AI_and_Strategy', 'Ecommerce_Retail_Tech', 'Luxury_and_Consumer', 'Jewellery_Industry'];

export const EXCLUDED_TYPES: ArticleType[] = ['sponsored', 'press_release', 'podcast_video', 'event_promo'];

export const TYPE_BONUS: Record<ArticleType, number> = {
  hard_news: 3,
  analysis: 3,
  feature_profile: 1,
  interview: 0,
  other: 0,
  opinion: -2,
  review: -3,
  how_to_explainer: -4,
  listicle_roundup: -4,
  // excluded types never score; kept so the record is total
  press_release: 0,
  sponsored: 0,
  podcast_video: 0,
  event_promo: 0,
};

export function shortlistScore(t: Pick<TriageResult, 'significance' | 'type' | 'adRisk'>, coverage: number): number {
  return (
    t.significance * 10 +
    TYPE_BONUS[t.type] +
    Math.min(Math.max(coverage - 1, 0), 3) * 2 -
    (t.adRisk === 'medium' ? 4 : 0)
  );
}

export interface ShortlistInput {
  articles: Article[];
  triage: Map<string, TriageResult>;
  clusters: StoryCluster[];
  /** stage-1 results; articles with drop=true are ignored. Omit if `articles` already excludes them */
  hardFilterResults?: Map<string, HardFilterResult>;
  /** per-category size, default env SELECTION_SHORTLIST_N or 25 */
  n?: number;
  /** max per source, default 4 */
  perSourceCap?: number;
  /** max per web domain, default 5 */
  perDomainCap?: number;
}

interface Cand {
  a: Article;
  t: TriageResult;
  clusterId: string;
  coverage: number;
  score: number;
}

/** representative: significance, then type bonus, then longer snippet, then URL */
function betterRep(x: Cand, y: Cand): boolean {
  if (x.t.significance !== y.t.significance) return x.t.significance > y.t.significance;
  if (TYPE_BONUS[x.t.type] !== TYPE_BONUS[y.t.type]) return TYPE_BONUS[x.t.type] > TYPE_BONUS[y.t.type];
  const lx = (x.a.snippet || '').length;
  const ly = (y.a.snippet || '').length;
  if (lx !== ly) return lx > ly;
  return x.a.url < y.a.url;
}

export function buildShortlist(input: ShortlistInput): Record<Topic, ShortlistEntry[]> {
  const n = input.n ?? (Number(process.env.SELECTION_SHORTLIST_N) || 25);
  const cap = input.perSourceCap ?? 4;
  const domCap = input.perDomainCap ?? 5;
  const clusterOf = new Map<string, StoryCluster>();
  for (const c of input.clusters) for (const u of c.members) clusterOf.set(u, c);

  const out = {
    AI_and_Strategy: [],
    Ecommerce_Retail_Tech: [],
    Luxury_and_Consumer: [],
    Jewellery_Industry: [],
  } as Record<Topic, ShortlistEntry[]>;

  for (const topic of TOPICS) {
    const byCluster = new Map<string, Cand>();
    for (const a of input.articles) {
      if (input.hardFilterResults?.get(a.url)?.drop) continue;
      const t = input.triage.get(a.url);
      if (!t || t.category !== topic) continue;
      if (t.adRisk === 'high' || EXCLUDED_TYPES.includes(t.type)) continue;
      const cl = clusterOf.get(a.url);
      const clusterId = cl?.clusterId ?? `solo:${a.url}`;
      const coverage = cl?.coverage ?? 1;
      const cand: Cand = { a, t, clusterId, coverage, score: shortlistScore(t, coverage) };
      const cur = byCluster.get(clusterId);
      if (!cur || betterRep(cand, cur)) byCluster.set(clusterId, cand);
    }
    const sorted = [...byCluster.values()].sort((x, y) => y.score - x.score || (x.a.url < y.a.url ? -1 : 1));
    const perSource = new Map<string, number>();
    const perDomain = new Map<string, number>();
    for (const c of sorted) {
      if (out[topic].length >= n) break;
      const used = perSource.get(c.a.source) ?? 0;
      if (used >= cap) continue;
      let dom = '';
      try {
        dom = new URL(c.a.url).hostname.toLowerCase().replace(/^www\./, '');
      } catch {
        /* no domain cap */
      }
      if (dom && (perDomain.get(dom) ?? 0) >= domCap) continue;
      if (dom) perDomain.set(dom, (perDomain.get(dom) ?? 0) + 1);
      perSource.set(c.a.source, used + 1);
      out[topic].push({
        url: c.a.url,
        category: topic,
        clusterId: c.clusterId,
        coverage: c.coverage,
        shortlistScore: c.score,
      });
    }
  }
  return out;
}
