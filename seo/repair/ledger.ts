/**
 * Repair attempt history — the circuit breaker.
 *
 * Without this, a finding the agent cannot actually fix would be retried every
 * single day forever: burning time, opening near-identical pull requests, and
 * training you to ignore them. After MAX_ATTEMPTS_PER_FINDING failures the
 * finding is escalated to a human and never attempted again unless the record
 * is cleared.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { MAX_ATTEMPTS_PER_FINDING } from './policy';

const LEDGER_PATH = path.join(process.cwd(), 'data', 'seo', 'repair-ledger.json');

export interface RepairAttempt {
  findingId: string;
  code: string;
  url?: string;
  attemptedAtISO: string;
  outcome: 'shipped' | 'rejected' | 'agent-failed';
  /** Which verification gate failed, when the outcome was a rejection. */
  failedGate?: string;
  detail: string;
  branch?: string;
  prUrl?: string;
  filesChanged?: string[];
}

export interface RepairLedger {
  version: 1;
  attempts: RepairAttempt[];
}

const EMPTY: RepairLedger = { version: 1, attempts: [] };

export async function readLedger(): Promise<RepairLedger> {
  try {
    const raw = await fs.readFile(LEDGER_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as RepairLedger;
    if (!Array.isArray(parsed.attempts)) return { ...EMPTY };
    return parsed;
  } catch {
    return { ...EMPTY };
  }
}

export async function appendAttempt(attempt: RepairAttempt): Promise<void> {
  const ledger = await readLedger();
  ledger.attempts.push(attempt);
  await fs.mkdir(path.dirname(LEDGER_PATH), { recursive: true });
  await fs.writeFile(LEDGER_PATH, JSON.stringify(ledger, null, 2), 'utf-8');
}

/** Failed attempts for a finding since the last successful repair of it. */
export function failureCount(ledger: RepairLedger, findingId: string): number {
  const relevant = ledger.attempts.filter(a => a.findingId === findingId);
  const lastShipped = relevant.map(a => a.outcome).lastIndexOf('shipped');
  return relevant.slice(lastShipped + 1).filter(a => a.outcome !== 'shipped').length;
}

export function isCircuitOpen(ledger: RepairLedger, findingId: string): boolean {
  return failureCount(ledger, findingId) >= MAX_ATTEMPTS_PER_FINDING;
}

export { LEDGER_PATH };
