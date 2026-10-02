import type { PlatformAuditLog } from '../services/audit-service';
import { fallbackActorLabel } from './tenant-audit-display';
import { t } from '../i18n/t';

/**
 * Acteur affiché dans la console plateforme : contrairement à l'agence, la
 * plateforme voit l'identité du personnel. Nom ou e-mail du compte résolu,
 * sinon libellé figé à l'écriture (le compte a pu être supprimé), sinon le
 * type d'acteur.
 */
export function getPlatformActorDisplay(log: Pick<PlatformAuditLog, 'actorType' | 'user' | 'actorLabel'>): string {
  const named = log.user?.fullName || log.user?.email || log.actorLabel;
  if (named) return named;
  if (log.actorType === 'SUPER_ADMIN') return t('Support ImmoTopia');
  return fallbackActorLabel(log.actorType);
}
