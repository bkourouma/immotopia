/**
 * Réceptions, sorties, retours fournisseur, rebuts et soldes — lot 5,
 * deuxième sous-lot, étendu par le lot 040 « contrôle du stock de chantier »
 * (spec 040 : A5-R4, A6, A7-R3 bis, A7-R4, A8, A10, B2-R3, B3, B4-R1, B6, B7).
 *
 * C'est le cœur du module : la **sortie de magasin** est ce qui fait entrer le
 * matériau dans le coût d'un chantier, à la place de la facture (principe
 * P-7). Le lot 040 n'y change rien ; il rend chaque geste attribuable (preneur,
 * bon numéroté, audit), borné (dates, verrous) et contrôlé (alertes).
 *
 * ---------------------------------------------------------------------------
 * Le coût moyen n'est jamais une colonne
 * ---------------------------------------------------------------------------
 *
 * Il se déduit de `value / quantity`, par **(article, LIEU)**, et il n'est
 * stocké nulle part. Une sortie, un rebut, un retour sont valorisés au coût
 * moyen **avant** le mouvement, jamais à un prix saisi (principe P-4). Seule
 * la réception porte un prix d'entrée (chaîne A8-R3), et seule la part
 * fournisseur d'un retour porte un prix fournisseur (A6-R3 bis).
 *
 * Les **montants** sont des entiers XOF (`roundMoneyXof`), les **quantités**
 * ont quatre décimales (`roundQuantity`) : on compte des tonnes et des mètres
 * cubes. Quand la quantité d'un lieu tombe à zéro, sa valeur aussi : le
 * mouvement emporte toute la valeur restante, écart d'arrondi compris.
 *
 * ---------------------------------------------------------------------------
 * Ordre d'une transaction d'écriture (A10-R2, B3-R2), toujours le même
 * ---------------------------------------------------------------------------
 *
 *   0. la clé d'idempotence (`runStockWrite`), PREMIÈRE écriture ;
 *   1. le verrou de chantier `stock-site`, quand la marchandise ENTRE sur le
 *      lieu d'un chantier (réception, transfert entrant), pris AVANT de
 *      vérifier que le chantier est ouvert (A7-R3 bis) ;
 *   2. les verrous de solde `stock-balance`, triés, AVANT toute lecture de
 *      solde ;
 *   3. les lectures et contrôles — tout ce qui peut refuser l'opération est
 *      vérifié avant la première écriture : en PostgreSQL une commande en
 *      échec condamne toute la transaction ;
 *   4. le bon (`createStockSlipTx`, verrou `stock-slip`, le dernier) — AVANT
 *      les écritures de solde, puisqu'aucun verrou ne se prend après elles ;
 *   5. les mouvements, les soldes, les écritures comptables ;
 *   6. les alertes (`raiseStockAlertTx`, jamais d'exception) ;
 *   7. l'audit critique (`recordAuditEvent`, dans la transaction).
 *
 * ---------------------------------------------------------------------------
 * Ce que voit l'appelant (spec §8.1, §8.2)
 * ---------------------------------------------------------------------------
 *
 * Les fonctions `…Tx` rendent des vues NON masquées (scripts, tests, rejeu).
 * Les fonctions publiques (`recordStockReceipt`, …) passent par
 * `runStockWrite`, puis masquent le résultat pour l'appelant : valeurs sans
 * STOCK_VALUES_VIEW, quantités d'un lieu en comptage sans
 * STOCK_COUNT_VALIDATE. Un rejeu idempotent relit le résultat d'origine et le
 * masque à l'instant du rejeu. Aucun message construit ne cite de montant
 * pour un appelant qui ne voit pas les valeurs, et un refus « stock
 * insuffisant » ne cite jamais la quantité disponible d'un lieu en comptage.
 */

import { prisma } from '../../utils/database';
import type { PrismaTransactionClient } from '../../utils/database';
import { AppError, BadRequestError, ConflictError, ErrorCode, NotFoundError } from '../../middleware/error-middleware';
import { logAuditEvent, recordAuditEvent } from '../../services/audit-service';
import { AuditActionKey } from '../../types/audit-types';
import { t } from '../../i18n';
import {
  ensureOperationalChartOfAccountsTx,
  ensureOperationalJournalTx,
  postDocumentEntryTx,
  resolveExpenseAccountsByCostCategoryTx
} from './accounting';
import { syncWorkProgramCostTx } from './cost-allocation';
import { appendThirdPartyMovementTx } from './ledger';
import { roundMoneyXof, roundQuantity } from './money';
import { toAmountOrZero } from './types';
import { alertKeys, raiseStockAlertTx, readStockAlertSettings, toYearMonthUtc } from './stock-alertes';
import { createStockSlipTx, formatSlipNumber } from './stock-bons';
import {
  assertMovementDateAllowed,
  assertReasonForContext,
  buildStockMeta,
  claimClientRequestTx,
  completeClientRequestTx,
  entryLagDays,
  findClientRequestReplay,
  hashRequestBody,
  isUniqueViolation,
  loadBlindLocationIds,
  lockStockBalancesTx,
  lockStockInvoiceTx,
  lockStockScrapMonthTx,
  lockStockSiteTx,
  maskBalanceView,
  maskMovementView,
  stockError
} from './stock-controles';
import type {
  BalanceView,
  MovementView,
  ReceiptControl,
  SlipResult,
  SlipSummary,
  StockAlertSeverity,
  StockCallerContext,
  StockClientOperation,
  StockControlsSettingsValues,
  StockMeta,
  StockReasonCode,
  StockReasonContext,
  StockSlipKind,
  StockSlipSnapshot,
  StockValuationSource
} from './types-040-controle';
import type { ListStockBalances, StockBalanceRecord } from './types-lot5-mouvements';

/** Devise unique du module (décision D9 du plan, actée au lot 1). */
const DEFAULT_CURRENCY = 'XOF';

/** Une sortie et une réception portent 1 à 50 lignes (B3-R3). */
export const MAX_STOCK_LINES = 50;

/** Délais de la transaction d'écriture : une sortie de 50 lignes écrit 50 écritures. */
const WRITE_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 };

// ===========================================================================
// I. Aides partagées (aussi par `stock-transferts.ts`)
// ===========================================================================

/** Le coût moyen pondéré d'un emplacement : calculé, jamais stocké ; zéro sur un solde vide. */
export function averageUnitCostOf(quantity: number, value: number): number {
  return quantity <= 0 ? 0 : value / quantity;
}

/** Le solde d'un emplacement, lu sous verrou avant toute écriture. */
export interface BalanceState {
  /** Nul quand l'emplacement n'a encore jamais rien reçu. */
  id: string | null;
  quantity: number;
  value: number;
}

/**
 * Lit le solde (article, lieu). Jamais `findUnique` sur la clé composée : le
 * `tenantId` entre dans le filtre. Appelée APRÈS `lockStockBalancesTx`.
 */
export async function readBalanceTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  itemId: string,
  locationId: string
): Promise<BalanceState> {
  const row = await tx.stockBalance.findFirst({
    where: { tenantId, itemId, locationId },
    select: { id: true, quantity: true, value: true }
  });
  if (!row) {
    return { id: null, quantity: 0, value: 0 };
  }
  return {
    id: row.id,
    quantity: roundQuantity(toAmountOrZero(row.quantity)),
    value: roundMoneyXof(toAmountOrZero(row.value))
  };
}

/** Écrit le nouvel état du solde et rend l'état écrit (avec l'identifiant d'une ligne créée). */
export async function writeBalanceTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  itemId: string,
  locationId: string,
  previous: BalanceState,
  quantity: number,
  value: number
): Promise<BalanceState> {
  if (previous.id) {
    await tx.stockBalance.update({ where: { id: previous.id, tenantId }, data: { quantity, value } });
    return { id: previous.id, quantity, value };
  }
  const created = await tx.stockBalance.create({
    data: { tenantId, itemId, locationId, quantity, value, currency: DEFAULT_CURRENCY },
    select: { id: true }
  });
  return { id: created.id, quantity, value };
}

/**
 * Valeur d'une DIMINUTION au coût moyen d'avant (P-4) : quand la quantité tombe
 * à zéro, la valeur aussi — le mouvement emporte toute la valeur restante.
 */
export function decreaseValuation(
  previous: BalanceState,
  quantity: number
): { unitCost: number; totalValue: number; quantityAfter: number; valueAfter: number } {
  const average = averageUnitCostOf(previous.quantity, previous.value);
  const quantityAfter = roundQuantity(previous.quantity - quantity);
  if (quantityAfter <= 0) {
    return {
      unitCost: roundQuantity(average),
      totalValue: roundMoneyXof(previous.value),
      quantityAfter: 0,
      valueAfter: 0
    };
  }
  const totalValue = roundMoneyXof(quantity * average);
  return {
    unitCost: roundQuantity(average),
    totalValue,
    quantityAfter,
    valueAfter: Math.max(0, roundMoneyXof(previous.value - totalValue))
  };
}

/** Libellé d'un utilisateur : nom, sinon e-mail. Jamais l'objet `User` complet. */
export function userLabelOf(user?: { fullName?: string | null; email?: string | null } | null): string {
  return user?.fullName || user?.email || 'Utilisateur inconnu';
}

/** Le libellé de l'auteur, figé sur le bon (B4-R3). */
export async function readUserLabelTx(tx: PrismaTransactionClient, userId: string): Promise<string> {
  const user = await tx.user.findFirst({ where: { id: userId }, select: { fullName: true, email: true } });
  return userLabelOf(user);
}

/** « Koné Ibrahim — Équipe maçonnerie » : le libellé d'un preneur. */
export function takerLabelOf(taker: { fullName: string; teamOrCompany?: string | null }): string {
  return taker.teamOrCompany ? `${taker.fullName} — ${taker.teamOrCompany}` : taker.fullName;
}

/** Un lieu actif, lu dans l'agence. */
export interface ActiveLocation {
  id: string;
  label: string;
  kind: string;
  siteId: string | null;
}

/** Le lieu, actif. Une autre agence répond comme un lieu inexistant. */
export async function requireActiveLocationTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  locationId: string
): Promise<ActiveLocation> {
  const location = await tx.stockLocation.findFirst({
    where: { id: locationId, tenantId },
    select: { id: true, label: true, kind: true, siteId: true, isActive: true }
  });
  if (!location) {
    throw new NotFoundError('Lieu de stockage introuvable.');
  }
  if (!location.isActive) {
    throw stockError(409, ErrorCode.STOCK_LOCATION_INACTIVE, 'Ce lieu de stockage est désactivé.');
  }
  return { id: location.id, label: location.label, kind: String(location.kind), siteId: location.siteId ?? null };
}

/**
 * Entrée de marchandise sur le lieu d'un chantier (réception, transfert
 * entrant) : verrou `stock-site` PUIS contrôle que le chantier est ouvert
 * (A7-R3 bis, A7-R4). Une clôture simultanée prend le même verrou : l'une des
 * deux attend l'autre, elles ne passent jamais toutes les deux.
 */
export async function lockSiteForEntryTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  location: { siteId: string | null }
): Promise<{ id: string; name: string } | null> {
  if (!location.siteId) {
    return null;
  }
  await lockStockSiteTx(tx, location.siteId);
  const site = await tx.constructionSite.findFirst({
    where: { id: location.siteId, tenantId },
    select: { id: true, name: true, closedAt: true }
  });
  if (!site) {
    throw new NotFoundError('Chantier introuvable.');
  }
  if (site.closedAt) {
    throw stockError(
      409,
      ErrorCode.STOCK_SITE_CLOSED,
      "Le chantier de ce lieu de stockage est clôturé : il n'accepte plus de marchandise."
    );
  }
  return { id: site.id, name: site.name };
}

