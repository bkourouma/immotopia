/**
 * Inventaire physique — lot 5 (troisième sous-lot), refondu par le lot 040
 * « Contrôle du stock de chantier » (spec 040 A1 à A4, A7, B4, B6, B7).
 *
 * ---------------------------------------------------------------------------
 * Cycle (A2-R1)
 * ---------------------------------------------------------------------------
 *
 *   DRAFT (comptage en cours, À L'AVEUGLE)
 *     └─ close ─► COUNTED (quantités figées, écarts révélés, à justifier)
 *                    └─ validate ─► VALIDATED (écarts appliqués au solde)
 *   DRAFT ─ cancel ─► CANCELLED (reste aveugle à jamais)
 *   COUNTED d'un OPENING/CLOSING ─ cancel ─► CANCELLED (dérogation à A2-R6)
 *
 * Pas de retour de COUNTED à DRAFT, pas d'abandon d'un COUNTED courant : ses écarts
 * ont été vus, il se valide (au besoin après avoir écarté des lignes).
 *
 * ---------------------------------------------------------------------------
 * Aveugle (A2-R2)
 * ---------------------------------------------------------------------------
 *
 * En DRAFT (et en CANCELLED), AUCUNE route d'inventaire ne livre l'attendu,
 * l'écart, le nombre de lignes en écart ni une valeur d'écart — à personne,
 * détenteurs de STOCK_COUNT_VALIDATE compris. La saisie d'une ligne ne rend
 * que la ligne saisie. L'aveugle des routes HORS inventaire (soldes, journal…)
 * est celui de `stock-controles.ts` (§8.2), pas celui-ci.
 *
 * ---------------------------------------------------------------------------
 * L'attendu est FIGÉ à la saisie, l'écart s'APPLIQUE à la validation (A3)
 * ---------------------------------------------------------------------------
 *
 * `expectedQuantity` n'est jamais un paramètre d'entrée (principe P-4) : le
 * service la lit dans le solde à l'instant de la saisie (et de chaque
 * ressaisie) et la fige avec `expectedCapturedAt`. À la validation,
 * l'ajustement applique l'ÉCART (compté − attendu figé) au solde COURANT : un
 * mouvement enregistré entre le comptage et la validation n'est plus écrasé.
 * Si le solde deviendrait négatif, la validation est refusée en entier
 * (`STOCK_COUNT_NEGATIVE_AFTER_MOVEMENTS`) : on écarte la ligne et on recompte.
 *
 * ---------------------------------------------------------------------------
 * Où passe l'argent d'un écart
 * ---------------------------------------------------------------------------
 *
 *   on a trouvé MOINS    débit  603 (variations de stock)   crédit 311
 *   on a trouvé PLUS     débit  311                          crédit 603
 *
 * Un écart n'est JAMAIS imputé à un chantier : aucune `CostAllocation` ne naît
 * ici. Aucune écriture pour un ajustement de valeur nulle (A6-R4) — c'est le
 * cas d'un surplus d'inventaire d'ouverture, qui entre à valeur nulle (A7-R2) :
 * la matière présente avant la bascule a déjà été imputée par ses factures.
 *
 * ---------------------------------------------------------------------------
 * Celui qui compte ne valide pas (A1)
 * ---------------------------------------------------------------------------
 *
 * Les compteurs sont accumulés dans `counterUserIds` à chaque saisie, jamais
 * retirés. La dérogation (aucun autre membre actif ne peut valider) se lit EN
 * BASE (`hasOtherActiveCountValidator`), jamais par `getUserPermissions`, dont
 * le cache de cinq minutes rendrait la règle contournable.
 *
 * ---------------------------------------------------------------------------
 * Appelants hors requête HTTP (lot 041, plan §11)
 * ---------------------------------------------------------------------------
 *
 * `createStockCountTx`, `setStockCountLineTx` et `closeStockCountTx` ont des
 * signatures FIGÉES : le lot 041 (inventaire par WhatsApp) les appelle hors de
 * toute requête. Aucune fonction d'écriture de ce fichier ne lit l'utilisateur
 * ni l'agence dans un contexte de requête : l'un et l'autre arrivent en
 * paramètre, et chaque événement d'audit porte `tenantId` et `actorUserId`
 * explicitement. Les événements non critiques sont différés après la
 * transaction quand l'appelant fournit `options.deferredAudit` (le contrôleur
 * HTTP les écrit par `logAuditEvent`, B6-R5) ; sans ce collecteur, ils
 * s'écrivent dans la transaction, ce qui ne perd rien.
 *
 * ---------------------------------------------------------------------------
 * Ordre des verrous (A10-R2) et lecture avant écriture
 * ---------------------------------------------------------------------------
 *
 * Chaque opération qui modifie un inventaire existant ou ses lignes verrouille
 * d'abord SA LIGNE `stock_counts` (`lockCountRowTx`, `SELECT … FOR UPDATE`),
 * puis relit statut et lignes : deux transitions du même inventaire (saisie
 * et clôture, mise à l'écart et validation…) se suivent au lieu de se croiser.
 * Ordre complet : clé d'idempotence (posée par l'appelant), ligne de
 * l'inventaire, verrous de solde triés (`lockStockBalancesTx`), puis verrou de
 * numérotation (`createStockSlipTx`, en dernier), puis seulement les écritures. En
 * PostgreSQL une commande en échec condamne toute la transaction : tout ce qui
 * peut refuser une opération est vérifié AVANT la première écriture, et les
 * ajustements s'écrivent en séquence, jamais en `Promise.all`.
 */

import type { StockCountKind, StockCountStatus, StockReasonCode } from '@prisma/client';

import { prisma } from '../../utils/database';
import type { PrismaTransactionClient } from '../../utils/database';
import { assertBelongsToTenant } from '../../utils/tenant-ownership';
import { AppError, BadRequestError, ErrorCode, NotFoundError } from '../../middleware/error-middleware';
import { recordAuditEvent } from '../../services/audit-service';
import { getUserPermissions } from '../../services/permission-service';
import { AuditActionKey } from '../../types/audit-types';
import type { AuditLogEntry } from '../../types/audit-types';
import { ensureOperationalChartOfAccountsTx, ensureOperationalJournalTx, postDocumentEntryTx } from './accounting';
import { roundMoneyXof, roundQuantity } from './money';
import { toAmount, toAmountOrZero } from './types';
import {
  assertMovementDateAllowed,
  assertReasonForContext,
  isOpeningCountSuggested,
  isUniqueViolation,
  loadItemsToRecount,
  lockStockBalancesTx,
  maskValue,
  stockError
} from './stock-controles';
import { createStockSlipTx, formatSlipNumber } from './stock-bons';
import { alertKeys, raiseStockAlertTx, readStockAlertSettings } from './stock-alertes';
import type {
  CountLineView,
  CountView,
  PrismaLike,
  SlipSummary,
  StockCallerContext,
  StockControlsSettingsValues,
  StockSlipSnapshot
} from './types-040-controle';

/** Devise unique du module (décision D9 du plan, actée au lot 1). */
const DEFAULT_CURRENCY = 'XOF';

/** La permission qui valide un inventaire (et qui voit le stock pendant un comptage). */
const COUNT_VALIDATE_PERMISSION = 'STOCK_COUNT_VALIDATE';

// ---------------------------------------------------------------------------
// Options communes des écritures
// ---------------------------------------------------------------------------

/**
 * Options d'une écriture d'inventaire. `deferredAudit` collecte les
 * événements NON critiques pour qu'ils soient écrits après la transaction
 * (`logAuditEvent`, B6-R5). Sans collecteur, ils s'écrivent dans la
 * transaction (appelant hors requête, lot 041).
 */
export interface StockCountWriteOptions {
  deferredAudit?: AuditLogEntry[];
}

/** Un événement non critique : différé si l'appelant le collecte, écrit dans la transaction sinon. */
async function emitAudit(
  tx: PrismaTransactionClient,
  entry: AuditLogEntry,
  options?: StockCountWriteOptions
): Promise<void> {
  if (options?.deferredAudit) {
    options.deferredAudit.push(entry);
    return;
  }
  await recordAuditEvent(tx, entry);
}

/** Un événement critique : toujours dans la transaction (B6-R2). */
async function emitCriticalAudit(tx: PrismaTransactionClient, entry: AuditLogEntry): Promise<void> {
  await recordAuditEvent(tx, entry);
}

function countAuditEntry(
  tenantId: string,
  countId: string,
  actorUserId: string,
  actionKey: AuditActionKey,
  payload: Record<string, unknown>
): AuditLogEntry {
  return { tenantId, actorUserId, actionKey, entityType: 'StockCount', entityId: countId, payload };
}

// ---------------------------------------------------------------------------
// Petites aides
// ---------------------------------------------------------------------------

/**
 * Le coût moyen pondéré d'un emplacement. Calculé, jamais stocké. Vaut zéro
 * quand la quantité est nulle ou négative (même règle que `stock-mouvements.ts`).
 */
function averageUnitCostOf(quantity: number, value: number): number {
  if (quantity <= 0) {
    return 0;
  }
  return value / quantity;
}

function toUserLabel(user?: { fullName?: string | null; email?: string | null } | null): string {
  return user?.fullName || user?.email || 'Utilisateur inconnu';
}

function toNullableUserLabel(user?: { fullName?: string | null; email?: string | null } | null): string | null {
  return user ? toUserLabel(user) : null;
}

function quantityOrNull(value: Parameters<typeof toAmount>[0]): number | null {
  const amount = toAmount(value);
  return amount === null ? null : roundQuantity(amount);
}

function wrongStatus(message: string): AppError {
  return stockError(409, ErrorCode.STOCK_COUNT_WRONG_STATUS, message);
}

const STATUS_MESSAGES: Record<StockCountStatus, string> = {
  DRAFT: "Cet inventaire est en cours de comptage : clôturez d'abord le comptage.",
  COUNTED: 'Le comptage de cet inventaire est clos : ses quantités sont figées.',
  VALIDATED: 'Cet inventaire est déjà validé : un comptage erroné se corrige par un second comptage.',
  CANCELLED: 'Cet inventaire a été abandonné.'
};

