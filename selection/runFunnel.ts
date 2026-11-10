/**
 * Orchestrator for the v2 selection funnel (stages 0-7).
 * Spec: docs/superpowers/specs/2026-11-10-selection-funnel-design.md
 *
 * runSelectionFunnel(week, pool) takes the in-week pool exactly as
 * buildWeeklyDigest builds it (window + URL/title dedupe, including articles the
 * keyword classifier rejected) and returns the top 7 per category plus a report.
 * The report is also written to data/weeks/{week}/selection-report.json and
 * never contains article body text.
 */
import { promises as fs } from 'fs';
import path from 'path';
import type { Article, ArticleWithRelevance, Topic } from '../lib/types';
import { classifyTopic } from '../classification/classifyTopics';
import { hardFilter } from './hardFilters';
import { clusterArticles } from './cluster';
import { triageArticles, triageModel } from './triage';
import { buildShortlist, TOPICS } from './shortlist';
import { fetchFullTexts } from './fullText';
import { judgeArticles, emptyUsage, JUDGE_DEFAULT_MODEL, type JudgeItem, type TokenUsage } from './judge';
import { pickForCategoryDetailed, EDITOR_DEFAULT_MODEL, type PickCandidate } from './editorPick';
import {
  FUNNEL_VERSION,
  type FullTextResult,
  type FunnelOutput,
  type HardFilterResult,
  type JudgeResult,
  type SelectedArticle,
  type ShortlistEntry,
  type TriageResult,
} from './types';

export type Stages = {
  hardFilter: typeof hardFilter;
  clusterArticles: typeof clusterArticles;
  triageArticles: typeof triageArticles;
  buildShortlist: typeof buildShortlist;
  fetchFullTexts: typeof fetchFullTexts;
  judgeArticles: typeof judgeArticles;
  pickForCategoryDetailed: typeof pickForCategoryDetailed;
};

export interface FunnelOptions {
  /** replace any stage function (tests) */
  stages?: Partial<Stages>;
  /** keyword classifier used as a hint for triage */
  classify?: (a: Article) => Topic | null;
  /** write data/weeks/{week}/selection-report.json (default true) */
  writeReport?: boolean;
  /** report directory override (default data/weeks/{week}) */
  reportDir?: string;
  /** passed to triage (tests) */
  noCache?: boolean;
  /** judge/editor concurrency per category (default 2; 4 categories run in parallel) */
  judgeConcurrency?: number;
}

export interface ShortlistRow {
  title: string;
  source: string;
  url: string;
  clusterId: string;
  coverage: number;
  shortlistScore: number;
  triage?: Pick<TriageResult, 'type' | 'significance' | 'adRisk' | 'reason' | 'fallback'>;
  fulltext?: { status: string; paywall: string; wordCount: number; disclosures: string[] };
  judge?: { scores: JudgeResult['scores']; quality: number; hiddenAd: boolean; why: string; fallback?: boolean };
  picked?: { rank: number; tier: string; editorWhy: string };
  dropReason?: string;
}

export interface SelectionReport {
  funnelVersion: string;
  week: string;
  generatedAt: string;
  models: { triage: string; judge: string; editor: string; embedding: string };
  counts: {
    pool: number;
    hardFilterDropped: number;
    hardFilterDroppedByReason: Record<string, number>;
    noSummaryDropped: number;
    triaged: number;
    clusters: number;
    multiSourceClusters: number;
    triage: {
      byCategory: Record<string, number>;
      null: number;
      byType: Record<string, number>;
      fallbacks: number;
      cached: number;
      failedCalls: number;
    };
    shortlist: Record<string, number>;
    fulltext: { fetched: number; snippet_only: number };
    judgeFallbacks: Record<string, number>;
    picks: Record<string, { count: number; barMet: boolean; llmFailed: boolean; leadCount: number }>;
  };
  warnings: string[];
  tokenUsage: Record<string, TokenUsage>;
  timingsMs: Record<string, number>;
  categories: Record<string, ShortlistRow[]>;
}

