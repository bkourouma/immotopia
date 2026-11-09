import { prisma } from '../../../utils/database';
import { logger } from '../../../utils/logger';
import { discardTempProof } from './proof-files';

/**
 * Supprime les captures temporaires des lectures IA expirées, met `temp_file_url`
 * à null et rend le nombre de lectures purgées. Un échec isolé est journalisé
 * (identifiant seulement) et n'arrête pas les autres.
 */
export async function purgeExpiredProofReads(now: Date = new Date()): Promise<number> {
  const rows = await prisma.rentalPaymentProofRead.findMany({
    where: { expires_at: { lt: now }, temp_file_url: { not: null } },
    select: { id: true, tenant_id: true, temp_file_url: true }
  });
  let purged = 0;
  for (const row of rows) {
    try {
      const gone = await discardTempProof(row.tenant_id, row.temp_file_url as string);
      if (!gone) {
        logger.warn('[rental-declared] chemin de capture temporaire inattendu, non supprimé', { readId: row.id });
        continue;
      }
      await prisma.rentalPaymentProofRead.updateMany({
        where: { id: row.id, tenant_id: row.tenant_id },
        data: { temp_file_url: null }
      });
      purged += 1;
    } catch (error) {
      logger.warn('[rental-declared] purge de capture temporaire en échec', {
        readId: row.id,
        code: (error as NodeJS.ErrnoException)?.code
      });
    }
  }
  return purged;
}
