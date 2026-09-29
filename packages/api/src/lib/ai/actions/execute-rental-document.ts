import { DocumentType, RentalDocumentStatus, RentalDocumentType, RentalPaymentStatus } from '@prisma/client';
import { AppError, BadRequestError, ForbiddenError, NotFoundError } from '../../../middleware/error-middleware';
import { generateDocument } from '../../../services/document-generation-service';
import { hasPermission } from '../../../services/permission-service';
import { logAuditEvent } from '../../../services/audit-service';
import { prisma } from '../../../utils/database';
import { logger } from '../../../utils/logger';
import { AuditActionKey } from '../../../types/audit-types';
import { t } from '../../../i18n';
import type { ActionExecutedPayload, ProposalClaims } from '../contracts';
import { ProposalError, redeemProposal, verifyProposal } from '../proposal-token';
import { loadLeaseSummary } from '../tools/tool-utils';

const PERMISSION = 'RENTAL_DOCUMENTS_GENERATE';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface ExecuteRentalDocumentInput {
  /** Jeton reçu du client. */
  token: string;
  /** Toujours issus de la requête authentifiée, jamais du corps. */
  userId: string;
  tenantId: string;
}

export interface ExecuteRentalDocumentResult {
  payload: ActionExecutedPayload;
}

interface GeneratedDocumentRow {
  id: string;
  document_number?: string | null;
  type: string;
  mime_type?: string | null;
}

function reject(input: ExecuteRentalDocumentInput, jti: string | undefined, reason: string): void {
  logAuditEvent({
    actorUserId: input.userId,
    tenantId: input.tenantId,
    actionKey: AuditActionKey.AI_ACTION_REJECTED,
    entityType: 'AI_PROPOSAL',
    entityId: jti ?? 'unknown',
    payload: { reason }
  });
}

function toPayload(
  proposalId: string,
  tenantId: string,
  doc: GeneratedDocumentRow,
  alreadyExisted: boolean
): ActionExecutedPayload {
  const base = (doc.document_number || doc.id).replace(/[^A-Za-z0-9._-]+/g, '_');
  return {
    proposalId,
    alreadyExisted,
    document: {
      id: doc.id,
      documentNumber: doc.document_number ?? null,
      type: doc.type === RentalDocumentType.RENT_RECEIPT ? 'RENT_RECEIPT' : 'STATEMENT',
      mimeType: doc.mime_type || DOCX_MIME,
      filename: `${base}.docx`,
      downloadPath: `/tenants/${tenantId}/documents/${doc.id}/download`
    }
  };
}

/** Revalide que chaque id du jeton appartient encore à l'agence et reste cohérent. */
async function revalidateReceipt(
  claims: ProposalClaims,
  args: Extract<ProposalClaims['args'], { docType: 'RENT_RECEIPT' }>
): Promise<void> {
  const tenantId = claims.tid;
  const lease = await loadLeaseSummary(tenantId, args.leaseId);
  const payment = await prisma.rentalPayment.findFirst({
    where: { id: args.paymentId, tenant_id: tenantId },
    select: { id: true, lease_id: true, status: true }
  });
  if (!payment || payment.lease_id !== lease.id) throw new NotFoundError(t('Paiement introuvable.'));
  if (payment.status !== RentalPaymentStatus.SUCCESS) {
    throw new BadRequestError(t("Ce paiement n'est plus encaissé : la quittance ne peut pas être générée."));
  }
  const installment = await prisma.rentalInstallment.findFirst({
    where: { id: args.installmentId, tenant_id: tenantId, lease_id: lease.id },
    select: { id: true }
  });
  if (!installment) throw new NotFoundError(t('Échéance introuvable.'));
  const allocation = await prisma.rentalPaymentAllocation.findFirst({
    where: { tenant_id: tenantId, payment_id: payment.id, installment_id: installment.id },
    select: { id: true }
  });
  if (!allocation) throw new NotFoundError(t('Paiement introuvable.'));
}

