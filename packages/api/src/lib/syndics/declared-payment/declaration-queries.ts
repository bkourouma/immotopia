import type { Prisma } from '@prisma/client';
import { prisma } from '../../../utils/database';
import { BadRequestError, NotFoundError } from '../../../middleware/error-middleware';
import { t } from '../../../i18n';
import { assertSyndicateOfTenant } from '../charge-allocation';
import { fromCents, toCents } from '../charge-allocation-plan';
import type { CoOwnerPortalScope } from '../coowner-portal';
import { isOverdue } from './business-days';
import {
  DECLARATION_ALERTS_SELECT,
  DUPLICATE_PROBE_SELECT,
  computeDeclarationAlertsBatch,
  editedFieldsOf,
  findDeclarationsOnExistingPayment,
  loadDuplicateCandidates,
  matchProbableDuplicates,
  resolveLineTargets,
  type DeclarationForAlerts,
  type LineTargetInput
} from './declaration-alerts';
import { getDeclaredPaymentRules } from './settings';
import type {
  CoOwnerDeclaration,
  DeclarationAlert,
  DeclarationRejectReason,
  DeclarationStatus,
  DocumentRef,
  ListDeclarationsResponse,
  MobileMoneyOperator,
  Pagination,
  SyndicDeclarationRow
} from './types';

/**
 * Lectures des déclarations de paiement (spec 047) : liste et détail
 * gestionnaire (contrats §1.6, §1.7), vues du portail copropriétaire (§2.5) et
 * indicateur « déclaré en vérification » par appel (§2.2, §3.1, §3.2).
 *
 * Aucune écriture. Toute requête sur `SyndicPaymentDeclaration` porte
 * `tenantId` ; les lots, appels et paiements (sans `tenantId`) ne sont lus
 * qu'avec des identifiants issus d'une déclaration de l'agence.
 *
 * Volume supposé : le tri « en retard, doublons, ancienneté » exige les
 * drapeaux de TOUTES les déclarations `PENDING` de la copropriété ; elles sont
 * donc chargées (colonnes minimales) puis triées en mémoire avant pagination.
 * La limite de 10 `PENDING` par lot (`MAX_PENDING_PER_LOT`) borne ce chargement
 * à quelques milliers de lignes pour la plus grande copropriété ; au-delà il
 * faudra une colonne de drapeaux ou une requête SQL dédiée. Les autres statuts
 * (historique, non borné) sont paginés en base.
 */

export const DEFAULT_LIST_LIMIT = 20;
export const MAX_LIST_LIMIT = 100;
export const DEFAULT_PORTAL_LIMIT = 20;
export const MAX_PORTAL_LIMIT = 50;

const NON_PENDING_STATUSES: DeclarationStatus[] = ['APPROVED', 'REJECTED', 'CANCELED'];
/** Marge autour de la validation pour rattacher les quittances au paiement de la ligne. */
const DOCUMENT_WINDOW_MS = 60 * 1000;

const notFound = () => new NotFoundError(t('Déclaration introuvable.'));

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

function clampPage(value: number | undefined): number {
  return Number.isFinite(value) && (value as number) >= 1 ? Math.floor(value as number) : 1;
}

function clampLimit(value: number | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(value) || (value as number) < 1) return fallback;
  return Math.min(Math.floor(value as number), max);
}

function paginationOf(page: number, limit: number, total: number): Pagination {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

/** Début (inclus) ou fin (incluse) d'un jour `YYYY-MM-DD`, en UTC. */
function dayBound(value: string, end: boolean, field: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestError(t('Date invalide : le format attendu est AAAA-MM-JJ.'), [
      { field, message: t('Date invalide : le format attendu est AAAA-MM-JJ.') }
    ]);
  }
  const date = new Date(`${value}T${end ? '23:59:59.999' : '00:00:00.000'}Z`);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestError(t('Date invalide : le format attendu est AAAA-MM-JJ.'), [
      { field, message: t('Date invalide : le format attendu est AAAA-MM-JJ.') }
    ]);
  }
  return date;
}

