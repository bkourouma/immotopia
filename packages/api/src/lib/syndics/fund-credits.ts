import type { SyndicFundMovementDirection, SyndicFundMovementSource } from '@prisma/client';
import { prisma, type PrismaTransactionClient } from '../../utils/database';
import { NotFoundError } from '../../middleware/error-middleware';
import { unprocessableEntity } from '../errors';
import { roundMoney } from './finance-utils';
import { fromCents } from './charge-allocation-plan';

/**
 * Fonds de copropriete alimentes par les paiements de charges.
 *
 * Le solde d'un fonds est la somme de ses mouvements (`SyndicateFundMovement`,
 * journal du lot S6) : chaque mouvement met le solde a jour dans la meme
 * transaction que lui.
 *
 * Un fonds est credite automatiquement quand de l'argent d'un coproprietaire
 * est affecte a un appel de charges — paiement affecte a l'appel, ou avance
 * du lot imputee plus tard sur l'appel (`ChargePaymentAllocation`) :
 * - en entier si l'appel est affecte au fonds (`ChargeCall.fundId`, appel de
 *   fonds travaux par exemple) ;
 * - sinon pour la part des postes de budget qui alimentent ce fonds
 *   (`BudgetLineItem.fundId`), au prorata de la repartition du lot
 *   (`BudgetAllocation.breakdown`).
 * L'avance non affectee ne credite aucun fonds tant qu'elle n'est pas imputee.
 *
 * Changer l'affectation d'un appel ou d'un poste ne vaut que pour les
 * affectations suivantes : les credits deja passes ne sont pas recalcules.
 *
 * Verrous : le lot (verrou consultatif, pose par l'appelant) puis les fonds,
 * par identifiant croissant. Aucun autre chemin ne prend un lot apres un
 * fonds, donc pas d'interblocage avec les paiements de prestataires.
 */

type Tx = PrismaTransactionClient;
type Client = Tx | typeof prisma;

export interface FundShare {
  fundId: string;
  /** Part de l'appel versee au fonds, entre 0 et 1. */
  ratio: number;
}

export interface FundCreditItem {
  /** Paiement d'ou vient l'argent (`source_id` du mouvement). */
  paymentId: string;
  chargeCallId: string;
  amountCents: number;
  /** PAYMENT : affecte a l'arrivee du paiement ; ADVANCE : avance imputee plus tard. */
  source: 'PAYMENT' | 'ADVANCE';
}

export interface FundCredit {
  fundId: string;
  chargeCallId: string;
  paymentId: string;
  amount: number;
}

interface CallForShares {
  id: string;
  lotId: string;
  period: string;
  fundId: string | null;
  lot: { lotNumber: string } | null;
  batch: { budgetId: string | null } | null;
  syndicate: { tenantId: string };
}

// ---------------------------------------------------------------------------
// Primitives du journal
// ---------------------------------------------------------------------------

/** Verrou de ligne sur les fonds, par identifiant croissant (ordre global). */
export async function lockFundsTx(tx: Tx, fundIds: string[]) {
  const ordered = Array.from(new Set(fundIds)).sort();
  for (const fundId of ordered) {
    await tx.$queryRaw`SELECT id FROM syndicate_funds WHERE id = ${fundId}::uuid FOR UPDATE`;
  }
}

/**
 * Applique un mouvement au fonds et le trace avec le solde apres mouvement.
 * Un solde negatif reste possible (avance de tresorerie) : c'est a l'appelant
 * de le refuser ou de le signaler.
 */
