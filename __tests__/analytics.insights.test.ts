import test from 'node:test';
import assert from 'node:assert/strict';
import { checkProposal, extractDates, extractNumbers, roundTo, LIMITS } from '../lib/analytics/insights/checks';
import { aiAssistantName, browserFamily, languageName, referrerFamily, slug, topicName } from '../lib/analytics/insights/families';
import { parseDecision } from '../lib/analytics/insights/agent';
import type { DataPack, ExistingInsight, Fact, Proposal, SeriesFact } from '../lib/analytics/insights/types';

// Synthetic data only: the repo is public, so no number here is real.
const fact = (id: string, value: number, start = '2026-05-18', end = '2026-05-24', source: Fact['source'] = 'amplitude'): Fact =>
  ({ id, label: id, period: { start, end }, value, source });

const series: SeriesFact = {
  id: 'amp.people.weekly',
  label: 'People per week',
  period: { start: '2026-05-04', end: '2026-05-31' },
  source: 'amplitude',
  points: [
    { key: '2026-05-04', value: 40 },
    { key: '2026-05-11', value: 55 },
    { key: '2026-05-18', value: 120 },
    { key: '2026-05-25', value: 61 },
  ],
};

const pack: DataPack = {
  today: '2026-10-16',
  failedBlocks: [],
  series: [series],
  facts: [
    fact('a.week', 1018),                                  // 18-24 May
    fact('a.month', 3000, '2026-05-01', '2026-05-31'),
    fact('a.part', 87, '2026-01-01', '2026-03-31'),
    fact('a.whole', 100, '2026-01-01', '2026-03-31'),
    fact('c.a', 7, '2026-01-01', '2026-03-31'),
    fact('c.b', 9, '2026-01-01', '2026-03-31'),
    fact('c.c', 3, '2026-01-01', '2026-03-31'),
    fact('c.d', 2, '2026-01-01', '2026-03-31'),
    fact('c.e', 1, '2026-01-01', '2026-03-31'),
    fact('c.f', 4, '2026-01-01', '2026-03-31'),
    fact('dec', 1.94, '2026-02-01', '2026-02-28'),
    fact('big', 24000, '2026-01-01', '2026-03-31'),
    fact('d28', 55, '2026-09-01', '2026-09-28', 'search'),
  ],
};

const base: Proposal = {
  eyebrow: 'Busiest week',
  hero: '1,018',
  unit: 'people',
  summary: 'The week of 18–24 May 2026 was the busiest.',
  detail: 'It brought 1,018 people.',
  evidence: ['a.week'],
};

const ok = (p: Partial<Proposal>, active: ExistingInsight[] = [], removed: ExistingInsight[] = []) =>
  checkProposal({ ...base, ...p }, pack, active, removed);
const failures = (r: ReturnType<typeof ok>) => (r.ok ? [] : r.failures);
const failsWith = (r: ReturnType<typeof ok>, re: RegExp) => {
  assert.equal(r.ok, false, 'expected a failure');
  assert.ok(failures(r).some(f => re.test(f)), `no failure matching ${re}: ${failures(r).join(' | ')}`);
};
const rec = (id: number, ...ev: string[]): ExistingInsight => ({ id, evidence: ev.map(e => ({ id: e, value: 1 })) });

test('a grounded proposal passes and resolves evidence and sources', () => {
  const r = ok({});
  assert.equal(r.ok, true, failures(r).join(' | '));
  if (r.ok) {
    assert.deepEqual(r.insight.evidence, [{ id: 'a.week', value: 1018 }]);
    assert.deepEqual(r.insight.sources, ['amplitude']);
    assert.equal(r.insight.tile.hero, '1,018');
  }
});

