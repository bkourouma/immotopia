/**
 * Restitution du grand livre des comptes de tiers — lot 1, volet clients.
 *
 * Implémente les trois fonctions de lecture du contrat gelé (`./types.ts`) :
 * balance clients, balance âgée, relevé de compte. C'est la première fois
 * que la gestionnaire voit un **solde** plutôt qu'un statut — l'écran ne
 * montrera plus « payé / en retard » sans montant, mais un chiffre.
 *
 * Trois règles tiennent ce fichier :
 *
 * 1. **La balance s'agrège en SQL, jamais en mémoire.** Le banc de charge du
 *    lot 0 mesure 93 ms en SQL contre 1355 ms en mémoire à 500 tiers
 *    (`docs/finance/REFERENCE-LOT-0.md`), avec une variance bien plus forte
 *    pour la seconde. `getClientsBalance` ne charge donc jamais l'ensemble
 *    des mouvements : il les agrège avec `groupBy`, et lit le solde courant
 *    directement sur `ThirdPartyAccount.balance` plutôt que de le
 *    recalculer. La balance âgée réutilise ce résultat et n'ajoute qu'une
 *    lecture des **échéances impayées** (`RentalInstallment`) — un ensemble
 *    borné par construction (quelques échéances par locataire), sans rapport
 *    avec le volume des mouvements du grand livre : classer ces quelques
 *    lignes par tranche d'ancienneté en JavaScript n'est pas l'agrégation en
 *    mémoire proscrite par le plan (§5.2 tâche 1.6).
 * 2. **Le solde d'ouverture d'un relevé ne se replie jamais sur le solde
 *    actuel.** C'est le défaut n°3 du §6.1 bis du plan, déjà présent dans
 *    `getOwnerAccountStatementByLot` : sur une période sans mouvement, ce
 *    dernier renvoie le solde du jour, si bien qu'un relevé 2025 d'un compte
 *    mouvementé en 2026 afficherait le solde de 2026. Ici, l'ouverture et la
 *    clôture se calculent depuis le dernier mouvement antérieur (ou égal, pour
 *    la clôture) à la borne demandée, et valent zéro s'il n'y en a aucun.
 * 3. **Vocabulaire (principe P-1 du PRD).** Les colonnes de la base
 *    (`debit`/`credit`) ne sortent jamais d'ici : la frontière parle
 *    `amountBilled` / `amountSettled`, comme le grand livre.
 */

import { prisma } from '../../utils/database';
import { notFound } from '../errors';
import { roundMoney } from './money';
import { sumClientBilledSettledByAccount } from './third-party-totals';
import {
  toAmount,
  toAmountOrZero,
  type ClientsAgingBalanceLine,
  type ClientsBalanceLine,
  type GetAccountStatement,
  type GetClientsAgingBalance,
  type GetClientsBalance,
  type PeriodRange,
  type ThirdPartyMovementRecord,
  type ThirdPartyMovementType
} from './types';
import { escapeLike } from '../../utils/like-escape';

/** Devise unique du lot 1 (décision D9 du plan). */
const DEFAULT_CURRENCY = 'XOF';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Statuts d'échéance considérés comme non soldés pour la balance âgée. */
const UNPAID_INSTALLMENT_STATUSES = ['DRAFT', 'DUE', 'PARTIAL', 'OVERDUE'] as const;

// ---------------------------------------------------------------------------
// Utilitaires internes
// ---------------------------------------------------------------------------

function buildMovementDateFilter(range?: PeriodRange): { gte?: Date; lte?: Date } | undefined {
  if (!range?.from && !range?.to) {
    return undefined;
  }
  return {
    ...(range.from ? { gte: range.from } : {}),
    ...(range.to ? { lte: range.to } : {})
  };
}