export async function recordFundMovementTx(
  tx: Tx,
  params: {
    tenantId: string;
    fundId: string;
    direction: SyndicFundMovementDirection;
    amount: number;
    label: string;
    sourceType: SyndicFundMovementSource;
    sourceId?: string | null;
    actorUserId?: string | null;
  }
) {
  const amount = roundMoney(params.amount);
  if (amount <= 0) {
    throw unprocessableEntity('Le montant du mouvement doit être positif');
  }
  const updated = await tx.syndicateFund.update({
    where: { id: params.fundId },
    data: { balance: params.direction === 'CREDIT' ? { increment: amount } : { decrement: amount } }
  });
  const movement = await tx.syndicateFundMovement.create({
    data: {
      tenantId: params.tenantId,
      fundId: params.fundId,
      direction: params.direction,
      amount,
      balanceAfter: roundMoney(Number(updated.balance)),
      label: params.label,
      sourceType: params.sourceType,
      sourceId: params.sourceId ?? null,
      createdById: params.actorUserId ?? null
    }
  });
  return { fund: updated, movement };
}

/**
 * Le fonds doit appartenir a la copropriete de l'agence ; sinon la meme 404
 * qu'un fonds inexistant. `SyndicateFund` ne porte pas `tenantId` : l'agence
 * se lit sur la copropriete, d'ou cette garde plutot que `assertBelongsToTenant`.
 */
export async function assertFundOfSyndicate(client: Client, tenantId: string, syndicateId: string, fundId: string) {
  const fund = await client.syndicateFund.findFirst({
    where: { id: fundId, syndicateId, syndicate: { tenantId } },
    select: { id: true, name: true, currency: true }
  });
  if (!fund) {
    throw new NotFoundError('Fonds introuvable ou inaccessible pour cette copropriété');
  }
  return fund;
}

/** Idem pour une liste (postes d'un budget) ; les valeurs nulles sont ignorees. */
export async function assertFundsOfSyndicate(
  client: Client,
  tenantId: string,
  syndicateId: string,
  fundIds: Array<string | null | undefined>
) {
  const ids = Array.from(new Set(fundIds.filter((id): id is string => Boolean(id))));
  if (ids.length === 0) return [];
  const funds = await client.syndicateFund.findMany({
    where: { id: { in: ids }, syndicateId, syndicate: { tenantId } },
    select: { id: true, name: true, currency: true }
  });
  if (funds.length !== ids.length) {
    throw new NotFoundError('Fonds introuvable ou inaccessible pour cette copropriété');
  }
  return funds;
}

/** Un fonds ne recoit que des montants dans sa devise. */
export function assertFundCurrency(fund: { currency: string }, currency: string) {
  if (fund.currency !== currency) {
    throw unprocessableEntity('La devise du fonds ne correspond pas à celle des charges');
  }
}

// ---------------------------------------------------------------------------
// Parts des fonds dans un appel
// ---------------------------------------------------------------------------

type BreakdownEntry = { lineId?: string; allocated?: number | string };

/** Parts des fonds d'un appel issu d'un budget, d'apres la repartition du lot. */
async function budgetSharesTx(tx: Client, budgetId: string, lotId: string): Promise<FundShare[]> {
  const fundLines = await tx.budgetLineItem.findMany({
    where: { budgetId, fundId: { not: null } },
    select: { id: true, fundId: true }
  });
  if (fundLines.length === 0) return [];

  const allocation = await tx.budgetAllocation.findFirst({
    where: { budgetId, lotId },
    select: { totalAllocated: true, breakdown: true }
  });
  const totalAllocated = Number(allocation?.totalAllocated ?? 0);
  if (!allocation || totalAllocated <= 0) return [];

  const fundByLine = new Map(fundLines.map(line => [line.id, line.fundId as string]));
  const allocatedByFund = new Map<string, number>();
  const breakdown = Array.isArray(allocation.breakdown) ? (allocation.breakdown as BreakdownEntry[]) : [];
  for (const entry of breakdown) {
    const fundId = entry.lineId ? fundByLine.get(entry.lineId) : undefined;
    if (!fundId) continue;
    allocatedByFund.set(fundId, (allocatedByFund.get(fundId) ?? 0) + Number(entry.allocated ?? 0));
  }

  return Array.from(allocatedByFund.entries())
    .filter(([, allocated]) => allocated > 0)
    .map(([fundId, allocated]) => ({ fundId, ratio: Math.min(1, allocated / totalAllocated) }));
}