test('numbers: ungrounded, thousands separators, decimals, precision', () => {
  failsWith(ok({ detail: 'It brought 1,019 people.' }), /1,019/);
  assert.equal(ok({ detail: 'It brought 1018 people.' }).ok, true);
  assert.equal(ok({ evidence: ['a.week', 'dec'], detail: 'It brought 1,018 people and 1.9 pages each.' }).ok, true);
  assert.equal(ok({ evidence: ['a.week', 'dec'], detail: 'It brought 1,018 people and 1.94 pages each.' }).ok, true);
  failsWith(ok({ evidence: ['a.week', 'dec'], detail: 'It brought 1,018 people and 1.8 pages each.' }), /1\.8/);
  assert.equal(ok({ evidence: ['a.week', 'dec'], detail: '1,018 people, 2 pages each.' }).ok, true);   // rounds to the precision written
  assert.equal(ok({ evidence: ['a.week', 'big'], detail: '1,018 people, 24k in the first months.' }).ok, true);
  failsWith(ok({ detail: 'It brought 1,018 people on 3 pages.' }), /"3"/);
});

test('numbers: a cited fact must actually be used', () => {
  failsWith(ok({ evidence: ['a.week', 'dec'] }), /dec.*not used/);
});

test('numbers: words and ungrounded counts in other fields', () => {
  failsWith(ok({ detail: 'About two thirds came back.' }), /in words/);
  failsWith(ok({ eyebrow: 'Top 5 pages' }), /"5" in eyebrow/);
  failsWith(ok({ unit: '5 people' }), /"5" in unit/);
});

test('percentages at 0 and 1 decimals from two cited facts', () => {
  const pct = (hero: string, extra: Partial<Proposal> = {}) =>
    ok({ evidence: ['c.a', 'c.b'], hero, unit: 'of all', summary: 'A share of the total.', detail: 'It rests on 7 and 9.', eyebrow: 'Share', ...extra });
  const zero = pct('78%');                                            // 7/9 = 77.8%
  assert.equal(zero.ok, true, failures(zero).join(' | '));
  const one = pct('77.8%');
  assert.equal(one.ok, true, failures(one).join(' | '));
  failsWith(pct('77.9%'), /77\.9%/);
  failsWith(pct('79%'), /79%/);
  failsWith(pct('78'), /"78"/);                                       // no % sign: must be a fact value
  const sp = pct('78%', { detail: 'About 78 percent, from 7 and 9.' });
  assert.equal(sp.ok, true, failures(sp).join(' | '));
});

test('a percentage of facts that are not cited must fail', () => {
  // 7/9 is cited and gives 78%, not 56%; the pack's other facts do not count.
  failsWith(ok({ evidence: ['c.a', 'c.b'], hero: '29%', detail: '7 and 9.', summary: 'A share.' }), /29%/);
  failsWith(ok({ evidence: ['a.week'], hero: '3%', detail: 'It brought 1,018 people.', summary: 'A share.' }), /3%/);
  // c.c / c.b = 33% exists in the pack but c.c is not cited.
  failsWith(ok({ evidence: ['c.a', 'c.b'], hero: '33%', detail: '7 and 9.', summary: 'A share.' }), /33%/);
});

test('arithmetic other than a percentage is rejected', () => {
  failsWith(ok({ evidence: ['c.a', 'c.b'], hero: '16', detail: '7 and 9.', summary: 'A total.' }), /"16"/);
  failsWith(ok({ evidence: ['c.a', 'c.b'], hero: '+29%', detail: '7 and 9.', summary: 'Growth.' }), /29%/);
});

test('durations match the cited period length', () => {
  const r = ok({ evidence: ['d28'], hero: '55', unit: 'people', summary: 'Seen over 28 days.', detail: 'Search showed 55 in September.', eyebrow: 'Search' });
  assert.equal(r.ok, true, failures(r).join(' | '));
  failsWith(ok({ evidence: ['d28'], hero: '55', summary: 'Seen over 30 days.', detail: '55 in September.' }), /30 days/);
});

