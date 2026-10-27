import { prisma } from '../../utils/database';
import { logger } from '../../utils/logger';
import { NotFoundError } from '../../middleware/error-middleware';
import { t } from '../../i18n';
import { assertSyndicateOfTenant } from './charge-allocation';
import {
  CHARGE_ALLOCATION_LOT_TYPES,
  lotTypesMissingFromRates,
  parseLotTypeRates,
  type LotTypeRates
} from './charge-allocation-methods';
import { lotTypeRatesSchema } from './lot-type-rates-schemas';

/**
 * Barème par type de lot d'une copropriété (menu lot 2) : montant PAR LOT pour
 * chaque type, paramétré une fois par l'administrateur et appliqué par le mode
 * de répartition `BY_LOT_TYPE`. Stocké dans `Syndicate.lotTypeRates`.
 *
 * Toute requête est filtrée par agence ; une copropriété d'une autre agence
 * lève la même `NotFoundError` qu'une copropriété inexistante.
 */

export interface LotTypeRatesView {
  rates: LotTypeRates;
  lotTypesPresent: Array<{ lotType: string; count: number }>;
  missingTypes: string[];
  isEmpty: boolean;
  updatedAt: string | null;
}

async function buildView(tenantId: string, syndicateId: string): Promise<LotTypeRatesView> {
  const syndicate = await prisma.syndicate.findFirst({
    where: { id: syndicateId, tenantId },
    select: { lotTypeRates: true, lotTypeRatesUpdatedAt: true }
  });
  if (!syndicate) throw new NotFoundError(t('Copropriété introuvable ou inaccessible.'));

  const groups = await prisma.syndicateLot.groupBy({
    by: ['lotType'],
    where: { syndicateId, syndicate: { tenantId } },
    _count: { _all: true }
  });
  const counts = new Map<string, number>(groups.map(group => [String(group.lotType), Number(group._count._all)]));
  const lotTypesPresent = CHARGE_ALLOCATION_LOT_TYPES.filter(type => (counts.get(type) ?? 0) > 0).map(lotType => ({
    lotType: lotType as string,
    count: counts.get(lotType) as number
  }));

  const rates = parseLotTypeRates(syndicate.lotTypeRates);
  return {
    rates,
    lotTypesPresent,
    missingTypes: lotTypesMissingFromRates(lotTypesPresent, rates),
    isEmpty: Object.keys(rates).length === 0,
    updatedAt: syndicate.lotTypeRatesUpdatedAt ? syndicate.lotTypeRatesUpdatedAt.toISOString() : null
  };
}

export async function getLotTypeRates(tenantId: string, syndicateId: string): Promise<LotTypeRatesView> {
  return buildView(tenantId, syndicateId);
}

/** Remplace le barème (PUT) : types connus, montants >= 0, au moins une valeur (ZodError sinon). */
export async function updateLotTypeRates(
  tenantId: string,
  syndicateId: string,
  rates: unknown,
  actorUserId: string | null
): Promise<LotTypeRatesView> {
  await assertSyndicateOfTenant(prisma, tenantId, syndicateId);
  const parsed = lotTypeRatesSchema.parse(rates);
  const clean: Record<string, number> = {};
  for (const lotType of CHARGE_ALLOCATION_LOT_TYPES) {
    const amount = parsed[lotType];
    if (amount !== undefined) clean[lotType] = amount;
  }

  // updateMany filtré par agence : jamais d'écriture par id seul.
  const result = await prisma.syndicate.updateMany({
    where: { id: syndicateId, tenantId },
    data: { lotTypeRates: clean, lotTypeRatesUpdatedAt: new Date(), lotTypeRatesUpdatedById: actorUserId }
  });
  if (result.count === 0) throw new NotFoundError(t('Copropriété introuvable ou inaccessible.'));

  logger.info('Audit: syndic lot type rates updated', { tenantId, syndicateId, actorUserId, rates: clean });
  return buildView(tenantId, syndicateId);
}
