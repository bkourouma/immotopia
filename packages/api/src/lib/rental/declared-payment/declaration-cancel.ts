import { t } from '../../../i18n';
import { AppError, ErrorCode, NotFoundError } from '../../../middleware/error-middleware';
import { logAuditEvent } from '../../../services/audit-service';
import { AuditActionKey } from '../../../types/audit-types';
import { prisma } from '../../../utils/database';

/**
 * Annulation d'une déclaration par son déclarant (contrat 049, §1.4).
 *
 * Seul le locataire qui a déclaré peut annuler, sur les baux de son périmètre,
 * et seulement tant que la déclaration est PENDING. L'annulation sort la
 * référence de l'index partiel (CANCELED n'y figure pas) : elle redevient libre.
 */
export async function cancelRentalDeclaration(params: {
  tenantId: string;
  tenantClientId: string;
  leaseIds: string[];
  declarationId: string;
}): Promise<{ declarationId: string }> {
  const { tenantId, tenantClientId, leaseIds, declarationId } = params;

  const declaration = await prisma.rentalPaymentDeclaration.findFirst({
    where: { id: declarationId, tenant_id: tenantId, declared_by: tenantClientId, lease_id: { in: leaseIds } },
    select: { id: true, lease_id: true, amount: true }
  });
  // Même 404 pour une déclaration inconnue, d'un autre locataire ou hors périmètre.
  if (!declaration) throw new NotFoundError(t('Déclaration introuvable.'));

  // Claim atomique : une validation ou un rejet concurrent a déjà quitté PENDING.
  const claimed = await prisma.rentalPaymentDeclaration.updateMany({
    where: { id: declaration.id, tenant_id: tenantId, status: 'PENDING' },
    data: { status: 'CANCELED', canceled_at: new Date() }
  });
  if (claimed.count === 0) {
    throw new AppError(
      t("Cette déclaration n'est plus en attente : elle ne peut plus être annulée."),
      409,
      ErrorCode.RENTAL_DECLARATION_ALREADY_REVIEWED
    );
  }

  logAuditEvent({
    actorUserId: null,
    actorType: 'PORTAL',
    tenantId,
    actionKey: AuditActionKey.RENTAL_PAYMENT_DECLARATION_CANCELED,
    entityType: 'RENTAL_PAYMENT_DECLARATION',
    entityId: declaration.id,
    payload: { leaseId: declaration.lease_id, clientId: tenantClientId, amount: Number(declaration.amount) }
  });
  return { declarationId: declaration.id };
}