test('dates: inside and outside the cited periods', () => {
  assert.equal(ok({ summary: 'Week of 18–24 May 2026.' }).ok, true);
  assert.equal(ok({ summary: 'Week of 18–24 May.' }).ok, true);
  assert.equal(ok({ summary: 'Week of 2026-05-18.' }).ok, true);
  assert.equal(ok({ summary: 'It began on 20 May.' }).ok, true);
  failsWith(ok({ summary: 'Week of 25–31 May 2026.' }), /25–31 May 2026/);
  failsWith(ok({ summary: 'It began on 13 Apr.' }), /13 Apr/);
  failsWith(ok({ summary: 'It began on 2026-05-25.' }), /2026-05-25/);
  failsWith(ok({ summary: 'It began on 31 Feb.' }), /31 Feb/);
  failsWith(ok({ summary: 'A year ago, in 2025.' }), /2025/);
  assert.equal(ok({ summary: 'A week in 2026.' }).ok, true);
});

test('dates: months and month ranges', () => {
  assert.equal(ok({ evidence: ['a.week', 'a.month'], detail: '1,018 of 3,000 came in May 2026.' }).ok, true);
  failsWith(ok({ detail: '1,018 came in May.' }), /May/);   // only a week of May is cited
  const jm = { evidence: ['a.part', 'a.whole'], hero: '87%', unit: 'of people', detail: '87 of 100 people.' };
  assert.equal(ok({ ...jm, summary: 'From Jan–Mar.' }).ok, true);
  failsWith(ok({ ...jm, summary: 'From Jan–Jun.' }), /Jan–Jun/);
});

test('dates: week labels', () => {
  assert.equal(ok({ summary: 'Week W21 stood out.' }).ok, true);              // 18-24 May 2026 is ISO week 21
  assert.equal(ok({ summary: 'Week 2026-W21 stood out.' }).ok, true);
  failsWith(ok({ summary: 'Week W22 stood out.' }), /W22/);
  failsWith(ok({ summary: 'Week 2025-W21 stood out.' }), /2025-W21/);
});

test('dates are removed before counting numbers', () => {
  const { dates, rest } = extractDates('18–24 May 2026 and 13 Apr and Jan–Mar and W41');
  assert.equal(dates.length, 4);
  assert.deepEqual(extractNumbers(rest), []);
});

test('number extraction handles separators, decimals, percents, suffixes', () => {
  const t = extractNumbers('1,018 and 1.9 and 87% and 2.4k and D7 and 5 percent');
  assert.deepEqual(t.map(x => [x.base, x.decimals, x.percent, x.scale]), [
    [1018, 0, false, 1], [1.9, 1, false, 1], [87, 0, true, 1], [2.4, 1, false, 1000], [5, 0, true, 1],
  ]);
  assert.equal(roundTo(1.005, 2), 1.01);
});

test('lengths, URLs and email addresses', () => {
  failsWith(ok({ eyebrow: 'x'.repeat(LIMITS.eyebrow + 1) }), /eyebrow is 33/);
  failsWith(ok({ hero: '123456789' }), /hero is 9/);
  failsWith(ok({ unit: 'x'.repeat(17) }), /unit is 17/);
  failsWith(ok({ summary: 'x'.repeat(91) }), /summary is 91/);
  failsWith(ok({ detail: 'x'.repeat(181) }), /detail is 181/);
  assert.equal(ok({ detail: `1,018 ${'x'.repeat(170)}` }).ok, true);
  assert.equal(ok({ eyebrow: 'x'.repeat(LIMITS.eyebrow) }).ok, true);
  failsWith(ok({ summary: 'See https://example.org/page' }), /URL/);
  failsWith(ok({ summary: 'See www.example.org' }), /URL/);
  failsWith(ok({ summary: 'Most came from chatgpt.com.' }), /URL or domain/);
  failsWith(ok({ summary: 'Write to someone@example.org' }), /email/);
  failsWith(ok({ detail: 'It brought 1,018 people.\nNew line.' }), /line break/);
  failsWith(ok({ eyebrow: '  ' }), /eyebrow is empty/);
});

test('unknown or missing evidence', () => {
  failsWith(ok({ evidence: ['a.week', 'nope.nothing'] }), /nope\.nothing/);
  failsWith(ok({ evidence: [] }), /non-empty/);
  failsWith(ok({ evidence: Array.from({ length: 9 }, (_, i) => `x${i}`) }), /max 8/);
});

