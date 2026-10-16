import type { Prisma, SyndicOnlineCheckout } from '@prisma/client';
import { prisma } from '../../../utils/database';
import { NotFoundError } from '../../../middleware/error-middleware';
import { t } from '../../../i18n';
import { assertSyndicateOfTenant } from '../charge-allocation';
import { loadAgencyFeesPaidBy } from './gateway-config';
import type {
  CheckoutOrigin,
  CoOwnerOnlineCheckout,
  DocumentRef,
  GatewayMode,
  OnlineCheckoutStatus,
  PublicCheckoutStatus,
  ReviewKind,
  ReviewResolution,
  SyndicOnlineCheckoutRow,
  SyndicOnlineCheckoutsResult
} from './types';

/**
 * Lectures et projections des tentatives de paiement en ligne (spec 042).
 *
 * Aucun DTO ne porte de clé, de jeton fournisseur ni de charge utile brute.
 * `ChargeCall` et `SyndicateLot` n'ont pas de `tenantId` : ils ne sont jamais
 * lus qu'avec des identifiants qui viennent d'une tentative DÉJÀ filtrée par
 * agence, et avec le filtre de copropriété.
 */

export const ALL_CHECKOUT_STATUSES: readonly OnlineCheckoutStatus[] = [
  'PENDING',
  'SUCCESS',
  'FAILED',
  'CANCELED',
  'EXPIRED',
  'REVIEW'
];

/** REVIEW -> PENDING (affiché « en cours de vérification »), EXPIRED -> CANCELED. */
export function toPublicStatus(status: OnlineCheckoutStatus | string): PublicCheckoutStatus {
  switch (status) {
    case 'SUCCESS':
      return 'SUCCESS';
    case 'FAILED':
      return 'FAILED';
    case 'CANCELED':
    case 'EXPIRED':
      return 'CANCELED';
    default:
      return 'PENDING';
  }
}

const num = (value: unknown): number => Number(value);
const numOrNull = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));
const iso = (value: Date | null | undefined): string | null => (value ? value.toISOString() : null);

// ---------------------------------------------------------------------------
// Données liées (par lot de tentatives)
// ---------------------------------------------------------------------------

interface CheckoutRelations {
  lots: Map<string, { id: string; lotNumber: string }>;
  contacts: Map<string, string>;
  calls: Map<string, { id: string; period: string }>;
  users: Map<string, string>;
  modes: Map<string, GatewayMode>;
}

