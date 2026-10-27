import { t } from '../../../i18n';
import { BadRequestError } from '../../../middleware/error-middleware';
import { createRemittance } from '../remittances';
import type { RemittanceDto, SkippedMandateDto } from '../remittance-dto';
import { assertSyndicateOfTenant, findSyndicCreditorId } from './creditors';
import type { CreateSyndicRemittanceInput } from './schemas';
import { syndicCtx } from './scope';

/**
 * Préparation d'une remise de copropriété (spec 042, P4, data-model §9.4) : le
 * créancier est celui du syndicat, jamais choisi par l'appelant. Les autres
 * opérations (lecture, actualisation, validation, fichier, dépôt, annulation)
 * sont celles de `../remittances`, appelées avec le périmètre `SYNDIC_LOT`.
 */
export async function createSyndicRemittance(
  tenantId: string,
  syndicateId: string,
  input: CreateSyndicRemittanceInput,
  actorUserId?: string | null,
  now: Date = new Date()
): Promise<{ remittance: RemittanceDto; skipped: SkippedMandateDto[] }> {
  await assertSyndicateOfTenant(tenantId, syndicateId);
  const creditorId = await findSyndicCreditorId(tenantId, syndicateId);
  if (!creditorId) {
    throw new BadRequestError(t("Configurez d'abord le compte de prélèvement du syndicat."));
  }
  return createRemittance(
    tenantId,
    { creditorId, collectionDate: input.collectionDate, notes: input.notes },
    actorUserId,
    now,
    syndicCtx(syndicateId)
  );
}
