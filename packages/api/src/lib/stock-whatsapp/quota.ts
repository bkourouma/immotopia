import { env } from '../../config/env';
import { logAuditEvent, AuditActionKey } from '../../services/audit-service';
import { countInventoryPhotosThisMonth, getEntitlements } from '../../services/subscription-v2-service';
import { isItemEffective } from '../subscription/entitlements';
import { EXTENSION } from '../subscription/catalog';
import { evaluateFeatureAccess } from '../subscription/feature-access';
import { prisma, type PrismaTransactionClient } from '../../utils/database';
import { logger } from '../../utils/logger';
import type { WhatsappQuotaSource } from './types';

/**
 * Option payante et quota mensuel de photos analysées (lot 041, spec W11).
 *
 * L'unité est la PHOTO ANALYSÉE : une photo pour laquelle le fournisseur de
 * vision a rendu une réponse valide. La place est réservée AVANT l'appel à
 * l'IA par une mise à jour conditionnelle (jamais lue puis réécrite) et rendue
 * si l'IA échoue (W11-R3). Mois civil UTC (`AAAA-MM`).
 *
 * Mode d'application (`SUBSCRIPTION_ENFORCEMENT`, W11-R4) :
 * - `enforce` : `CONSTRUCTION` ouvert en écriture ET plafond
 *   `PHOTOS_INVENTAIRE > 0`, sinon refus (M06b) ;
 * - `warn` : sans option, quota de secours `WHATSAPP_INVENTORY_WARN_QUOTA` et
 *   avertissement au journal une fois par agence et par jour ;
 * - `off` : quota de secours sans avertissement (le plafond de l'option, s'il
 *   y en a une, reste appliqué : il est toujours au moins aussi généreux).
 */

type Db = PrismaTransactionClient | typeof prisma;

/** « AAAA-MM » du mois civil UTC. */
export function quotaMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

/**
 * Nom du contrat (plan §3.3) du compteur de consommation. Le corps vit dans
 * `subscription-v2-service.ts` (`countInventoryPhotosThisMonth`), qui le
 * branche sur `usageProviders` : l'importer d'ici ne crée aucun cycle.
 */
export async function countWhatsappPhotosThisMonth(db: Db, tenantId: string): Promise<number> {
  return countInventoryPhotosThisMonth(db, tenantId);
}

export type WhatsappQuotaPolicy =
  { ok: true; limit: number; source: WhatsappQuotaSource } | { ok: false; reason: 'OPTION_MISSING' };

const warnedTenantDays = new Map<string, string>();

function warnFallbackOncePerDay(tenantId: string, now: Date): void {
  const day = now.toISOString().slice(0, 10);
  if (warnedTenantDays.get(tenantId) === day) return;
  warnedTenantDays.set(tenantId, day);
  if (warnedTenantDays.size > 5000) warnedTenantDays.clear();
  logger.warn('Inventaire WhatsApp : agence sans option, quota de secours appliqué (SUBSCRIPTION_ENFORCEMENT=warn)', {
    tenantId,
    fallbackQuota: env.WHATSAPP_INVENTORY_WARN_QUOTA
  });
}

/** Remise à zéro de l'avertissement quotidien (tests). */
export function resetQuotaWarningsForTests(): void {
  warnedTenantDays.clear();
}

/** Droits d'abonnement d'une agence pour l'inventaire par WhatsApp (W11-R4). */
export async function resolveWhatsappQuotaPolicy(
  tenantId: string,
  now: Date = new Date()
): Promise<WhatsappQuotaPolicy> {
  const entitlements = await getEntitlements(tenantId);
  const limit = entitlements.capacities.PHOTOS_INVENTAIRE?.limit ?? 0;
  const enforcement = entitlements.enforcement;

  if (enforcement === 'enforce') {
    const access = evaluateFeatureAccess(entitlements, 'CONSTRUCTION', true);
    if (!access.allowed || limit <= 0) return { ok: false, reason: 'OPTION_MISSING' };
    return { ok: true, limit, source: 'OPTION' };
  }
  if (limit > 0) return { ok: true, limit, source: 'OPTION' };
  if (enforcement === 'warn') {
    warnFallbackOncePerDay(tenantId, now);
    return { ok: true, limit: env.WHATSAPP_INVENTORY_WARN_QUOTA, source: 'WARN_FALLBACK' };
  }
  return { ok: true, limit: env.WHATSAPP_INVENTORY_WARN_QUOTA, source: 'OFF_FALLBACK' };
}

