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

/** Devise unique du lot 1 (décision D9 du plan). */
const DEFAULT_CURRENCY = 'XOF';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Statuts d'échéance considérés comme non soldés pour la balance âgée. */
const UNPAID_INSTALLMENT_STATUSES = ['DUE', 'PARTIAL', 'OVERDUE'] as const;

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
    const label = lease.property?.internalReference || lease.property?.title;
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
 * réglés sur la période filtrée ; le solde affiché, lui, est le solde
 * courant du compte (`ThirdPartyAccount.balance`), tenu à jour par le grand
 * livre à chaque mouvement — jamais recalculé ici.
 */
export const getClientsBalance: GetClientsBalance = async (tenantId, filters) => {
  // Comptes TENANT du tenant : une ligne par locataire, chargée une seule
  // fois (une poignée de colonnes par client, pas un mouvement).
  const tenantAccounts = await prisma.thirdPartyAccount.findMany({
    where: { tenantId, kind: 'TENANT' },
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

  const grouped = await prisma.thirdPartyMovement.groupBy({
    by: ['accountId'],
    where: {
      tenantId,
      accountId: { in: accountIds },
      ...(movementDateFilter ? { movementDate: movementDateFilter } : {}),
      ...(leaseIdFilter ? { leaseId: { in: leaseIdFilter } } : {})
    },
    _sum: { debit: true, credit: true }
  });

  if (grouped.length === 0) {
    return { lines: [], totalBalance: 0, currency: DEFAULT_CURRENCY };
  }

  const accountById = new Map(tenantAccounts.map(account => [account.id, account]));
  const tenantClientIds = tenantAccounts
    .map(account => account.tenantClientId)
    .filter((id): id is string => Boolean(id));
  const propertyLabelsByClient = await loadPropertyLabelsByClient(tenantId, tenantClientIds);

  const lines: ClientsBalanceLine[] = grouped.map(group => {
    const account = accountById.get(group.accountId)!;
    const tenantClientId = account.tenantClientId ?? '';
    return {
      accountId: account.id,
      tenantClientId,
      label: account.label,
      propertyLabels: propertyLabelsByClient.get(tenantClientId) ?? [],
      totalBilled: roundMoney(toAmountOrZero(group._sum.debit)),
      totalSettled: roundMoney(toAmountOrZero(group._sum.credit)),
      balance: roundMoney(toAmountOrZero(account.balance)),
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
export const getClientsAgingBalance: GetClientsAgingBalance = async (tenantId, filters) => {
  const asOf = filters?.asOf ?? new Date();

  const base = await getClientsBalance(tenantId, { range: filters?.range, propertyId: filters?.propertyId });
  if (base.lines.length === 0) {
    return { lines: [], totalBalance: 0, currency: base.currency };
  }

  let leaseIdFilter: string[] | undefined;
  if (filters?.propertyId) {
    leaseIdFilter = await resolveLeaseIdsForProperty(tenantId, filters.propertyId);
  }

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
      due_date: true,
      amount_rent: true,
      amount_service: true,
      amount_other_fees: true,
      penalty_amount: true,
      amount_paid: true,
      lease: { select: { primary_renter_client_id: true } }
    }
  });

  const asOfUtcMidnight = toUtcMidnight(asOf);
  const bucketsByClient = new Map<string, AgingBuckets>();

  for (const installment of unpaidInstallments) {
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

  const lines: ClientsAgingBalanceLine[] = base.lines.map(line => ({
    ...line,
    ...(bucketsByClient.get(line.tenantClientId) ?? emptyBuckets())
  }));

  return { lines, totalBalance: base.totalBalance, currency: base.currency };
};

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
 * Solde juste avant `before` (mouvement strictement antérieur). Sans borne,
 * la période part de la genèse du compte : rien ne la précède, l'ouverture
 * est nulle — jamais le solde courant (défaut §6.1 bis n°3, volontairement
 * non reproduit).
 */
async function getBalanceStrictlyBefore(tenantId: string, accountId: string, before?: Date): Promise<number> {
  if (!before) {
    return 0;
  }
  const last = await prisma.thirdPartyMovement.findFirst({
    where: { tenantId, accountId, movementDate: { lt: before } },
    orderBy: [{ movementDate: 'desc' }, { createdAt: 'desc' }],
    select: { balanceAfter: true }
  });
  return last ? roundMoney(toAmountOrZero(last.balanceAfter)) : 0;
}

/**
 * Solde au plus tard à `atOrBefore` (mouvement inclus). Sans borne, c'est le
 * dernier mouvement du compte, donc son solde courant.
 */
async function getBalanceAtOrBefore(tenantId: string, accountId: string, atOrBefore?: Date): Promise<number> {
  const last = await prisma.thirdPartyMovement.findFirst({
    where: {
      tenantId,
      accountId,
      ...(atOrBefore ? { movementDate: { lte: atOrBefore } } : {})
    },
    orderBy: [{ movementDate: 'desc' }, { createdAt: 'desc' }],
    select: { balanceAfter: true }
  });
  return last ? roundMoney(toAmountOrZero(last.balanceAfter)) : 0;
}

/**
 * Relevé à une date : mouvements échus (`movementDate <= asOf`), soldes
 * recalculés chronologiquement. Les échéances futures, écrites d'avance au
 * grand livre, n'y apparaissent pas et ne faussent ni « solde après » ni
 * la clôture.
 */
async function getAccountStatementAsOf(
  tenantId: string,
  account: { id: string; label: string; currency: string; kind: unknown },
  asOf: Date,
  range: PeriodRange | undefined,
  skip: number,
  take: number
) {
  const upper = range?.to && range.to.getTime() < asOf.getTime() ? range.to : asOf;
  const rows = await prisma.thirdPartyMovement.findMany({
    where: { tenantId, accountId: account.id, movementDate: { lte: upper } },
    orderBy: [{ movementDate: 'asc' }, { createdAt: 'asc' }]
  });

  let running = 0;
  let openingBalance = 0;
  const inPeriod: ThirdPartyMovementRecord[] = [];

  for (const row of rows) {
    const record = toMovementRecord(row);
    running = roundMoney(running + (record.amountBilled ?? 0) - (record.amountSettled ?? 0));

    if (range?.from && row.movementDate.getTime() < range.from.getTime()) {
      openingBalance = running;
      continue;
    }
    inPeriod.push({ ...record, balanceAfter: running });
  }

  return {
    accountId: account.id,
    label: account.label,
    kind: account.kind as string,
    openingBalance,
    closingBalance: running,
    currency: account.currency,
    movements: inPeriod.slice(skip, skip + take),
    total: inPeriod.length
  };
}

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

  if (filters?.asOf) {
    return getAccountStatementAsOf(tenantId, account, filters.asOf, range, skip, take);
  }

  const movementDateFilter = buildMovementDateFilter(range);
  const movementWhere = {
    tenantId,
    accountId,
    ...(movementDateFilter ? { movementDate: movementDateFilter } : {})
  };

  const [movements, total, openingBalance, closingBalance] = await Promise.all([
    prisma.thirdPartyMovement.findMany({
      where: movementWhere,
      orderBy: [{ movementDate: 'asc' }, { createdAt: 'asc' }],
      skip,
      take
    }),
    prisma.thirdPartyMovement.count({ where: movementWhere }),
    getBalanceStrictlyBefore(tenantId, accountId, range?.from),
    getBalanceAtOrBefore(tenantId, accountId, range?.to)
  ]);

  return {
    accountId: account.id,
    label: account.label,
    kind: account.kind as string,
    openingBalance,
    closingBalance,
    currency: account.currency,
    movements: movements.map(toMovementRecord),
    total
  };
};
