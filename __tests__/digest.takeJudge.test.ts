import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findFiller, findTakeProblems, judgeProblems, parseJudge, TAKE_FORMATS } from '../digest/takeChecks';
import { findStyleProblems } from '../lib/llm/houseStyle';

const GOOD = { point: 'AI assistants cannot buy from sites that block them.', luxuryConsequence: true, followsFormat: true, roundUp: false, endingRestates: false };

test('a satisfied judge gives no problems', () => {
  assert.deepEqual(judgeProblems(GOOD, 'split'), []);
});

test('each judge failure maps to one problem label', () => {
  assert.equal(judgeProblems({ ...GOOD, point: null }).length, 1);
  assert.match(judgeProblems({ ...GOOD, point: null })[0], /single clear point/);
  assert.match(judgeProblems({ ...GOOD, roundUp: true })[0], /round-up/);
  assert.match(judgeProblems({ ...GOOD, luxuryConsequence: false })[0], /luxury or jewellery/);
  assert.match(judgeProblems({ ...GOOD, followsFormat: false }, 'number')[0], /"number" format/);
  assert.match(judgeProblems({ ...GOOD, endingRestates: true })[0], /restates/);
  assert.equal(judgeProblems({ point: null, luxuryConsequence: false, followsFormat: false, roundUp: true, endingRestates: true }, 'watch').length, 5);
});

test('a failed judge call is skipped silently', () => {
  assert.deepEqual(judgeProblems(null, 'split'), []);
});

test('parseJudge accepts good JSON and rejects malformed JSON', () => {
  assert.deepEqual(parseJudge(GOOD), GOOD);
  assert.equal(parseJudge({ ...GOOD, point: '  ' })!.point, null);
  assert.equal(parseJudge({ ...GOOD, point: null })!.point, null);
  assert.equal(parseJudge({ point: 'x' }), null);
  assert.equal(parseJudge({ ...GOOD, roundUp: 'no' }), null);
  assert.equal(parseJudge(null), null);
  assert.equal(parseJudge('text'), null);
});

test('format descriptions carry the tightened rules', () => {
  const d = Object.fromEntries(TAKE_FORMATS.map(f => [f.id, f.description]));
  assert.match(d['number'], /single figure/);
  assert.match(d['open-question'], /first or second sentence/);
  assert.match(d['connection'], /first paragraph/);
  assert.match(d['split'], /first paragraph/);
  assert.match(d['what-changed'], /before and the after/);
  assert.match(d['watch'], /first paragraph/);
});

test('filler check flags empty linking words, only in the take checks', () => {
  for (const t of ['Kroger’s work concerns advertising.', 'Both developments matter.', 'Account access is changing too.', 'Firms are also finding new uses.']) {
    assert.ok(findFiller(t).length, t);
    assert.ok(findTakeProblems(t).some(p => p.includes('filler')), t);
    assert.ok(!findStyleProblems(t).some(p => p.includes('filler')), t);
  }
  assert.deepEqual(findFiller('Amazon blocked Meta. Shopify let it in.'), []);
});
