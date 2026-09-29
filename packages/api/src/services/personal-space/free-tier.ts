import { prisma, PrismaTransactionClient } from '../../utils/database';
import { AppError } from '../../middleware/error-middleware';
import { PACK } from '../../lib/subscription';
import { countActiveAssets, getEntitlements, loadExistingCatalogByCodes } from '../subscription-v2-service';

/**
 * Palier gratuit de l'espace personnel (lot 4B, specs/026-particuliers-libre-service).
 *
 * Un tenant est concerne des que son pack en vigueur porte la capacite ACTIFS
 * (packs Particulier) : la garde s'applique alors quel que soit
 * `SUBSCRIPTION_ENFORCEMENT`. Les autres tenants (agences) ne sont pas touches.
 */

export const FREE_TIER_LIMIT_CODE = 'FREE_TIER_LIMIT';

/** 409 `FREE_TIER_LIMIT` : `data: { limit, used }`. */
export class FreeTierLimitError extends AppError {
  constructor(detail: { limit: number; used: number }) {
    super(
      'Vous avez atteint la limite d’actifs de votre formule. Passez au palier payant pour en ajouter davantage.',
      409,
      FREE_TIER_LIMIT_CODE,
      undefined,
      detail
    );
  }
}

/**
 * Plafond d'actifs du pack en vigueur, ou `null` si le pack ne porte pas ACTIFS.
 * `fresh` force le recalcul des droits (cache de 30 s sinon) : a utiliser a
 * l'ecriture, pour qu'un changement de pack soit vu tout de suite.
 */
export async function getAssetCapacityLimit(
  tenantId: string,
  options: { fresh?: boolean } = {}
): Promise<number | null> {
  const { capacities } = await getEntitlements(tenantId, { fresh: options.fresh });
  const actifs = capacities.ACTIFS;
  return actifs.included > 0 ? actifs.limit : null;
}

/** Serialise les creations d'actifs d'un tenant (verrou tenu jusqu'a la fin de la transaction). */
export async function lockTenantAssets(tx: PrismaTransactionClient, tenantId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`;
}

/** A appeler SOUS `lockTenantAssets` : compte dans la transaction et refuse si `used >= limit`. */
export async function assertFreeTierCapacityTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  limit: number
): Promise<void> {
  const used = await countActiveAssets(tx, tenantId);
  if (used >= limit) throw new FreeTierLimitError({ limit, used });
}

/** Vrai quand le pack porte ACTIFS et que le plafond est atteint (sans verrou : lecture indicative). */
export async function isFreeTierLimitReached(tenantId: string): Promise<boolean> {
  const limit = await getAssetCapacityLimit(tenantId);
  if (limit === null) return false;
  return (await countActiveAssets(prisma, tenantId)) >= limit;
}

export type AssetPlan = 'FREE' | 'PAID' | 'AGENCY';

export interface AssetUsage {
  plan: AssetPlan;
  limit: number | null;
  used: number;
  canAdd: boolean;
  upgrade: { target: 'PARTICULIER_PLUS'; priceMonthly: number; currency: 'XOF'; limit: number } | null;
}

/** `GET /tenants/:tenantId/patrimoine/usage` : compteur d'actifs et offre de montee de palier. */
export async function getAssetUsage(tenantId: string): Promise<AssetUsage> {
  const entitlements = await getEntitlements(tenantId, { fresh: true });
  const plan: AssetPlan = entitlements.packs.includes(PACK.PARTICULIER_GRATUIT)
    ? 'FREE'
    : entitlements.packs.includes(PACK.PARTICULIER_PLUS)
      ? 'PAID'
      : 'AGENCY';
  const actifs = entitlements.capacities.ACTIFS;
  const limit = actifs.included > 0 ? actifs.limit : null;
  const used = actifs.used;
  return {
    plan,
    limit,
    used,
    canAdd: limit === null || used < limit,
    upgrade: plan === 'FREE' ? await loadUpgradeOffer() : null
  };
}

async function loadUpgradeOffer(): Promise<AssetUsage['upgrade']> {
  const catalog = await loadExistingCatalogByCodes(prisma, [PACK.PARTICULIER_PLUS]);
  const plus = catalog.get(PACK.PARTICULIER_PLUS);
  const limit = plus?.capacities.ACTIFS;
  if (!plus || !plus.isSellable || limit === undefined) return null;
  return { target: 'PARTICULIER_PLUS', priceMonthly: plus.monthlyPrice, currency: 'XOF', limit };
}
