/**
 * Lecture et traitement des alertes de stock — lot 040 (spec B7-R3, B7-R4,
 * B7-R5 ; contrat `AlertView`).
 *
 * La NAISSANCE d'une alerte n'est pas ici : elle passe par une seule fonction,
 * `raiseStockAlertTx` (`stock-alertes.ts`, fondations). Ce fichier lit,
 * construit les textes, marque une alerte « traitée » et alimente la file
 * « À traiter » du tableau de bord.
 *
 * ---------------------------------------------------------------------------
 * Titres et messages : construits à la lecture, jamais stockés
 * ---------------------------------------------------------------------------
 *
 * Une alerte ne porte en base que sa nature, son montant et son seuil figés,
 * son lieu, son chantier, l'objet visé et des `details` (aucun nom de
 * personne). Titre et message se construisent ici, dans la langue de la
 * requête (`t()`), par une table EXHAUSTIVE par nature (`ALERT_TEXTS`,
 * `Record<StockAlertKind, …>`) : une nature ajoutée au schéma (par exemple
 * `FIELD_COUNT_CLOSED` au lot 041) casse la compilation tant que son entrée
 * manque — une ligne de table suffit à l'ajouter.
 *
 * Règles de contenu (B7-R3) : un titre neutre, jamais de nom de personne,
 * jamais de qualification de la cause ; un message SANS AUCUN MONTANT pour un
 * appelant qui n'a pas STOCK_VALUES_VIEW (chaque nature a sa variante « sans
 * valeurs »).
 *
 * `details` lus ici (tous facultatifs, posés par les territoires qui font
 * naître l'alerte) : `mode` (`SINGLE` | `MONTHLY_CUMUL`), `setAsideLines` et
 * `uncountedLines` (nombre de lignes, COUNT_LINE_SET_ASIDE), `month`
 * (`AAAA-MM`, cumuls). Un détail absent retombe sur une phrase générale.
 */

import type { Prisma, StockAlertKind, StockAlertStatus } from '@prisma/client';

import { prisma } from '../../utils/database';
import type { PrismaTransactionClient } from '../../utils/database';
import { BadRequestError, ErrorCode, NotFoundError } from '../../middleware/error-middleware';
import { logAuditEvent } from '../../services/audit-service';
import { AuditActionKey } from '../../types/audit-types';
import { t } from '../../i18n';
import { toAmount } from './types';
import { formatSlipNumber } from './stock-bons';
import { formatCashVoucherNumber } from './cash';
import { buildStockMeta, loadBlindLocationIds, maskValue, stockError } from './stock-controles';
import type {
  AlertView,
  PrismaLike,
  StockAlertMode,
  StockAlertSubjectType,
  StockCallerContext,
  StockMeta
} from './types-040-controle';

// ---------------------------------------------------------------------------
// Mise en forme
// ---------------------------------------------------------------------------

/** « 145 000 FCFA » : montant arrondi, devise du module. */
export function formatAlertAmount(value: number, currency = 'XOF'): string {
  const label = currency === 'XOF' ? 'FCFA' : currency;
  return `${Math.round(value).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} ${label}`;
}

/** « 30/09/2026 », jour UTC. */
function formatDay(date: Date): string {
  return date.toLocaleDateString('fr-FR', { timeZone: 'UTC' });
}

/** Éléments d'un message, déjà mis en forme. `amount`/`threshold` nuls = message sans montant. */
export interface AlertTextParts {
  /** Libellé de l'objet visé (numéro de bon, inventaire, pièce de caisse…). */
  subject: string | null;
  /** Lieu de stockage, sinon chantier. */
  place: string | null;
  /** Montant mis en forme, ou `null` (masqué ou absent). */
  amount: string | null;
  /** Seuil mis en forme, ou `null` (masqué ou absent). */
  threshold: string | null;
  mode: StockAlertMode | null;
  details: Record<string, unknown>;
}

interface AlertText {
  /** Titre neutre, traduit. Jamais de nom de personne. */
  title: () => string;
  /** Message traduit ; sans montant quand `parts.amount` est nul. */
  message: (parts: AlertTextParts) => string;
}

function subjectOf(parts: AlertTextParts): string {
  return parts.subject ?? t('sans référence');
}

function placeOf(parts: AlertTextParts): string {
  return parts.place ?? t('lieu non renseigné');
}

