/**
 * Relevé de compte de tiers filtré par un texte (libellé du mouvement).
 *
 * Règle de présentation : le « solde après » de chaque ligne retenue est le
 * VRAI solde après ce mouvement, calculé sur la suite COMPLÈTE des mouvements
 * du compte dans la période — jamais recalculé sur les seules lignes filtrées.
 * Les soldes d'ouverture et de clôture sont ceux du relevé non filtré.
 *
 * Fichier à part de `reports.ts` : `getAccountStatement` (chemin sans recherche)
 * reste inchangé. Les bornes de dates, le contrôle d'appartenance du compte et
 * le mappage d'un mouvement répliquent `getAccountStatement` / `toMovementRecord`.
 */
import { prisma } from '../../utils/database';
import { notFound } from '../errors';
import { roundMoney } from './money';
import { balanceUpTo } from './reports';
import {
  toAmount,
  toAmountOrZero,
  type PeriodRange,
  type ThirdPartyMovementRecord,
  type ThirdPartyMovementType
} from './types';

export interface SearchAccountStatementOptions {
  range?: PeriodRange;
  search: string;
  skip?: number;
  take?: number;
  asOf?: Date;
}

export interface SearchAccountStatementResult {
  accountId: string;
  label: string;
  kind: string;
  openingBalance: number;
  closingBalance: number;
  currency: string;
  movements: ThirdPartyMovementRecord[];
  /** Nombre de lignes retenues par la recherche (toutes pages). */
  total: number;
  /** Somme des montants facturés / réglés de TOUTES les lignes retenues. */
  filteredTotals: { debit: number; credit: number };
}

const ORDER = [{ movementDate: 'asc' as const }, { createdAt: 'asc' as const }];

export async function searchAccountStatement(
  tenantId: string,
  accountId: string,
  options: SearchAccountStatementOptions
): Promise<SearchAccountStatementResult> {
  const account = await prisma.thirdPartyAccount.findFirst({
    where: { id: accountId, tenantId },
    select: { id: true, label: true, currency: true, kind: true }
  });
  if (!account) {
    throw notFound('Compte de tiers introuvable ou inaccessible');
  }

  const { range, search } = options;
  const skip = options.skip ?? 0;
  const take = options.take ?? 50;
  const asOf = options.asOf ?? new Date();
  const upTo = range?.to && range.to < asOf ? range.to : asOf;
  const movementWhere = {
    tenantId,
    accountId,
    movementDate: { ...(range?.from ? { gte: range.from } : {}), lte: upTo }
  };

  const [full, matched, openingBalance, closingBalance] = await Promise.all([
    // La suite complète de la période : seule source des soldes courants.
    prisma.thirdPartyMovement.findMany({
      where: movementWhere,
      orderBy: ORDER,
      select: { id: true, debit: true, credit: true }
    }),
    prisma.thirdPartyMovement.findMany({
      where: { ...movementWhere, label: { contains: search, mode: 'insensitive' } },
      orderBy: ORDER
    }),
    range?.from ? balanceUpTo(tenantId, accountId, { lt: range.from }) : Promise.resolve(0),
    balanceUpTo(tenantId, accountId, { lte: upTo })
  ]);

  // Solde courant dans l'ordre d'affichage, à partir de l'ouverture (comme getAccountStatement).
  const balanceById = new Map<string, number>();
  let running = openingBalance;
  for (const m of full) {
    running = roundMoney(running + toAmountOrZero(m.debit as never) - toAmountOrZero(m.credit as never));
    balanceById.set(m.id, running);
  }

  let debit = 0;
  let credit = 0;
  for (const m of matched) {
    debit += toAmountOrZero(m.debit as never);
    credit += toAmountOrZero(m.credit as never);
  }

  const movements = matched.slice(skip, skip + take).map(m => ({
    id: m.id,
    accountId: m.accountId,
    movementDate: m.movementDate,
    type: m.type as ThirdPartyMovementType,
    amountBilled: toAmount(m.debit as never),
    amountSettled: toAmount(m.credit as never),
    balanceAfter: balanceById.get(m.id) ?? 0,
    label: m.label,
    sourceType: m.sourceType,
    sourceId: m.sourceId,
    leaseId: m.leaseId,
    createdAt: m.createdAt
  }));

  return {
    accountId: account.id,
    label: account.label,
    kind: account.kind as string,
    openingBalance,
    closingBalance,
    currency: account.currency,
    movements,
    total: matched.length,
    filteredTotals: { debit: roundMoney(debit), credit: roundMoney(credit) }
  };
}
