/**
 * Le parcours de la pile Express vit désormais dans `src/lib/ai/gateway/route-walker.ts`
 * (partagé avec le générateur du catalogue de la passerelle IA). Ce fichier le
 * ré-exporte pour les tests existants.
 */
export { collectRoutes, installMountPathRecorder } from '../../src/lib/ai/gateway/route-walker';
export type { DiscoveredRoute } from '../../src/lib/ai/gateway/route-walker';
