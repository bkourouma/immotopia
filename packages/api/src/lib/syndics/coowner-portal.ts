import type { Prisma } from '@prisma/client';
import { prisma } from '../../utils/database';
import { NotFoundError } from '../../middleware/error-middleware';
import { isExternalDocumentUrl, localSyndicateDocumentPath, readSyndicateDocumentFile } from './document-files';
import { computeOutstanding, deriveChargeCallStatus, roundMoney, type ChargeCallStatusValue } from './finance-utils';
import { computeResolutionTally, normalizeMajorityRule, type MajorityRule } from './meeting-majority';
import { sumAllocationsByCall } from './charge-allocation';
import { fromCents } from './charge-allocation-plan';
import {
  applyChronologicalBalances,
  compareChronologically,
  type RunningBalanceMovement
} from './owner-account-running-balance';
import { getSyndicOnlineAvailabilities } from './online-payment/gateway-config';
import { PENDING_REUSE_WINDOW_MS } from './online-payment/checkout-start';
import { isSupportedCurrency } from './online-payment/types';
import { pendingDeclarationsByCall } from './declared-payment/declaration-queries';
import { resolveVisibleSince, type LotOwnerProfileHistoryRow } from './lot-owner-history';

export { hasPreviousOtherOwner, resolveVisibleSince } from './lot-owner-history';

/**
 * Portail copropriétaire — lectures, en lecture seule.
 *
 * ---------------------------------------------------------------------------
 * Qui voit quoi
 * ---------------------------------------------------------------------------
 *
 * Le portail réutilise l'infrastructure des portails locataire et
 * propriétaire : un compte `User`, rattaché à l'agence par un `TenantClient`
 * (unique par utilisateur et par agence). Le lien vers la fiche CRM du
 * copropriétaire est posé dans `TenantClient.details`, comme le fait déjà
 * `getOrCreateTenantClientFromContact` pour `crmContactId` — mais sous une clé
 * DÉDIÉE (`syndicCoOwnerContactIds`), écrite uniquement par l'invitation au
 * portail et retirée par la révocation. `crmContactId` ne suffit pas : il est
 * posé automatiquement à la création d'un bail, et un locataire ne doit pas
 * voir la copropriété de son immeuble parce qu'une fiche CRM porte son e-mail.
 *
 * Le périmètre d'un copropriétaire (`CoOwnerPortalScope`) se calcule à chaque
 * requête, dans l'agence résolue par la garde :
 *   1. les contacts liés, re-vérifiés comme appartenant à l'agence ;
 *   2. leurs profils propriétaires de lot (`LotOwnerProfile`) actifs, ouverts
 *      au portail (`portalAccessEnabled`), dont la détention n'est pas close
 *      (`ownedUntil` absent ou à venir) ;
 *   3. les lots de ces profils, gardés seulement si leur copropriété
 *      appartient à l'agence.
 * Chaque lecture ci-dessous ne porte ensuite QUE sur ces lots et ces
 * copropriétés : un lot d'un autre copropriétaire, même dans la même
 * copropriété, n'y figure pas et répond comme un lot inexistant (404).
 *
 * `SyndicateLot`, `ChargeCall`, `OwnerAccount`, `GeneralMeeting`... n'ont pas
 * de champ d'agence : le garde-fou Prisma ne peut pas les contrôler (D4,
 * `prisma-tenant-guard-extension.ts`). D'où l'ordre ci-dessus — la copropriété
 * (qui porte `tenantId`) est vérifiée d'abord, les enfants ne sont lus
 * qu'avec des identifiants de copropriétés déjà vérifiés.
 */

/** Clé de `TenantClient.details` : contacts CRM ouverts au portail copropriétaire. */
export const COOWNER_CONTACT_IDS_KEY = 'syndicCoOwnerContactIds';

/** Types de documents de copropriété visibles des copropriétaires (voir `listCoOwnerDocuments`). */
export const COOWNER_VISIBLE_DOCUMENT_TYPES = ['REGULATION', 'GENERAL_MEETING_MINUTES'] as const;

/** Lit, sans jamais lever, la liste des contacts ouverts au portail dans `details`. */
export function readCoOwnerContactIds(details: unknown): string[] {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return [];
  const raw = (details as Record<string, unknown>)[COOWNER_CONTACT_IDS_KEY];
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.filter((value): value is string => typeof value === 'string' && value.length > 0)));
}

