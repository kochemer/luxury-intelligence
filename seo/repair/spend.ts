/**
 * Spend ledger for the repair agent.
 *
 * Two layers, because they fail differently:
 *
 *   • `--max-budget-usd` on the CLI is the hard per-run cap. Enforced by Claude
 *     Code itself, so it holds even if everything in this repo is wrong.
 *   • This ledger is the rolling 30-day cap. The per-run flag cannot see across
 *     invocations, so it would happily allow the same $2 every day forever.
 *
 * Costs come from the CLI's own `total_cost_usd`, which is a client-side
 * estimate and can differ from the invoice — treat it as a control signal, not
 * as accounting. The real backstop is a spend limit set in the Anthropic
 * Console, which nothing here can bypass.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { REPAIR_MONTHLY_BUDGET_USD } from '../config';

const SPEND_PATH = path.join(process.cwd(), 'data', 'seo', 'repair-spend.json');
const WINDOW_DAYS = 30;

export interface SpendEntry {
  atISO: string;
  costUsd: number;
  findingCode: string;
  outcome: string;
  model: string;
}

interface SpendLedger {
  version: 1;
  entries: SpendEntry[];
}

const EMPTY: SpendLedger = { version: 1, entries: [] };

async function read(): Promise<SpendLedger> {
  try {
    const parsed = JSON.parse(await fs.readFile(SPEND_PATH, 'utf-8')) as SpendLedger;
    return Array.isArray(parsed.entries) ? parsed : { ...EMPTY };
  } catch {
    return { ...EMPTY };
  }
}

/** Total spend inside the rolling window. */
export async function spentInWindow(): Promise<number> {
  const { entries } = await read();
  const cutoff = Date.now() - WINDOW_DAYS * 86_400_000;

  return entries
    .filter(e => new Date(e.atISO).getTime() >= cutoff)
    .reduce((sum, e) => sum + (Number.isFinite(e.costUsd) ? e.costUsd : 0), 0);
}

export interface BudgetCheck {
  allowed: boolean;
  spent: number;
  remaining: number;
  reason?: string;
}

/**
 * Checked before an agent is invoked, never after — the point is to not spend
 * the money, not to notice having spent it.
 */
export async function checkBudget(): Promise<BudgetCheck> {
  const spent = await spentInWindow();
  const remaining = REPAIR_MONTHLY_BUDGET_USD - spent;

  if (remaining <= 0) {
    return {
      allowed: false,
      spent,
      remaining: 0,
      reason:
        `Repair is paused: $${spent.toFixed(2)} spent in the last ${WINDOW_DAYS} days, ` +
        `against a $${REPAIR_MONTHLY_BUDGET_USD} cap. Detection, alerting and rollback are ` +
        `unaffected — only the agent that writes fixes is held back. Raise ` +
        `REPAIR_MONTHLY_BUDGET_USD in seo/config.ts, or wait for older spend to age out ` +
        `of the window.`,
    };
  }

  return { allowed: true, spent, remaining };
}

export async function recordSpend(entry: SpendEntry): Promise<void> {
  const ledger = await read();
  ledger.entries.push(entry);

  // Keep a little history beyond the window so a spend question can be answered
  // after the fact, but do not let the file grow without bound.
  const cutoff = Date.now() - WINDOW_DAYS * 3 * 86_400_000;
  ledger.entries = ledger.entries.filter(e => new Date(e.atISO).getTime() >= cutoff);

  await fs.mkdir(path.dirname(SPEND_PATH), { recursive: true });
  await fs.writeFile(SPEND_PATH, JSON.stringify(ledger, null, 2), 'utf-8');
}

export { SPEND_PATH, WINDOW_DAYS };
