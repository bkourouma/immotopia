/**
 * Transferts entre lieux — extrait de `stock-inventaire.ts` (lot 040,
 * fondations), puis étendu par le lot 040 (spec A5-R4, A7-R3 bis, A7-R4, A10,
 * A11, B2-R3, B3-R2, B6).
 *
 * ---------------------------------------------------------------------------
 * Transférer ne crée ni ne détruit de valeur
 * ---------------------------------------------------------------------------
 *
 * La valeur part au coût moyen du lieu d'**origine** et recalcule celui du lieu
 * d'**arrivée** : les deux mouvements portent le **même** `totalValue`,
 * calculé une seule fois — jamais deux arrondis calculés séparément.
 *
 * Un transfert n'impute rien et n'écrit aucune écriture : le 311 ne bouge pas,
 * la matière est toujours à l'actif, simplement ailleurs. Seule la **sortie**
 * impute (principe P-7, `stock-mouvements.ts`).
 *
 * ---------------------------------------------------------------------------
 * Ce que le lot 040 ajoute
 * ---------------------------------------------------------------------------
 *
 * - **Demandeur et motif obligatoires** (A11) : preneur du carnet ou demandeur
 *   en texte, motif de la colonne « Transfert », porté par les DEUX moitiés.
 * - **Chantier clos** (A7-R4) : un transfert VERS le lieu d'un chantier clos
 *   est refusé (`409 STOCK_SITE_CLOSED`) ; DEPUIS ce lieu, il reste permis —
 *   c'est l'évacuation du reste avant la clôture.
 * - **Verrous** (A10-R2, A7-R3 bis) : `stock-site` du chantier d'arrivée s'il
 *   y en a un, AVANT de vérifier qu'il est ouvert ; puis les deux verrous de
 *   solde (origine, arrivée), triés — deux transferts croisés A→B et B→A les
 *   prennent dans le même ordre et ne s'interbloquent jamais.
 * - **Dates bornées** (A5-R4), **idempotence** (B3-R2), **audit critique**
 *   `STOCK_TRANSFER_RECORDED` sur la moitié sortante (B6).
 */

import { randomUUID } from 'crypto';

import { prisma } from '../../utils/database';
import type { PrismaTransactionClient } from '../../utils/database';
import { BadRequestError, NotFoundError } from '../../middleware/error-middleware';
import { recordAuditEvent } from '../../services/audit-service';
import { AuditActionKey } from '../../types/audit-types';
import { roundMoneyXof, roundQuantity } from './money';
import {
  assertMovementDateAllowed,
  buildStockMeta,
  lockStockBalancesTx,
  maskMovementView,
  maskValue
} from './stock-controles';
import {
  MOVEMENT_VIEW_INCLUDE,
  buildMovementView,
  decreaseValuation,
  insufficientStockError,
  loadCallerBlind,
  lockSiteForEntryTx,
  readBalanceTx,
  readControlsTx,
  readUserLabelTx,
  requireActiveLocationTx,
  requirePositiveQuantity,
  requireReason,
  resolveRequesterTx,
  runStockWrite,
  toMovementViewFromRow,
  writeBalanceTx
} from './stock-mouvements';
import type { StockWriteOptions, StockWriteResponse } from './stock-mouvements';
import type { StockCallerContext, StockReasonCode, TransferResult } from './types-040-controle';

/** Devise unique du module (décision D9 du plan, actée au lot 1). */
const DEFAULT_CURRENCY = 'XOF';

export interface RecordStockTransferParams {
  fromLocationId: string;
  toLocationId: string;
  itemId: string;
  quantity: number;
  transferDate: Date;
  /** Motif de la colonne « Transfert » (A11-R2) ; `reason` obligatoire pour `OTHER`. */
  reasonCode?: StockReasonCode | null;
  reason?: string | null;
  /** Preneur du carnet, ou demandeur en texte : au moins l'un des deux (A11-R1). */
  takerId?: string | null;
  requestedBy?: string | null;
  createdByUserId: string;
}

