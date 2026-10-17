import type { RemittanceDto, RemittanceLineStatus } from '../remittance-dto';
import type { DirectDebitReturnFormatKey } from '../return-formats/types';

/**
 * Types du service de retour banque (spec 042, P3, data-model §8.7).
 * Contrat entre lots : P3 réalise le service, P4 l'appelle.
 */

/** Périmètre d'un retour : les remises de ce périmètre seulement (sinon NotFoundError). */
export type ReturnScope = { scope: 'RENTAL_LEASE' } | { scope: 'SYNDIC_LOT'; syndicateId: string };

export type ReturnSkipReason =
  | 'UNKNOWN_REFERENCE'
  | 'AMOUNT_MISMATCH'
  | 'ALREADY_PROCESSED'
  | 'CONFLICT'
  | 'LINE_CANCELED'
  | 'REMITTANCE_NOT_SUBMITTED'
  | 'INVALID_DATE';

export interface ReturnRecordDto {
  row: number;
  operationReference: string;
  outcome: 'SETTLED' | 'REJECTED';
  date: string;
  amount: number;
  rejectionCode: string | null;
  rejectionReason: string | null;
  action: 'SETTLE' | 'REJECT' | 'SKIP';
  skipReason: ReturnSkipReason | null;
  match: {
    remittanceId: string;
    remittanceReference: string;
    lineId: string;
    lineStatus: RemittanceLineStatus;
    lineAmount: number;
    debtorName: string | null;
  } | null;
}

export interface ReturnPreviewDto {
  format: DirectDebitReturnFormatKey;
  fileName: string;
  records: ReturnRecordDto[];
  errors: { row: number; message: string }[];
  summary: { settle: number; reject: number; skip: number; errors: number };
}

export interface ReturnApplyDto extends ReturnPreviewDto {
  importId: string;
  results: { row: number; lineId: string; ok: boolean; error: string | null }[];
}

export interface ReturnImportDto {
  id: string;
  scope: 'RENTAL_LEASE' | 'SYNDIC_LOT';
  format: DirectDebitReturnFormatKey;
  fileName: string;
  recordCount: number;
  settledCount: number;
  rejectedCount: number;
  skippedCount: number;
  errorCount: number;
  importedBy: { id: string; fullName: string | null } | null;
  createdAt: string;
}

export interface SettleAllResult {
  remittance: RemittanceDto;
  settled: number;
  failed: { lineId: string; reference: string; error: string }[];
}
