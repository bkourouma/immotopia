/**
 * Aides transverses du contrôle du stock — lot 040 (plan.md §3.3).
 *
 * Écrites par l'étape des fondations ; tous les territoires du stock codent
 * contre ces signatures. Elles ne portent aucune règle propre à une
 * opération : seulement ce que plusieurs opérations partagent — qui est
 * l'appelant, ce qu'on lui masque, les bornes de date, les verrous, les motifs
 * et l'idempotence.
 *
 * ---------------------------------------------------------------------------
 * Ordre des verrous (A10-R2), toujours le même
 * ---------------------------------------------------------------------------
 *
 *   0. la clé d'idempotence (`claimClientRequestTx`) : PREMIÈRE écriture ;
 *   1. le verrou de chantier `stock-site` (`lockStockSiteTx`), quand
 *      l'opération fait entrer de la marchandise sur le lieu d'un chantier ou
 *      clôture un chantier ;
 *   1 bis. le verrou de facture `stock-invoice` (`lockStockInvoiceTx`), par la
 *      réception et le retour fournisseur : il sérialise le plafond « reçu −
 *      déjà retourné » (A6) et les contrôles de réception (A8-R2), qui
 *      cumulent sur TOUS les lieux de la facture ;
 *   1 ter. le verrou de cumul mensuel des rebuts `stock-scrap-month`
 *      (`lockStockScrapMonthTx`), par le rebut : il sérialise la lecture du
 *      cumul du mois du lieu (B7-R1, A6-R6) ;
 *   2. les verrous de solde `stock-balance` (`lockStockBalancesTx`), triés ;
 *   3. le verrou de numérotation `stock-slip`, pris par `createStockSlipTx`
 *      (`stock-bons.ts`), en dernier.
 *
 * Une opération ne prend jamais à la fois `stock-invoice` et
 * `stock-scrap-month` : leur ordre relatif est sans objet.
 *
 * Aucun verrou après une écriture de solde. Les verrous passent par
 * `$executeRaw` et non `$queryRaw` : `pg_advisory_xact_lock` renvoie `void`,
 * que le désérialiseur de `$queryRaw` ne sait pas lire (`cash.ts`).
 *
 * ---------------------------------------------------------------------------
 * Masquage (spec §8.1, §8.2)
 * ---------------------------------------------------------------------------
 *
 * Sans STOCK_VALUES_VIEW, tout champ de valeur vaut `null`. Sur un lieu « en
 * comptage » (inventaire DRAFT), un appelant sans STOCK_COUNT_VALIDATE ne
 * reçoit ni la quantité d'un solde ni aucun champ dont elle se déduit en une
 * opération, quelles que soient ses autres permissions. Les routes
 * d'inventaire appliquent leur propre aveugle (A2-R2), pour tous.
 */

import { createHash } from 'crypto';

import { prisma } from '../../utils/database';
import type { PrismaTransactionClient } from '../../utils/database';
import { AppError, ErrorCode } from '../../middleware/error-middleware';
import type { StockErrorCode } from '../../middleware/error-middleware';
import { getUserPermissions } from '../../services/permission-service';
import {
  COUNT_REASON_CODES,
  SCRAP_REASON_CODES,
  SUPPLIER_RETURN_REASON_CODES,
  TRANSFER_REASON_CODES
} from './types-040-controle';
import type {
  BalanceView,
  ItemToRecount,
  MovementView,
  PrismaLike,
  StockCallerContext,
  StockClientOperation,
  StockMeta,
  StockReasonCode,
  StockReasonCodesByContext,
  StockReasonContext
} from './types-040-controle';

// ---------------------------------------------------------------------------
// Erreurs typées
// ---------------------------------------------------------------------------

/**
 * Une erreur métier du stock : `AppError` avec un code stable et, si utile,
 * `data` (spec §8.3). Jamais `lib/errors.conflict(message, details)`, dont les
 * détails ne parviennent pas au client. Le message est en français : le
 * middleware central le traduit par `t()` selon la langue de la requête.
 */
export function stockError(status: number, code: StockErrorCode, message: string, data?: unknown): AppError {
  return new AppError(message, status, code, undefined, data);
}