/** Identifiants des baux d'un bien, pour filtrer les mouvements qui lui sont rattachés. */
async function resolveLeaseIdsForProperty(tenantId: string, propertyId: string): Promise<string[]> {
  const leases = await prisma.rentalLease.findMany({
    where: { tenant_id: tenantId, property_id: propertyId },
    select: { id: true }
  });
  return leases.map(lease => lease.id);
}

/** Biens rattachés aux baux de chaque locataire, pour la colonne `propertyLabels`. */
async function loadPropertyLabelsByClient(tenantId: string, tenantClientIds: string[]): Promise<Map<string, string[]>> {
  const labelsByClient = new Map<string, Set<string>>();
  if (tenantClientIds.length === 0) {
    return new Map();
  }

  const leases = await prisma.rentalLease.findMany({
    where: { tenant_id: tenantId, primary_renter_client_id: { in: tenantClientIds } },
    select: {
      primary_renter_client_id: true,
      property: { select: { title: true, internalReference: true } }
    }
  });

  for (const lease of leases) {
    // Le titre d'abord : c'est le nom que l'agence donne au bien ; une référence
    // technique (PROP-2026…) ne dit rien à personne (BUG-2026-09-29-005).
    const label = lease.property?.title || lease.property?.internalReference;
    if (!label) {
      continue;
    }
    const set = labelsByClient.get(lease.primary_renter_client_id) ?? new Set<string>();
    set.add(label);
    labelsByClient.set(lease.primary_renter_client_id, set);
  }

  const result = new Map<string, string[]>();
  for (const [clientId, labels] of labelsByClient) {
    result.set(clientId, Array.from(labels));
  }
  return result;
}

// ---------------------------------------------------------------------------
// A. Balance clients
// ---------------------------------------------------------------------------

/**
 * Voir `GetClientsBalance` dans `./types.ts`.
 *
 * Une seule requête `groupBy` porte l'agrégation des montants facturés et
 * réglés sur la période filtrée ; le solde affiché est le solde à la fin de
 * la période (à date sans période), agrégé par la même requête SQL.
 */
