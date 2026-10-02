/**
 * Choix UNIQUE de la clé qui rattache une ligne (valorisation, dette, part
 * détenue) à un actif (ADR-005, spec 023).
 *
 * Un actif immobilier lié à un bien partage ses lignes avec ce bien : elles
 * portent `propertyId`, jamais `assetId`, pour que les routes du bien et celles
 * de l'actif lisent et écrivent les MÊMES lignes. Tout autre actif porte
 * `assetId`. Aucun autre fichier ne fait ce choix à la main.
 */

export interface AssetScopeSource {
  id: string;
  propertyId: string | null;
}

export type AssetScope = { propertyId: string } | { assetId: string };

/** Filtre Prisma des lignes de l'actif (sans `tenantId`, à ajouter par l'appelant). */
export function assetScopeWhere(asset: AssetScopeSource): AssetScope {
  return asset.propertyId ? { propertyId: asset.propertyId } : { assetId: asset.id };
}

/** Donnée à poser à l'écriture : exactement une clé, jamais les deux. */
export function assetScopeData(asset: AssetScopeSource): AssetScope {
  return asset.propertyId ? { propertyId: asset.propertyId } : { assetId: asset.id };
}
