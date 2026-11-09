import type { Request } from 'express';
import { t } from '../i18n';
import { assertUuidOrNotFound } from '../lib/documents/mandating-agencies';
import { cancelRentalDeclaration } from '../lib/rental/declared-payment/declaration-cancel';
import { createRentalDeclaration } from '../lib/rental/declared-payment/declaration-create';
import {
  getAvailability,
  getMyDeclaration,
  listMyDeclarations,
  loadPortalDeclaration
} from '../lib/rental/declared-payment/portal';
import {
  declareBodySchema,
  myDeclarationsQuerySchema,
  toPaidAtInput
} from '../lib/rental/declared-payment/portal-schemas';
import { readRentalProof } from '../lib/rental/declared-payment/proof-read';
import { asyncHandler, ErrorCode, ForbiddenError, AppError } from '../middleware/error-middleware';
import { prisma } from '../utils/database';
import { listPortalLeaseIds, resolveRequestedLeaseId } from '../utils/tenant-portal-leases';

/**
 * Paiement locatif déclaré, portail locataire (contrat 049, §1.3 à 1.5).
 *
 * L'agence, le locataire et ses baux viennent EXCLUSIVEMENT de la session
 * (`requireTenantPortalAccess`) ; le corps ne porte aucun identifiant d'agence ou
 * de bail. Les captures ne sont jamais servies au locataire.
 */

async function sessionScope(req: Request) {
  if (!req.tenantPortal) throw new ForbiddenError('Accès portail locataire requis.');
  const { tenantClientId, tenantId, leaseId } = req.tenantPortal;
  const leaseIds = await listPortalLeaseIds(tenantId, tenantClientId);
  if (leaseIds.length === 0) throw new ForbiddenError('Aucun bail actif trouvé.');
  return { tenantClientId, tenantId, defaultLeaseId: leaseId, leaseIds };
}

const declarationIdOf = (req: Request) => assertUuidOrNotFound(req.params.declarationId, t('Déclaration introuvable.'));

export const getAvailabilityHandler = asyncHandler(async (req, res) => {
  const { tenantClientId, tenantId } = await sessionScope(req);
  res.json({ success: true, data: await getAvailability(tenantId, tenantClientId) });
});

export const readProofHandler = asyncHandler(async (req, res) => {
  const { tenantClientId, tenantId } = await sessionScope(req);
  const data = await readRentalProof({ tenantId, tenantClientId, file: req.file ?? null });
  res.json({ success: true, data });
});

export const declarePaymentHandler = asyncHandler(async (req, res) => {
  // Forme validée AVANT toute lecture en base (ZodError : 400 avec le détail par champ).
  const body = declareBodySchema.parse(req.body ?? {});
  const { tenantClientId, tenantId, defaultLeaseId, leaseIds } = await sessionScope(req);

  // Bail : celui de l'échéance visée (H29), à condition qu'elle soit dans le périmètre du
  // locataire ; sinon le bail par défaut (ou celui de ?leaseId=, s'il est dans le périmètre).
  let leaseId = resolveRequestedLeaseId(
    leaseIds,
    req.query.leaseId,
    leaseIds.includes(defaultLeaseId) ? defaultLeaseId : leaseIds[0]
  ).leaseId;
  if (body.installmentId) {
    const installment = await prisma.rentalInstallment.findFirst({
      where: { id: body.installmentId, tenant_id: tenantId, lease_id: { in: leaseIds } },
      select: { lease_id: true }
    });
    if (!installment) {
      throw new AppError(
        t('Échéance introuvable ou non payable.'),
        404,
        ErrorCode.RENTAL_DECLARATION_INSTALLMENT_INVALID
      );
    }
    leaseId = installment.lease_id;
  }

  const { declarationId, duplicateSuspected } = await createRentalDeclaration({
    tenantId,
    leaseId,
    installmentId: body.installmentId ?? null,
    declaredByClientId: tenantClientId,
    actor: 'TENANT',
    paymentMethod: body.paymentMethod ?? null,
    receivingNumberId: body.receivingNumberId ?? null,
    operator: body.operator ?? body.mobileOperator ?? null,
    reference: body.reference ?? null,
    amount: body.amount,
    paidAt: toPaidAtInput((body.paidAt ?? body.paymentDate) as string),
    payerPhone: body.payerPhone ?? body.transactionPhone ?? null,
    notes: body.notes ?? null,
    proof: req.file
      ? { buffer: req.file.buffer, mimetype: req.file.mimetype, originalname: req.file.originalname }
      : null,
    proofReadId: body.proofReadId ?? null
  });

  res.status(201).json({
    success: true,
    message: t('Déclaration de paiement créée avec succès.'),
    data: await loadPortalDeclaration(tenantId, declarationId, { duplicateSuspected })
  });
});

export const listMyDeclarationsHandler = asyncHandler(async (req, res) => {
  const query = myDeclarationsQuerySchema.parse(req.query);
  const { tenantClientId, tenantId, leaseIds } = await sessionScope(req);
  res.json({ success: true, data: await listMyDeclarations({ tenantId, tenantClientId, leaseIds, ...query }) });
});

export const getMyDeclarationHandler = asyncHandler(async (req, res) => {
  const declarationId = declarationIdOf(req);
  const { tenantClientId, tenantId, leaseIds } = await sessionScope(req);
  res.json({ success: true, data: await getMyDeclaration({ tenantId, tenantClientId, leaseIds, declarationId }) });
});

export const cancelMyDeclarationHandler = asyncHandler(async (req, res) => {
  const declarationId = declarationIdOf(req);
  const { tenantClientId, tenantId, leaseIds } = await sessionScope(req);
  await cancelRentalDeclaration({ tenantId, tenantClientId, leaseIds, declarationId });
  res.json({ success: true, data: await getMyDeclaration({ tenantId, tenantClientId, leaseIds, declarationId }) });
});
