import type { DirectDebitReturnAdapter, ReturnParseResult } from './types';

/** Retour CSV générique (data-model §8.5) : à réaliser. */
export const genericCsvReturnAdapter: DirectDebitReturnAdapter = {
  format: 'GENERIC_CSV',
  parse(_buffer: Buffer): ReturnParseResult {
    throw new Error('Adaptateur de retour GENERIC_CSV : à réaliser (spec 042 §8.5)');
  }
};
