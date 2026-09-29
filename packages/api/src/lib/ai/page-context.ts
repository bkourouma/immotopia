import type { ChatRequest } from './contracts';
import { NotFoundError } from '../../middleware/error-middleware';
import { prisma } from '../../utils/database';
import { getPropertyForTenant } from '../../utils/property-tenant-guard';
import { logger } from '../../utils/logger';

/**
 * Contexte d'écran d'ImmoCopilot : l'écran que l'utilisateur regarde.
 *
 * Le navigateur l'envoie, donc il n'est PAS digne de confiance. Il n'atteint
 * le modèle qu'après vérification :
 * - un chemin dont l'agence n'est pas celle de la route est ignoré en bloc ;
 * - l'entité active doit exister DANS l'agence (même erreur, donc même
 *   silence, pour une entité absente et pour celle d'une autre agence) ;
 * - l'utilisateur doit détenir la permission de l'outil correspondant ;
 * - seule une référence courte, assainie, est transmise : jamais le titre ni
 *   un texte libre du bien ou du bail.
 * Le bloc produit est une donnée : le prompt système interdit d'y lire des
 * instructions.
 */

export interface ResolvedPageContext {
  entityType: 'PROPERTY' | 'LEASE';
  entityId: string;
  /** Référence interne du bien ou numéro de bail, assainie. */
  reference: string;
}

const ENTITY_PERMISSION = {
  PROPERTY: 'PROPERTIES_VIEW',
  LEASE: 'RENTAL_LEASES_VIEW'
} as const;

const MAX_REFERENCE_LENGTH = 40;
const TENANT_IN_PATH = /\/tenants?\/([^/?#]+)/;

/** Ne garde que des caractères de référence : jamais de balise, de guillemet ni de retour à la ligne. */
export function sanitizeReference(value: string): string {
  return value.replace(/[^\p{L}\p{N}._/-]+/gu, '').slice(0, MAX_REFERENCE_LENGTH);
}

/**
 * Résout le contexte d'écran ; `null` = aucun contexte exploitable (ignoré,
 * jamais une erreur : un contexte invalide ne doit pas empêcher de discuter).
 */
export async function resolvePageContext(
  context: ChatRequest['context'],
  tenantId: string,
  permissions: ReadonlySet<string>
): Promise<ResolvedPageContext | null> {
  if (!context) return null;

  const pathTenant = context.currentPath ? TENANT_IN_PATH.exec(context.currentPath)?.[1] : undefined;
  if (pathTenant && pathTenant !== tenantId) return null;

  const { activeEntityType, activeEntityId } = context;
  if (!activeEntityType || !activeEntityId) return null;
  if (!permissions.has(ENTITY_PERMISSION[activeEntityType])) return null;

  try {
    if (activeEntityType === 'PROPERTY') {
      const property = await getPropertyForTenant(activeEntityId, tenantId);
      return {
        entityType: 'PROPERTY',
        entityId: property.id,
        reference: sanitizeReference(String(property.internalReference ?? ''))
      };
    }
    const lease = await prisma.rentalLease.findFirst({
      where: { id: activeEntityId, tenant_id: tenantId },
      select: { id: true, lease_number: true }
    });
    if (!lease) return null;
    return { entityType: 'LEASE', entityId: lease.id, reference: sanitizeReference(lease.lease_number) };
  } catch (error) {
    if (!(error instanceof NotFoundError)) {
      logger.warn('ImmoCopilot : contexte d’écran ignoré (vérification en échec)', { tenantId, error });
    }
    return null;
  }
}

/**
 * Bloc de données placé en tête du dernier message utilisateur. Du JSON
 * sérialisé par le serveur (valeurs vérifiées), sans texte libre. La date du
 * jour vit ici et non dans le prompt système, qui reste stable. Format
 * JJ/MM/AAAA à dessein : le modèle en tire des périodes AAAA-MM lui-même.
 */
export function formatContextBlock(page: ResolvedPageContext | null, now: Date = new Date()): string {
  const today = `${String(now.getUTCDate()).padStart(2, '0')}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${now.getUTCFullYear()}`;
  const data: Record<string, string> = { today };
  if (page) {
    data.entity_type = page.entityType;
    data.entity_id = page.entityId;
    if (page.reference) data.reference = page.reference;
  }
  return `<screen_context>${JSON.stringify(data)}</screen_context>`;
}
