/**
 * Journal des mouvements de stock — lot 040, territoire API-3 (spec A4-R4, A5,
 * §8.1, §8.2).
 *
 * - **Pagination par curseur opaque** (A5-R1) : base64url de
 *   `movementDate|createdAt|id`, tri décroissant sur ces trois colonnes
 *   (index `stock_movements (tenant_id, movement_date DESC, created_at DESC,
 *   id DESC)`). Jamais de décalage par `skip` : un mouvement saisi entre deux
 *   pages ne décale ni ne double aucune ligne.
 * - **Filtres** (A5-R2) : article, lieu, chantier, nature (six valeurs), bon,
 *   mouvement (ou les deux moitiés de son transfert), période (bornes
 *   incluses), et trois filtres PAR PERSONNE — preneur, auteur, demandeur —
 *   réservés à STOCK_VALUES_VIEW (`403 STOCK_VALUE_FIELD_FORBIDDEN`).
 * - **Export CSV** (A5-R3) : mêmes filtres, sans curseur, lu par pages
 *   internes de 1 000 ; au-delà de 50 000 lignes, `422 STOCK_EXPORT_TOO_LARGE`.
 *   Colonnes de valeur absentes sans STOCK_VALUES_VIEW ; colonnes « quantité
 *   après », « prix unitaire », « valeur après » vides pour un lieu en
 *   comptage (§8.2). `DATA_EXPORTED` est écrit par le middleware d'accès.
 * - **Masquage** : chaque mouvement passe par `maskMovementView` (fondations),
 *   valeurs (§8.1) puis aveugle (§8.2), et chaque réponse porte `meta`.
 *
 * Le convertisseur `toMovementView` est exporté : il rend la forme complète du
 * contrat `MovementView` à partir d'une ligne lue avec `MOVEMENT_VIEW_INCLUDE`,
 * AVANT masquage — le masque reste toujours le geste de l'appelant.
 */

import type { Prisma } from '@prisma/client';

import { prisma } from '../../utils/database';
import { AppError, ErrorCode } from '../../middleware/error-middleware';
import { t } from '../../i18n';
import { toCsvString } from '../csv';
import type { CsvValue } from '../csv';
import { roundMoneyXof, roundQuantity } from './money';
import { toAmount, toAmountOrZero } from './types';
import { formatSlipNumber } from './stock-bons';
import { buildStockMeta, entryLagDays, loadBlindLocationIds, maskMovementView, stockError } from './stock-controles';
import { formatTakerLabel } from './stock-preneurs';
import type { MovementView, PrismaLike, StockCallerContext, StockMeta, StockMovementType } from './types-040-controle';

/** Devise unique du module (décision D9 du plan, actée au lot 1). */
const DEFAULT_CURRENCY = 'XOF';

/** Taille d'une page interne de l'export (plan, consignes API-3). */
const EXPORT_PAGE_SIZE = 1000;

/** Au-delà, l'export est refusé : affiner les filtres (A5-R3). */
export const EXPORT_MAX_ROWS = 50_000;

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Filtres
// ---------------------------------------------------------------------------

/** Les filtres du journal et de son export (A5-R2). */
export interface StockMovementFilters {
  itemId?: string;
  locationId?: string;
  siteId?: string;
  type?: StockMovementType;
  slipId?: string;
  movementId?: string;
  /** Filtre par personne : STOCK_VALUES_VIEW. */
  takerId?: string;
  /** Filtre par personne : STOCK_VALUES_VIEW. */
  createdByUserId?: string;
  /** Filtre par personne (contient, insensible à la casse) : STOCK_VALUES_VIEW. */
  requestedBy?: string;
  /** Date de mouvement, borne incluse (jour UTC). */
  from?: Date;
  /** Date de mouvement, borne incluse (jour UTC). */
  to?: Date;
}

/**
 * Les trois filtres par personne sont un outil d'encadrement (spec §10) :
 * réservés à STOCK_VALUES_VIEW, qu'ils visent un preneur par son identifiant
 * ou par son nom.
 */