export interface CoOwnerLotScope {
  lotId: string;
  syndicateId: string;
  contactId: string;
  ownershipPercentage: number;
  /**
   * Début de la détention (`LotOwnerProfile.ownedSince`) : le plus ancien des
   * profils actuels du copropriétaire sur ce lot. Information seulement : ne
   * pas s'en servir pour filtrer, utiliser `visibleSince`.
   */
  ownedSince: Date;
  /**
   * Borne de visibilité des lectures financières du portail (paiements, compte,
   * relevé, suivi mensuel, appels). `ownedSince` UNIQUEMENT s'il y a eu un
   * autre propriétaire avant (l'historique de l'ancien propriétaire reste alors
   * réservé à la gestion, audit S5) ; `null` sinon = aucune borne, tout
   * l'historique du lot est visible. Voir `lot-owner-history.ts`.
   */
  visibleSince: Date | null;
}

export interface CoOwnerPortalScope {
  tenantId: string;
  /** Contacts CRM de l'agence liés au compte. */
  contactIds: string[];
  lots: CoOwnerLotScope[];
  lotIds: string[];
  syndicateIds: string[];
}

function emptyScope(tenantId: string, contactIds: string[] = []): CoOwnerPortalScope {
  return { tenantId, contactIds, lots: [], lotIds: [], syndicateIds: [] };
}

/**
 * Périmètre d'un copropriétaire dans une agence. Voir l'en-tête du fichier.
 * `linkedContactIds` vient de `TenantClient.details` : il n'est jamais cru
 * sur parole, chaque contact est relu avec le filtre d'agence.
 */
export async function resolveCoOwnerScope(
  tenantId: string,
  linkedContactIds: string[],
  now: Date = new Date()
): Promise<CoOwnerPortalScope> {
  if (linkedContactIds.length === 0) return emptyScope(tenantId);

  const contacts = await prisma.crmContact.findMany({
    where: { tenantId, id: { in: linkedContactIds } },
    select: { id: true }
  });
  const contactIds = contacts.map(contact => contact.id);
  if (contactIds.length === 0) return emptyScope(tenantId);

  const profiles = await prisma.lotOwnerProfile.findMany({
    // Une détention qui n'a pas encore commencé n'ouvre rien (audit S5).
    where: { contactId: { in: contactIds }, isActive: true, portalAccessEnabled: true, ownedSince: { lte: now } },
    select: { lotId: true, contactId: true, ownershipPercentage: true, ownedSince: true, ownedUntil: true },
    orderBy: { createdAt: 'asc' }
  });
  const current = profiles.filter(profile => !profile.ownedUntil || profile.ownedUntil.getTime() >= now.getTime());
  if (current.length === 0) return emptyScope(tenantId, contactIds);

  const candidateLots = await prisma.syndicateLot.findMany({
    where: { id: { in: Array.from(new Set(current.map(profile => profile.lotId))) } },
    select: { id: true, syndicateId: true }
  });
  const syndicates = await prisma.syndicate.findMany({
    where: { tenantId, id: { in: Array.from(new Set(candidateLots.map(lot => lot.syndicateId))) } },
    select: { id: true }
  });
  const tenantSyndicateIds = new Set(syndicates.map(syndicate => syndicate.id));
  const syndicateByLot = new Map(
    candidateLots.filter(lot => tenantSyndicateIds.has(lot.syndicateId)).map(lot => [lot.id, lot.syndicateId])
  );

  // Profils de TOUS les contacts sur les lots retenus (actifs ou non : la fiche
  // d'un ancien propriétaire peut avoir été désactivée) : ils disent s'il y a
  // eu un autre propriétaire avant, donc si la borne de visibilité s'applique.
  // Lots déjà vérifiés comme appartenant à l'agence (copropriété de `tenantId`).
  const history = await prisma.lotOwnerProfile.findMany({
    where: { lotId: { in: Array.from(syndicateByLot.keys()) } },
    select: { lotId: true, contactId: true, ownedSince: true, ownedUntil: true, isActive: true }
  });
  const historyByLot = new Map<string, LotOwnerProfileHistoryRow[]>();
  for (const row of history) {
    const rows = historyByLot.get(row.lotId) ?? [];
    rows.push({
      contactId: row.contactId,
      ownedSince: row.ownedSince,
      ownedUntil: row.ownedUntil,
      isActive: row.isActive
    });
    historyByLot.set(row.lotId, rows);
  }

  // Un même lot peut porter deux profils (indivision entre deux fiches liées
  // au même compte) : le premier créé l'emporte (contact, part), le lot
  // n'apparaît qu'une fois ; `ownedSince` est le plus ancien des profils actuels.
  const lots: CoOwnerLotScope[] = [];
  const seen = new Set<string>();
  for (const profile of current) {
    const syndicateId = syndicateByLot.get(profile.lotId);
    if (!syndicateId || seen.has(profile.lotId)) continue;
    seen.add(profile.lotId);
    const ownedSince = current
      .filter(candidate => candidate.lotId === profile.lotId)
      .reduce(
        (earliest, candidate) => (candidate.ownedSince < earliest ? candidate.ownedSince : earliest),
        profile.ownedSince
      );
    lots.push({
      lotId: profile.lotId,
      syndicateId,
      contactId: profile.contactId,
      ownershipPercentage: Number(profile.ownershipPercentage),
      ownedSince,
      visibleSince: resolveVisibleSince(ownedSince, contactIds, historyByLot.get(profile.lotId) ?? [])
    });
  }

  return {
    tenantId,
    contactIds,
    lots,
    lotIds: lots.map(lot => lot.lotId),
    syndicateIds: Array.from(new Set(lots.map(lot => lot.syndicateId)))
  };
}

