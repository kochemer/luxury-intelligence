import { DateTime } from 'luxon';

/**
 * Digest windows are Copenhagen weeks (Mon 00:00 – Sun 23:59 local), stored
 * as UTC ISO strings. Parse in this zone, never the server's: on Vercel (UTC)
 * a W41 start of 2026-10-04T22:00Z otherwise prints as "Oct 4", a Sunday.
 */
export const DIGEST_TZ = 'Europe/Copenhagen';

/** Parse an ISO timestamp in the digest's timezone. */
export function digestDate(isoString: string): DateTime {
  return DateTime.fromISO(isoString, { zone: DIGEST_TZ });
}

/**
 * Format ISO date string to YYYY-MM-DD format
 * Used for consistent date display across pages
 */
export function formatDate(isoString: string): string {
  return digestDate(isoString).toFormat('yyyy-MM-dd');
}

/**
 * Format date range to "Jan 5-11th 2026" format
 */
export function formatDateRange(startISO: string, endISO: string): string {
  const start = digestDate(startISO);
  const end = digestDate(endISO);
  
  // If same month and year
  if (start.month === end.month && start.year === end.year) {
    const startDay = start.day;
    const endDay = end.day;
    const month = start.toFormat('MMM');
    const year = start.year;
    
    // Add ordinal suffix to end day
    const getOrdinal = (n: number) => {
      const s = ['th', 'st', 'nd', 'rd'];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };
    
    return `${month} ${startDay}-${getOrdinal(endDay)} ${year}`;
  }
  
  // Different months - fallback to full format
  return `${start.toFormat('MMM d')} - ${end.toFormat('MMM d, yyyy')}`;
}

/**
 * Format time to HH:mm (hours and minutes only, no seconds)
 */
export function formatTime(isoString: string): string {
  return digestDate(isoString).toFormat('HH:mm');
}

/**
 * Format date and time to "Jan 9, 2026 17:26" format
 */
export function formatDateTime(isoString: string): string {
  return digestDate(isoString).toFormat('MMM d, yyyy HH:mm');
}

/**
 * Format issue line for magazine hero: "Issue W10 · March 2026"
 * weekLabel: "2026-W10", startISO optional (uses first day of that ISO week if omitted)
 */
export function formatIssueLine(weekLabel: string, startISO?: string): string {
  const issuePart = weekLabel.includes('-') ? weekLabel.split('-')[1] : weekLabel; // e.g. "W10"
  const monthYear = startISO
    ? digestDate(startISO).toFormat('MMMM yyyy')
    : (() => {
        const [y, w] = weekLabel.split('-');
        const weekNum = parseInt(w?.replace(/^W/i, '') || '1', 10);
        const year = parseInt(y || String(DateTime.now().year), 10);
        return DateTime.fromObject({ weekYear: year, weekNumber: weekNum }).toFormat('MMMM yyyy');
      })();
  return `Issue ${issuePart} · ${monthYear}`;
}

/**
 * Hero dateline: "11 OCTOBER 2026". Uses the build time (when the issue went
 * out), not startISO, which is the Monday the coverage window opens.
 */
export function formatPublishedDate(digest: { builtAtISO?: string; endISO?: string; startISO?: string }): string | null {
  const iso = digest.builtAtISO ?? digest.endISO ?? digest.startISO;
  return iso ? digestDate(iso).toFormat('dd MMMM yyyy').toUpperCase() : null;
}