function contactDisplayName(
  contact: { firstName?: string | null; lastName?: string | null; legalName?: string | null } | undefined
): string {
  if (!contact) return t('Copropriétaire');
  const person = [contact.firstName, contact.lastName]
    .map(part => part?.trim())
    .filter(Boolean)
    .join(' ');
  return person || contact.legalName?.trim() || t('Copropriétaire');
}

const amountOf = (value: unknown): number => fromCents(toCents(value));
const nullableAmountOf = (value: unknown): number | null =>
  value === null || value === undefined ? null : amountOf(value);
const isoOf = (value: Date | null | undefined): string | null => (value ? value.toISOString() : null);

// ---------------------------------------------------------------------------
// Documents émis par la validation
// ---------------------------------------------------------------------------

/**
 * Reçus et quittances émis par la validation de chaque ligne.
 *
 * Le reçu porte `chargePaymentId`. Une quittance porte l'appel soldé, pas le
 * paiement : elle est rattachée à la ligne quand son appel a reçu une
 * affectation de ce paiement ET qu'elle a été émise pendant la validation
 * (de la création du paiement à `reviewedAt`, à une minute près).
 */
async function loadLineDocuments(
  tenantId: string,
  lines: Array<{ lineId: string; chargePaymentId: string | null }>,
  reviewedAtByLine: Map<string, Date | null>
): Promise<Map<string, DocumentRef[]>> {
  const result = new Map<string, DocumentRef[]>();
  const paid = lines.filter(line => line.chargePaymentId);
  if (paid.length === 0) return result;
  const paymentIds = Array.from(new Set(paid.map(line => line.chargePaymentId as string)));

  const payments = await prisma.chargePayment.findMany({
    where: { id: { in: paymentIds } },
    select: { id: true, createdAt: true, allocations: { select: { chargeCallId: true } } }
  });
  const paymentById = new Map(payments.map(payment => [payment.id, payment]));
  const callIds = Array.from(new Set(payments.flatMap(payment => payment.allocations.map(a => a.chargeCallId))));

  const receipts = await prisma.syndicChargeReceipt.findMany({
    where: {
      tenantId,
      OR: [
        { chargePaymentId: { in: paymentIds } },
        ...(callIds.length > 0 ? [{ kind: 'QUITTANCE' as const, chargeCallId: { in: callIds } }] : [])
      ]
    },
    orderBy: [{ issuedAt: 'asc' }, { number: 'asc' }],
    select: { id: true, kind: true, number: true, chargePaymentId: true, chargeCallId: true, issuedAt: true }
  });

  for (const line of paid) {
    const payment = paymentById.get(line.chargePaymentId as string);
    if (!payment) continue;
    const callSet = new Set(payment.allocations.map(allocation => allocation.chargeCallId));
    const from = payment.createdAt.getTime() - DOCUMENT_WINDOW_MS;
    const to = (reviewedAtByLine.get(line.lineId) ?? payment.createdAt).getTime() + DOCUMENT_WINDOW_MS;
    const documents = receipts
      .filter(receipt => {
        if (receipt.chargePaymentId === payment.id) return true;
        return (
          receipt.kind === 'QUITTANCE' &&
          receipt.chargeCallId !== null &&
          callSet.has(receipt.chargeCallId) &&
          receipt.issuedAt.getTime() >= from &&
          receipt.issuedAt.getTime() <= to
        );
      })
      .map(receipt => ({ id: receipt.id, kind: receipt.kind as DocumentRef['kind'], number: receipt.number }))
      // Ordre stable : le reçu d'abord, puis la quittance, puis par numéro.
      .sort((a, b) => (a.kind === b.kind ? a.number.localeCompare(b.number) : a.kind === 'RECEIPT' ? -1 : 1));
    result.set(line.lineId, documents);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Côté gestionnaire : lignes de liste et détail
// ---------------------------------------------------------------------------

/** Sélection complète d'une déclaration pour `SyndicDeclarationRow`. Aucun objet `User` complet. */
const SYNDIC_ROW_SELECT = {
  ...DECLARATION_ALERTS_SELECT,
  receivingOperator: true,
  receivingHolderName: true,
  declaredByUserId: true,
  acceptedAmount: true,
  acceptedPaidAt: true,
  proofFileUrl: true,
  comment: true,
  rejectReason: true,
  reviewNote: true,
  reviewedByUserId: true,
  reviewedAt: true,
  lines: {
    select: {
      id: true,
      lotId: true,
      amount: true,
      acceptedAmount: true,
      chargeCallIds: true,
      chargePaymentId: true,
      lot: { select: { id: true, lotNumber: true } }
    },
    orderBy: { createdAt: 'asc' }
  }
} satisfies Prisma.SyndicPaymentDeclarationSelect;

type SyndicRowSource = Omit<DeclarationForAlerts, 'lines'> & {
  receivingOperator: MobileMoneyOperator;
  receivingHolderName: string;
  declaredByUserId: string | null;
  acceptedAmount: unknown;
  acceptedPaidAt: Date | null;
  proofFileUrl: string | null;
  comment: string | null;
  rejectReason: DeclarationRejectReason | null;
  reviewNote: string | null;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  lines: Array<
    DeclarationForAlerts['lines'][number] & {
      acceptedAmount: unknown;
      lot: { id: string; lotNumber: string } | null;
    }
  >;
};

async function loadNames(tenantId: string, contactIds: string[], userIds: string[]) {
  const [contacts, users] = await Promise.all([
    contactIds.length === 0
      ? Promise.resolve([])
      : prisma.crmContact.findMany({
          where: { tenantId, id: { in: contactIds } },
          select: { id: true, firstName: true, lastName: true, legalName: true }
        }),
    userIds.length === 0
      ? Promise.resolve([])
      : prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } })
  ]);
  return {
    contacts: new Map(contacts.map(contact => [contact.id, contact])),
    users: new Map(users.map(user => [user.id, user.fullName?.trim() || null]))
  };
}

