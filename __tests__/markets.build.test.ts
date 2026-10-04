/**
 * The checks between the model's output and a public page, plus the pure
 * parts of the Markets build. No network, no API calls.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { acceptHeadline, parseClassification } from '../markets/classifyMoves';
import { validateSummary } from '../markets/summary';
import { dedupe, splitNewsTitle, candidateKey, type Candidate } from '../markets/candidates';
import { toMarketPrice } from '../markets/prices';
import type { MarketMove } from '../lib/markets/types';

const cand = (over: Partial<Candidate> = {}): Candidate => ({
  key: 'k1', brand: 'Signet', title: 'Signet reports a 2.4% fall in same-store sales', snippet: '',
  source: 'Jeweller', url: 'https://x.test/a', date: '2026-09-14', origin: 'own', ...over,
});

// ── Classification ──────────────────────────────────────────────────────────

test('a restatement is used only if it names the brand and adds no numbers', () => {
  const c = cand();
  assert.equal(acceptHeadline('Signet same-store sales fall 2.4%', c), 'Signet same-store sales fall 2.4%');
  assert.equal(acceptHeadline('Same-store sales fall 2.4%', c), null, 'must name the brand');
  assert.equal(acceptHeadline('Signet sales fall 3.1%', c), null, 'a number not in the original is invented');
  assert.equal(acceptHeadline('Signet', c), null, 'too short to say anything');
  assert.equal(acceptHeadline(42, c), null);
});

test('an unknown move type is not a move', () => {
  const c = cand();
  assert.deepEqual(parseClassification({ isMove: true, type: 'Rumour', headline: 'Signet x' }, c),
    { isMove: false, type: null, importance: 'minor', headline: null });
  const ok = parseClassification({ isMove: true, type: 'Results', headline: 'Signet same-store sales fall 2.4%' }, c);
  assert.equal(ok.isMove, true);
  assert.equal(ok.type, 'Results');
});

test('"not a move" carries no type or headline', () => {
  assert.deepEqual(parseClassification({ isMove: false, type: 'Results', headline: 'Signet...' }, cand()),
    { isMove: false, type: null, importance: 'minor', headline: null });
});

// ── Summary ─────────────────────────────────────────────────────────────────

const move = (brand: string, originalTitle: string): MarketMove => ({
  date: '2026-09-14', brand, type: 'Results', importance: 'major', outlets: 1, headline: originalTitle, originalTitle, source: 's', url: 'u',
});
const MOVES = [move('Signet', 'Modest sales slide for diamond jewellery retail giant'),
  move('De Beers', 'Rapid network expansion planned for Forevermark'),
  move('Pandora', 'Pandora expands manufacturing capacity by 50% with Vietnam facility')];

test('a valid summary passes', () => {
  const v = validateSummary([
    'Signet reported a modest sales slide.',
    'Pandora is expanding manufacturing capacity by 50% in Vietnam, and De Beers plans a rapid Forevermark expansion.',
  ], MOVES);
  assert.equal(v.ok, true);
});

test('a summary with an invented number, no brand, or hype is rejected', () => {
  assert.equal(validateSummary(['Signet sales fell 7%.', 'De Beers plans a rapid expansion of Forevermark.'], MOVES).ok, false, 'invented number');
  assert.equal(validateSummary(['Jewellery had a busy week overall.', 'De Beers plans a rapid expansion of Forevermark.'], MOVES).ok, false, 'no brand named');
  assert.equal(validateSummary(['Signet had a huge week!', 'De Beers plans a rapid expansion of Forevermark.'], MOVES).ok, false, 'exclamation');
  assert.equal(validateSummary(['Signet reported a modest sales slide.'], MOVES).ok, true, 'one sentence is enough');
  assert.equal(validateSummary([], MOVES).ok, false, 'no sentences');
});

// ── Candidates ──────────────────────────────────────────────────────────────

test('near-identical headlines for the same brand collapse to the earliest', () => {
  const items = [
    cand({ key: 'b', title: 'Kay Jewelers launches biggest rebrand in company history', date: '2026-09-12' }),
    cand({ key: 'a', title: 'Kay Jewelers launches the biggest rebrand in its company history', date: '2026-09-11' }),
    cand({ key: 'c', title: 'Signet appoints new finance chief', date: '2026-09-12' }),
    cand({ key: 'd', brand: 'Pandora', title: 'Kay Jewelers launches biggest rebrand in company history', date: '2026-09-12' }),
  ];
  const kept = dedupe(items).map(i => i.key).sort();
  assert.deepEqual(kept, ['a', 'c', 'd'], 'same brand duplicates collapse; other brands are kept');
});

test('Google News titles are split into headline and publisher', () => {
  assert.deepEqual(splitNewsTitle('Mejuri opens London store - Retail Gazette'), { title: 'Mejuri opens London store', source: 'Retail Gazette' });
  assert.deepEqual(splitNewsTitle('No publisher here'), { title: 'No publisher here', source: 'Google News' });
});

test('candidate keys are stable and brand-specific', () => {
  assert.equal(candidateKey('Signet', 'u'), candidateKey('Signet', 'u'));
  assert.notEqual(candidateKey('Signet', 'u'), candidateKey('Pandora', 'u'));
});

// ── Prices ──────────────────────────────────────────────────────────────────

test('prices are rebased to 100 and changes computed from the first close', () => {
  const closes = Array.from({ length: 30 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, close: 100 + i }));
  const p = toMarketPrice('SIG', closes, 'USD')!;
  assert.equal(p.series[0], 100);
  assert.equal(p.series.at(-1), 129);
  assert.equal(Math.round(p.change3m), 29);
  assert.equal(p.company, 'Signet');
  assert.equal(p.stale, false);
  assert.equal(toMarketPrice('SIG', [{ date: '2026-09-01', close: 100 }], 'USD'), null, 'one point is not a series');
});

// ── One event, one move ─────────────────────────────────────────────────────

import { mergeEvents, latestMoveFor } from '../markets/moves';

const mv = (o: Partial<MarketMove>): MarketMove => ({
  date: '2026-09-15', brand: 'Rolex', type: 'Collection', importance: 'minor', outlets: 1,
  headline: 'x', originalTitle: 'x', source: 's', url: 'u', ...o,
});

test('the same event from several outlets becomes one move with an outlet count', () => {
  // The four Padellone reports from the first real build.
  const merged = mergeEvents([
    mv({ date: '2026-09-15', headline: 'Rolex unveiled Perpetual Padellone annual calendar watches', source: 'A Blog to Watch' }),
    mv({ date: '2026-09-15', headline: 'Rolex announced new Perpetual Padellone watch', source: 'Watchonista' }),
    mv({ date: '2026-09-16', headline: 'Rolex introduced the Perpetual Padellone annual calendar', source: 'SJX', importance: 'major' }),
    mv({ date: '2026-09-19', headline: 'Rolex announced an annual calendar watch', source: 'Time and Tide' }),
    mv({ date: '2026-09-29', type: 'Deal', headline: 'Rolex Daytona sold at charity auction' }),
  ]);
  const padellone = merged.filter(m => m.type === 'Collection');
  assert.equal(padellone.length, 1, 'one launch, not four');
  assert.equal(padellone[0]!.outlets, 4);
  assert.equal(padellone[0]!.importance, 'major', 'any outlet calling it major makes it major');
  assert.equal(padellone[0]!.date, '2026-09-15', 'the earliest report is kept');
  assert.equal(merged.length, 2, 'a different event is not merged');
});

test('different events are not merged, even for the same brand and type', () => {
  const merged = mergeEvents([
    mv({ type: 'Leadership', headline: 'Burberry appoints Dafydd Moore as VP of business technology' }),
    mv({ type: 'Leadership', headline: 'Burberry names new chief financial officer Kate Ferry' }),
  ]);
  assert.equal(merged.length, 2);
});

test('a brand’s headline move prefers its latest major move', () => {
  const moves = [
    mv({ brand: 'Pandora', date: '2026-10-03', headline: 'Pandora released Winnie the Pooh charms' }),
    mv({ brand: 'Pandora', date: '2026-10-02', headline: 'Pandora opened manufacturing facility in Vietnam', importance: 'major' }),
  ];
  assert.match(latestMoveFor('Pandora', moves)!.headline, /Vietnam/);
  assert.equal(latestMoveFor('Mejuri', moves), null);
});

test('reports of one deal sharing only a name are merged; unrelated same-day moves are not', () => {
  const merged = mergeEvents([
    mv({ brand: 'De Beers', type: 'Deal', date: '2026-10-01', headline: 'De Beers acquires 49% stake in Gahcho Kué from Mountain Province' }),
    mv({ brand: 'De Beers', type: 'Deal', date: '2026-10-01', headline: 'De Beers to take full ownership of Gahcho Kué diamond mine' }),
    mv({ brand: 'De Beers', type: 'Deal', date: '2026-10-02', headline: 'De Beers agrees Gahcho Kué deal on closure liabilities' }),
    mv({ brand: 'De Beers', type: 'Collection', date: '2026-10-02', headline: 'De Beers launches Vibrations collection' }),
  ]);
  assert.equal(merged.filter(m => m.type === 'Deal').length, 1);
  assert.equal(merged.find(m => m.type === 'Deal')!.outlets, 3);
  assert.equal(merged.length, 2);
  const seasons = mergeEvents([
    mv({ brand: 'Dior', date: '2026-10-02', headline: 'Dior presents Summer 2027 menswear in Paris' }),
    mv({ brand: 'Dior', date: '2026-10-02', headline: 'Dior shows Summer 2027 high jewellery in Paris' }),
  ]);
  assert.equal(seasons.length, 2, 'a season or city is not a shared event');
});
