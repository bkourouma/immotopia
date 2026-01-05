import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a number value with spaces as thousand separators (French format)
 * @param value - The number value to format (can be string, number, or undefined)
 * @returns Formatted string with spaces (e.g., "1 000 000")
 */
export function formatNumberWithSpaces(value: string | number | undefined): string {
  if (!value && value !== 0) return '';
  const numStr = value.toString().replace(/\s/g, '');
  if (numStr === '') return '';
  const num = parseFloat(numStr);
  if (isNaN(num)) return '';
  return num.toLocaleString('fr-FR', { useGrouping: true, maximumFractionDigits: 0 });
}

/**
 * Parse a formatted number string (remove spaces and non-numeric characters)
 * @param value - The formatted string to parse
 * @returns Clean numeric string without spaces
 */
export function parseFormattedNumber(value: string): string {
  return value.replace(/\s/g, '').replace(/[^\d]/g, '');
}