/** Transforme des déclarations chargées avec `SYNDIC_ROW_SELECT` en lignes gestionnaire, dans l'ordre reçu. */
async function buildSyndicRows(
  tenantId: string,
  declarations: SyndicRowSource[],
  now: Date
): Promise<SyndicDeclarationRow[]> {
  if (declarations.length === 0) return [];

  const targetInputs: LineTargetInput[] = declarations.flatMap(declaration =>
    declaration.lines
      // Hors attente, des appels non précisés n'ont plus de cible lisible : seuls les appels nommés sont montrés.
      .filter(line => declaration.status === 'PENDING' || line.chargeCallIds.length > 0)
      .map(line => ({
        key: line.id,
        syndicateId: declaration.syndicateId,
        lotId: line.lotId,
        amountCents: toCents(line.amount),
        chargeCallIds: line.chargeCallIds
      }))
  );
  const reviewedAtByLine = new Map<string, Date | null>();
  for (const declaration of declarations) {
    for (const line of declaration.lines) reviewedAtByLine.set(line.id, declaration.reviewedAt);
  }
  const contactIds = Array.from(
    new Set(declarations.map(d => d.declaredByContactId).filter((id): id is string => Boolean(id)))
  );
  const userIds = Array.from(
    new Set(
      declarations.flatMap(d => [d.declaredByUserId, d.reviewedByUserId]).filter((id): id is string => Boolean(id))
    )
  );

  const [alertsById, targets, names, documents] = await Promise.all([
    computeDeclarationAlertsBatch(prisma, declarations, now),
    resolveLineTargets(prisma, targetInputs),
    loadNames(tenantId, contactIds, userIds),
    loadLineDocuments(
      tenantId,
      declarations.flatMap(d =>
        d.lines.map(line => ({ lineId: line.id, chargePaymentId: line.chargePaymentId ?? null }))
      ),
      reviewedAtByLine
    )
  ]);

  return declarations.map(declaration => {
    const alerts: DeclarationAlert[] = alertsById.get(declaration.id) ?? [];
    const declaredBy: SyndicDeclarationRow['declaredBy'] = declaration.declaredByContactId
      ? {
          type: 'COOWNER',
          contactId: declaration.declaredByContactId,
          name: contactDisplayName(names.contacts.get(declaration.declaredByContactId))
        }
      : {
          type: 'MANAGER',
          userId: declaration.declaredByUserId ?? '',
          name: (declaration.declaredByUserId && names.users.get(declaration.declaredByUserId)) || t('Gestionnaire')
        };
    return {
      id: declaration.id,
      status: declaration.status,
      receivingNumber: {
        id: declaration.receivingNumberId,
        operator: declaration.receivingOperator,
        phoneNumber: declaration.receivingPhone,
        holderName: declaration.receivingHolderName
      },
      declaredBy,
      payerPhone: declaration.payerPhone,
      amount: amountOf(declaration.amount),
      acceptedAmount: nullableAmountOf(declaration.acceptedAmount),
      paidAt: declaration.paidAt.toISOString(),
      acceptedPaidAt: isoOf(declaration.acceptedPaidAt),
      transactionReference: declaration.transactionReference,
      lines: declaration.lines.map(line => ({
        id: line.id,
        lot: { id: line.lotId, lotNumber: line.lot?.lotNumber ?? '' },
        amount: amountOf(line.amount),
        acceptedAmount: nullableAmountOf(line.acceptedAmount),
        chargeCalls: (targets.get(line.id)?.calls ?? []).map(call => ({
          id: call.id,
          period: call.period,
          remainingDue: fromCents(call.remainingCents)
        })),
        chargePaymentId: line.chargePaymentId ?? null,
        documents: documents.get(line.id) ?? []
      })),
      hasProof: Boolean(declaration.proofFileUrl),
      aiPrefilled: declaration.aiPrefill !== null && declaration.aiPrefill !== undefined,
      aiEditedFields: editedFieldsOf(declaration.aiEditedFields),
      overdue: alerts.some(alert => alert.kind === 'OVERDUE'),
      alerts,
      comment: declaration.comment,
      rejectReason: declaration.rejectReason,
      reviewNote: declaration.reviewNote,
      reviewedAt: isoOf(declaration.reviewedAt),
      reviewedByName: declaration.reviewedByUserId ? (names.users.get(declaration.reviewedByUserId) ?? null) : null,
      createdAt: declaration.createdAt.toISOString()
    };
  });
}