/** L'article : un article désactivé reste transférable (on n'emprisonne pas un stock réel). */
async function requireItemTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  itemId: string
): Promise<{ id: string; reference: string; label: string; unit: string }> {
  const item = await tx.stockItem.findFirst({
    where: { id: itemId, tenantId },
    select: { id: true, reference: true, label: true, unit: true }
  });
  if (!item) {
    throw new NotFoundError('Article de stock introuvable.');
  }
  return item;
}

/**
 * Déplace un article d'un lieu vers un autre : deux mouvements liés par
 * `transferGroupId`, la sortie d'abord, l'entrée ensuite ; aucune écriture
 * comptable, aucune imputation. Tout ce qui peut refuser le transfert est lu et
 * vérifié avant le premier `create`.
 */
export async function recordStockTransferTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  params: RecordStockTransferParams,
  options: StockWriteOptions = {}
): Promise<TransferResult> {
  const quantity = requirePositiveQuantity(params.quantity, 'La quantité transférée doit être strictement positive.');
  if (params.fromLocationId === params.toLocationId) {
    throw new BadRequestError("Un transfert relie deux lieux distincts : l'origine et l'arrivée sont identiques.");
  }
  const reason = requireReason('TRANSFER', params.reasonCode, params.reason);

  // 1. Verrou de chantier de l'ARRIVÉE, avant de vérifier qu'il est ouvert.
  const to = await requireActiveLocationTx(tx, tenantId, params.toLocationId);
  await lockSiteForEntryTx(tx, tenantId, to);
  // 2. Verrous de solde des deux couples, triés, avant toute lecture de solde.
  await lockStockBalancesTx(tx, tenantId, [
    { itemId: params.itemId, locationId: params.fromLocationId },
    { itemId: params.itemId, locationId: params.toLocationId }
  ]);

  // 3. Lectures et contrôles.
  const from = await requireActiveLocationTx(tx, tenantId, params.fromLocationId);
  const settings = await readControlsTx(tx, tenantId);
  assertMovementDateAllowed(params.transferDate, settings.backdatingLimitDays, options.now);
  const requester = await resolveRequesterTx(tx, tenantId, params, settings.requireTaker);
  const item = await requireItemTx(tx, tenantId, params.itemId);
  const source = await readBalanceTx(tx, tenantId, item.id, from.id);
  if (quantity > source.quantity) {
    throw insufficientStockError({
      locationId: from.id,
      itemId: item.id,
      itemLabel: item.label,
      requested: quantity,
      available: source.quantity,
      blindLocationIds: options.blindLocationIds
    });
  }
  const destination = await readBalanceTx(tx, tenantId, item.id, to.id);
  const outgoing = decreaseValuation(source, quantity);
  const toQuantityAfter = roundQuantity(destination.quantity + quantity);
  const toValueAfter = roundMoneyXof(destination.value + outgoing.totalValue);
  const authorLabel = await readUserLabelTx(tx, params.createdByUserId);

  // 4. Écritures : les deux moitiés portent le MÊME groupe, le même motif, le même demandeur.
  const transferGroupId = randomUUID();
  const common = {
    tenantId,
    type: 'TRANSFER' as const,
    itemId: item.id,
    movementDate: params.transferDate,
    quantity,
    // Le coût moyen du lieu d'ORIGINE, pour les deux moitiés.
    unitCost: outgoing.unitCost,
    totalValue: outgoing.totalValue,
    currency: DEFAULT_CURRENCY,
    transferGroupId,
    reasonCode: reason.reasonCode,
    reason: reason.reason,
    takerId: requester.takerId,
    requestedBy: requester.requestedBy,
    createdByUserId: params.createdByUserId
  };
  const sortie = await tx.stockMovement.create({
    data: {
      ...common,
      locationId: from.id,
      isDecrease: true,
      quantityAfter: outgoing.quantityAfter,
      valueAfter: outgoing.valueAfter
    }
  });
  const entree = await tx.stockMovement.create({
    data: { ...common, locationId: to.id, isDecrease: false, quantityAfter: toQuantityAfter, valueAfter: toValueAfter }
  });
  await writeBalanceTx(tx, tenantId, item.id, from.id, source, outgoing.quantityAfter, outgoing.valueAfter);
  await writeBalanceTx(tx, tenantId, item.id, to.id, destination, toQuantityAfter, toValueAfter);

  // 5. Audit critique, sur la moitié sortante.
  await recordAuditEvent(tx, {
    tenantId,
    actorUserId: params.createdByUserId,
    actionKey: AuditActionKey.STOCK_TRANSFER_RECORDED,
    entityType: 'StockMovement',
    entityId: sortie.id,
    payload: {
      transferGroupId,
      itemId: item.id,
      quantity,
      fromLocationId: from.id,
      toLocationId: to.id,
      reasonCode: reason.reasonCode,
      reason: reason.reason,
      takerId: requester.takerId,
      requestedBy: requester.requestedBy,
      value: outgoing.totalValue
    }
  });

  const labels = { item, createdByLabel: authorLabel, takerLabel: requester.takerLabel };
  return {
    transferGroupId,
    movements: [
      buildMovementView(sortie, { ...labels, locationLabel: from.label }),
      buildMovementView(entree, { ...labels, locationLabel: to.label })
    ],
    fromLocationLabel: from.label,
    toLocationLabel: to.label,
    quantity,
    value: outgoing.totalValue,
    currency: DEFAULT_CURRENCY
  };
}

