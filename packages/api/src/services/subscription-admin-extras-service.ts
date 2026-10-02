/**
 * Abonnements par packs, vague 3 lot B : routes manquantes signalees par la
 * vague 2 (docs/architecture/PLAN-ABONNEMENTS.md §9).
 *
 *  - `updateSubscriptionItem` : remise ou prix fige d'un element, sans
 *    retrait puis re-ajout (une seule ecriture d'audit) ;
 *  - demandes d'extension de l'agence (`SubscriptionExtensionRequest`),
 *    notifiees par e-mail aux super-admins ;
 *  - `listSubscriptionSummaries` : resume de l'abonnement de plusieurs agences
 *    en une requete (packs, consommation, echeance), calcule par lots de
 *    requetes groupees avec la bibliotheque pure `buildEntitlements`.
 */

import { Prisma, SubscriptionExtensionRequestStatus, SubscriptionItemStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { frontendUrl } from '../config/env';
import { t } from '../i18n';
import { BadRequestError, NotFoundError } from '../middleware/error-middleware';
import { logAuditEvent } from './audit-service';
import { AuditActionKey } from '../types/audit-types';
import {
  CAPACITY_KEYS,
  CapacityKeyCode,
  buildEntitlements,
  featuresForModules,
  getSubscriptionEnforcement
} from '../lib/subscription';
import { invalidateEntitlements, toCatalogEntry } from './subscription-v2-service';
import { ACTIVE_SITE_STATUSES, ACTIVE_SYNDICATE_STATUSES } from './lot-registry-service';

const toNumber = (value: unknown): number => (value === null || value === undefined ? 0 : Number(String(value)));

const itemInclude = {
  catalogItem: { include: { capacities: { select: { capacityKey: true, amount: true } } } }
} as const;
type ItemRow = Prisma.SubscriptionItemGetPayload<{ include: typeof itemInclude }>;

/** Meme forme que `serializeItem` (subscription-v2-service.ts). */
function serializeItem(row: ItemRow) {
  return {
    id: row.id,
    code: row.catalogItem.code,
    kind: row.catalogItem.kind,
    name: row.catalogItem.name,
    quantity: row.quantity,
    unitMonthlyPrice: toNumber(row.unitMonthlyPrice),
    unitSetupPrice: toNumber(row.unitSetupPrice),
    discountPercent: toNumber(row.discountPercent),
    status: row.status,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    endReason: row.endReason,
    replacesItemId: row.replacesItemId,
    parentItemId: row.parentItemId,
    billedThrough: row.billedThrough,
    note: row.note
  };
}

// =============================================================== element souscrit

export interface UpdateItemInput {
  discountPercent?: number;
  unitMonthlyPrice?: number;
  note?: string | null;
  /** Raison de la modification, conservee dans l'audit. */
  reason?: string;
}

/**
 * Modifie la remise commerciale ou le prix mensuel fige d'un element non
 * termine. Prend effet sur la prochaine facture (aucun prorata retroactif) ;
 * les lignes deja facturees ou en attente ne changent pas.
 */
export async function updateSubscriptionItem(
  tenantId: string,
  itemId: string,
  input: UpdateItemInput,
  actorUserId: string
) {
  if (input.discountPercent === undefined && input.unitMonthlyPrice === undefined && input.note === undefined) {
    throw new BadRequestError('Aucune modification demandée.');
  }
  if (input.discountPercent !== undefined && (input.discountPercent < 0 || input.discountPercent > 100)) {
    throw new BadRequestError('La remise doit être comprise entre 0 et 100 %.');
  }
  if (
    input.unitMonthlyPrice !== undefined &&
    (!Number.isFinite(input.unitMonthlyPrice) || input.unitMonthlyPrice < 0)
  ) {
    throw new BadRequestError('Le prix mensuel doit être positif ou nul.');
  }

  const before = await prisma.subscriptionItem.findFirst({ where: { id: itemId, tenantId }, include: itemInclude });
  if (!before) throw new NotFoundError('Élément introuvable.');
  if (before.status === SubscriptionItemStatus.ENDED) {
    throw new BadRequestError('Un élément terminé ne peut plus être modifié.');
  }

  const updated = await prisma.subscriptionItem.update({
    where: { id: itemId, tenantId },
    data: {
      ...(input.discountPercent !== undefined ? { discountPercent: new Decimal(input.discountPercent) } : {}),
      ...(input.unitMonthlyPrice !== undefined ? { unitMonthlyPrice: new Decimal(input.unitMonthlyPrice) } : {}),
      ...(input.note !== undefined ? { note: input.note } : {})
    },
    include: itemInclude
  });
  invalidateEntitlements(tenantId);

  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.SUBSCRIPTION_ITEM_UPDATED,
    entityType: 'SubscriptionItem',
    entityId: itemId,
    payload: {
      code: before.catalogItem.code,
      reason: input.reason ?? null,
      before: {
        discountPercent: toNumber(before.discountPercent),
        unitMonthlyPrice: toNumber(before.unitMonthlyPrice),
        note: before.note
      },
      after: {
        discountPercent: toNumber(updated.discountPercent),
        unitMonthlyPrice: toNumber(updated.unitMonthlyPrice),
        note: updated.note
      }
    }
  });
  return serializeItem(updated);
}