/** Le demandeur d'une sortie ou d'un transfert, tel qu'il est écrit (B2-R3, A11-R1). */
export interface ResolvedRequester {
  takerId: string | null;
  /** Texte saisi, ou INSTANTANÉ du libellé du preneur : renommer le preneur ne réécrit pas l'histoire. */
  requestedBy: string;
  takerLabel: string | null;
}

/**
 * Preneur du carnet ou demandeur en texte : au moins l'un des deux
 * (`400 STOCK_REQUESTER_REQUIRED`) ; `requireTaker` exige le preneur
 * (`400 STOCK_TAKER_REQUIRED`). Un preneur d'une autre agence répond 404, un
 * preneur désactivé `409 STOCK_TAKER_INACTIVE`.
 */
export async function resolveRequesterTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  input: { takerId?: string | null; requestedBy?: string | null },
  requireTaker: boolean
): Promise<ResolvedRequester> {
  if (input.takerId) {
    const taker = await tx.stockTaker.findFirst({
      where: { id: input.takerId, tenantId },
      select: { id: true, fullName: true, teamOrCompany: true, isActive: true }
    });
    if (!taker) {
      throw new NotFoundError('Preneur introuvable.');
    }
    if (!taker.isActive) {
      throw stockError(409, ErrorCode.STOCK_TAKER_INACTIVE, 'Ce preneur est désactivé : choisissez-en un autre.');
    }
    const label = takerLabelOf(taker);
    return { takerId: taker.id, requestedBy: label, takerLabel: label };
  }
  if (requireTaker) {
    throw stockError(400, ErrorCode.STOCK_TAKER_REQUIRED, "L'agence exige un preneur du carnet pour cette opération.", {
      field: 'takerId'
    });
  }
  const text = (input.requestedBy ?? '').trim();
  if (!text) {
    throw stockError(400, ErrorCode.STOCK_REQUESTER_REQUIRED, 'Indiquez le preneur ou le demandeur.', {
      field: 'requestedBy'
    });
  }
  return { takerId: null, requestedBy: text, takerLabel: null };
}

/** Le motif d'une opération : obligatoire, dans la liste fermée de son contexte (spec §4). */
export function requireReason(
  context: StockReasonContext,
  reasonCode: StockReasonCode | null | undefined,
  reason?: string | null
): { reasonCode: StockReasonCode; reason: string | null } {
  if (!reasonCode) {
    throw stockError(400, ErrorCode.STOCK_REASON_REQUIRED, 'Le motif est obligatoire pour cette opération.', {
      field: 'reasonCode'
    });
  }
  assertReasonForContext(context, reasonCode, reason);
  const precision = typeof reason === 'string' ? reason.trim() : '';
  return { reasonCode, reason: precision.length > 0 ? precision : null };
}

/** Une quantité déplacée : strictement positive, quatre décimales. */
export function requirePositiveQuantity(value: number, message: string): number {
  const quantity = roundQuantity(Number(value));
  if (!Number.isFinite(quantity) || !(quantity > 0)) {
    throw new BadRequestError(message, [{ field: 'quantity', message }]);
  }
  return quantity;
}

/**
 * Refus « stock insuffisant ». La quantité disponible n'est citée (dans
 * `data`, jamais dans le message) que si l'on sait que l'appelant voit le lieu :
 * sans `blindLocationIds`, rien n'est cité (spec §8.2, A2 critère 3).
 */
export function insufficientStockError(input: {
  locationId: string;
  itemId: string;
  itemLabel: string;
  requested: number;
  available: number;
  blindLocationIds?: Set<string>;
}): AppError {
  const showAvailable = input.blindLocationIds !== undefined && !input.blindLocationIds.has(input.locationId);
  return stockError(409, ErrorCode.STOCK_INSUFFICIENT, 'Stock insuffisant sur ce lieu pour la quantité demandée.', {
    locationId: input.locationId,
    items: [
      {
        itemId: input.itemId,
        itemLabel: input.itemLabel,
        requestedQuantity: input.requested,
        ...(showAvailable ? { availableQuantity: input.available } : {})
      }
    ]
  });
}

/** Réglages de contrôle, défauts appliqués, sans créer de ligne (data-model §2.2). */
export async function readControlsTx(
  tx: PrismaTransactionClient,
  tenantId: string
): Promise<StockControlsSettingsValues> {
  return readStockAlertSettings(tx, tenantId);
}

/** Options communes des fonctions d'écriture `…Tx`. */
export interface StockWriteOptions {
  /** Lieux masqués pour l'appelant ; absent, aucune quantité disponible n'est citée dans un refus. */
  blindLocationIds?: Set<string>;
  /** Horloge des bornes de date (tests). */
  now?: Date;
}

// ---------------------------------------------------------------------------
// Vue d'un mouvement (contrat `MovementView`), NON masquée
// ---------------------------------------------------------------------------

/** Ce qu'une vue lit dans les relations ; jamais l'objet `User` complet. */
export const MOVEMENT_VIEW_INCLUDE = {
  item: { select: { reference: true, label: true, unit: true } },
  location: { select: { label: true } },
  site: { select: { name: true } },
  costCategory: { select: { label: true } },
  supplierInvoice: { select: { reference: true } },
  createdBy: { select: { fullName: true, email: true } },
  taker: { select: { fullName: true, teamOrCompany: true } },
  slip: { select: { kind: true, year: true, number: true } },
  _count: { select: { attachments: { where: { removedAt: null } } } }
} as const;

/** Libellés d'une vue, quand le mouvement vient d'être écrit (aucune relecture). */
export interface MovementLabels {
  item: { reference: string; label: string; unit: string };
  locationLabel: string;
  siteLabel?: string | null;
  costCategoryLabel?: string | null;
  supplierInvoiceReference?: string | null;
  takerLabel?: string | null;
  slipNumber?: string | null;
  createdByLabel: string;
  attachmentsCount?: number;
}

function nullableMoney(value: Parameters<typeof toAmountOrZero>[0]): number | null {
  return value === null || value === undefined ? null : roundMoneyXof(toAmountOrZero(value));
}

/** Construit la vue d'un mouvement depuis sa ligne et ses libellés. */
export function buildMovementView(row: any, labels: MovementLabels): MovementView {
  const createdAt: Date = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt ?? Date.now());
  const movementDate: Date = row.movementDate instanceof Date ? row.movementDate : new Date(row.movementDate);
  return {
    id: row.id,
    type: row.type,
    itemId: row.itemId,
    itemReference: labels.item.reference,
    itemLabel: labels.item.label,
    itemUnit: labels.item.unit,
    locationId: row.locationId,
    locationLabel: labels.locationLabel,
    movementDate,
    quantity: roundQuantity(toAmountOrZero(row.quantity)),
    isDecrease: row.isDecrease === true,
    unitCost: roundQuantity(toAmountOrZero(row.unitCost)),
    totalValue: roundMoneyXof(toAmountOrZero(row.totalValue)),
    currency: row.currency ?? DEFAULT_CURRENCY,
    quantityAfter: roundQuantity(toAmountOrZero(row.quantityAfter)),
    valueAfter: roundMoneyXof(toAmountOrZero(row.valueAfter)),
    siteId: row.siteId ?? null,
    siteLabel: labels.siteLabel ?? null,
    costCategoryLabel: labels.costCategoryLabel ?? null,
    requestedBy: row.requestedBy ?? null,
    takerId: row.takerId ?? null,
    takerLabel: labels.takerLabel ?? null,
    supplierInvoiceId: row.supplierInvoiceId ?? null,
    supplierInvoiceReference: labels.supplierInvoiceReference ?? null,
    transferGroupId: row.transferGroupId ?? null,
    stockCountId: row.stockCountId ?? null,
    slipId: row.slipId ?? null,
    slipNumber: labels.slipNumber ?? null,
    reasonCode: row.reasonCode ?? null,
    reason: row.reason ?? null,
    valuationSource: row.valuationSource ?? null,
    supplierCreditValue: nullableMoney(row.supplierCreditValue),
    createdByUserId: row.createdByUserId,
    createdByLabel: labels.createdByLabel,
    createdAt,
    entryLagDays: entryLagDays(createdAt, movementDate),
    attachmentsCount: labels.attachmentsCount ?? 0
  };
}

/** Vue d'un mouvement relu avec `MOVEMENT_VIEW_INCLUDE`. */
export function toMovementViewFromRow(row: any): MovementView {
  return buildMovementView(row, {
    item: {
      reference: row.item?.reference ?? 'Article inconnu',
      label: row.item?.label ?? 'Article inconnu',
      unit: row.item?.unit ?? ''
    },
    locationLabel: row.location?.label ?? 'Lieu inconnu',
    siteLabel: row.site?.name ?? null,
    costCategoryLabel: row.costCategory?.label ?? null,
    supplierInvoiceReference: row.supplierInvoice?.reference ?? null,
    takerLabel: row.taker ? takerLabelOf(row.taker) : null,
    slipNumber: row.slip ? formatSlipNumber(row.slip.kind, row.slip.year, row.slip.number) : null,
    createdByLabel: userLabelOf(row.createdBy),
    attachmentsCount: row._count?.attachments ?? 0
  });
}

/** Le résumé d'un bon (contrat `SlipSummary`). */
export function toSlipSummary(slip: {
  id: string;
  kind: StockSlipKind;
  year: number;
  number: number;
  documentDate: Date;
  createdAt: Date;
}): SlipSummary {
  return {
    id: slip.id,
    kind: slip.kind,
    number: formatSlipNumber(slip.kind, slip.year, slip.number),
    documentDate: slip.documentDate,
    createdAt: slip.createdAt
  };
}

/** Crée le bon et relit son résumé (numéro, heure serveur). */
async function issueSlipTx(
  tx: PrismaTransactionClient,
  input: Parameters<typeof createStockSlipTx>[1]
): Promise<SlipSummary> {
  const created = await createStockSlipTx(tx, input);
  const row = await tx.stockSlip.findFirst({
    where: { id: created.id, tenantId: input.tenantId },
    select: { id: true, kind: true, year: true, number: true, documentDate: true, createdAt: true }
  });
  if (!row) {
    return {
      id: created.id,
      kind: input.kind,
      number: created.number,
      documentDate: input.documentDate,
      createdAt: new Date()
    };
  }
  return toSlipSummary(row);
}

// ---------------------------------------------------------------------------
// Comptes et journal opérationnels
// ---------------------------------------------------------------------------

interface OperationalAccounts {
  journalId: string;
  /** 311 — Stocks de matières et fournitures. */
  stockAccountId: string;
  /** 605 — Charges de chantier : repli quand le poste n'a pas son propre compte. */
  siteExpenseAccountId: string;
  /** 603 — Variation des stocks : écarts, rebuts, écart de prix d'un retour. */
  stockVariationAccountId: string;
  /** 401 — Fournisseurs. */
  supplierAccountId: string;
}

