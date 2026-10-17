import { rentalCollector } from './rental';
import { syndicCollector } from './syndic';
import type { CollectorScope, DirectDebitCollector } from './types';

export * from './types';

/** Encaisseur du périmètre. */
export function getCollector(scope: CollectorScope): DirectDebitCollector {
  return scope === 'SYNDIC_LOT' ? syndicCollector : rentalCollector;
}