// ---------------------------------------------------------------------------
// Réglages de contrôle : défauts uniques
// ---------------------------------------------------------------------------

/**
 * Défauts des réglages de contrôle (data-model §2.2). Les mêmes que les
 * défauts SQL de `stock_settings` : l'alerte de caisse (A9) les applique en
 * mémoire sans jamais créer de ligne.
 */
export const STOCK_CONTROLS_DEFAULTS = {
  backdatingLimitDays: 7,
  requireTaker: false,
  issueAlertAmount: 500000,
  countVarianceAlertAmount: 100000,
  countVarianceAlertPercent: 5,
  cashMaterialAlertAmount: 100000,
  materialCostCategoryIds: [] as readonly string[]
} as const;

// ---------------------------------------------------------------------------
// L'appelant
// ---------------------------------------------------------------------------

/**
 * Le contexte de l'appelant, depuis ses permissions dans l'agence.
 *
 * Passe par `getUserPermissions` (cache de 5 minutes par instance, B1-R6) :
 * c'est le droit de l'APPELANT, pour ce qu'il voit et fait lui-même. Un
 * contrôle qui porte sur d'autres utilisateurs (dérogation A1-R3) lit la base.
 */
export async function resolveStockCallerContext(userId: string, tenantId: string): Promise<StockCallerContext> {
  const permissions = new Set(await getUserPermissions(userId, tenantId));
  return {
    userId,
    valuesVisible: permissions.has('STOCK_VALUES_VIEW'),
    canValidateCount: permissions.has('STOCK_COUNT_VALIDATE'),
    canReceive: permissions.has('STOCK_RECEIVE'),
    canIssue: permissions.has('STOCK_ISSUE'),
    canTransfer: permissions.has('STOCK_TRANSFER'),
    canCount: permissions.has('STOCK_COUNT'),
    canDispose: permissions.has('STOCK_DISPOSE'),
    canManageTakers: permissions.has('STOCK_TAKERS_MANAGE'),
    canViewAlerts: permissions.has('STOCK_ALERTS_VIEW'),
    canManageSettings: permissions.has('FINANCE_SETTINGS_MANAGE')
  };
}

/**
 * Les lieux « en comptage » masqués pour l'appelant (spec §8.2) : vide pour un
 * détenteur de STOCK_COUNT_VALIDATE ; sinon les lieux qui portent un
 * inventaire DRAFT. Un inventaire COUNTED a révélé ses écarts : il n'aveugle
 * plus rien.
 */
export async function loadBlindLocationIds(
  db: PrismaLike,
  tenantId: string,
  ctx: StockCallerContext
): Promise<Set<string>> {
  if (ctx.canValidateCount) {
    return new Set();
  }
  const rows = await db.stockCount.findMany({
    where: { tenantId, status: 'DRAFT' },
    select: { locationId: true }
  });
  return new Set(rows.map(row => row.locationId));
}

/** Le `meta` d'une réponse du stock (contrat `Meta`). `nextCursor` seulement s'il est fourni. */
export function buildStockMeta(ctx: StockCallerContext, blind: Set<string>, nextCursor?: string | null): StockMeta {
  return {
    valuesVisible: ctx.valuesVisible,
    blindLocationIds: [...blind].sort(),
    ...(nextCursor !== undefined ? { nextCursor } : {})
  };
}

/** Une valeur, ou `null` sans STOCK_VALUES_VIEW (spec §8.1). */
export function maskValue<T extends number | null>(v: T, ctx: StockCallerContext): number | null {
  return ctx.valuesVisible ? v : null;
}

/**
 * Un mouvement, masqué pour l'appelant. Valeurs (§8.1) : `unitCost`,
 * `totalValue`, `valueAfter`, `supplierCreditValue`, `valuationSource`. Lieu en
 * comptage (§8.2) : `quantityAfter`, `valueAfter`, `unitCost`. `quantity` (la
 * quantité déplacée) reste visible : limite assumée (spec §3.3).
 */
