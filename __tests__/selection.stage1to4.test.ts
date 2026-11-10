import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hardFilter, scanDisclosures } from '../selection/hardFilters';
import { clusterByVectors } from '../selection/cluster';
import { validateTriageResponse, buildTriagePrompt, TRIAGE_PROMPT_VERSION } from '../selection/triage';
import { buildShortlist, shortlistScore } from '../selection/shortlist';
import type { Article } from '../lib/types';
import type { TriageResult, StoryCluster } from '../selection/types';

const art = (o: Partial<Article> & { url: string }): Article =>
  ({ id: o.url, title: 'Plain title', source: 'Vogue Business', published_at: '2026-11-03T10:00:00Z', ingested_at: '', ...o }) as Article;

// ---------- hard filters ----------

test('hardFilter keeps tricky negatives', () => {
  const keep = [
    art({ url: 'https://x.com/news/trade-war-hits-retail', title: 'Trade tensions hit retailers' }),
    art({ url: 'https://x.com/a/1', title: 'Gucci head of design promoted to CEO' }),
    art({ url: 'https://x.com/a/2', title: 'Promoted to chief executive: Jane Doe at Kering' }),
    art({ url: 'https://x.com/a/3', title: 'Head of retail at Pandora says already ahead' }),
    art({ url: 'https://x.com/a/4', title: 'Sponsored athletes win gold in Paris' }),
    art({ url: 'https://x.com/ad-tech/news/headline', title: 'Ad tech funding round' }),
    art({ url: 'https://x.com/a/5', source: 'Business of Fashion', title: 'Business growth' }),
  ];
  for (const a of keep) assert.equal(hardFilter(a).drop, false, a.title + ' ' + a.url);
});

test('hardFilter drops sponsored path, wire sources and title labels', () => {
  const drops: Array<[Partial<Article> & { url: string }, string]> = [
    [{ url: 'https://x.com/sponsored/brand-story' }, 'url:sponsored'],
    [{ url: 'https://www.retaildive.com/spons/the-power-of-the-mall/621/' }, 'url:spons'],
    [{ url: 'https://x.com/news/brand-studio/foo' }, 'url:brand-studio'],
    [{ url: 'https://x.com/news/2026/press-release-acme-raises-funds' }, 'url:press-release'],
    [{ url: 'https://x.com/a/1', source: 'PR Newswire' }, 'source:pr-wire'],
    [{ url: 'https://www.businesswire.com/news/home/123', source: 'Whatever' }, 'source:pr-wire'],
    [{ url: 'https://x.com/a/2', source: 'GlobeNewswire' }, 'source:pr-wire'],
    [{ url: 'https://x.com/a/3', title: 'Sponsored: The best rings' }, 'label:sponsored'],
    [{ url: 'https://x.com/a/4', title: '[Sponsored] Luxury skincare' }, 'label:sponsored'],
    [{ url: 'https://x.com/a/5', title: 'Advertorial - new bag' }, 'label:advertorial'],
    [{ url: 'https://x.com/a/6', title: 'Partner content | Retail trends' }, 'label:partner-content'],
    [{ url: 'https://x.com/a/7', title: 'Promoted: Our new collection' }, 'label:promoted'],
  ];
  for (const [o, reason] of drops) {
    const r = hardFilter(art(o));
    assert.equal(r.drop, true, JSON.stringify(o));
    assert.ok(r.reasons.includes(reason), `${reason} in ${r.reasons}`);
  }
});

test('hardFilter soft flags never drop; scanDisclosures is whole-phrase', () => {
  const r = hardFilter(art({ url: 'https://x.com/a/9', snippet: 'This story is brought to you by Acme. We may earn a commission.' }));
  assert.equal(r.drop, false);
  assert.deepEqual(r.softFlags.sort(), ['text:brought-to-you-by', 'text:we-may-earn-a-commission']);
  assert.deepEqual(scanDisclosures('Sponsored by Acme; presented by Beta'), ['sponsored by', 'presented by']);
  assert.deepEqual(scanDisclosures('an affiliated company, affiliates of the group'), []);
  assert.deepEqual(scanDisclosures(''), []);
});

// ---------- clustering ----------