function assertCountStatus(count: { status: StockCountStatus }, expected: StockCountStatus): void {
  if (count.status !== expected) {
    throw wrongStatus(STATUS_MESSAGES[count.status]);
  }
}

// ---------------------------------------------------------------------------
// Le solde d'un emplacement
// ---------------------------------------------------------------------------

interface BalanceState {
  /** Nul quand l'emplacement n'a encore jamais rien reçu. */
  id: string | null;
  quantity: number;
  value: number;
}

/** Lit le solde (article, lieu), `tenantId` toujours dans le filtre. */
async function readBalanceTx(
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

/** Les soldes d'un lieu pour un ensemble d'articles, en une requête. */
async function readBalancesTx(
  db: PrismaLike,
  tenantId: string,
  locationId: string,
  itemIds: string[]
): Promise<Map<string, BalanceState>> {
  const result = new Map<string, BalanceState>();
  if (itemIds.length === 0) {
    return result;
  }
  const rows = await db.stockBalance.findMany({
    where: { tenantId, locationId, itemId: { in: [...new Set(itemIds)] } },
    select: { id: true, itemId: true, quantity: true, value: true }
  });
  for (const row of rows) {
    result.set(row.itemId, {
      id: row.id,
      quantity: roundQuantity(toAmountOrZero(row.quantity)),
      value: roundMoneyXof(toAmountOrZero(row.value))
    });
  }
  return result;
}

async function writeBalanceTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  itemId: string,
  locationId: string,
  previous: BalanceState,
  quantity: number,
  value: number
): Promise<void> {
  if (previous.id) {
    await tx.stockBalance.update({ where: { id: previous.id, tenantId }, data: { quantity, value } });
    return;
  }
  await tx.stockBalance.create({
    data: { tenantId, itemId, locationId, quantity, value, currency: DEFAULT_CURRENCY }
  });
}

// ---------------------------------------------------------------------------
// Lecture d'un inventaire (forme brute)
// ---------------------------------------------------------------------------

const USER_LABEL = { select: { fullName: true, email: true } } as const;

const LINE_SELECT = {
  id: true,
  countId: true,
  itemId: true,
  expectedQuantity: true,
  countedQuantity: true,
  reason: true,
  expectedCapturedAt: true,
  countedByUserId: true,
  countedAtServer: true,
  countedBlind: true,
  reasonCode: true,
  justifiedAt: true,
  setAsideAt: true,
  setAsideReason: true,
  unitCostAtValidation: true,
  movementsSinceCapture: true,
  item: { select: { reference: true, label: true, unit: true } },
  countedBy: USER_LABEL,
  justifiedBy: USER_LABEL,
  setAsideBy: USER_LABEL,
  _count: { select: { attachments: { where: { removedAt: null } } } }
} as const;

const COUNT_SELECT = {
  id: true,
  tenantId: true,
  locationId: true,
  countedAt: true,
  status: true,
  kind: true,
  createdByUserId: true,
  createdAt: true,
  closedAt: true,
  closedByUserId: true,
  validatedAt: true,
  cancelledAt: true,
  cancelReason: true,
  selfValidated: true,
  selfValidationReason: true,
  counterUserIds: true,
  countedValue: true,
  varianceValueGross: true,
  varianceValueNet: true,
  setAsideVarianceValue: true,
  location: { select: { label: true, kind: true, siteId: true, site: { select: { name: true } } } },
  createdBy: USER_LABEL,
  closedBy: USER_LABEL,
  validatedBy: USER_LABEL,
  slip: { select: { id: true, kind: true, year: true, number: true, documentDate: true, createdAt: true } },
  lines: { select: LINE_SELECT }
} as const;

/** Une ligne telle que lue (forme minimale sur laquelle travaillent les règles). */
interface LineRow {
  id: string;
  itemId: string;
  expectedQuantity: unknown;
  countedQuantity: unknown;
  reason: string | null;
  expectedCapturedAt: Date | null;
  countedByUserId: string | null;
  countedAtServer: Date | null;
  countedBlind: boolean | null;
  reasonCode: StockReasonCode | null;
  justifiedAt: Date | null;
  setAsideAt: Date | null;
  setAsideReason: string | null;
  unitCostAtValidation: unknown;
  movementsSinceCapture: number | null;
  item?: { reference: string; label: string; unit: string } | null;
  countedBy?: { fullName: string | null; email: string } | null;
  justifiedBy?: { fullName: string | null; email: string } | null;
  setAsideBy?: { fullName: string | null; email: string } | null;
  _count?: { attachments?: number } | null;
}

interface CountRow {
  id: string;
  tenantId: string;
  locationId: string;
  countedAt: Date;
  status: StockCountStatus;
  kind: StockCountKind;
  createdByUserId: string;
  createdAt: Date;
  closedAt: Date | null;
  closedByUserId: string | null;
  validatedAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  selfValidated: boolean;
  selfValidationReason: string | null;
  counterUserIds: string[];
  countedValue: unknown;
  varianceValueGross: unknown;
  varianceValueNet: unknown;
  setAsideVarianceValue: unknown;
  location?: { label: string; kind: string; siteId: string | null; site?: { name: string } | null } | null;
  createdBy?: { fullName: string | null; email: string } | null;
  closedBy?: { fullName: string | null; email: string } | null;
  validatedBy?: { fullName: string | null; email: string } | null;
  slip?: {
    id: string;
    kind: SlipSummary['kind'];
    year: number;
    number: number;
    documentDate: Date;
    createdAt: Date;
  } | null;
  lines: LineRow[];
}

type Decimalish = Parameters<typeof toAmount>[0];

async function loadCountRowTx(db: PrismaLike, tenantId: string, countId: string): Promise<CountRow> {
  const row = await db.stockCount.findFirst({ where: { id: countId, tenantId }, select: COUNT_SELECT });
  if (!row) {
    throw new NotFoundError('Inventaire introuvable.');
  }
  return row as unknown as CountRow;
}

/** L'en-tête seul d'un inventaire, pour les gardes d'état des écritures. */
async function loadCountHeadTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  countId: string
): Promise<{
  id: string;
  status: StockCountStatus;
  kind: StockCountKind;
  locationId: string;
  counterUserIds: string[];
  location: { siteId: string | null } | null;
}> {
  const row = await tx.stockCount.findFirst({
    where: { id: countId, tenantId },
    select: {
      id: true,
      status: true,
      kind: true,
      locationId: true,
      counterUserIds: true,
      location: { select: { siteId: true } }
    }
  });
  if (!row) {
    throw new NotFoundError('Inventaire introuvable.');
  }
  return row;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Verrouille la ligne `stock_counts` de l'inventaire (`SELECT … FOR UPDATE`,
 * filtrée par `id` ET `tenant_id`) jusqu'à la fin de la transaction. Premier
 * verrou de toute opération qui modifie un inventaire existant ou ses lignes,
 * avant les verrous de solde (A10-R2) ; l'appelant relit statut et lignes
 * APRÈS lui. Un identifiant mal formé ou d'une autre agence répond 404, comme
 * un inventaire inexistant.
 */
async function lockCountRowTx(tx: PrismaTransactionClient, tenantId: string, countId: string): Promise<void> {
  if (typeof countId !== 'string' || !UUID_PATTERN.test(countId)) {
    throw new NotFoundError('Inventaire introuvable.');
  }
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"::text AS "id" FROM "stock_counts"
    WHERE "id" = ${countId}::uuid AND "tenant_id" = ${tenantId}
    FOR UPDATE`;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new NotFoundError('Inventaire introuvable.');
  }
}

/**
 * L'heure de la BASE (`clock_timestamp()`, l'instant de l'appel et non le début
 * de la transaction), lue après les verrous : c'est l'horloge à laquelle
 * `movementsSinceCapture` compare l'heure de figeage de l'attendu.
 */
async function readDatabaseClockTx(tx: PrismaTransactionClient): Promise<Date> {
  const rows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`;
  const value = Array.isArray(rows) ? rows[0]?.now : undefined;
  return value instanceof Date ? value : new Date(value ?? Date.now());
}

// ---------------------------------------------------------------------------
// Règles sur une ligne
// ---------------------------------------------------------------------------

interface LineFacts {
  expected: number;
  counted: number | null;
  notCounted: boolean;
  /** compté − attendu ; `null` pour une ligne non comptée. */
  variance: number | null;
  setAside: boolean;
  /** Ligne d'avant le lot : comptée, sans auteur. */
  legacy: boolean;
}

function lineFacts(line: LineRow): LineFacts {
  const expected = roundQuantity(toAmountOrZero(line.expectedQuantity as Decimalish));
  const counted = quantityOrNull(line.countedQuantity as Decimalish);
  return {
    expected,
    counted,
    notCounted: counted === null,
    variance: counted === null ? null : roundQuantity(counted - expected),
    setAside: line.setAsideAt !== null && line.setAsideAt !== undefined,
    legacy: counted !== null && !line.countedByUserId
  };
}

/** Surplus d'un inventaire d'ouverture : entre à valeur nulle, sans justification (A7-R2). */
function isOpeningSurplus(kind: StockCountKind, facts: LineFacts): boolean {
  return kind === 'OPENING' && facts.variance !== null && facts.variance > 0;
}

/**
 * Règle UNIQUE de justification (A4-R2) : un `reasonCode` de la liste fermée,
 * ou une ligne d'avant le lot qui porte un motif libre non vide. Le surplus
 * d'ouverture est justifié par le système (A7-R2).
 */
function hasJustification(kind: StockCountKind, line: LineRow, facts: LineFacts): boolean {
  if (line.reasonCode) {
    return true;
  }
  if (facts.legacy && typeof line.reason === 'string' && line.reason.trim().length > 0) {
    return true;
  }
  return isOpeningSurplus(kind, facts);
}

/** Une ligne qui bloque la validation faute de justification. */
function needsJustification(kind: StockCountKind, line: LineRow, facts: LineFacts): boolean {
  if (facts.notCounted || facts.setAside || facts.variance === null || facts.variance === 0) {
    return false;
  }
  return !hasJustification(kind, line, facts);
}

/**
 * Les compteurs effectifs (A1-R1) : `counterUserIds`, plus le créateur si une
 * ligne d'avant le lot (comptée, sans auteur) existe — seule information
 * disponible, rien n'est écrit en base. Un inventaire SANS LIGNE (clôture d'un
 * lieu vide, A2-R4) a pour compteur celui qui a clos son comptage : c'est lui
 * qui atteste le lieu vide, il ne valide donc pas seul son propre constat (A1).
 */
