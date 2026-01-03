import { DateTime } from 'luxon';

/**
 * Format ISO date string to YYYY-MM-DD format
 * Used for consistent date display across pages
 */
export function formatDate(isoString: string): string {
  return DateTime.fromISO(isoString).toFormat('yyyy-MM-dd');
}