test('clusterByVectors merges near-duplicates and counts distinct sources', () => {
  const items = [
    { url: 'a', source: 'S1' },
    { url: 'b', source: 'S2' },
    { url: 'c', source: 'S2' },
    { url: 'd', source: 'S3' },
  ];
  const vectors = [
    [1, 0, 0],
    [0.99, 0.05, 0],
    [0.98, 0.1, 0],
    [0, 1, 0],
  ];
  const cl = clusterByVectors(items, vectors, { sim: 0.86 });
  assert.equal(cl.length, 2);
  assert.deepEqual(cl[0].members, ['a', 'b', 'c']);
  assert.equal(cl[0].coverage, 2);
  assert.deepEqual(cl[1].members, ['d']);
});

test('clusterByVectors does not chain A~B~C when A and C are far', () => {
  const ang = (deg: number) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
  // A-B 25deg (cos .906), B-C 25deg, A-C 50deg (cos .64)
  const items = ['A', 'B', 'C'].map(u => ({ url: u, source: u }));
  const cl = clusterByVectors(items, [ang(0), ang(25), ang(50)], { sim: 0.86, seedSim: 0.8 });
  const withC = cl.find(c => c.members.includes('C'))!;
  assert.ok(!withC.members.includes('A'), 'C must not join the cluster seeded by A');
  assert.equal(cl.length, 2);
});

test('clusterByVectors rejects length mismatch', () => {
  assert.throws(() => clusterByVectors([{ url: 'a', source: 's' }], []));
});

// ---------- triage validator / prompt ----------

const row = (o: Record<string, unknown>) => ({ i: 0, category: 'Luxury_and_Consumer', type: 'hard_news', significance: 3, adRisk: 'low', reason: 'x', ...o });

test('validateTriageResponse maps by index, not position, and accepts null category', () => {
  const raw = JSON.stringify({ results: [row({ i: 1, category: null, significance: 5 }), row({ i: 0, type: 'analysis' })] });
  const v = validateTriageResponse(raw, 2);
  assert.deepEqual(v.invalid, []);
  assert.equal(v.valid.get(0)!.type, 'analysis');
  assert.equal(v.valid.get(1)!.category, null);
  assert.equal(v.valid.get(1)!.significance, 5);
});

test('validateTriageResponse rejects bad category/type/significance/adRisk and reports missing', () => {
  const raw = JSON.stringify({
    results: [
      row({ i: 0, category: 'Fashion' }),
      row({ i: 1, type: 'news' }),
      row({ i: 2, significance: 6 }),
      row({ i: 3, significance: 0 }),
      row({ i: 4, significance: 2.5 }),
      row({ i: 5, adRisk: 'none' }),
      row({ i: 9 }), // out of range (index 7 is missing)
      row({ i: 6 }), // fine
    ],
  });
  const v = validateTriageResponse(raw, 8);
  assert.deepEqual([...v.valid.keys()], [6]);
  assert.deepEqual(v.invalid, [0, 1, 2, 3, 4, 5, 7]);
  assert.ok(v.errors.length >= 7);
});

test('validateTriageResponse handles fenced and garbage output', () => {
  const fenced = '```json\n' + JSON.stringify({ results: [row({ i: 0 })] }) + '\n```';
  assert.equal(validateTriageResponse(fenced, 1).valid.size, 1);
  const bad = validateTriageResponse('not json', 3);
  assert.deepEqual(bad.invalid, [0, 1, 2]);
});

test('buildTriagePrompt includes index, hint, flags and truncates snippet', () => {
  const p = buildTriagePrompt([
    { article: art({ url: 'https://x.com/a/b', title: 'T1', snippet: 'z'.repeat(1000) }), hint: 'Jewellery_Industry', softFlags: ['text:affiliate'] },
    { article: art({ url: 'https://x.com/c', title: 'T2' }), hint: null, softFlags: [] },
  ]);
  assert.match(p, /\[0\] T1/);
  assert.match(p, /\[1\] T2/);
  assert.match(p, /Classifier hint: Jewellery_Industry/);
  assert.match(p, /Soft flags: text:affiliate/);
  assert.ok(!p.includes('z'.repeat(401)));
  assert.ok(TRIAGE_PROMPT_VERSION.length > 0);
});

// ---------- shortlist ----------

const tri = (url: string, o: Partial<TriageResult> = {}): TriageResult => ({
  url, category: 'Luxury_and_Consumer', type: 'hard_news', significance: 3, adRisk: 'low', reason: '', ...o,
});