function effectiveCounterIds(
  count: Pick<CountRow, 'counterUserIds' | 'createdByUserId' | 'lines'> & { closedByUserId?: string | null }
): string[] {
  const ids = new Set(count.counterUserIds ?? []);
  if (count.lines.some(line => lineFacts(line).legacy)) {
    ids.add(count.createdByUserId);
  }
  if (count.lines.length === 0 && count.closedByUserId) {
    ids.add(count.closedByUserId);
  }
  return [...ids];
}

function itemLabelOf(line: { item?: { label: string } | null }): string {
  return line.item?.label ?? 'Article inconnu';
}

// ---------------------------------------------------------------------------
// A1-R3 : la dérogation se lit EN BASE
// ---------------------------------------------------------------------------

/**
 * Vrai s'il existe, dans l'agence, un membre ACTIF autre que `userId`
 * (`Membership.status = ACTIVE`, `User.isActive`, hors personnel de la
 * plateforme) dont un rôle de cette agence porte STOCK_COUNT_VALIDATE.
 * Lecture en base, jamais `getUserPermissions` (cache de 5 minutes, §5).
 *
 * `excludedUserIds` (les compteurs de l'inventaire) sont écartés eux aussi :
 * un validateur qui a compté ne peut pas valider (A1-R2), il ne compte donc
 * pas comme « autre validateur ». Sans cela, un inventaire compté par TOUS
 * les validateurs actifs ne pourrait plus être validé par personne.
 */
export async function hasOtherActiveCountValidator(
  db: PrismaLike,
  tenantId: string,
  userId: string,
  excludedUserIds: string[] = []
): Promise<boolean> {
  const excluded = [...new Set([userId, ...excludedUserIds])];
  const other = await db.user.findFirst({
    where: {
      id: excluded.length === 1 ? { not: userId } : { notIn: excluded },
      isActive: true,
      globalRole: { not: 'SUPER_ADMIN' },
      memberships: { some: { tenantId, status: 'ACTIVE' } },
      userRoles: {
        some: {
          tenantId,
          role: { permissions: { some: { permission: { key: COUNT_VALIDATE_PERMISSION } } } }
        }
      }
    },
    select: { id: true }
  });
  return other !== null;
}

// ---------------------------------------------------------------------------
// C. Ouvrir un inventaire
// ---------------------------------------------------------------------------

export interface CreateStockCountParams {
  locationId: string;
  countedAt: Date;
  createdByUserId: string;
  kind?: StockCountKind;
}

export interface CreatedStockCount {
  id: string;
  locationId: string;
  kind: StockCountKind;
  status: 'DRAFT';
}

interface LocationForCount {
  id: string;
  label: string;
  kind: string;
  isActive: boolean;
  siteId: string | null;
  site: { stockEnabledAt: Date | null } | null;
}

/** A7-R1 : OPENING et CLOSING seulement sur le lieu d'un chantier, OPENING dans sa fenêtre. */
async function assertKindAllowedTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  location: LocationForCount,
  kind: StockCountKind
): Promise<void> {
  if (kind === 'REGULAR') {
    return;
  }
  if (location.kind !== 'SITE' || !location.siteId) {
    throw stockError(
      409,
      ErrorCode.STOCK_OPENING_COUNT_NOT_ALLOWED,
      kind === 'OPENING'
        ? "Un inventaire d'ouverture se fait sur le lieu de stockage d'un chantier, jamais sur un magasin."
        : "Un inventaire de clôture se fait sur le lieu de stockage d'un chantier."
    );
  }
  if (kind === 'CLOSING') {
    return;
  }
  const existing = await tx.stockCount.findFirst({
    where: { tenantId, locationId: location.id, kind: 'OPENING', status: { not: 'CANCELLED' } },
    select: { id: true }
  });
  if (existing) {
    throw stockError(
      409,
      ErrorCode.STOCK_OPENING_COUNT_EXISTS,
      "Ce lieu a déjà un inventaire d'ouverture : faites un inventaire courant.",
      { countId: existing.id }
    );
  }
  if (!isOpeningCountSuggested({ stockEnabledAt: location.site?.stockEnabledAt ?? null }, false)) {
    throw stockError(
      409,
      ErrorCode.STOCK_OPENING_COUNT_NOT_ALLOWED,
      "L'inventaire d'ouverture se fait dans les 30 jours qui suivent le passage du chantier au stock."
    );
  }
}

/** Vrai si le `P2002` vient de l'index unique partiel « un OPENING par lieu ». */
function isOpeningIndexViolation(error: unknown): boolean {
  const target = (error as { meta?: { target?: unknown } })?.meta?.target;
  const text = Array.isArray(target) ? target.join(',') : String(target ?? '');
  return text.includes('one_opening_per_location');
}

/**
 * Insère l'inventaire. Deux ouvertures simultanées passent toutes deux les
 * lectures préalables ; la seconde bute sur un index unique partiel (`P2002`)
 * et reçoit le même refus typé que si elle était arrivée après la première,
 * jamais un `CONFLICT` générique.
 */
async function insertStockCountTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  locationId: string,
  params: CreateStockCountParams,
  kind: StockCountKind
): Promise<{ id: string }> {
  try {
    return await tx.stockCount.create({
      data: {
        tenantId,
        locationId,
        countedAt: params.countedAt,
        status: 'DRAFT',
        kind,
        createdByUserId: params.createdByUserId
      },
      select: { id: true }
    });
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
    if (kind === 'OPENING' && isOpeningIndexViolation(error)) {
      throw stockError(
        409,
        ErrorCode.STOCK_OPENING_COUNT_EXISTS,
        "Ce lieu a déjà un inventaire d'ouverture : faites un inventaire courant."
      );
    }
    throw stockError(
      409,
      ErrorCode.STOCK_COUNT_ALREADY_OPEN,
      'Un inventaire est déjà en cours sur ce lieu de stockage.'
    );
  }
}

/**
 * Ouvre un inventaire en DRAFT, sans ligne. Contrat FIGÉ (plan §11) : 409 si
 * un inventaire est déjà ouvert (DRAFT ou COUNTED) sur le lieu.
 */
export async function createStockCountTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  params: CreateStockCountParams,
  options?: StockCountWriteOptions
): Promise<CreatedStockCount> {
  const kind: StockCountKind = params.kind ?? 'REGULAR';
  await assertBelongsToTenant(tx, 'stockLocation', params.locationId, tenantId, {
    message: 'Lieu de stockage introuvable.'
  });
  const location = (await tx.stockLocation.findFirst({
    where: { id: params.locationId, tenantId },
    select: {
      id: true,
      label: true,
      kind: true,
      isActive: true,
      siteId: true,
      site: { select: { stockEnabledAt: true } }
    }
  })) as LocationForCount | null;
  if (!location) {
    throw new NotFoundError('Lieu de stockage introuvable.');
  }
  if (!location.isActive) {
    throw stockError(409, ErrorCode.STOCK_LOCATION_INACTIVE, 'Ce lieu de stockage est désactivé.');
  }

  const settings = await readStockAlertSettings(tx, tenantId);
  assertMovementDateAllowed(params.countedAt, settings.backdatingLimitDays);
  await assertKindAllowedTx(tx, tenantId, location, kind);

  const open = await tx.stockCount.findFirst({
    where: { tenantId, locationId: location.id, status: { in: ['DRAFT', 'COUNTED'] } },
    select: { id: true }
  });
  if (open) {
    throw stockError(
      409,
      ErrorCode.STOCK_COUNT_ALREADY_OPEN,
      'Un inventaire est déjà en cours sur ce lieu de stockage.',
      { countId: open.id }
    );
  }

  const created = await insertStockCountTx(tx, tenantId, location.id, params, kind);

  await emitAudit(
    tx,
    countAuditEntry(tenantId, created.id, params.createdByUserId, AuditActionKey.STOCK_COUNT_OPENED, {
      locationId: location.id,
      kind,
      countedAt: params.countedAt
    }),
    options
  );

  return { id: created.id, locationId: location.id, kind, status: 'DRAFT' };
}

// ---------------------------------------------------------------------------
// D. Saisir une ligne — l'attendu est FIGÉ ici, et jamais rendu
// ---------------------------------------------------------------------------

export interface SetStockCountLineParams {
  itemId: string;
  countedQuantity: number;
  countedByUserId: string;
}

export interface SetStockCountLineResult {
  lineId: string;
  /** La ligne saisie, à l'aveugle : ni attendu, ni écart, ni valeur (A2-R2). */
  line: CountLineView;
}

function assertCountedQuantity(value: number): number {
  const quantity = roundQuantity(value);
  if (!Number.isFinite(Number(value)) || !(quantity >= 0)) {
    throw new BadRequestError('La quantité comptée ne peut pas être négative.');
  }
  return quantity;
}

/**
 * Saisit (ou ressaisit) le comptage d'un article. Contrat FIGÉ (plan §11).
 * L'auteur de la ligne est `countedByUserId` (A4-R1) ; il entre dans les
 * compteurs de l'inventaire et n'en sort jamais (A1-R1). `countedBlind` est
 * faux s'il détient STOCK_COUNT_VALIDATE à cet instant (A2-R9).
 */
