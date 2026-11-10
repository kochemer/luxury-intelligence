import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeQuality,
  validateJudgeOutput,
  fallbackJudge,
  buildJudgeSystemPrompt,
  buildJudgeUserPrompt,
  judgeArticles,
} from '../selection/judge';
import { validatePicks, pickForCategoryDetailed, type PickCandidate } from '../selection/editorPick';
import { fetchFullTexts, type FetchLike } from '../selection/fullText';

const sc = (sig: number, sub = 4, ins = 4, wri = 4, ind = 5) => ({
  significance: sig, substance: sub, insight: ins, writing: wri, independence: ind,
});

let n = 0;
function cand(o: Partial<PickCandidate> & { sig?: number; ind?: number; q?: number } = {}): PickCandidate {
  n++;
  const scores = sc(o.sig ?? 4, 4, 4, 4, o.ind ?? 5);
  return {
    url: `https://ex.com/${n}`,
    title: `T${n}`,
    source: `Src${n}`,
    type: 'hard_news',
    coverage: 1,
    clusterId: `c${n}`,
    scores,
    quality: o.q ?? 4,
    hiddenAd: false,
    why: 'why',
    ...o,
  };
}
const urls = (r: { picks: { url: string }[] }) => r.picks.map(p => p.url);

test('computeQuality uses the spec weights', () => {
  assert.equal(computeQuality(sc(5, 5, 5, 5, 5)), 5);
  assert.equal(computeQuality(sc(1, 1, 1, 1, 1)), 1);
  // .35*4 + .2*3 + .2*2 + .1*5 + .15*1 = 1.4+.6+.4+.5+.15
  assert.equal(computeQuality({ significance: 4, substance: 3, insight: 2, writing: 5, independence: 1 }), 3.05);
});

test('judge validator accepts a complete answer and rejects bad ones', () => {
  const ok = { ...sc(4), hiddenAd: false, type: 'analysis', why: 'because' };
  assert.ok(validateJudgeOutput(JSON.stringify(ok)));
  assert.equal(validateJudgeOutput({ ...ok, type: 'bogus' })?.type, 'other');
  assert.equal(validateJudgeOutput({ ...ok, significance: 6 }), null);
  assert.equal(validateJudgeOutput({ ...ok, writing: 0 }), null);
  assert.equal(validateJudgeOutput({ ...ok, insight: '4' }), null);
  const { substance: _s, ...missing } = ok;
  assert.equal(validateJudgeOutput(missing), null);
  assert.equal(validateJudgeOutput({ ...ok, hiddenAd: 'no' }), null);
  assert.equal(validateJudgeOutput({ ...ok, why: '' }), null);
  assert.equal(validateJudgeOutput('not json'), null);
});

test('judge prompt carries anchors, hidden-ad signals and the no-length rule', () => {
  const p = buildJudgeSystemPrompt('Jewellery_Industry');
  for (const w of ['significance', 'substance', 'insight', 'writing', 'independence', 'Hidden-ad signals', 'NOT on its length']) {
    assert.ok(p.includes(w), w);
  }
  assert.ok(buildJudgeSystemPrompt('AI_and_Strategy').includes('AI-first'));
});

test('fallbackJudge follows the spec', () => {
  const f = fallbackJudge({ url: 'u', triage: { significance: 4, adRisk: 'medium', type: 'analysis', reason: 'r' } });
  assert.equal(f.fallback, true);
  assert.equal(f.scores.significance, 4);
  assert.equal(f.scores.independence, 3);
  assert.equal(f.scores.substance, 3);
  assert.equal(fallbackJudge({ url: 'u', triage: { significance: 2, adRisk: 'low', type: 'other', reason: '' } }).scores.independence, 4);
});

test('judgeArticles: retries once then falls back; no network', async () => {
  const item = {
    url: 'https://a.com/x', title: 'T', source: 'S', coverage: 2,
    fullText: { url: 'https://a.com/x', text: 'body', wordCount: 1, paywall: 'unknown' as const, status: 'snippet_only' as const, disclosures: [] },
    triage: { significance: 3, adRisk: 'low' as const, type: 'hard_news' as const, reason: 'r' },
  };
  let calls = 0;
  const bad = async () => { calls++; return '{"significance":9}'; };
  const failures: string[] = [];
  const m = await judgeArticles([item], { week: '2026-W45', category: 'Luxury_and_Consumer', chat: bad, useCache: false, failures });
  assert.equal(calls, 2);
  assert.equal(m.get(item.url)?.fallback, true);
  assert.deepEqual(failures, [item.url]);

  const good = async () => JSON.stringify({ ...sc(5, 4, 4, 4, 5), hiddenAd: false, type: 'hard_news', why: 'big' });
  const m2 = await judgeArticles([item], { week: '2026-W45', category: 'Luxury_and_Consumer', chat: good, useCache: false });
  assert.equal(m2.get(item.url)?.quality, computeQuality(sc(5, 4, 4, 4, 5)));
  assert.ok(buildJudgeUserPrompt(item).includes('SNIPPET ONLY'));
});

