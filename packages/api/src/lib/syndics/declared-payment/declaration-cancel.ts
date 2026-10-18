import { prisma } from '../../../utils/database';
import { AppError, ErrorCode, NotFoundError } from '../../../middleware/error-middleware';
import { logAuditEvent } from '../../../services/audit-service';
import { AuditActionKey } from '../../../types/audit-types';
import { t } from '../../../i18n';
import type { CoOwnerPortalScope } from '../coowner-portal';

/**
 * Annulation d'une déclaration par son déclarant (spec 047, contrats §2.6).
 *
 * Seul le copropriétaire qui a déclaré peut annuler, et seulement tant que la
 * déclaration est `PENDING`. L'annulation sort la référence de l'index partiel
 * (`CANCELED` n'y figure pas) : elle redevient libre sans autre écriture.
 */
export async function cancelDeclaration(params: {
  scope: CoOwnerPortalScope;
  declarationId: string;
}): Promise<{ declarationId: string }> {
  const { scope, declarationId } = params;
  const notFound = () => new NotFoundError(t('Déclaration introuvable.'));

  const declaration = await prisma.syndicPaymentDeclaration.findFirst({
    where: { id: declarationId, tenantId: scope.tenantId },
    select: {
      id: true,
      syndicateId: true,
      amount: true,
      declaredByContactId: true,
      lines: { select: { lotId: true, amount: true } }
    }
  });
  // Même 404 pour une déclaration inexistante, d'un autre contact ou hors périmètre.
  if (!declaration) throw notFound();
  if (!declaration.declaredByContactId || !scope.contactIds.includes(declaration.declaredByContactId)) {
    throw notFound();
  }
  const allowedLots = new Set(scope.lotIds);
  if (declaration.lines.some(line => !allowedLots.has(line.lotId))) throw notFound();

  // Claim atomique : une validation ou un rejet concurrent a déjà quitté PENDING.
  const claimed = await prisma.syndicPaymentDeclaration.updateMany({
    where: { id: declaration.id, tenantId: scope.tenantId, status: 'PENDING' },
    data: { status: 'CANCELED', canceledAt: new Date() }
  });
  if (claimed.count === 0) {
    throw new AppError(
      t("Cette déclaration n'est plus en attente : elle ne peut plus être annulée."),
      409,
      ErrorCode.DECLARATION_NOT_PENDING
    );
  }

  logAuditEvent({
    actorUserId: null,
    actorType: 'PORTAL',
    tenantId: scope.tenantId,
    actionKey: AuditActionKey.SYNDIC_PAYMENT_DECLARATION_CANCELED,
    entityType: 'SYNDIC_PAYMENT_DECLARATION',
    entityId: declaration.id,
    payload: {
      syndicateId: declaration.syndicateId,
      contactId: declaration.declaredByContactId,
      amount: Number(declaration.amount),
      lines: declaration.lines.map(line => ({ lotId: line.lotId, amount: Number(line.amount) }))
    }
  });
  return { declarationId: declaration.id };
}