test('chart: weekly resolves a series and highlights a key', () => {
  const weekly = { evidence: ['amp.people.weekly'], hero: '120', unit: 'people', summary: 'The busiest week.', detail: 'It had 120 people.' };
  const r = ok({ ...weekly, chart: { kind: 'weekly', seriesId: 'amp.people.weekly', highlight: '2026-05-18' } });
  assert.equal(r.ok, true, failures(r).join(' | '));
  if (r.ok) {
    assert.deepEqual(r.insight.tile.chart, { kind: 'weekly', labels: ['2026-05-04', '2026-05-11', '2026-05-18', '2026-05-25'], values: [40, 55, 120, 61], highlight: 2 });
    assert.deepEqual(r.insight.evidence, [{ id: 'amp.people.weekly', value: 120, key: '2026-05-18' }]);
  }
  failsWith(ok({ ...weekly, chart: { kind: 'weekly', seriesId: 'amp.people.weekly', highlight: '2026-05-19' } }), /highlight/);
  // A series cited without a chart has no citable numbers.
  failsWith(ok(weekly), /120|not used/);
  // Only the highlighted bar's value is citable, not the others.
  failsWith(ok({ ...weekly, hero: '55', detail: '55 people.', chart: { kind: 'weekly', seriesId: 'amp.people.weekly', highlight: '2026-05-18' } }), /"55"/);
  // A fact id used as a series is rejected.
  failsWith(ok({ chart: { kind: 'weekly', seriesId: 'a.week', highlight: '2026-05-18' } }), /not a series/);
  // A series that is charted but not cited.
  failsWith(ok({ chart: { kind: 'weekly', seriesId: 'amp.people.weekly', highlight: '2026-05-18' } }), /series "amp\.people\.weekly" is not in evidence/);
});

test('chart: share resolves part and whole, both must be cited', () => {
  const share = { kind: 'share', partId: 'a.part', wholeId: 'a.whole', partLabel: 'English', restLabel: 'Other' } as const;
  const p = { evidence: ['a.part', 'a.whole'], hero: '87%', unit: 'of people', summary: 'Most use English.', detail: '87 of 100 people.' };
  const r = ok({ ...p, chart: share });
  assert.equal(r.ok, true, failures(r).join(' | '));
  if (r.ok) assert.deepEqual(r.insight.tile.chart, { kind: 'share', part: 87, whole: 100, partLabel: 'English', restLabel: 'Other' });
  failsWith(ok({ evidence: ['a.part'], hero: '87', unit: 'people', summary: 'Most.', detail: '87 people.', chart: share }), /not in evidence/);
  failsWith(ok({ ...p, chart: { ...share, partId: 'a.whole', wholeId: 'a.part' } }), /larger than its whole/);
  failsWith(ok({ ...p, chart: { ...share, partLabel: 'English 12%' } }), /12%.* chart label/);
  failsWith(ok({ ...p, chart: { ...share, partLabel: 'Seen 5 times' } }), /"5" in chart label/);
  failsWith(ok({ ...p, chart: { ...share, restLabel: 'x'.repeat(25) } }), /chart restLabel is 25/);
});