/**
 * Part de chaque fonds dans un appel. Sur 250 000 appeles dont 25 000 au titre
 * du poste « Fonds de travaux », ce fonds recoit 10 % de chaque somme affectee
 * a l'appel, qu'elle le solde ou non.
 */
export async function fundSharesForCallTx(
  tx: Client,
  call: { fundId?: string | null; lotId: string; batch?: { budgetId: string | null } | null }
): Promise<FundShare[]> {
  if (call.fundId) return [{ fundId: call.fundId, ratio: 1 }];
  const budgetId = call.batch?.budgetId;
  if (!budgetId) return [];
  return budgetSharesTx(tx, budgetId, call.lotId);
}

// ---------------------------------------------------------------------------
// Credit des fonds
// ---------------------------------------------------------------------------

function creditLabel(call: CallForShares, source: FundCreditItem['source']) {
  const lot = call.lot?.lotNumber ? ` — lot ${call.lot.lotNumber}` : '';
  const prefix = source === 'ADVANCE' ? "Part de l'avance imputée" : 'Part du paiement';
  return `${prefix} — appel ${call.period}${lot}`;
}

/** Montants a verser, par (fonds, appel, paiement), avant toute ecriture. */
async function planFundCreditsTx(tx: Tx, items: FundCreditItem[], calls: Map<string, CallForShares>) {
  const shareCache = new Map<string, FundShare[]>();
  const planned: Array<FundCredit & { tenantId: string; label: string }> = [];
  for (const item of items) {
    const call = calls.get(item.chargeCallId);
    if (!call || item.amountCents <= 0) continue;
    if (!shareCache.has(call.id)) shareCache.set(call.id, await fundSharesForCallTx(tx, call));
    for (const share of shareCache.get(call.id) ?? []) {
      const cents = Math.round(item.amountCents * share.ratio);
      if (cents <= 0) continue;
      planned.push({
        fundId: share.fundId,
        chargeCallId: call.id,
        paymentId: item.paymentId,
        amount: fromCents(cents),
        tenantId: call.syndicate.tenantId,
        label: creditLabel(call, item.source)
      });
    }
  }
  return planned;
}

/**
 * Verse a chaque fonds concerne sa part des sommes qui viennent d'etre
 * affectees aux appels du lot, dans la transaction de l'affectation. A
 * appeler sous le verrou du lot, apres l'ecriture des `ChargePaymentAllocation`.
 */
export async function creditFundsForAllocationsTx(
  tx: Tx,
  input: { lotId: string; items: FundCreditItem[]; actorUserId?: string | null }
): Promise<FundCredit[]> {
  const items = input.items.filter(item => item.amountCents > 0);
  if (items.length === 0) return [];

  const rows = await tx.chargeCall.findMany({
    where: { id: { in: Array.from(new Set(items.map(item => item.chargeCallId))) }, lotId: input.lotId },
    select: {
      id: true,
      lotId: true,
      period: true,
      fundId: true,
      lot: { select: { lotNumber: true } },
      batch: { select: { budgetId: true } },
      syndicate: { select: { tenantId: true } }
    }
  });
  const planned = await planFundCreditsTx(tx, items, new Map(rows.map(row => [row.id, row])));
  if (planned.length === 0) return [];

  await lockFundsTx(
    tx,
    planned.map(credit => credit.fundId)
  );
  for (const credit of planned) {
    await recordFundMovementTx(tx, {
      tenantId: credit.tenantId,
      fundId: credit.fundId,
      direction: 'CREDIT',
      amount: credit.amount,
      label: credit.label,
      sourceType: 'CHARGE_PAYMENT',
      sourceId: credit.paymentId,
      actorUserId: input.actorUserId ?? null
    });
  }
  return planned.map(({ fundId, chargeCallId, paymentId, amount }) => ({ fundId, chargeCallId, paymentId, amount }));
}