export const getClientsBalance: GetClientsBalance = async (tenantId, filters) => {
  // Comptes TENANT du tenant : une ligne par locataire, chargée une seule
  // fois (une poignée de colonnes par client, pas un mouvement).
  const tenantAccounts = await prisma.thirdPartyAccount.findMany({
    where: {
      tenantId,
      kind: 'TENANT',
      ...(filters?.search ? { label: { contains: escapeLike(filters.search), mode: 'insensitive' as const } } : {})
    },
    select: { id: true, tenantClientId: true, label: true, balance: true, currency: true }
  });

  if (tenantAccounts.length === 0) {
    return { lines: [], totalBalance: 0, currency: DEFAULT_CURRENCY };
  }

  let leaseIdFilter: string[] | undefined;
  if (filters?.propertyId) {
    leaseIdFilter = await resolveLeaseIdsForProperty(tenantId, filters.propertyId);
    if (leaseIdFilter.length === 0) {
      // Aucun bail sur ce bien : aucun mouvement ne peut lui être rattaché.
      return { lines: [], totalBalance: 0, currency: DEFAULT_CURRENCY };
    }
  }

  const movementDateFilter = buildMovementDateFilter(filters?.range);
  const accountIds = tenantAccounts.map(account => account.id);

  const asOf = filters?.asOf ?? new Date();
  const upTo = movementDateFilter?.lte && movementDateFilter.lte < asOf ? movementDateFilter.lte : asOf;

  // Solde À LA FIN DE LA PÉRIODE (à date sans période) : Σ débits − Σ crédits
  // des mouvements dont la date est <= `upTo`, comme la clôture du relevé
  // (`balanceUpTo`) : ni loyer futur, ni mouvement postérieur à la période.
  const soldes = await prisma.thirdPartyMovement.groupBy({
    by: ['accountId'],
    where: { tenantId, accountId: { in: accountIds }, movementDate: { lte: upTo } },
    _sum: { debit: true, credit: true }
  });
  const soldeParCompte = new Map(
    soldes.map(g => [g.accountId, roundMoney(toAmountOrZero(g._sum.debit) - toAmountOrZero(g._sum.credit))])
  );

  // Facturé / réglé : règle unique `sumClientBilledSettledByAccount` (une reprise
  // d'avance n'est ni une facturation ni un règlement — BUG-2026-09-30-058).
  const grouped = await sumClientBilledSettledByAccount({
    tenantId,
    accountId: { in: accountIds },
    movementDate: { ...(movementDateFilter?.gte ? { gte: movementDateFilter.gte } : {}), lte: upTo },
    ...(leaseIdFilter ? { leaseId: { in: leaseIdFilter } } : {})
  });

  if (grouped.size === 0) {
    return { lines: [], totalBalance: 0, currency: DEFAULT_CURRENCY };
  }

  const accountById = new Map(tenantAccounts.map(account => [account.id, account]));
  const tenantClientIds = tenantAccounts
    .map(account => account.tenantClientId)
    .filter((id): id is string => Boolean(id));
  const propertyLabelsByClient = await loadPropertyLabelsByClient(tenantId, tenantClientIds);

  const lines: ClientsBalanceLine[] = Array.from(grouped, ([accountId, totals]) => {
    const account = accountById.get(accountId)!;
    const tenantClientId = account.tenantClientId ?? '';
    return {
      accountId: account.id,
      tenantClientId,
      label: account.label,
      propertyLabels: propertyLabelsByClient.get(tenantClientId) ?? [],
      totalBilled: totals.billed,
      totalSettled: totals.settled,
      balance: soldeParCompte.get(account.id) ?? 0,
      currency: account.currency
    };
  });

  const totalBalance = roundMoney(lines.reduce((sum, line) => sum + line.balance, 0));
  const currency = lines[0]?.currency ?? DEFAULT_CURRENCY;

  return { lines, totalBalance, currency };
};

// ---------------------------------------------------------------------------
// B. Balance clients âgée
// ---------------------------------------------------------------------------

interface AgingBuckets {
  notYetDue: number;
  days0To30: number;
  days30To60: number;
  days60To90: number;
  daysOver90: number;
}

function emptyBuckets(): AgingBuckets {
  return { notYetDue: 0, days0To30: 0, days30To60: 0, days60To90: 0, daysOver90: 0 };
}

