import { prisma } from '../../utils/database';
import { ConflictError } from '../../middleware/error-middleware';
import { assetScopeWhere } from '../../lib/patrimoine/asset-scope';

/**
 * Plafonds par agence du patrimoine multi-actifs (déni de service, coût des
 * calculs de valeur nette). Contrat : `specs/023-patrimoine-multi-actifs/contracts/api.md`.
 */

/** Actifs non archivés par agence. */
export const MAX_ACTIVE_ASSETS_PER_TENANT = 500;
/** Valorisations par actif. */
export const MAX_VALUATIONS_PER_ASSET = 1000;
/** Lignes renvoyées par `GET /patrimoine/assets` (sans pagination). */
export const LIST_ASSETS_HARD_LIMIT = 500;

export async function assertAssetQuota(tenantId: string): Promise<void> {
  const count = await prisma.asset.count({ where: { tenantId, status: { not: 'ARCHIVED' } } });
  if (count >= MAX_ACTIVE_ASSETS_PER_TENANT) {
    throw new ConflictError(
      `Limite atteinte : une agence ne peut pas avoir plus de ${MAX_ACTIVE_ASSETS_PER_TENANT} actifs non archivés. ` +
        'Archivez des actifs avant d’en créer un nouveau.'
    );
  }
}

export async function assertValuationQuota(
  tenantId: string,
  asset: { id: string; propertyId: string | null }
): Promise<void> {
  const count = await prisma.assetValuation.count({ where: { tenantId, ...assetScopeWhere(asset) } });
  if (count >= MAX_VALUATIONS_PER_ASSET) {
    throw new ConflictError(
      `Limite atteinte : un actif ne peut pas avoir plus de ${MAX_VALUATIONS_PER_ASSET} valorisations. ` +
        'Supprimez d’anciennes valorisations avant d’en ajouter.'
    );
  }
}