test('shortlistScore formula', () => {
  assert.equal(shortlistScore({ significance: 4, type: 'hard_news', adRisk: 'low' }, 1), 43);
  assert.equal(shortlistScore({ significance: 4, type: 'hard_news', adRisk: 'medium' }, 3), 43 + 4 - 4);
  assert.equal(shortlistScore({ significance: 3, type: 'listicle_roundup', adRisk: 'low' }, 9), 30 - 4 + 6);
  assert.equal(shortlistScore({ significance: 3, type: 'opinion', adRisk: 'low' }, 1), 28);
});

test('buildShortlist: exclusions, one rep per cluster, coverage, source cap, N', () => {
  const articles: Article[] = [
    art({ url: 'u1', source: 'A' }),
    art({ url: 'u2', source: 'B', snippet: 'longer snippet' }), // same cluster as u1
    art({ url: 'u3', source: 'C' }), // high adRisk -> excluded
    art({ url: 'u4', source: 'D' }), // sponsored type -> excluded
    art({ url: 'u5', source: 'E' }), // other category
    art({ url: 'u6', source: 'F' }), // hard-filter dropped
    art({ url: 'u7', source: 'G' }), // null category
    ...[1, 2, 3, 4, 5, 6].map(i => art({ url: `s${i}`, source: 'Same' })),
  ];
  const triage = new Map<string, TriageResult>([
    ['u1', tri('u1', { significance: 3 })],
    ['u2', tri('u2', { significance: 4 })],
    ['u3', tri('u3', { adRisk: 'high', significance: 5 })],
    ['u4', tri('u4', { type: 'sponsored', significance: 5 })],
    ['u5', tri('u5', { category: 'Jewellery_Industry', significance: 5 })],
    ['u6', tri('u6', { significance: 5 })],
    ['u7', tri('u7', { category: null, significance: 5 })],
    ...[1, 2, 3, 4, 5, 6].map(i => [`s${i}`, tri(`s${i}`, { significance: 2 })] as [string, TriageResult]),
  ]);
  const clusters: StoryCluster[] = [
    { clusterId: 'c1', members: ['u1', 'u2'], coverage: 2 },
    ...['u3', 'u4', 'u5', 'u6', 'u7', 's1', 's2', 's3', 's4', 's5', 's6'].map((u, i) => ({ clusterId: `x${i}`, members: [u], coverage: 1 })),
  ];
  const hf = new Map([['u6', { url: 'u6', drop: true, reasons: ['url:sponsored'], softFlags: [] }]]);
  const out = buildShortlist({ articles, triage, clusters, hardFilterResults: hf, n: 25 });

  const lux = out.Luxury_and_Consumer.map(e => e.url);
  assert.ok(lux.includes('u2') && !lux.includes('u1'), 'one rep per cluster, higher significance wins');
  for (const bad of ['u3', 'u4', 'u5', 'u6', 'u7']) assert.ok(!lux.includes(bad), bad);
  assert.equal(out.Luxury_and_Consumer[0].url, 'u2');
  assert.equal(out.Luxury_and_Consumer[0].coverage, 2);
  assert.equal(out.Luxury_and_Consumer[0].shortlistScore, 4 * 10 + 3 + 2);
  assert.equal(lux.filter(u => u.startsWith('s')).length, 4, 'cap 4 per source');
  assert.deepEqual(out.Jewellery_Industry.map(e => e.url), ['u5']);

  const small = buildShortlist({ articles, triage, clusters, hardFilterResults: hf, n: 2 });
  assert.equal(small.Luxury_and_Consumer.length, 2);
});

test('buildShortlist rep tie-break: type bonus, snippet length, url', () => {
  const articles = [
    art({ url: 'b', source: 'A', snippet: 'short' }),
    art({ url: 'a', source: 'B', snippet: 'a much longer snippet here' }),
    art({ url: 'c', source: 'C' }),
  ];
  const triage = new Map([
    ['a', tri('a')],
    ['b', tri('b')],
    ['c', tri('c', { type: 'opinion' })],
  ]);
  const clusters: StoryCluster[] = [{ clusterId: 'c1', members: ['a', 'b', 'c'], coverage: 3 }];
  const out = buildShortlist({ articles, triage, clusters, n: 5 });
  assert.deepEqual(out.Luxury_and_Consumer.map(e => e.url), ['a']);
});