// ---------------------------------------------------------------------------
// Présentation
// ---------------------------------------------------------------------------

export type BalanceDirection = 'DEBITEUR' | 'CREDITEUR' | 'A_JOUR';

/**
 * Solde d'un compte de lot, en valeur absolue et avec son sens.
 *
 * Même convention que l'écran gestionnaire (`SyndicOwnerAccount.tsx`) et le
 * relevé PDF (`describeBalanceForPdf`) : un débit (appel, pénalité)
 * augmente le solde, un crédit (paiement, remise) le diminue. Positif = le
 * copropriétaire doit ce montant ; négatif = il a une avance.
 */
export function describeBalance(raw: unknown): { amount: number; direction: BalanceDirection } {
  const value = roundMoney(Number(raw ?? 0));
  if (value > 0) return { amount: value, direction: 'DEBITEUR' };
  if (value < 0) return { amount: roundMoney(Math.abs(value)), direction: 'CREDITEUR' };
  return { amount: 0, direction: 'A_JOUR' };
}

function toNumberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

export function scopeOrThrow(scope: CoOwnerPortalScope, lotId: string): CoOwnerLotScope {
  const lot = scope.lots.find(candidate => candidate.lotId === lotId);
  if (!lot) {
    // Même réponse qu'un lot inexistant : ne rien dire de l'existence d'un
    // lot qui appartient à un autre copropriétaire.
    throw new NotFoundError('Lot introuvable.');
  }
  return lot;
}

export async function loadSyndicates(scope: CoOwnerPortalScope, syndicateIds: string[] = scope.syndicateIds) {
  if (syndicateIds.length === 0) return new Map<string, { id: string; name: string; address: string }>();
  const syndicates = await prisma.syndicate.findMany({
    where: { tenantId: scope.tenantId, id: { in: syndicateIds } },
    select: { id: true, name: true, address: true }
  });
  return new Map(syndicates.map(syndicate => [syndicate.id, syndicate]));
}

async function loadLots(scope: CoOwnerPortalScope, lotIds: string[] = scope.lotIds) {
  if (lotIds.length === 0) return [];
  return prisma.syndicateLot.findMany({
    where: { id: { in: lotIds }, syndicateId: { in: scope.syndicateIds } },
    select: {
      id: true,
      syndicateId: true,
      lotNumber: true,
      lotType: true,
      generalShares: true,
      specialShares: true
    },
    orderBy: { lotNumber: 'asc' }
  });
}

// ---------------------------------------------------------------------------
// Soldes du périmètre (lot ayant changé de propriétaire)
// ---------------------------------------------------------------------------

function movementTime(movement: { transactionDate: Date | string }): number {
  return new Date(movement.transactionDate).getTime();
}

/** Mouvements datés de `visibleSince` ou après : le périmètre du nouveau propriétaire. */
function movementsFrom<T extends { transactionDate: Date | string }>(movements: T[], visibleSince: Date): T[] {
  return movements.filter(movement => movementTime(movement) >= visibleSince.getTime());
}

/**
 * Solde du périmètre d'un lot qui a changé de propriétaire : somme (débit -
 * crédit) des seuls mouvements datés de `visibleSince` ou après. Ni le solde
 * d'origine du compte ni les mouvements de l'ancien propriétaire n'y entrent :
 * sa dette ou son avance ne sont pas celles du nouveau propriétaire.
 */