function contactName(contact: { firstName: string; lastName: string; legalName: string | null }): string {
  const person = `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim();
  return person || contact.legalName?.trim() || '';
}

async function loadRelations(tenantId: string, rows: SyndicOnlineCheckout[]): Promise<CheckoutRelations> {
  const unique = <T>(values: Array<T | null | undefined>): T[] =>
    Array.from(new Set(values.filter((value): value is T => value !== null && value !== undefined)));
  const lotIds = unique(rows.map(row => row.lotId));
  const syndicateIds = unique(rows.map(row => row.syndicateId));
  const contactIds = unique(rows.map(row => row.contactId));
  const callIds = unique(rows.flatMap(row => row.chargeCallIds));
  const userIds = unique(rows.map(row => row.resolvedByUserId));
  const configIds = unique(rows.map(row => row.configId));

  const [lots, contacts, calls, users, configs] = await Promise.all([
    lotIds.length
      ? prisma.syndicateLot.findMany({
          where: { id: { in: lotIds }, syndicate: { tenantId } },
          select: { id: true, lotNumber: true }
        })
      : [],
    contactIds.length
      ? prisma.crmContact.findMany({
          where: { tenantId, id: { in: contactIds } },
          select: { id: true, firstName: true, lastName: true, legalName: true }
        })
      : [],
    callIds.length
      ? prisma.chargeCall.findMany({
          where: { id: { in: callIds }, syndicateId: { in: syndicateIds } },
          select: { id: true, period: true }
        })
      : [],
    userIds.length
      ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } })
      : [],
    configIds.length
      ? prisma.syndicPaymentGatewayConfig.findMany({
          where: { tenantId, id: { in: configIds } },
          select: { id: true, mode: true }
        })
      : []
  ]);

  return {
    lots: new Map(lots.map(lot => [lot.id, lot])),
    contacts: new Map(contacts.map(contact => [contact.id, contactName(contact)])),
    calls: new Map(calls.map(call => [call.id, call])),
    users: new Map(users.map(user => [user.id, user.fullName ?? ''])),
    modes: new Map(configs.map(config => [config.id, config.mode as GatewayMode]))
  };
}

function projectRow(row: SyndicOnlineCheckout, rel: CheckoutRelations): SyndicOnlineCheckoutRow {
  const lot = rel.lots.get(row.lotId);
  const payerName = row.contactId ? rel.contacts.get(row.contactId) : undefined;
  return {
    id: row.id,
    codePaiement: row.codePaiement,
    status: row.status,
    origin: row.origin,
    mode: rel.modes.get(row.configId) ?? 'SIMULATOR',
    amount: num(row.amount),
    receivedAmount: numOrNull(row.receivedAmount),
    currency: row.currency,
    lot: { id: row.lotId, lotNumber: lot?.lotNumber ?? '' },
    payer: row.contactId && payerName !== undefined ? { contactId: row.contactId, name: payerName } : null,
    chargeCalls: row.chargeCallIds.flatMap(id => {
      const call = rel.calls.get(id);
      return call ? [{ id: call.id, period: call.period }] : [];
    }),
    providerServiceName: row.providerServiceName,
    providerTransactionId: row.providerTransactionId,
    providerFees: numOrNull(row.providerFees),
    failureMessage: row.failureMessage,
    reviewKind: (row.reviewKind as ReviewKind | null) ?? null,
    reviewReason: row.reviewReason,
    resolution: (row.resolution as ReviewResolution | null) ?? null,
    resolutionNote: row.resolutionNote,
    resolvedAt: iso(row.resolvedAt),
    resolvedByName: row.resolvedByUserId ? (rel.users.get(row.resolvedByUserId) ?? null) : null,
    chargePaymentId: row.chargePaymentId,
    lastCheckedAt: iso(row.lastCheckedAt),
    createdAt: row.createdAt.toISOString(),
    completedAt: iso(row.completedAt)
  };
}

/** Lignes du suivi gestionnaire, projetées par lot (une requête par type de donnée liée). */
export async function toCheckoutRows(
  tenantId: string,
  rows: SyndicOnlineCheckout[]
): Promise<SyndicOnlineCheckoutRow[]> {
  if (rows.length === 0) return [];
  const relations = await loadRelations(tenantId, rows);
  return rows.map(row => projectRow(row, relations));
}

export async function toCheckoutRow(row: SyndicOnlineCheckout): Promise<SyndicOnlineCheckoutRow> {
  return (await toCheckoutRows(row.tenantId, [row]))[0];
}

// ---------------------------------------------------------------------------
// Liste du suivi gestionnaire (contracts §1.5)
// ---------------------------------------------------------------------------

export interface ListSyndicCheckoutsQuery {
  status?: OnlineCheckoutStatus[];
  origin?: CheckoutOrigin;
  lotId?: string;
  /** `YYYY-MM-DD`, borne basse sur `createdAt`. */
  from?: string;
  /** `YYYY-MM-DD`, borne haute INCLUSE sur `createdAt`. */
  to?: string;
  page?: number;
  limit?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function createdAtRange(query: ListSyndicCheckoutsQuery): Prisma.DateTimeFilter | undefined {
  const range: Prisma.DateTimeFilter = {};
  if (query.from) range.gte = new Date(`${query.from}T00:00:00.000Z`);
  if (query.to) range.lt = new Date(new Date(`${query.to}T00:00:00.000Z`).getTime() + DAY_MS);
  return range.gte || range.lt ? range : undefined;
}

export async function listSyndicCheckouts(
  tenantId: string,
  syndicateId: string,
  query: ListSyndicCheckoutsQuery = {}
): Promise<SyndicOnlineCheckoutsResult> {
  await assertSyndicateOfTenant(prisma, tenantId, syndicateId);

  const page = Math.max(1, Math.trunc(query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Math.trunc(query.limit ?? 20)));
  const createdAt = createdAtRange(query);
  const where: Prisma.SyndicOnlineCheckoutWhereInput = {
    tenantId,
    syndicateId,
    ...(query.status && query.status.length > 0 ? { status: { in: query.status } } : {}),
    ...(query.origin ? { origin: query.origin } : {}),
    ...(query.lotId ? { lotId: query.lotId } : {}),
    ...(createdAt ? { createdAt } : {})
  };

  const [rows, total, ...countValues] = await Promise.all([
    prisma.syndicOnlineCheckout.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.syndicOnlineCheckout.count({ where }),
    // Compteurs de TOUTE la copropriété (pastilles), indépendants du filtre et de la page.
    ...ALL_CHECKOUT_STATUSES.map(status =>
      prisma.syndicOnlineCheckout.count({ where: { tenantId, syndicateId, status } })
    )
  ]);

  const counts = Object.fromEntries(ALL_CHECKOUT_STATUSES.map((status, i) => [status, countValues[i]])) as Record<
    OnlineCheckoutStatus,
    number
  >;
  return {
    items: await toCheckoutRows(tenantId, rows),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    counts
  };
}

/** Une tentative de la copropriété de l'agence, ou le 404 uniforme. */
export async function getSyndicCheckout(
  tenantId: string,
  syndicateId: string,
  checkoutId: string
): Promise<SyndicOnlineCheckout> {
  const row = await prisma.syndicOnlineCheckout.findFirst({ where: { id: checkoutId, tenantId, syndicateId } });
  if (!row) throw new NotFoundError(t('Paiement en ligne introuvable.'));
  return row;
}

// ---------------------------------------------------------------------------
// Documents émis et réponse portail (contracts §2.3 et §2.4)
// ---------------------------------------------------------------------------

/**
 * Reçu et quittances émis par l'encaissement de la tentative : le reçu et les
 * quittances rattachés au paiement, plus les quittances des appels visés
 * émises pendant la vie de la tentative.
 */
export async function loadCheckoutDocuments(row: SyndicOnlineCheckout): Promise<DocumentRef[]> {
  if (!row.chargePaymentId) return [];
  const end = new Date((row.completedAt ?? row.updatedAt).getTime() + 60 * 1000);
  const receipts = await prisma.syndicChargeReceipt.findMany({
    where: {
      tenantId: row.tenantId,
      lotId: row.lotId,
      OR: [
        { chargePaymentId: row.chargePaymentId },
        { kind: 'QUITTANCE', chargeCallId: { in: row.chargeCallIds }, issuedAt: { gte: row.createdAt, lte: end } }
      ]
    },
    orderBy: [{ issuedAt: 'asc' }, { number: 'asc' }],
    select: { id: true, kind: true, number: true }
  });
  return receipts.map(receipt => ({
    id: receipt.id,
    kind: receipt.kind as DocumentRef['kind'],
    number: receipt.number
  }));
}

/** Réponse portail d'une tentative (`reused` ne vaut `true` que pour la reprise d'un POST). */
export async function toCoOwnerCheckout(
  row: SyndicOnlineCheckout,
  options: { reused?: boolean } = {}
): Promise<CoOwnerOnlineCheckout> {
  const { tenantId } = row;
  const [relations, syndicate, feesPaidBy, documents] = await Promise.all([
    loadRelations(tenantId, [row]),
    prisma.syndicate.findFirst({ where: { id: row.syndicateId, tenantId }, select: { id: true, name: true } }),
    loadAgencyFeesPaidBy(tenantId),
    row.status === 'SUCCESS' ? loadCheckoutDocuments(row) : Promise.resolve([] as DocumentRef[])
  ]);
  const periods = row.chargeCallIds.flatMap(id => {
    const call = relations.calls.get(id);
    return call ? [call.period] : [];
  });
  return {
    codePaiement: row.codePaiement,
    status: toPublicStatus(row.status),
    underReview: row.status === 'REVIEW',
    amount: num(row.amount),
    currency: row.currency,
    chargeCallIds: row.chargeCallIds,
    periods,
    // L'URL n'est utile que tant que le payeur peut encore payer.
    checkoutUrl: row.status === 'PENDING' ? row.checkoutUrl : null,
    reused: options.reused ?? false,
    lot: { id: row.lotId, lotNumber: relations.lots.get(row.lotId)?.lotNumber ?? '' },
    syndicate: { id: row.syndicateId, name: syndicate?.name ?? '' },
    mode: relations.modes.get(row.configId) ?? 'SIMULATOR',
    feesPaidBy,
    documents,
    createdAt: row.createdAt.toISOString(),
    completedAt: iso(row.completedAt)
  };
}
