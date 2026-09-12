/**
 * Finding construction — one implementation, used by every auditor.
 *
 * This was previously copied into all five audit modules. They happened to be
 * identical, but that is a property nothing enforced, and the id is
 * load-bearing: `buildReport` matches findings across weeks by id alone, so a
 * divergence in one copy's hashing would silently break week-over-week
 * tracking for that module — every finding appearing "new" forever, resolved
 * findings never closing, and the aging multiplier stuck at 1.
 *
 * That failure would be invisible. Hence one copy.
 */

import { createHash } from 'crypto';
import type { Finding } from '../types';

/**
 * A finding id, stable across runs.
 *
 * Derived from the code plus a scope (usually the URL) and nothing else — no
 * timestamps, no counts, no message text. If the id changed when the detail
 * text changed, rewording a message would present an old problem as a new one.
 */
export function findingId(code: string, scope: string): string {
  return `${code}:${createHash('sha1').update(scope).digest('hex').slice(0, 8)}`;
}

export type FindingInput =
  Omit<Finding, 'id' | 'score' | 'firstSeenWeek' | 'weeksOpen'> & { scope: string };

/**
 * Build a Finding. `score`, `firstSeenWeek` and `weeksOpen` are placeholders —
 * buildReport fills them in once it has the previous week to compare against,
 * because none of them can be known by the producer.
 */
export function makeFinding(input: FindingInput): Finding {
  const { scope, ...rest } = input;
  return {
    ...rest,
    id: findingId(rest.code, scope),
    score: 0,
    firstSeenWeek: '',
    weeksOpen: 1,
  };
}