// =============================================================== demandes d'extension

export interface ExtensionRequestInput {
  catalogCode?: string | null;
  quantity?: number | null;
  message: string;
}

type RequestRow = Prisma.SubscriptionExtensionRequestGetPayload<Record<string, never>>;

export interface ExtensionRequestDto {
  id: string;
  tenantId: string;
  requestedByUserId: string | null;
  requestedByName: string | null;
  catalogCode: string | null;
  catalogName: string | null;
  quantity: number | null;
  message: string;
  status: SubscriptionExtensionRequestStatus;
  handledAt: string | null;
  handledByUserId: string | null;
  handledNote: string | null;
  createdAt: string;
}

async function toRequestDtos(rows: RequestRow[]): Promise<ExtensionRequestDto[]> {
  const userIds = [...new Set(rows.map(r => r.requestedByUserId).filter((v): v is string => Boolean(v)))];
  const codes = [...new Set(rows.map(r => r.catalogCode).filter((v): v is string => Boolean(v)))];
  const [users, catalog] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } })
      : [],
    codes.length
      ? prisma.catalogItem.findMany({ where: { code: { in: codes } }, select: { code: true, name: true } })
      : []
  ]);
  const userName = new Map(users.map(u => [u.id, u.fullName]));
  const catalogName = new Map(catalog.map(c => [c.code, c.name]));
  return rows.map(row => ({
    id: row.id,
    tenantId: row.tenantId,
    requestedByUserId: row.requestedByUserId,
    requestedByName: row.requestedByUserId ? (userName.get(row.requestedByUserId) ?? null) : null,
    catalogCode: row.catalogCode,
    catalogName: row.catalogCode ? (catalogName.get(row.catalogCode) ?? null) : null,
    quantity: row.quantity,
    message: row.message,
    status: row.status,
    handledAt: row.handledAt ? row.handledAt.toISOString() : null,
    handledByUserId: row.handledByUserId,
    handledNote: row.handledNote,
    createdAt: row.createdAt.toISOString()
  }));
}