export async function setStockCountLineTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  countId: string,
  params: SetStockCountLineParams,
  options?: StockCountWriteOptions
): Promise<SetStockCountLineResult> {
  const countedQuantity = assertCountedQuantity(params.countedQuantity);
  // Verrou de l'inventaire d'abord : une saisie et une clôture du même
  // inventaire se suivent ; le statut relu ensuite est celui de l'instant.
  await lockCountRowTx(tx, tenantId, countId);
  const count = await loadCountHeadTx(tx, tenantId, countId);
  assertCountStatus(count, 'DRAFT');
  await assertBelongsToTenant(tx, 'stockItem', params.itemId, tenantId, { message: 'Article de stock introuvable.' });

  // L'attendu se lit sous le verrou du solde (A10-R1) et se date à l'horloge
  // de la base, lue après ce verrou (A3-R4).
  await lockStockBalancesTx(tx, tenantId, [{ itemId: params.itemId, locationId: count.locationId }]);
  const balance = await readBalanceTx(tx, tenantId, params.itemId, count.locationId);
  const now = await readDatabaseClockTx(tx);
  const permissions = await getUserPermissions(params.countedByUserId, tenantId);
  const countedBlind = !permissions.includes(COUNT_VALIDATE_PERMISSION);

  const existing = await tx.stockCountLine.findFirst({
    where: { countId: count.id, itemId: params.itemId },
    select: { id: true, countedQuantity: true, countedByUserId: true }
  });
  const data = {
    expectedQuantity: balance.quantity,
    expectedCapturedAt: now,
    countedQuantity,
    countedByUserId: params.countedByUserId,
    countedAtServer: now,
    countedBlind
  };
  const lineId = existing
    ? (await tx.stockCountLine.update({ where: { id: existing.id }, data, select: { id: true } })).id
    : (
        await tx.stockCountLine.create({
          data: { countId: count.id, itemId: params.itemId, ...data },
          select: { id: true }
        })
      ).id;

  if (!(count.counterUserIds ?? []).includes(params.countedByUserId)) {
    await tx.stockCount.update({
      where: { id: count.id, tenantId },
      data: { counterUserIds: { push: params.countedByUserId } }
    });
  }

  await emitAudit(
    tx,
    countAuditEntry(tenantId, count.id, params.countedByUserId, AuditActionKey.STOCK_COUNT_LINE_RECORDED, {
      itemId: params.itemId,
      previousQuantity: existing ? quantityOrNull(existing.countedQuantity) : null,
      quantity: countedQuantity,
      previousCountedByUserId: existing?.countedByUserId ?? null
    }),
    options
  );

  const line = await loadLineRowTx(tx, lineId);
  return { lineId, line: toLineView(line, blindLineContext()) };
}

async function loadLineRowTx(db: PrismaLike, lineId: string): Promise<LineRow> {
  const row = await db.stockCountLine.findFirst({ where: { id: lineId }, select: LINE_SELECT });
  if (!row) {
    throw new NotFoundError('Ligne d’inventaire introuvable.');
  }
  return row as unknown as LineRow;
}

/** Retire une ligne d'un inventaire en DRAFT ; son auteur reste compteur (A1-R1). */
export async function removeStockCountLineTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  countId: string,
  itemId: string,
  removedByUserId: string,
  options?: StockCountWriteOptions
): Promise<{ id: string }> {
  await lockCountRowTx(tx, tenantId, countId);
  const count = await loadCountHeadTx(tx, tenantId, countId);
  assertCountStatus(count, 'DRAFT');

  const line = await tx.stockCountLine.findFirst({
    where: { countId: count.id, itemId },
    select: { id: true, countedQuantity: true, _count: { select: { attachments: true } } }
  });
  if (!line) {
    throw new NotFoundError('Cet article ne figure pas dans cet inventaire.');
  }
  if ((line._count?.attachments ?? 0) > 0) {
    throw new AppError(
      'Cette ligne porte une pièce jointe : ressaisissez sa quantité plutôt que de la retirer.',
      409,
      ErrorCode.CONFLICT
    );
  }

  await tx.stockCountLine.delete({ where: { id: line.id } });
  await emitAudit(
    tx,
    countAuditEntry(tenantId, count.id, removedByUserId, AuditActionKey.STOCK_COUNT_LINE_REMOVED, {
      itemId,
      removedQuantity: quantityOrNull(line.countedQuantity)
    }),
    options
  );
  return { id: count.id };
}

// ---------------------------------------------------------------------------
// E. Clore le comptage (DRAFT → COUNTED) — A2-R4, A2-R8
// ---------------------------------------------------------------------------

export interface ClosedStockCount {
  id: string;
  status: 'COUNTED';
  /** Lignes « non comptées » créées par le système (A2-R8). */
  uncountedLinesCreated: number;
}

/** Les soldes non nuls d'un lieu, avec le libellé de l'article. */
async function readNonZeroBalancesTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  locationId: string
): Promise<Array<{ itemId: string; quantity: number; itemLabel: string }>> {
  const rows = await tx.stockBalance.findMany({
    where: { tenantId, locationId, quantity: { not: 0 } },
    select: { itemId: true, quantity: true, item: { select: { label: true } } }
  });
  return rows
    .map(row => ({
      itemId: row.itemId,
      quantity: roundQuantity(toAmountOrZero(row.quantity)),
      itemLabel: row.item?.label ?? 'Article inconnu'
    }))
    .filter(row => row.quantity !== 0);
}

/**
 * Clôt le comptage. Contrat FIGÉ (plan §11). Sous les verrous de solde de tous
 * les articles du lieu (solde non nul) et de toutes les lignes, crée en lot une
 * ligne « non comptée » pour chaque article de solde non nul sans ligne
 * (A2-R8) ; pour un OPENING ou un CLOSING, refuse plutôt
 * (`STOCK_COUNT_INCOMPLETE`). Sans ligne : `STOCK_COUNT_EMPTY`, sauf un
 * CLOSING d'un lieu vide, qui atteste ce lieu vide (A2-R4).
 */
export async function closeStockCountTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  countId: string,
  closedByUserId: string
): Promise<ClosedStockCount> {
  // Verrou de l'inventaire avant tout : aucune saisie ni retrait ne passe
  // entre la lecture des lignes et le passage en COUNTED.
  await lockCountRowTx(tx, tenantId, countId);
  const count = await loadCountHeadTx(tx, tenantId, countId);
  assertCountStatus(count, 'DRAFT');

  const lines = await tx.stockCountLine.findMany({ where: { countId: count.id }, select: { itemId: true } });
  const lineItemIds = new Set(lines.map(line => line.itemId));
  const before = await readNonZeroBalancesTx(tx, tenantId, count.locationId);
  const pairs = [...new Set([...lineItemIds, ...before.map(row => row.itemId)])].map(itemId => ({
    itemId,
    locationId: count.locationId
  }));
  await lockStockBalancesTx(tx, tenantId, pairs);

  // Relu APRÈS les verrous : c'est le solde de l'instant qui se fige (data-model §6).
  const nonZero = await readNonZeroBalancesTx(tx, tenantId, count.locationId);
  const missing = nonZero.filter(row => !lineItemIds.has(row.itemId));

  if (lines.length === 0 && !(count.kind === 'CLOSING' && nonZero.length === 0)) {
    throw stockError(
      409,
      ErrorCode.STOCK_COUNT_EMPTY,
      'Cet inventaire ne porte aucune ligne : comptez au moins un article.'
    );
  }
  if ((count.kind === 'OPENING' || count.kind === 'CLOSING') && missing.length > 0) {
    throw stockError(
      409,
      ErrorCode.STOCK_COUNT_INCOMPLETE,
      "Cet inventaire doit couvrir tout le lieu : des articles en stock n'ont pas été comptés.",
      { items: missing.map(row => ({ itemId: row.itemId, itemLabel: row.itemLabel })) }
    );
  }

  const now = await readDatabaseClockTx(tx);
  if (missing.length > 0) {
    await tx.stockCountLine.createMany({
      data: missing.map(row => ({
        countId: count.id,
        itemId: row.itemId,
        expectedQuantity: row.quantity,
        expectedCapturedAt: now,
        countedQuantity: null
      }))
    });
  }

  const updated = await tx.stockCount.updateMany({
    where: { id: count.id, tenantId, status: 'DRAFT' },
    data: { status: 'COUNTED', closedAt: now, closedByUserId }
  });
  if (updated.count !== 1) {
    throw wrongStatus("Cet inventaire vient de changer d'état : relisez-le.");
  }

  await emitCriticalAudit(
    tx,
    countAuditEntry(tenantId, count.id, closedByUserId, AuditActionKey.STOCK_COUNT_CLOSED, {
      locationId: count.locationId,
      kind: count.kind,
      linesCount: lines.length + missing.length,
      uncountedLinesCreated: missing.length
    })
  );

  return { id: count.id, status: 'COUNTED', uncountedLinesCreated: missing.length };
}

// ---------------------------------------------------------------------------
// F. Justifier, écarter (COUNTED) — A2-R5, A2-R7, A2-R8
// ---------------------------------------------------------------------------

async function loadCountedLineTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  countId: string,
  itemId: string
): Promise<{ count: Awaited<ReturnType<typeof loadCountHeadTx>>; line: LineRow }> {
  await lockCountRowTx(tx, tenantId, countId);
  const count = await loadCountHeadTx(tx, tenantId, countId);
  assertCountStatus(count, 'COUNTED');
  const line = await tx.stockCountLine.findFirst({ where: { countId: count.id, itemId }, select: LINE_SELECT });
  if (!line) {
    throw new NotFoundError('Cet article ne figure pas dans cet inventaire.');
  }
  return { count, line: line as unknown as LineRow };
}

export interface JustifyStockCountLineParams {
  reasonCode: StockReasonCode;
  reason?: string | null;
  justifiedByUserId: string;
}

/** Justifie l'écart d'une ligne (A2-R5). Une ligne non comptée ou écartée ne se justifie pas. */
export async function justifyStockCountLineTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  countId: string,
  itemId: string,
  params: JustifyStockCountLineParams,
  options?: StockCountWriteOptions
): Promise<{ lineId: string }> {
  const { count, line } = await loadCountedLineTx(tx, tenantId, countId, itemId);
  const facts = lineFacts(line);
  if (facts.notCounted) {
    throw new AppError('Une ligne non comptée ne se justifie pas : écartez-la avec un motif.', 409, ErrorCode.CONFLICT);
  }
  if (facts.setAside) {
    throw new AppError(
      "Cette ligne est écartée : elle n'est pas ajustée et n'a pas à être justifiée.",
      409,
      ErrorCode.CONFLICT
    );
  }
  assertReasonForContext('COUNT', params.reasonCode, params.reason);
  const reason = typeof params.reason === 'string' && params.reason.trim().length > 0 ? params.reason.trim() : null;

  await tx.stockCountLine.update({
    where: { id: line.id },
    data: {
      reasonCode: params.reasonCode,
      reason,
      justifiedByUserId: params.justifiedByUserId,
      justifiedAt: new Date()
    }
  });
  await emitAudit(
    tx,
    countAuditEntry(tenantId, count.id, params.justifiedByUserId, AuditActionKey.STOCK_COUNT_LINE_JUSTIFIED, {
      itemId,
      reasonCode: params.reasonCode,
      reason
    }),
    options
  );
  return { lineId: line.id };
}