/** Relit un transfert par son groupe (rejeu idempotent). */
export async function loadTransferResult(tenantId: string, transferGroupId: string): Promise<TransferResult> {
  const rows = await prisma.stockMovement.findMany({
    where: { tenantId, transferGroupId, type: 'TRANSFER' },
    include: MOVEMENT_VIEW_INCLUDE
  });
  const views = rows.map(toMovementViewFromRow).sort((a, b) => Number(b.isDecrease) - Number(a.isDecrease));
  const [sortie, entree] = views;
  if (!sortie || !entree) {
    throw new NotFoundError('Transfert introuvable.');
  }
  return {
    transferGroupId,
    movements: [sortie, entree],
    fromLocationLabel: sortie.locationLabel,
    toLocationLabel: entree.locationLabel,
    quantity: sortie.quantity,
    value: sortie.totalValue,
    currency: sortie.currency
  };
}

/** Un transfert, masqué pour l'appelant : `value` suit le lieu d'origine (§8.2). */
export function maskTransferResult(
  result: TransferResult,
  ctx: StockCallerContext,
  blind: Set<string>
): TransferResult {
  const originId = result.movements[0]?.locationId;
  return {
    ...result,
    movements: result.movements.map(movement => maskMovementView(movement, ctx, blind)),
    value: originId && blind.has(originId) ? null : maskValue(result.value, ctx)
  };
}

/** `POST /stock/transfers` : transfert idempotent, masqué pour l'appelant. */
export async function recordStockTransfer(
  tenantId: string,
  ctx: StockCallerContext,
  input: Omit<RecordStockTransferParams, 'createdByUserId'> & { clientRequestId?: string | null },
  body: unknown = input
): Promise<StockWriteResponse<TransferResult>> {
  const blind = await loadCallerBlind(tenantId, ctx);
  const { replayed, result } = await runStockWrite({
    tenantId,
    ctx,
    operation: 'TRANSFER',
    clientRequestId: input.clientRequestId,
    body,
    blind,
    execute: async tx => {
      const out = await recordStockTransferTx(
        tx,
        tenantId,
        { ...input, createdByUserId: ctx.userId },
        { blindLocationIds: blind }
      );
      return { result: out, resultType: 'StockMovement', resultId: out.transferGroupId };
    },
    replay: ref => loadTransferResult(tenantId, ref.resultId)
  });
  return {
    status: replayed ? 200 : 201,
    data: maskTransferResult(result, ctx, blind),
    meta: buildStockMeta(ctx, blind)
  };
}
