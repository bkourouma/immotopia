import { t } from '../../../i18n';
import { ConflictError } from '../../../middleware/error-middleware';
import { rentalCollector } from './rental';
import type { CollectorScope, DirectDebitCollector } from './types';

export * from './types';

/** Encaisseur du périmètre ; SYNDIC_LOT arrive avec P4. */
export function getCollector(scope: CollectorScope): DirectDebitCollector {
  if (scope === 'RENTAL_LEASE') return rentalCollector;
  throw new ConflictError(t("Le prélèvement en copropriété n'est pas encore disponible."));
}