// ---------- validatePicks ----------

test('validatePicks removes hiddenAd and independence<3', () => {
  const ads = cand({ hiddenAd: true });
  const lowInd = cand({ ind: 2 });
  const good = Array.from({ length: 7 }, () => cand());
  const r = validatePicks('Luxury_and_Consumer', [ads, lowInd, ...good]);
  assert.ok(!urls(r).includes(ads.url) && !urls(r).includes(lowInd.url));
  assert.equal(r.picks.length, 7);
  assert.deepEqual(r.dropped.map(d => d.reason).sort(), ['hiddenAd', 'independence<3']);
});

test('validatePicks keeps one per cluster', () => {
  const a = cand({ clusterId: 'X', q: 4.5 });
  const b = cand({ clusterId: 'X', q: 4.4 });
  const rest = Array.from({ length: 6 }, () => cand());
  const r = validatePicks('Luxury_and_Consumer', [a, b, ...rest], [a.url, b.url]);
  assert.ok(urls(r).includes(a.url));
  assert.ok(!urls(r).includes(b.url));
  assert.ok(r.dropped.some(d => d.url === b.url && d.reason === 'duplicate-cluster'));
});

test('validatePicks caps 3 per source', () => {
  const same = Array.from({ length: 5 }, () => cand({ source: 'Vogue Business' }));
  const others = Array.from({ length: 4 }, () => cand({ q: 3 }));
  const r = validatePicks('Luxury_and_Consumer', [...same, ...others]);
  const fromVogue = r.picks.filter(p => same.some(s => s.url === p.url));
  assert.equal(fromVogue.length, 3);
  assert.equal(r.picks.length, 7);
});

test('validatePicks AI: all arXiv sources count as one, max 1', () => {
  const ax = [cand({ source: 'arXiv - AI', q: 4.9 }), cand({ source: 'arXiv - Machine Learning', q: 4.8 }), cand({ source: 'ArXiv CS.CL', q: 4.7 })];
  const others = Array.from({ length: 6 }, () => cand({ q: 3.8 }));
  const r = validatePicks('AI_and_Strategy', [...ax, ...others]);
  assert.equal(r.picks.filter(p => ax.some(a => a.url === p.url)).length, 1);
  // not applied to other categories
  const r2 = validatePicks('Ecommerce_Retail_Tech', [...ax, ...others]);
  assert.equal(r2.picks.filter(p => ax.some(a => a.url === p.url)).length, 3);
});

test('validatePicks: bar-passers keep LLM order and take ranks 1-5; tiers set', () => {
  const pass = Array.from({ length: 6 }, (_, i) => cand({ q: 3.7 + i * 0.05 }));
  const low = cand({ sig: 3, q: 4.9 }); // high quality but fails the bar (significance 3)
  const order = [low.url, pass[3].url, pass[0].url, pass[5].url, pass[1].url, pass[2].url, pass[4].url];
  const r = validatePicks('Jewellery_Industry', [low, ...pass], order);
  assert.equal(r.barMet, true);
  assert.deepEqual(urls(r).slice(0, 5), [pass[3].url, pass[0].url, pass[5].url, pass[1].url, pass[2].url]);
  // LLM's rank-1 pick that fails the bar still gets a place after the lead slots
  assert.equal(r.picks[5].url, low.url);
  assert.deepEqual(r.picks.map(p => p.tier), ['lead', 'lead', 'lead', 'lead', 'lead', 'more', 'more']);
  assert.deepEqual(r.picks.map(p => p.rank), [1, 2, 3, 4, 5, 6, 7]);
});

test('validatePicks: barMet=false fills lead slots by quality', () => {
  const pass = [cand({ q: 3.8 }), cand({ q: 3.9 })];
  const weak = [cand({ sig: 3, q: 3.5 }), cand({ sig: 3, q: 3.2 }), cand({ sig: 2, q: 3.4 }), cand({ sig: 3, q: 3.0 }), cand({ sig: 3, q: 2.5 })];
  const r = validatePicks('Luxury_and_Consumer', [...weak, ...pass], [pass[0].url, pass[1].url]);
  assert.equal(r.barMet, false);
  assert.deepEqual(urls(r).slice(0, 5), [pass[0].url, pass[1].url, weak[0].url, weak[2].url, weak[1].url]);
  assert.equal(r.picks[4].tier, 'lead');
  assert.equal(r.picks.length, 7);
});

test('validatePicks: backfills to 7 by quality, fewer only when pool exhausted', () => {
  const pool = Array.from({ length: 10 }, (_, i) => cand({ q: 3 + i * 0.1 }));
  const llm = [pool[0].url, pool[1].url, pool[2].url]; // editor chose only 3
  const r = validatePicks('Luxury_and_Consumer', pool, llm);
  assert.equal(r.picks.length, 7);
  const small = validatePicks('Luxury_and_Consumer', pool.slice(0, 4));
  assert.equal(small.picks.length, 4);
  assert.equal(small.barMet, false);
});

