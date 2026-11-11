import type { Request, Response } from 'express';
import { t } from '../i18n';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-middleware';
import { prisma } from '../utils/database';
import { sendPrivateFile } from '../lib/files/private-files';
import { logAuditEvent } from '../services/audit-service';
import { AuditActionKey } from '../types/audit-types';
import { readDeclarationProofStream } from '../lib/rental/declared-payment/proof-files';
import { assertBelongsToTenant } from '../utils/tenant-ownership';
import { createRentalDeclaration } from '../lib/rental/declared-payment/declaration-create';
import { loadDeclarationDto } from '../lib/rental/declared-payment/declaration-dto';
import { getPendingCount } from '../lib/rental/declared-payment/declaration-queries';
import {
  parseManagerPayload,
  thirdPartyDeclarationPayloadSchema
} from '../lib/rental/declared-payment/manager-schemas';

/**
 * Paiement de loyer déclaré, côté gestionnaire : compteur du badge et
 * déclaration pour un tiers (contrat §1.6). Les gardes (session, agence,
 * `RENTAL_PAYMENTS_VIEW` / `RENTAL_PAYMENTS_CREATE`) sont posées par les routeurs.
 * L'agence vient de la session ; aucun identifiant d'agence n'est lu d'un corps.
 */

function tenantIdOf(req: Request): string {
  const tenantId = req.tenantContext?.tenantId || req.params.tenantId;
  if (!tenantId) throw new BadRequestError(t('Agence manquante dans la requête.'));
  return tenantId;
}

function userIdOf(req: Request): string {
  const userId = req.user?.userId;
  if (!userId) throw new BadRequestError(t('Utilisateur manquant dans la requête.'));
  return userId;
}

/** GET …/rental/payment-declarations/pending-count */
export const pendingCountHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await getPendingCount(tenantIdOf(req)) });
});

/**
 * POST …/rental/payment-declarations : déclaration saisie par le gestionnaire.
 * Multipart : champ `payload` (JSON strict), fichier `proof` facultatif.
 * Le déclarant enregistré est le locataire principal du bail ; `declaredByUserId`
 * vient de la session, jamais du corps.
 */
export const createDeclarationForThirdPartyHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = tenantIdOf(req);
  const userId = userIdOf(req);
  const payload = parseManagerPayload(req.body?.payload, thirdPartyDeclarationPayloadSchema);

  // Le bail doit appartenir à l'agence : sinon 404, comme un bail inexistant.
  await assertBelongsToTenant(prisma, 'rentalLease', payload.leaseId, tenantId, {
    tenantField: 'tenant_id',
    message: t('Bail introuvable.')
  });
  const lease = await prisma.rentalLease.findFirst({
    where: { id: payload.leaseId, tenant_id: tenantId },
    select: { primary_renter_client_id: true }
  });
  if (!lease) throw new NotFoundError(t('Bail introuvable.'));

  const { declarationId } = await createRentalDeclaration({
    tenantId,
    leaseId: payload.leaseId,
    installmentId: payload.installmentId ?? null,
    declaredByClientId: lease.primary_renter_client_id,
    declaredByUserId: userId,
    actor: 'MANAGER',
    paymentMethod: payload.paymentMethod ?? null,
    receivingNumberId: payload.receivingNumberId,
    operator: payload.operator,
    reference: payload.reference,
    amount: payload.amount,
    paidAt: payload.paidAt,
    payerPhone: payload.payerPhone ?? null,
    notes: payload.notes ?? null,
    proof: req.file
      ? { buffer: req.file.buffer, mimetype: req.file.mimetype, originalname: req.file.originalname }
      : null
  });

  res.status(201).json({ success: true, data: await loadDeclarationDto(tenantId, declarationId) });
});

/**
 * GET …/rental/payment-declarations/:declarationId/proof (contrat §1.6).
 * Une capture est une donnée personnelle : chaque lecture laisse une trace
 * d'audit (identifiants seulement, ni chemin ni téléphone).
 */
export const getDeclarationProofHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = tenantIdOf(req);
  const declarationId = req.params.declarationId;
  const file = await readDeclarationProofStream(tenantId, declarationId);
  logAuditEvent({
    actorUserId: userIdOf(req),
    tenantId,
    actionKey: AuditActionKey.RENTAL_PAYMENT_DECLARATION_PROOF_VIEWED,
    entityType: 'RENTAL_PAYMENT_DECLARATION',
    entityId: declarationId,
    payload: { declarationId }
  });
  sendPrivateFile(res, file, { inline: true });
});
