import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quoteProblem } from '../digest/generateThemes';

// The pull-quote brief (owner, 2026-10-09): punchy, provocative, to the point,
// simple words; never about Pandora. quoteProblem enforces the parts a prompt
// alone does not hold.

test('short, plain, direct quotes pass', () => {
  for (const q of [
    'Amazon just shut the door on AI shoppers. Every big retailer will follow.',
    'A new name won\'t sell natural diamonds. A reason to want them will.',
  ]) assert.equal(quoteProblem(q), null, q);
});

test('the W40 quote the owner rejected fails on length, jargon and hedging', () => {
  assert.ok(quoteProblem('Over the next year, enterprise agents that also order meals could make workplace software a commerce gatekeeper, forcing merchants to court algorithms alongside customers.'));
  assert.match(quoteProblem('Shopping agents are the new gatekeeper.') ?? '', /jargon/);
  assert.match(quoteProblem('Shopping agents could end the store.') ?? '', /hedges/);
});

test('a false contrast is rejected (house style, lib/llm/houseStyle.ts)', () => {
  assert.match(quoteProblem("Luxury isn't growing. It's just getting more expensive.") ?? '', /false contrast/);
});

test('any mention of Pandora is rejected', () => {
  assert.match(quoteProblem('Pandora sells the feeling of being special.') ?? '', /Pandora/);
});