export function scopedBalanceOf(
  movements: { transactionDate: Date | string; debit?: unknown; credit?: unknown }[],
  visibleSince: Date
): number {
  return roundMoney(
    movementsFrom(movements, visibleSince).reduce(
      (sum, movement) => sum + Number(movement.debit ?? 0) - Number(movement.credit ?? 0),
      0
    )
  );
}

/**
 * Solde après chaque mouvement du périmètre (`id -> solde`), cumulé dans l'ordre
 * chronologique en PARTANT DE ZÉRO au premier mouvement daté de `visibleSince`
 * ou après (même ordre total que `computeChronologicalBalances`, sans le solde
 * d'origine du compte). Les mouvements antérieurs n'ont pas d'entrée.
 */
export function computeScopedBalances(movements: RunningBalanceMovement[], visibleSince: Date): Map<string, number> {
  const balances = new Map<string, number>();
  let balance = 0;
  for (const movement of movementsFrom(movements, visibleSince).sort(compareChronologically)) {
    balance = roundMoney(balance + Number(movement.debit ?? 0) - Number(movement.credit ?? 0));
    balances.set(movement.id, balance);
  }
  return balances;
}

// ---------------------------------------------------------------------------
// 1. Mes lots
// ---------------------------------------------------------------------------

export async function listCoOwnerLots(scope: CoOwnerPortalScope) {
  const [lots, syndicates] = await Promise.all([loadLots(scope), loadSyndicates(scope)]);
  const accounts =
    lots.length === 0
      ? []
      : await prisma.ownerAccount.findMany({
          where: { lotId: { in: lots.map(lot => lot.id) }, syndicateId: { in: scope.syndicateIds } },
          select: { id: true, lotId: true, balance: true, currency: true }
        });
  const accountByLot = new Map(accounts.map(account => [account.lotId, account]));
  const scopedBalanceByLot = await loadScopedBalances(scope, accountByLot);

  return lots.map(lot => {
    const lotScope = scopeOrThrow(scope, lot.id);
    const account = accountByLot.get(lot.id);
    const syndicate = syndicates.get(lot.syndicateId);
    // Lot sans borne : solde du compte. Lot ayant changé de propriétaire : solde du périmètre.
    const rawBalance = scopedBalanceByLot.get(lot.id) ?? account?.balance;
    return {
      id: lot.id,
      lotNumber: lot.lotNumber,
      lotType: lot.lotType,
      generalShares: lot.generalShares,
      specialShares: lot.specialShares,
      ownershipPercentage: lotScope.ownershipPercentage,
      syndicate: syndicate ? { id: syndicate.id, name: syndicate.name, address: syndicate.address } : null,
      balance: account ? { ...describeBalance(rawBalance), currency: account.currency } : null
    };
  });
}

/**
 * Solde du périmètre des lots à borne de visibilité : UNE requête groupée sur
 * les comptes de ces lots seulement. `accountByLot` ne contient que des comptes
 * déjà filtrés par lot ET copropriété du périmètre. Un lot sans borne n'a pas
 * d'entrée (son solde est celui du compte).
 */
async function loadScopedBalances(
  scope: CoOwnerPortalScope,
  accountByLot: Map<string, { id: string }>
): Promise<Map<string, number>> {
  const bounded = scope.lots.flatMap(lot => {
    const account = accountByLot.get(lot.lotId);
    return lot.visibleSince && account ? [{ lotId: lot.lotId, accountId: account.id, since: lot.visibleSince }] : [];
  });
  const balances = new Map<string, number>();
  if (bounded.length === 0) return balances;

  const movements = await prisma.ownerAccountTransaction.findMany({
    where: { OR: bounded.map(entry => ({ accountId: entry.accountId, transactionDate: { gte: entry.since } })) },
    select: { accountId: true, transactionDate: true, debit: true, credit: true }
  });
  for (const entry of bounded) {
    const own = movements.filter(movement => movement.accountId === entry.accountId);
    balances.set(entry.lotId, scopedBalanceOf(own, entry.since));
  }
  return balances;
}

// ---------------------------------------------------------------------------
// 2. Compte d'un lot
// ---------------------------------------------------------------------------

