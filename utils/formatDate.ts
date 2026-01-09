import { DateTime } from 'luxon';

/**
 * Format ISO date string to YYYY-MM-DD format
 * Used for consistent date display across pages
 */
export function formatDate(isoString: string): string {
  return DateTime.fromISO(isoString).toFormat('yyyy-MM-dd');
}

/**
 * Format date range to "Jan 5-11th 2026" format
 */
export function formatDateRange(startISO: string, endISO: string): string {
  const start = DateTime.fromISO(startISO);
  const end = DateTime.fromISO(endISO);
  
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
  return DateTime.fromISO(isoString).toFormat('HH:mm');
}

/**
 * Format date and time to "Jan 9, 2026 17:26" format
 */
export function formatDateTime(isoString: string): string {
  return DateTime.fromISO(isoString).toFormat('MMM d, yyyy HH:mm');
}