async function notifySuperAdmins(subject: string, text: string, tenantId: string): Promise<number> {
  const admins = await prisma.user.findMany({
    where: { globalRole: 'SUPER_ADMIN', isActive: true },
    select: { email: true }
  });
  if (admins.length === 0) return 0;
  const { emailService } = await import('./email-service');
  let sent = 0;
  for (const admin of admins) {
    try {
      // eslint-disable-next-line no-await-in-loop -- quelques destinataires au plus.
      await emailService.sendEmail({ to: admin.email, subject, text });
      sent += 1;
    } catch (error) {
      logger.warn("Demande d'extension : e-mail au super-admin en échec", {
        tenantId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return sent;
}

/** Demande d'extension envoyee par l'agence : trace en base, audit, e-mail aux super-admins. */
export async function createExtensionRequest(
  tenantId: string,
  input: ExtensionRequestInput,
  actorUserId: string
): Promise<ExtensionRequestDto> {
  const message = input.message?.trim() ?? '';
  if (message.length < 3) throw new BadRequestError('Décrivez votre demande.');
  let catalogName: string | null = null;
  if (input.catalogCode) {
    const item = await prisma.catalogItem.findUnique({
      where: { code: input.catalogCode },
      select: { name: true, isSellable: true }
    });
    if (!item || !item.isSellable) throw new NotFoundError('Offre introuvable dans le catalogue.');
    catalogName = item.name;
  }

  const row = await prisma.subscriptionExtensionRequest.create({
    data: {
      tenantId,
      requestedByUserId: actorUserId,
      catalogCode: input.catalogCode ?? null,
      quantity: input.quantity ?? null,
      message
    }
  });

  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.SUBSCRIPTION_EXTENSION_REQUESTED,
    entityType: 'SubscriptionExtensionRequest',
    entityId: row.id,
    payload: { catalogCode: row.catalogCode, quantity: row.quantity }
  });

  const [tenant, user] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    prisma.user.findUnique({ where: { id: actorUserId }, select: { fullName: true, email: true } })
  ]);
  const agency = tenant?.name ?? tenantId;
  const subject = t("[ImmoTopia] Demande d'extension — {{agency}}", { agency });
  const text = [
    t("L'agence {{agency}} demande une extension de son abonnement.", { agency }),
    catalogName
      ? t('Offre : {{offer}} (quantité : {{quantity}})', { offer: catalogName, quantity: row.quantity ?? 1 })
      : '',
    t('Demandeur : {{name}} ({{email}})', { name: user?.fullName ?? '—', email: user?.email ?? '—' }),
    '',
    message,
    '',
    `${frontendUrl.replace(/\/$/, '')}/admin/tenants/${tenantId}`
  ]
    .filter(line => line !== null)
    .join('\n');
  // Pas bloquant : la demande est enregistree meme si l'envoi echoue.
  notifySuperAdmins(subject, text, tenantId).catch(error =>
    logger.warn("Demande d'extension : notification en échec", { tenantId, error: (error as Error)?.message })
  );

  const [dto] = await toRequestDtos([row]);
  return dto;
}

export async function listExtensionRequests(tenantId: string): Promise<ExtensionRequestDto[]> {
  const rows = await prisma.subscriptionExtensionRequest.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: 100
  });
  return toRequestDtos(rows);
}

export interface HandleRequestInput {
  status: 'HANDLED' | 'DECLINED';
  note?: string | null;
}

/** Le super-admin clot une demande (traitee ou refusee). */
export async function handleExtensionRequest(
  tenantId: string,
  requestId: string,
  input: HandleRequestInput,
  actorUserId: string
): Promise<ExtensionRequestDto> {
  const existing = await prisma.subscriptionExtensionRequest.findFirst({ where: { id: requestId, tenantId } });
  if (!existing) throw new NotFoundError('Demande introuvable.');
  if (existing.status !== 'OPEN') throw new BadRequestError('Cette demande est déjà close.');
  const row = await prisma.subscriptionExtensionRequest.update({
    where: { id: requestId, tenantId },
    data: {
      status: input.status,
      handledAt: new Date(),
      handledByUserId: actorUserId,
      handledNote: input.note?.trim() || null
    }
  });
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.SUBSCRIPTION_EXTENSION_REQUEST_HANDLED,
    entityType: 'SubscriptionExtensionRequest',
    entityId: requestId,
    payload: { status: input.status }
  });
  const [dto] = await toRequestDtos([row]);
  return dto;
}

