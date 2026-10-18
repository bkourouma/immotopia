import type { Request, Response } from 'express';
import { t } from '../i18n';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import { assertUuidOrNotFound } from '../lib/documents/mandating-agencies';
import { sendPrivateFile } from '../lib/files/private-files';
import { logAuditEvent } from '../services/audit-service';
import { AuditActionKey } from '../types/audit-types';
import {
  createReceivingNumber,
  deleteReceivingNumber,
  listReceivingNumbers,
  updateReceivingNumber
} from '../lib/syndics/declared-payment/receiving-numbers';
import { getDeclaredPaymentSettings, updateDeclaredPaymentSettings } from '../lib/syndics/declared-payment/settings';
import { getDeclarationDetail, listDeclarations } from '../lib/syndics/declared-payment/declaration-queries';
import { getDeclarationProofForTenant } from '../lib/syndics/declared-payment/proof-files';
import { createDeclaration } from '../lib/syndics/declared-payment/declaration-create';
import { approveDeclaration, rejectDeclaration } from '../lib/syndics/declared-payment/declaration-review';
import { notifyDeclarationApproved, notifyDeclarationRejected } from '../lib/syndics/declared-payment/notifications';
import {
  approveDeclarationBodySchema,
  listDeclarationsQuerySchema,
  managerDeclarationPayloadSchema,
  parseMultipartPayload,
  rejectDeclarationBodySchema
} from '../lib/syndics/declared-payment/request-schemas';
import { scheduleChargeDocumentDelivery } from '../lib/syndics/charge-receipt-delivery';

/**
 * Paiement mobile money déclaré, côté gestionnaire (spec 047, contrats §1).
 *
 * Les gardes (session, agence, permission `SYNDIC_VIEW` / `SYNDIC_EDIT`) sont posées par
 * `routes/syndic-declared-payment-routes.ts`. L'agence vient de `requireTenantAccess` ;
 * la copropriété de l'URL est vérifiée contre l'agence par chaque service (404 sinon),
 * et tout numéro, lot ou déclaration est relu avec `tenantId` et `syndicateId`.
 * Aucun identifiant d'agence n'est lu d'un corps.
 */

function tenantIdOf(req: Request): string {
  const tenantId = req.tenantContext?.tenantId || req.params.tenantId;
  if (!tenantId) throw new BadRequestError(t('Agence manquante dans la requête.'));
  return tenantId;
}

const syndicIdOf = (req: Request) =>
  assertUuidOrNotFound(req.params.syndicId, t('Copropriété introuvable ou inaccessible.'));

const numberIdOf = (req: Request) => assertUuidOrNotFound(req.params.numberId, t('Numéro de réception introuvable.'));

const declarationIdOf = (req: Request) => assertUuidOrNotFound(req.params.declarationId, t('Déclaration introuvable.'));

function actorOf(req: Request): string {
  const userId = req.user?.userId;
  if (!userId) throw new BadRequestError(t('Utilisateur manquant dans la requête.'));
  return userId;
}

// --- 1.1 à 1.4 : numéros de réception ---------------------------------------

export const listReceivingNumbersHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await listReceivingNumbers(tenantIdOf(req), syndicIdOf(req)) });
});

export const createReceivingNumberHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await createReceivingNumber({
    tenantId: tenantIdOf(req),
    syndicateId: syndicIdOf(req),
    actorUserId: actorOf(req),
    body: req.body ?? {}
  });
  res.status(201).json({ success: true, data });
});

export const updateReceivingNumberHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await updateReceivingNumber({
    tenantId: tenantIdOf(req),
    syndicateId: syndicIdOf(req),
    numberId: numberIdOf(req),
    actorUserId: actorOf(req),
    body: req.body ?? {}
  });
  res.json({ success: true, data });
});

export const deleteReceivingNumberHandler = asyncHandler(async (req: Request, res: Response) => {
  await deleteReceivingNumber({
    tenantId: tenantIdOf(req),
    syndicateId: syndicIdOf(req),
    numberId: numberIdOf(req),
    actorUserId: actorOf(req)
  });
  res.status(204).send();
});

// --- 1.5 : réglages --------------------------------------------------------