test('chart: bars take up to five rows, values only from cited facts', () => {
  const row = (id: string, label: string) => ({ label, factId: id });
  const five = [row('c.a', 'A'), row('c.b', 'B'), row('c.c', 'C'), row('c.d', 'D'), row('c.e', 'E')];
  const p = { evidence: ['c.a', 'c.b', 'c.c', 'c.d', 'c.e'], hero: '9', unit: 'clicks', summary: 'B leads.', detail: '9, 7, 3, 2 and 1 clicks.' };
  const r = ok({ ...p, chart: { kind: 'bars', rows: five } });
  assert.equal(r.ok, true, failures(r).join(' | '));
  if (r.ok) assert.deepEqual(r.insight.tile.chart, { kind: 'bars', rows: [{ label: 'A', value: 7 }, { label: 'B', value: 9 }, { label: 'C', value: 3 }, { label: 'D', value: 2 }, { label: 'E', value: 1 }] });
  failsWith(ok({ evidence: ['c.a', 'c.b', 'c.c', 'c.d', 'c.e', 'c.f'], hero: '9', detail: '9, 7, 3, 2, 1 and 4.', chart: { kind: 'bars', rows: [...five, row('c.f', 'F')] } }), /6 rows \(max 5\)/);
  // A chart value that is not in evidence.
  failsWith(ok({ evidence: ['c.a', 'c.b'], hero: '9', detail: '9 and 7.', chart: { kind: 'bars', rows: [row('c.a', 'A'), row('c.c', 'C')] } }), /"c\.c" is not in evidence/);
  failsWith(ok({ evidence: ['c.a', 'c.b'], hero: '9', detail: '9 and 7.', chart: { kind: 'bars', rows: [row('c.a', 'A'), row('c.a', 'A2')] } }), /twice/);
  failsWith(ok({ evidence: ['c.a'], hero: '7', detail: '7.', chart: { kind: 'bars', rows: [row('c.a', 'A')] } }), /at least 2 rows/);
  failsWith(ok({ evidence: ['c.a', 'c.b'], hero: '9', detail: '9 and 7.', chart: { kind: 'bars', rows: [row('nope', 'A'), row('c.b', 'B')] } }), /"nope"/);
  failsWith(ok({ chart: { kind: 'pie' } as never }), /not weekly, share or bars/);
});

test('near-duplicates against active and removed insights', () => {
  failsWith(ok({}, [rec(1, 'a.week')]), /near-duplicate of active insight 1/);
  failsWith(ok({}, [], [rec(2, 'a.week', 'zzz')]), /near-duplicate of removed insight 2/);
  assert.equal(ok({}, [rec(1, 'other.fact')], [rec(2, 'another.fact')]).ok, true);
  // 1 of 2 new ids shared = 50%, allowed; 2 of 3 = 67%, not.
  const two = { evidence: ['a.week', 'a.month'], detail: '1,018 of 3,000 came in May 2026.' };
  assert.equal(ok(two, [rec(1, 'a.week')]).ok, true);
  const three = { evidence: ['c.a', 'c.b', 'c.c'], hero: '9', summary: 'Counts.', detail: '7, 9 and 3.' };
  failsWith(ok(three, [rec(1, 'c.a', 'c.b')]), /67%/);
  assert.equal(ok(three, [rec(1, 'c.a')]).ok, true);
});

test('retire is required at 6 active, must name an active one, and is refused below 6', () => {
  const six = [1, 2, 3, 4, 5, 6].map(i => rec(i, `other.${i}`));
  failsWith(ok({}, six), /retire is missing/);
  failsWith(ok({ retire: 99 }, six), /not an active insight/);
  const r = ok({ retire: 3 }, six);
  assert.equal(r.ok, true, failures(r).join(' | '));
  if (r.ok) assert.equal(r.insight.retire, 3);
  failsWith(ok({ retire: 1 }, six.slice(0, 5)), /not allowed/);
  assert.equal(ok({}, six.slice(0, 5)).ok, true);
});

test('garbage input fails cleanly instead of throwing', () => {
  assert.equal(checkProposal({} as Proposal, pack, [], []).ok, false);
  assert.equal(checkProposal({ ...base, evidence: 'a.week' as never }, pack, [], []).ok, false);
  assert.equal(checkProposal({ ...base, chart: { kind: 'bars', rows: 'x' } as never }, pack, [], []).ok, false);
  assert.equal(checkProposal({ ...base, summary: 5 as never }, pack, [], []).ok, false);
});