// ---------------------------------------------------------------------------
// §1.6 Liste
// ---------------------------------------------------------------------------

export interface ListDeclarationsParams {
  tenantId: string;
  syndicateId: string;
  /** Défaut `PENDING` ; `ALL` pour tous les statuts. */
  status?: DeclarationStatus | 'ALL';
  receivingNumberId?: string;
  lotId?: string;
  /** `YYYY-MM-DD`, borne incluse sur `paidAt` (UTC). */
  from?: string;
  to?: string;
  /** `true` : seulement les déclarations en attente depuis N jours ouvrés ou plus. */
  overdue?: boolean;
  page?: number;
  limit?: number;
  now?: Date;
}

/**
 * Liste des déclarations d'une copropriété.
 *
 * Tri : pour `PENDING`, en retard d'abord, puis doublons suspectés, puis
 * `createdAt` croissant ; pour les autres statuts, `reviewedAt` décroissant
 * (une déclaration annulée n'a pas de `reviewedAt` : elle suit, par `createdAt`
 * décroissant). Avec `ALL`, les `PENDING` (triées comme ci-dessus) précèdent
 * les autres. `overdue=true` ne retient que des `PENDING`.
 *
 * `counts` porte sur TOUTES les `PENDING` de la copropriété, sans les filtres.
 */