export interface SetAsideParams {
  reason: string;
  setAsideByUserId: string;
}

function normalizeSetAsideReason(reason: string): string {
  const trimmed = typeof reason === 'string' ? reason.trim() : '';
  if (trimmed.length < 3 || trimmed.length > 500) {
    throw new BadRequestError('Le motif de mise à l’écart compte de 3 à 500 caractères.');
  }
  return trimmed;
}

/**
 * Arbitrage du Pilote (trou de la spec, lot 040) : une ligne d'un inventaire
 * d'OUVERTURE ou de CLÔTURE ne s'écarte pas, ni une par une ni « tous les non
 * comptés ». Ces deux natures doivent couvrir tout le lieu (A2-R8, A7) :
 * écarter une ligne y ferait disparaître un article du constat sans
 * ajustement, exactement ce que `STOCK_COUNT_INCOMPLETE` refuse à la clôture
 * du comptage — d'où le même code. On ressaisit la quantité ou on justifie
 * l'écart.
 */
function assertSetAsideAllowed(kind: StockCountKind, items: Array<{ itemId: string; itemLabel: string }>): void {
  if (kind === 'OPENING' || kind === 'CLOSING') {
    throw stockError(
      409,
      ErrorCode.STOCK_COUNT_INCOMPLETE,
      "Un inventaire d'ouverture ou de clôture se compte en entier : justifiez l'écart, ou abandonnez l'inventaire et recomptez.",
      { items }
    );
  }
}

/** Écarte une ligne (A2-R7) : elle reste en base, n'est pas ajustée et devient « à recompter ». */
export async function setAsideStockCountLineTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  countId: string,
  itemId: string,
  params: SetAsideParams
): Promise<{ lineId: string }> {
  const reason = normalizeSetAsideReason(params.reason);
  const { count, line } = await loadCountedLineTx(tx, tenantId, countId, itemId);
  assertSetAsideAllowed(count.kind, [{ itemId, itemLabel: itemLabelOf(line) }]);
  const facts = lineFacts(line);
  if (facts.setAside) {
    throw new AppError('Cette ligne est déjà écartée.', 409, ErrorCode.CONFLICT);
  }

  await tx.stockCountLine.update({
    where: { id: line.id },
    data: { setAsideAt: new Date(), setAsideByUserId: params.setAsideByUserId, setAsideReason: reason }
  });
  await emitCriticalAudit(
    tx,
    countAuditEntry(tenantId, count.id, params.setAsideByUserId, AuditActionKey.STOCK_COUNT_LINE_SET_ASIDE, {
      reason,
      items: [{ itemId, expectedQuantity: facts.expected, countedQuantity: facts.counted }]
    })
  );
  return { lineId: line.id };
}

/**
 * Écarte d'un coup toutes les lignes non comptées non encore écartées, avec un
 * motif commun (A2-R8) ; une seule ligne d'audit liste les articles. Sans ligne
 * non comptée : rien ne change.
 */
export async function setAsideUncountedStockCountLinesTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  countId: string,
  params: SetAsideParams
): Promise<{ setAsideCount: number }> {
  const reason = normalizeSetAsideReason(params.reason);
  await lockCountRowTx(tx, tenantId, countId);
  const count = await loadCountHeadTx(tx, tenantId, countId);
  assertCountStatus(count, 'COUNTED');

  const uncounted = await tx.stockCountLine.findMany({
    where: { countId: count.id, countedQuantity: null, setAsideAt: null },
    select: { id: true, itemId: true, expectedQuantity: true, item: { select: { label: true } } }
  });
  assertSetAsideAllowed(
    count.kind,
    uncounted.map(line => ({ itemId: line.itemId, itemLabel: line.item?.label ?? 'Article inconnu' }))
  );
  if (uncounted.length === 0) {
    return { setAsideCount: 0 };
  }

  await tx.stockCountLine.updateMany({
    where: { countId: count.id, id: { in: uncounted.map(line => line.id) } },
    data: { setAsideAt: new Date(), setAsideByUserId: params.setAsideByUserId, setAsideReason: reason }
  });
  await emitCriticalAudit(
    tx,
    countAuditEntry(tenantId, count.id, params.setAsideByUserId, AuditActionKey.STOCK_COUNT_LINE_SET_ASIDE, {
      reason,
      uncounted: true,
      items: uncounted.map(line => ({
        itemId: line.itemId,
        expectedQuantity: roundQuantity(toAmountOrZero(line.expectedQuantity)),
        countedQuantity: null
      }))
    })
  );
  return { setAsideCount: uncounted.length };
}

// ---------------------------------------------------------------------------
// G. Abandonner (DRAFT → CANCELLED, et COUNTED d'un OPENING/CLOSING) — A2-R6
// ---------------------------------------------------------------------------

export interface CancelStockCountParams {
  reason: string;
  cancelledByUserId: string;
}

/**
 * Abandonne un inventaire DRAFT. L'audit porte, ligne par ligne, l'attendu
 * figé et le compté ; avec au moins une ligne, l'alerte COUNT_CANCELLED naît.
 * Les lectures ne révèlent jamais ses attendus.
 */
/**
 * Arbitrage du Pilote (dérogation à A2-R6) : un inventaire d'OUVERTURE ou de
 * CLÔTURE en COUNTED s'abandonne. Ces deux natures doivent couvrir tout le
 * lieu et ne s'écartent pas (`assertSetAsideAllowed`) ; si un mouvement
 * postérieur au comptage empêche la validation
 * (`STOCK_COUNT_NEGATIVE_AFTER_MOVEMENTS`), le seul chemin est d'abandonner et
 * de recompter. L'abandon reste tracé (audit critique avec attendus et
 * comptés, alerte COUNT_CANCELLED). Un COUNTED courant (REGULAR) ne
 * s'abandonne toujours pas : il écarte ses lignes douteuses et se valide.
 */
function isCountedCancellable(count: { status: StockCountStatus; kind: StockCountKind }): boolean {
  return count.status === 'COUNTED' && (count.kind === 'OPENING' || count.kind === 'CLOSING');
}

export async function cancelStockCountTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  countId: string,
  params: CancelStockCountParams
): Promise<{ id: string; status: 'CANCELLED' }> {
  const reason = normalizeSetAsideReason(params.reason);
  await lockCountRowTx(tx, tenantId, countId);
  const count = await loadCountHeadTx(tx, tenantId, countId);
  if (!isCountedCancellable(count)) {
    assertCountStatus(count, 'DRAFT');
  }

  const lines = await tx.stockCountLine.findMany({
    where: { countId: count.id },
    select: { itemId: true, expectedQuantity: true, countedQuantity: true }
  });
  const updated = await tx.stockCount.updateMany({
    where: { id: count.id, tenantId, status: count.status },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelledByUserId: params.cancelledByUserId,
      cancelReason: reason
    }
  });
  if (updated.count !== 1) {
    throw wrongStatus("Cet inventaire vient de changer d'état : relisez-le.");
  }

  await emitCriticalAudit(
    tx,
    countAuditEntry(tenantId, count.id, params.cancelledByUserId, AuditActionKey.STOCK_COUNT_CANCELLED, {
      reason,
      locationId: count.locationId,
      lines: lines.map(line => ({
        itemId: line.itemId,
        expectedQuantity: roundQuantity(toAmountOrZero(line.expectedQuantity)),
        countedQuantity: quantityOrNull(line.countedQuantity)
      }))
    })
  );

  if (lines.length > 0) {
    await raiseStockAlertTx(tx, {
      tenantId,
      kind: 'COUNT_CANCELLED',
      severity: 'INFO',
      dedupeKey: alertKeys.countCancelled(count.id),
      siteId: count.location?.siteId ?? null,
      locationId: count.locationId,
      subjectType: 'StockCount',
      subjectId: count.id,
      details: { linesCount: lines.length }
    });
  }
  return { id: count.id, status: 'CANCELLED' };
}

// ---------------------------------------------------------------------------
// H. Valider (COUNTED → VALIDATED) — A1, A3, A4, A7-R2, B4, B7
// ---------------------------------------------------------------------------

export interface ValidateStockCountParams {
  /** Exigé seulement en dérogation (A1-R3), de 10 à 500 caractères. */
  selfValidationReason?: string | null;
}

export interface ValidatedStockCount {
  id: string;
  status: 'VALIDATED';
  selfValidated: boolean;
  slip: { id: string; number: string };
}

/** A1-R2/R3 : refus, dérogation exigeant un motif, ou validation ordinaire. */
async function resolveSelfValidationTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  count: CountRow,
  validatedByUserId: string,
  rawReason: string | null | undefined
): Promise<{ selfValidated: boolean; reason: string | null }> {
  const reason = typeof rawReason === 'string' ? rawReason.trim() : '';
  const isCounter = effectiveCounterIds(count).includes(validatedByUserId);
  if (!isCounter) {
    if (reason.length > 0) {
      throw new BadRequestError("La dérogation ne s'applique pas : vous n'avez compté aucune ligne de cet inventaire.");
    }
    return { selfValidated: false, reason: null };
  }
  // A1-R3 : la dérogation s'ouvre quand aucun AUTRE validateur actif n'est
  // resté hors du comptage — les compteurs ne peuvent pas valider (A1-R2).
  if (await hasOtherActiveCountValidator(tx, tenantId, validatedByUserId, effectiveCounterIds(count))) {
    throw stockError(
      403,
      ErrorCode.STOCK_COUNT_SELF_VALIDATION_FORBIDDEN,
      "Vous avez compté cet inventaire : une autre personne de l'agence doit le valider."
    );
  }
  if (reason.length < 10 || reason.length > 500) {
    throw stockError(
      400,
      ErrorCode.STOCK_COUNT_SELF_VALIDATION_REASON_REQUIRED,
      "Vous êtes la seule personne de l'agence à pouvoir valider : indiquez pourquoi vous validez votre propre comptage (10 à 500 caractères)."
    );
  }
  return { selfValidated: true, reason };
}

