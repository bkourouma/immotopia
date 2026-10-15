import { env } from '../../config/env';
import { getEntitlements } from '../../services/subscription-v2-service';
import { prisma } from '../../utils/database';
import { logger } from '../../utils/logger';

/**
 * Quota mensuel de demandes de signature (spec 044, SG-R12), sur le modèle de
 * `lib/stock-whatsapp/quota.ts`. L'unité est la DEMANDE envoyée (quel que soit
 * le nombre de signataires). La place est réservée AVANT l'envoi par une mise à
 * jour conditionnelle (jamais lue puis réécrite) et rendue si l'envoi échoue.
 * Mois civil UTC (`AAAA-MM`).
 *
 * Mode d'application (`SUBSCRIPTION_ENFORCEMENT`) :
 * - `enforce` : plafond `SIGNATURES_MENSUELLES > 0` exigé, sinon refus ;
 * - `warn` : sans plafond, quota de secours `SIGNATURE_WARN_QUOTA` et
 *   avertissement au journal une fois par agence et par jour ;
 * - `off` : quota de secours sans avertissement (un plafond souscrit reste appliqué).
 */

export type SignatureQuotaSource = 'OPTION' | 'WARN_FALLBACK' | 'OFF_FALLBACK';
export type SignatureQuotaPolicy =
  { ok: true; limit: number; source: SignatureQuotaSource } | { ok: false; reason: 'OPTION_MISSING' };

export function signatureQuotaMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

const warnedTenantDays = new Map<string, string>();

function warnFallbackOncePerDay(tenantId: string, now: Date): void {
  const day = now.toISOString().slice(0, 10);
  if (warnedTenantDays.get(tenantId) === day) return;
  warnedTenantDays.set(tenantId, day);
  if (warnedTenantDays.size > 5000) warnedTenantDays.clear();
  logger.warn('Signature : agence sans capacité, quota de secours appliqué (SUBSCRIPTION_ENFORCEMENT=warn)', {
    tenantId,
    fallbackQuota: env.SIGNATURE_WARN_QUOTA
  });
}

export function resetSignatureQuotaWarningsForTests(): void {
  warnedTenantDays.clear();
}

export async function resolveSignatureQuotaPolicy(
  tenantId: string,
  now: Date = new Date()
): Promise<SignatureQuotaPolicy> {
  const entitlements = await getEntitlements(tenantId);
  const limit = entitlements.capacities.SIGNATURES_MENSUELLES?.limit ?? 0;
  const enforcement = entitlements.enforcement;

  if (enforcement === 'enforce') {
    if (limit <= 0) return { ok: false, reason: 'OPTION_MISSING' };
    return { ok: true, limit, source: 'OPTION' };
  }
  if (limit > 0) return { ok: true, limit, source: 'OPTION' };
  if (enforcement === 'warn') {
    warnFallbackOncePerDay(tenantId, now);
    return { ok: true, limit: env.SIGNATURE_WARN_QUOTA, source: 'WARN_FALLBACK' };
  }
  return { ok: true, limit: env.SIGNATURE_WARN_QUOTA, source: 'OFF_FALLBACK' };
}

/**
 * Réserve une demande. Ligne du mois créée au préalable (`ON CONFLICT DO
 * NOTHING`), puis UNE mise à jour conditionnelle `used = used + 1 WHERE used <
 * limit` : deux envois simultanés à `limit - 1` n'en laissent passer qu'un.
 */
export async function reserveSignature(
  tenantId: string,
  limit: number,
  now: Date = new Date()
): Promise<{ ok: boolean; month: string }> {
  const month = signatureQuotaMonth(now);
  if (limit <= 0) return { ok: false, month };
  await prisma.signatureUsage.createMany({ data: [{ tenantId, month, used: 0 }], skipDuplicates: true });
  const updated = await prisma.signatureUsage.updateMany({
    where: { tenantId, month, used: { lt: limit } },
    data: { used: { increment: 1 } }
  });
  return { ok: updated.count === 1, month };
}

/** Rend une réservation (`used - 1`, jamais sous zéro) quand l'envoi échoue. */
export async function releaseSignature(tenantId: string, month: string): Promise<void> {
  await prisma.signatureUsage.updateMany({
    where: { tenantId, month, used: { gt: 0 } },
    data: { used: { decrement: 1 } }
  });
}
