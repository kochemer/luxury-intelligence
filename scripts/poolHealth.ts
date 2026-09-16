/**
 * Ingestion pool-health analyzer.
 *
 * Answers: "does ingestion supply enough HIGH-QUALITY, rankable articles per
 * category for the reranker to build a strong digest from?" Reconstructs each
 * week's candidate pool exactly as the digest builder does — filter to the week
 * window, classify into the 4 topics, dedup by title — then reports, per
 * category:
 *   - rankable pool size (articles with usable text — snippet/summary — which is
 *     the gate selectTopN applies; text-less articles are dropped before ranking)
 *   - text coverage (rankable / deduped)
 *   - source diversity (distinct sources, top-source concentration)
 *   - quality mix by source tier (premium / mid / other)
 *
 * No LLM calls — pure counting. Usage:
 *   npm run pool:health -- --weeks=2026-W30,2026-W31,2026-W32,2026-W33,2026-W34
 *
 * The tier lists below are a first-pass SEED for the externalized
 * config/sourceTiers work (Area 2, task C). Refine there, not here.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { DateTime } from 'luxon';
import { loadEnv } from '../lib/env';
import { getWeekRangeCET } from '../lib/utils/weekCET';
import { filterToWeekWindow } from '../digest/buildWeeklyDigest';
import { classifyTopic } from '../classification/classifyTopics';
import type { Article, Topic } from '../lib/types';

loadEnv();

const TOPICS: Topic[] = ['AI_and_Strategy', 'Ecommerce_Retail_Tech', 'Luxury_and_Consumer', 'Jewellery_Industry'];

// Seed tiers (case-insensitive substring match on the source name).
const PREMIUM = [
  'financial times', 'bloomberg', 'reuters', 'wall street journal', 'wsj', 'the economist',
  'mit technology review', 'ieee spectrum', 'wired', 'the information', 'nature',
  'harvard business review', 'mckinsey', 'bain', 'bcg', 'business of fashion', 'vogue business',
  'nytimes', 'new york times',
];
const MID = [
  'techcrunch', 'the verge', 'modern retail', 'retail dive', 'digital commerce 360',
  'practical ecommerce', 'the decoder', 'grocery dive', 'professional jeweller', 'jeweller',
  'venturebeat', 'ars technica', 'restofworld',
];

function tierOf(source: string): 'premium' | 'mid' | 'other' {
  const s = source.toLowerCase();
  if (PREMIUM.some(p => s.includes(p))) return 'premium';
  if (MID.some(p => s.includes(p))) return 'mid';
  return 'other';
}

function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/\s+/g, ' ').trim();
}
function dedupe(articles: Article[]): Article[] {
  const map = new Map<string, Article>();
  for (const a of articles) {
    const k = normalizeTitle(a.title);
    const existing = map.get(k);
    if (!existing) { map.set(k, a); continue; }
    const at = a.published_at ? Date.parse(a.published_at) : 0;
    const et = existing.published_at ? Date.parse(existing.published_at) : 0;
    if (at > et) map.set(k, a);
  }
  return [...map.values()];
}

function weekWindow(weekLabel: string): { start: number; end: number } {
  const m = weekLabel.match(/^(\d{4})-W(\d{1,2})$/);
  if (!m) throw new Error(`Bad week: ${weekLabel}`);
  const dt = DateTime.fromObject({ weekYear: +m[1], weekNumber: +m[2] }, { zone: 'Europe/Copenhagen' });
  const { weekStartCET, weekEndCET } = getWeekRangeCET(dt.toJSDate());
  return { start: weekStartCET.getTime(), end: weekEndCET.getTime() };
}

const RANKABLE_MIN = 14; // ~2x TOP_N: a comfortable pool for the ranker to choose 7 from

function pad(s: string | number, n: number): string {
  return String(s).padEnd(n);
}

async function main() {
  const weeks: string[] = [];
  const showSources = process.argv.includes("--sources");
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--weeks=')) weeks.push(...arg.slice('--weeks='.length).split(',').map(s => s.trim()).filter(Boolean));
    else if (arg.startsWith('--week=')) weeks.push(arg.slice('--week='.length));
  }
  if (weeks.length === 0) throw new Error('Use --weeks=YYYY-Www,YYYY-Www');

  const raw = await fs.readFile(path.join(process.cwd(), 'data', 'articles.json'), 'utf-8');
  const all: Article[] = JSON.parse(raw);

  for (const week of weeks) {
    const { start, end } = weekWindow(week);
    const eligible = filterToWeekWindow(all, start, end);
    const byTopic: Record<Topic, Article[]> = {
      AI_and_Strategy: [], Ecommerce_Retail_Tech: [], Luxury_and_Consumer: [], Jewellery_Industry: [],
    };
    let droppedOffTopic = 0;
    for (const a of eligible) {
      const t = classifyTopic(a);
      if (t) byTopic[t].push(a);
      else droppedOffTopic++;
    }

    console.log(`\n===== ${week}  (eligible in-window: ${eligible.length}, off-topic dropped: ${droppedOffTopic}) =====`);
    console.log(`${pad('category', 24)}${pad('dedup', 7)}${pad('rankable', 9)}${pad('cover%', 8)}${pad('srcs', 6)}${pad('topSrc%', 9)}${pad('prem', 6)}${pad('mid', 5)}${pad('other', 6)}flag`);
    for (const topic of TOPICS) {
      const deduped = dedupe(byTopic[topic]);
      // Same gate as selectTopN: an article is rankable if it has ANY usable text.
      // (aiSummary is generated later for selected articles, so at pool stage the
      // usable text is almost always the RSS snippet.)
      const rankable = deduped.filter(a =>
        (a.snippet && a.snippet.trim().length > 0) ||
        (a.aiSummary && a.aiSummary.trim().length > 0) ||
        ((a as { summary?: string }).summary && (a as { summary?: string }).summary!.trim().length > 0)
      );
      const cover = deduped.length ? Math.round((rankable.length / deduped.length) * 100) : 0;
      const srcCounts = new Map<string, number>();
      for (const a of rankable) srcCounts.set(a.source, (srcCounts.get(a.source) || 0) + 1);
      const distinct = srcCounts.size;
      const topShare = rankable.length ? Math.round((Math.max(0, ...srcCounts.values()) / rankable.length) * 100) : 0;
      const tiers = { premium: 0, mid: 0, other: 0 };
      for (const a of rankable) tiers[tierOf(a.source)]++;
      const flags: string[] = [];
      if (rankable.length < RANKABLE_MIN) flags.push('THIN');
      if (tiers.premium === 0) flags.push('NO-PREMIUM');
      if (topShare >= 40) flags.push('CONCENTRATED');
      console.log(
        pad(topic, 24) + pad(deduped.length, 7) + pad(rankable.length, 9) + pad(cover + '%', 8) +
        pad(distinct, 6) + pad(topShare + '%', 9) + pad(tiers.premium, 6) + pad(tiers.mid, 5) +
        pad(tiers.other, 6) + (flags.join(' ') || 'ok')
      );
      if (showSources) {
        const top = [...srcCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
        console.log('      top sources: ' + top.map(([s, c]) => `${s}[${tierOf(s)[0]}]:${c}`).join(', '));
      }
    }
  }
  console.log(`\nLegend: rankable = deduped articles with usable text (snippet/summary) — what the ranker actually sees.`);
  console.log(`THIN = rankable < ${RANKABLE_MIN} (~2x the 7 slots) · NO-PREMIUM = 0 top-tier sources · CONCENTRATED = one source ≥40%.`);
}

main().catch(err => { console.error('[pool:health] Fatal:', err); process.exit(1); });