/** Les refus qui ne dépendent que des lignes : non comptées non écartées, écarts non justifiés. */
function assertLinesReadyForValidation(count: CountRow): void {
  const uncounted = count.lines.filter(line => {
    const facts = lineFacts(line);
    return facts.notCounted && !facts.setAside;
  });
  if (uncounted.length > 0) {
    throw stockError(
      409,
      ErrorCode.STOCK_COUNT_UNCOUNTED_LINES,
      "Des articles en stock n'ont pas été comptés : écartez ces lignes avec un motif avant de valider.",
      { items: uncounted.map(line => ({ itemId: line.itemId, itemLabel: itemLabelOf(line) })) }
    );
  }
  const unjustified = count.lines.filter(line => needsJustification(count.kind, line, lineFacts(line)));
  if (unjustified.length > 0) {
    throw stockError(
      409,
      ErrorCode.STOCK_COUNT_UNJUSTIFIED_VARIANCE,
      'Des écarts ne sont pas justifiés : choisissez un motif pour chacun avant de valider.',
      { items: unjustified.map(line => ({ itemId: line.itemId, itemLabel: itemLabelOf(line) })) }
    );
  }
}

/** Ce que la validation écrira pour une ligne. */
interface LinePlan {
  line: LineRow;
  facts: LineFacts;
  balance: BalanceState;
  averageUnitCost: number;
  movementsSinceCapture: number | null;
  adjustment: {
    isDecrease: boolean;
    quantity: number;
    quantityAfter: number;
    totalValue: number;
    valueAfter: number;
    unitCost: number;
    reasonCode: StockReasonCode | null;
    reason: string | null;
  } | null;
}

/** Mouvements de chaque article du lieu depuis l'heure de figeage de sa ligne (A3-R4), en une requête. */
async function countMovementsSinceCaptureTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  locationId: string,
  lines: LineRow[]
): Promise<Map<string, number>> {
  const captured = lines.filter(line => line.expectedCapturedAt);
  const result = new Map<string, number>();
  if (captured.length === 0) {
    return result;
  }
  const since = new Date(Math.min(...captured.map(line => (line.expectedCapturedAt as Date).getTime())));
  const movements = await tx.stockMovement.findMany({
    where: { tenantId, locationId, itemId: { in: captured.map(line => line.itemId) }, createdAt: { gt: since } },
    select: { itemId: true, createdAt: true }
  });
  for (const line of captured) {
    const at = (line.expectedCapturedAt as Date).getTime();
    result.set(
      line.id,
      movements.filter(movement => movement.itemId === line.itemId && movement.createdAt.getTime() > at).length
    );
  }
  return result;
}

function planAdjustment(
  kind: StockCountKind,
  line: LineRow,
  facts: LineFacts,
  balance: BalanceState,
  averageUnitCost: number
): LinePlan['adjustment'] {
  if (facts.setAside || facts.variance === null || facts.variance === 0) {
    return null;
  }
  const isDecrease = facts.variance < 0;
  const quantity = roundQuantity(Math.abs(facts.variance));
  const quantityAfter = roundQuantity(balance.quantity + facts.variance);
  const openingSurplus = isOpeningSurplus(kind, facts);
  let totalValue: number;
  let valueAfter: number;
  if (isDecrease && quantityAfter <= 0) {
    totalValue = roundMoneyXof(balance.value);
    valueAfter = 0;
  } else if (isDecrease) {
    totalValue = roundMoneyXof(quantity * averageUnitCost);
    valueAfter = Math.max(0, roundMoneyXof(balance.value - totalValue));
  } else {
    totalValue = openingSurplus ? 0 : roundMoneyXof(quantity * averageUnitCost);
    valueAfter = roundMoneyXof(balance.value + totalValue);
  }
  return {
    isDecrease,
    quantity,
    quantityAfter,
    totalValue,
    valueAfter,
    unitCost: openingSurplus ? 0 : roundQuantity(averageUnitCost),
    reasonCode: openingSurplus ? 'OPENING_BALANCE' : line.reasonCode,
    reason: line.reason ?? null
  };
}

/** Lit les soldes, prévoit les ajustements et refuse un solde négatif (A3-R3) — sans rien écrire. */
async function planValidationTx(tx: PrismaTransactionClient, tenantId: string, count: CountRow): Promise<LinePlan[]> {
  const counted = count.lines.filter(line => !lineFacts(line).notCounted);
  const balances = await readBalancesTx(
    tx,
    tenantId,
    count.locationId,
    counted.map(line => line.itemId)
  );
  const sinceCapture = await countMovementsSinceCaptureTx(tx, tenantId, count.locationId, count.lines);

  const plans = count.lines.map(line => {
    const facts = lineFacts(line);
    const balance = balances.get(line.itemId) ?? { id: null, quantity: 0, value: 0 };
    const averageUnitCost = averageUnitCostOf(balance.quantity, balance.value);
    return {
      line,
      facts,
      balance,
      averageUnitCost,
      movementsSinceCapture: line.expectedCapturedAt ? (sinceCapture.get(line.id) ?? 0) : null,
      adjustment: planAdjustment(count.kind, line, facts, balance, averageUnitCost)
    };
  });

  const negatives = plans.filter(plan => plan.adjustment && plan.adjustment.quantityAfter < 0);
  if (negatives.length > 0) {
    // Un OPENING/CLOSING ne s'écarte pas : il s'abandonne et se recompte (arbitrage du Pilote).
    const wholeLocation = count.kind === 'OPENING' || count.kind === 'CLOSING';
    throw stockError(
      409,
      ErrorCode.STOCK_COUNT_NEGATIVE_AFTER_MOVEMENTS,
      wholeLocation
        ? 'Des sorties enregistrées depuis le comptage dépassent ce qui a été compté : abandonnez cet inventaire et recomptez le lieu.'
        : 'Des sorties enregistrées depuis le comptage dépassent ce qui a été compté : écartez ces lignes et faites-les recompter.',
      { items: negatives.map(plan => ({ itemId: plan.line.itemId, itemLabel: itemLabelOf(plan.line) })) }
    );
  }
  return plans;
}

interface FrozenValues {
  countedValue: number;
  varianceValueGross: number;
  varianceValueNet: number;
  setAsideVarianceValue: number;
}

/** Valeurs figées à la validation (B8, A2-R7) ; le surplus d'ouverture vaut zéro (A7-R2). */
function computeFrozenValues(plans: LinePlan[]): FrozenValues {
  let countedValue = 0;
  let gross = 0;
  let net = 0;
  let setAside = 0;
  for (const plan of plans) {
    if (plan.facts.counted !== null) {
      countedValue += roundMoneyXof(plan.facts.counted * plan.averageUnitCost);
    }
    if (plan.adjustment) {
      gross += plan.adjustment.totalValue;
      net += plan.adjustment.isDecrease ? -plan.adjustment.totalValue : plan.adjustment.totalValue;
    }
    if (plan.facts.setAside && plan.facts.variance !== null) {
      setAside += roundMoneyXof(Math.abs(plan.facts.variance) * plan.averageUnitCost);
    }
  }
  return {
    countedValue: roundMoneyXof(countedValue),
    varianceValueGross: roundMoneyXof(gross),
    varianceValueNet: roundMoneyXof(net),
    setAsideVarianceValue: roundMoneyXof(setAside)
  };
}

/** Libellés figés du procès-verbal (B4-R3) : aucun montant. */
async function buildReportSnapshotTx(
  tx: PrismaTransactionClient,
  count: CountRow,
  counterIds: string[],
  validatedByUserId: string
): Promise<StockSlipSnapshot> {
  const users = await tx.user.findMany({
    where: { id: { in: [...new Set([...counterIds, validatedByUserId])] } },
    select: { id: true, fullName: true, email: true }
  });
  const labelOf = (id: string): string => toUserLabel(users.find(user => user.id === id));
  const validator = labelOf(validatedByUserId);
  return {
    location: count.location?.label ?? 'Lieu inconnu',
    site: count.location?.site?.name ?? null,
    taker: null,
    requestedBy: null,
    invoice: null,
    author: validator,
    lines: count.lines.map(line => ({
      itemId: line.itemId,
      reference: line.item?.reference ?? 'Article inconnu',
      label: itemLabelOf(line),
      unit: line.item?.unit ?? ''
    })),
    counters: counterIds.map(labelOf),
    validator
  };
}

/** Écrit un ajustement, son écriture si sa valeur n'est pas nulle (A6-R4), et le solde. */
async function writeAdjustmentTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  count: CountRow,
  plan: LinePlan,
  slipId: string,
  validatedByUserId: string,
  accounts: { journalId: string; stockAccountId: string; variationAccountId: string } | null
): Promise<void> {
  const adjustment = plan.adjustment!;
  const label = itemLabelOf(plan.line);
  const movement = await tx.stockMovement.create({
    data: {
      tenantId,
      type: 'ADJUSTMENT',
      itemId: plan.line.itemId,
      locationId: count.locationId,
      movementDate: count.countedAt,
      quantity: adjustment.quantity,
      isDecrease: adjustment.isDecrease,
      unitCost: adjustment.unitCost,
      totalValue: adjustment.totalValue,
      currency: DEFAULT_CURRENCY,
      quantityAfter: adjustment.quantityAfter,
      valueAfter: adjustment.valueAfter,
      stockCountId: count.id,
      slipId,
      reasonCode: adjustment.reasonCode,
      reason: adjustment.reason,
      createdByUserId: validatedByUserId
    },
    select: { id: true }
  });

  if (adjustment.totalValue > 0 && accounts) {
    const value = adjustment.totalValue;
    const lines = adjustment.isDecrease
      ? [
          { accountId: accounts.variationAccountId, debit: value, label: `Écart d'inventaire — ${label}` },
          { accountId: accounts.stockAccountId, credit: value, label: `Stock — ${label}` }
        ]
      : [
          { accountId: accounts.stockAccountId, debit: value, label: `Stock — ${label}` },
          { accountId: accounts.variationAccountId, credit: value, label: `Écart d'inventaire — ${label}` }
        ];
    const entry = await postDocumentEntryTx(tx, {
      tenantId,
      journalId: accounts.journalId,
      entryDate: count.countedAt,
      reference: `INV-${movement.id}`,
      description: `Écart d'inventaire — ${label}`,
      documentType: 'STOCK_ADJUSTMENT',
      documentId: movement.id,
      lines
    });
    await tx.stockMovement.update({ where: { id: movement.id, tenantId }, data: { journalEntryId: entry.entryId } });
  }

  await writeBalanceTx(
    tx,
    tenantId,
    plan.line.itemId,
    count.locationId,
    plan.balance,
    adjustment.quantityAfter,
    adjustment.valueAfter
  );
}

