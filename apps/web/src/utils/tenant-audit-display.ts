import type { TenantAuditActorType, TenantAuditLog, TenantAuditOutcome } from '../services/tenant-audit-service';
import { t } from '../i18n/t';

/**
 * Affichage du journal d'activité d'une agence : qui a fait l'action, comment
 * lire une valeur de payload. Séparé de la page pour rester testable.
 */

function fallbackActorLabel(actorType: TenantAuditActorType): string {
  switch (actorType) {
    case 'SYSTEM':
      return t('Système');
    case 'AI':
      return t('Assistant IA');
    case 'PORTAL':
      return t('Portail');
    default:
      return t('Inconnu');
  }
}

/**
 * Acteur affiché. Le support (SUPER_ADMIN) n'est jamais nommé : l'API n'envoie
 * ni identité ni adresse, et l'écran ne doit pas en reconstituer.
 */
export function getAuditActorDisplay(log: Pick<TenantAuditLog, 'actorType' | 'user' | 'actorLabel'>): string {
  if (log.actorType === 'SUPER_ADMIN') return t('Support ImmoTopia');
  return log.user?.fullName || log.user?.email || log.actorLabel || fallbackActorLabel(log.actorType);
}

const OUTCOME_COLORS: Record<TenantAuditOutcome, string> = {
  SUCCESS: 'green',
  FAILURE: 'red',
  DENIED: 'orange'
};

export function getAuditOutcomeColor(outcome: string): string {
  return OUTCOME_COLORS[outcome as TenantAuditOutcome] ?? 'default';
}

/** Valeur de payload lisible : texte tel quel, le reste en JSON compact, vide en tiret. */
export function formatAuditValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export interface AuditChangeRow {
  field: string;
  before: string;
  after: string;
}

function isBeforeAfter(value: unknown): value is { before?: unknown; after?: unknown } {
  return typeof value === 'object' && value !== null && ('before' in value || 'after' in value);
}

/** Aplatit `changes` en lignes « champ : avant → après ». Une valeur sans `before`/`after` est lue comme la nouvelle valeur. */
export function toChangeRows(changes: TenantAuditLog['changes']): AuditChangeRow[] {
  if (!changes) return [];
  return Object.entries(changes).map(([field, value]) =>
    isBeforeAfter(value)
      ? { field, before: formatAuditValue(value.before), after: formatAuditValue(value.after) }
      : { field, before: '—', after: formatAuditValue(value) }
  );
}