function countOf(details: Record<string, unknown>, key: string): number | null {
  const value = details[key];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Titres et messages, une entrée par nature. Exhaustif par construction
 * (`Record<StockAlertKind, …>`) : ajouter une nature, c'est ajouter une ligne.
 */
export const ALERT_TEXTS: Record<StockAlertKind, AlertText> = {
  COUNT_VARIANCE: {
    title: () => t("Écart d'inventaire à justifier au-dessus du seuil"),
    message: parts =>
      parts.amount !== null && parts.threshold !== null
        ? t('Inventaire {{objet}} : écart de {{montant}} (seuil {{seuil}}).', {
            objet: subjectOf(parts),
            montant: parts.amount,
            seuil: parts.threshold
          })
        : t("Inventaire {{objet}} : l'écart atteint le seuil fixé par l'agence.", { objet: subjectOf(parts) })
  },
  COUNT_LINE_SET_ASIDE: {
    title: () => t("Lignes d'inventaire écartées"),
    message: parts => {
      const lines = (countOf(parts.details, 'setAsideLines') ?? 0) + (countOf(parts.details, 'uncountedLines') ?? 0);
      return lines > 0
        ? t('Inventaire {{objet}} : {{lignes}} ligne(s) écartée(s) sans ajustement, à recompter.', {
            objet: subjectOf(parts),
            lignes: lines
          })
        : t('Inventaire {{objet}} : des lignes ont été écartées sans ajustement, à recompter.', {
            objet: subjectOf(parts)
          });
    }
  },
  COUNT_CANCELLED: {
    title: () => t('Inventaire abandonné'),
    message: parts =>
      t('Inventaire {{objet}} : abandonné alors que des lignes avaient été saisies.', { objet: subjectOf(parts) })
  },
  COUNT_SELF_VALIDATED: {
    title: () => t('Inventaire validé par son compteur'),
    message: parts =>
      t('Inventaire {{objet}} : validé par une personne qui a aussi compté, avec un motif enregistré.', {
        objet: subjectOf(parts)
      })
  },
  LARGE_ISSUE: {
    title: () => t('Sortie importante'),
    message: parts =>
      parts.amount !== null && parts.threshold !== null
        ? t('Bon de sortie {{objet}} ({{lieu}}) : {{montant}} (seuil {{seuil}}).', {
            objet: subjectOf(parts),
            lieu: placeOf(parts),
            montant: parts.amount,
            seuil: parts.threshold
          })
        : t("Bon de sortie {{objet}} ({{lieu}}) : la valeur atteint le seuil fixé par l'agence.", {
            objet: subjectOf(parts),
            lieu: placeOf(parts)
          })
  },
  LARGE_SCRAP: {
    title: () => t('Rebut important'),
    message: parts => {
      const valued = parts.amount !== null && parts.threshold !== null;
      if (parts.mode === 'MONTHLY_CUMUL') {
        return valued
          ? t('Cumul du mois des rebuts sur {{lieu}} : {{montant}} (seuil {{seuil}}).', {
              lieu: placeOf(parts),
              montant: parts.amount as string,
              seuil: parts.threshold as string
            })
          : t("Cumul du mois des rebuts sur {{lieu}} : il atteint le seuil fixé par l'agence.", {
              lieu: placeOf(parts)
            });
      }
      return valued
        ? t('Rebut sur {{lieu}} : {{montant}} (seuil {{seuil}}).', {
            lieu: placeOf(parts),
            montant: parts.amount as string,
            seuil: parts.threshold as string
          })
        : t("Rebut sur {{lieu}} : la valeur atteint le seuil fixé par l'agence.", { lieu: placeOf(parts) });
    }
  },
  RECEIPT_REPEATED: {
    title: () => t('Facture déjà réceptionnée'),
    message: parts =>
      t('Bon de réception {{objet}} : cette facture avait déjà fait l’objet d’une réception.', {
        objet: subjectOf(parts)
      })
  },
  RECEIPT_OVER_INVOICE: {
    title: () => t('Valeur reçue supérieure à la facture'),
    message: parts =>
      parts.amount !== null && parts.threshold !== null
        ? t('Bon de réception {{objet}} : valeur reçue {{montant}} pour une facture de {{seuil}}.', {
            objet: subjectOf(parts),
            montant: parts.amount,
            seuil: parts.threshold
          })
        : t('Bon de réception {{objet}} : la valeur reçue dépasse le montant de la facture.', {
            objet: subjectOf(parts)
          })
  },
  RECEIPT_UNVALUED: {
    title: () => t('Réception sans prix connu'),
    message: parts =>
      t('Bon de réception {{objet}} : des articles ont été reçus sans prix connu.', { objet: subjectOf(parts) })
  },
  CASH_MATERIAL_PURCHASE: {
    title: () => t('Achat de matériaux en espèces'),
    message: parts => {
      const valued = parts.amount !== null && parts.threshold !== null;
      if (parts.mode === 'MONTHLY_CUMUL') {
        return valued
          ? t('Cumul du mois des achats de matériaux en espèces sur {{lieu}} : {{montant}} (seuil {{seuil}}).', {
              lieu: placeOf(parts),
              montant: parts.amount as string,
              seuil: parts.threshold as string
            })
          : t(
              "Cumul du mois des achats de matériaux en espèces sur {{lieu}} : il atteint le seuil fixé par l'agence.",
              {
                lieu: placeOf(parts)
              }
            );
      }
      return valued
        ? t('Pièce de caisse {{objet}} ({{lieu}}) : {{montant}} (seuil {{seuil}}).', {
            objet: subjectOf(parts),
            lieu: placeOf(parts),
            montant: parts.amount as string,
            seuil: parts.threshold as string
          })
        : t("Pièce de caisse {{objet}} ({{lieu}}) : le montant atteint le seuil fixé par l'agence.", {
            objet: subjectOf(parts),
            lieu: placeOf(parts)
          });
    }
  }
};

/** Titre neutre d'une nature, traduit. */
export function buildAlertTitle(kind: StockAlertKind): string {
  return ALERT_TEXTS[kind].title();
}

/** Message d'une alerte, traduit ; sans montant quand `parts.amount` est nul. */
export function buildAlertMessage(kind: StockAlertKind, parts: AlertTextParts): string {
  return ALERT_TEXTS[kind].message(parts);
}

// ---------------------------------------------------------------------------
// Lignes lues et vues
// ---------------------------------------------------------------------------

/** Ce que la lecture d'une alerte sélectionne : aucun objet `User` complet. */
export const ALERT_SELECT = {
  id: true,
  tenantId: true,
  kind: true,
  severity: true,
  status: true,
  amount: true,
  threshold: true,
  currency: true,
  siteId: true,
  locationId: true,
  subjectType: true,
  subjectId: true,
  details: true,
  raisedAt: true,
  acknowledgedAt: true,
  acknowledgeNote: true,
  site: { select: { id: true, name: true } },
  location: { select: { id: true, label: true } },
  acknowledgedBy: { select: { fullName: true, email: true } }
} satisfies Prisma.StockAlertSelect;

export type StockAlertRow = Prisma.StockAlertGetPayload<{ select: typeof ALERT_SELECT }>;

function readMode(details: Record<string, unknown>): StockAlertMode | null {
  return details.mode === 'SINGLE' || details.mode === 'MONTHLY_CUMUL' ? details.mode : null;
}

function asDetails(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

const SUBJECT_TYPES: readonly StockAlertSubjectType[] = [
  'StockSlip',
  'StockCount',
  'StockMovement',
  'SupplierInvoice',
  'CashVoucher'
];

function asSubjectType(value: string): StockAlertSubjectType {
  return (SUBJECT_TYPES as readonly string[]).includes(value) ? (value as StockAlertSubjectType) : 'StockMovement';
}

/**
 * Libellés des objets visés, par lot (une requête par nature d'objet, jamais
 * une par alerte), bornés à l'agence. Un objet introuvable n'a pas de libellé.
 */
export async function loadAlertSubjectLabels(
  db: PrismaLike,
  tenantId: string,
  rows: Array<{ subjectType: string; subjectId: string }>
): Promise<Map<string, string>> {
  const idsByType = new Map<string, Set<string>>();
  for (const row of rows) {
    const set = idsByType.get(row.subjectType) ?? new Set<string>();
    set.add(row.subjectId);
    idsByType.set(row.subjectType, set);
  }
  const labels = new Map<string, string>();
  const key = (type: string, id: string): string => `${type}:${id}`;
  const ids = (type: string): string[] => [...(idsByType.get(type) ?? [])];

  const tasks: Array<Promise<void>> = [];
  if (ids('StockSlip').length > 0) {
    tasks.push(
      db.stockSlip
        .findMany({
          where: { tenantId, id: { in: ids('StockSlip') } },
          select: { id: true, kind: true, year: true, number: true }
        })
        .then(slips => {
          for (const slip of slips) {
            labels.set(key('StockSlip', slip.id), formatSlipNumber(slip.kind, slip.year, slip.number));
          }
        })
    );
  }
  if (ids('StockCount').length > 0) {
    tasks.push(
      db.stockCount
        .findMany({
          where: { tenantId, id: { in: ids('StockCount') } },
          select: { id: true, countedAt: true, location: { select: { label: true } } }
        })
        .then(counts => {
          for (const count of counts) {
            const place = count.location?.label;
            const day = formatDay(count.countedAt);
            labels.set(key('StockCount', count.id), place ? `${place} — ${day}` : day);
          }
        })
    );
  }
  if (ids('StockMovement').length > 0) {
    tasks.push(
      db.stockMovement
        .findMany({
          where: { tenantId, id: { in: ids('StockMovement') } },
          select: { id: true, movementDate: true, item: { select: { label: true } } }
        })
        .then(movements => {
          for (const movement of movements) {
            const day = formatDay(movement.movementDate);
            labels.set(
              key('StockMovement', movement.id),
              movement.item?.label ? `${movement.item.label} — ${day}` : day
            );
          }
        })
    );
  }
  if (ids('SupplierInvoice').length > 0) {
    tasks.push(
      db.supplierInvoice
        .findMany({
          where: { tenantId, id: { in: ids('SupplierInvoice') } },
          select: { id: true, reference: true }
        })
        .then(invoices => {
          for (const invoice of invoices) {
            labels.set(key('SupplierInvoice', invoice.id), invoice.reference);
          }
        })
    );
  }
  if (ids('CashVoucher').length > 0) {
    tasks.push(
      db.cashVoucher
        .findMany({
          where: { tenantId, id: { in: ids('CashVoucher') } },
          select: { id: true, voucherYear: true, voucherNumber: true }
        })
        .then(vouchers => {
          for (const voucher of vouchers) {
            const number = formatCashVoucherNumber(voucher.voucherYear, voucher.voucherNumber);
            if (number) {
              labels.set(key('CashVoucher', voucher.id), number);
            }
          }
        })
    );
  }
  await Promise.all(tasks);
  return labels;
}

/** Libellé d'un utilisateur : son nom, sinon son adresse. */
function userLabel(user: { fullName: string | null; email: string } | null | undefined): string | null {
  if (!user) {
    return null;
  }
  return user.fullName?.trim() || user.email;
}

/**
 * Une alerte lue, rendue pour l'appelant : montant et seuil `null` sans
 * STOCK_VALUES_VIEW, message construit sans montant dans ce cas (§8.1, B7-R3).
 */
export function toAlertView(row: StockAlertRow, ctx: StockCallerContext, subjectLabel: string | null): AlertView {
  const details = asDetails(row.details);
  const mode = readMode(details);
  const amount = maskValue(toAmount(row.amount), ctx);
  const threshold = maskValue(toAmount(row.threshold), ctx);
  const currency = row.currency ?? 'XOF';
  const place = row.location?.label ?? row.site?.name ?? null;
  const parts: AlertTextParts = {
    subject: subjectLabel,
    place,
    amount: amount !== null ? formatAlertAmount(amount, currency) : null,
    threshold: threshold !== null ? formatAlertAmount(threshold, currency) : null,
    mode,
    details
  };
  // Sans valeurs, AUCUN montant dans le message, même si l'un des deux manque.
  if (!ctx.valuesVisible) {
    parts.amount = null;
    parts.threshold = null;
  }
  return {
    id: row.id,
    kind: row.kind,
    severity: row.severity,
    status: row.status,
    title: buildAlertTitle(row.kind),
    message: buildAlertMessage(row.kind, parts),
    amount,
    threshold,
    currency,
    site: row.site ? { id: row.site.id, name: row.site.name } : null,
    location: row.location ? { id: row.location.id, label: row.location.label } : null,
    subjectType: asSubjectType(row.subjectType),
    subjectId: row.subjectId,
    subjectLabel,
    mode,
    raisedAt: row.raisedAt,
    acknowledgedAt: row.acknowledgedAt,
    acknowledgedByLabel: userLabel(row.acknowledgedBy),
    acknowledgeNote: row.acknowledgeNote
  };
}

/** Plusieurs alertes lues, libellés des objets chargés par lot. */
export async function toAlertViews(
  db: PrismaLike,
  tenantId: string,
  rows: StockAlertRow[],
  ctx: StockCallerContext
): Promise<AlertView[]> {
  const labels = await loadAlertSubjectLabels(db, tenantId, rows);
  return rows.map(row => toAlertView(row, ctx, labels.get(`${row.subjectType}:${row.subjectId}`) ?? null));
}

// ---------------------------------------------------------------------------
// Liste paginée (GET /stock/alerts)
// ---------------------------------------------------------------------------

export interface ListStockAlertsQuery {
  status?: StockAlertStatus;
  kind?: StockAlertKind;
  siteId?: string;
  locationId?: string;
  /** Jour UTC inclus. */
  from?: Date;
  /** Jour UTC inclus. */
  to?: Date;
  cursor?: string;
  limit: number;
}

/** Curseur opaque : base64url de `[raisedAt ISO, id]`. */
export function encodeAlertCursor(raisedAt: Date, id: string): string {
  return Buffer.from(JSON.stringify([raisedAt.toISOString(), id]), 'utf8').toString('base64url');
}

export function decodeAlertCursor(cursor: string): { raisedAt: Date; id: string } {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === 'string' &&
      typeof parsed[1] === 'string'
    ) {
      const raisedAt = new Date(parsed[0]);
      if (!Number.isNaN(raisedAt.getTime())) {
        return { raisedAt, id: parsed[1] };
      }
    }
  } catch {
    // Curseur illisible : refusé ci-dessous.
  }
  throw new BadRequestError('Le curseur de pagination est invalide.');
}

