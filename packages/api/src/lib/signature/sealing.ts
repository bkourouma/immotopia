import { prisma } from '../../utils/database';
import { logger } from '../../utils/logger';
import { t } from '../../i18n';
import { recordAuditEvent, AuditActionKey } from '../../services/audit-service';
import { appendSignatureEvent, listChainedEvents, verifyEventChain } from './events';
import { sha256Hex } from './evidence';
import { readSignatureFile, writeSignatureFile } from './files';
import { agencyNameOf, languageOf, notifyIssuer } from './notify';
import { sealSignedPdf, type SealSigner } from './seal';

/**
 * Orchestration du scellement d'une demande (spec 044, SG-R7). Appelée dès que
 * le dernier signataire a signé, et rejouée par la tâche planifiée si elle a
 * échoué (`sealPendingRequests`). Une seule instance scelle à la fois : la
 * demande est RÉSERVÉE par mise à jour conditionnelle (`sealingAt`, périmée
 * après 5 minutes), et la clôture est elle aussi conditionnelle.
 */

const SEALING_CLAIM_TTL_MS = 5 * 60 * 1000;

/** Piste de preuve rompue : audit critique, le scellement est refusé (FAILED) et réessayé par la tâche. */
async function reportBrokenChain(tenantId: string, requestId: string, brokenAtSeq: number): Promise<void> {
  logger.error('Signature : piste de preuve rompue, scellement refusé', { tenantId, requestId, brokenAtSeq });
  try {
    await prisma.$transaction(tx =>
      recordAuditEvent(tx, {
        tenantId,
        actorUserId: null,
        actorType: 'SYSTEM',
        actionKey: AuditActionKey.SIGNATURE_CHAIN_BROKEN,
        entityType: 'SignatureRequest',
        entityId: requestId,
        payload: { requestId, brokenAtSeq }
      })
    );
  } catch (error) {
    logger.error('Signature : audit de la piste rompue en échec', {
      error: error instanceof Error ? error.name : 'inconnue'
    });
  }
}

export type SealOutcome = 'SEALED' | 'SKIPPED' | 'FAILED';

async function claim(tenantId: string, requestId: string, now: Date): Promise<boolean> {
  const claimed = await prisma.signatureRequest.updateMany({
    where: {
      id: requestId,
      tenantId,
      status: { in: ['SENT', 'PARTIALLY_SIGNED'] },
      signedFileKey: null,
      OR: [{ sealingAt: null }, { sealingAt: { lt: new Date(now.getTime() - SEALING_CLAIM_TTL_MS) } }]
    },
    data: { sealingAt: now }
  });
  return claimed.count === 1;
}

async function release(tenantId: string, requestId: string): Promise<void> {
  await prisma.signatureRequest.updateMany({ where: { id: requestId, tenantId }, data: { sealingAt: null } });
}

async function loadSealSigners(tenantId: string, requestId: string, signers: SignerRow[]): Promise<SealSigner[]> {
  const out: SealSigner[] = [];
  for (const signer of signers) {
    const png =
      signer.signatureMode === 'DRAWN' && signer.signatureImageKey
        ? (await readSignatureFile(tenantId, requestId, signer.signatureImageKey)).buffer
        : null;
    out.push({
      fullName: signer.fullName,
      role: signer.role,
      channel: signer.channel,
      signedAt: signer.signedAt as Date,
      ipTruncated: signer.ipTruncated,
      mode: png ? 'DRAWN' : 'TYPED',
      typed: signer.signatureTyped,
      png,
      consentTextHash: signer.consentTextHash
    });
  }
  return out;
}

type SignerRow = {
  fullName: string;
  role: string;
  channel: string;
  status: string;
  signedAt: Date | null;
  ipTruncated: string | null;
  signatureMode: string | null;
  signatureTyped: string | null;
  signatureImageKey: string | null;
  consentTextHash: string | null;
  position: number;
};

/**
 * Scelle la demande si tous ont signé. Ne lève jamais : un échec libère la
 * réservation et laisse la tâche planifiée réessayer.
 */
export async function sealRequest(tenantId: string, requestId: string, now: Date = new Date()): Promise<SealOutcome> {
  if (!(await claim(tenantId, requestId, now))) return 'SKIPPED';
  try {
    const request = await prisma.signatureRequest.findFirst({
      where: { id: requestId, tenantId },
      select: {
        id: true,
        kind: true,
        targetType: true,
        targetId: true,
        title: true,
        language: true,
        sourceFileKey: true,
        sourceHash: true,
        createdByUserId: true,
        signers: {
          orderBy: { position: 'asc' },
          select: {
            fullName: true,
            role: true,
            channel: true,
            status: true,
            signedAt: true,
            ipTruncated: true,
            signatureMode: true,
            signatureTyped: true,
            signatureImageKey: true,
            consentTextHash: true,
            position: true
          }
        }
      }
    });
    if (!request || request.signers.length === 0 || request.signers.some(s => s.status !== 'SIGNED' || !s.signedAt)) {
      await release(tenantId, requestId);
      return 'SKIPPED';
    }

    const source = await readSignatureFile(tenantId, requestId, request.sourceFileKey);
    if (sha256Hex(source.buffer) !== request.sourceHash) throw new Error('SOURCE_HASH_MISMATCH');

    const events = await listChainedEvents(tenantId, requestId);
    // SG-R8 : on ne scelle jamais sur une piste de preuve rompue.
    const chain = verifyEventChain(events);
    if (!chain.ok) {
      await reportBrokenChain(tenantId, requestId, chain.brokenAtSeq);
      await release(tenantId, requestId);
      return 'FAILED';
    }
    const sealed = await sealSignedPdf({
      sourcePdf: source.buffer,
      title: request.title,
      requestId,
      language: languageOf(request.language),
      sourceHash: request.sourceHash,
      chainHead: events.length > 0 ? events[events.length - 1].eventHash : null,
      signers: await loadSealSigners(tenantId, requestId, request.signers),
      sealedAt: now
    });
    const signedFileKey = await writeSignatureFile(tenantId, requestId, 'signed.pdf', sealed.pdf);

    const done = await prisma.$transaction(async tx => {
      const updated = await tx.signatureRequest.updateMany({
        where: { id: requestId, tenantId, status: { in: ['SENT', 'PARTIALLY_SIGNED'] }, signedFileKey: null },
        data: { status: 'COMPLETED', signedFileKey, signedHash: sealed.sha256, completedAt: now, sealingAt: null }
      });
      if (updated.count !== 1) return false;
      if (request.targetType === 'RentalLease') {
        await tx.rentalLease.updateMany({
          where: { id: request.targetId, tenant_id: tenantId },
          data: { signed_at: now, signature_request_id: requestId }
        });
      }
      await appendSignatureEvent(tx, {
        tenantId,
        requestId,
        type: 'SEALED',
        payload: { signedHash: sealed.sha256, pages: sealed.pageCount },
        now
      });
      await recordAuditEvent(tx, {
        tenantId,
        actorUserId: null,
        actorType: 'SYSTEM',
        actionKey: AuditActionKey.SIGNATURE_SEALED,
        entityType: 'SignatureRequest',
        entityId: requestId,
        payload: { requestId, kind: request.kind, targetType: request.targetType, signedHash: sealed.sha256 }
      });
      return true;
    });
    if (!done) return 'SKIPPED';

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
    return 'SEALED';
  } catch (error) {
    logger.error('Signature : scellement en échec', {
      tenantId,
      requestId,
      error: error instanceof Error ? error.message : 'inconnue'
    });
    await release(tenantId, requestId).catch(() => undefined);
    return 'FAILED';
  }
}