export async function getCoOwnerLotAccount(scope: CoOwnerPortalScope, lotId: string) {
  const lotScope = scopeOrThrow(scope, lotId);
  const [lot] = await loadLots(scope, [lotId]);
  if (!lot) throw new NotFoundError('Lot introuvable.');
  const syndicates = await loadSyndicates(scope, [lot.syndicateId]);
  const syndicate = syndicates.get(lot.syndicateId);
  if (!syndicate) throw new NotFoundError('Lot introuvable.');

  // Lecture seule : le portail ne crée jamais le compte (l'écran gestionnaire
  // le fait à sa première consultation). Pas encore de compte = aucun
  // mouvement, et on le dit comme tel.
  const account = await prisma.ownerAccount.findFirst({
    where: { lotId: lot.id, syndicateId: lot.syndicateId },
    select: { id: true, balance: true, currency: true, lastUpdatedAt: true }
  });
  // Lot sans autre propriétaire avant (`visibleSince` nul) : tout le compte et
  // son solde. Lot ayant changé de propriétaire : mouvements datés de
  // `visibleSince` ou après (l'historique de l'ancien propriétaire reste à la
  // gestion, audit S5), soldes cumulés depuis zéro sur ce périmètre, et solde
  // affiché = solde du périmètre.
  const visibleSince = lotScope.visibleSince;
  const sinceFilter = visibleSince ? { transactionDate: { gte: visibleSince } } : {};
  const rows = account
    ? await prisma.ownerAccountTransaction.findMany({
        where: { accountId: account.id, ...sinceFilter },
        orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        take: 200,
        select: {
          id: true,
          transactionDate: true,
          type: true,
          label: true,
          reference: true,
          debit: true,
          credit: true,
          balanceAfter: true
        }
      })
    : [];
  // BUG-006 : même solde cumulé chronologique que l'écran de gestion.
  const movements = account
    ? await prisma.ownerAccountTransaction.findMany({
        where: { accountId: account.id, ...sinceFilter },
        select: { id: true, transactionDate: true, createdAt: true, debit: true, credit: true, balanceAfter: true }
      })
    : [];
  let transactions: (Omit<(typeof rows)[number], 'balanceAfter'> & { balanceAfter: unknown })[] = rows;
  if (visibleSince) {
    const scoped = computeScopedBalances(movements, visibleSince);
    transactions = rows.map(row => (scoped.has(row.id) ? { ...row, balanceAfter: scoped.get(row.id) } : row));
  } else if (account) {
    transactions = applyChronologicalBalances(rows, movements);
  }
  const accountBalance = account && visibleSince ? scopedBalanceOf(movements, visibleSince) : account?.balance;

  return {
    lot: {
      id: lot.id,
      lotNumber: lot.lotNumber,
      lotType: lot.lotType,
      generalShares: lot.generalShares,
      specialShares: lot.specialShares,
      ownershipPercentage: lotScope.ownershipPercentage
    },
    syndicate: { id: syndicate.id, name: syndicate.name, address: syndicate.address },
    account: account
      ? {
          ...describeBalance(accountBalance),
          currency: account.currency,
          lastUpdatedAt: account.lastUpdatedAt
        }
      : null,
    transactions: transactions.map(transaction => {
      const after = describeBalance(transaction.balanceAfter);
      return {
        id: transaction.id,
        transactionDate: transaction.transactionDate,
        type: transaction.type,
        label: transaction.label,
        reference: transaction.reference,
        debit: toNumberOrNull(transaction.debit),
        credit: toNumberOrNull(transaction.credit),
        balanceAfter: after.amount,
        balanceAfterDirection: after.direction
      };
    })
  };
}

// ---------------------------------------------------------------------------
// 3. Appels de charges
// ---------------------------------------------------------------------------

/**
 * Appels des lots `lotIds` visibles du copropriétaire, lot par lot. Lot sans
 * autre propriétaire avant (`visibleSince` nul) : tous ses appels. Lot ayant
 * changé de propriétaire : appels postérieurs à l'acquisition seulement, début
 * de période >= `visibleSince` s'il est renseigné, sinon échéance >=
 * `visibleSince` ; les appels de l'ancien propriétaire restent à la gestion
 * (audit S5). À réutiliser par toute lecture d'un appel du portail (un appel
 * masqué répond alors le même 404 qu'un appel inconnu). Un lot absent du
 * périmètre ne donne aucune clause : il n'est jamais lisible.
 */
