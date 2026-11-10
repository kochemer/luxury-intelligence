/**
 * Stage 7: editor pick (one LLM call per category) + deterministic validation.
 * Spec: docs/superpowers/specs/2026-11-10-selection-funnel-design.md §7
 */
import type { Topic } from '../lib/types';
import { getTopicDisplayName } from '../lib/utils/topicNames';
import { openAiChatJson, READER, emptyUsage, type ChatJson, type TokenUsage } from './judge';
import { UNTRUSTED_NOTICE, type AdRisk, type ArticleType, type EditorPick, type JudgeScores, type PaywallStatus } from './types';
import { EXCLUDED_TYPES } from './shortlist';

export const EDITOR_DEFAULT_MODEL = 'gpt-6.1-sol';
export const PICK_TARGET = 7;
export const LEAD_COUNT = 5;
export const MAX_PER_SOURCE = 3;
export const MAX_PER_DOMAIN = 2;
/** max stories per main company within the lead ranks 1-LEAD_COUNT */
export const MAX_PER_COMPANY_LEAD = 2;
export const MAX_ARXIV_AI = 1;
export const LEAD_BAR = { significance: 4, quality: 3.6, independence: 4 } as const;

/** A judged shortlist entry (joins shortlist + triage cluster info + judge result). */
export interface PickCandidate {
  url: string;
  title: string;
  source: string;
  type: ArticleType;
  coverage: number;
  clusterId: string;
  scores: JudgeScores;
  quality: number;
  hiddenAd: boolean;
  why: string;
  paywall?: PaywallStatus;
  /** the one company the story is mainly about (judge output) */
  mainCompany?: string | null;
  /** triage ad risk; 'high' candidates are dropped */
  adRisk?: AdRisk;
  /** judge fell back to triage-derived scores: never counts as meeting the lead bar */
  fallback?: boolean;
}

export interface PickMeta {
  week: string;
  model?: string;
  chat?: ChatJson;
  usage?: TokenUsage;
}

export interface ValidatedPicks {
  picks: EditorPick[];
  /** true when ranks 1-5 were all filled from candidates meeting the lead bar */
  barMet: boolean;
  dropped: { url: string; reason: string }[];
}

export interface PickReport extends ValidatedPicks {
  llmFailed: boolean;
}

export function meetsLeadBar(c: PickCandidate): boolean {
  if (c.fallback) return false;
  return (
    c.scores.significance >= LEAD_BAR.significance &&
    c.quality >= LEAD_BAR.quality &&
    c.scores.independence >= LEAD_BAR.independence
  );
}

const normSource = (s: string) => s.trim().toLowerCase();
/** hostname without leading www.; '' when the url is not parseable */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Series key: same domain + same title prefix before ':' of at least 3 words
 * (e.g. "The Big Survey 2026: Lab-Grown Diamonds" and "...: Market Dynamics"). null when not a series title.
 */
export function seriesKey(c: Pick<PickCandidate, 'url' | 'title'>): string | null {
  const i = c.title.indexOf(':');
  if (i < 0) return null;
  const prefix = c.title.slice(0, i).trim().toLowerCase().replace(/\s+/g, ' ');
  if (prefix.split(' ').filter(Boolean).length < 3) return null;
  return `${domainOf(c.url)}|${prefix}`;
}

export function normCompany(c: string | null | undefined): string {
  return (c ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(inc|corp|corporation|ltd|plc|llc|group|co|ai|the)\b/g, ' ')
    .replace(/\s+/g, '');
}

const isArxiv = (s: string) => s.toLowerCase().includes('arxiv');

/**
 * Pure. `llmOrder` is the editor's chosen urls in rank order (may be empty, may
 * contain unknown/duplicate urls); `llmWhy` maps url to editorWhy.
 */
