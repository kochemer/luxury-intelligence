import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml, randomiseOrder, mapWinner, combineVerdicts, aggregateCategory, bestText, formatList, parseJudgement, tally, seededRandom,
} from '../scripts/selectionCompare';

test('escapeHtml escapes markup and quotes', () => {
  assert.equal(escapeHtml(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  assert.equal(escapeHtml(undefined), '');
});

test('randomiseOrder is deterministic and the second call swaps the first', () => {
  const o = randomiseOrder('2026-W45:x');
  assert.deepEqual(o, randomiseOrder('2026-W45:x'));
  assert.deepEqual([...o.second].reverse(), [...o.first]);
  const firsts = new Set(Array.from({ length: 40 }, (_, i) => randomiseOrder(`s${i}`).first[0]));
  assert.equal(firsts.size, 2);
  const r = seededRandom(1);
  assert.ok(r() >= 0 && r() < 1);
});

test('mapWinner and combineVerdicts', () => {
  assert.equal(mapWinner('1', 'B', 'A'), 'B');
  assert.equal(mapWinner('2', 'B', 'A'), 'A');
  assert.equal(mapWinner('tie', 'A', 'B'), 'tie');
  assert.equal(combineVerdicts('A', 'A'), 'A');
  assert.equal(combineVerdicts('A', 'B'), 'tie');
  assert.equal(combineVerdicts('A', null), 'tie');
});

const raw = (winner: any, margin: any, top5: any) => ({ winner, margin, top5_better: top5, problems_list1: [], problems_list2: [], reasoning: '' });

test('aggregateCategory maps back to A/B across swapped calls', () => {
  const agg = aggregateCategory([
    { list1: 'A', list2: 'B', raw: raw('2', 'strong', '2') },
    { list1: 'B', list2: 'A', raw: raw('1', 'clear', 'tie') },
  ]);
  assert.equal(agg.winner, 'B');
  assert.equal(agg.margin, 'clear');
  assert.equal(agg.top5Better, 'tie');
  const pos = aggregateCategory([
    { list1: 'A', list2: 'B', raw: raw('1', 'strong', '1') },
    { list1: 'B', list2: 'A', raw: raw('1', 'strong', '1') },
  ]);
  assert.equal(pos.winner, 'tie');
  assert.equal(pos.margin, null);
});

test('tally counts verdicts', () => {
  assert.deepEqual(tally(['A', 'B', 'A', 'tie']), { A: 2, B: 1, tie: 1 });
});

test('judge list text hides selection metadata and truncates', () => {
  const items: any[] = [
    { title: 'T', source: 'S', url: 'u', snippet: 'x'.repeat(600), aiSummary: '', selection: { tier: 'lead', editorWhy: 'SECRET' } },
    { title: 'T2', source: 'S2', url: 'u2', aiSummary: 'sum', snippet: 'snip' },
  ];
  assert.ok(bestText(items[0]).length <= 400);
  assert.equal(bestText(items[1]), 'sum');
  const out = formatList(items);
  assert.ok(!out.includes('SECRET') && !out.includes('lead'));
  assert.ok(out.startsWith('1. T'));
});

test('parseJudgement tolerates surrounding prose', () => {
  const j = parseJudgement('here: {"winner":"2","margin":"clear","top5_better":"1","problems_list1":["a"],"problems_list2":[],"reasoning":"r"} done');
  assert.equal(j.winner, '2');
  assert.deepEqual(j.problems_list1, ['a']);
  assert.throws(() => parseJudgement('nope'));
});