async function resolveAccountsTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  count: CountRow,
  plans: LinePlan[]
): Promise<{ journalId: string; stockAccountId: string; variationAccountId: string } | null> {
  if (!plans.some(plan => plan.adjustment && plan.adjustment.totalValue > 0)) {
    return null;
  }
  const [journalId, comptes] = await Promise.all([
    ensureOperationalJournalTx(tx, tenantId, count.countedAt.getUTCFullYear()),
    ensureOperationalChartOfAccountsTx(tx, tenantId)
  ]);
  const stockAccountId = comptes.get('311');
  const variationAccountId = comptes.get('603');
  if (!stockAccountId || !variationAccountId) {
    throw new Error('Comptes opérationnels 311 ou 603 absents après amorçage du plan de comptes.');
  }
  return { journalId, stockAccountId, variationAccountId };
}

/** Alertes de la validation (B7) : COUNT_VARIANCE, COUNT_LINE_SET_ASIDE, COUNT_SELF_VALIDATED. */
async function raiseValidationAlertsTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  count: CountRow,
  plans: LinePlan[],
  frozen: FrozenValues,
  selfValidated: boolean,
  settings: StockControlsSettingsValues
): Promise<void> {
  const common = {
    tenantId,
    currency: DEFAULT_CURRENCY,
    siteId: count.location?.siteId ?? null,
    locationId: count.locationId,
    subjectType: 'StockCount' as const,
    subjectId: count.id
  };
  const amount = roundMoneyXof(frozen.varianceValueGross + frozen.setAsideVarianceValue);
  const rate = frozen.countedValue > 0 ? amount / frozen.countedValue : null;
  const amountHit = settings.countVarianceAlertAmount !== null && amount >= settings.countVarianceAlertAmount;
  const rateHit =
    settings.countVarianceAlertPercent !== null && (rate === null || rate * 100 >= settings.countVarianceAlertPercent);
  if (amount > 0 && (amountHit || rateHit)) {
    await raiseStockAlertTx(tx, {
      ...common,
      kind: 'COUNT_VARIANCE',
      severity: 'WARNING',
      dedupeKey: alertKeys.countVariance(count.id),
      amount,
      threshold: settings.countVarianceAlertAmount,
      details: {
        countedValue: frozen.countedValue,
        rate,
        percentThreshold: settings.countVarianceAlertPercent,
        setAsideVarianceValue: frozen.setAsideVarianceValue
      }
    });
  }

  // Deux ensembles disjoints, que le message d'alerte additionne : les lignes
  // comptées puis écartées, et les lignes non comptées écartées (A2-R8).
  const setAsideLines = plans.filter(plan => plan.facts.setAside && !plan.facts.notCounted).length;
  const uncountedLines = plans.filter(plan => plan.facts.setAside && plan.facts.notCounted).length;
  if (setAsideLines + uncountedLines > 0) {
    await raiseStockAlertTx(tx, {
      ...common,
      kind: 'COUNT_LINE_SET_ASIDE',
      severity: 'INFO',
      dedupeKey: alertKeys.countLineSetAside(count.id),
      // Clés lues par les messages d'alerte (territoire API-5).
      details: { setAsideLines, uncountedLines }
    });
  }

  if (selfValidated) {
    await raiseStockAlertTx(tx, {
      ...common,
      kind: 'COUNT_SELF_VALIDATED',
      severity: 'INFO',
      dedupeKey: alertKeys.countSelfValidated(count.id)
    });
  }
}

/**
 * Valide un inventaire COUNTED. Ordre : refus sans écriture (statut, lignes
 * non comptées, dérogation, justification), verrous de solde des lignes non
 * écartées, lectures et refus d'un solde négatif, numéro PVI (verrou
 * `stock-slip`, en dernier), puis écritures, alertes et audit critique.
 */
export async function validateStockCountTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  countId: string,
  validatedByUserId: string,
  params: ValidateStockCountParams = {}
): Promise<ValidatedStockCount> {
  // Verrou de l'inventaire, puis relecture : une mise à l'écart ou une
  // justification concurrente est vue (ou attend), jamais écrasée.
  await lockCountRowTx(tx, tenantId, countId);
  const count = await loadCountRowTx(tx, tenantId, countId);
  assertCountStatus(count, 'COUNTED');
  assertLinesReadyForValidation(count);
  const self = await resolveSelfValidationTx(tx, tenantId, count, validatedByUserId, params.selfValidationReason);

  const activeLines = count.lines.filter(line => !lineFacts(line).setAside);
  await lockStockBalancesTx(
    tx,
    tenantId,
    activeLines.map(line => ({ itemId: line.itemId, locationId: count.locationId }))
  );
  const plans = await planValidationTx(tx, tenantId, count);
  const frozen = computeFrozenValues(plans);
  const settings = await readStockAlertSettings(tx, tenantId);
  const counterIds = effectiveCounterIds(count);
  const accounts = await resolveAccountsTx(tx, tenantId, count, plans);

  const slip = await createStockSlipTx(tx, {
    tenantId,
    kind: 'COUNT_REPORT',
    documentDate: count.countedAt,
    locationId: count.locationId,
    siteId: count.location?.siteId ?? null,
    stockCountId: count.id,
    createdByUserId: validatedByUserId,
    snapshot: await buildReportSnapshotTx(tx, count, counterIds, validatedByUserId)
  });

  for (const plan of plans) {
    if (plan.adjustment) {
      await writeAdjustmentTx(tx, tenantId, count, plan, slip.id, validatedByUserId, accounts);
    }
    await tx.stockCountLine.update({
      where: { id: plan.line.id },
      data: {
        unitCostAtValidation: plan.facts.notCounted ? null : roundQuantity(plan.averageUnitCost),
        movementsSinceCapture: plan.movementsSinceCapture
      }
    });
  }

  const validatedAt = new Date();
  const updated = await tx.stockCount.updateMany({
    where: { id: count.id, tenantId, status: 'COUNTED' },
    data: {
      status: 'VALIDATED',
      validatedAt,
      validatedByUserId,
      selfValidated: self.selfValidated,
      selfValidationReason: self.reason,
      ...frozen
    }
  });
  if (updated.count !== 1) {
    throw wrongStatus("Cet inventaire vient de changer d'état : relisez-le.");
  }

  await raiseValidationAlertsTx(tx, tenantId, count, plans, frozen, self.selfValidated, settings);
  await emitCriticalAudit(
    tx,
    countAuditEntry(tenantId, count.id, validatedByUserId, AuditActionKey.STOCK_COUNT_VALIDATED, {
      slipNumber: slip.number,
      kind: count.kind,
      locationId: count.locationId,
      adjustmentsCount: plans.filter(plan => plan.adjustment).length,
      setAsideCount: plans.filter(plan => plan.facts.setAside).length,
      uncountedCount: plans.filter(plan => plan.facts.notCounted).length,
      counterUserIds: counterIds,
      selfValidated: self.selfValidated,
      ...frozen
    })
  );
  if (self.selfValidated) {
    await emitCriticalAudit(
      tx,
      countAuditEntry(tenantId, count.id, validatedByUserId, AuditActionKey.STOCK_COUNT_SELF_VALIDATED, {
        reason: self.reason,
        slipNumber: slip.number
      })
    );
  }

  return { id: count.id, status: 'VALIDATED', selfValidated: self.selfValidated, slip };
}

// ---------------------------------------------------------------------------
// I. Les vues (contrat `CountView`, `CountLineView`)
// ---------------------------------------------------------------------------

interface LineViewContext {
  status: StockCountStatus;
  kind: StockCountKind;
  valuesVisible: boolean;
  /** Coût moyen courant de l'article au lieu (estimation en COUNTED). */
  averageCost: (itemId: string) => number;
}

/** Contexte d'une ligne rendue à l'aveugle (réponse d'une saisie en DRAFT). */
function blindLineContext(): LineViewContext {
  return { status: 'DRAFT', kind: 'REGULAR', valuesVisible: false, averageCost: () => 0 };
}

function isBlindStatus(status: StockCountStatus): boolean {
  return status === 'DRAFT' || status === 'CANCELLED';
}

/**
 * Valeur d'écart d'une ligne : figée en VALIDATED, estimée en COUNTED, `null`
 * sinon. Une ligne VALIDÉE sans coût figé (inventaire validé avant le lot 040)
 * vaut `null` : la recalculer au coût moyen d'aujourd'hui inventerait une
 * valeur que personne n'a validée.
 */
function lineVarianceValue(line: LineRow, facts: LineFacts, ctx: LineViewContext): number | null {
  if (isBlindStatus(ctx.status) || facts.variance === null) {
    return null;
  }
  if (isOpeningSurplus(ctx.kind, facts)) {
    return 0;
  }
  if (ctx.status === 'VALIDATED') {
    const frozen = toAmount(line.unitCostAtValidation as Decimalish);
    return frozen === null ? null : roundMoneyXof(facts.variance * frozen);
  }
  return roundMoneyXof(facts.variance * ctx.averageCost(line.itemId));
}