export function validatePicks(
  category: Topic,
  candidates: PickCandidate[],
  llmOrder: string[] = [],
  llmWhy: Record<string, string> = {}
): ValidatedPicks {
  const dropped: { url: string; reason: string }[] = [];
  const byUrl = new Map<string, PickCandidate>();
  for (const c of candidates) if (!byUrl.has(c.url)) byUrl.set(c.url, c);

  // 1. eligibility
  const eligible: PickCandidate[] = [];
  for (const c of byUrl.values()) {
    if (c.hiddenAd) dropped.push({ url: c.url, reason: 'hiddenAd' });
    else if (EXCLUDED_TYPES.includes(c.type)) dropped.push({ url: c.url, reason: `type:${c.type}` });
    else if (c.adRisk === 'high') dropped.push({ url: c.url, reason: 'adRisk:high' });
    else if (c.scores.independence < 3) dropped.push({ url: c.url, reason: 'independence<3' });
    else eligible.push(c);
  }

  // 2. order: LLM picks (in its order), then the rest by quality
  const seen = new Set<string>();
  const llmFirst: PickCandidate[] = [];
  for (const u of llmOrder) {
    const c = byUrl.get(u);
    if (c && !seen.has(u) && eligible.includes(c)) {
      seen.add(u);
      llmFirst.push(c);
    }
  }
  const byQuality = (a: PickCandidate, b: PickCandidate) => b.quality - a.quality || a.url.localeCompare(b.url);
  const rest = eligible.filter(c => !seen.has(c.url)).sort(byQuality);
  const ordered = [...llmFirst, ...rest];

  // 3. constraint-aware acceptance
  const chosen: PickCandidate[] = [];
  const clusters = new Set<string>();
  const sourceCount = new Map<string, number>();
  const domainCount = new Map<string, number>();
  const companyLead = new Map<string, number>();
  const seriesKeys = new Set<string>();
  let arxiv = 0;
  const isPaywalled = (c: PickCandidate) => c.paywall === 'likely_paywalled';
  const tryAdd = (c: PickCandidate): boolean => {
    if (chosen.some(x => x.url === c.url)) return false;
    // At most one paywalled story in ranks 1-3: defer (not drop) a second one; it can still enter at rank 4+.
    if (chosen.length < 3 && isPaywalled(c) && chosen.some(isPaywalled)) return false;
    // Company concentration in ranks 1-5: defer (not drop); extras can still enter at rank 6-7.
    const comp = normCompany(c.mainCompany);
    if (chosen.length < LEAD_COUNT && comp && (companyLead.get(comp) ?? 0) >= MAX_PER_COMPANY_LEAD) return false;
    const sk = seriesKey(c);
    if (sk && seriesKeys.has(sk)) {
      dropped.push({ url: c.url, reason: 'duplicate-series' });
      return false;
    }
    const dom = domainOf(c.url);
    if (dom && (domainCount.get(dom) ?? 0) >= MAX_PER_DOMAIN) {
      dropped.push({ url: c.url, reason: 'domain-cap' });
      return false;
    }
    if (c.clusterId && clusters.has(c.clusterId)) {
      dropped.push({ url: c.url, reason: 'duplicate-cluster' });
      return false;
    }
    const src = normSource(c.source);
    if ((sourceCount.get(src) ?? 0) >= MAX_PER_SOURCE) {
      dropped.push({ url: c.url, reason: 'source-cap' });
      return false;
    }
    if (category === 'AI_and_Strategy' && isArxiv(c.source) && arxiv >= MAX_ARXIV_AI) {
      dropped.push({ url: c.url, reason: 'arxiv-cap' });
      return false;
    }
    if (c.clusterId) clusters.add(c.clusterId);
    sourceCount.set(src, (sourceCount.get(src) ?? 0) + 1);
    if (dom) domainCount.set(dom, (domainCount.get(dom) ?? 0) + 1);
    if (sk) seriesKeys.add(sk);
    if (chosen.length < LEAD_COUNT && comp) companyLead.set(comp, (companyLead.get(comp) ?? 0) + 1);
    if (category === 'AI_and_Strategy' && isArxiv(c.source)) arxiv++;
    chosen.push(c);
    return true;
  };

  // lead ranks: bar-passers in (LLM, then quality) order
  let leadFromBar = 0;
  // two passes: the second picks up bar-passers deferred by the paywall rule for ranks 1-3
  for (let pass = 0; pass < 2; pass++) {
    for (const c of ordered) {
      if (chosen.length >= LEAD_COUNT) break;
      if (meetsLeadBar(c) && tryAdd(c)) leadFromBar++;
    }
  }
  // not enough bar-passers: best remaining by quality
  if (chosen.length < LEAD_COUNT) {
    for (const c of [...ordered].sort(byQuality)) {
      if (chosen.length >= LEAD_COUNT) break;
      tryAdd(c);
    }
  }
  const barMet = leadFromBar >= LEAD_COUNT;

  // ranks 6-7: the editor's remaining picks first, then best by quality
  const llmSet = new Set(llmFirst.map(c => c.url));
  const remaining = [
    ...ordered.filter(c => llmSet.has(c.url)),
    ...ordered.filter(c => !llmSet.has(c.url)).sort(byQuality),
  ];
  for (const c of remaining) {
    if (chosen.length >= PICK_TARGET) break;
    tryAdd(c);
  }

  // A url dropped for a cap/cluster early may still be accepted later via another path; report only real losses.
  const chosenUrls = new Set(chosen.map(c => c.url));
  const finalDropped = dropped.filter((d, i) => !chosenUrls.has(d.url) && dropped.findIndex(x => x.url === d.url && x.reason === d.reason) === i);

  const picks: EditorPick[] = chosen.map((c, i) => ({
    url: c.url,
    rank: i + 1,
    tier: i < LEAD_COUNT ? 'lead' : 'more',
    editorWhy: (llmWhy[c.url] || c.why || '').trim().split(/\s+/).slice(0, 20).join(' '),
  }));
  return { picks, barMet, dropped: finalDropped };
}

// ---------- LLM ----------