test('validatePicks ignores unknown/duplicate LLM urls and keeps editorWhy', () => {
  const pool = Array.from({ length: 7 }, () => cand());
  const r = validatePicks('Luxury_and_Consumer', pool, ['nope', pool[2].url, pool[2].url], { [pool[2].url]: 'Editor reason' });
  assert.equal(r.picks[0].url, pool[2].url);
  assert.equal(r.picks[0].editorWhy, 'Editor reason');
});

test('pickForCategoryDetailed: LLM failure falls back to quality order', async () => {
  const pool = Array.from({ length: 8 }, (_, i) => cand({ q: 3.7 + i * 0.1 }));
  let calls = 0;
  const r = await pickForCategoryDetailed('Luxury_and_Consumer', pool, {
    week: '2026-W45', chat: async () => { calls++; throw new Error('boom'); },
  });
  assert.equal(calls, 2);
  assert.equal(r.llmFailed, true);
  assert.equal(r.picks[0].url, pool[7].url);
});

test('pickForCategoryDetailed: maps LLM ids and order', async () => {
  const pool = Array.from({ length: 8 }, (_, i) => cand({ q: 3.7 + i * 0.1 }));
  const chat = async () => JSON.stringify({ picks: [{ id: 0, rank: 2, editorWhy: 'b' }, { id: 3, rank: 1, editorWhy: 'a' }, { id: 99, rank: 3, editorWhy: 'x' }] });
  const r = await pickForCategoryDetailed('Luxury_and_Consumer', pool, { week: 'w', chat });
  assert.equal(r.llmFailed, false);
  assert.deepEqual(urls(r).slice(0, 2), [pool[3].url, pool[0].url]);
  assert.equal(r.picks[0].editorWhy, 'a');
});

// ---------- fullText ----------

const longBody = (words: number) => '<html><body><article>' + Array.from({ length: words }, (_, i) => `word${i}`).join(' ') + '</article></body></html>';
const res = (status: number, body = ''): ReturnType<FetchLike> =>
  Promise.resolve({ status, ok: status >= 200 && status < 300, text: async () => body });

test('fetchFullTexts truncates to 12000 chars and scans disclosures', async () => {
  const html = '<html><body><article>Sponsored by Acme. ' + 'lorem ipsum dolor sit amet '.repeat(1500) + '</article></body></html>';
  const m = await fetchFullTexts([{ url: 'https://a.com/1', snippet: 'snip' }], { fetchFn: () => res(200, html), cacheDir: null });
  const r = m.get('https://a.com/1')!;
  assert.equal(r.status, 'fetched');
  assert.equal(r.text.length, 12000);
  assert.equal(r.paywall, 'not_paywalled');
  assert.ok(r.disclosures.length >= 1);
});

test('fetchFullTexts falls back to the snippet on failure, 403, short page and network error', async () => {
  const fns: Record<string, ReturnType<FetchLike> | (() => never)> = {
    'https://a.com/404': res(404),
    'https://a.com/403': res(403),
    'https://a.com/short': res(200, longBody(20)),
    'https://a.com/gate': res(200, '<html><body><article>Subscribe to read the full article. Premium content.</article></body></html>'),
  };
  const fetchFn: FetchLike = async url => {
    if (url === 'https://a.com/err') throw new Error('ECONNRESET');
    return fns[url] as ReturnType<FetchLike>;
  };
  const entries = [...Object.keys(fns), 'https://a.com/err'].map(url => ({ url, snippet: 'the snippet text' }));
  const m = await fetchFullTexts(entries, { fetchFn, cacheDir: null });
  for (const e of entries) {
    const r = m.get(e.url)!;
    assert.equal(r.status, 'snippet_only', e.url);
    assert.equal(r.text, 'the snippet text');
  }
  assert.equal(m.get('https://a.com/403')!.paywall, 'likely_paywalled');
  assert.equal(m.get('https://a.com/gate')!.paywall, 'likely_paywalled');
  assert.equal(m.get('https://a.com/404')!.paywall, 'unknown');
});

test('fetchFullTexts respects concurrency 6', async () => {
  let active = 0, peak = 0;
  const fetchFn: FetchLike = async () => {
    active++; peak = Math.max(peak, active);
    await new Promise(r => setTimeout(r, 15));
    active--;
    return { status: 200, ok: true, text: async () => longBody(200) };
  };
  const entries = Array.from({ length: 20 }, (_, i) => ({ url: `https://a.com/${i}`, snippet: '' }));
  const m = await fetchFullTexts(entries, { fetchFn, cacheDir: null });
  assert.equal(m.size, 20);
  assert.equal(peak, 6);
});