export function maskMovementView(v: MovementView, ctx: StockCallerContext, blind: Set<string>): MovementView {
  const isBlind = blind.has(v.locationId);
  return {
    ...v,
    unitCost: isBlind ? null : maskValue(v.unitCost, ctx),
    totalValue: maskValue(v.totalValue, ctx),
    quantityAfter: isBlind ? null : v.quantityAfter,
    valueAfter: isBlind ? null : maskValue(v.valueAfter, ctx),
    supplierCreditValue: maskValue(v.supplierCreditValue, ctx),
    valuationSource: ctx.valuesVisible ? v.valuationSource : null
  };
}

/** Un solde, masqué pour l'appelant : valeurs (§8.1), puis aveugle (§8.2). */
export function maskBalanceView(v: BalanceView, ctx: StockCallerContext, blind: Set<string>): BalanceView {
  const isBlind = blind.has(v.locationId);
  return {
    ...v,
    quantity: isBlind ? null : v.quantity,
    value: isBlind ? null : maskValue(v.value, ctx),
    averageUnitCost: isBlind ? null : maskValue(v.averageUnitCost, ctx)
  };
}

// ---------------------------------------------------------------------------
// Dates (A5-R4, A5-R5)
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

/** Numéro du jour UTC (l'heure légale de la Côte d'Ivoire). */
function utcDayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / DAY_MS);
}

/**
 * Borne la date déclarée d'un mouvement ou d'un inventaire : pas après le jour
 * courant (`400 STOCK_DATE_IN_FUTURE`), pas plus de `backdatingLimitDays`
 * jours avant (`400 STOCK_DATE_TOO_OLD`). Comparaison au jour UTC.
 */
export function assertMovementDateAllowed(date: Date, backdatingLimitDays: number, now: Date = new Date()): void {
  const day = utcDayNumber(date);
  const today = utcDayNumber(now);
  if (day > today) {
    throw stockError(400, ErrorCode.STOCK_DATE_IN_FUTURE, "La date ne peut pas dépasser aujourd'hui.", {
      field: 'date'
    });
  }
  if (today - day > backdatingLimitDays) {
    throw stockError(400, ErrorCode.STOCK_DATE_TOO_OLD, "Cette date est trop ancienne pour le réglage de l'agence.", {
      field: 'date',
      backdatingLimitDays
    });
  }
}

/** Délai de saisie : jour(createdAt) − jour(movementDate), entier ≥ 0, calculé (A5-R5). */
export function entryLagDays(createdAt: Date, movementDate: Date): number {
  return Math.max(0, utcDayNumber(createdAt) - utcDayNumber(movementDate));
}

// ---------------------------------------------------------------------------
// Verrous (A10, A7-R3 bis)
// ---------------------------------------------------------------------------

/**
 * Verrou de chantier : `pg_advisory_xact_lock(hashtext('stock-site'),
 * hashtext(siteId))`. Pris avant de vérifier que le chantier est ouvert, par
 * la clôture, la réception sur le lieu d'un chantier et le transfert vers lui.
 */
