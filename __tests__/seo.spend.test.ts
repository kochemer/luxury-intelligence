/**
 * Spend-cap tests.
 *
 * The per-run cap is enforced by the Claude Code CLI, so it needs no test here.
 * What does need testing is the rolling window: it is the only thing standing
 * between "a defect recurs daily" and an unbounded bill, and its failure mode
 * is silent — nobody notices a cap that never triggers until the invoice.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { REPAIR_MAX_BUDGET_USD, REPAIR_MONTHLY_BUDGET_USD, REPAIR_MODEL } from '../seo/config';
import { MAX_REPAIRS_PER_RUN } from '../seo/repair/policy';

test('the per-run cap is bounded and sane', () => {
  assert(REPAIR_MAX_BUDGET_USD > 0, 'a zero cap would block every repair');
  assert(REPAIR_MAX_BUDGET_USD <= 5,
    'a per-run cap above $5 defeats the point — one fix should never cost that much');
});

test('the rolling cap allows more than one run but bounds the month', () => {
  assert(
    REPAIR_MONTHLY_BUDGET_USD > REPAIR_MAX_BUDGET_USD,
    'the monthly cap must exceed the per-run cap, or the first run exhausts the month'
  );
  assert(
    REPAIR_MONTHLY_BUDGET_USD >= REPAIR_MAX_BUDGET_USD * 3,
    'leave room for several genuine incidents in a month'
  );
  assert(REPAIR_MONTHLY_BUDGET_USD <= 100, 'this is a pet project, not a budget line');
});

test('worst-case monthly exposure is bounded by the caps, not by hope', () => {
  // The arithmetic that actually matters: one repair per run, one run per day,
  // every run hitting the per-run cap. The rolling cap must bite well before
  // 30 days of that.
  const worstCaseUncapped = REPAIR_MAX_BUDGET_USD * MAX_REPAIRS_PER_RUN * 30;
  assert(
    REPAIR_MONTHLY_BUDGET_USD < worstCaseUncapped,
    `the rolling cap ($${REPAIR_MONTHLY_BUDGET_USD}) must be lower than 30 days of ` +
    `maximum spend ($${worstCaseUncapped}), otherwise it never triggers`
  );
});

test('the repair model is a modest one, named by alias', () => {
  // Alias rather than a pinned version, so it tracks the current generation
  // without an edit. Opus would be paying for judgement the six gates already
  // supply.
  assert.equal(REPAIR_MODEL, 'sonnet');
});

test('blast radius per run stays small', () => {
  // The caps bound cost; this bounds damage. Both matter, and neither implies
  // the other.
  assert(MAX_REPAIRS_PER_RUN <= 3, 'a single run should not sweep the repo');
});