// =============================================================== resume par agence (liste)

export interface SubscriptionSummary {
  tenantId: string;
  status: string;
  phase: string;
  readOnly: boolean;
  packs: string[];
  capacities: Record<CapacityKeyCode, { limit: number; used: number }>;
  /** % de lots utilises, `null` sans capacite ni consommation. */
  lotsUsagePercent: number | null;
  /** Une capacite atteint 80 % de sa limite. */
  nearLimit: boolean;
  /** Prochaine echeance : fin d'essai ou fin de periode. */
  nextDueAt: string | null;
  openExtensionRequests: number;
}

const NEAR_LIMIT = 0.8;
export const MAX_SUMMARY_TENANTS = 100;

function countMap(rows: Array<{ tenantId: string; _count: { _all: number } }>): Map<string, number> {
  return new Map(rows.map(r => [r.tenantId, r._count._all]));
}

/**
 * Resume de l'abonnement de plusieurs agences en une dizaine de requetes
 * groupees, quelle que soit la taille de la page (supprime le N+1 de la liste
 * des agences). Consommation : comptages par defaut du registre (LOTS =
 * activations ouvertes hors biens detenus, BIENS_DETENUS = activations
 * ouvertes de nature HELD_PROPERTY, D14 pour coproprietes et chantiers).
 */
