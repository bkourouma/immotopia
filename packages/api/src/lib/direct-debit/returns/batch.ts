import { prisma } from '../../../utils/database';
import { logger } from '../../../utils/logger';
import { loadRemittanceDto, lineReferenceOf } from '../remittance-dto';
import { settleLine } from './lines';
import {
  checkReturnDate,
  errorNameOf,
  notFoundRemittance,
  publicErrorMessage,
  remittanceScopeWhere,
  RETURN_REMITTANCE_SELECT
} from './shared';
import type { ReturnScope, SettleAllResult } from './types';
import { ConflictError } from '../../../middleware/error-middleware';
import { t } from '../../../i18n';

/**
 * Constat de règlement de toute la remise (spec 042, P3, data-model §8.3) : chaque
 * ligne `PENDING` dans sa propre transaction, un échec est isolé et rapporté.
 */
export async function settleAllLines(
  tenantId: string,
  scope: ReturnScope,
  remittanceId: string,
  settledAtIso: string,
  actorUserId: string | null,
  now: Date
): Promise<SettleAllResult> {
  // Contrôles communs en amont : une date ou une remise invalide est UNE erreur, pas N échecs de lignes.
  const remittance = await prisma.directDebitRemittance.findFirst({
    where: { id: remittanceId, tenantId, ...remittanceScopeWhere(scope) },
    select: RETURN_REMITTANCE_SELECT
  });
  if (!remittance) throw notFoundRemittance();
  if (remittance.status !== 'EXPORTED' && remittance.status !== 'SUBMITTED') {
    throw new ConflictError(
      t(
        "Le retour de la banque ne se constate que sur une remise dont le fichier a été produit et qui n'est pas annulée."
      )
    );
  }
  checkReturnDate(settledAtIso, remittance.collectionDate, now);

  const lines = await prisma.directDebitRemittanceLine.findMany({
    where: { tenantId, remittanceId, status: 'PENDING' },
    orderBy: { lineNumber: 'asc' },
    select: { id: true, lineNumber: true }
  });

  let settled = 0;
  const failed: SettleAllResult['failed'] = [];
  for (const line of lines) {
    try {
      await settleLine(
        tenantId,
        scope,
        remittanceId,
        line.id,
        settledAtIso,
        { source: 'MANUAL', importId: null, actorUserId },
        now
      );
      settled += 1;
    } catch (error) {
      logger.warn('Prélèvement : règlement de ligne échoué dans le constat global', {
        tenantId,
        errorName: errorNameOf(error)
      });
      failed.push({
        lineId: line.id,
        reference: lineReferenceOf(remittance.year, remittance.sequence, line.lineNumber),
        error: publicErrorMessage(error)
      });
    }
  }

  const dto = await loadRemittanceDto(prisma, tenantId, remittanceId);
  if (!dto) throw notFoundRemittance();
  return { remittance: dto, settled, failed };
}