export function ownedChargeCallsWhere(scope: CoOwnerPortalScope, lotIds: string[]): Prisma.ChargeCallWhereInput {
  const owned = scope.lots.filter(lot => lotIds.includes(lot.lotId));
  return {
    syndicateId: { in: scope.syndicateIds },
    OR: owned.flatMap((lot): Prisma.ChargeCallWhereInput[] =>
      lot.visibleSince
        ? [
            { lotId: lot.lotId, periodStart: { gte: lot.visibleSince } },
            { lotId: lot.lotId, periodStart: null, dueDate: { gte: lot.visibleSince } }
          ]
        : [{ lotId: lot.lotId }]
    )
  };
}

export type CoOwnerOnlineCheckoutState = 'NONE' | 'IN_PROGRESS' | 'REVIEW';

/**
 * Paiements en ligne ouverts (`PENDING` récent ou `REVIEW`) couvrant les appels
 * donnés : UNE requête. Pour chaque appel, l'état et, si le paiement est celui
 * de CE compte portail, son code (pour « Reprendre le paiement »). Un paiement
 * d'un autre compte, ou d'un lien sécurisé, bloque l'appel sans livrer son code.
 */
async function loadOpenCheckoutsByCall(
  scope: CoOwnerPortalScope,
  lotIds: string[],
  callIds: string[],
  tenantClientId: string | null
) {
  const byCall = new Map<string, { state: CoOwnerOnlineCheckoutState; code: string | null }>();
  if (callIds.length === 0) return byCall;
  const since = new Date(Date.now() - PENDING_REUSE_WINDOW_MS);
  const open = await prisma.syndicOnlineCheckout.findMany({
    where: {
      tenantId: scope.tenantId,
      lotId: { in: lotIds },
      chargeCallIds: { hasSome: callIds },
      OR: [{ status: 'PENDING', createdAt: { gte: since } }, { status: 'REVIEW' }]
    },
    orderBy: { createdAt: 'desc' },
    select: { status: true, codePaiement: true, chargeCallIds: true, origin: true, tenantClientId: true }
  });
  for (const checkout of open) {
    const state: CoOwnerOnlineCheckoutState = checkout.status === 'REVIEW' ? 'REVIEW' : 'IN_PROGRESS';
    const mine = checkout.origin === 'PORTAL' && tenantClientId !== null && checkout.tenantClientId === tenantClientId;
    for (const callId of checkout.chargeCallIds) {
      const known = byCall.get(callId);
      // REVIEW l'emporte sur un paiement en cours ; à état égal, le plus récent (tri décroissant) reste.
      if (known && (known.state === 'REVIEW' || state !== 'REVIEW')) continue;
      byCall.set(callId, { state, code: mine ? checkout.codePaiement : null });
    }
  }
  return byCall;
}

export async function listCoOwnerChargeCalls(
  scope: CoOwnerPortalScope,
  filters: { lotId?: string; tenantClientId?: string | null } = {}
) {
  const lotIds = filters.lotId ? [scopeOrThrow(scope, filters.lotId).lotId] : scope.lotIds;
  if (lotIds.length === 0) return [];

  const [lots, syndicates] = await Promise.all([loadLots(scope, lotIds), loadSyndicates(scope)]);
  const lotById = new Map(lots.map(lot => [lot.id, lot]));

  const calls = await prisma.chargeCall.findMany({
    where: ownedChargeCallsWhere(scope, lotIds),
    orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }],
    take: 500,
    select: {
      id: true,
      syndicateId: true,
      lotId: true,
      period: true,
      amount: true,
      currency: true,
      dueDate: true,
      status: true
    }
  });
  // Lot S2 : regle d'un appel = somme de ses affectations (paiements et avances).
  const callIds = calls.map(call => call.id);
  const paidCentsByCall = await sumAllocationsByCall(prisma, callIds);
  // Paiement en ligne : UNE disponibilité par copropriété du périmètre, UNE requête de tentatives ouvertes.
  const [availabilities, openByCall, declaredByCall] = await Promise.all([
    getSyndicOnlineAvailabilities(scope.tenantId, Array.from(new Set(calls.map(call => call.syndicateId)))),
    loadOpenCheckoutsByCall(scope, lotIds, callIds, filters.tenantClientId ?? null),
    // Spec 047 : déclarations de paiement mobile money en attente qui visent ces appels.
    pendingDeclarationsByCall(scope.tenantId, lotIds)
  ]);

  const now = new Date();
  return calls.map(call => {
    const amount = roundMoney(Number(call.amount));
    const paid = fromCents(paidCentsByCall.get(call.id) ?? 0);
    const outstanding = computeOutstanding(amount, paid);
    const lot = lotById.get(call.lotId);
    const open = openByCall.get(call.id);
    const declared = declaredByCall.get(call.id);
    return {
      id: call.id,
      syndicateId: call.syndicateId,
      period: call.period,
      amount,
      paid,
      outstanding,
      currency: call.currency,
      dueDate: call.dueDate,
      // « En retard » n'est jamais stocké : dérivé à la lecture, comme sur
      // l'écran gestionnaire (finance-utils.ts).
      status: deriveChargeCallStatus(call.status as ChargeCallStatusValue, call.dueDate, now),
      lot: lot ? { id: lot.id, lotNumber: lot.lotNumber, lotType: lot.lotType } : null,
      syndicate: syndicates.get(call.syndicateId)?.name ?? null,
      // Copropriété payable en ligne ET reste dû > 0 ET devise FCFA (contracts §2.2), ET aucune
      // déclaration de paiement mobile money en attente sur l'appel (spec 047, R15).
      onlinePayable:
        availabilities.get(call.syndicateId)?.available === true &&
        outstanding > 0 &&
        isSupportedCurrency(call.currency) &&
        !declared,
      // Spec 047 : déclaration en attente qui vise cet appel (le paiement en ligne est alors bloqué).
      pendingDeclaration: declared
        ? { declarationId: declared.declarationId, createdAt: declared.createdAt.toISOString() }
        : null,
      onlineCheckout: open?.state ?? ('NONE' as CoOwnerOnlineCheckoutState),
      // Code du paiement ouvert DE CE COMPTE (reprise), sinon null.
      onlineCheckoutCode: open?.code ?? null
    };
  });
}

