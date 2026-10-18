import { GENERIC_CSV_ADAPTER } from './generic-csv';

/**
 * Adaptateurs de fichier de remise (spec 042, P2, data-model §7.4).
 *
 * Un adaptateur par banque : le format de la banque pilote viendra dans un
 * autre adaptateur, enregistré ici. Le fichier n'est jamais écrit sur disque ni
 * journalisé ; seule son empreinte HMAC-SHA-256 (`file-digest.ts`) est conservée
 * par la remise.
 */

export type DirectDebitFileFormatKey = 'GENERIC_CSV';

export interface FileLineInput {
  /** Référence d'opération, `PRL-2026-0001-001`. */
  reference: string;
  mandateReference: string;
  /** Date de signature du mandat. */
  mandateSignedAt: Date | null;
  holderName: string;
  /** IBAN complet, déchiffré uniquement pour produire le fichier. */
  iban: string;
  amount: number;
  /** Numéro de bail (locatif) ; entre dans le libellé de l'opération. Nul en copropriété. */
  leaseNumber: string | null;
  /** Numéro de lot (copropriété) : le libellé devient `CHARGES LOT <n> MM/AAAA`. */
  lotNumber?: string | null;
  periodYear: number;
  periodMonth: number;
}

export interface FileInput {
  reference: string;
  creditorIdentifier: string;
  creditorLabel: string;
  collectionDate: Date;
  lines: FileLineInput[];
}

export interface DirectDebitFileAdapter {
  format: DirectDebitFileFormatKey;
  fileExtension: string;
  contentType: string;
  build(input: FileInput): Buffer;
}

const ADAPTERS: Record<DirectDebitFileFormatKey, DirectDebitFileAdapter> = {
  GENERIC_CSV: GENERIC_CSV_ADAPTER
};

export function getFileAdapter(format: DirectDebitFileFormatKey): DirectDebitFileAdapter {
  return ADAPTERS[format];
}
