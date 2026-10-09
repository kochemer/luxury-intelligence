import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findStyleProblems, stripDashes } from '../lib/llm/houseStyle';

// Owner rule (2026-10-09): no AI-isms in anything readers see. These pin what
// the code check catches, using real model output from W37-W40 test runs.

test('false contrasts are caught in their usual shapes', () => {
  for (const t of [
    "Luxury isn't growing. It's just getting more expensive.",
    "Luxury collaborations aren't dead. Rich shoppers are just done paying for two logos.",
    "Making people work to buy isn't luxury; it's bad service.",
    'This is not just a pricing story, but a brand story.',
    'The advantage is making the premium clear to agents, not simply letting them in.',
  ]) assert.ok(findStyleProblems(t).some(p => p.startsWith('false contrast')), t);
});

test('stock words, inflated significance, trailing -ing and vague sources are caught', () => {
  assert.ok(findStyleProblems('Brands must navigate a shifting market.').length);
  assert.ok(findStyleProblems('The deal plays a crucial role in its strategy.').length);
  assert.ok(findStyleProblems('Sales rose 4%, highlighting strong demand.').length);
  assert.ok(findStyleProblems('Experts say demand will return.').length);
  assert.ok(findStyleProblems("Here's the thing: nobody asked.").length);
});

test('plain news sentences and ordinary negations pass', () => {
  for (const t of [
    "Richemont's jewellery maisons grew sales 11% in Q1 as Cartier demand offset a 7% drop in watches.",
    "Oracle's AI boom runs on $125 billion of debt. Growth isn't the same as strength.",
    "The brand isn't commenting. Shares fell 3% on Monday.",
    'Amazon just shut the door on AI shoppers. Every big retailer will follow.',
  ]) assert.deepEqual(findStyleProblems(t), [], t);
});

test('stripDashes turns dashes into commas and keeps number ranges', () => {
  assert.equal(stripDashes('Sales rose 2024–2025 — mostly in Asia — while costs fell'),
    'Sales rose 2024-2025, mostly in Asia, while costs fell');
});