export async function listSubscriptionSummaries(
  tenantIds: readonly string[]
): Promise<Record<string, SubscriptionSummary>> {
  const ids = [...new Set(tenantIds)].slice(0, MAX_SUMMARY_TENANTS);
  if (ids.length === 0) return {};
  const where = { tenantId: { in: ids } };
  const [
    subscriptions,
    items,
    overrides,
    moduleRows,
    lots,
    copros,
    sites,
    requests,
    heldProperties,
    assets,
    unlinkedProperties
  ] = await Promise.all([
    prisma.subscription.findMany({ where }),
    prisma.subscriptionItem.findMany({
      where: { ...where, status: { not: SubscriptionItemStatus.ENDED } },
      include: itemInclude
    }),
    prisma.capacityOverride.findMany({ where: { ...where, revokedAt: null } }),
    prisma.tenantModule.findMany({ where }),
    prisma.lotActivation.groupBy({
      by: ['tenantId'],
      where: { ...where, deactivatedAt: null, kind: { not: 'HELD_PROPERTY' } },
      _count: { _all: true }
    }),
    prisma.syndicate.groupBy({
      by: ['tenantId'],
      where: { ...where, status: { in: [...ACTIVE_SYNDICATE_STATUSES] } },
      _count: { _all: true }
    }),
    prisma.constructionSite.groupBy({
      by: ['tenantId'],
      where: { ...where, status: { in: [...ACTIVE_SITE_STATUSES] } },
      _count: { _all: true }
    }),
    prisma.subscriptionExtensionRequest.groupBy({
      by: ['tenantId'],
      where: { ...where, status: 'OPEN' },
      _count: { _all: true }
    }),
    prisma.lotActivation.groupBy({
      by: ['tenantId'],
      where: { ...where, deactivatedAt: null, kind: 'HELD_PROPERTY' },
      _count: { _all: true }
    }),
    // ACTIFS : meme definition que `countActiveAssets` (subscription-v2-service) — actifs non
    // archives + biens non archives sans actif lie (un actif lie a un bien compte une fois).
    prisma.asset.groupBy({
      by: ['tenantId'],
      where: { ...where, status: { not: 'ARCHIVED' } },
      _count: { _all: true }
    }),
    prisma.property.groupBy({
      by: ['tenantId'],
      where: { ...where, status: { not: 'ARCHIVED' }, asset: { is: null } },
      _count: { _all: true }
    })
  ]);

  const lotCounts = countMap(lots as Array<{ tenantId: string; _count: { _all: number } }>);
  const coproCounts = countMap(copros as Array<{ tenantId: string; _count: { _all: number } }>);
  const siteCounts = countMap(sites as Array<{ tenantId: string; _count: { _all: number } }>);
  const requestCounts = countMap(requests as Array<{ tenantId: string; _count: { _all: number } }>);
  const heldCounts = countMap(heldProperties as Array<{ tenantId: string; _count: { _all: number } }>);
  const assetCounts = countMap(assets as Array<{ tenantId: string; _count: { _all: number } }>);
  const unlinkedPropertyCounts = countMap(unlinkedProperties as Array<{ tenantId: string; _count: { _all: number } }>);
  const now = new Date();
  const enforcement = getSubscriptionEnforcement();
  const result: Record<string, SubscriptionSummary> = {};

  for (const tenantId of ids) {
    const sub = subscriptions.find(s => s.tenantId === tenantId) ?? null;
    const entitlements = buildEntitlements({
      tenantId,
      subscription: sub
        ? {
            id: sub.id,
            status: sub.status,
            trialEndsAt: sub.trialEndsAt,
            pastDueAt: sub.pastDueAt,
            currentPeriodStart: sub.currentPeriodStart,
            currentPeriodEnd: sub.currentPeriodEnd,
            cancelAt: sub.cancelAt,
            canceledAt: sub.canceledAt,
            graceDays: sub.graceDays,
            billingCycle: sub.billingCycle,
            quotaPolicy: sub.quotaPolicy,
            manualReadOnlyAt: sub.manualReadOnlyAt,
            manualReadOnlyReason: sub.manualReadOnlyReason
          }
        : null,
      items: items
        .filter(i => i.tenantId === tenantId)
        .map(row => {
          const catalog = toCatalogEntry(row.catalogItem);
          return {
            code: catalog.code,
            kind: catalog.kind,
            quantity: row.quantity,
            status: row.status,
            startsAt: row.startsAt,
            endsAt: row.endsAt,
            modules: catalog.modules,
            exclusiveGroup: catalog.exclusiveGroup,
            capacities: catalog.capacities
          };
        }),
      overrides: overrides.filter(o => o.tenantId === tenantId),
      moduleRows: moduleRows.filter(m => m.tenantId === tenantId),
      usage: {
        LOTS: lotCounts.get(tenantId) ?? 0,
        COPROPRIETES: coproCounts.get(tenantId) ?? 0,
        CHANTIERS: siteCounts.get(tenantId) ?? 0,
        BIENS_DETENUS: heldCounts.get(tenantId) ?? 0,
        ACTIFS: (assetCounts.get(tenantId) ?? 0) + (unlinkedPropertyCounts.get(tenantId) ?? 0)
      },
      enforcement,
      featuresFor: featuresForModules,
      now
    });

    const capacities = {} as SubscriptionSummary['capacities'];
    for (const key of CAPACITY_KEYS) {
      capacities[key] = { limit: entitlements.capacities[key].limit, used: entitlements.capacities[key].used };
    }
    const lotsCap = capacities.LOTS;
    const lotsUsagePercent =
      lotsCap.limit > 0 ? Math.round((lotsCap.used / lotsCap.limit) * 100) : lotsCap.used > 0 ? 100 : null;
    const nextDue =
      entitlements.phase === 'TRIAL'
        ? (entitlements.trialEndsAt ?? entitlements.currentPeriodEnd)
        : entitlements.currentPeriodEnd;

    result[tenantId] = {
      tenantId,
      status: entitlements.status,
      phase: entitlements.phase,
      readOnly: entitlements.readOnly,
      packs: entitlements.packs,
      capacities,
      lotsUsagePercent,
      nearLimit: CAPACITY_KEYS.some(
        key => capacities[key].limit > 0 && capacities[key].used / capacities[key].limit >= NEAR_LIMIT
      ),
      nextDueAt: nextDue ? nextDue.toISOString() : null,
      openExtensionRequests: requestCounts.get(tenantId) ?? 0
    };
  }
  return result;
}