async function run(claims: ProposalClaims): Promise<{ doc: GeneratedDocumentRow; alreadyExisted: boolean }> {
  const { args } = claims;
  const tenantId = claims.tid;

  if (args.docType === 'RENT_RECEIPT') {
    await revalidateReceipt(claims, args);
    // Idempotence : une quittance FINAL existe déjà pour ce paiement.
    const existing = await prisma.rentalDocument.findFirst({
      where: {
        tenant_id: tenantId,
        type: RentalDocumentType.RENT_RECEIPT,
        status: RentalDocumentStatus.FINAL,
        payment_id: args.paymentId
      },
      select: { id: true, document_number: true, type: true, mime_type: true }
    });
    if (existing) return { doc: existing, alreadyExisted: true };

    const doc = await generateDocument(
      tenantId,
      DocumentType.RENT_RECEIPT,
      args.paymentId,
      undefined,
      { installmentId: args.installmentId },
      claims.sub
    );
    return { doc: doc as unknown as GeneratedDocumentRow, alreadyExisted: false };
  }

  await loadLeaseSummary(tenantId, args.leaseId);
  const doc = await generateDocument(
    tenantId,
    DocumentType.RENT_STATEMENT,
    args.leaseId,
    undefined,
    {
      startDate: new Date(`${args.startDate}T00:00:00.000Z`),
      endDate: new Date(`${args.endDate}T23:59:59.999Z`)
    },
    claims.sub
  );
  return { doc: doc as unknown as GeneratedDocumentRow, alreadyExisted: false };
}

/**
 * Exécute une proposition confirmée par l'utilisateur. Ordre :
 * signature → expiration → sub/tid → `hasPermission` → `redeem` (usage unique)
 * → revalidation de l'appartenance → idempotence → `generateDocument`.
 *
 * `userId` et `tenantId` viennent de la requête authentifiée. Cette fonction
 * n'est PAS dans le registre des outils du LLM.
 *
 * @throws ProposalError (`PROPOSAL_INVALID`, `PROPOSAL_EXPIRED`,
 *         `PROPOSAL_ALREADY_USED`), ForbiddenError, NotFoundError, ou
 *         BadRequestError('La génération du document a échoué.') pour toute
 *         erreur non typée (détail journalisé).
 */
export async function executeRentalDocument(input: ExecuteRentalDocumentInput): Promise<ExecuteRentalDocumentResult> {
  let claims: ProposalClaims;
  try {
    claims = verifyProposal(input.token, { userId: input.userId, tenantId: input.tenantId });
  } catch (error) {
    if (error instanceof ProposalError) reject(input, error.jti, error.reason);
    throw error;
  }

  if (!(await hasPermission(input.userId, PERMISSION, input.tenantId))) {
    reject(input, claims.jti, 'PERMISSION_REVOKED');
    throw new ForbiddenError(t("Vous n'avez plus la permission de générer ce document."));
  }

  try {
    await redeemProposal(claims);
  } catch (error) {
    if (error instanceof ProposalError) reject(input, error.jti ?? claims.jti, error.reason);
    throw error;
  }

  try {
    const { doc, alreadyExisted } = await run(claims);
    logAuditEvent({
      actorUserId: input.userId,
      tenantId: input.tenantId,
      actionKey: AuditActionKey.AI_ACTION_EXECUTED,
      entityType: 'RENTAL_DOCUMENT',
      entityId: doc.id,
      payload: { proposalId: claims.jti, docType: claims.args.docType, leaseId: claims.args.leaseId, alreadyExisted }
    });
    return {
      payload: toPayload(claims.jti, input.tenantId, doc, alreadyExisted)
    };
  } catch (error) {
    if (error instanceof AppError) {
      reject(input, claims.jti, error.code ?? 'APP_ERROR');
      throw error;
    }
    logger.error('ImmoCopilot : échec de la génération confirmée', {
      tenantId: input.tenantId,
      proposalId: claims.jti,
      docType: claims.args.docType,
      error
    });
    reject(input, claims.jti, 'GENERATION_FAILED');
    throw new BadRequestError(t('La génération du document a échoué.'));
  }
}
