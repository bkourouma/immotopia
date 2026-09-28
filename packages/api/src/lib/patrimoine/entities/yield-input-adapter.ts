import { buildPropertyYieldInput } from '../queries';
import type { YieldInput } from '../yield';

/**
 * Seul point d'appel de `buildPropertyYieldInput` (`lib/patrimoine/queries.ts`,
 * territoire A1/hors périmètre — jamais modifié ici) pour le module entités
 * détentrices : la consolidation (`consolidation-service.ts`) passe par cette
 * fonction plutôt que d'importer `queries.ts` directement, pour que le point
 * de couture entre les deux territoires reste unique et visible.
 */
export async function loadPropertyYieldInput(tenantId: string, propertyId: string): Promise<YieldInput> {
  return buildPropertyYieldInput(tenantId, propertyId);
}
