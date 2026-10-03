import { activeLocale, formatNumber } from '../../i18n/format';
import { t } from '../../i18n/t';
import type { CapabilityExecutedPayload, PlanScalar, WritePlan } from '../../types/copilot';

/** Au-delà, une valeur est repliée derrière « Voir plus ». */
export const LONG_VALUE_CHARS = 120;
const PREVIEW_MAX_CHARS = 4000;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/;

/**
 * Valeur d'un champ affichée dans la langue active (Intl). `undefined` = pas de
 * valeur avant (création) : « — ». « [masqué] » et tout autre texte restent tels quels.
 */
export function formatPlanValue(value: PlanScalar | undefined): string {
  if (value === undefined) return '—';
  if (value === null) return t('(vide)');
  if (typeof value === 'boolean') return value ? t('Oui') : t('Non');
  if (typeof value === 'number') return Number.isFinite(value) ? formatNumber(value) : String(value);
  if (ISO_DATE.test(value)) {
    const d = new Date(`${value}T00:00:00Z`);
    if (!Number.isNaN(d.getTime())) {
      return new Intl.DateTimeFormat(activeLocale(), { dateStyle: 'medium', timeZone: 'UTC' }).format(d);
    }
  }
  if (ISO_DATE_TIME.test(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return new Intl.DateTimeFormat(activeLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(d);
    }
  }
  return value;
}

export function formatDecisionTime(iso: string | undefined): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(activeLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

/** Heure « HH:MM » de lecture de l'état (langue active) ; vide si la date est illisible. */
export function formatStateReadTime(iso: string | undefined): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(activeLocale(), { hour: '2-digit', minute: '2-digit' }).format(d);
}

/** Décompte lisible « 4 min 05 s » ; `null` une fois le délai écoulé. */
export function formatCountdown(msLeft: number): string | null {
  if (msLeft <= 0) return null;
  const total = Math.ceil(msLeft / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return t('{{minutes}} min {{seconds}} s', { minutes, seconds });
}

export function recordKindLabel(kind: WritePlan['recordKind']): string {
  const labels: Record<WritePlan['recordKind'], string> = {
    create: t('Création'),
    update: t('Modification'),
    action: t('Action')
  };
  return labels[kind] ?? kind;
}

export function methodLabel(method: WritePlan['method']): string {
  const labels: Record<WritePlan['method'], string> = {
    POST: t('Envoi de données (POST)'),
    PUT: t('Remplacement (PUT)'),
    PATCH: t('Mise à jour partielle (PATCH)')
  };
  return labels[method] ?? method;
}

/** Module technique du catalogue en langage clair ; valeur inconnue : affichée telle quelle. */
export function planModuleLabel(module: string): string {
  const labels: Record<string, string> = {
    CORE: t('Général'),
    CRM: t('CRM'),
    SALES: t('Ventes'),
    RENTAL: t('Gestion locative'),
    PATRIMOINE: t('Patrimoine'),
    SYNDIC: t('Syndic'),
    CONSTRUCTION: t('Construction')
  };
  return labels[module.toUpperCase()] ?? module;
}

/** Aperçu du résultat en TEXTE BRUT (jamais interprété comme HTML), borné. */
export function resultPreviewText(preview: CapabilityExecutedPayload['resultPreview']): string | null {
  if (preview === undefined || preview === null || preview === '') return null;
  let text: string;
  if (typeof preview === 'string') {
    text = preview;
  } else {
    try {
      text = JSON.stringify(preview, null, 2) ?? String(preview);
    } catch {
      text = String(preview);
    }
  }
  return text.length > PREVIEW_MAX_CHARS ? `${text.slice(0, PREVIEW_MAX_CHARS)}…` : text;
}
