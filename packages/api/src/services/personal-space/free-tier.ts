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
 * Lit les droits par le cache normal (30 s, invalide par toute ecriture
 * d'abonnement de CE processus) : aucun cout pour une agence, dont les droits
 * sont deja lus a chaque requete par le garde d'abonnement. `fresh` force le
 * recalcul ; il ne sert qu'a confirmer un refus (voir `assertFreeTierCapacityTx`).
 */
export async function getAssetCapacityLimit(
  tenantId: string,
  options: { fresh?: boolean } = {}
): Promise<number | null> {
  const { capacities } = await getEntitlements(tenantId, { fresh: options.fresh });
  const actifs = capacities.ACTIFS;
  return actifs.included > 0 ? actifs.limit : null;
}

/** Serialise les creations d'actifs et de biens d'un tenant (verrou tenu jusqu'a la fin de la transaction). */
export async function lockTenantAssets(tx: PrismaTransactionClient, tenantId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`;
}

/**
 * Client de comptage : le client global, un client de transaction ou un
 * client etendu. Un client de TRANSACTION (pas de `$transaction`, mais un
 * `$executeRaw`) recoit le verrou consultatif ; le client global n'en recoit
 * pas (un verrou de transaction rendu aussitot ne protegerait rien).
 */
export interface AssetCountClient {
  asset: { count(args: never): PromiseLike<number> };
  property: { count(args: never): PromiseLike<number> };
}

function isTransactionClient(client: unknown): client is PrismaTransactionClient {
  const candidate = client as { $executeRaw?: unknown; $transaction?: unknown };
  return typeof candidate.$executeRaw === 'function' && typeof candidate.$transaction !== 'function';
}

/**
 * A appeler SOUS `lockTenantAssets` : compte dans la transaction et refuse si
 * `used >= limit`. Le plafond vient du cache des droits ; un refus est
 * confirme par une lecture fraiche, pour qu'une montee de palier faite par un
 * autre processus ne soit jamais refusee a tort (le chemin nominal reste
 * sans surcout).
 */
export async function assertFreeTierCapacityTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  limit: number
): Promise<void> {
  const used = await countActiveAssets(tx, tenantId);
  if (used < limit) return;
  const fresh = await getAssetCapacityLimit(tenantId, { fresh: true });
  if (fresh === null || used < fresh) return;
  throw new FreeTierLimitError({ limit: fresh, used });
}

/**
 * Vrai quand le pack porte ACTIFS et que le plafond est atteint. Compte avec
 * `client` ; sous un client de transaction, prend le verrou du tenant d'abord
 * (comptage et creation qui suit sont alors atomiques). Avec le client global
 * la lecture est indicative : la seule tolerance restante est qu'une creation
 * concurrente sans verrou puisse depasser le plafond de quelques unites.
 */
export async function isFreeTierLimitReached(
  tenantId: string,
  client: AssetCountClient = prisma as unknown as AssetCountClient
): Promise<boolean> {
  const limit = await getAssetCapacityLimit(tenantId);
  if (limit === null) return false;
  if (isTransactionClient(client)) await lockTenantAssets(client, tenantId);
  return (await countActiveAssets(client as unknown as typeof prisma, tenantId)) >= limit;
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