/** Tronque une date à minuit UTC, pour compter des jours pleins sans effet de fuseau. */
function toUtcMidnight(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Ligne de balance âgée : tranches + total des tranches + solde comptable + écart. */
export type ClientsAgingBalanceLineWithGap = ClientsAgingBalanceLine & {
  agedTotal: number;
  ledgerBalance: number;
  /**
   * Avance reçue et pas encore affectée à une échéance (trop-perçu). Elle
   * pèse au crédit du grand livre mais n'est dans aucune tranche : elle est
   * présentée à part et ne compte pas dans l'écart.
   */
  unallocatedAdvance: number;
  gap: number;
};

export interface ClientsAgingBalanceWithGap {
  lines: ClientsAgingBalanceLineWithGap[];
  /** Somme des tranches (échéances non soldées). */
  totalBalance: number;
  currency: string;
  /** Solde comptable (grand livre) total. */
  ledgerTotalBalance: number;
  /** Somme des avances non affectées (voir la ligne). */
  unallocatedAdvance: number;
  /** Écart réel : solde comptable + avances non affectées − (total âgé − à échoir). */
  gap: number;
}

/**
 * Borne haute du grand livre pour la balance âgée.
 *
 * L'écran envoie un jour (`YYYY-MM-DD`), lu comme minuit UTC. Or les tranches
 * reflètent l'état des échéances à l'instant de la requête, y compris les
 * pénalités ajustées dans la journée, dont les mouvements portent l'heure de
 * l'ajustement. Couper le grand livre à minuit les en exclurait : un écart
 * fantôme apparaissait jusqu'au lendemain. Un jour entier est donc compté
 * jusqu'à sa dernière milliseconde (les loyers futurs, datés d'un jour
 * ultérieur, restent exclus comme avant).
 */
function ledgerCutoff(asOf: Date): Date {
  const isDateOnly =
    asOf.getUTCHours() === 0 &&
    asOf.getUTCMinutes() === 0 &&
    asOf.getUTCSeconds() === 0 &&
    asOf.getUTCMilliseconds() === 0;
  return isDateOnly ? new Date(asOf.getTime() + MS_PER_DAY - 1) : asOf;
}

export type GetClientsAgingBalanceWithGap = (
  ...args: Parameters<GetClientsAgingBalance>
) => Promise<ClientsAgingBalanceWithGap>;

/**
 * Voir `GetClientsAgingBalance` dans `./types.ts`.
 *
 * Bornes des tranches, la borne basse appartenant à la tranche supérieure
 * (une échéance exactement à 30 jours de retard tombe en 30-60, pas en
 * 0-30) :
 *   - à échoir     : échéance postérieure à `asOf`
 *   - 0-30 jours   : 0 <= retard < 30
 *   - 30-60 jours  : 30 <= retard < 60
 *   - 60-90 jours  : 60 <= retard < 90
 *   - plus de 90   : retard >= 90
 */
export const getClientsAgingBalance: GetClientsAgingBalanceWithGap = async (tenantId, filters) => {
  const asOf = filters?.asOf ?? new Date();

  const cutoff = ledgerCutoff(asOf);
  const base = await getClientsBalance(tenantId, {
    range: filters?.range,
    propertyId: filters?.propertyId,
    search: filters?.search,
    asOf: cutoff
  });
  if (base.lines.length === 0) {
    return {
      lines: [],
      totalBalance: 0,
      currency: base.currency,
      ledgerTotalBalance: 0,
      unallocatedAdvance: 0,
      gap: 0
    };
  }

  // Avances non affectées : une avance encaissée crédite le compte
  // (`ADVANCE_RECEIVED`), chaque affectation à une échéance la reprend par un
  // débit `ADVANCE_APPLIED`. Le reste est un trop-perçu : au grand livre, mais
  // dans aucune échéance impayée. Même borne de date que le solde comptable.
  const rangeEnd = buildMovementDateFilter(filters?.range)?.lte;
  const advanceUpTo = rangeEnd && rangeEnd < cutoff ? rangeEnd : cutoff;
  const advanceSums = await prisma.thirdPartyMovement.groupBy({
    by: ['accountId'],
    where: {
      tenantId,
      accountId: { in: base.lines.map(line => line.accountId) },
      // Pièces « avance » d'un règlement : le crédit reçu (`ADVANCE_RECEIVED`, ré-inscriptions
      // `<paiement>:rN` comprises) et sa contre-passation (`VOID` sur la pièce `RENTAL_PAYMENT` :
      // règlement annulé, dépôt de garantie retiré des avances), qui la reprend par un débit.
      // Les `VOID` d'une affectation (`RENTAL_PAYMENT_ALLOCATION`) ne sont pas des avances.
      // Les imputations (`ADVANCE_APPLIED`) sont comptées à part, ci-dessous.
      OR: [{ type: 'ADVANCE_RECEIVED' }, { type: 'VOID', sourceType: 'RENTAL_PAYMENT' }],
      movementDate: { lte: advanceUpTo }
    },
    _sum: { debit: true, credit: true }
  });
  const appliedByAccount = await sumLiveAdvanceApplications(
    tenantId,
    base.lines.map(line => line.accountId),
    advanceUpTo
  );
  const advanceByAccount = new Map(
    advanceSums.map(g => [
      g.accountId,
      Math.max(
        0,
        roundMoney(
          toAmountOrZero(g._sum.credit) - toAmountOrZero(g._sum.debit) - (appliedByAccount.get(g.accountId) ?? 0)
        )
      )
    ])
  );

  let leaseIdFilter: string[] | undefined;
  if (filters?.propertyId) {
    leaseIdFilter = await resolveLeaseIdsForProperty(tenantId, filters.propertyId);
  }

  // Règlements affectés à une échéance À ÉCHOIR. Le grand livre porte leur crédit à la date du
  // règlement, mais la créance correspondante n'y entre qu'à l'échéance : sans correction, le
  // compte paraît créditeur d'un montant qu'aucune tranche ni avance n'explique, soit un écart
  // négatif fantôme. Ce montant est remis du côté du grand livre dans la formule de l'écart.
  const prepaidByAccount = await sumPaidOnFutureInstallments(
    tenantId,
    advanceUpTo,
    leaseIdFilter,
    base.lines.map(line => line.accountId)
  );

  // Ensemble borné par construction : seules les échéances non soldées,
  // typiquement une poignée par locataire. Ce n'est pas l'ensemble des
  // mouvements du grand livre — voir l'en-tête du fichier.
  const unpaidInstallments = await prisma.rentalInstallment.findMany({
    where: {
      tenant_id: tenantId,
      status: { in: [...UNPAID_INSTALLMENT_STATUSES] },
      ...(leaseIdFilter ? { lease_id: { in: leaseIdFilter } } : {})
    },
    select: {
      id: true,
      status: true,
      due_date: true,
      amount_rent: true,
      amount_service: true,
      amount_other_fees: true,
      penalty_amount: true,
      amount_paid: true,
      lease: { select: { primary_renter_client_id: true } }
    }
  });

  // An old installment may still be DRAFT even though its billed movement is
  // already in the ledger (for example after a data backfill). Count only those
  // drafts: a genuine draft without a billed movement is not yet a receivable.
  const draftIds = unpaidInstallments.filter(i => i.status === 'DRAFT').map(i => i.id);
  const billedDraftMovements = draftIds.length
    ? await prisma.thirdPartyMovement.findMany({
        where: {
          tenantId,
          type: 'INSTALLMENT',
          sourceType: 'RENTAL_INSTALLMENT',
          sourceId: { in: draftIds },
          movementDate: { lte: advanceUpTo },
          accountId: { in: base.lines.map(line => line.accountId) }
        },
        select: { sourceId: true }
      })
    : [];
  const billedDraftIds = new Set(billedDraftMovements.map(m => m.sourceId));

  const asOfUtcMidnight = toUtcMidnight(asOf);
  const bucketsByClient = new Map<string, AgingBuckets>();

  for (const installment of unpaidInstallments) {
    if (installment.status === 'DRAFT' && !billedDraftIds.has(installment.id)) continue;
    const totalDue =
      toAmountOrZero(installment.amount_rent) +
      toAmountOrZero(installment.amount_service) +
      toAmountOrZero(installment.amount_other_fees) +
      toAmountOrZero(installment.penalty_amount);
    const outstanding = roundMoney(totalDue - toAmountOrZero(installment.amount_paid));

    if (outstanding <= 0) {
      // Échéance déjà couverte malgré un statut non PAID (arrondi, reliquat) :
      // rien à classer.
      continue;
    }

    const clientId = installment.lease.primary_renter_client_id;
    const bucket = bucketsByClient.get(clientId) ?? emptyBuckets();
    const daysOverdue = Math.round((asOfUtcMidnight - toUtcMidnight(installment.due_date)) / MS_PER_DAY);

    if (daysOverdue < 0) {
      bucket.notYetDue = roundMoney(bucket.notYetDue + outstanding);
    } else if (daysOverdue < 30) {
      bucket.days0To30 = roundMoney(bucket.days0To30 + outstanding);
    } else if (daysOverdue < 60) {
      bucket.days30To60 = roundMoney(bucket.days30To60 + outstanding);
    } else if (daysOverdue < 90) {
      bucket.days60To90 = roundMoney(bucket.days60To90 + outstanding);
    } else {
      bucket.daysOver90 = roundMoney(bucket.daysOver90 + outstanding);
    }

    bucketsByClient.set(clientId, bucket);
  }

  // Une seule source pour le total : les échéances non soldées. Le total est
  // la somme des tranches, donc il se lit avec les colonnes qui le composent.
  // Le solde comptable (grand livre `ThirdPartyMovement`) reste disponible à
  // part : `ledgerBalance` par ligne et `ledgerTotalBalance` au global. `gap`
  // = solde comptable - total des tranches ; non nul quand le grand livre
  // porte autre chose que des échéances impayées (avance, régularisation,
  // mouvement hors échéancier). `balance` (hérité) garde le solde comptable.
  const lines = base.lines.map(line => {
    const buckets = bucketsByClient.get(line.tenantClientId) ?? emptyBuckets();
    const agedTotal = roundMoney(
      buckets.notYetDue + buckets.days0To30 + buckets.days30To60 + buckets.days60To90 + buckets.daysOver90
    );
    const unallocatedAdvance = advanceByAccount.get(line.accountId) ?? 0;
    const prepaid = prepaidByAccount.get(line.accountId) ?? 0;
    return {
      ...line,
      ...buckets,
      agedTotal,
      ledgerBalance: line.balance,
      unallocatedAdvance,
      // Le grand livre ne compte un loyer qu'à sa date d'échéance : on
      // compare donc au solde âgé HORS « À échoir » (grandeurs comparables).
      // Le trop-perçu, au crédit du grand livre mais hors des tranches, est
      // remis du côté des tranches : il se lit à part, pas comme un écart.
      // Idem de ce qui a déjà été réglé sur une échéance à échoir (`prepaid`) : son crédit est au
      // grand livre, sa créance pas encore.
      gap: roundMoney(line.balance + unallocatedAdvance + prepaid - (agedTotal - buckets.notYetDue))
    };
  });

  const totalBalance = roundMoney(lines.reduce((sum, line) => sum + line.agedTotal, 0));
  const totalNotYetDue = roundMoney(lines.reduce((sum, line) => sum + line.notYetDue, 0));
  const totalAdvance = roundMoney(lines.reduce((sum, line) => sum + line.unallocatedAdvance, 0));
  const totalPrepaid = roundMoney(lines.reduce((sum, line) => sum + (prepaidByAccount.get(line.accountId) ?? 0), 0));
  return {
    lines,
    totalBalance,
    currency: base.currency,
    ledgerTotalBalance: base.totalBalance,
    unallocatedAdvance: totalAdvance,
    gap: roundMoney(base.totalBalance + totalAdvance + totalPrepaid - (totalBalance - totalNotYetDue))
  };
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Avance consommée par des affectations ENCORE EXISTANTES, par compte.
 *
 * Annuler un règlement supprime ses affectations et contre-passe sa pièce « avance », mais laisse
 * en place le couple `PAYMENT` / `ADVANCE_APPLIED` de chaque affectation (net nul au compte :
 * `annulerPieceTx` n'a rien à reprendre). Compter ce débit `ADVANCE_APPLIED` en plus du `VOID`
 * retirait l'avance deux fois — et, à la réactivation du règlement, faisait disparaître une avance
 * pourtant réinscrite. Une imputation dont l'affectation n'existe plus n'est donc pas comptée.
 * Une imputation d'une autre origine que l'affectation reste toujours comptée.
 */
async function sumLiveAdvanceApplications(
  tenantId: string,
  accountIds: string[],
  upTo: Date
): Promise<Map<string, number>> {
  const applied = await prisma.thirdPartyMovement.findMany({
    where: { tenantId, accountId: { in: accountIds }, type: 'ADVANCE_APPLIED', movementDate: { lte: upTo } },
    select: { accountId: true, sourceType: true, sourceId: true, debit: true }
  });

  const allocationIds = applied
    .filter(m => m.sourceType === 'RENTAL_PAYMENT_ALLOCATION' && UUID_RE.test(m.sourceId))
    .map(m => m.sourceId);
  const checked = new Set(allocationIds);
  const live = new Set(
    allocationIds.length === 0
      ? []
      : (
          await prisma.rentalPaymentAllocation.findMany({
            where: { tenant_id: tenantId, id: { in: allocationIds } },
            select: { id: true }
          })
        ).map(a => a.id)
  );

  const totals = new Map<string, number>();
  for (const movement of applied) {
    // Seule une imputation vérifiée ET absente de la table des affectations est écartée.
    if (checked.has(movement.sourceId) && !live.has(movement.sourceId)) continue;
    totals.set(movement.accountId, roundMoney((totals.get(movement.accountId) ?? 0) + toAmountOrZero(movement.debit)));
  }
  return totals;
}

/**
 * Règlement déjà inscrit au grand livre, par compte, pour des affectations à des échéances dont la
 * date est postérieure à `upTo` (loyers à échoir).
 *
 * On lit le crédit `PAYMENT` RÉELLEMENT écrit au compte (dans la fenêtre `<= upTo`), pas le montant
 * de l'affectation : une affectation sans mouvement au compte (ancienne donnée, règlement postérieur
 * à la date de référence) ne pèse pas au grand livre et ne doit donc pas être remise dans l'écart.
 */
async function sumPaidOnFutureInstallments(
  tenantId: string,
  upTo: Date,
  leaseIdFilter: string[] | undefined,
  accountIds: string[]
): Promise<Map<string, number>> {
  const allocations = await prisma.rentalPaymentAllocation.findMany({
    where: {
      tenant_id: tenantId,
      installment: {
        due_date: { gt: upTo },
        ...(leaseIdFilter ? { lease_id: { in: leaseIdFilter } } : {})
      }
    },
    select: { id: true }
  });
  const ids = allocations.map(a => a.id).filter(id => UUID_RE.test(id));
  const totals = new Map<string, number>();
  if (ids.length === 0) return totals;

  const credited = await prisma.thirdPartyMovement.groupBy({
    by: ['accountId'],
    where: {
      tenantId,
      accountId: { in: accountIds },
      type: 'PAYMENT',
      sourceType: 'RENTAL_PAYMENT_ALLOCATION',
      sourceId: { in: ids },
      movementDate: { lte: upTo }
    },
    _sum: { credit: true }
  });
  for (const group of credited) {
    totals.set(group.accountId, roundMoney(toAmountOrZero(group._sum.credit)));
  }
  return totals;
}

// ---------------------------------------------------------------------------
// C. Relevé de compte
// ---------------------------------------------------------------------------

function toMovementRecord(movement: {
  id: string;
  accountId: string;
  movementDate: Date;
  type: string;
  debit: unknown;
  credit: unknown;
  balanceAfter: unknown;
  label: string;
  sourceType: string;
  sourceId: string;
  leaseId: string | null;
  createdAt: Date;
}): ThirdPartyMovementRecord {
  return {
    id: movement.id,
    accountId: movement.accountId,
    movementDate: movement.movementDate,
    type: movement.type as ThirdPartyMovementType,
    amountBilled: toAmount(movement.debit as never),
    amountSettled: toAmount(movement.credit as never),
    balanceAfter: roundMoney(toAmountOrZero(movement.balanceAfter as never)),
    label: movement.label,
    sourceType: movement.sourceType,
    sourceId: movement.sourceId,
    leaseId: movement.leaseId,
    createdAt: movement.createdAt
  };
}

/**
 * Solde d'un compte à une date : Σ débits − Σ crédits des mouvements datés
 * strictement avant (`strict`) ou au plus tard (`upTo`) la borne. Calculé dans
 * l'ordre CHRONOLOGIQUE, jamais d'après `balanceAfter` (figé à l'ordre
 * d'écriture, faux dès qu'un mouvement est daté dans le futur).
 */
export async function balanceUpTo(
  tenantId: string,
  accountId: string,
  bound: { lt?: Date; lte?: Date }
): Promise<number> {
  const sums = await prisma.thirdPartyMovement.aggregate({
    where: { tenantId, accountId, movementDate: bound },
    _sum: { debit: true, credit: true }
  });
  return roundMoney(toAmountOrZero(sums._sum.debit) - toAmountOrZero(sums._sum.credit));
}

/**
 * Ordre TOTAL du relevé : date, écriture, puis identifiant. Deux mouvements de même date et
 * d'écriture simultanée (lot) gardaient un ordre libre, donc des soldes et des pages instables.
 */
const STATEMENT_ORDER = [{ movementDate: 'asc' as const }, { createdAt: 'asc' as const }, { id: 'asc' as const }];

/** Voir `GetAccountStatement` dans `./types.ts`. */
export const getAccountStatement: GetAccountStatement = async (tenantId, accountId, filters) => {
  const account = await prisma.thirdPartyAccount.findFirst({
    where: { id: accountId, tenantId },
    select: { id: true, label: true, currency: true, kind: true }
  });

  if (!account) {
    throw notFound('Compte de tiers introuvable ou inaccessible');
  }

  const range = filters?.range;
  const skip = filters?.skip ?? 0;
  const take = filters?.take ?? 50;
  const asOf = filters?.asOf ?? new Date();
  const upTo = range?.to && range.to < asOf ? range.to : asOf;
  const movementDateFilter = { ...(range?.from ? { gte: range.from } : {}), lte: upTo };
  const movementWhere = {
    tenantId,
    accountId,
    ...(movementDateFilter ? { movementDate: movementDateFilter } : {})
  };

  const [movements, total, openingBalance, closingBalance] = await Promise.all([
    prisma.thirdPartyMovement.findMany({
      where: movementWhere,
      orderBy: STATEMENT_ORDER,
      skip,
      take
    }),
    prisma.thirdPartyMovement.count({ where: movementWhere }),
    range?.from ? balanceUpTo(tenantId, accountId, { lt: range.from }) : Promise.resolve(0),
    balanceUpTo(tenantId, accountId, { lte: upTo })
  ]);

  // Solde courant recalculé dans l'ordre d'affichage, à partir de l'ouverture.
  let running = openingBalance;
  const first = movements[0];
  if (skip > 0 && first) {
    // Somme des mouvements qui précèdent la première ligne de la page, dans l'ordre total du
    // relevé : un agrégat, au lieu de relire `skip` lignes.
    const sums = await prisma.thirdPartyMovement.aggregate({
      where: {
        ...movementWhere,
        OR: [
          { movementDate: { lt: first.movementDate } },
          { movementDate: first.movementDate, createdAt: { lt: first.createdAt } },
          { movementDate: first.movementDate, createdAt: first.createdAt, id: { lt: first.id } }
        ]
      },
      _sum: { debit: true, credit: true }
    });
    running = roundMoney(running + toAmountOrZero(sums._sum.debit) - toAmountOrZero(sums._sum.credit));
  }
  const withBalance = movements.map(m => {
    running = roundMoney(running + toAmountOrZero(m.debit) - toAmountOrZero(m.credit));
    return { ...m, balanceAfter: running };
  });

  return {
    accountId: account.id,
    label: account.label,
    kind: account.kind as string,
    openingBalance,
    closingBalance,
    currency: account.currency,
    movements: withBalance.map(toMovementRecord),
    total
  };
};