const DAY_MS = 86_400_000;

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Les alertes de l'agence, plus récentes d'abord, paginées par curseur. */
export async function listStockAlerts(
  tenantId: string,
  ctx: StockCallerContext,
  query: ListStockAlertsQuery
): Promise<{ data: AlertView[]; meta: StockMeta }> {
  const and: Prisma.StockAlertWhereInput[] = [];
  if (query.from || query.to) {
    and.push({
      raisedAt: {
        ...(query.from ? { gte: startOfUtcDay(query.from) } : {}),
        ...(query.to ? { lt: new Date(startOfUtcDay(query.to).getTime() + DAY_MS) } : {})
      }
    });
  }
  if (query.cursor) {
    const cursor = decodeAlertCursor(query.cursor);
    and.push({
      OR: [{ raisedAt: { lt: cursor.raisedAt } }, { raisedAt: cursor.raisedAt, id: { lt: cursor.id } }]
    });
  }
  const where: Prisma.StockAlertWhereInput = {
    tenantId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.kind ? { kind: query.kind } : {}),
    ...(query.siteId ? { siteId: query.siteId } : {}),
    ...(query.locationId ? { locationId: query.locationId } : {}),
    ...(and.length > 0 ? { AND: and } : {})
  };

  const rows = await prisma.stockAlert.findMany({
    where,
    select: ALERT_SELECT,
    orderBy: [{ raisedAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1
  });
  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  const nextCursor = rows.length > query.limit && last ? encodeAlertCursor(last.raisedAt, last.id) : null;

  const [data, blind] = await Promise.all([
    toAlertViews(prisma, tenantId, page, ctx),
    loadBlindLocationIds(prisma, tenantId, ctx)
  ]);
  return { data, meta: buildStockMeta(ctx, blind, nextCursor) };
}

// ---------------------------------------------------------------------------
// Traitement (POST /stock/alerts/:alertId/acknowledge, B7-R4)
// ---------------------------------------------------------------------------

/**
 * Marque une alerte « traitée », avec une note facultative. Elle ne se
 * supprime jamais. Une alerte d'une autre agence répond comme une alerte
 * inexistante (404) ; une alerte déjà traitée, `409
 * STOCK_ALERT_ALREADY_ACKNOWLEDGED`. La mise à jour est CONDITIONNELLE
 * (`status = OPEN`) : deux traitements simultanés ne s'écrasent pas.
 */
export async function acknowledgeStockAlertTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  alertId: string,
  ctx: StockCallerContext,
  note: string | null
): Promise<AlertView> {
  const existing = await tx.stockAlert.findFirst({
    where: { id: alertId, tenantId },
    select: { id: true, status: true }
  });
  if (!existing) {
    throw new NotFoundError('Alerte introuvable.');
  }
  if (existing.status === 'ACKNOWLEDGED') {
    throw stockError(409, ErrorCode.STOCK_ALERT_ALREADY_ACKNOWLEDGED, 'Cette alerte a déjà été traitée.');
  }
  const cleanNote = note?.trim() ? note.trim() : null;
  const updated = await tx.stockAlert.updateMany({
    where: { id: alertId, tenantId, status: 'OPEN' },
    data: {
      status: 'ACKNOWLEDGED',
      acknowledgedAt: new Date(),
      acknowledgedByUserId: ctx.userId,
      acknowledgeNote: cleanNote
    }
  });
  if (updated.count !== 1) {
    throw stockError(409, ErrorCode.STOCK_ALERT_ALREADY_ACKNOWLEDGED, 'Cette alerte a déjà été traitée.');
  }
  const row = await tx.stockAlert.findFirst({ where: { id: alertId, tenantId }, select: ALERT_SELECT });
  if (!row) {
    throw new NotFoundError('Alerte introuvable.');
  }
  const [view] = await toAlertViews(tx, tenantId, [row], ctx);
  return view;
}

