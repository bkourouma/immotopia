/**
 * Fichier de retour de la banque (spec 042, P3, data-model §8.5).
 * Le fichier n'est jamais stocké : seule son empreinte HMAC l'est.
 */

export type DirectDebitReturnFormatKey = 'GENERIC_CSV';

/** Taille maximale d'un fichier de retour. */
export const RETURN_FILE_MAX_BYTES = 2 * 1024 * 1024;
/** Nombre maximal de lignes d'un fichier de retour. */
export const RETURN_FILE_MAX_ROWS = 5000;

export interface ReturnRecord {
  /** Numéro de ligne du fichier (en-tête = 1). */
  row: number;
  /** Référence d'opération PRL-AAAA-NNNN-RRR. */
  operationReference: string;
  outcome: 'SETTLED' | 'REJECTED';
  /** AAAA-MM-JJ. */
  date: string;
  amount: number;
  rejectionCode: string | null;
  rejectionReason: string | null;
}

export interface ReturnParseResult {
  records: ReturnRecord[];
  errors: { row: number; message: string }[];
}

export interface DirectDebitReturnAdapter {
  format: DirectDebitReturnFormatKey;
  parse(buffer: Buffer): ReturnParseResult;
}
