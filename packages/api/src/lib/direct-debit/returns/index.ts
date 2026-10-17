/**
 * Service de retour banque (spec 042, P3, data-model §8.3 à §8.7).
 *
 * CES SIGNATURES SONT UN CONTRAT ENTRE LOTS : P3 les réalise, P4 les appelle
 * (avec `scope = { scope: 'SYNDIC_LOT', syndicateId }`). Ne pas les modifier
 * sans l'accord du pilote. Corps provisoires jusqu'à la réalisation de P3.
 */

import type { RemittanceDto } from '../remittance-dto';
import type { ReturnApplyDto, ReturnImportDto, ReturnPreviewDto, ReturnScope, SettleAllResult } from './types';

export * from './types';

const notImplemented = () => new Error('Service de retour : à réaliser (spec 042 §8)');

export async function settleRemittanceLine(
  _tenantId: string,
  _scope: ReturnScope,
  _remittanceId: string,
  _lineId: string,
  _input: { settledAt: string },
  _actorUserId: string | null
): Promise<RemittanceDto> {
  throw notImplemented();
}

export async function rejectRemittanceLine(
  _tenantId: string,
  _scope: ReturnScope,
  _remittanceId: string,
  _lineId: string,
  _input: { rejectedAt: string; code?: string | null; reason?: string | null },
  _actorUserId: string | null
): Promise<RemittanceDto> {
  throw notImplemented();
}

export async function settleAllRemittanceLines(
  _tenantId: string,
  _scope: ReturnScope,
  _remittanceId: string,
  _input: { settledAt: string },
  _actorUserId: string | null
): Promise<SettleAllResult> {
  throw notImplemented();
}

export async function previewReturnFile(
  _tenantId: string,
  _scope: ReturnScope,
  _file: { buffer: Buffer; originalname?: string } | undefined,
  _format: string | undefined
): Promise<ReturnPreviewDto> {
  throw notImplemented();
}

export async function applyReturnFile(
  _tenantId: string,
  _scope: ReturnScope,
  _file: { buffer: Buffer; originalname?: string } | undefined,
  _format: string | undefined,
  _actorUserId: string | null
): Promise<ReturnApplyDto> {
  throw notImplemented();
}

export async function listReturnImports(
  _tenantId: string,
  _scope: ReturnScope,
  _query: { page: number; pageSize: number }
): Promise<{ items: ReturnImportDto[]; total: number; page: number; pageSize: number }> {
  throw notImplemented();
}
