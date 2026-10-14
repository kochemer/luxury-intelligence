/**
 * The weekly posting calendar and its clock arithmetic.
 *
 * Times are Copenhagen wall-clock, so a slot stays at 10:00 local across the
 * summer/winter switch. Converting through luxon's zone handling (not a fixed
 * +1/+2 offset) is what keeps that true; see __tests__/social.test.ts.
 */

import { DateTime } from 'luxon';
import type { SocialChannel, Weekday } from './types';

export const SOCIAL_TZ = 'Europe/Copenhagen';

export interface Slot {
  slot: string;
  channel: SocialChannel;
  day: Weekday;
  localTime: string;
}

/** Phase 1 calendar (docs/superpowers/specs/2026-10-14-social-content-plan.md). */
export const PHASE1_SLOTS: Slot[] = [
  { slot: 'linkedin-issue', channel: 'linkedin', day: 'mon', localTime: '10:00' },
  { slot: 'x-thread', channel: 'x', day: 'mon', localTime: '10:30' },
  { slot: 'x-story-tue', channel: 'x', day: 'tue', localTime: '12:00' },
  { slot: 'x-story-wed', channel: 'x', day: 'wed', localTime: '12:00' },
  { slot: 'x-story-thu', channel: 'x', day: 'thu', localTime: '12:00' },
  { slot: 'x-story-fri', channel: 'x', day: 'fri', localTime: '12:00' },
];

const DAY_OFFSET: Record<Weekday, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4 };

/**
 * The Monday the issue goes out: the day after the digest's Mon–Sun week ends.
 * `startISO` is that week's Monday 00:00 Copenhagen (stored in UTC).
 */
export function postingMonday(digestStartISO: string): DateTime {
  return DateTime.fromISO(digestStartISO, { zone: 'utc' })
    .setZone(SOCIAL_TZ)
    .startOf('day')
    .plus({ days: 7 });
}

/** UTC ISO send time for a slot in the week that starts on `monday`. */
export function dueAtFor(monday: DateTime, day: Weekday, localTime: string): string {
  const [hour, minute] = localTime.split(':').map(Number);
  return monday
    .setZone(SOCIAL_TZ)
    .plus({ days: DAY_OFFSET[day] })
    .set({ hour, minute, second: 0, millisecond: 0 })
    .toUTC()
    .toISO()!;
}

/** Copenhagen calendar date ("YYYY-MM-DD") of a UTC instant. */
export function localDate(iso: string): string {
  return DateTime.fromISO(iso, { zone: 'utc' }).setZone(SOCIAL_TZ).toISODate()!;
}
