import dayjs from 'dayjs';
import 'dayjs/locale/fr';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import relativeTime from 'dayjs/plugin/relativeTime';
import { t } from '../i18n/t';

dayjs.extend(customParseFormat);
dayjs.extend(relativeTime);
dayjs.locale('fr');

/**
 * Safely format a date string or Date object.
 *
 * Uses dayjs (already the date library behind antd) so the app ships a single
 * date library. Format strings are dayjs tokens: DD, MMM, YYYY, HH:mm — and
 * literal words must be bracketed, e.g. '[à]'.
 *
 * @param date - Date string, Date object, or null/undefined
 * @param formatString - dayjs format string
 * @param fallback - Fallback text to display if date is invalid (default: 'Date invalide')
 * @returns Formatted date string or fallback text
 */
export function safeFormatDate(
  date: string | Date | null | undefined,
  formatString: string = t('DD MMM YYYY [à] HH:mm'),
  fallback: string = t('Date invalide')
): string {
  if (!date) {
    return fallback;
  }

  try {
    const parsed = dayjs(date);

    if (!parsed.isValid()) {
      return fallback;
    }

    return parsed.format(formatString);
  } catch (error) {
    console.error('Error formatting date:', error, date);
    return fallback;
  }
}

/**
 * Format date for display in ticket detail (full format with time)
 */
export function formatTicketDate(date: string | Date | null | undefined): string {
  return safeFormatDate(date, t('DD MMMM YYYY [à] HH:mm'), t('Date invalide'));
}

/**
 * Format date for display in lists (compact format)
 */
export function formatCompactDate(date: string | Date | null | undefined): string {
  return safeFormatDate(date, t('DD MMM YYYY [à] HH:mm'), t('Date invalide'));
}

/**
 * Format date for display in timeline (compact format without time)
 */
export function formatTimelineDate(date: string | Date | null | undefined): string {
  return safeFormatDate(date, t('DD MMM YYYY [à] HH:mm'), t('Date invalide'));
}

/**
 * Format a date as elapsed time, e.g. "il y a 2 heures".
 *
 * @param date - Date string, Date object, or null/undefined
 * @param fallback - Text to display if the date is missing or invalid
 */
export function formatRelativeDate(date: string | Date | null | undefined, fallback: string = ''): string {
  if (!date) {
    return fallback;
  }

  const parsed = dayjs(date);
  return parsed.isValid() ? parsed.fromNow() : fallback;
}
