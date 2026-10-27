import { genericCsvReturnAdapter } from './generic-csv';
import type { DirectDebitReturnAdapter, DirectDebitReturnFormatKey } from './types';

/**
 * Adaptateurs de fichier de retour (spec 042, P3, data-model §8.5). Un
 * adaptateur par banque : le format de la banque pilote s'ajoutera ici.
 */

export * from './types';

const ADAPTERS: Record<DirectDebitReturnFormatKey, DirectDebitReturnAdapter> = {
  GENERIC_CSV: genericCsvReturnAdapter
};

export function getReturnAdapter(format: DirectDebitReturnFormatKey): DirectDebitReturnAdapter {
  return ADAPTERS[format];
}
