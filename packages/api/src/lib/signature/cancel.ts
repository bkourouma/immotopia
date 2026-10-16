import { prisma } from '../../utils/database';
import { logger } from '../../utils/logger';
import { recordAuditEvent, AuditActionKey } from '../../services/audit-service';
import { appendSignatureEvent } from './events';
import { getSignatureProvider } from './provider';
import { releaseSignature } from './quota';
import { findSignatureSource } from './sources';
import { OPEN_REQUEST_STATUSES } from './types';

/**
 * Annulation d'une demande de signature (spec 044). Module à part : le
 * document source change dans d'autres services (régénération du contrat), qui
 * doivent pouvoir annuler sans importer `signature-service` (cycle d'imports
 * avec `document-generation-service`).
 */

export type CancelReason = 'USER' | 'SEND_FAILED' | 'SOURCE_CHANGED';
export type CancelCtx = { tenantId: string; userId: string | null };

/** Annulation conditionnelle : trace critique, fournisseur prévenu. Rend vrai si elle a eu lieu. */
export async function cancelRequestInternal(
  ctx: CancelCtx,
  requestId: string,
  reason: CancelReason,
  options: { refundMonth?: string } = {}
): Promise<boolean> {
  const now = new Date();
  let providerRef: string | null = null;
  const canceled = await prisma.$transaction(async tx => {
    const request = await tx.signatureRequest.findFirst({
      where: { id: requestId, tenantId: ctx.tenantId },
      select: {
        id: true,
        tenantId: true,
        kind: true,
        targetType: true,
        targetId: true,
        sourceDocumentId: true,
        sourceDocHash: true,
        providerRef: true
      }
    });
    providerRef = request?.providerRef ?? null;
    const updated = await tx.signatureRequest.updateMany({
      where: { id: requestId, tenantId: ctx.tenantId, status: { in: [...OPEN_REQUEST_STATUSES] } },
      data: { status: 'CANCELED', canceledAt: now }
    });
    if (updated.count !== 1) return false;
    await appendSignatureEvent(tx, {
      tenantId: ctx.tenantId,
      requestId,
      type: 'CANCELED',
      payload: { reason, byUserId: ctx.userId },
      now
    });
    if (request) await findSignatureSource(request.kind)?.onCancel?.(tx, request, reason, now);
    await recordAuditEvent(tx, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      ...(ctx.userId ? {} : { actorType: 'SYSTEM' as const }),
      actionKey: AuditActionKey.SIGNATURE_CANCELED,
      entityType: 'SignatureRequest',
      entityId: requestId,
      payload: { requestId, reason }
    });
    return true;
  });
  if (canceled) {
    if (options.refundMonth) await releaseSignature(ctx.tenantId, options.refundMonth);
    // Le prestataire est prévenu hors transaction ; son échec n'annule pas l'annulation locale.
    await getSignatureProvider()
      .cancel(requestId, { tenantId: ctx.tenantId, providerRef })
      .catch(error => {
        logger.warn("Signature : prestataire non prévenu de l'annulation", {
          requestId,
          error: error instanceof Error ? error.name : 'inconnue'
        });
      });
  }
  return canceled;
}

/**
 * SG-R2 : une modification du document après l'envoi annule la demande en
 * cours. Appelée par le module propriétaire du document (régénération ou
 * changement de statut du contrat d'un bail). Rend le nombre de demandes annulées.
 */
export async function cancelOpenRequestsForTarget(
  ctx: CancelCtx,
  targetType: string,
  targetId: string
): Promise<number> {
  const open = await prisma.signatureRequest.findMany({
    where: { tenantId: ctx.tenantId, targetType, targetId, status: { in: [...OPEN_REQUEST_STATUSES] } },
    select: { id: true }
  });
  let count = 0;
  for (const request of open) {
    if (await cancelRequestInternal(ctx, request.id, 'SOURCE_CHANGED')) count += 1;
  }
  return count;
}