// ---------------------------------------------------------------------------
// 4. Documents
// ---------------------------------------------------------------------------

/**
 * Documents de copropriété visibles d'un copropriétaire.
 *
 * `SyndicateDocument` ne porte AUCUN drapeau « visible par les
 * copropriétaires » : ajouter une colonne demanderait une migration, et un
 * document déjà versé serait par défaut soit exposé sans décision de
 * l'agence, soit caché partout. On retient donc une règle fermée, sur le
 * type : le règlement de copropriété et les procès-verbaux d'assemblée
 * générale — les deux documents dont la loi prévoit la communication à tout
 * copropriétaire. Les diagnostics, contrats d'assurance, budgets et « autres »
 * (qui peuvent contenir des données de tiers) restent réservés à la gestion.
 */
export async function listCoOwnerDocuments(scope: CoOwnerPortalScope) {
  if (scope.syndicateIds.length === 0) return [];
  const syndicates = await loadSyndicates(scope);
  const documents = await prisma.syndicateDocument.findMany({
    where: { syndicateId: { in: scope.syndicateIds }, type: { in: [...COOWNER_VISIBLE_DOCUMENT_TYPES] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, syndicateId: true, title: true, type: true, fileUrl: true, createdAt: true }
  });

  return documents.map(document => ({
    id: document.id,
    title: document.title,
    type: document.type,
    createdAt: document.createdAt,
    syndicate: syndicates.get(document.syndicateId)?.name ?? null,
    downloadable: localSyndicateDocumentPath(document.fileUrl, document.syndicateId) !== null,
    // Un lien externe saisi par le gestionnaire est rendu tel quel ; un
    // fichier déposé ne l'est JAMAIS (il passe par la route de téléchargement).
    externalUrl: isExternalDocumentUrl(document.fileUrl) ? document.fileUrl : null
  }));
}

export async function getCoOwnerDocumentFile(scope: CoOwnerPortalScope, documentId: string) {
  if (scope.syndicateIds.length === 0) throw new NotFoundError('Document introuvable.');
  const document = await prisma.syndicateDocument.findFirst({
    where: {
      id: documentId,
      syndicateId: { in: scope.syndicateIds },
      type: { in: [...COOWNER_VISIBLE_DOCUMENT_TYPES] }
    },
    select: { id: true, syndicateId: true, title: true, fileUrl: true }
  });
  if (!document) throw new NotFoundError('Document introuvable.');

  // Fichier déposé (jamais servi en statique) ou 404 : voir document-files.ts.
  return readSyndicateDocumentFile(document);
}

// ---------------------------------------------------------------------------
// 5. Assemblées générales
// ---------------------------------------------------------------------------

/** AG planifiee ou en cours, a J-1 ou plus tard (spec 043). */
export function isLiveAvailable(status: string, scheduledAt: Date | string, now: number = Date.now()): boolean {
  if (status !== 'PLANNED' && status !== 'IN_PROGRESS') return false;
  return new Date(scheduledAt).getTime() - 24 * 60 * 60 * 1000 <= now;
}

export async function listCoOwnerMeetings(scope: CoOwnerPortalScope) {
  if (scope.syndicateIds.length === 0) return [];
  const syndicates = await loadSyndicates(scope);
  const meetings = await prisma.generalMeeting.findMany({
    where: { syndicateId: { in: scope.syndicateIds } },
    orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }],
    take: 100,
    select: {
      id: true,
      syndicateId: true,
      type: true,
      scheduledAt: true,
      location: true,
      status: true
    }
  });
  if (meetings.length === 0) return [];
  const now = Date.now();

  const meetingIds = meetings.map(meeting => meeting.id);
  const agendaItems = await prisma.gMAgendaItem.findMany({
    where: { meetingId: { in: meetingIds } },
    orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, meetingId: true, orderIndex: true, title: true }
  });

  // Les résultats ne sont publiés qu'une fois l'assemblée clôturée.
  const completed = meetings.filter(meeting => meeting.status === 'COMPLETED');
  const resolutions =
    completed.length === 0
      ? []
      : await prisma.gMResolution.findMany({
          where: { meetingId: { in: completed.map(meeting => meeting.id) } },
          orderBy: { createdAt: 'asc' },
          select: { id: true, meetingId: true, title: true, description: true, majorityRule: true, result: true }
        });
  const votes =
    resolutions.length === 0
      ? []
      : await prisma.gMVote.findMany({
          where: { resolutionId: { in: resolutions.map(resolution => resolution.id) } },
          select: { resolutionId: true, lotId: true, vote: true }
        });
  // Tantièmes de TOUS les lots des copropriétés concernées : nécessaires au
  // décompte (le total de référence). Ils servent au calcul et ne sortent
  // jamais de cette fonction — seuls les totaux sont rendus, jamais le vote
  // d'un lot qui n'est pas celui du copropriétaire.
  const completedSyndicateIds = Array.from(new Set(completed.map(meeting => meeting.syndicateId)));
  const allLots =
    completedSyndicateIds.length === 0
      ? []
      : await prisma.syndicateLot.findMany({
          where: { syndicateId: { in: completedSyndicateIds } },
          select: {
            id: true,
            syndicateId: true,
            lotNumber: true,
            generalShares: true,
            coownerId: true,
            ownerContactId: true
          }
        });
  const myLotIds = new Set(scope.lotIds);
  const lotNumberById = new Map(allLots.map(lot => [lot.id, lot.lotNumber]));

  return meetings.map(meeting => {
    const syndicateLots = allLots.filter(lot => lot.syndicateId === meeting.syndicateId);
    return {
      id: meeting.id,
      type: meeting.type,
      scheduledAt: meeting.scheduledAt,
      location: meeting.location,
      status: meeting.status,
      // Spec 043 : « Rejoindre l'AG en direct » des J-1 et jusqu'a la cloture.
      liveAvailable: isLiveAvailable(meeting.status, meeting.scheduledAt, now),
      syndicate: syndicates.get(meeting.syndicateId)?.name ?? null,
      agenda: agendaItems
        .filter(item => item.meetingId === meeting.id)
        .map(item => ({ id: item.id, orderIndex: item.orderIndex, title: item.title })),
      resolutions:
        meeting.status !== 'COMPLETED'
          ? []
          : resolutions
              .filter(resolution => resolution.meetingId === meeting.id)
              .map(resolution => {
                const resolutionVotes = votes.filter(vote => vote.resolutionId === resolution.id);
                const tally = computeResolutionTally(resolution.majorityRule, syndicateLots, resolutionVotes);
                const rule: MajorityRule = normalizeMajorityRule(resolution.majorityRule);
                return {
                  id: resolution.id,
                  title: resolution.title,
                  description: resolution.description,
                  rule,
                  result: resolution.result ?? tally.result,
                  sharesFor: tally.sharesFor,
                  sharesAgainst: tally.sharesAgainst,
                  sharesAbstain: tally.sharesAbstain,
                  totalShares: tally.totalShares,
                  myVotes: resolutionVotes
                    .filter(vote => myLotIds.has(vote.lotId))
                    .map(vote => ({ lotNumber: lotNumberById.get(vote.lotId) ?? '', vote: vote.vote }))
                };
              })
    };
  });
}