/** Résout journal et comptes par `accounting.ts` : ce fichier ne porte aucune copie du plan de comptes. */
async function resolveOperationalAccounts(
  tx: PrismaTransactionClient,
  tenantId: string,
  entryDate: Date
): Promise<OperationalAccounts> {
  const [journalId, comptes] = await Promise.all([
    ensureOperationalJournalTx(tx, tenantId, entryDate.getUTCFullYear()),
    ensureOperationalChartOfAccountsTx(tx, tenantId)
  ]);
  const exiger = (numero: string): string => {
    const id = comptes.get(numero);
    if (!id) {
      throw new Error(`Compte opérationnel ${numero} absent après amorçage du plan de comptes.`);
    }
    return id;
  };
  return {
    journalId,
    stockAccountId: exiger('311'),
    siteExpenseAccountId: exiger('605'),
    stockVariationAccountId: exiger('603'),
    supplierAccountId: exiger('401')
  };
}

// ---------------------------------------------------------------------------
// Articles, factures
// ---------------------------------------------------------------------------

interface ItemRow {
  id: string;
  reference: string;
  label: string;
  unit: string;
  isActive: boolean;
}

/**
 * Les articles, par lot. Un article d'une autre agence répond comme un
 * inexistant ; `activeOnly` refuse un article désactivé (réception : on n'en
 * achète plus ; il peut encore sortir).
 */
async function requireItemsTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  itemIds: string[],
  activeOnly: boolean
): Promise<Map<string, ItemRow>> {
  const unique = [...new Set(itemIds)];
  const rows = (await tx.stockItem.findMany({
    where: { tenantId, id: { in: unique } },
    select: { id: true, reference: true, label: true, unit: true, isActive: true }
  })) as ItemRow[];
  const byId = new Map(rows.map(row => [row.id, row]));
  for (const id of unique) {
    const item = byId.get(id);
    if (!item) {
      throw new NotFoundError('Article de stock introuvable.');
    }
    if (activeOnly && !item.isActive) {
      throw stockError(409, ErrorCode.STOCK_ITEM_INACTIVE, 'Cet article est désactivé : on ne peut plus en recevoir.', {
        items: [{ itemId: item.id, itemLabel: item.label }]
      });
    }
  }
  return byId;
}

interface InvoiceRow {
  id: string;
  reference: string;
  amount: number;
  supplierId: string;
  supplierName: string;
}

/** La facture, de l'agence et VALIDÉE (`409 STOCK_INVOICE_NOT_VALIDATED`). */
async function requireValidatedInvoiceTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  invoiceId: string
): Promise<InvoiceRow> {
  const invoice = await tx.supplierInvoice.findFirst({
    where: { id: invoiceId, tenantId },
    select: {
      id: true,
      reference: true,
      status: true,
      amount: true,
      supplierId: true,
      supplier: { select: { name: true } }
    }
  });
  if (!invoice) {
    throw new NotFoundError('Facture fournisseur introuvable.');
  }
  if (invoice.status !== 'VALIDATED') {
    throw stockError(
      409,
      ErrorCode.STOCK_INVOICE_NOT_VALIDATED,
      "Cette facture n'est pas validée : une réception ou un retour ne s'adosse qu'à une facture validée."
    );
  }
  return {
    id: invoice.id,
    reference: invoice.reference,
    amount: roundMoneyXof(toAmountOrZero(invoice.amount)),
    supplierId: invoice.supplierId,
    supplierName: (invoice as any).supplier?.name ?? 'Fournisseur inconnu'
  };
}

/**
 * Les lignes de facture désignées : elles doivent appartenir à CETTE facture
 * (une ligne d'une autre facture, ou d'une autre agence, répond 404).
 */
async function requireInvoiceLinesTx(
  tx: PrismaTransactionClient,
  invoiceId: string,
  lineIds: string[]
): Promise<Map<string, { id: string; unitPrice: number | null }>> {
  const unique = [...new Set(lineIds)];
  if (unique.length === 0) {
    return new Map();
  }
  const rows = await tx.supplierInvoiceLine.findMany({
    where: { invoiceId, id: { in: unique } },
    select: { id: true, unitPrice: true }
  });
  const byId = new Map(
    rows.map(row => [row.id, { id: row.id, unitPrice: row.unitPrice === null ? null : toAmountOrZero(row.unitPrice) }])
  );
  if (unique.some(id => !byId.has(id))) {
    throw new NotFoundError('Ligne de facture introuvable sur cette facture.');
  }
  return byId;
}

// ===========================================================================
// II. Écriture idempotente et masquée
// ===========================================================================

/** Ce qu'une exécution rend : le résultat, et la référence inscrite sur la clé d'idempotence. */
export interface StockWriteRun<R> {
  result: R;
  resultType: string;
  resultId: string;
}

/**
 * Exécute une écriture du stock dans UNE transaction, idempotente (B3-R2) :
 *
 * - clé déjà présente, même utilisateur et même corps → le résultat d'origine
 *   (`replay`), sans rien réécrire ; autre corps, autre utilisateur ou autre
 *   opération →
 *   `409 STOCK_IDEMPOTENCY_MISMATCH` (levé par `findClientRequestReplay`) ;
 * - sinon la clé est la PREMIÈRE écriture de la transaction ; un rejeu
 *   concurrent bute sur l'unicité (`P2002`), sa transaction est annulée, et
 *   la clé est relue pour répondre.
 *
 * Un refus « stock insuffisant » sur un lieu en comptage est tracé ici, HORS
 * transaction (`STOCK_BLIND_INSUFFICIENT_REFUSED`, B6-R5).
 */
export async function runStockWrite<R>(input: {
  tenantId: string;
  ctx: StockCallerContext;
  operation: StockClientOperation;
  clientRequestId?: string | null;
  body: unknown;
  blind: Set<string>;
  execute: (tx: PrismaTransactionClient) => Promise<StockWriteRun<R>>;
  replay: (ref: { resultType: string; resultId: string }) => Promise<R>;
}): Promise<{ replayed: boolean; result: R }> {
  const clientRequestId = input.clientRequestId ?? null;
  const bodyHash = clientRequestId ? hashRequestBody(input.body) : null;
  const findReplay = () =>
    findClientRequestReplay(
      input.tenantId,
      clientRequestId as string,
      input.ctx.userId,
      bodyHash as string,
      input.operation
    );

  if (clientRequestId) {
    const found = await findReplay();
    if (found) {
      return { replayed: true, result: await input.replay(found) };
    }
  }

  try {
    const result = await prisma.$transaction(async tx => {
      const keyId = clientRequestId
        ? await claimClientRequestTx(tx, {
            tenantId: input.tenantId,
            clientRequestId,
            operation: input.operation,
            bodyHash: bodyHash as string,
            userId: input.ctx.userId
          })
        : null;
      const run = await input.execute(tx);
      if (keyId) {
        await completeClientRequestTx(tx, keyId, run.resultType, run.resultId, input.tenantId);
      }
      return run.result;
    }, WRITE_TRANSACTION_OPTIONS);
    return { replayed: false, result };
  } catch (error) {
    if (clientRequestId && isUniqueViolation(error)) {
      const found = await findReplay();
      if (found) {
        return { replayed: true, result: await input.replay(found) };
      }
    }
    traceBlindRefusal(error, input.tenantId, input.ctx, input.operation, input.blind);
    throw error;
  }
}

/** `STOCK_BLIND_INSUFFICIENT_REFUSED` : un refus sur un lieu en comptage, pour un appelant à l'aveugle (§3.3). */
function traceBlindRefusal(
  error: unknown,
  tenantId: string,
  ctx: StockCallerContext,
  operation: StockClientOperation,
  blind: Set<string>
): void {
  if (!(error instanceof AppError) || error.code !== ErrorCode.STOCK_INSUFFICIENT) {
    return;
  }
  const data = (error.data ?? {}) as {
    locationId?: string;
    items?: Array<{ itemId: string; requestedQuantity: number }>;
  };
  if (!data.locationId || !blind.has(data.locationId)) {
    return;
  }
  logAuditEvent({
    tenantId,
    actorUserId: ctx.userId,
    actionKey: AuditActionKey.STOCK_BLIND_INSUFFICIENT_REFUSED,
    entityType: 'StockLocation',
    entityId: data.locationId,
    payload: {
      operation,
      items: (data.items ?? []).map(item => ({ itemId: item.itemId, requestedQuantity: item.requestedQuantity }))
    }
  });
}

/** Réponse d'une écriture publique : statut (201 neuf, 200 rejeu), données masquées, `meta`. */
export interface StockWriteResponse<T> {
  status: 200 | 201;
  data: T;
  meta: StockMeta;
}

/** Contexte de masquage de l'appelant, lu une fois par requête. */
export async function loadCallerBlind(tenantId: string, ctx: StockCallerContext): Promise<Set<string>> {
  return loadBlindLocationIds(prisma, tenantId, ctx);
}

/** Refuse un prix déclaré à un appelant sans STOCK_VALUES_VIEW (A8-R3, B1-R5). */
export function assertValueFieldsAllowed(ctx: StockCallerContext, hasValueField: boolean): void {
  if (hasValueField && !ctx.valuesVisible) {
    throw stockError(
      403,
      ErrorCode.STOCK_VALUE_FIELD_FORBIDDEN,
      'Vous ne pouvez pas saisir de prix : il est déterminé à partir de la facture ou du stock.'
    );
  }
}

/** Relit les mouvements d'un bon (rejeu). */
async function loadSlipResult(tenantId: string, slipId: string): Promise<SlipResult> {
  const slip = await prisma.stockSlip.findFirst({
    where: { id: slipId, tenantId },
    select: { id: true, kind: true, year: true, number: true, documentDate: true, createdAt: true }
  });
  if (!slip) {
    throw new NotFoundError('Bon introuvable.');
  }
  const rows = await prisma.stockMovement.findMany({
    where: { tenantId, slipId },
    include: MOVEMENT_VIEW_INCLUDE,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
  });
  return { slip: toSlipSummary(slip), movements: rows.map(toMovementViewFromRow) };
}

/** Relit un mouvement (rejeu d'un rebut ou d'un retour). */
export async function loadMovementView(tenantId: string, movementId: string): Promise<MovementView> {
  const row = await prisma.stockMovement.findFirst({
    where: { id: movementId, tenantId },
    include: MOVEMENT_VIEW_INCLUDE
  });
  if (!row) {
    throw new NotFoundError('Mouvement de stock introuvable.');
  }
  return toMovementViewFromRow(row);
}

function maskSlipResult(result: SlipResult, ctx: StockCallerContext, blind: Set<string>): SlipResult {
  return { slip: result.slip, movements: result.movements.map(movement => maskMovementView(movement, ctx, blind)) };
}

// ===========================================================================
// III. La réception — un bon BR, un mouvement par ligne, aucune écriture
// ===========================================================================

export interface StockReceiptLineInput {
  itemId: string;
  quantity: number;
  /** Prix déclaré (`DECLARED`) ; réservé à STOCK_VALUES_VIEW par l'appelant public. */
  unitCost?: number | null;
  /** Ligne de la MÊME facture d'où prendre le prix (`INVOICE_LINE`). */
  supplierInvoiceLineId?: string | null;
}

export interface RecordStockReceiptParams {
  locationId: string;
  supplierInvoiceId: string;
  receiptDate: Date;
  lines: StockReceiptLineInput[];
  createdByUserId: string;
}

/** Un contrôle de réception tel qu'il est né (A8-R2), avant sa mise en mots pour l'appelant. */
export interface RawReceiptControl {
  code: ReceiptControl['code'];
  severity: StockAlertSeverity;
  amount: number | null;
  threshold: number | null;
  alertId: string;
  itemIds: string[];
  details: Record<string, unknown>;
}

