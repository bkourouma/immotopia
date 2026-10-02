import { prisma } from '../../utils/database';
import { getPropertyForTenant } from '../../utils/property-tenant-guard';
import { PROJECTION_DEFAULTS, projectionOverridesSchema } from './schemas';
import type { BankRatioAssumptions } from './yield';

/**
 * Hypotheses de projection enregistrees par bien (spec 029).
 *
 * Priorite par champ : requete > enregistrees en base > valeurs par defaut de
 * `projectionQuerySchema`. Le `tenantId` vient toujours du contexte d'agence,
 * jamais du corps de la requete.
 */

export interface YieldAssumptionsData {
  assumptions: BankRatioAssumptions;
  saved: boolean;
  updatedAt: string | null;
}

type StoredAssumptions = {
  years: number;
  valueGrowthRate: unknown;
  rentGrowthRate: unknown;
  expenseGrowthRate: unknown;
  vacancyRate: unknown;
  updatedAt: Date;
};

function fromRow(row: StoredAssumptions): BankRatioAssumptions {
  return {
    years: row.years,
    valueGrowthRate: Number(row.valueGrowthRate),
    rentGrowthRate: Number(row.rentGrowthRate),
    expenseGrowthRate: Number(row.expenseGrowthRate),
    vacancyRate: Number(row.vacancyRate)
  };
}

async function findStored(tenantId: string, propertyId: string) {
  return prisma.propertyYieldAssumption.findFirst({ where: { tenantId, propertyId } });
}

function toData(row: StoredAssumptions | null): YieldAssumptionsData {
  return row
    ? { assumptions: fromRow(row), saved: true, updatedAt: row.updatedAt.toISOString() }
    : { assumptions: { ...PROJECTION_DEFAULTS }, saved: false, updatedAt: null };
}

export async function getYieldAssumptions(tenantId: string, propertyId: string): Promise<YieldAssumptionsData> {
  await getPropertyForTenant(propertyId, tenantId);
  return toData(await findStored(tenantId, propertyId));
}

export async function setYieldAssumptions(
  tenantId: string,
  propertyId: string,
  input: BankRatioAssumptions,
  actorUserId?: string
): Promise<YieldAssumptionsData> {
  await getPropertyForTenant(propertyId, tenantId);

  const row = await prisma.propertyYieldAssumption.upsert({
    where: { propertyId, tenantId },
    create: { tenantId, propertyId, ...input, updatedByUserId: actorUserId ?? null },
    update: { ...input, updatedByUserId: actorUserId ?? null }
  });
  return toData(row);
}

/**
 * Hypotheses reellement appliquees a un calcul. `query` est `req.query` : un
 * parametre fourni et valide l'emporte, un invalide leve la meme erreur 400
 * que `projectionQuerySchema` ; les champs absents viennent de la base puis
 * des valeurs par defaut. Le bien est deja verifie par l'appelant.
 */
export async function resolveAppliedAssumptions(
  tenantId: string,
  propertyId: string,
  query: unknown
): Promise<{ assumptions: BankRatioAssumptions; assumptionsSaved: boolean }> {
  const overrides = projectionOverridesSchema.parse(query);
  const stored = await findStored(tenantId, propertyId);
  const base = stored ? fromRow(stored) : { ...PROJECTION_DEFAULTS };

  const assumptions: BankRatioAssumptions = { ...base };
  for (const key of Object.keys(assumptions) as Array<keyof BankRatioAssumptions>) {
    const provided = overrides[key];
    if (provided !== undefined) assumptions[key] = provided;
  }
  return { assumptions, assumptionsSaved: stored !== null };
}