/** Blocs `EXT_INVENTAIRE_WHATSAPP` souscrits et en vigueur (quantité des éléments). */
async function countSubscribedBlocks(tenantId: string, now: Date): Promise<number> {
  const items = await prisma.subscriptionItem.findMany({
    where: { tenantId, status: { not: 'ENDED' }, catalogItem: { code: EXTENSION.INVENTAIRE_WHATSAPP } },
    select: { status: true, startsAt: true, endsAt: true, quantity: true }
  });
  return items.filter(item => isItemEffective(item, now)).reduce((sum, item) => sum + item.quantity, 0);
}

/** Vue du quota pour l'écran WhatsApp (W4, `overview`). `NONE` : `enforce` sans option. */
export async function getWhatsappQuotaState(
  tenantId: string,
  now: Date = new Date()
): Promise<{
  month: string;
  used: number;
  limit: number;
  source: 'OPTION' | 'WARN_FALLBACK' | 'OFF_FALLBACK' | 'NONE';
  blocks: number;
}> {
  const month = quotaMonth(now);
  const [policy, used, blocks] = await Promise.all([
    resolveWhatsappQuotaPolicy(tenantId, now),
    countInventoryPhotosThisMonth(prisma, tenantId, now),
    countSubscribedBlocks(tenantId, now)
  ]);
  if (!policy.ok) return { month, used, limit: 0, source: 'NONE', blocks };
  return { month, used, limit: policy.limit, source: policy.source, blocks };
}

/**
 * Réserve une photo analysée (W11-R3). Ligne du mois créée au préalable
 * (`INSERT … ON CONFLICT DO NOTHING`), puis UNE mise à jour conditionnelle
 * `used = used + 1 WHERE used < limit` : deux photos simultanées à `limit - 1`
 * n'en laissent passer qu'une (PostgreSQL réévalue la condition sur la ligne
 * verrouillée).
 */
export async function reserveWhatsappPhoto(
  tenantId: string,
  limit: number,
  now: Date = new Date()
): Promise<{ ok: true; month: string } | { ok: false; month: string }> {
  const month = quotaMonth(now);
  if (limit <= 0) return { ok: false, month };
  await prisma.stockWhatsappUsage.createMany({ data: [{ tenantId, month, used: 0 }], skipDuplicates: true });
  const updated = await prisma.stockWhatsappUsage.updateMany({
    where: { tenantId, month, used: { lt: limit } },
    data: { used: { increment: 1 } }
  });
  return updated.count === 1 ? { ok: true, month } : { ok: false, month };
}

/** Rend une réservation après un échec de l'IA ou du téléchargement (`used - 1`, jamais sous zéro). */
export async function releaseWhatsappPhoto(tenantId: string, month: string): Promise<void> {
  await prisma.stockWhatsappUsage.updateMany({
    where: { tenantId, month, used: { gt: 0 } },
    data: { used: { decrement: 1 } }
  });
}

/** Vrai si le quota du mois est déjà atteint (lecture seule, sans réservation). */
export async function isWhatsappQuotaExhausted(
  tenantId: string,
  limit: number,
  now: Date = new Date()
): Promise<boolean> {
  if (limit <= 0) return true;
  const used = await countInventoryPhotosThisMonth(prisma, tenantId, now);
  return used >= limit;
}

/**
 * Quota atteint (W11-R5) : audit `STOCK_WHATSAPP_QUOTA_REACHED` UNE fois par
 * agence et par mois, par mise à jour conditionnelle de `quotaReachedAt`.
 * Hors requête : agence et acteur explicites.
 */
export async function noteWhatsappQuotaReached(
  tenantId: string,
  actorUserId: string,
  limit: number,
  now: Date = new Date()
): Promise<void> {
  const month = quotaMonth(now);
  await prisma.stockWhatsappUsage.createMany({ data: [{ tenantId, month, used: 0 }], skipDuplicates: true });
  const marked = await prisma.stockWhatsappUsage.updateMany({
    where: { tenantId, month, quotaReachedAt: null },
    data: { quotaReachedAt: now }
  });
  if (marked.count !== 1) return;
  logAuditEvent({
    tenantId,
    actorUserId,
    actionKey: AuditActionKey.STOCK_WHATSAPP_QUOTA_REACHED,
    entityType: 'StockWhatsappUsage',
    entityId: `${tenantId}:${month}`,
    payload: { month, limit }
  });
}