export interface StockReceiptTxResult {
  slip: SlipSummary;
  movements: MovementView[];
  controls: RawReceiptControl[];
}

interface PricedReceiptLine {
  line: StockReceiptLineInput;
  item: ItemRow;
  quantity: number;
  unitCost: number;
  totalValue: number;
  valuationSource: StockValuationSource;
  supplierInvoiceLineId: string | null;
  previous: BalanceState;
  quantityAfter: number;
  valueAfter: number;
}

function assertReceiptLines(lines: StockReceiptLineInput[]): void {
  if (lines.length === 0) {
    throw new BadRequestError('Une réception comporte au moins une ligne.');
  }
  if (lines.length > MAX_STOCK_LINES) {
    throw new BadRequestError('Une réception comporte au plus 50 lignes.');
  }
  for (const line of lines) {
    requirePositiveQuantity(line.quantity, 'La quantité reçue doit être strictement positive.');
    if (line.unitCost !== undefined && line.unitCost !== null) {
      if (!Number.isFinite(Number(line.unitCost)) || Number(line.unitCost) < 0) {
        throw new BadRequestError('Le prix unitaire de réception ne peut pas être négatif.');
      }
    }
  }
}

/** Dernier prix de réception connu de l'article dans l'agence (A8-R3, étape 4). */
async function lastReceiptUnitCostTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  itemId: string
): Promise<number | null> {
  const last = await tx.stockMovement.findFirst({
    where: { tenantId, itemId, type: 'RECEIPT', unitCost: { gt: 0 } },
    orderBy: [{ movementDate: 'desc' }, { createdAt: 'desc' }],
    select: { unitCost: true }
  });
  return last ? roundQuantity(toAmountOrZero(last.unitCost)) : null;
}

/**
 * Prix d'une ligne reçue, pour TOUT appelant (A8-R3) : prix déclaré, ligne de
 * facture, coût moyen du lieu, dernier prix de l'agence, zéro. Les lignes sont
 * traitées EN SÉQUENCE : deux lignes du même article se cumulent dans l'ordre.
 *
 * Le coût moyen n'est retenu que si le lieu a du stock ET une valeur > 0 : un
 * lieu dont la quantité est positive mais la valeur nulle (inventaire
 * d'ouverture à valeur nulle, par exemple) donnerait un coût moyen de zéro et
 * une réception valorisée à 0 sans alerte. On passe alors au dernier prix de
 * réception, puis à `NONE` (alerte `RECEIPT_UNVALUED`).
 */
async function priceReceiptLinesTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  locationId: string,
  lines: StockReceiptLineInput[],
  items: Map<string, ItemRow>,
  invoiceLines: Map<string, { id: string; unitPrice: number | null }>
): Promise<PricedReceiptLine[]> {
  const states = new Map<string, BalanceState>();
  const priced: PricedReceiptLine[] = [];
  for (const line of lines) {
    const previous = states.get(line.itemId) ?? (await readBalanceTx(tx, tenantId, line.itemId, locationId));
    const quantity = roundQuantity(line.quantity);
    const invoiceLine = line.supplierInvoiceLineId ? invoiceLines.get(line.supplierInvoiceLineId) : undefined;
    let unitCost: number;
    let valuationSource: StockValuationSource;
    if (line.unitCost !== undefined && line.unitCost !== null) {
      [unitCost, valuationSource] = [roundQuantity(Number(line.unitCost)), 'DECLARED'];
    } else if (invoiceLine && invoiceLine.unitPrice !== null) {
      [unitCost, valuationSource] = [roundQuantity(invoiceLine.unitPrice), 'INVOICE_LINE'];
    } else if (previous.quantity > 0 && previous.value > 0) {
      [unitCost, valuationSource] = [
        roundQuantity(averageUnitCostOf(previous.quantity, previous.value)),
        'AVERAGE_COST'
      ];
    } else {
      const last = await lastReceiptUnitCostTx(tx, tenantId, line.itemId);
      [unitCost, valuationSource] = last !== null ? [last, 'LAST_RECEIPT'] : [0, 'NONE'];
    }
    const totalValue = roundMoneyXof(quantity * unitCost);
    const quantityAfter = roundQuantity(previous.quantity + quantity);
    const valueAfter = roundMoneyXof(previous.value + totalValue);
    priced.push({
      line,
      item: items.get(line.itemId) as ItemRow,
      quantity,
      unitCost,
      totalValue,
      valuationSource,
      supplierInvoiceLineId: line.supplierInvoiceLineId ?? null,
      previous,
      quantityAfter,
      valueAfter
    });
    states.set(line.itemId, { id: previous.id, quantity: quantityAfter, value: valueAfter });
  }
  return priced;
}

/** Ce que la facture a déjà reçu et retourné, lu AVANT les écritures (A8-R2). */
interface InvoiceHistory {
  receiptCount: number;
  lastSlipNumber: string | null;
  lastReceiptDate: Date | null;
  receivedValue: number;
  returnedValue: number;
}

async function readInvoiceHistoryTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  invoiceId: string
): Promise<InvoiceHistory> {
  const receipts = await tx.stockMovement.findMany({
    where: { tenantId, supplierInvoiceId: invoiceId, type: 'RECEIPT' },
    select: {
      totalValue: true,
      movementDate: true,
      createdAt: true,
      slip: { select: { kind: true, year: true, number: true } }
    },
    orderBy: [{ createdAt: 'desc' }]
  });
  const returns = await tx.stockMovement.findMany({
    where: { tenantId, supplierInvoiceId: invoiceId, type: 'SUPPLIER_RETURN' },
    select: { totalValue: true, supplierCreditValue: true }
  });
  const last = receipts[0] as any;
  return {
    receiptCount: receipts.length,
    lastSlipNumber: last?.slip ? formatSlipNumber(last.slip.kind, last.slip.year, last.slip.number) : null,
    lastReceiptDate: last?.movementDate ?? null,
    receivedValue: roundMoneyXof(receipts.reduce((sum, row) => sum + toAmountOrZero(row.totalValue), 0)),
    returnedValue: roundMoneyXof(
      returns.reduce((sum, row) => sum + toAmountOrZero(row.supplierCreditValue ?? row.totalValue), 0)
    )
  };
}

/** Écrit les mouvements et les soldes d'une réception, une fois le bon tiré. */
async function writeReceiptMovementsTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  context: {
    location: ActiveLocation;
    invoice: InvoiceRow;
    receiptDate: Date;
    createdByUserId: string;
    slip: SlipSummary;
    authorLabel: string;
  },
  priced: PricedReceiptLine[]
): Promise<MovementView[]> {
  const states = new Map<string, BalanceState>();
  const views: MovementView[] = [];
  for (const entry of priced) {
    const created = await tx.stockMovement.create({
      data: {
        tenantId,
        type: 'RECEIPT',
        itemId: entry.item.id,
        locationId: context.location.id,
        movementDate: context.receiptDate,
        quantity: entry.quantity,
        isDecrease: false,
        unitCost: entry.unitCost,
        totalValue: entry.totalValue,
        currency: DEFAULT_CURRENCY,
        quantityAfter: entry.quantityAfter,
        valueAfter: entry.valueAfter,
        supplierInvoiceId: context.invoice.id,
        supplierInvoiceLineId: entry.supplierInvoiceLineId,
        valuationSource: entry.valuationSource,
        slipId: context.slip.id,
        createdByUserId: context.createdByUserId
      }
    });
    const previous = states.get(entry.item.id) ?? entry.previous;
    const written = await writeBalanceTx(
      tx,
      tenantId,
      entry.item.id,
      context.location.id,
      previous,
      entry.quantityAfter,
      entry.valueAfter
    );
    states.set(entry.item.id, written);
    views.push(
      buildMovementView(created, {
        item: entry.item,
        locationLabel: context.location.label,
        supplierInvoiceReference: context.invoice.reference,
        slipNumber: context.slip.number,
        createdByLabel: context.authorLabel
      })
    );
  }
  return views;
}

/** Relit l'identifiant d'une alerte par sa clé (`createMany` ne le rend pas, B7-R2). */
async function alertIdByKeyTx(tx: PrismaTransactionClient, tenantId: string, dedupeKey: string): Promise<string> {
  const alert = await tx.stockAlert.findFirst({ where: { tenantId, dedupeKey }, select: { id: true } });
  return alert?.id ?? '';
}

/** Les trois contrôles d'une réception (A8-R2), ouverts en alertes dans la transaction. */
async function raiseReceiptControlsTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  input: {
    slip: SlipSummary;
    location: ActiveLocation;
    siteId: string | null;
    invoice: InvoiceRow;
    history: InvoiceHistory;
    priced: PricedReceiptLine[];
  }
): Promise<RawReceiptControl[]> {
  const base = {
    tenantId,
    siteId: input.siteId,
    locationId: input.location.id,
    subjectType: 'StockSlip' as const,
    subjectId: input.slip.id
  };
  const controls: RawReceiptControl[] = [];
  const raise = async (control: Omit<RawReceiptControl, 'alertId'>, dedupeKey: string): Promise<void> => {
    await raiseStockAlertTx(tx, {
      ...base,
      kind: control.code,
      severity: control.severity,
      dedupeKey,
      amount: control.amount,
      threshold: control.threshold,
      details: { ...control.details, itemIds: control.itemIds }
    });
    controls.push({ ...control, alertId: await alertIdByKeyTx(tx, tenantId, dedupeKey) });
  };
  const commonDetails = { slipNumber: input.slip.number, invoiceReference: input.invoice.reference };

  if (input.history.receiptCount > 0) {
    await raise(
      {
        code: 'RECEIPT_REPEATED',
        severity: 'INFO',
        amount: null,
        threshold: null,
        itemIds: [],
        details: {
          ...commonDetails,
          previousReceiptsCount: input.history.receiptCount,
          previousSlipNumber: input.history.lastSlipNumber,
          previousReceiptDate: input.history.lastReceiptDate ? input.history.lastReceiptDate.toISOString() : null
        }
      },
      alertKeys.receiptRepeated(input.slip.id)
    );
  }

  const receivedNow = input.priced.reduce((sum, entry) => sum + entry.totalValue, 0);
  const cumulative = roundMoneyXof(input.history.receivedValue + receivedNow - input.history.returnedValue);
  if (cumulative > input.invoice.amount) {
    await raise(
      {
        code: 'RECEIPT_OVER_INVOICE',
        severity: 'WARNING',
        amount: cumulative,
        threshold: input.invoice.amount,
        itemIds: [],
        details: commonDetails
      },
      alertKeys.receiptOverInvoice(input.slip.id)
    );
  }

  const unvalued = [
    ...new Set(input.priced.filter(entry => entry.valuationSource === 'NONE').map(entry => entry.item.id))
  ];
  if (unvalued.length > 0) {
    await raise(
      {
        code: 'RECEIPT_UNVALUED',
        severity: 'INFO',
        amount: null,
        threshold: null,
        itemIds: unvalued,
        details: commonDetails
      },
      alertKeys.receiptUnvalued(input.slip.id)
    );
  }
  return controls;
}

/**
 * Enregistre une réception : bon `BR`, un mouvement par ligne, AUCUNE écriture
 * comptable ni imputation (la facture a déjà porté la valeur au 311). Lieu
 * actif, refusé sur le lieu d'un chantier clos (A7-R4) ; facture VALIDÉE ;
 * prix A8-R3 ; contrôles A8-R2 ouverts en alertes ; audit critique.
 */
