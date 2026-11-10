import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { runSelectionFunnel } from '../selection/runFunnel';
import { hardFilter } from '../selection/hardFilters';
import { buildShortlist } from '../selection/shortlist';
import { pickForCategoryDetailed } from '../selection/editorPick';
import { countLowSignalMarkers } from '../digest/buildWeeklyDigest';
import { isHighQualitySource } from '../digest/rerankArticles';
import type { Article } from '../lib/types';
import type { JudgeResult, TriageResult } from '../selection/types';

const art = (i: number, o: Partial<Article> = {}): Article =>
  ({
    id: `a${i}`,
    title: `Title ${i}`,
    url: `https://ex${i}.com/news/${i}`,
    source: `Src${i}`,
    published_at: '2026-11-03T10:00:00Z',
    ingested_at: '',
    snippet: `Body text secret-${i} about things`,
    ...o,
  }) as Article;

test('runSelectionFunnel wires the stages with fakes and writes a body-free report', async () => {
  const pool = [
    ...Array.from({ length: 9 }, (_, i) => art(i + 1)),
    art(50, { url: 'https://x.com/sponsored/50' }), // hard-filtered
    art(51, { snippet: '' }), // no summary
  ];
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'funnel-'));
  const hintsSeen: unknown[] = [];

  const res = await runSelectionFunnel('2026-W99', pool, {
    reportDir: dir,
    classify: () => null,
    stages: {
      clusterArticles: async arts => ({
        clusters: arts.map((a, i) => ({ clusterId: `c${i}`, members: [a.url], coverage: 1 })),
        clusterIdByUrl: new Map(),
        warnings: [],
        embeddingTokens: 5,
      }),
      triageArticles: async (arts, o) => {
        hintsSeen.push(o.classifierHints);
        const results = new Map<string, TriageResult>();
        arts.forEach((a, i) =>
          results.set(a.url, {
            url: a.url,
            category: i < 8 ? 'Luxury_and_Consumer' : null,
            type: 'hard_news',
            significance: 4,
            adRisk: 'low',
            reason: 'r',
          })
        );
        return {
          results,
          usage: { calls: 1, promptTokens: 10, completionTokens: 2 },
          stats: { total: arts.length, cached: 0, llm: arts.length, retriedRows: 0, fallbackRows: 0, failedCalls: 0 },
          model: 'fake-luna',
        };
      },
      fetchFullTexts: async entries =>
        new Map(
          entries.map(e => [
            e.url,
            { url: e.url, text: 'FULL BODY SECRET', wordCount: 300, paywall: 'not_paywalled' as const, status: 'fetched' as const, disclosures: [] },
          ])
        ),
      judgeArticles: async items => {
        const m = new Map<string, JudgeResult>();
        items.forEach((it, i) =>
          m.set(it.url, {
            url: it.url,
            scores: { significance: 4, substance: 4, insight: 4, writing: 4, independence: 5 },
            quality: 4 - i * 0.01,
            hiddenAd: false,
            type: 'hard_news',
            why: 'matters',
          })
        );
        return m;
      },
      pickForCategoryDetailed: (cat, cands, meta) =>
        pickForCategoryDetailed(cat, cands, { ...meta, chat: async () => { throw new Error('no llm'); } }),
    },
  });

  assert.equal(res.totalsByTopic.Luxury_and_Consumer, 8);
  assert.equal(res.output.Luxury_and_Consumer.length, 7);
  const first = res.output.Luxury_and_Consumer[0];
  assert.equal(first.selection.rank, 1);
  assert.equal(first.selection.tier, 'lead');
  assert.equal(res.output.Luxury_and_Consumer[6].selection.tier, 'more');
  assert.equal(first.relevance?.scoreTotal, 0);
  assert.equal(res.output.AI_and_Strategy.length, 0);

  const c = res.report.counts;
  assert.equal(c.pool, 11);
  assert.equal(c.hardFilterDropped, 1);
  assert.equal(c.noSummaryDropped, 1);
  assert.equal(c.triaged, 9);
  assert.equal(c.triage.null, 1);
  assert.equal(c.fulltext.fetched, 8);
  assert.equal(c.picks.Luxury_and_Consumer.llmFailed, true);
  assert.equal(c.picks.Luxury_and_Consumer.count, 7);
  const rows = res.report.categories.Luxury_and_Consumer;
  assert.equal(rows.length, 8);
  assert.equal(rows.filter(r => r.picked).length, 7);
  assert.ok(rows.some(r => r.dropReason));
  assert.equal(res.report.tokenUsage.triage.promptTokens, 10);

  const raw = await fs.readFile(path.join(dir, 'selection-report.json'), 'utf-8');
  assert.ok(!raw.includes('FULL BODY SECRET'));
  assert.ok(!raw.includes('secret-1 '));
  assert.ok(hintsSeen.length === 1);
  await fs.rm(dir, { recursive: true, force: true });
});

test('stage functions default to the real ones (smoke on pure stages)', () => {
  assert.equal(hardFilter(art(1)).drop, false);
  assert.ok(buildShortlist);
});

test('legacy low-signal markers match whole words only', () => {
  assert.equal(countLowSignalMarkers('trade head already shadow loaded promotion'), 0);
  assert.equal(countLowSignalMarkers('Great ad for the brand'), 1);
  assert.equal(countLowSignalMarkers('a Press  Release and sponsored content'), 3); // press release, sponsored, sponsored content
  assert.equal(countLowSignalMarkers('promo code'), 1);
});

test('legacy high-quality source bonus matches outlet names exactly', () => {
  assert.equal(isHighQualitySource('FT'), true);
  assert.equal(isHighQualitySource('Financial Times - FT'), true);
  assert.equal(isHighQualitySource('Bloomberg'), true);
  assert.equal(isHighQualitySource('Soft Retail Weekly'), false);
  assert.equal(isHighQualitySource('Craft Daily'), false);
  assert.equal(isHighQualitySource('Bainbridge Journal'), false);
});