export function assertPersonFiltersAllowed(
  filters: StockMovementFilters,
  ctx: Pick<StockCallerContext, 'valuesVisible'>
): void {
  if (ctx.valuesVisible) {
    return;
  }
  const used = (['takerId', 'createdByUserId', 'requestedBy'] as const).filter(key => filters[key] !== undefined);
  if (used.length > 0) {
    throw stockError(
      403,
      ErrorCode.STOCK_VALUE_FIELD_FORBIDDEN,
      'Le filtre par personne est réservé aux personnes qui voient les valeurs du stock.',
      { fields: used }
    );
  }
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Le `where` Prisma des filtres. `null` quand aucun mouvement ne peut
 * correspondre (mouvement demandé introuvable dans l'agence) : la réponse est
 * alors vide, sans révéler s'il existe ailleurs.
 */
export async function buildMovementWhere(
  db: PrismaLike,
  tenantId: string,
  filters: StockMovementFilters
): Promise<Prisma.StockMovementWhereInput | null> {
  const and: Prisma.StockMovementWhereInput[] = [];

  if (filters.movementId) {
    const target = await db.stockMovement.findFirst({
      where: { id: filters.movementId, tenantId },
      select: { id: true, transferGroupId: true }
    });
    if (!target) {
      return null;
    }
    // Un transfert est fait de deux moitiés : le lien d'une alerte vers l'une
    // doit montrer les deux.
    and.push(target.transferGroupId ? { transferGroupId: target.transferGroupId } : { id: target.id });
  }

  const movementDate: Prisma.DateTimeFilter = {};
  if (filters.from) {
    movementDate.gte = startOfUtcDay(filters.from);
  }
  if (filters.to) {
    movementDate.lt = new Date(startOfUtcDay(filters.to).getTime() + DAY_MS);
  }

  return {
    tenantId,
    ...(filters.itemId ? { itemId: filters.itemId } : {}),
    ...(filters.locationId ? { locationId: filters.locationId } : {}),
    ...(filters.siteId ? { siteId: filters.siteId } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.slipId ? { slipId: filters.slipId } : {}),
    ...(filters.takerId ? { takerId: filters.takerId } : {}),
    ...(filters.createdByUserId ? { createdByUserId: filters.createdByUserId } : {}),
    ...(filters.requestedBy ? { requestedBy: { contains: filters.requestedBy, mode: 'insensitive' as const } } : {}),
    ...(filters.from || filters.to ? { movementDate } : {}),
    ...(and.length > 0 ? { AND: and } : {})
  };
}

// ---------------------------------------------------------------------------
// Curseur opaque (A5-R1)
// ---------------------------------------------------------------------------

export interface MovementCursor {
  movementDate: Date;
  createdAt: Date;
  id: string;
}

/** base64url de `movementDate|createdAt|id` (dates en ISO). */
export function encodeMovementCursor(cursor: MovementCursor): string {
  const raw = `${cursor.movementDate.toISOString()}|${cursor.createdAt.toISOString()}|${cursor.id}`;
  return Buffer.from(raw, 'utf8').toString('base64url');
}

/** Lit un curseur ; un curseur illisible est un 400, jamais une page vide. */
export function decodeMovementCursor(value: string): MovementCursor {
  const invalid = () => new AppError('Curseur de pagination invalide.', 400, ErrorCode.BAD_REQUEST);
  let raw: string;
  try {
    raw = Buffer.from(value, 'base64url').toString('utf8');
  } catch {
    throw invalid();
  }
  const parts = raw.split('|');
  if (parts.length !== 3) {
    throw invalid();
  }
  const movementDate = new Date(parts[0]);
  const createdAt = new Date(parts[1]);
  const id = parts[2];
  if (Number.isNaN(movementDate.getTime()) || Number.isNaN(createdAt.getTime()) || !id) {
    throw invalid();
  }
  return { movementDate, createdAt, id };
}

/** Les lignes strictement après le curseur, dans l'ordre décroissant (movementDate, createdAt, id). */
function afterCursorWhere(cursor: MovementCursor): Prisma.StockMovementWhereInput {
  return {
    OR: [
      { movementDate: { lt: cursor.movementDate } },
      { movementDate: cursor.movementDate, createdAt: { lt: cursor.createdAt } },
      { movementDate: cursor.movementDate, createdAt: cursor.createdAt, id: { lt: cursor.id } }
    ]
  };
}

const MOVEMENT_ORDER: Prisma.StockMovementOrderByWithRelationInput[] = [
  { movementDate: 'desc' },
  { createdAt: 'desc' },
  { id: 'desc' }
];

// ---------------------------------------------------------------------------
// Conversion Prisma -> contrat
// ---------------------------------------------------------------------------

/** Ce qu'une lecture de mouvement charge pour rendre un `MovementView`. */
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
} satisfies Prisma.StockMovementInclude;

function toCreatedByLabel(user?: { fullName?: string | null; email?: string | null } | null): string {
  return user?.fullName || user?.email || 'Utilisateur inconnu';
}

/**
 * Un mouvement lu avec `MOVEMENT_VIEW_INCLUDE`, à la forme du contrat, NON
 * masqué : l'appelant passe ensuite par `maskMovementView`.
 */
export function toMovementView(row: any): MovementView {
  return {
    id: row.id,
    type: row.type,
    itemId: row.itemId,
    itemReference: row.item?.reference ?? 'Article inconnu',
    itemLabel: row.item?.label ?? 'Article inconnu',
    itemUnit: row.item?.unit ?? '',
    locationId: row.locationId,
    locationLabel: row.location?.label ?? 'Lieu inconnu',
    movementDate: row.movementDate,
    quantity: roundQuantity(toAmountOrZero(row.quantity)),
    isDecrease: row.isDecrease === true,
    unitCost: roundQuantity(toAmountOrZero(row.unitCost)),
    totalValue: roundMoneyXof(toAmountOrZero(row.totalValue)),
    currency: row.currency ?? DEFAULT_CURRENCY,
    quantityAfter: roundQuantity(toAmountOrZero(row.quantityAfter)),
    valueAfter: roundMoneyXof(toAmountOrZero(row.valueAfter)),
    siteId: row.siteId ?? null,
    siteLabel: row.site?.name ?? null,
    costCategoryLabel: row.costCategory?.label ?? null,
    requestedBy: row.requestedBy ?? null,
    supplierInvoiceReference: row.supplierInvoice?.reference ?? null,
    transferGroupId: row.transferGroupId ?? null,
    createdByLabel: toCreatedByLabel(row.createdBy),
    createdAt: row.createdAt,
    takerId: row.takerId ?? null,
    takerLabel: row.taker ? formatTakerLabel(row.taker.fullName, row.taker.teamOrCompany) : null,
    supplierInvoiceId: row.supplierInvoiceId ?? null,
    stockCountId: row.stockCountId ?? null,
    slipId: row.slipId ?? null,
    slipNumber: row.slip ? formatSlipNumber(row.slip.kind, row.slip.year, row.slip.number) : null,
    reasonCode: row.reasonCode ?? null,
    reason: row.reason ?? null,
    valuationSource: row.valuationSource ?? null,
    supplierCreditValue: (() => {
      const value = toAmount(row.supplierCreditValue);
      return value === null ? null : roundMoneyXof(value);
    })(),
    createdByUserId: row.createdByUserId,
    entryLagDays: entryLagDays(row.createdAt, row.movementDate),
    attachmentsCount: row._count?.attachments ?? 0
  };
}

// ---------------------------------------------------------------------------
// Le journal paginé (A5-R1, A5-R2)
// ---------------------------------------------------------------------------

/** Une page du journal : les mouvements masqués et le `meta` (dont `nextCursor`). */
export interface StockMovementPage {
  movements: MovementView[];
  meta: StockMeta;
}

async function readMovementPage(
  where: Prisma.StockMovementWhereInput,
  cursor: MovementCursor | null,
  take: number
): Promise<any[]> {
  return prisma.stockMovement.findMany({
    where: cursor ? { AND: [where, afterCursorWhere(cursor)] } : where,
    include: MOVEMENT_VIEW_INCLUDE,
    orderBy: MOVEMENT_ORDER,
    take
  });
}

function cursorOf(row: { movementDate: Date; createdAt: Date; id: string }): MovementCursor {
  return { movementDate: row.movementDate, createdAt: row.createdAt, id: row.id };
}

/** `GET /stock/movements` : une page du journal, masquée pour l'appelant. */
export async function listStockMovementsPage(
  tenantId: string,
  ctx: StockCallerContext,
  filters: StockMovementFilters,
  page: { cursor?: string; limit: number }
): Promise<StockMovementPage> {
  assertPersonFiltersAllowed(filters, ctx);
  const cursor = page.cursor ? decodeMovementCursor(page.cursor) : null;
  const [where, blind] = await Promise.all([
    buildMovementWhere(prisma, tenantId, filters),
    loadBlindLocationIds(prisma, tenantId, ctx)
  ]);
  if (!where) {
    return { movements: [], meta: buildStockMeta(ctx, blind, null) };
  }

  // Une ligne de plus que demandé : sa présence dit qu'une page suit.
  const rows = await readMovementPage(where, cursor, page.limit + 1);
  const pageRows = rows.slice(0, page.limit);
  const nextCursor =
    rows.length > page.limit && pageRows.length > 0
      ? encodeMovementCursor(cursorOf(pageRows[pageRows.length - 1]))
      : null;

  return {
    movements: pageRows.map(row => maskMovementView(toMovementView(row), ctx, blind)),
    meta: buildStockMeta(ctx, blind, nextCursor)
  };
}

// ---------------------------------------------------------------------------
// L'export CSV (A5-R3)
// ---------------------------------------------------------------------------

/** Libellés traduits à la lecture (texte français = clé, extrait par `i18n:extract`). */
const MOVEMENT_TYPE_LABELS: Record<StockMovementType, () => string> = {
  RECEIPT: () => t('Réception'),
  ISSUE: () => t('Sortie'),
  TRANSFER: () => t('Transfert'),
  ADJUSTMENT: () => t('Ajustement'),
  SUPPLIER_RETURN: () => t('Retour fournisseur'),
  SCRAP: () => t('Rebut')
};

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function csvHeader(valuesVisible: boolean): string[] {
  const header = [
    t('Date du mouvement'),
    t('Saisi le'),
    t('Délai de saisie (j)'),
    t('Nature'),
    t('Bon'),
    t('Article (référence)'),
    t('Désignation'),
    t('Unité'),
    t('Lieu'),
    t('Sens'),
    t('Quantité'),
    t('Quantité après'),
    t('Chantier'),
    t('Poste'),
    t('Preneur ou demandeur'),
    t('Motif (code)'),
    t('Motif (précision)'),
    t('Facture'),
    t('Auteur')
  ];
  return valuesVisible ? [...header, t('Prix unitaire'), t('Valeur'), t('Valeur après')] : header;
}

/** Une ligne du CSV, à partir d'un mouvement DÉJÀ masqué : un champ masqué donne une cellule vide. */
function csvLine(view: MovementView, valuesVisible: boolean): CsvValue[] {
  const line: CsvValue[] = [
    isoDay(view.movementDate),
    view.createdAt,
    view.entryLagDays,
    MOVEMENT_TYPE_LABELS[view.type](),
    view.slipNumber,
    view.itemReference,
    view.itemLabel,
    view.itemUnit,
    view.locationLabel,
    view.isDecrease ? t('Sortie') : t('Entrée'),
    view.quantity,
    view.quantityAfter,
    view.siteLabel,
    view.costCategoryLabel,
    view.takerLabel ?? view.requestedBy,
    view.reasonCode,
    view.reason,
    view.supplierInvoiceReference,
    view.createdByLabel
  ];
  return valuesVisible ? [...line, view.unitCost, view.totalValue, view.valueAfter] : line;
}

/**
 * `GET /stock/movements/export.csv` : tout le journal filtré, lu par pages
 * internes de 1 000. S'arrête dès la 50 001e ligne pour répondre
 * `422 STOCK_EXPORT_TOO_LARGE` sans lire le reste. Format du dépôt
 * (`lib/csv.ts`) : BOM UTF-8, CRLF, séparateur « ; », protection contre les
 * formules.
 */
export async function exportStockMovementsCsv(
  tenantId: string,
  ctx: StockCallerContext,
  filters: StockMovementFilters
): Promise<string> {
  assertPersonFiltersAllowed(filters, ctx);
  const [where, blind] = await Promise.all([
    buildMovementWhere(prisma, tenantId, filters),
    loadBlindLocationIds(prisma, tenantId, ctx)
  ]);

  const lines: CsvValue[][] = [];
  if (where) {
    let cursor: MovementCursor | null = null;
    let total = 0;
    for (;;) {
      const take = Math.min(EXPORT_PAGE_SIZE, EXPORT_MAX_ROWS + 1 - total);
      const rows = await readMovementPage(where, cursor, take);
      total += rows.length;
      if (total > EXPORT_MAX_ROWS) {
        throw stockError(
          422,
          ErrorCode.STOCK_EXPORT_TOO_LARGE,
          "L'export dépasse 50 000 lignes : affinez les filtres (période, lieu, article).",
          { maxRows: EXPORT_MAX_ROWS }
        );
      }
      for (const row of rows) {
        lines.push(csvLine(maskMovementView(toMovementView(row), ctx, blind), ctx.valuesVisible));
      }
      if (rows.length < take) {
        break;
      }
      cursor = cursorOf(rows[rows.length - 1]);
    }
  }

  return toCsvString([csvHeader(ctx.valuesVisible), ...lines], { separator: ';' }) + '\r\n';
}

// ---------------------------------------------------------------------------
// Les auteurs (filtre « Saisi par », STOCK_VALUES_VIEW)
// ---------------------------------------------------------------------------

/** Auteurs distincts des mouvements de l'agence, triés par libellé (fullName, à défaut e-mail). */
export async function listStockMovementAuthors(tenantId: string): Promise<Array<{ userId: string; label: string }>> {
  const groups = await prisma.stockMovement.groupBy({
    by: ['createdByUserId'],
    where: { tenantId }
  });
  const ids = groups.map(group => group.createdByUserId).filter((id): id is string => !!id);
  if (ids.length === 0) {
    return [];
  }
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, fullName: true, email: true }
  });
  const labelById = new Map(users.map(user => [user.id, toCreatedByLabel(user)]));
  return ids
    .map(userId => ({ userId, label: labelById.get(userId) ?? 'Utilisateur inconnu' }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
}
