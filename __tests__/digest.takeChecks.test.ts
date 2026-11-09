import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TAKE_FORMATS,
  allowedFormats,
  findBannedPhrases,
  findPronouns,
  findTakeProblems,
  formatProblem,
  isTakeFormat,
  readability,
  repeatsOpening,
  MAX_FK_GRADE,
} from '../digest/takeChecks';
import { buildEditorialTakePrompt, excludedFormatsFrom } from '../digest/generateEditorialTake';

const EXAMPLE = `TikTok and Walmart both want shoppers to buy without leaving their apps. TikTok launched a separate Shop app with its own deals and checkout. Walmart's assistant, Sparky, can now recognise products from a photo and fill a shopping cart.

Palace went the other way. Its Burberry collection is sold only in its stores.

The two paths trade off differently for luxury brands. Selling inside an app reaches more shoppers, but the app owns the checkout. Selling only in stores keeps the buyer close, but fewer people find the product.`;

// An old-style take (first person, advice, jargon-free but dense), as W45 was.
const OLD_STYLE = `I think luxury brands should treat platform checkout as a margin decision before treating it as a growth opportunity. The risk is paying for access to demand while giving up the customer relationship, the data and the contribution after fees that make the sale worth having.

TikTok's separate Shop app and Walmart's Sparky photo shopping both pull the purchase inside a platform. Palace's Burberry capsule, sold only in its own stores, shows the opposite bet: control the channel, accept lower reach. Platform checkout is the strongest objection to that view, because reach is real, but it hands the platform the pricing power.

Next quarter, I would test platform sales on one non-core line and compare contribution after fees with the owned channel before expanding.`;

test('pronoun check flags I, we, you and their contractions', () => {
  assert.ok(findPronouns('I think this matters.').includes('i'));
  assert.ok(findPronouns('Your store is next.').includes('your'));
  assert.ok(findPronouns('We should wait.').includes('we'));
  assert.ok(findPronouns("I'm sure. We're ready. You'll see.").length >= 3);
  assert.ok(findPronouns('It tells us little.').includes('us'));
  assert.ok(findPronouns('Their plan helps me.').includes('me'));
});

test('pronoun check does not flag the US or plain text', () => {
  assert.deepEqual(findPronouns('US retailers and the US market grew. Amazon sold more.'), []);
  assert.deepEqual(findPronouns(EXAMPLE), []);
});

test('banned phrases are caught', () => {
  assert.ok(findBannedPhrases('Next quarter, test it.').length);
  assert.ok(findBannedPhrases('That is the strongest objection.').length);
  assert.ok(findBannedPhrases('I think so.').length);
  assert.ok(findBannedPhrases('I would test it.').length);
  for (const t of ['Brands should wait.', 'Retailers must adapt.', 'Jewellers need to react.', 'Luxury should pause.', 'Teams need to test.']) {
    assert.ok(findBannedPhrases(t).length, t);
  }
  assert.deepEqual(findBannedPhrases('Brands sold more. Nobody should be surprised.'), []);
});

test('repeated opening compares the first three words, ignoring case and punctuation', () => {
  const prev = ['I think luxury brands win.', 'Walmart, the retailer, said so.'];
  assert.ok(repeatsOpening('I think, luxury brands fail.', prev));
  assert.ok(repeatsOpening('WALMART the retailer grew.', prev));
  assert.ok(!repeatsOpening('TikTok and Walmart both want shoppers.', prev));
  assert.ok(!repeatsOpening('Anything at all here', []));
});

test('format list, exclusion and validation', () => {
  assert.equal(TAKE_FORMATS.length, 6);
  assert.ok(isTakeFormat('split'));
  assert.ok(!isTakeFormat('thesis'));
  assert.deepEqual(allowedFormats(['split', 'watch']).sort(), ['connection', 'number', 'open-question', 'what-changed']);
  assert.equal(allowedFormats([]).length, 6);
  assert.equal(formatProblem('split', ['number']), null);
  assert.match(formatProblem('split', ['split'])!, /previous 2 weeks/);
  assert.match(formatProblem('essay', [])!, /unknown/);
  assert.match(formatProblem(undefined, [])!, /unknown/);
});

test('only the last 2 formats are excluded and the prompt omits them', () => {
  const history = [
    { weekLabel: '2026-W43', text: 'A.', format: 'connection' },
    { weekLabel: '2026-W44', text: 'B.', format: 'number' },
    { weekLabel: '2026-W45', text: 'C.', format: 'split' },
  ];
  assert.deepEqual(excludedFormatsFrom(history), ['number', 'split']);
  const digest = { weekLabel: '2026-W46', topics: {} } as never;
  const prompt = buildEditorialTakePrompt(digest, history);
  assert.ok(prompt.includes('- connection:'));
  assert.ok(!prompt.includes('- split:'));
  assert.ok(!prompt.includes('- number:'));
  assert.ok(prompt.includes('Not allowed this week'));
});

test('readability: the target example passes, an old-style take fails', () => {
  const ex = readability(EXAMPLE);
  assert.ok(ex.grade <= MAX_FK_GRADE - 2, `example grade ${ex.grade}`);
  assert.ok(ex.avgSentenceWords < 15);
  const old = readability(OLD_STYLE);
  assert.ok(old.grade > MAX_FK_GRADE, `old grade ${old.grade}`);
  assert.deepEqual(findTakeProblems(EXAMPLE), []);
  assert.ok(findTakeProblems(OLD_STYLE).length >= 4);
});

test('decimals in numbers do not split sentences', () => {
  assert.equal(readability('OpenAI earned $5.7 billion in sales. It spent more.').sentences, 2);
});

test('findTakeProblems reports jargon and repeated openings', () => {
  assert.ok(findTakeProblems('Walmart bets on agentic shopping. It sells more.').some(p => p.includes('jargon')));
  assert.ok(findTakeProblems('TikTok and Walmart sell more. Shops grow.', [EXAMPLE]).some(p => p.includes('same first three words')));
});