export async function lockStockSiteTx(tx: PrismaTransactionClient, siteId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('stock-site'), hashtext(${siteId}))`;
}

/**
 * Verrou de facture fournisseur : `pg_advisory_xact_lock(hashtext('stock-invoice'),
 * hashtext(tenantId || ':' || invoiceId))`. Pris par la réception et le retour
 * fournisseur APRÈS `stock-site` et AVANT les verrous de solde (A10-R2) : les
 * verrous de solde ne couvrent qu'un couple (article, lieu), alors que le
 * plafond « reçu − déjà retourné » et les contrôles `RECEIPT_REPEATED` /
 * `RECEIPT_OVER_INVOICE` cumulent sur tous les lieux de la facture. Deux
 * retours (ou deux réceptions) simultanés de la même facture passent ainsi
 * l'un après l'autre et le second lit ce que le premier a écrit.
 */
export async function lockStockInvoiceTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  invoiceId: string
): Promise<void> {
  const key = `${tenantId}:${invoiceId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('stock-invoice'), hashtext(${key}))`;
}

/**
 * Verrou du cumul mensuel des rebuts d'un lieu :
 * `pg_advisory_xact_lock(hashtext('stock-scrap-month'), hashtext(tenantId || ':' || locationId || ':' || yyyyMm))`.
 * Pris par le rebut AVANT les verrous de solde (A10-R2) : deux rebuts
 * simultanés d'articles différents sur le même lieu ne partagent aucun verrou
 * de solde, et chacun manquerait le rebut de l'autre dans le cumul du mois.
 */
export async function lockStockScrapMonthTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  locationId: string,
  yyyyMm: string
): Promise<void> {
  const key = `${tenantId}:${locationId}:${yyyyMm}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('stock-scrap-month'), hashtext(${key}))`;
}

/** La clé d'un verrou de solde : `tenantId:itemId:locationId`. */
export function stockBalanceLockKey(tenantId: string, itemId: string, locationId: string): string {
  return `${tenantId}:${itemId}:${locationId}`;
}

/**
 * Verrous de solde, un par couple (article, lieu) DISTINCT, pris dans l'ordre
 * lexicographique de leur clé (A10-R2) : deux opérations qui touchent les mêmes
 * couples les prennent dans le même ordre et ne s'interbloquent jamais. Pris
 * AVANT toute lecture de solde ; en séquence, jamais en parallèle.
 */
export async function lockStockBalancesTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  pairs: Array<{ itemId: string; locationId: string }>
): Promise<void> {
  const keys = [...new Set(pairs.map(pair => stockBalanceLockKey(tenantId, pair.itemId, pair.locationId)))].sort();
  for (const key of keys) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('stock-balance'), hashtext(${key}))`;
  }
}

// ---------------------------------------------------------------------------
// Motifs (spec §4, A4, A6, A11)
// ---------------------------------------------------------------------------

/** Les motifs permis par contexte, sous les clés du contrat (`FieldContext.reasonCodes`). */
export const REASON_CODES_BY_CONTEXT: Record<'count' | 'scrap' | 'supplierReturn' | 'transfer', StockReasonCode[]> = {
  count: [...COUNT_REASON_CODES],
  scrap: [...SCRAP_REASON_CODES],
  supplierReturn: [...SUPPLIER_RETURN_REASON_CODES],
  transfer: [...TRANSFER_REASON_CODES]
};

/** Une copie des quatre listes, à rendre dans une réponse sans exposer l'objet partagé. */
export function reasonCodesForResponse(): StockReasonCodesByContext {
  return {
    count: [...REASON_CODES_BY_CONTEXT.count],
    scrap: [...REASON_CODES_BY_CONTEXT.scrap],
    supplierReturn: [...REASON_CODES_BY_CONTEXT.supplierReturn],
    transfer: [...REASON_CODES_BY_CONTEXT.transfer]
  };
}

const CONTEXT_KEY: Record<StockReasonContext, keyof typeof REASON_CODES_BY_CONTEXT> = {
  COUNT: 'count',
  SCRAP: 'scrap',
  SUPPLIER_RETURN: 'supplierReturn',
  TRANSFER: 'transfer'
};

/**
 * Vérifie un motif pour son contexte : hors de la liste fermée,
 * `400 STOCK_REASON_NOT_ALLOWED` ; `OTHER` sans précision,
 * `400 STOCK_REASON_REQUIRED`. `OPENING_BALANCE` n'est jamais permis : le
 * système le pose seul (A7-R2).
 */
export function assertReasonForContext(
  context: StockReasonContext,
  reasonCode: StockReasonCode,
  reason?: string | null
): void {
  const allowed = REASON_CODES_BY_CONTEXT[CONTEXT_KEY[context]];
  if (!allowed.includes(reasonCode)) {
    throw stockError(400, ErrorCode.STOCK_REASON_NOT_ALLOWED, "Ce motif n'est pas permis pour cette opération.", {
      field: 'reasonCode'
    });
  }
  if (reasonCode === 'OTHER' && !(typeof reason === 'string' && reason.trim().length > 0)) {
    throw stockError(400, ErrorCode.STOCK_REASON_REQUIRED, 'Précisez le motif : il est obligatoire pour « Autre ».', {
      field: 'reason'
    });
  }
}