export const getDeclaredSettingsHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await getDeclaredPaymentSettings(tenantIdOf(req), syndicIdOf(req)) });
});

export const updateDeclaredSettingsHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await updateDeclaredPaymentSettings({
    tenantId: tenantIdOf(req),
    syndicateId: syndicIdOf(req),
    actorUserId: actorOf(req),
    body: req.body ?? {}
  });
  res.json({ success: true, data });
});

// --- 1.6 à 1.8 : file, détail, capture ---------------------------------------

export const listDeclarationsHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listDeclarationsQuerySchema.parse(req.query);
  const data = await listDeclarations({
    tenantId: tenantIdOf(req),
    syndicateId: syndicIdOf(req),
    status: query.status,
    receivingNumberId: query.receivingNumberId,
    lotId: query.lotId,
    from: query.from,
    to: query.to,
    overdue: query.overdue,
    page: query.page,
    limit: query.limit
  });
  res.json({ success: true, data });
});

export const getDeclarationHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await getDeclarationDetail(tenantIdOf(req), syndicIdOf(req), declarationIdOf(req));
  res.json({ success: true, data });
});

export const getDeclarationProofHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = tenantIdOf(req);
  const syndicateId = syndicIdOf(req);
  const declarationId = declarationIdOf(req);
  const file = await getDeclarationProofForTenant({ tenantId, syndicateId, declarationId });
  // Une capture est une donnée personnelle (SMS, numéros) : chaque lecture laisse une trace, sans le contenu.
  logAuditEvent({
    actorUserId: actorOf(req),
    tenantId,
    actionKey: AuditActionKey.SYNDIC_PAYMENT_PROOF_VIEWED,
    entityType: 'SYNDIC_PAYMENT_DECLARATION',
    entityId: declarationId,
    payload: { declarationId, syndicateId }
  });
  sendPrivateFile(res, file, { inline: true });
});

// --- 1.9 et 1.10 : décision --------------------------------------------------

export const approveDeclarationHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = approveDeclarationBodySchema.parse(req.body ?? {});
  const tenantId = tenantIdOf(req);
  const syndicateId = syndicIdOf(req);
  const declarationId = declarationIdOf(req);

  const result = await approveDeclaration({
    tenantId,
    syndicateId,
    declarationId,
    actorUserId: actorOf(req),
    correction: body.correction ?? null,
    note: body.note ?? null
  });

  // Après le commit seulement : un échec d'envoi ne défait jamais la validation.
  scheduleChargeDocumentDelivery(tenantId, result.documents);
  notifyDeclarationApproved(tenantId, declarationId, result.documents);

  const declaration = await getDeclarationDetail(tenantId, syndicateId, declarationId);
  res.json({ success: true, data: { declaration, documents: result.documentRefs } });
});

export const rejectDeclarationHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = rejectDeclarationBodySchema.parse(req.body ?? {});
  const tenantId = tenantIdOf(req);
  const syndicateId = syndicIdOf(req);
  const declarationId = declarationIdOf(req);

  await rejectDeclaration({
    tenantId,
    syndicateId,
    declarationId,
    actorUserId: actorOf(req),
    reason: body.reason,
    note: body.note
  });
  notifyDeclarationRejected(tenantId, declarationId);

  res.json({ success: true, data: await getDeclarationDetail(tenantId, syndicateId, declarationId) });
});

// --- 1.11 : déclaration saisie par le gestionnaire (P4) ----------------------

export const createManagerDeclarationHandler = asyncHandler(async (req: Request, res: Response) => {
  const payload = parseMultipartPayload(req.body?.payload, managerDeclarationPayloadSchema);
  const tenantId = tenantIdOf(req);
  const syndicateId = syndicIdOf(req);
  const { declaredForContactId, ...input } = payload;

  const { declarationId } = await createDeclaration({
    tenantId,
    syndicateId,
    actor: { type: 'MANAGER', userId: actorOf(req), declaredForContactId: declaredForContactId ?? null },
    input,
    proof: req.file ?? null
  });
  res.status(201).json({ success: true, data: await getDeclarationDetail(tenantId, syndicateId, declarationId) });
});
