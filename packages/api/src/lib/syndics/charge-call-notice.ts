import type { Prisma } from '@prisma/client';
import { prisma } from '../../utils/database';
import { NotFoundError } from '../../middleware/error-middleware';
import type { PrivateFile } from '../files/private-files';
import { resolveDocumentBranding, type DocumentBranding } from '../documents/document-branding';
import { fromCents, toCents } from './charge-allocation-plan';
import { contactDisplayName, isoDay, lotTypeLabel } from './charge-receipt-snapshot';
import type { CoOwnerPortalScope } from './coowner-portal';
import {
  chargeCallNoticeFileName,
  renderChargeCallNoticePdf,
  type ChargeCallNoticeData
} from './charge-call-notice-pdf';
import type { NotificationAttachment } from './notifications';

/**
 * Avis d'appel de charges (lot S4) : lecture de l'appel dans le périmètre de
 * l'appelant, puis rendu PDF. Trois portes d'entrée :
 * - la gestion (`getChargeCallNoticeForTenant`) : appel de la copropriété de
 *   l'agence, sinon 404 ;
 * - le portail copropriétaire (`getChargeCallNoticeForCoOwner`) : appel d'un
 *   lot du périmètre de la session, sinon 404 (même réponse qu'un appel
 *   inexistant) ;
 * - l'envoi automatique (`buildChargeCallNoticeAttachment`), en pièce jointe
 *   de l'e-mail `CHARGE_CALL_ISSUED`.
 */

const CONTACT_SELECT = { firstName: true, lastName: true, legalName: true, address: true } as const;

const NOTICE_CALL_SELECT = {
  id: true,
  syndicateId: true,
  lotId: true,
  period: true,
  periodStart: true,
  periodEnd: true,
  amount: true,
  currency: true,
  dueDate: true,
  createdAt: true,
  allocations: { select: { amount: true, source: true } },
  lot: {
    select: {
      lotNumber: true,
      lotType: true,
      owner: { select: CONTACT_SELECT },
      coowner: { select: CONTACT_SELECT },
      property: { select: { title: true } }
    }
  }
} satisfies Prisma.ChargeCallSelect;

type NoticeCall = Prisma.ChargeCallGetPayload<{ select: typeof NOTICE_CALL_SELECT }>;

async function loadPaymentMethods(syndicateId: string) {
  const methods = await prisma.syndicPaymentMethod.findMany({
    where: { syndicateId, isActive: true },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: { type: true, label: true, provider: true, accountRef: true }
  });
  return methods.map(method => ({
    type: String(method.type),
    label: method.label,
    provider: method.provider ?? null,
    accountRef: method.accountRef ?? null
  }));
}

type NoticeContact = {
  firstName: string | null;
  lastName: string | null;
  legalName: string | null;
  address: string | null;
};

/**
 * Données de l'avis : montants en centimes pour ne perdre aucun centime.
 * `recipient` : le destinataire à imprimer quand il est connu (portail : le
 * contact de la session) ; sinon le propriétaire du lot.
 */
export function toNoticeData(
  call: NoticeCall,
  paymentMethods: ChargeCallNoticeData['paymentMethods'],
  recipient?: NoticeContact | null
): ChargeCallNoticeData {
  const amountCents = toCents(call.amount);
  const sumOf = (source: string) =>
    (call.allocations ?? [])
      .filter(allocation => String(allocation.source ?? 'PAYMENT') === source)
      .reduce((sum, allocation) => sum + toCents(allocation.amount), 0);
  const advanceCents = sumOf('ADVANCE');
  const paidCents = sumOf('PAYMENT');
  const contact = recipient ?? call.lot?.owner ?? call.lot?.coowner ?? null;
  const trim = (value: string | null | undefined) => value?.trim() || null;
  return {
    chargeCallId: call.id,
    period: { label: call.period, start: isoDay(call.periodStart), end: isoDay(call.periodEnd) },
    issuedAt: new Date(call.createdAt).toISOString(),
    dueDate: new Date(call.dueDate).toISOString(),
    currency: call.currency,
    amount: fromCents(amountCents),
    advanceImputed: fromCents(advanceCents),
    paid: fromCents(paidCents),
    outstanding: fromCents(Math.max(0, amountCents - advanceCents - paidCents)),
    lot: {
      number: call.lot?.lotNumber ?? '',
      type: lotTypeLabel(call.lot?.lotType),
      label: trim(call.lot?.property?.title)
    },
    coowner: contact ? { name: contactDisplayName(contact) ?? 'Copropriétaire', address: trim(contact.address) } : null,
    paymentMethods
  };
}

