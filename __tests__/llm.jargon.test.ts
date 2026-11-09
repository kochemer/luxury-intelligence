import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findJargon, findStyleProblems, JARGON_TERMS } from '../lib/llm/houseStyle';

// Owner rule (2026-11-09): plain language. findJargon gates only the weekly
// take; findStyleProblems must NOT flag it (social posts and summaries use
// words like "checkout" and "ecosystem" legitimately).

test('findJargon catches every banned term', () => {
  for (const t of [
    'Agentic shopping grows.', 'An omnichannel plan.', 'DTC brands cut ads.', 'D2C sales fell.',
    'Clienteling tools help.', 'Unit economics matter.', 'A go-to-market plan.', 'The value proposition is clear.',
    'No synergy here.', 'The tech stack is old.', 'Payment rails are shifting.', 'They verticalise supply.',
    'Vertical integration is costly.', 'A wide moat.', 'The flywheel spins.', 'A headwind for sales.',
    'Tailwinds help.', 'The playbook changed.', 'Every touchpoint counts.', 'Less friction at checkout.',
    'They monetise data.', 'A scalable model.', 'Operationalise the plan.', 'The north star metric.',
    'Low-hanging fruit first.', 'They double down on AI.', 'It is table stakes now.', 'The customer journey is long.',
    'A fragile ecosystem.',
  ]) assert.ok(findJargon(t).length > 0, t);
  assert.ok(JARGON_TERMS.length >= 28);
});

test('findJargon uses word boundaries and ignores plain text', () => {
  for (const t of [
    'Walmart rolled out a new checkout in 400 stores.',
    'The railway company placed a stackable pallet order.',
    'Cartier sold more watches in the US.',
    'A tailor in Milan makes suits.',
  ]) assert.deepEqual(findJargon(t), [], t);
});

test('findStyleProblems does not flag jargon', () => {
  assert.deepEqual(findStyleProblems('Brands want less friction in the checkout and a stronger ecosystem.'), []);
});