export interface FunnelResult {
  output: FunnelOutput;
  /** triage category counts (articles that passed hard filters) */
  totalsByTopic: Record<Topic, number>;
  report: SelectionReport;
}

function inc(m: Record<string, number>, k: string, by = 1) {
  m[k] = (m[k] ?? 0) + by;
}

function hasSummary(a: Article): boolean {
  return [a.snippet, a.aiSummary, a.summary].some(s => !!s && s.trim().length > 0);
}

const zeroRelevance = (): ArticleWithRelevance['relevance'] => ({
  scoreTotal: 0,
  recencyScore: 0,
  sourceWeight: 0,
  keywordBoost: 0,
  insightSignalBoost: 0,
  penalty: 0,
  matchedKeywords: [],
});

export async function runSelectionFunnel(
  week: string,
  pool: Article[],
  opts: FunnelOptions = {}
): Promise<FunnelResult> {
  const S: Stages = {
    hardFilter,
    clusterArticles,
    triageArticles,
    buildShortlist,
    fetchFullTexts,
    judgeArticles,
    pickForCategoryDetailed,
    ...opts.stages,
  };
  const classify = opts.classify ?? classifyTopic;
  const warnings: string[] = [];
  const timings: Record<string, number> = {};
  const tokenUsage: Record<string, TokenUsage> = {};
  const timed = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    const t0 = Date.now();
    try {
      return await fn();
    } finally {
      timings[name] = Date.now() - t0;
    }
  };
  const log = (m: string) => console.log(`[Selection] ${m}`);

  // ---- 1. hard filters ----
  const hfResults = new Map<string, HardFilterResult>();
  const dropByReason: Record<string, number> = {};
  const kept: Article[] = [];
  let hardDropped = 0;
  let noSummary = 0;
  await timed('hardFilters', async () => {
    for (const a of pool) {
      const r = S.hardFilter(a);
      hfResults.set(a.url, r);
      if (r.drop) {
        hardDropped++;
        for (const reason of r.reasons) inc(dropByReason, reason);
      } else if (!hasSummary(a)) {
        noSummary++;
      } else {
        kept.push(a);
      }
    }
  });
  log(`pool ${pool.length}; hard filters dropped ${hardDropped}, no-summary ${noSummary}; ${kept.length} continue`);

  // ---- 2. clusters ----
  const clusterRes = await timed('cluster', () => S.clusterArticles(kept));
  tokenUsage.embedding = { calls: 1, promptTokens: clusterRes.embeddingTokens, completionTokens: 0 };
  warnings.push(...clusterRes.warnings);
  log(`${clusterRes.clusters.length} story clusters`);

  // ---- 3. triage ----
  const hints = new Map<string, Topic | null>();
  for (const a of kept) hints.set(a.url, classify(a));
  const triage = await timed('triage', () =>
    S.triageArticles(kept, {
      week,
      hardFilterResults: hfResults,
      classifierHints: hints,
      noCache: opts.noCache,
    })
  );
  tokenUsage.triage = triage.usage;
  const totalsByTopic = Object.fromEntries(TOPICS.map(t => [t, 0])) as Record<Topic, number>;
  const byType: Record<string, number> = {};
  let nullCount = 0;
  for (const a of kept) {
    const t = triage.results.get(a.url);
    if (!t) continue;
    if (t.category) totalsByTopic[t.category]++;
    else nullCount++;
    inc(byType, t.type);
  }
  log(
    `triage (${triage.model}): ${JSON.stringify(totalsByTopic)}, none ${nullCount}, ` +
      `fallback rows ${triage.stats.fallbackRows}, cached ${triage.stats.cached}`
  );

  // ---- 4. shortlist ----
  const shortlist = await timed('shortlist', async () =>
    S.buildShortlist({
      articles: kept,
      triage: triage.results,
      clusters: clusterRes.clusters,
      hardFilterResults: hfResults,
    })
  );
  const byUrl = new Map(kept.map(a => [a.url, a]));

  // ---- 5. full text ----
  const allEntries: ShortlistEntry[] = TOPICS.flatMap(t => shortlist[t]);
  const fullTexts = await timed('fullText', () =>
    S.fetchFullTexts(allEntries.map(e => ({ url: e.url, snippet: byUrl.get(e.url)?.snippet ?? '' })))
  );
  let ftFetched = 0;
  let ftSnippet = 0;
  for (const e of allEntries) {
    const f = fullTexts.get(e.url);
    if (f?.status === 'fetched') ftFetched++;
    else ftSnippet++;
  }
  log(`full text: ${ftFetched} fetched, ${ftSnippet} snippet-only of ${allEntries.length}`);

  // ---- 6 + 7. judge and editor per category (categories in parallel) ----
  const concurrency = opts.judgeConcurrency ?? 2;
  const judgeModel = process.env.SELECTION_JUDGE_MODEL?.trim() || JUDGE_DEFAULT_MODEL;
  const editorModel = process.env.SELECTION_EDITOR_MODEL?.trim() || EDITOR_DEFAULT_MODEL;
  const judgeUsage: TokenUsage = emptyUsage();
  const editorUsage: TokenUsage = emptyUsage();
  const judgeFallbacks: Record<string, number> = {};
  const picksReport: SelectionReport['counts']['picks'] = {};
  const categories: Record<string, ShortlistRow[]> = {};
  const output = Object.fromEntries(TOPICS.map(t => [t, [] as SelectedArticle[]])) as FunnelOutput;

  const tJudge = Date.now();
  let judgeMs = 0;
  let editorMs = 0;
  await Promise.all(
    TOPICS.map(async category => {
      const entries = shortlist[category];
      const items: JudgeItem[] = entries.map(e => {
        const a = byUrl.get(e.url)!;
        const t = triage.results.get(e.url);
        const ft: FullTextResult =
          fullTexts.get(e.url) ?? {
            url: e.url,
            text: a.snippet ?? '',
            wordCount: 0,
            paywall: 'unknown',
            status: 'snippet_only',
            disclosures: [],
          };
        return {
          url: e.url,
          title: a.title,
          source: a.source,
          coverage: e.coverage,
          fullText: ft,
          softFlags: hfResults.get(e.url)?.softFlags ?? [],
          triage: t && { significance: t.significance, adRisk: t.adRisk, type: t.type, reason: t.reason },
        };
      });
      const failures: string[] = [];
      const t1 = Date.now();
      const judged = await S.judgeArticles(items, { week, category, usage: judgeUsage, failures, concurrency });
      judgeMs = Math.max(judgeMs, Date.now() - t1);
      judgeFallbacks[category] = [...judged.values()].filter(j => j.fallback).length;

      const candidates: PickCandidate[] = [];
      for (const e of entries) {
        const j = judged.get(e.url);
        const a = byUrl.get(e.url)!;
        if (!j) continue;
        candidates.push({
          url: e.url,
          title: a.title,
          source: a.source,
          type: j.type,
          coverage: e.coverage,
          clusterId: e.clusterId,
          scores: j.scores,
          quality: j.quality,
          hiddenAd: j.hiddenAd,
          why: j.why,
          paywall: fullTexts.get(e.url)?.paywall,
          adRisk: triage.results.get(e.url)?.adRisk,
          fallback: j.fallback,
          mainCompany: j.mainCompany ?? null,
        });
      }
      const t2 = Date.now();
      const picked = await S.pickForCategoryDetailed(category, candidates, { week, usage: editorUsage });
      editorMs = Math.max(editorMs, Date.now() - t2);

      const pickByUrl = new Map(picked.picks.map(p => [p.url, p]));
      const dropByUrl = new Map(picked.dropped.map(d => [d.url, d.reason]));
      picksReport[category] = {
        count: picked.picks.length,
        barMet: picked.barMet,
        llmFailed: picked.llmFailed,
        leadCount: picked.picks.filter(p => p.tier === 'lead').length,
      };

      categories[category] = entries.map(e => {
        const a = byUrl.get(e.url)!;
        const t = triage.results.get(e.url);
        const j = judged.get(e.url);
        const f = fullTexts.get(e.url);
        const p = pickByUrl.get(e.url);
        return {
          title: a.title,
          source: a.source,
          url: e.url,
          clusterId: e.clusterId,
          coverage: e.coverage,
          shortlistScore: e.shortlistScore,
          triage: t && { type: t.type, significance: t.significance, adRisk: t.adRisk, reason: t.reason, fallback: t.fallback },
          fulltext: f && { status: f.status, paywall: f.paywall, wordCount: f.wordCount, disclosures: f.disclosures },
          judge: j && { scores: j.scores, quality: j.quality, hiddenAd: j.hiddenAd, why: j.why, fallback: j.fallback },
          picked: p && { rank: p.rank, tier: p.tier, editorWhy: p.editorWhy },
          dropReason: p ? undefined : dropByUrl.get(e.url) ?? 'not_selected',
        };
      });

      output[category] = picked.picks
        .slice()
        .sort((x, y) => x.rank - y.rank)
        .map(p => {
          const a = byUrl.get(p.url)!;
          const e = entries.find(en => en.url === p.url)!;
          const t = triage.results.get(p.url)!;
          const j = judged.get(p.url);
          return {
            ...a,
            relevance: zeroRelevance(),
            selection: {
              funnelVersion: FUNNEL_VERSION,
              tier: p.tier,
              rank: p.rank,
              clusterId: e.clusterId,
              coverage: e.coverage,
              triage: { type: t.type, significance: t.significance, adRisk: t.adRisk, reason: t.reason },
              judge: j && { scores: j.scores, quality: j.quality, why: j.why },
              editorWhy: p.editorWhy || undefined,
              paywall: fullTexts.get(p.url)?.paywall,
            },
          } as SelectedArticle;
        });
      log(
        `${category}: shortlist ${entries.length}, judge fallbacks ${judgeFallbacks[category]}, ` +
          `picks ${picked.picks.length}, barMet ${picked.barMet}${picked.llmFailed ? ', EDITOR LLM FAILED' : ''}`
      );
    })
  );
  timings.judge = judgeMs;
  timings.editor = editorMs;
  timings.judgeAndEditorWall = Date.now() - tJudge;
  tokenUsage.judge = judgeUsage;
  tokenUsage.editor = editorUsage;

  const report: SelectionReport = {
    funnelVersion: FUNNEL_VERSION,
    week,
    generatedAt: new Date().toISOString(),
    models: { triage: triage.model || triageModel(), judge: judgeModel, editor: editorModel, embedding: 'text-embedding-3-small' },
    counts: {
      pool: pool.length,
      hardFilterDropped: hardDropped,
      hardFilterDroppedByReason: dropByReason,
      noSummaryDropped: noSummary,
      triaged: kept.length,
      clusters: clusterRes.clusters.length,
      multiSourceClusters: clusterRes.clusters.filter(c => c.coverage > 1).length,
      triage: {
        byCategory: { ...totalsByTopic },
        null: nullCount,
        byType,
        fallbacks: triage.stats.fallbackRows,
        cached: triage.stats.cached,
        failedCalls: triage.stats.failedCalls,
      },
      shortlist: Object.fromEntries(TOPICS.map(t => [t, shortlist[t].length])),
      fulltext: { fetched: ftFetched, snippet_only: ftSnippet },
      judgeFallbacks,
      picks: picksReport,
    },
    warnings,
    tokenUsage,
    timingsMs: timings,
    categories,
  };

  if (opts.writeReport !== false) {
    try {
      const dir = opts.reportDir ?? path.join(process.cwd(), 'data', 'weeks', week);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'selection-report.json'), JSON.stringify(report, null, 2), 'utf-8');
    } catch (err) {
      console.warn(`[Selection] could not write selection-report.json: ${(err as Error).message}`);
    }
  }

  return { output, totalsByTopic, report };
}
