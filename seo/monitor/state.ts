/**
 * Monitor state — what was already broken last time we looked.
 *
 * Without this the monitor would email the same problem every single day
 * until fixed, which is the fastest way to train someone to ignore it. Alerts
 * fire on transitions: newly broken, and recovered.
 */

import { promises as fs } from 'fs';
import path from 'path';

const STATE_PATH = path.join(process.cwd(), 'data', 'seo', 'monitor-state.json');

export interface MonitorState {
  version: 1;
  lastCheckedISO: string;
  /** Finding ids that were failing at the last check. */
  openProblemIds: string[];
  /** ISO timestamp of the last alert actually sent, for rate-limiting. */
  lastAlertISO?: string;
  consecutiveHealthyRuns: number;
}

const EMPTY_STATE: MonitorState = {
  version: 1,
  lastCheckedISO: '',
  openProblemIds: [],
  consecutiveHealthyRuns: 0,
};

export async function readState(): Promise<MonitorState> {
  try {
    const raw = await fs.readFile(STATE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as MonitorState;
    // Defend against a truncated or hand-edited file rather than crashing the
    // monitor — a broken state file must not mean no monitoring.
    if (!Array.isArray(parsed.openProblemIds)) return { ...EMPTY_STATE };
    return parsed;
  } catch {
    return { ...EMPTY_STATE };
  }
}

export async function writeState(state: MonitorState): Promise<void> {
  await fs.mkdir(path.dirname(STATE_PATH), { recursive: true });
  await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
}

export { STATE_PATH };