// ---------------------------------------------------------------------------
// Idempotence (B3-R2)
// ---------------------------------------------------------------------------

/** Forme canonique : clés triées, `undefined` omis, dates en ISO. */
function canonicalize(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(entry => (entry === undefined ? null : canonicalize(entry)));
  }
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] !== undefined) {
        result[key] = canonicalize(source[key]);
      }
    }
    return result;
  }
  return value;
}

/**
 * Empreinte SHA-256 (hexadécimale) du corps canonique d'une écriture, SANS
 * `clientRequestId` : deux envois du même corps donnent la même empreinte,
 * quel que soit l'ordre des clés.
 */
export function hashRequestBody(body: unknown): string {
  let subject: unknown = body;
  if (body !== null && typeof body === 'object' && !Array.isArray(body) && !(body instanceof Date)) {
    const { clientRequestId: _omitted, ...rest } = body as Record<string, unknown>;
    void _omitted;
    subject = rest;
  }
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(subject) ?? null))
    .digest('hex');
}

/**
 * Réclame une clé d'idempotence : PREMIÈRE écriture de la transaction de
 * l'opération. Un rejeu concurrent échoue ici sur l'unicité
 * `(tenantId, clientRequestId)` (`P2002`, voir `isUniqueViolation`) ; sa
 * transaction est annulée et le contrôleur relit la clé
 * (`findClientRequestReplay`). Renvoie l'identifiant de la clé.
 */
export async function claimClientRequestTx(
  tx: PrismaTransactionClient,
  input: {
    tenantId: string;
    clientRequestId: string;
    operation: StockClientOperation;
    bodyHash: string;
    userId: string;
  }
): Promise<string> {
  const created = await tx.stockClientRequest.create({
    data: {
      tenantId: input.tenantId,
      clientRequestId: input.clientRequestId,
      operation: input.operation,
      bodyHash: input.bodyHash,
      createdByUserId: input.userId
    },
    select: { id: true }
  });
  return created.id;
}

/**
 * Inscrit le résultat sur la clé, en fin de transaction. Mise à jour par
 * l'identifiant de la clé réclamée DANS cette même transaction : écrite en
 * SQL, parce que la garde Prisma exige l'agence dans tout `where` et que la
 * signature du contrat (§3.3) ne la porte pas — l'identifiant vient de
 * `claimClientRequestTx`, jamais d'une requête.
 *
 * `tenantId` (facultatif, pour ne pas casser les appelants existants) ajoute
 * `AND "tenant_id" = tenantId` : défense en profondeur, une clé d'une autre
 * agence n'est jamais touchée. Tout nouvel appelant le passe.
 */
export async function completeClientRequestTx(
  tx: PrismaTransactionClient,
  keyId: string,
  resultType: string,
  resultId: string,
  tenantId?: string
): Promise<void> {
  if (tenantId !== undefined) {
    await tx.$executeRaw`UPDATE "stock_client_requests" SET "result_type" = ${resultType}, "result_id" = ${resultId} WHERE "id" = ${keyId}::uuid AND "tenant_id" = ${tenantId}`;
    return;
  }
  await tx.$executeRaw`UPDATE "stock_client_requests" SET "result_type" = ${resultType}, "result_id" = ${resultId} WHERE "id" = ${keyId}::uuid`;
}

/**
 * Relit une clé d'idempotence avant (ou après l'échec d') une écriture :
 * `null` si elle n'existe pas ; le résultat d'origine si même utilisateur,
 * même corps et même opération ; `409 STOCK_IDEMPOTENCY_MISMATCH` si
 * l'empreinte, l'utilisateur ou l'opération diffèrent — la même clé envoyée
 * à une autre route ne rejoue jamais le résultat d'une autre opération.
 * `operation` est facultatif pour ne pas casser les appelants existants ;
 * tout nouvel appelant le passe. Le contrôleur relit ensuite le résultat et
 * le MASQUE pour l'appelant (§8.1, §8.2 à l'instant du rejeu).
 */
