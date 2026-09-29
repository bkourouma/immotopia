import { activeLocale } from '../../../i18n/format';
import { apiErrorMessage } from '../patrimoine-labels';

/** Ancienneté (en mois) au-delà de laquelle une valeur est signalée comme ancienne. */
export const STALE_VALUATION_MONTHS = 12;

/** Montant dans la devise donnée (XOF par défaut), mis en forme par `Intl` dans la langue courante. */
export function formatAmount(value: number | null | undefined, currency = 'XOF'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  try {
    return new Intl.NumberFormat(activeLocale(), {
      style: 'currency',
      currency,
      maximumFractionDigits: 0
    }).format(value);
  } catch {
    return `${new Intl.NumberFormat(activeLocale(), { maximumFractionDigits: 0 }).format(value)} ${currency}`;
  }
}

/**
 * Date ISO affichée dans la langue courante ; `—` si absente ou illisible.
 * L'API renvoie des dates à minuit UTC : on formate en UTC pour qu'un
 * navigateur à l'ouest de Greenwich n'affiche pas la veille.
 */
export function formatDay(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(activeLocale(), { timeZone: 'UTC' });
}

export function formatShare(share: number): string {
  return new Intl.NumberFormat(activeLocale(), { style: 'percent', maximumFractionDigits: 1 }).format(share);
}

/** Vrai si la valorisation a plus de 12 mois à la date `now`. */
export function isValuationStale(valuatedAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!valuatedAt) return false;
  const date = new Date(valuatedAt);
  if (Number.isNaN(date.getTime())) return false;
  const limit = new Date(now);
  limit.setMonth(limit.getMonth() - STALE_VALUATION_MONTHS);
  return date < limit;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface ServerFieldError {
  path: string[];
  message: string;
}

/**
 * Erreurs de validation du serveur (`errors: [{ path, message }]`). L'API
 * historique nomme la clé `field` : les deux sont acceptées.
 */
export function serverFieldErrors(error: unknown): ServerFieldError[] {
  const list = (error as { response?: { data?: { errors?: unknown } } })?.response?.data?.errors;
  if (!Array.isArray(list)) return [];
  const result: ServerFieldError[] = [];
  for (const entry of list) {
    const raw = (entry as { path?: unknown; field?: unknown }).path ?? (entry as { field?: unknown }).field;
    const message = (entry as { message?: unknown }).message;
    if (typeof message !== 'string') continue;
    const path = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' && raw ? raw.split('.') : [];
    result.push({ path, message });
  }
  return result;
}

export { apiErrorMessage };