/** Trace non critique du traitement, écrite APRÈS la transaction (B6-R2, B6-R5). */
export function logStockAlertAcknowledged(tenantId: string, userId: string, view: AlertView): void {
  logAuditEvent({
    tenantId,
    actorUserId: userId,
    actionKey: AuditActionKey.STOCK_ALERT_ACKNOWLEDGED,
    entityType: 'StockAlert',
    entityId: view.id,
    payload: {
      kind: view.kind,
      subjectType: view.subjectType,
      subjectId: view.subjectId,
      hasNote: view.acknowledgeNote !== null
    }
  });
}

// ---------------------------------------------------------------------------
// File « À traiter » du tableau de bord (B7-R5)
// ---------------------------------------------------------------------------

/** Une alerte ouverte, prête pour la file du tableau de bord. */
export interface StockAlertWorkItem {
  alertId: string;
  title: string;
  /** Lieu ou chantier. */
  place: string | null;
  amount: number | null;
  raisedAt: Date;
  severity: 'warning' | 'info';
}

/**
 * Les alertes ouvertes les plus importantes de l'agence : « À regarder »
 * d'abord, puis les plus anciennes. L'appelant (tableau de bord) a déjà
 * vérifié STOCK_ALERTS_VIEW, STOCK_VALUES_VIEW et la fonctionnalité
 * CONSTRUCTION : le montant lui est rendu.
 */