export async function recordStockReceiptTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  params: RecordStockReceiptParams,
  options: StockWriteOptions = {}
): Promise<StockReceiptTxResult> {
  const lines = params.lines ?? [];
  assertReceiptLines(lines);

  const location = await requireActiveLocationTx(tx, tenantId, params.locationId);
  const site = await lockSiteForEntryTx(tx, tenantId, location);
  // A10-R2 : `stock-site`, puis `stock-invoice` (les contrôles A8-R2 cumulent
  // sur tous les lieux de la facture), puis les soldes.
  await lockStockInvoiceTx(tx, tenantId, params.supplierInvoiceId);
  await lockStockBalancesTx(
    tx,
    tenantId,
    lines.map(line => ({ itemId: line.itemId, locationId: location.id }))
  );

  const settings = await readControlsTx(tx, tenantId);
  assertMovementDateAllowed(params.receiptDate, settings.backdatingLimitDays, options.now);
  const invoice = await requireValidatedInvoiceTx(tx, tenantId, params.supplierInvoiceId);
  const items = await requireItemsTx(
    tx,
    tenantId,
    lines.map(line => line.itemId),
    true
  );
  const invoiceLines = await requireInvoiceLinesTx(
    tx,
    invoice.id,
    lines.map(line => line.supplierInvoiceLineId).filter((id): id is string => Boolean(id))
  );
  const history = await readInvoiceHistoryTx(tx, tenantId, invoice.id);
  const priced = await priceReceiptLinesTx(tx, tenantId, location.id, lines, items, invoiceLines);
  const authorLabel = await readUserLabelTx(tx, params.createdByUserId);

  const slip = await issueSlipTx(tx, {
    tenantId,
    kind: 'RECEIPT',
    documentDate: params.receiptDate,
    locationId: location.id,
    siteId: location.siteId,
    supplierInvoiceId: invoice.id,
    createdByUserId: params.createdByUserId,
    snapshot: slipSnapshot({
      location,
      siteName: site?.name ?? null,
      invoice: { reference: invoice.reference, supplierName: invoice.supplierName },
      author: authorLabel,
      items: priced.map(entry => entry.item)
    })
  });

  const movements = await writeReceiptMovementsTx(
    tx,
    tenantId,
    { location, invoice, receiptDate: params.receiptDate, createdByUserId: params.createdByUserId, slip, authorLabel },
    priced
  );
  const controls = await raiseReceiptControlsTx(tx, tenantId, {
    slip,
    location,
    siteId: location.siteId,
    invoice,
    history,
    priced
  });

  await recordAuditEvent(tx, {
    tenantId,
    actorUserId: params.createdByUserId,
    actionKey: AuditActionKey.STOCK_RECEIPT_RECORDED,
    entityType: 'StockSlip',
    entityId: slip.id,
    payload: {
      slipNumber: slip.number,
      locationId: location.id,
      supplierInvoiceId: invoice.id,
      receiptDate: params.receiptDate.toISOString(),
      lines: priced.map(entry => ({
        itemId: entry.item.id,
        quantity: entry.quantity,
        unitCost: entry.unitCost,
        totalValue: entry.totalValue,
        valuationSource: entry.valuationSource
      })),
      controls: controls.map(control => control.code)
    }
  });

  return { slip, movements, controls };
}

/** L'instantané imprimé d'un bon (B4-R3) : libellés seulement, aucun montant. */
function slipSnapshot(input: {
  location: ActiveLocation;
  siteName: string | null;
  taker?: string | null;
  requestedBy?: string | null;
  invoice?: { reference: string; supplierName: string } | null;
  author: string;
  items: ItemRow[];
}): StockSlipSnapshot {
  return {
    location: input.location.label,
    site: input.siteName,
    taker: input.taker ?? null,
    requestedBy: input.requestedBy ?? null,
    invoice: input.invoice ?? null,
    author: input.author,
    lines: input.items.map(item => ({ itemId: item.id, reference: item.reference, label: item.label, unit: item.unit }))
  };
}

// ---------------------------------------------------------------------------
// Contrôles de réception, mis en mots pour l'appelant
// ---------------------------------------------------------------------------

const AMOUNT_FORMAT = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

function formatAmount(value: number): string {
  return AMOUNT_FORMAT.format(value);
}

