import { DateTime } from 'luxon';

/**
 * Format ISO date string to user-friendly display format (e.g. "Dec 30")
 * Handles both full ISO timestamps and date-only strings
 * Falls back to original string if parsing fails
 */
export function formatDisplayDate(dateString: string): string {
  if (!dateString || !dateString.trim()) {
    return '';
  }

  try {
    // Try parsing as ISO date (handles both full timestamps and date-only)
    const date = DateTime.fromISO(dateString.trim());
    
    // Check if date is valid
    if (!date.isValid) {
      return dateString; // Fallback to original
    }

    // Format as "Dec 30" (month abbreviation + day)
    return date.toFormat('LLL d');
  } catch {
    // If any error occurs, return original string
    return dateString;
  }
}


