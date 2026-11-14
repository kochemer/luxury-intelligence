import { promises as fs } from 'fs';
import path from 'path';
import type { YearReview } from './types';

export const REVIEW_YEAR = 2026;

/**
 * False until launch: the review pages are noindex and out of the sitemap and
 * the menus, so a merge can be checked on production before anyone is sent
 * there. Launch steps are in docs/year-review.md.
 */
export const REVIEW_LIVE = false;

/** The built year in review, or null if the build hasn't run. */
export async function loadYearReview(year = REVIEW_YEAR): Promise<YearReview | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(process.cwd(), 'data', 'review', `${year}.json`), 'utf-8')) as YearReview;
  } catch {
    return null;
  }
}

/** "2 March" / "8 November 2026" from a YYYY-MM-DD date, in UTC. */
export function reviewDate(iso: string, withYear = false): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: withYear ? 'numeric' : undefined, timeZone: 'UTC' });
}

/** The last day counted: the window's end is exclusive. */
export function lastDay(endISO: string): string {
  return new Date(new Date(`${endISO}T12:00:00Z`).getTime() - 864e5).toISOString().slice(0, 10);
}