function toLineView(line: LineRow, ctx: LineViewContext): CountLineView {
  const facts = lineFacts(line);
  const blind = isBlindStatus(ctx.status);
  const validated = ctx.status === 'VALIDATED';
  const varianceValue = lineVarianceValue(line, facts, ctx);
  return {
    id: line.id,
    itemId: line.itemId,
    itemReference: line.item?.reference ?? 'Article inconnu',
    itemLabel: itemLabelOf(line),
    itemUnit: line.item?.unit ?? '',
    countedQuantity: facts.counted,
    notCounted: facts.notCounted,
    countedBlind: line.countedBlind ?? null,
    countedByUserId: line.countedByUserId ?? null,
    countedByLabel: toNullableUserLabel(line.countedBy),
    countedAtServer: line.countedAtServer ?? null,
    expectedQuantity: blind ? null : facts.expected,
    variance: blind ? null : facts.variance,
    varianceValue: ctx.valuesVisible ? varianceValue : null,
    unitCostAtValidation:
      validated && ctx.valuesVisible ? quantityOrNull(line.unitCostAtValidation as Decimalish) : null,
    reasonCode: line.reasonCode ?? null,
    reason: line.reason ?? null,
    justified: !blind && hasJustification(ctx.kind, line, facts),
    justifiedByLabel: toNullableUserLabel(line.justifiedBy),
    justifiedAt: line.justifiedAt ?? null,
    setAside: line.setAsideAt
      ? { at: line.setAsideAt, byLabel: toUserLabel(line.setAsideBy), reason: line.setAsideReason ?? '' }
      : null,
    movementsSinceCapture: validated ? (line.movementsSinceCapture ?? null) : null,
    attachmentsCount: line._count?.attachments ?? 0
  };
}

/** Ce qu'il faut lire en plus des lignes pour rendre une liste d'inventaires. */
interface ViewExtras {
  averageCosts: Map<string, number>;
  users: Map<string, string>;
  toRecount: Map<string, Array<{ itemId: string; itemLabel: string }>>;
  /** Par inventaire COUNTED : existe-t-il un autre validateur actif qui n'a pas compté ? */
  otherValidatorExists: Map<string, boolean>;
}

function costKey(locationId: string, itemId: string): string {
  return `${locationId}|${itemId}`;
}

async function loadViewExtras(tenantId: string, rows: CountRow[], ctx: StockCallerContext): Promise<ViewExtras> {
  const counted = rows.filter(row => row.status === 'COUNTED' || row.status === 'VALIDATED');
  const open = rows.filter(row => row.status === 'DRAFT' || row.status === 'COUNTED');
  const itemIds = [...new Set(counted.flatMap(row => row.lines.map(line => line.itemId)))];
  const locationIds = [...new Set(counted.map(row => row.locationId))];
  const userIds = [...new Set(rows.flatMap(row => effectiveCounterIds(row)))];

  const [balances, users, recount, otherValidator] = await Promise.all([
    itemIds.length
      ? prisma.stockBalance.findMany({
          where: { tenantId, locationId: { in: locationIds }, itemId: { in: itemIds } },
          select: { itemId: true, locationId: true, quantity: true, value: true }
        })
      : Promise.resolve([]),
    userIds.length
      ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, email: true } })
      : Promise.resolve([]),
    loadItemsToRecount(
      prisma,
      tenantId,
      open.map(row => row.locationId)
    ),
    Promise.all(
      rows
        .filter(row => row.status === 'COUNTED')
        .map(
          async row =>
            [
              row.id,
              await hasOtherActiveCountValidator(prisma, tenantId, ctx.userId, effectiveCounterIds(row))
            ] as const
        )
    )
  ]);

  const averageCosts = new Map<string, number>();
  for (const balance of balances) {
    averageCosts.set(
      costKey(balance.locationId, balance.itemId),
      averageUnitCostOf(roundQuantity(toAmountOrZero(balance.quantity)), roundMoneyXof(toAmountOrZero(balance.value)))
    );
  }
  const toRecount = new Map<string, Array<{ itemId: string; itemLabel: string }>>();
  for (const [locationId, items] of recount) {
    toRecount.set(
      locationId,
      items.map(item => ({ itemId: item.itemId, itemLabel: item.itemLabel }))
    );
  }
  return {
    averageCosts,
    users: new Map(users.map(user => [user.id, toUserLabel(user)])),
    toRecount,
    otherValidatorExists: new Map(otherValidator)
  };
}

function toSlipSummary(slip: CountRow['slip']): SlipSummary | null {
  if (!slip) {
    return null;
  }
  return {
    id: slip.id,
    kind: slip.kind,
    number: formatSlipNumber(slip.kind, slip.year, slip.number),
    documentDate: slip.documentDate,
    createdAt: slip.createdAt
  };
}

/**
 * Totaux de valeur d'un inventaire : figés en VALIDATED, estimés en COUNTED,
 * `null` à l'aveugle — et `null` pour un inventaire validé avant le lot 040,
 * dont rien n'a été figé (aucun recalcul au coût moyen courant).
 */
function countValues(
  row: CountRow,
  lines: CountLineView[],
  ctx: StockCallerContext
): Pick<CountView, 'countedValue' | 'varianceValueGross' | 'varianceValueNet' | 'setAsideVarianceValue'> {
  const none = { countedValue: null, varianceValueGross: null, varianceValueNet: null, setAsideVarianceValue: null };
  if (isBlindStatus(row.status) || !ctx.valuesVisible) {
    return none;
  }
  const frozenNet = toAmount(row.varianceValueNet as Decimalish);
  const estimate = roundMoneyXof(
    lines.filter(line => !line.setAside).reduce((sum, line) => sum + (line.varianceValue ?? 0), 0)
  );
  if (row.status === 'VALIDATED') {
    if (frozenNet === null) {
      return none;
    }
    return {
      countedValue: maskValue(toAmount(row.countedValue as Decimalish), ctx),
      varianceValueGross: maskValue(toAmount(row.varianceValueGross as Decimalish), ctx),
      varianceValueNet: frozenNet,
      setAsideVarianceValue: maskValue(toAmount(row.setAsideVarianceValue as Decimalish), ctx)
    };
  }
  return { ...none, varianceValueNet: estimate };
}

function toCountView(row: CountRow, extras: ViewExtras, ctx: StockCallerContext, withLines: boolean): CountView {
  const lineCtx: LineViewContext = {
    status: row.status,
    kind: row.kind,
    valuesVisible: ctx.valuesVisible,
    averageCost: itemId => extras.averageCosts.get(costKey(row.locationId, itemId)) ?? 0
  };
  const lines = row.lines
    .map(line => toLineView(line, lineCtx))
    .sort((a, b) => a.itemReference.localeCompare(b.itemReference) || a.itemLabel.localeCompare(b.itemLabel));
  const blind = isBlindStatus(row.status);
  const counterIds = effectiveCounterIds(row);
  const open = row.status === 'DRAFT' || row.status === 'COUNTED';

  return {
    id: row.id,
    tenantId: row.tenantId,
    locationId: row.locationId,
    locationLabel: row.location?.label ?? 'Lieu inconnu',
    kind: row.kind,
    status: row.status,
    blind,
    countedAt: row.countedAt,
    createdByUserId: row.createdByUserId,
    createdByLabel: toUserLabel(row.createdBy),
    closedAt: row.closedAt ?? null,
    closedByLabel: toNullableUserLabel(row.closedBy),
    validatedAt: row.validatedAt ?? null,
    validatedByLabel: toNullableUserLabel(row.validatedBy),
    cancelledAt: row.cancelledAt ?? null,
    cancelReason: row.cancelReason ?? null,
    selfValidated: row.selfValidated === true,
    selfValidationReason: row.selfValidationReason ?? null,
    counters: counterIds.map(userId => ({ userId, label: extras.users.get(userId) ?? 'Utilisateur inconnu' })),
    lines: withLines ? lines : [],
    linesCount: lines.length,
    uncountedLinesCount: lines.filter(line => line.notCounted).length,
    varianceCount: blind ? null : lines.filter(line => line.variance !== null && line.variance !== 0).length,
    ...countValues(row, lines, ctx),
    currency: DEFAULT_CURRENCY,
    slip: toSlipSummary(row.slip),
    validation:
      row.status === 'COUNTED'
        ? {
            callerIsCounter: counterIds.includes(ctx.userId),
            selfValidationAllowed: extras.otherValidatorExists.get(row.id) === false
          }
        : null,
    toRecount: open ? (extras.toRecount.get(row.locationId) ?? []) : []
  };
}

/** Le détail d'un inventaire, masqué pour l'appelant (A2-R2, §8.1). */
export async function getStockCountView(
  tenantId: string,
  countId: string,
  ctx: StockCallerContext
): Promise<CountView> {
  const row = await loadCountRowTx(prisma, tenantId, countId);
  const extras = await loadViewExtras(tenantId, [row], ctx);
  return toCountView(row, extras, ctx, true);
}

export interface ListStockCountsFilters {
  locationId?: string;
  status?: StockCountStatus;
  kind?: StockCountKind;
  /** Faux par défaut : chaque inventaire est rendu avec `lines = []`. */
  withLines?: boolean;
}

/** La liste des inventaires, le plus récent en tête ; lignes rendues seulement sur demande. */
export async function listStockCountViews(
  tenantId: string,
  ctx: StockCallerContext,
  filters: ListStockCountsFilters = {}
): Promise<CountView[]> {
  const rows = (await prisma.stockCount.findMany({
    where: {
      tenantId,
      ...(filters.locationId ? { locationId: filters.locationId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.kind ? { kind: filters.kind } : {})
    },
    select: COUNT_SELECT,
    orderBy: [{ countedAt: 'desc' }, { createdAt: 'desc' }]
  })) as unknown as CountRow[];
  const extras = await loadViewExtras(tenantId, rows, ctx);
  return rows.map(row => toCountView(row, extras, ctx, filters.withLines === true));
}

/**
 * Une ligne rendue comme la réponse de sa saisie (rejeu idempotent, B3-R2) :
 * relue dans l'agence, rendue selon l'état ACTUEL de son inventaire.
 */
export async function getStockCountLineView(
  tenantId: string,
  lineId: string,
  ctx: StockCallerContext
): Promise<CountLineView> {
  const row = await prisma.stockCountLine.findFirst({
    where: { id: lineId, count: { tenantId } },
    select: { ...LINE_SELECT, count: { select: { status: true, kind: true, locationId: true } } }
  });
  if (!row) {
    throw new NotFoundError('Ligne d’inventaire introuvable.');
  }
  const line = row as unknown as LineRow & {
    count: { status: StockCountStatus; kind: StockCountKind; locationId: string };
  };
  const balance = await readBalanceTx(prisma, tenantId, line.itemId, line.count.locationId);
  return toLineView(line, {
    status: line.count.status,
    kind: line.count.kind,
    valuesVisible: ctx.valuesVisible,
    averageCost: () => averageUnitCostOf(balance.quantity, balance.value)
  });
}