export async function findClientRequestReplay(
  tenantId: string,
  clientRequestId: string,
  userId: string,
  bodyHash: string,
  operation?: StockClientOperation
): Promise<{ resultType: string; resultId: string } | null> {
  const row = await prisma.stockClientRequest.findFirst({
    where: { tenantId, clientRequestId },
    select: { operation: true, bodyHash: true, createdByUserId: true, resultType: true, resultId: true }
  });
  if (!row) {
    return null;
  }
  const operationDiffers = operation !== undefined && row.operation !== operation;
  if (
    operationDiffers ||
    row.createdByUserId !== userId ||
    row.bodyHash !== bodyHash ||
    !row.resultType ||
    !row.resultId
  ) {
    throw stockError(
      409,
      ErrorCode.STOCK_IDEMPOTENCY_MISMATCH,
      "Cette opération a déjà été envoyée avec d'autres données. Vérifiez le journal avant de recommencer."
    );
  }
  return { resultType: row.resultType, resultId: row.resultId };
}

/** Vrai pour une violation d'unicité Prisma (`P2002`), par exemple un rejeu concurrent d'une clé. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2002'
  );
}

// ---------------------------------------------------------------------------
// Articles à recompter (A2-R7, A2-R8) et inventaire d'ouverture (A7-R1)
// ---------------------------------------------------------------------------

/**
 * Pour chaque lieu demandé, les articles écartés (ou non comptés, puis
 * écartés) au DERNIER inventaire validé du lieu : ils restent « à recompter »
 * tant qu'aucun inventaire validé postérieur ne les a comptés — par
 * construction, le dernier validé est le plus récent. Deux requêtes, jamais
 * une par lieu.
 */
export async function loadItemsToRecount(
  db: PrismaLike,
  tenantId: string,
  locationIds: string[]
): Promise<Map<string, ItemToRecount[]>> {
  const result = new Map<string, ItemToRecount[]>();
  const uniqueIds = [...new Set(locationIds)];
  if (uniqueIds.length === 0) {
    return result;
  }

  const counts = await db.stockCount.findMany({
    where: { tenantId, locationId: { in: uniqueIds }, status: 'VALIDATED' },
    orderBy: [{ validatedAt: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, locationId: true }
  });
  const lastCountByLocation = new Map<string, string>();
  for (const count of counts) {
    if (!lastCountByLocation.has(count.locationId)) {
      lastCountByLocation.set(count.locationId, count.id);
    }
  }
  if (lastCountByLocation.size === 0) {
    return result;
  }

  const locationByCount = new Map([...lastCountByLocation].map(([locationId, countId]) => [countId, locationId]));
  const lines = await db.stockCountLine.findMany({
    where: { countId: { in: [...locationByCount.keys()] }, setAsideAt: { not: null } },
    select: { countId: true, itemId: true, setAsideAt: true, item: { select: { label: true } } },
    orderBy: { setAsideAt: 'asc' }
  });
  for (const line of lines) {
    const locationId = locationByCount.get(line.countId);
    if (!locationId || !line.setAsideAt) {
      continue;
    }
    const list = result.get(locationId) ?? [];
    list.push({
      itemId: line.itemId,
      itemLabel: line.item?.label ?? 'Article inconnu',
      countId: line.countId,
      setAsideAt: line.setAsideAt
    });
    result.set(locationId, list);
  }
  return result;
}

/** Fenêtre de l'inventaire d'ouverture après la bascule (A7-R1, question ouverte Q5). */
export const OPENING_COUNT_WINDOW_DAYS = 30;

/**
 * Vrai si un inventaire d'ouverture est proposé : chantier basculé depuis 30
 * jours au plus, et aucun inventaire OPENING non abandonné sur son lieu
 * (`hasLiveOpening`, lu par l'appelant).
 */
export function isOpeningCountSuggested(
  site: { stockEnabledAt: Date | null },
  hasLiveOpening: boolean,
  now: Date = new Date()
): boolean {
  if (!site.stockEnabledAt || hasLiveOpening) {
    return false;
  }
  const elapsed = now.getTime() - site.stockEnabledAt.getTime();
  return elapsed >= 0 && elapsed <= OPENING_COUNT_WINDOW_DAYS * DAY_MS;
}