test('referrer families', () => {
  const f = referrerFamily;
  assert.equal(f('linkedin.com'), 'LinkedIn');
  assert.equal(f('www.linkedin.com'), 'LinkedIn');
  assert.equal(f('com.linkedin.android'), 'LinkedIn');
  assert.equal(f('lnkd.in'), 'LinkedIn');
  assert.equal(f('web.yammer.com'), 'Viva Engage');
  assert.equal(f('engage.cloud.microsoft'), 'Viva Engage');
  assert.equal(f('teams.microsoft.com'), 'Teams / Outlook');
  assert.equal(f('statics.teams.cdn.office.net'), 'Teams / Outlook');
  assert.equal(f('outlook.live.com'), 'Teams / Outlook');
  assert.equal(f('google.com'), 'Search');
  assert.equal(f('www.google.dk'), 'Search');
  assert.equal(f('android-app://com.google.android.googlequicksearchbox'), 'Search');
  assert.equal(f('duckduckgo.com'), 'Search');
  assert.equal(f('chatgpt.com'), 'AI assistants');
  assert.equal(f('gemini.google.com'), 'AI assistants');   // not Search, although it is a google host
  assert.equal(f('copilot.microsoft.com'), 'AI assistants');
  assert.equal(f('perplexity.ai'), 'AI assistants');
  assert.equal(f('t.co'), 'Other social');
  assert.equal(f('l.facebook.com'), 'Other social');
  assert.equal(f('EMPTY'), 'No referrer');
  assert.equal(f('(none)'), 'No referrer');
  assert.equal(f(''), 'No referrer');
  assert.equal(f('example.org'), 'Other sites');
  assert.equal(aiAssistantName('www.chatgpt.com'), 'chatgpt.com');
  assert.equal(aiAssistantName('example.org'), null);
});

test('browser, language and slug helpers', () => {
  assert.equal(browserFamily('Edge 148'), 'Edge');
  assert.equal(browserFamily('Chrome Mobile 141.0.1'), 'Chrome Mobile');
  assert.equal(browserFamily('Safari'), 'Safari');
  assert.equal(browserFamily(''), 'Unknown');
  assert.equal(languageName('en-GB'), 'English');
  assert.equal(languageName('English'), 'English');
  assert.equal(languageName('da'), 'Danish');
  assert.equal(slug('Ecommerce & Retail Tech'), 'ecommerce-retail-tech');
  assert.equal(slug('/'), 'home');
  assert.equal(slug('/digest/some-slug'), 'digest-some-slug');
});

test('dead-click element text maps to the English topic name in any locale', () => {
  assert.equal(topicName('Ecommerce & Retail Tech Digital commerce, retail innovation, DTC trends'), 'Ecommerce & Retail Tech');
  assert.equal(topicName('Mode & Luksus'), 'Fashion & Luxury');
  assert.equal(topicName('Mode & Luksus Luksusmærker, forbruger tendenser, mode'), 'Fashion & Luxury');
  assert.equal(topicName('Moda y Lujo'), 'Fashion & Luxury');
  assert.equal(topicName('Smykkeindustrien'), 'Jewellery Industry');
  assert.equal(topicName('Artificial Intelligence News'), 'Artificial Intelligence News');
  assert.equal(topicName('Subscribe'), null);
  assert.equal(topicName(''), null);
});

test('the model reply is parsed strictly', () => {
  assert.deepEqual(parseDecision('{"decision":"none","reason":"Nothing new."}'), { decision: 'none', reason: 'Nothing new.' });
  const add = parseDecision('```json ' + JSON.stringify({ decision: 'add', reason: 'r', retire: 3, insight: { eyebrow: 'a', hero: 'b', unit: 'c', summary: 'd', detail: 'e', evidence: ['x'] } }) + ' ```');
  assert.equal(add.decision, 'add');
  assert.equal(add.retire, 3);
  assert.throws(() => parseDecision('not json'), /not JSON/);
  assert.throws(() => parseDecision('{"decision":"maybe","reason":"r"}'), /decision/);
  assert.throws(() => parseDecision('{"decision":"add","reason":"r"}'), /no insight/);
  assert.throws(() => parseDecision('{"decision":"add","reason":"r","retire":"x","insight":{}}'), /retire/);
});
