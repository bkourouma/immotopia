import { format, isValid, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale/fr';

/**
 * Safely format a date string or Date object
 * Returns a formatted string or a fallback message if the date is invalid
 * @param date - Date string, Date object, or null/undefined
 * @param formatString - Format string for date-fns format function
 * @param fallback - Fallback text to display if date is invalid (default: 'Date invalide')
 * @returns Formatted date string or fallback text
 */
export function safeFormatDate(
  date: string | Date | null | undefined,
  formatString: string = 'dd MMM yyyy à HH:mm',
  fallback: string = 'Date invalide'
): string {
  if (!date) {
    return fallback;
  }

  try {
    // Parse the date if it's a string
    let dateObj: Date;
    if (typeof date === 'string') {
      // Try parsing as ISO string first
      dateObj = parseISO(date);
      // If parseISO fails, try new Date
      if (!isValid(dateObj)) {
        dateObj = new Date(date);
      }
    } else {
      dateObj = date;
    }

    // Check if the date is valid
    if (!isValid(dateObj)) {
      return fallback;
    }

    // Format the date
    return format(dateObj, formatString, { locale: fr });
  } catch (error) {
    console.error('Error formatting date:', error, date);
    return fallback;
  }
}

/**
 * Format date for display in ticket detail (full format with time)
 */
export function formatTicketDate(date: string | Date | null | undefined): string {
  return safeFormatDate(date, 'dd MMMM yyyy à HH:mm', 'Date invalide');
}

/**
 * Format date for display in lists (compact format)
 */
export function formatCompactDate(date: string | Date | null | undefined): string {
  return safeFormatDate(date, 'dd MMM yyyy à HH:mm', 'Date invalide');
}

/**
 * Format date for display in timeline (compact format without time)
 */
export function formatTimelineDate(date: string | Date | null | undefined): string {
  return safeFormatDate(date, 'dd MMM yyyy à HH:mm', 'Date invalide');
}