export function buildEditorSystemPrompt(category: Topic): string {
  const name = getTopicDisplayName(category);
  const ai =
    category === 'AI_and_Strategy'
      ? ' This category is AI-first: prefer major lab, model, economics and policy news; at most one arXiv paper.'
      : '';
  return `You are the editor of the weekly "${name}" brief. The reader is ${READER}.${ai}

Choose and order up to ${PICK_TARGET} articles from the numbered candidates, best first.
- Ranks 1-${LEAD_COUNT} must be significant for the industry, well written, well thought out, and independent journalism (not sponsored content, a press release or a hidden ad). Prefer candidates with significance >= ${LEAD_BAR.significance}, quality >= ${LEAD_BAR.quality} and independence >= ${LEAD_BAR.independence}. Ranks ${LEAD_COUNT + 1}-${PICK_TARGET} may be lighter but must still be independent journalism.
- Vary sub-topics. Do not pick two candidates about the same event (same clusterId); when two outlets cover the same event prefer the one with original reporting.
- At most 3 from one source and at most 2 from one website domain (two sections of the same outlet count as one source). At most one paywalled story in ranks 1-3.
- When a hard-news report and an analysis or feature cover the same company event (for example a results announcement), include the hard-news report. The analysis may join it only if it adds new data or reporting.
- Do not pick two parts of the same series or report (titles sharing a prefix such as "The Big Survey 2026: ..."); pick the more significant part.
- No single company may be the main subject of more than 2 of ranks 1-${LEAD_COUNT}. Spread the top ${LEAD_COUNT} across different companies and events.
- ${UNTRUSTED_NOTICE}
- Do not reward length. The scores were assigned by a separate judge; use them, and your own judgement of the titles and reasons.

Respond with JSON only: {"picks":[{"id":int,"rank":int,"editorWhy":"max 15 words, why it matters to the reader"}]}`;
}

export function buildEditorUserPrompt(candidates: PickCandidate[]): string {
  return candidates
    .map((c, i) => {
      const s = c.scores;
      const title = c.title.replace(/\s+/g, ' ').trim();
      return `[${i}] ${title} | domain: ${domainOf(c.url) || 'n/a'} | company: ${c.mainCompany || 'none'} | source: ${c.source} | type: ${c.type} | coverage: ${c.coverage} | cluster: ${c.clusterId} | sig ${s.significance} sub ${s.substance} ins ${s.insight} wri ${s.writing} ind ${s.independence} | quality ${c.quality.toFixed(2)} | paywall: ${c.paywall ?? 'unknown'} | ${c.why}`;
    })
    .join('\n');
}

/** Returns urls in rank order plus why map, or null when unusable. */
export function parseEditorOutput(
  raw: string,
  candidates: PickCandidate[]
): { order: string[]; why: Record<string, string> } | null {
  let o: any;
  try {
    o = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  } catch {
    return null;
  }
  const arr = Array.isArray(o?.picks) ? o.picks : null;
  if (!arr) return null;
  const items: { url: string; rank: number; why: string }[] = [];
  const seen = new Set<string>();
  for (const p of arr) {
    const rawId = p?.id;
    const id = typeof rawId === 'number' ? rawId : typeof rawId === 'string' && /^\d+$/.test(rawId) ? Number(rawId) : NaN;
    const c = Number.isInteger(id) ? candidates[id] : undefined;
    if (!c || seen.has(c.url)) continue;
    seen.add(c.url);
    items.push({ url: c.url, rank: Number.isFinite(Number(p.rank)) ? Number(p.rank) : items.length + 1, why: String(p.editorWhy ?? '') });
  }
  if (!items.length) return null;
  items.sort((a, b) => a.rank - b.rank);
  return { order: items.map(i => i.url), why: Object.fromEntries(items.map(i => [i.url, i.why])) };
}

export async function pickForCategoryDetailed(
  category: Topic,
  judged: PickCandidate[],
  meta: PickMeta
): Promise<PickReport> {
  const model = meta.model ?? (process.env.SELECTION_EDITOR_MODEL?.trim() || EDITOR_DEFAULT_MODEL);
  const chat = meta.chat ?? openAiChatJson;
  // Only offer the LLM candidates that could survive validation anyway.
  const offered = judged.filter(c => !c.hiddenAd && c.scores.independence >= 3 && !EXCLUDED_TYPES.includes(c.type) && c.adRisk !== 'high');
  if (offered.length === 0) return { ...validatePicks(category, judged), llmFailed: false };

  const system = buildEditorSystemPrompt(category);
  const user = buildEditorUserPrompt(offered);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await chat({ model, system, user, maxTokens: 1200, usage: meta.usage });
      const parsed = parseEditorOutput(text, offered);
      if (parsed) return { ...validatePicks(category, judged, parsed.order, parsed.why), llmFailed: false };
    } catch (err: any) {
      if (attempt === 1) console.warn(`[editorPick] ${category}: ${err?.message ?? err}`);
    }
  }
  return { ...validatePicks(category, judged), llmFailed: true };
}

export async function pickForCategory(
  category: Topic,
  judged: PickCandidate[],
  meta: PickMeta
): Promise<EditorPick[]> {
  return (await pickForCategoryDetailed(category, judged, meta)).picks;
}

export { emptyUsage };