export async function listOpenStockAlertsForWorkQueue(tenantId: string, limit: number): Promise<StockAlertWorkItem[]> {
  const select = {
    id: true,
    kind: true,
    severity: true,
    amount: true,
    raisedAt: true,
    site: { select: { name: true } },
    location: { select: { label: true } }
  } satisfies Prisma.StockAlertSelect;
  const [warnings, infos] = await Promise.all([
    prisma.stockAlert.findMany({
      where: { tenantId, status: 'OPEN', severity: 'WARNING' },
      select,
      orderBy: [{ raisedAt: 'asc' }, { id: 'asc' }],
      take: limit
    }),
    prisma.stockAlert.findMany({
      where: { tenantId, status: 'OPEN', severity: 'INFO' },
      select,
      orderBy: [{ raisedAt: 'asc' }, { id: 'asc' }],
      take: limit
    })
  ]);
  return [...warnings, ...infos].slice(0, limit).map(row => ({
    alertId: row.id,
    title: buildAlertTitle(row.kind),
    place: row.location?.label ?? row.site?.name ?? null,
    amount: toAmount(row.amount),
    raisedAt: row.raisedAt,
    severity: row.severity === 'WARNING' ? ('warning' as const) : ('info' as const)
  }));
}

/** Lien de l'écran Contrôle sur une alerte (route web, ecrans §10.4). */
export function stockAlertHref(tenantId: string, alertId: string): string {
  return `/tenant/${tenantId}/finance/stock/controle?alerte=${alertId}`;
}
