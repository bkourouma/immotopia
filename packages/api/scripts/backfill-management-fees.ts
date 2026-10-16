/**
 * Rattrapage des honoraires de gestion : point d'entrée de développement.
 *
 * Toute la logique (et la documentation d'usage) vit dans
 * `src/scripts/backfill-management-fees.ts`, qui est compilé dans l'image de
 * l'API : `scripts/` n'y est pas, et `ts-node` non plus. En production :
 *   docker exec immotopia-prod-api node dist/scripts/backfill-management-fees.js --allow-production [--apply] [--tenant <id>]
 * Simulation par défaut ; voir docs/workflows/DEPLOIEMENT.md.
 *
 * Ici : `npx ts-node scripts/backfill-management-fees.ts [--apply] [--tenant <id>] [--json]`.
 */

import { main } from '../src/scripts/backfill-management-fees';

main().catch(error => {
  console.error(error);
  process.exit(1);
});