/** Ce qui est commun à tous les avis d'une copropriété : identité et moyens de paiement. */
export interface NoticeRenderContext {
  syndicateId: string;
  branding: DocumentBranding;
  paymentMethods: ChargeCallNoticeData['paymentMethods'];
}

/**
 * Lu une fois par exécution de programmation, puis réutilisé pour chaque avis.
 *
 * L'avis est une DEMANDE de paiement, pas une pièce qui atteste quoi que ce
 * soit : il ne porte ni signature ni cachet (décision de l'audit S4, comme le
 * relevé du portail S5), sur le portail comme dans l'e-mail. Les logos
 * restent. Les quittances S3, elles, gardent leur signature.
 */
export async function loadNoticeRenderContext(tenantId: string, syndicateId: string): Promise<NoticeRenderContext> {
  const [branding, paymentMethods] = await Promise.all([
    resolveDocumentBranding(tenantId, syndicateId),
    loadPaymentMethods(syndicateId)
  ]);
  return { syndicateId, branding: { ...branding, signature: null, stamp: null }, paymentMethods };
}

async function renderNotice(
  tenantId: string,
  call: NoticeCall,
  options: { context?: NoticeRenderContext; recipient?: NoticeContact | null } = {}
): Promise<PrivateFile> {
  const context =
    options.context && options.context.syndicateId === call.syndicateId
      ? options.context
      : await loadNoticeRenderContext(tenantId, call.syndicateId);
  const data = toNoticeData(call, context.paymentMethods, options.recipient);
  return {
    buffer: await renderChargeCallNoticePdf(data, context.branding),
    fileName: chargeCallNoticeFileName(data),
    mimeType: 'application/pdf'
  };
}

async function findTenantCall(tenantId: string, syndicateId: string, chargeCallId: string) {
  const call = await prisma.chargeCall.findFirst({
    where: { id: chargeCallId, syndicateId, syndicate: { tenantId } },
    select: NOTICE_CALL_SELECT
  });
  if (!call) throw new NotFoundError('Appel de charges introuvable.');
  return call;
}

/** Gestion : avis d'un appel de la copropriété `syndicateId` de l'agence. */
export async function getChargeCallNoticeForTenant(
  tenantId: string,
  syndicateId: string,
  chargeCallId: string
): Promise<PrivateFile> {
  return renderNotice(tenantId, await findTenantCall(tenantId, syndicateId, chargeCallId));
}

/**
 * Portail : avis d'un appel d'un lot du périmètre (`resolveCoOwnerScope`).
 * Les copropriétés du périmètre sont déjà vérifiées comme étant de l'agence.
 * Le destinataire imprimé est le contact de la session pour ce lot (relu
 * avec le filtre d'agence), jamais un autre propriétaire du lot.
 */
export async function getChargeCallNoticeForCoOwner(
  scope: CoOwnerPortalScope,
  chargeCallId: string
): Promise<PrivateFile> {
  if (scope.lotIds.length === 0) throw new NotFoundError('Appel de charges introuvable.');
  const call = await prisma.chargeCall.findFirst({
    where: { id: chargeCallId, lotId: { in: scope.lotIds }, syndicateId: { in: scope.syndicateIds } },
    select: NOTICE_CALL_SELECT
  });
  const lotScope = call ? scope.lots.find(lot => lot.lotId === call.lotId) : undefined;
  if (!call || !lotScope || lotScope.syndicateId !== call.syndicateId) {
    throw new NotFoundError('Appel de charges introuvable.');
  }
  const recipient = await prisma.crmContact.findFirst({
    where: { id: lotScope.contactId, tenantId: scope.tenantId },
    select: CONTACT_SELECT
  });
  return renderNotice(scope.tenantId, call, { recipient });
}

/** Envoi automatique : l'avis en pièce jointe d'e-mail (`context` : identité déjà lue). */
export async function buildChargeCallNoticeAttachment(
  tenantId: string,
  syndicateId: string,
  chargeCallId: string,
  context?: NoticeRenderContext
): Promise<NotificationAttachment> {
  const call = await findTenantCall(tenantId, syndicateId, chargeCallId);
  const file = await renderNotice(tenantId, call, { context });
  return { filename: file.fileName, content: file.buffer, contentType: file.mimeType };
}
