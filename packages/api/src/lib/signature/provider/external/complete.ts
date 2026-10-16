import type { SignatureDocumentKind } from '@prisma/client';
import { prisma } from '../../../../utils/database';
import { logger } from '../../../../utils/logger';
import { t } from '../../../../i18n';
import { recordAuditEvent, AuditActionKey } from '../../../../services/audit-service';
import { appendSignatureEvent } from '../../events';
import { sha256Hex } from '../../evidence';
import { removeSignatureFile, writeSignatureFile } from '../../files';
import { agencyNameOf, languageOf, notifyIssuer } from '../../notify';
import { cancelRequestInternal } from '../../cancel';
import { findSignatureSource, SourceChangedError } from '../../sources';
import type { ExternalSignatureClient } from './types';

/**
 * Fin de signature d'une demande confiée à un prestataire externe (spec 044,
 * lot S6). Appelée par `sealRequest` (qui garde réservation, contrôle de la
 * piste SG-R8 et libération) à la place du scellement pdf-lib : le PDF signé et
 * le dossier de preuve viennent du prestataire. L'état est RELU auprès du
 * prestataire, jamais déduit d'un webhook.
 */

export type ExternalCompleteOutcome = 'SEALED' | 'SKIPPED' | 'FAILED';

export interface ExternalCompleteRequest {
  id: string;
  kind: SignatureDocumentKind;
  targetType: string;
  targetId: string;
  sourceDocumentId: string | null;
  sourceDocHash: string | null;
  title: string;
  language: string;
  createdByUserId: string;
  providerRef: string | null;
}

const PDF_HEADER = '%PDF-';

function isPdf(buffer: Buffer): boolean {
  return buffer.length > PDF_HEADER.length && buffer.subarray(0, PDF_HEADER.length).toString('latin1') === PDF_HEADER;
}

/** Prévient l'émetteur que la demande est signée (commun au scellement interne). */
export async function notifySealed(
  tenantId: string,
  request: { title: string; language: string; createdByUserId: string }
): Promise<void> {
  await notifyIssuer({
    tenantId,
    userId: request.createdByUserId,
    language: request.language,
    subject: t('Document signé — {{title}}', { title: request.title }, languageOf(request.language)),
    text: t(
      'Toutes les parties ont signé « {{title}} » ({{agency}}). Le PDF scellé est disponible dans ImmoTopia.',
      { title: request.title, agency: await agencyNameOf(tenantId) },
      languageOf(request.language)
    )
  });
}

export async function completeExternalRequest(args: {
  client: ExternalSignatureClient;
  tenantId: string;
  requestId: string;
  request: ExternalCompleteRequest;
  now: Date;
}): Promise<ExternalCompleteOutcome> {
  const { client, tenantId, requestId, request, now } = args;
  if (!request.providerRef) return 'SKIPPED';

  // (1) L'état fait foi chez le prestataire : terminé, sinon on ne conclut rien.
  const snapshot = await client.getSnapshot(request.providerRef);
  if (snapshot.state !== 'DONE') return 'SKIPPED';

  // (2) PDF signé et preuve : des PDF non vides, rien d'autre.
  const signedPdf = await client.downloadSigned(request.providerRef);
  const evidencePdf = await client.downloadEvidence(request.providerRef);
  if (!isPdf(signedPdf) || !isPdf(evidencePdf)) {
    logger.error('Signature : document du prestataire invalide', { tenantId, requestId, provider: client.id });
    return 'FAILED';
  }
  const signedHash = sha256Hex(signedPdf);
  const evidenceHash = sha256Hex(evidencePdf);

  // (3) Fichiers privés de la demande.
  const signedFileKey = await writeSignatureFile(tenantId, requestId, 'signed.pdf', signedPdf);
  await writeSignatureFile(tenantId, requestId, 'evidence.pdf', evidencePdf);

  // (4) Clôture conditionnelle, comme le scellement interne.
  let done: boolean;
  try {
    done = await prisma.$transaction(async tx => {
      const updated = await tx.signatureRequest.updateMany({
        where: { id: requestId, tenantId, status: { in: ['SENT', 'PARTIALLY_SIGNED'] }, signedFileKey: null },
        data: { status: 'COMPLETED', signedFileKey, signedHash, completedAt: now, sealingAt: null }
      });
      if (updated.count !== 1) return false;
      await findSignatureSource(request.kind)?.onSealed(tx, { ...request, tenantId }, now);
      await appendSignatureEvent(tx, {
        tenantId,
        requestId,
        type: 'SEALED',
        payload: { signedHash, provider: client.id, evidenceHash },
        now
      });
      await recordAuditEvent(tx, {
        tenantId,
        actorUserId: null,
        actorType: 'SYSTEM',
        actionKey: AuditActionKey.SIGNATURE_SEALED,
        entityType: 'SignatureRequest',
        entityId: requestId,
        payload: { requestId, kind: request.kind, targetType: request.targetType, signedHash }
      });
      return true;
    });
  } catch (error) {
    await removeSignatureFile(tenantId, requestId, 'evidence.pdf');
    if (!(error instanceof SourceChangedError)) throw error;
    await cancelRequestInternal({ tenantId, userId: null }, requestId, 'SOURCE_CHANGED');
    return 'SKIPPED';
  }
  if (!done) return 'SKIPPED';

  // (5) Émetteur prévenu.
  await notifySealed(tenantId, request);
  return 'SEALED';
}
