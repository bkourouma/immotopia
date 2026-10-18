/**
 * Service de retour banque (spec 042, P3, data-model §8.3 à §8.7).
 *
 * CES SIGNATURES SONT UN CONTRAT ENTRE LOTS : P3 les réalise, P4 les appelle
 * (avec `scope = { scope: 'SYNDIC_LOT', syndicateId }`). Ne pas les modifier
 * sans l'accord du pilote. La logique vit dans `lines.ts` (règlement, rejet),
 * `batch.ts` (toute la remise) et `import.ts` (fichier de retour).
 */

import { prisma } from '../../../utils/database';
import { NotFoundError } from '../../../middleware/error-middleware';
import { t } from '../../../i18n';
import { loadRemittanceDto, type RemittanceDto } from '../remittance-dto';
import { settleAllLines } from './batch';
import { applyReturnFileAt, listReturnImportsFor, previewReturnFileAt } from './import';
import { rejectLine, settleLine } from './lines';
import type { ReturnApplyDto, ReturnImportDto, ReturnPreviewDto, ReturnScope, SettleAllResult } from './types';

export * from './types';

async function reload(tenantId: string, scope: ReturnScope, remittanceId: string): Promise<RemittanceDto> {
  const dto = await loadRemittanceDto(prisma, tenantId, remittanceId, scope);
  if (!dto) throw new NotFoundError(t('Remise introuvable.'));
  return dto;
}

/** Constate le règlement d'une ligne `PENDING` (§8.3) : encaissement créé, ligne `SETTLED`. */
export async function settleRemittanceLine(
  tenantId: string,
  scope: ReturnScope,
  remittanceId: string,
  lineId: string,
  input: { settledAt: string },
  actorUserId: string | null
): Promise<RemittanceDto> {
  await settleLine(
    tenantId,
    scope,
    remittanceId,
    lineId,
    input.settledAt,
    { source: 'MANUAL', importId: null, actorUserId },
    new Date()
  );
  return reload(tenantId, scope, remittanceId);
}

/** Constate le rejet d'une ligne `PENDING` ou, tardivement, `SETTLED` (§8.4). */
export async function rejectRemittanceLine(
  tenantId: string,
  scope: ReturnScope,
  remittanceId: string,
  lineId: string,
  input: { rejectedAt: string; code?: string | null; reason?: string | null },
  actorUserId: string | null
): Promise<RemittanceDto> {
  await rejectLine(
    tenantId,
    scope,
    remittanceId,
    lineId,
    input.rejectedAt,
    { code: input.code?.trim() || null, reason: input.reason?.trim() || null },
    { source: 'MANUAL', importId: null, actorUserId },
    new Date()
  );
  return reload(tenantId, scope, remittanceId);
}

/** Constate le règlement de toutes les lignes `PENDING` ; l'échec d'une ligne n'arrête pas les autres. */
export async function settleAllRemittanceLines(
  tenantId: string,
  scope: ReturnScope,
  remittanceId: string,
  input: { settledAt: string },
  actorUserId: string | null
): Promise<SettleAllResult> {
  return settleAllLines(tenantId, scope, remittanceId, input.settledAt, actorUserId, new Date());
}

/** Aperçu d'un fichier de retour : lecture et rapprochement, aucune écriture (§8.5). */
export async function previewReturnFile(
  tenantId: string,
  scope: ReturnScope,
  file: { buffer: Buffer; originalname?: string } | undefined,
  format: string | undefined
): Promise<ReturnPreviewDto> {
  return previewReturnFileAt(tenantId, scope, file, format, new Date());
}

/** Application du même fichier : chaque action dans sa transaction, import tracé (§8.5). */
export async function applyReturnFile(
  tenantId: string,
  scope: ReturnScope,
  file: { buffer: Buffer; originalname?: string } | undefined,
  format: string | undefined,
  actorUserId: string | null
): Promise<ReturnApplyDto> {
  return applyReturnFileAt(tenantId, scope, file, format, actorUserId, new Date());
}

/** Historique des imports de retour du périmètre (§8.7). */
export async function listReturnImports(
  tenantId: string,
  scope: ReturnScope,
  query: { page: number; pageSize: number }
): Promise<{ items: ReturnImportDto[]; total: number; page: number; pageSize: number }> {
  return listReturnImportsFor(tenantId, scope, query);
}
