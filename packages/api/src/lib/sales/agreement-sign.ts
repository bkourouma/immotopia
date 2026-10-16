import { PropertyStatus, SaleAgreementStatus } from '@prisma/client';
import type { PrismaTransactionClient } from '../../utils/database';
import { logger } from '../../utils/logger';
import { AuditActionKey, recordAuditEvent } from '../../services/audit-service';
import { agreementNumber } from './numbering';
import { setPropertyStatusTx } from './property-status';

/**
 * Transition « compromis signé » (DRAFT -> SIGNED, bien en UNDER_OFFER), commune
 * à la signature manuelle (`signAgreement`) et au scellement de la signature
 * électronique (source `SALE_AGREEMENT`, spec 044). Dans la transaction fournie.
 *
 * La transition est CONDITIONNELLE (`updateMany` sur `status: DRAFT`) : deux
 * appels concurrents (scellement rejoué, annulation en parallèle) ne la
 * jouent qu'une fois, et le statut du bien n'est touché que par celui qui a
 * réellement fait passer le compromis à SIGNED. Un compromis qui n'est plus en
 * brouillon n'est pas touché : la fonction rend `null`.
 *
 * `tolerateStatusConflict` (scellement) : si le statut du bien refuse la
 * transition (bien déjà vendu, retiré…), le compromis est marqué SIGNED quand
 * même et un audit « statut du bien à régulariser » est écrit : un scellement
 * ne doit jamais échouer en boucle sur une incohérence de statut. La signature
 * manuelle, elle, laisse l'erreur remonter à l'utilisateur.
 */
export async function markAgreementSignedTx(
  tx: PrismaTransactionClient,
  params: {
    tenantId: string;
    agreementId: string;
    actorUserId: string;
    signedAt: Date;
    tolerateStatusConflict?: boolean;
  }
) {
  const { tenantId, agreementId } = params;
  const claimed = await tx.saleAgreement.updateMany({
    where: { id: agreementId, tenantId, status: SaleAgreementStatus.DRAFT },
    data: { status: SaleAgreementStatus.SIGNED, signedAt: params.signedAt }
  });
  if (claimed.count !== 1) return null;

  const row = await tx.saleAgreement.findFirst({ where: { id: agreementId, tenantId } });
  if (!row) return null;

  try {
    await setPropertyStatusTx(tx, {
      propertyId: row.propertyId,
      tenantId,
      newStatus: PropertyStatus.UNDER_OFFER,
      actorUserId: params.actorUserId,
      notes: `Compromis ${agreementNumber(row.year, row.sequence)} signé`
    });
  } catch (error) {
    // Seules les erreurs métier (409 : transition refusée, bien introuvable) sont tolérées ; une erreur de base remonte.
    const status = (error as { status?: unknown } | null)?.status;
    if (!params.tolerateStatusConflict || typeof status !== 'number' || status < 400 || status >= 500) throw error;
    logger.warn('Compromis signé : statut du bien à régulariser', { tenantId, agreementId });
    await recordAuditEvent(tx, {
      tenantId,
      actorUserId: null,
      actorType: 'SYSTEM',
      actionKey: AuditActionKey.SIGNATURE_PROPERTY_STATUS_TO_REVIEW,
      entityType: 'SaleAgreement',
      entityId: agreementId,
      payload: { agreementId, propertyId: row.propertyId, targetStatus: PropertyStatus.UNDER_OFFER }
    });
  }
  return row;
}