export async function listDeclarations(params: ListDeclarationsParams): Promise<ListDeclarationsResponse> {
  const { tenantId, syndicateId } = params;
  const now = params.now ?? new Date();
  const status = params.status ?? 'PENDING';
  const page = clampPage(params.page);
  const limit = clampLimit(params.limit, DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
  const from = params.from ? dayBound(params.from, false, 'from') : null;
  const to = params.to ? dayBound(params.to, true, 'to') : null;

  await assertSyndicateOfTenant(prisma, tenantId, syndicateId);

  // Phase 1 : toutes les PENDING de la copropriété, colonnes minimales, drapeaux calculés.
  const rules = await getDeclaredPaymentRules(prisma, tenantId, syndicateId);
  const pendingAll = await prisma.syndicPaymentDeclaration.findMany({
    where: { tenantId, syndicateId, status: 'PENDING' },
    select: { ...DUPLICATE_PROBE_SELECT, lines: { select: { lotId: true } } },
    orderBy: { createdAt: 'asc' }
  });
  const pool = await loadDuplicateCandidates(prisma, tenantId, syndicateId, pendingAll);
  // « Doublon suspecté » = doublon probable (R10) OU référence déjà portée par un paiement enregistré (R17).
  const onExistingPayment = await findDeclarationsOnExistingPayment(
    prisma,
    pendingAll.map(declaration => ({ ...declaration, syndicateId }))
  );
  const flagged = pendingAll.map(declaration => ({
    declaration,
    overdue: isOverdue(declaration.createdAt, rules.reviewAlertBusinessDays, now),
    duplicate: matchProbableDuplicates(declaration, pool).length > 0 || onExistingPayment.has(declaration.id)
  }));
  const counts = {
    pending: flagged.length,
    overdue: flagged.filter(entry => entry.overdue).length,
    suspectedDuplicate: flagged.filter(entry => entry.duplicate).length
  };

  const includePending = status === 'PENDING' || status === 'ALL';
  const otherStatuses: DeclarationStatus[] =
    params.overdue === true ? [] : status === 'ALL' ? NON_PENDING_STATUSES : status === 'PENDING' ? [] : [status];

  // Phase 2a : PENDING filtrées en mémoire, puis triées.
  const pendingSorted = includePending
    ? flagged
        .filter(({ declaration, overdue }) => {
          if (params.overdue === true && !overdue) return false;
          if (params.receivingNumberId && declaration.receivingNumberId !== params.receivingNumberId) return false;
          if (params.lotId && !declaration.lines.some(line => line.lotId === params.lotId)) return false;
          if (from && declaration.paidAt.getTime() < from.getTime()) return false;
          if (to && declaration.paidAt.getTime() > to.getTime()) return false;
          return true;
        })
        .sort(
          (a, b) =>
            Number(b.overdue) - Number(a.overdue) ||
            Number(b.duplicate) - Number(a.duplicate) ||
            a.declaration.createdAt.getTime() - b.declaration.createdAt.getTime() ||
            (a.declaration.id < b.declaration.id ? -1 : 1)
        )
        .map(entry => entry.declaration.id)
    : [];

  // Phase 2b : autres statuts, paginés en base.
  const otherWhere: Prisma.SyndicPaymentDeclarationWhereInput = {
    tenantId,
    syndicateId,
    status: { in: otherStatuses },
    ...(params.receivingNumberId ? { receivingNumberId: params.receivingNumberId } : {}),
    ...(params.lotId ? { lines: { some: { lotId: params.lotId } } } : {}),
    ...(from || to ? { paidAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {})
  };
  const otherTotal = otherStatuses.length > 0 ? await prisma.syndicPaymentDeclaration.count({ where: otherWhere }) : 0;

  const total = pendingSorted.length + otherTotal;
  const offset = (page - 1) * limit;
  const pendingPageIds = pendingSorted.slice(offset, offset + limit);
  const missing = limit - pendingPageIds.length;

  const [pendingRows, otherRows] = await Promise.all([
    pendingPageIds.length === 0
      ? Promise.resolve([] as SyndicRowSource[])
      : (prisma.syndicPaymentDeclaration.findMany({
          where: { tenantId, syndicateId, id: { in: pendingPageIds } },
          select: SYNDIC_ROW_SELECT
        }) as unknown as Promise<SyndicRowSource[]>),
    missing > 0 && otherTotal > 0
      ? (prisma.syndicPaymentDeclaration.findMany({
          where: otherWhere,
          select: SYNDIC_ROW_SELECT,
          orderBy: [{ reviewedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
          skip: Math.max(0, offset - pendingSorted.length),
          take: missing
        }) as unknown as Promise<SyndicRowSource[]>)
      : Promise.resolve([] as SyndicRowSource[])
  ]);
  const byId = new Map(pendingRows.map(row => [row.id, row]));
  const ordered = [
    ...pendingPageIds.map(id => byId.get(id)).filter((row): row is SyndicRowSource => Boolean(row)),
    ...otherRows
  ];

  return {
    items: await buildSyndicRows(tenantId, ordered, now),
    pagination: paginationOf(page, limit, total),
    counts
  };
}

// ---------------------------------------------------------------------------
// §1.7 Détail
// ---------------------------------------------------------------------------

/**
 * Détail d'une déclaration : alertes complètes et reste dû ACTUEL de chaque
 * appel visé. 404 pour une déclaration inexistante, d'une autre agence ou
 * d'une autre copropriété.
 */
export async function getDeclarationDetail(
  tenantId: string,
  syndicateId: string,
  declarationId: string,
  now: Date = new Date()
): Promise<SyndicDeclarationRow> {
  const declaration = (await prisma.syndicPaymentDeclaration.findFirst({
    where: { id: declarationId, tenantId, syndicateId },
    select: SYNDIC_ROW_SELECT
  })) as unknown as SyndicRowSource | null;
  if (!declaration) throw notFound();
  const [row] = await buildSyndicRows(tenantId, [declaration], now);
  return row;
}

// ---------------------------------------------------------------------------
// §2.5 Portail copropriétaire
// ---------------------------------------------------------------------------

const CO_OWNER_SELECT = {
  id: true,
  syndicateId: true,
  status: true,
  receivingOperator: true,
  receivingPhone: true,
  receivingHolderName: true,
  declaredByContactId: true,
  payerPhone: true,
  amount: true,
  acceptedAmount: true,
  paidAt: true,
  transactionReference: true,
  rejectReason: true,
  reviewNote: true,
  reviewedAt: true,
  createdAt: true,
  lines: {
    select: {
      id: true,
      lotId: true,
      amount: true,
      acceptedAmount: true,
      chargeCallIds: true,
      chargePaymentId: true,
      lot: { select: { id: true, lotNumber: true } }
    },
    orderBy: { createdAt: 'asc' }
  }
} satisfies Prisma.SyndicPaymentDeclarationSelect;

type CoOwnerSource = {
  id: string;
  syndicateId: string;
  status: DeclarationStatus;
  receivingOperator: MobileMoneyOperator;
  receivingPhone: string;
  receivingHolderName: string;
  declaredByContactId: string | null;
  payerPhone: string;
  amount: unknown;
  acceptedAmount: unknown;
  paidAt: Date;
  transactionReference: string;
  rejectReason: DeclarationRejectReason | null;
  reviewNote: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  lines: Array<{
    id: string;
    lotId: string;
    amount: unknown;
    acceptedAmount: unknown;
    chargeCallIds: string[];
    chargePaymentId: string | null;
    lot: { id: string; lotNumber: string } | null;
  }>;
};

/**
 * Filtre de périmètre : TOUTES les lignes sur des lots du copropriétaire (et
 * au moins une, pour écarter une déclaration sans ligne), dans les copropriétés
 * de son périmètre.
 */
function coOwnerScopeWhere(scope: CoOwnerPortalScope): Prisma.SyndicPaymentDeclarationWhereInput {
  return {
    tenantId: scope.tenantId,
    syndicateId: { in: scope.syndicateIds },
    lines: { some: { lotId: { in: scope.lotIds } }, every: { lotId: { in: scope.lotIds } } }
  };
}

async function buildCoOwnerDeclarations(
  scope: CoOwnerPortalScope,
  sources: CoOwnerSource[]
): Promise<CoOwnerDeclaration[]> {
  // Deuxième garde, indépendante du filtre SQL : une ligne hors périmètre fait disparaître la déclaration.
  const allowedLots = new Set(scope.lotIds);
  const allowedContacts = new Set(scope.contactIds);
  const inScope = sources.filter(
    source => source.lines.length > 0 && source.lines.every(line => allowedLots.has(line.lotId))
  );
  if (inScope.length === 0) return [];

  const syndicateIds = Array.from(new Set(inScope.map(source => source.syndicateId)));
  const approvedLines = inScope
    .filter(source => source.status === 'APPROVED')
    .flatMap(source => source.lines.map(line => ({ line, source })));
  const reviewedAtByLine = new Map(approvedLines.map(({ line, source }) => [line.id, source.reviewedAt]));

  const [syndicates, documents] = await Promise.all([
    prisma.syndicate.findMany({
      where: { tenantId: scope.tenantId, id: { in: syndicateIds } },
      select: { id: true, name: true }
    }),
    loadLineDocuments(
      scope.tenantId,
      approvedLines.map(({ line }) => ({ lineId: line.id, chargePaymentId: line.chargePaymentId })),
      reviewedAtByLine
    )
  ]);
  const syndicateById = new Map(syndicates.map(syndicate => [syndicate.id, syndicate]));

  return inScope.map(source => {
    const seen = new Set<string>();
    const merged: DocumentRef[] = [];
    for (const line of source.lines) {
      for (const document of documents.get(line.id) ?? []) {
        if (seen.has(document.id)) continue;
        seen.add(document.id);
        merged.push(document);
      }
    }
    const syndicate = syndicateById.get(source.syndicateId);
    return {
      id: source.id,
      status: source.status,
      syndicate: { id: source.syndicateId, name: syndicate?.name ?? '' },
      receivingNumber: {
        operator: source.receivingOperator,
        phoneNumber: source.receivingPhone,
        holderName: source.receivingHolderName
      },
      payerPhone: source.payerPhone,
      amount: amountOf(source.amount),
      acceptedAmount: nullableAmountOf(source.acceptedAmount),
      paidAt: source.paidAt.toISOString(),
      transactionReference: source.transactionReference,
      lines: source.lines.map(line => ({
        lot: { id: line.lotId, lotNumber: line.lot?.lotNumber ?? '' },
        amount: amountOf(line.amount),
        acceptedAmount: nullableAmountOf(line.acceptedAmount),
        chargeCallIds: line.chargeCallIds
      })),
      documents: merged,
      rejectReason: source.rejectReason,
      reviewNote: source.reviewNote,
      // Seul le déclarant (un contact du compte) peut annuler, tant que la déclaration attend.
      canCancel:
        source.status === 'PENDING' &&
        Boolean(source.declaredByContactId) &&
        allowedContacts.has(source.declaredByContactId as string),
      createdAt: source.createdAt.toISOString(),
      reviewedAt: isoOf(source.reviewedAt)
    };
  });
}

/** Détail d'une déclaration du copropriétaire. 404 uniforme hors périmètre. */
export async function getCoOwnerDeclaration(
  scope: CoOwnerPortalScope,
  declarationId: string
): Promise<CoOwnerDeclaration> {
  if (scope.lotIds.length === 0) throw notFound();
  const source = (await prisma.syndicPaymentDeclaration.findFirst({
    where: { ...coOwnerScopeWhere(scope), id: declarationId },
    select: CO_OWNER_SELECT
  })) as unknown as CoOwnerSource | null;
  if (!source) throw notFound();
  const [declaration] = await buildCoOwnerDeclarations(scope, [source]);
  if (!declaration) throw notFound();
  return declaration;
}

/**
 * Déclarations du copropriétaire, les plus récentes d'abord. Seules celles dont
 * toutes les lignes portent sur ses lots (celles que le gestionnaire a saisies
 * pour son compte comprises).
 */
export async function listCoOwnerDeclarations(
  scope: CoOwnerPortalScope,
  params: { status?: DeclarationStatus; page?: number; limit?: number }
): Promise<{ items: CoOwnerDeclaration[]; pagination: Pagination }> {
  const page = clampPage(params.page);
  const limit = clampLimit(params.limit, DEFAULT_PORTAL_LIMIT, MAX_PORTAL_LIMIT);
  if (scope.lotIds.length === 0) return { items: [], pagination: paginationOf(page, limit, 0) };

  const where: Prisma.SyndicPaymentDeclarationWhereInput = {
    ...coOwnerScopeWhere(scope),
    ...(params.status ? { status: params.status } : {})
  };
  const [total, sources] = await Promise.all([
    prisma.syndicPaymentDeclaration.count({ where }),
    prisma.syndicPaymentDeclaration.findMany({
      where,
      select: CO_OWNER_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit
    }) as unknown as Promise<CoOwnerSource[]>
  ]);
  return { items: await buildCoOwnerDeclarations(scope, sources), pagination: paginationOf(page, limit, total) };
}

// ---------------------------------------------------------------------------
// Appels visés par une déclaration en attente (R14, R15, D7)
// ---------------------------------------------------------------------------

/**
 * Pour chaque appel de charges visé par une déclaration `PENDING` portant sur
 * l'un des `lotIds`, la déclaration en attente (la plus ancienne si plusieurs).
 *
 * Une ligne qui nomme ses appels les vise tels quels. Une ligne sans appel
 * nommé vise, À LA LECTURE, les appels ouverts les plus anciens du lot que son
 * montant touche en cumulant leurs restes dus (au moins le plus ancien) : c'est
 * l'ensemble que l'affectation à la validation toucherait, il évolue donc avec
 * les paiements du lot.
 *
 * Sert au portail (`pendingDeclaration` des appels), aux relances et au
 * blocage du paiement en ligne.
 */
export async function pendingDeclarationsByCall(
  tenantId: string,
  lotIds: string[]
): Promise<Map<string, { declarationId: string; createdAt: Date }>> {
  const result = new Map<string, { declarationId: string; createdAt: Date }>();
  if (lotIds.length === 0) return result;

  const declarations = await prisma.syndicPaymentDeclaration.findMany({
    where: { tenantId, status: 'PENDING', lines: { some: { lotId: { in: lotIds } } } },
    select: {
      id: true,
      syndicateId: true,
      createdAt: true,
      lines: {
        where: { lotId: { in: lotIds } },
        select: { id: true, lotId: true, amount: true, chargeCallIds: true }
      }
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
  });
  if (declarations.length === 0) return result;

  const inputs: LineTargetInput[] = declarations.flatMap(declaration =>
    declaration.lines.map(line => ({
      key: line.id,
      syndicateId: declaration.syndicateId,
      lotId: line.lotId,
      amountCents: toCents(line.amount),
      chargeCallIds: line.chargeCallIds
    }))
  );
  const targets = await resolveLineTargets(
    prisma,
    inputs.filter(input => input.chargeCallIds.length === 0)
  );

  // Les déclarations arrivent de la plus ancienne à la plus récente : la première gagne.
  for (const declaration of declarations) {
    for (const line of declaration.lines) {
      const callIds =
        line.chargeCallIds.length > 0 ? line.chargeCallIds : (targets.get(line.id)?.calls ?? []).map(call => call.id);
      for (const callId of callIds) {
        if (!result.has(callId))
          result.set(callId, { declarationId: declaration.id, createdAt: declaration.createdAt });
      }
    }
  }
  return result;
}