function formatDayUtc(iso: unknown): string {
  const date = new Date(String(iso));
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getUTCFullYear()}`;
}

/** Le message d'un contrôle, traduit ; SANS montant pour un appelant sans STOCK_VALUES_VIEW (A8-R2). */
function receiptControlMessage(control: RawReceiptControl, valuesVisible: boolean): string {
  if (control.code === 'RECEIPT_REPEATED') {
    const previousSlip = control.details.previousSlipNumber;
    const date = formatDayUtc(control.details.previousReceiptDate);
    return previousSlip
      ? t('Cette facture a déjà été réceptionnée ({{slipNumber}} du {{date}}).', {
          slipNumber: String(previousSlip),
          date
        })
      : t('Cette facture a déjà été réceptionnée (le {{date}}).', { date });
  }
  if (control.code === 'RECEIPT_OVER_INVOICE') {
    return valuesVisible && control.amount !== null && control.threshold !== null
      ? t('La valeur reçue sur cette facture ({{amount}} FCFA) dépasse son montant ({{threshold}} FCFA).', {
          amount: formatAmount(control.amount),
          threshold: formatAmount(control.threshold)
        })
      : t('La valeur reçue sur cette facture dépasse son montant.');
  }
  return t('Une ou plusieurs lignes sont entrées sans prix connu.');
}

/** Contrat `ReceiptControl`, masqué pour l'appelant. */
export function describeReceiptControls(controls: RawReceiptControl[], ctx: StockCallerContext): ReceiptControl[] {
  return controls.map(control => ({
    code: control.code,
    severity: control.severity,
    message: receiptControlMessage(control, ctx.valuesVisible),
    itemIds: [...control.itemIds],
    amount: ctx.valuesVisible ? control.amount : null,
    threshold: ctx.valuesVisible ? control.threshold : null,
    alertId: control.alertId
  }));
}

const RECEIPT_CONTROL_ORDER: ReceiptControl['code'][] = [
  'RECEIPT_REPEATED',
  'RECEIPT_OVER_INVOICE',
  'RECEIPT_UNVALUED'
];

/** Relit le résultat d'une réception (rejeu) : bon, mouvements, contrôles depuis leurs alertes. */
export async function loadReceiptResult(tenantId: string, slipId: string): Promise<StockReceiptTxResult> {
  const base = await loadSlipResult(tenantId, slipId);
  const keys = [
    alertKeys.receiptRepeated(slipId),
    alertKeys.receiptOverInvoice(slipId),
    alertKeys.receiptUnvalued(slipId)
  ];
  const alerts = await prisma.stockAlert.findMany({
    where: { tenantId, dedupeKey: { in: keys } },
    select: { id: true, kind: true, severity: true, amount: true, threshold: true, details: true }
  });
  const controls: RawReceiptControl[] = alerts
    .map(alert => {
      const details = (alert.details ?? {}) as Record<string, unknown>;
      return {
        code: alert.kind as ReceiptControl['code'],
        severity: alert.severity,
        amount: alert.amount === null ? null : roundMoneyXof(toAmountOrZero(alert.amount)),
        threshold: alert.threshold === null ? null : roundMoneyXof(toAmountOrZero(alert.threshold)),
        alertId: alert.id,
        itemIds: Array.isArray(details.itemIds) ? (details.itemIds as string[]) : [],
        details
      };
    })
    .sort((a, b) => RECEIPT_CONTROL_ORDER.indexOf(a.code) - RECEIPT_CONTROL_ORDER.indexOf(b.code));
  return { ...base, controls };
}

/** `POST /stock/receipts` : réception idempotente, masquée pour l'appelant. */
export async function recordStockReceipt(
  tenantId: string,
  ctx: StockCallerContext,
  input: Omit<RecordStockReceiptParams, 'createdByUserId'> & { clientRequestId?: string | null },
  body: unknown = input
): Promise<StockWriteResponse<{ slip: SlipSummary; movements: MovementView[]; controls: ReceiptControl[] }>> {
  assertValueFieldsAllowed(
    ctx,
    input.lines.some(line => line.unitCost !== undefined && line.unitCost !== null)
  );
  const blind = await loadCallerBlind(tenantId, ctx);
  const { replayed, result } = await runStockWrite({
    tenantId,
    ctx,
    operation: 'RECEIPT',
    clientRequestId: input.clientRequestId,
    body,
    blind,
    execute: async tx => {
      const out = await recordStockReceiptTx(
        tx,
        tenantId,
        { ...input, createdByUserId: ctx.userId },
        { blindLocationIds: blind }
      );
      return { result: out, resultType: 'StockSlip', resultId: out.slip.id };
    },
    replay: ref => loadReceiptResult(tenantId, ref.resultId)
  });
  return {
    status: replayed ? 200 : 201,
    data: { ...maskSlipResult(result, ctx, blind), controls: describeReceiptControls(result.controls, ctx) },
    meta: buildStockMeta(ctx, blind)
  };
}

// ===========================================================================
// IV. La sortie — un bon BS, 1 à 50 lignes, LE geste qui impute
// ===========================================================================

export interface StockIssueLineInput {
  itemId: string;
  quantity: number;
  /** Exigé, jamais deviné depuis l'article. */
  costCategoryId: string;
}

export interface RecordStockIssueParams {
  locationId: string;
  siteId: string;
  issueDate: Date;
  lines: StockIssueLineInput[];
  takerId?: string | null;
  requestedBy?: string | null;
  createdByUserId: string;
}

/** Forme à un article (lot 5), acceptée et convertie en une ligne (B3-R3). */
export interface RecordStockIssueSingleParams extends Omit<RecordStockIssueParams, 'lines'> {
  itemId: string;
  quantity: number;
  costCategoryId: string;
}

/** Convertit la forme à un article en forme à lignes. */
export function normalizeIssueParams(
  params: RecordStockIssueParams | RecordStockIssueSingleParams
): RecordStockIssueParams {
  if ('lines' in params && Array.isArray(params.lines)) {
    return params;
  }
  const single = params as RecordStockIssueSingleParams;
  const { itemId, quantity, costCategoryId, ...rest } = single;
  return { ...rest, lines: [{ itemId, quantity, costCategoryId }] };
}

interface ComputedIssueLine {
  item: ItemRow;
  costCategory: { id: string; label: string };
  quantity: number;
  unitCost: number;
  totalValue: number;
  quantityAfter: number;
  valueAfter: number;
  previous: BalanceState;
}

/** Le chantier de la sortie : de l'agence, ouvert (une sortie EST une dépense, elle impute). */
async function requireOpenSiteTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  siteId: string
): Promise<{ id: string; name: string }> {
  const site = await tx.constructionSite.findFirst({
    where: { id: siteId, tenantId },
    select: { id: true, name: true, closedAt: true }
  });
  if (!site) {
    throw new NotFoundError('Chantier introuvable.');
  }
  if (site.closedAt) {
    throw stockError(
      409,
      ErrorCode.STOCK_SITE_CLOSED,
      "Ce chantier est clôturé : son coût est figé et n'accepte plus de nouvelle dépense. Rouvrez-le d'abord."
    );
  }
  return { id: site.id, name: site.name };
}

/** Les postes, de l'agence et actifs. */
async function requireActiveCostCategoriesTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  ids: string[]
): Promise<Map<string, { id: string; label: string }>> {
  const unique = [...new Set(ids)];
  const rows = await tx.costCategory.findMany({
    where: { tenantId, id: { in: unique } },
    select: { id: true, label: true, isActive: true }
  });
  const byId = new Map(rows.map(row => [row.id, row]));
  for (const id of unique) {
    const row = byId.get(id);
    if (!row) {
      throw new NotFoundError('Poste de dépense introuvable.');
    }
    if (!row.isActive) {
      throw new ConflictError('Ce poste de dépense est désactivé.');
    }
  }
  return new Map(rows.map(row => [row.id, { id: row.id, label: row.label }]));
}

/** Valorise les lignes d'une sortie EN SÉQUENCE, au coût moyen d'avant chacune, sans jamais descendre sous zéro. */
async function computeIssueLinesTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  locationId: string,
  lines: StockIssueLineInput[],
  items: Map<string, ItemRow>,
  categories: Map<string, { id: string; label: string }>,
  blindLocationIds?: Set<string>
): Promise<ComputedIssueLine[]> {
  const states = new Map<string, BalanceState>();
  const computed: ComputedIssueLine[] = [];
  for (const line of lines) {
    const item = items.get(line.itemId) as ItemRow;
    const previous = states.get(line.itemId) ?? (await readBalanceTx(tx, tenantId, line.itemId, locationId));
    const quantity = roundQuantity(line.quantity);
    if (quantity > previous.quantity) {
      throw insufficientStockError({
        locationId,
        itemId: item.id,
        itemLabel: item.label,
        requested: quantity,
        available: previous.quantity,
        blindLocationIds
      });
    }
    const valuation = decreaseValuation(previous, quantity);
    computed.push({
      item,
      costCategory: categories.get(line.costCategoryId) as { id: string; label: string },
      quantity,
      previous,
      ...valuation
    });
    states.set(line.itemId, { id: previous.id, quantity: valuation.quantityAfter, value: valuation.valueAfter });
  }
  return computed;
}

/** Écrit une ligne de sortie : mouvement, écriture (si valeur non nulle), imputation, solde. */
async function writeIssueLineTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  context: {
    params: RecordStockIssueParams;
    site: { id: string; name: string };
    requester: ResolvedRequester;
    slip: SlipSummary;
    accounts: OperationalAccounts;
    expenseAccounts: Map<string, string>;
  },
  line: ComputedIssueLine,
  previous: BalanceState
): Promise<{ row: any; balance: BalanceState }> {
  const { params, site, requester, slip, accounts } = context;
  const movement = await tx.stockMovement.create({
    data: {
      tenantId,
      type: 'ISSUE',
      itemId: line.item.id,
      locationId: params.locationId,
      movementDate: params.issueDate,
      quantity: line.quantity,
      isDecrease: true,
      unitCost: line.unitCost,
      totalValue: line.totalValue,
      currency: DEFAULT_CURRENCY,
      quantityAfter: line.quantityAfter,
      valueAfter: line.valueAfter,
      siteId: site.id,
      costCategoryId: line.costCategory.id,
      requestedBy: requester.requestedBy,
      takerId: requester.takerId,
      slipId: slip.id,
      createdByUserId: params.createdByUserId
    }
  });
  let row: any = movement;
  // A6-R4 : aucun mouvement de valeur nulle ne produit d'écriture.
  if (line.totalValue > 0) {
    const chargeAccount = context.expenseAccounts.get(line.costCategory.id) ?? accounts.siteExpenseAccountId;
    const entry = await postDocumentEntryTx(tx, {
      tenantId,
      journalId: accounts.journalId,
      entryDate: params.issueDate,
      reference: `SORT-${movement.id}`,
      description: `Sortie de stock — ${line.item.label} — ${site.name}`,
      documentType: 'STOCK_ISSUE',
      documentId: movement.id,
      lines: [
        { accountId: chargeAccount, debit: line.totalValue, label: `Sortie de stock — ${line.item.label}` },
        { accountId: accounts.stockAccountId, credit: line.totalValue, label: `Stock — ${line.item.label}` }
      ]
    });
    row = await tx.stockMovement.update({
      where: { id: movement.id, tenantId },
      data: { journalEntryId: entry.entryId }
    });
  }
  // L'IMPUTATION : c'est elle qui fait entrer le matériau dans le coût réel du chantier.
  await tx.costAllocation.create({
    data: {
      tenantId,
      siteId: site.id,
      costCategoryId: line.costCategory.id,
      sourceType: 'STOCK_ISSUE',
      sourceId: movement.id,
      amount: line.totalValue,
      validatedAt: new Date(),
      voidedAt: null
    }
  });
  const balance = await writeBalanceTx(
    tx,
    tenantId,
    line.item.id,
    params.locationId,
    previous,
    line.quantityAfter,
    line.valueAfter
  );
  return { row: { ...movement, ...row }, balance };
}

/**
 * Enregistre une sortie vers un chantier : bon `BS`, un mouvement par ligne,
 * chacun avec son écriture (poste ou 605 / 311) et son imputation
 * `STOCK_ISSUE`. Preneur ou demandeur obligatoire (B2-R3) ; chantier ouvert ;
 * alerte `LARGE_ISSUE` si la valeur du bon atteint le seuil ; audit critique.
 */
export async function recordStockIssueTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  rawParams: RecordStockIssueParams | RecordStockIssueSingleParams,
  options: StockWriteOptions = {}
): Promise<SlipResult> {
  const params = normalizeIssueParams(rawParams);
  assertIssueLines(params.lines);

  await lockStockBalancesTx(
    tx,
    tenantId,
    params.lines.map(line => ({ itemId: line.itemId, locationId: params.locationId }))
  );

  const location = await requireActiveLocationTx(tx, tenantId, params.locationId);
  const site = await requireOpenSiteTx(tx, tenantId, params.siteId);
  const settings = await readControlsTx(tx, tenantId);
  assertMovementDateAllowed(params.issueDate, settings.backdatingLimitDays, options.now);
  const requester = await resolveRequesterTx(tx, tenantId, params, settings.requireTaker);
  const items = await requireItemsTx(
    tx,
    tenantId,
    params.lines.map(line => line.itemId),
    false
  );
  const categories = await requireActiveCostCategoriesTx(
    tx,
    tenantId,
    params.lines.map(line => line.costCategoryId)
  );
  const computed = await computeIssueLinesTx(
    tx,
    tenantId,
    location.id,
    params.lines,
    items,
    categories,
    options.blindLocationIds
  );

  const accounts = await resolveOperationalAccounts(tx, tenantId, params.issueDate);
  const expenseAccounts = await resolveExpenseAccountsByCostCategoryTx(
    tx,
    tenantId,
    [...categories.keys()],
    accounts.siteExpenseAccountId
  );
  const authorLabel = await readUserLabelTx(tx, params.createdByUserId);
  const slip = await issueSlipTx(tx, {
    tenantId,
    kind: 'ISSUE',
    documentDate: params.issueDate,
    locationId: location.id,
    siteId: site.id,
    takerId: requester.takerId,
    requestedBy: requester.requestedBy,
    createdByUserId: params.createdByUserId,
    snapshot: slipSnapshot({
      location,
      siteName: site.name,
      taker: requester.takerLabel,
      requestedBy: requester.requestedBy,
      author: authorLabel,
      items: computed.map(line => line.item)
    })
  });

  const states = new Map<string, BalanceState>();
  const movements: MovementView[] = [];
  for (const line of computed) {
    const previous = states.get(line.item.id) ?? line.previous;
    const written = await writeIssueLineTx(
      tx,
      tenantId,
      { params, site, requester, slip, accounts, expenseAccounts },
      line,
      previous
    );
    states.set(line.item.id, written.balance);
    movements.push(
      buildMovementView(written.row, {
        item: line.item,
        locationLabel: location.label,
        siteLabel: site.name,
        costCategoryLabel: line.costCategory.label,
        takerLabel: requester.takerLabel,
        slipNumber: slip.number,
        createdByLabel: authorLabel
      })
    );
  }
  // Le coût réel du chantier vient de changer : le programme de travaux suit, DANS cette transaction.
  await syncWorkProgramCostTx(tx, tenantId, site.id);

  const total = roundMoneyXof(computed.reduce((sum, line) => sum + line.totalValue, 0));
  if (settings.issueAlertAmount !== null && total >= settings.issueAlertAmount) {
    await raiseStockAlertTx(tx, {
      tenantId,
      kind: 'LARGE_ISSUE',
      severity: 'WARNING',
      dedupeKey: alertKeys.largeIssue(slip.id),
      amount: total,
      threshold: settings.issueAlertAmount,
      siteId: site.id,
      locationId: location.id,
      subjectType: 'StockSlip',
      subjectId: slip.id,
      details: { slipNumber: slip.number, linesCount: computed.length }
    });
  }

  await recordAuditEvent(tx, {
    tenantId,
    actorUserId: params.createdByUserId,
    actionKey: AuditActionKey.STOCK_ISSUE_RECORDED,
    entityType: 'StockSlip',
    entityId: slip.id,
    payload: {
      slipNumber: slip.number,
      locationId: location.id,
      siteId: site.id,
      takerId: requester.takerId,
      requestedBy: requester.requestedBy,
      issueDate: params.issueDate.toISOString(),
      totalValue: total,
      lines: computed.map(line => ({
        itemId: line.item.id,
        quantity: line.quantity,
        costCategoryId: line.costCategory.id,
        totalValue: line.totalValue
      }))
    }
  });

  return { slip, movements };
}

function assertIssueLines(lines: StockIssueLineInput[]): void {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new BadRequestError('Une sortie comporte au moins une ligne.');
  }
  if (lines.length > MAX_STOCK_LINES) {
    throw new BadRequestError('Une sortie comporte au plus 50 lignes.');
  }
  for (const line of lines) {
    requirePositiveQuantity(line.quantity, 'La quantité sortie doit être strictement positive.');
  }
}

/** `POST /stock/issues` : sortie idempotente, masquée pour l'appelant. */
export async function recordStockIssue(
  tenantId: string,
  ctx: StockCallerContext,
  input: Omit<RecordStockIssueParams, 'createdByUserId'> & { clientRequestId?: string | null },
  body: unknown = input
): Promise<StockWriteResponse<SlipResult>> {
  const blind = await loadCallerBlind(tenantId, ctx);
  const { replayed, result } = await runStockWrite({
    tenantId,
    ctx,
    operation: 'ISSUE',
    clientRequestId: input.clientRequestId,
    body,
    blind,
    execute: async tx => {
      const out = await recordStockIssueTx(
        tx,
        tenantId,
        { ...input, createdByUserId: ctx.userId },
        { blindLocationIds: blind }
      );
      return { result: out, resultType: 'StockSlip', resultId: out.slip.id };
    },
    replay: ref => loadSlipResult(tenantId, ref.resultId)
  });
  return { status: replayed ? 200 : 201, data: maskSlipResult(result, ctx, blind), meta: buildStockMeta(ctx, blind) };
}

// ===========================================================================
// V. Le retour fournisseur (A6-R1, A6-R3, A6-R3 bis)
// ===========================================================================

export interface RecordStockSupplierReturnParams {
  locationId: string;
  supplierInvoiceId: string;
  supplierInvoiceLineId?: string | null;
  itemId: string;
  quantity: number;
  returnDate: Date;
  reasonCode?: StockReasonCode | null;
  reason?: string | null;
  createdByUserId: string;
}

/** Sources de prix qui autorisent le coût de réception de la facture comme prix fournisseur (A6-R3 bis). */
const SUPPLIER_PRICED_SOURCES = new Set<string | null>(['DECLARED', 'INVOICE_LINE', null]);

/**
 * Ce que la facture a reçu et ce qui en est déjà reparti pour cet article,
 * et le prix fournisseur du retour : ligne de facture, sinon coût de réception
 * de la facture si toutes ses réceptions ont un prix fourni par la facture,
 * sinon `409 STOCK_RETURN_UNVALUED`.
 */
async function supplierReturnBasisTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  input: { invoiceId: string; itemId: string; quantity: number; supplierInvoiceLineId: string | null }
): Promise<{ unitPrice: number }> {
  const receipts = await tx.stockMovement.findMany({
    where: { tenantId, supplierInvoiceId: input.invoiceId, itemId: input.itemId, type: 'RECEIPT' },
    select: { quantity: true, totalValue: true, valuationSource: true }
  });
  const returned = await tx.stockMovement.findMany({
    where: { tenantId, supplierInvoiceId: input.invoiceId, itemId: input.itemId, type: 'SUPPLIER_RETURN' },
    select: { quantity: true }
  });
  const receivedQuantity = roundQuantity(receipts.reduce((sum, row) => sum + toAmountOrZero(row.quantity), 0));
  const returnedQuantity = roundQuantity(returned.reduce((sum, row) => sum + toAmountOrZero(row.quantity), 0));
  if (receivedQuantity <= 0 || input.quantity > roundQuantity(receivedQuantity - returnedQuantity)) {
    throw stockError(
      409,
      ErrorCode.STOCK_RETURN_EXCEEDS_RECEIVED,
      'La quantité retournée dépasse ce qui a été reçu sur cette facture pour cet article, retours déjà faits compris.',
      {
        receivedQuantity,
        returnedQuantity,
        returnableQuantity: Math.max(0, roundQuantity(receivedQuantity - returnedQuantity))
      }
    );
  }
  if (input.supplierInvoiceLineId) {
    const line = (await requireInvoiceLinesTx(tx, input.invoiceId, [input.supplierInvoiceLineId])).get(
      input.supplierInvoiceLineId
    );
    if (line && line.unitPrice !== null) {
      return { unitPrice: line.unitPrice };
    }
  }
  if (receipts.every(row => SUPPLIER_PRICED_SOURCES.has((row.valuationSource as string | null) ?? null))) {
    const totalValue = receipts.reduce((sum, row) => sum + toAmountOrZero(row.totalValue), 0);
    return { unitPrice: receivedQuantity > 0 ? totalValue / receivedQuantity : 0 };
  }
  throw stockError(
    409,
    ErrorCode.STOCK_RETURN_UNVALUED,
    'Indiquez la ligne de la facture qui porte cet article pour valoriser le retour.',
    { field: 'supplierInvoiceLineId' }
  );
}

/**
 * Écriture d'un retour (data-model §4) : C311 au coût moyen (`totalValue`),
 * D401 au prix fournisseur (`supplierCreditValue`), l'écart en 603. Aucune
 * écriture si les deux sont nuls (A6-R4).
 */
function supplierReturnEntryLines(
  accounts: OperationalAccounts,
  itemLabel: string,
  stockValue: number,
  supplierValue: number
): Array<{ accountId: string; debit?: number; credit?: number; label: string }> {
  const lines: Array<{ accountId: string; debit?: number; credit?: number; label: string }> = [];
  if (supplierValue > 0) {
    lines.push({
      accountId: accounts.supplierAccountId,
      debit: supplierValue,
      label: `Retour fournisseur — ${itemLabel}`
    });
  }
  if (stockValue > 0) {
    lines.push({ accountId: accounts.stockAccountId, credit: stockValue, label: `Stock — ${itemLabel}` });
  }
  const difference = roundMoneyXof(supplierValue - stockValue);
  if (difference > 0) {
    lines.push({
      accountId: accounts.stockVariationAccountId,
      credit: difference,
      label: `Écart de prix du retour — ${itemLabel}`
    });
  } else if (difference < 0) {
    lines.push({
      accountId: accounts.stockVariationAccountId,
      debit: -difference,
      label: `Écart de prix du retour — ${itemLabel}`
    });
  }
  return lines;
}

/** Le fournisseur de la facture et son compte de tiers. */
async function requireSupplierAccountTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  supplierId: string
): Promise<{ id: string; thirdPartyAccountId: string }> {
  const supplier = await tx.supplier.findFirst({
    where: { id: supplierId, tenantId },
    select: { id: true, thirdPartyAccountId: true }
  });
  if (!supplier || !supplier.thirdPartyAccountId) {
    throw new NotFoundError('Fournisseur introuvable pour cette facture.');
  }
  return { id: supplier.id, thirdPartyAccountId: supplier.thirdPartyAccountId };
}

/**
 * Enregistre un retour fournisseur (`SUPPLIER_RETURN`, droit STOCK_DISPOSE) :
 * facture validée, article reçu sur cette facture, quantité ≤ solde du lieu et
 * ≤ reçu − déjà retourné ; écriture C311 / D401 / écart 603 ; mouvement
 * « réglé » sur le compte de tiers du fournisseur ; audit critique.
 */
export async function recordStockSupplierReturnTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  params: RecordStockSupplierReturnParams,
  options: StockWriteOptions = {}
): Promise<MovementView> {
  const quantity = requirePositiveQuantity(params.quantity, 'La quantité retournée doit être strictement positive.');
  const reason = requireReason('SUPPLIER_RETURN', params.reasonCode, params.reason);

  // A10-R2 : `stock-invoice` avant le solde — le plafond « reçu − déjà
  // retourné » cumule sur tous les lieux de la facture, que le verrou du seul
  // couple (article, lieu) ne sérialise pas.
  await lockStockInvoiceTx(tx, tenantId, params.supplierInvoiceId);
  await lockStockBalancesTx(tx, tenantId, [{ itemId: params.itemId, locationId: params.locationId }]);

  const location = await requireActiveLocationTx(tx, tenantId, params.locationId);
  const settings = await readControlsTx(tx, tenantId);
  assertMovementDateAllowed(params.returnDate, settings.backdatingLimitDays, options.now);
  const invoice = await requireValidatedInvoiceTx(tx, tenantId, params.supplierInvoiceId);
  const item = (await requireItemsTx(tx, tenantId, [params.itemId], false)).get(params.itemId) as ItemRow;
  const basis = await supplierReturnBasisTx(tx, tenantId, {
    invoiceId: invoice.id,
    itemId: item.id,
    quantity,
    supplierInvoiceLineId: params.supplierInvoiceLineId ?? null
  });
  const previous = await readBalanceTx(tx, tenantId, item.id, location.id);
  if (quantity > previous.quantity) {
    throw insufficientStockError({
      locationId: location.id,
      itemId: item.id,
      itemLabel: item.label,
      requested: quantity,
      available: previous.quantity,
      blindLocationIds: options.blindLocationIds
    });
  }
  const supplier = await requireSupplierAccountTx(tx, tenantId, invoice.supplierId);
  const valuation = decreaseValuation(previous, quantity);
  const supplierCreditValue = roundMoneyXof(quantity * basis.unitPrice);
  const authorLabel = await readUserLabelTx(tx, params.createdByUserId);

  const movement = await tx.stockMovement.create({
    data: {
      tenantId,
      type: 'SUPPLIER_RETURN',
      itemId: item.id,
      locationId: location.id,
      movementDate: params.returnDate,
      quantity,
      isDecrease: true,
      unitCost: valuation.unitCost,
      totalValue: valuation.totalValue,
      currency: DEFAULT_CURRENCY,
      quantityAfter: valuation.quantityAfter,
      valueAfter: valuation.valueAfter,
      supplierInvoiceId: invoice.id,
      supplierInvoiceLineId: params.supplierInvoiceLineId ?? null,
      supplierCreditValue,
      reasonCode: reason.reasonCode,
      reason: reason.reason,
      createdByUserId: params.createdByUserId
    }
  });
  await writeBalanceTx(tx, tenantId, item.id, location.id, previous, valuation.quantityAfter, valuation.valueAfter);

  let row: any = movement;
  const accounts = await resolveOperationalAccounts(tx, tenantId, params.returnDate);
  const entryLines = supplierReturnEntryLines(accounts, item.label, valuation.totalValue, supplierCreditValue);
  if (entryLines.length > 0) {
    const entry = await postDocumentEntryTx(tx, {
      tenantId,
      journalId: accounts.journalId,
      entryDate: params.returnDate,
      reference: `RETF-${movement.id}`,
      description: `Retour fournisseur — ${item.label} — facture ${invoice.reference}`,
      documentType: 'STOCK_SUPPLIER_RETURN',
      documentId: movement.id,
      lines: entryLines
    });
    row = await tx.stockMovement.update({
      where: { id: movement.id, tenantId },
      data: { journalEntryId: entry.entryId }
    });
  }
  if (supplierCreditValue > 0) {
    // « Réglé » diminue le solde du compte du fournisseur (data-model §4) ; ce
    // mouvement n'est affecté à aucune facture (limite assumée, spec §3.3).
    await appendThirdPartyMovementTx(tx, {
      accountId: supplier.thirdPartyAccountId,
      tenantId,
      type: 'ADJUSTMENT',
      settled: supplierCreditValue,
      label: `Retour de marchandise — facture ${invoice.reference}`,
      sourceType: 'STOCK_SUPPLIER_RETURN',
      sourceId: movement.id,
      movementDate: params.returnDate
    });
  }

  await recordAuditEvent(tx, {
    tenantId,
    actorUserId: params.createdByUserId,
    actionKey: AuditActionKey.STOCK_SUPPLIER_RETURN_RECORDED,
    entityType: 'StockMovement',
    entityId: movement.id,
    payload: {
      locationId: location.id,
      itemId: item.id,
      quantity,
      supplierInvoiceId: invoice.id,
      supplierInvoiceLineId: params.supplierInvoiceLineId ?? null,
      reasonCode: reason.reasonCode,
      reason: reason.reason,
      totalValue: valuation.totalValue,
      supplierCreditValue
    }
  });

  return buildMovementView(
    { ...movement, ...row },
    {
      item,
      locationLabel: location.label,
      supplierInvoiceReference: invoice.reference,
      createdByLabel: authorLabel
    }
  );
}

/** `POST /stock/supplier-returns` : retour idempotent, masqué pour l'appelant. */
export async function recordStockSupplierReturn(
  tenantId: string,
  ctx: StockCallerContext,
  input: Omit<RecordStockSupplierReturnParams, 'createdByUserId'> & { clientRequestId?: string | null },
  body: unknown = input
): Promise<StockWriteResponse<MovementView>> {
  return runSingleMovementWrite(tenantId, ctx, 'SUPPLIER_RETURN', input.clientRequestId, body, (tx, blind) =>
    recordStockSupplierReturnTx(tx, tenantId, { ...input, createdByUserId: ctx.userId }, { blindLocationIds: blind })
  );
}

/** Écriture publique d'une opération à un mouvement (rebut, retour). */
async function runSingleMovementWrite(
  tenantId: string,
  ctx: StockCallerContext,
  operation: StockClientOperation,
  clientRequestId: string | null | undefined,
  body: unknown,
  execute: (tx: PrismaTransactionClient, blind: Set<string>) => Promise<MovementView>
): Promise<StockWriteResponse<MovementView>> {
  const blind = await loadCallerBlind(tenantId, ctx);
  const { replayed, result } = await runStockWrite({
    tenantId,
    ctx,
    operation,
    clientRequestId,
    body,
    blind,
    execute: async tx => {
      const view = await execute(tx, blind);
      return { result: view, resultType: 'StockMovement', resultId: view.id };
    },
    replay: ref => loadMovementView(tenantId, ref.resultId)
  });
  return { status: replayed ? 200 : 201, data: maskMovementView(result, ctx, blind), meta: buildStockMeta(ctx, blind) };
}

// ===========================================================================
// VI. Le rebut (A6-R2, A6-R6)
// ===========================================================================

export interface RecordStockScrapParams {
  locationId: string;
  itemId: string;
  quantity: number;
  scrapDate: Date;
  reasonCode?: StockReasonCode | null;
  reason?: string | null;
  createdByUserId: string;
}

/** Bornes UTC du mois civil d'une date. */
function monthBoundsUtc(date: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { start, end };
}

/**
 * `LARGE_SCRAP` (B7-R1, A6-R6) : le rebut lui-même s'il atteint le seuil
 * (`SINGLE`) ; sinon le cumul du mois civil des rebuts du lieu restés chacun
 * sous le seuil, rebut courant compris (`MONTHLY_CUMUL`), une seule alerte par
 * lieu et par mois — la naissance par clé ne lève jamais (`skipDuplicates`).
 */
async function raiseScrapAlertTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  input: { movementId: string; location: ActiveLocation; scrapDate: Date; value: number; threshold: number | null }
): Promise<void> {
  if (input.threshold === null) {
    return;
  }
  const common = {
    tenantId,
    kind: 'LARGE_SCRAP' as const,
    severity: 'WARNING' as const,
    threshold: input.threshold,
    siteId: input.location.siteId,
    locationId: input.location.id,
    subjectType: 'StockMovement' as const,
    subjectId: input.movementId
  };
  if (input.value >= input.threshold) {
    await raiseStockAlertTx(tx, {
      ...common,
      dedupeKey: alertKeys.largeScrap(input.movementId),
      amount: input.value,
      details: { mode: 'SINGLE' }
    });
    return;
  }
  const { start, end } = monthBoundsUtc(input.scrapDate);
  const scraps = await tx.stockMovement.findMany({
    where: { tenantId, locationId: input.location.id, type: 'SCRAP', movementDate: { gte: start, lt: end } },
    select: { totalValue: true }
  });
  const threshold = input.threshold;
  const cumul = roundMoneyXof(
    scraps
      .map(row => toAmountOrZero(row.totalValue))
      .filter(value => value < threshold)
      .reduce((sum, value) => sum + value, 0)
  );
  if (cumul >= threshold) {
    const yyyyMm = toYearMonthUtc(input.scrapDate);
    await raiseStockAlertTx(tx, {
      ...common,
      dedupeKey: alertKeys.scrapCumul(input.location.id, yyyyMm),
      amount: cumul,
      details: { mode: 'MONTHLY_CUMUL', month: yyyyMm, scrapsCount: scraps.length }
    });
  }
}

/**
 * Enregistre un rebut (`SCRAP`, droit STOCK_DISPOSE) : D603 / C311 au coût
 * moyen du lieu, JAMAIS imputé à un chantier (comme un écart d'inventaire) ;
 * aucune écriture à valeur nulle (A6-R4) ; alerte `LARGE_SCRAP` ; audit critique.
 */
export async function recordStockScrapTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  params: RecordStockScrapParams,
  options: StockWriteOptions = {}
): Promise<MovementView> {
  const quantity = requirePositiveQuantity(
    params.quantity,
    'La quantité mise au rebut doit être strictement positive.'
  );
  const reason = requireReason('SCRAP', params.reasonCode, params.reason);

  // A10-R2 : le cumul mensuel du lieu (B7-R1) avant le solde — deux rebuts
  // d'articles différents sur le même lieu ne partagent aucun verrou de solde.
  await lockStockScrapMonthTx(tx, tenantId, params.locationId, toYearMonthUtc(params.scrapDate));
  await lockStockBalancesTx(tx, tenantId, [{ itemId: params.itemId, locationId: params.locationId }]);

  const location = await requireActiveLocationTx(tx, tenantId, params.locationId);
  const settings = await readControlsTx(tx, tenantId);
  assertMovementDateAllowed(params.scrapDate, settings.backdatingLimitDays, options.now);
  const item = (await requireItemsTx(tx, tenantId, [params.itemId], false)).get(params.itemId) as ItemRow;
  const previous = await readBalanceTx(tx, tenantId, item.id, location.id);
  if (quantity > previous.quantity) {
    throw insufficientStockError({
      locationId: location.id,
      itemId: item.id,
      itemLabel: item.label,
      requested: quantity,
      available: previous.quantity,
      blindLocationIds: options.blindLocationIds
    });
  }
  const valuation = decreaseValuation(previous, quantity);
  const authorLabel = await readUserLabelTx(tx, params.createdByUserId);

  const movement = await tx.stockMovement.create({
    data: {
      tenantId,
      type: 'SCRAP',
      itemId: item.id,
      locationId: location.id,
      movementDate: params.scrapDate,
      quantity,
      isDecrease: true,
      unitCost: valuation.unitCost,
      totalValue: valuation.totalValue,
      currency: DEFAULT_CURRENCY,
      quantityAfter: valuation.quantityAfter,
      valueAfter: valuation.valueAfter,
      reasonCode: reason.reasonCode,
      reason: reason.reason,
      createdByUserId: params.createdByUserId
    }
  });
  await writeBalanceTx(tx, tenantId, item.id, location.id, previous, valuation.quantityAfter, valuation.valueAfter);

  let row: any = movement;
  if (valuation.totalValue > 0) {
    const accounts = await resolveOperationalAccounts(tx, tenantId, params.scrapDate);
    const entry = await postDocumentEntryTx(tx, {
      tenantId,
      journalId: accounts.journalId,
      entryDate: params.scrapDate,
      reference: `REB-${movement.id}`,
      description: `Rebut de stock — ${item.label} — ${location.label}`,
      documentType: 'STOCK_SCRAP',
      documentId: movement.id,
      lines: [
        { accountId: accounts.stockVariationAccountId, debit: valuation.totalValue, label: `Rebut — ${item.label}` },
        { accountId: accounts.stockAccountId, credit: valuation.totalValue, label: `Stock — ${item.label}` }
      ]
    });
    row = await tx.stockMovement.update({
      where: { id: movement.id, tenantId },
      data: { journalEntryId: entry.entryId }
    });
  }

  await raiseScrapAlertTx(tx, tenantId, {
    movementId: movement.id,
    location,
    scrapDate: params.scrapDate,
    value: valuation.totalValue,
    threshold: settings.issueAlertAmount
  });

  await recordAuditEvent(tx, {
    tenantId,
    actorUserId: params.createdByUserId,
    actionKey: AuditActionKey.STOCK_SCRAP_RECORDED,
    entityType: 'StockMovement',
    entityId: movement.id,
    payload: {
      locationId: location.id,
      itemId: item.id,
      quantity,
      reasonCode: reason.reasonCode,
      reason: reason.reason,
      totalValue: valuation.totalValue
    }
  });

  return buildMovementView(
    { ...movement, ...row },
    { item, locationLabel: location.label, createdByLabel: authorLabel }
  );
}

/** `POST /stock/scraps` : rebut idempotent, masqué pour l'appelant. */
export async function recordStockScrap(
  tenantId: string,
  ctx: StockCallerContext,
  input: Omit<RecordStockScrapParams, 'createdByUserId'> & { clientRequestId?: string | null },
  body: unknown = input
): Promise<StockWriteResponse<MovementView>> {
  return runSingleMovementWrite(tenantId, ctx, 'SCRAP', input.clientRequestId, body, (tx, blind) =>
    recordStockScrapTx(tx, tenantId, { ...input, createdByUserId: ctx.userId }, { blindLocationIds: blind })
  );
}

// ===========================================================================
// VII. Ce qu'il reste, et ce que ça vaut
// ===========================================================================

const BALANCE_INCLUDE = {
  item: { select: { reference: true, label: true, unit: true } },
  location: { select: { label: true } }
} as const;

function toBalanceRecord(row: any): StockBalanceRecord {
  const quantity = roundQuantity(toAmountOrZero(row.quantity));
  const value = roundMoneyXof(toAmountOrZero(row.value));
  return {
    itemId: row.itemId,
    itemReference: row.item?.reference ?? 'Article inconnu',
    itemLabel: row.item?.label ?? 'Article inconnu',
    itemUnit: row.item?.unit ?? '',
    locationId: row.locationId,
    locationLabel: row.location?.label ?? 'Lieu inconnu',
    quantity,
    value,
    averageUnitCost: roundQuantity(averageUnitCostOf(quantity, value)),
    currency: row.currency ?? DEFAULT_CURRENCY
  };
}

function sortBalances<T extends { locationLabel: string; itemReference: string }>(rows: T[]): T[] {
  return rows.sort(
    (a, b) => a.locationLabel.localeCompare(b.locationLabel) || a.itemReference.localeCompare(b.itemReference)
  );
}

/**
 * Soldes NON masqués (scripts, contrôles internes). Les routes passent par
 * `listStockBalancesForCaller`.
 */
export const listStockBalances: ListStockBalances = async (tenantId, filters) => {
  const rows = await prisma.stockBalance.findMany({
    where: {
      tenantId,
      ...(filters?.locationId ? { locationId: filters.locationId } : {}),
      ...(filters?.itemId ? { itemId: filters.itemId } : {}),
      ...(filters?.onlyInStock ? { quantity: { gt: 0 } } : {})
    },
    include: BALANCE_INCLUDE
  });
  return sortBalances((rows as any[]).map(toBalanceRecord));
};

/**
 * `GET /stock/balances`, masqué pour l'appelant (§8.1, §8.2). `onlyInStock` ne
 * filtre PAS un lieu en comptage : il trahirait qu'un solde est nul ; toutes
 * ses lignes sont rendues, masquées.
 */
export async function listStockBalancesForCaller(
  tenantId: string,
  ctx: StockCallerContext,
  filters: { locationId?: string; itemId?: string; onlyInStock?: boolean }
): Promise<{ data: BalanceView[]; meta: StockMeta }> {
  const blind = await loadCallerBlind(tenantId, ctx);
  const blindIds = [...blind];
  const inStock = filters.onlyInStock
    ? blindIds.length > 0
      ? { OR: [{ quantity: { gt: 0 } }, { locationId: { in: blindIds } }] }
      : { quantity: { gt: 0 } }
    : {};
  const rows = await prisma.stockBalance.findMany({
    where: {
      tenantId,
      ...(filters.locationId ? { locationId: filters.locationId } : {}),
      ...(filters.itemId ? { itemId: filters.itemId } : {}),
      ...inStock
    },
    include: BALANCE_INCLUDE
  });
  const data = sortBalances((rows as any[]).map(toBalanceRecord)).map(record => maskBalanceView(record, ctx, blind));
  return { data, meta: buildStockMeta(ctx, blind) };
}

// D. Le journal des mouvements vit dans `stock-journal.ts` (territoire API-3).
