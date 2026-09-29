import { prisma } from '../../../utils/database';
import { getPropertyForTenant } from '../../../utils/property-tenant-guard';
import { NotFoundError } from '../../../middleware/error-middleware';
import { computePropertyTaxes, applyShare } from './engine';
import { deriveBuiltStatus, deriveOccupancy, normalizeCountry, ownerKindOf, resolveTaxCountry } from './inputs';
import type { FiscalCountry, TaxComputation, TaxEngineInput, TaxKind, TaxParameterRow } from './types';
import { loadPropertyYieldInput } from '../entities/yield-input-adapter';
import type { TaxProfileInput } from './schemas';
import type {
  EntityTaxEstimate,
  PropertyTaxEstimate,
  PropertyTaxProfileData,
  TaxParametersData
} from '../entities/dto';

/**
 * Service fiscal (profil fiscal d'un bien, estimations, référentiel) — lot
 * P4, territoire A2. Contrat : section 3 de `p4-contrat.md`.
 */

const SHARE_TOLERANCE = 0.0001;

// ---------------------------------------------------------------------------
// Chargement des paramètres
// ---------------------------------------------------------------------------

async function loadTaxParameterRows(country: FiscalCountry, maxYear: number): Promise<TaxParameterRow[]> {
  const rows = await prisma.taxParameter.findMany({ where: { country, year: { lte: maxYear } } });
  return rows.map(row => ({
    id: row.id,
    country: row.country as FiscalCountry,
    year: row.year,
    taxKind: row.taxKind as TaxKind,
    key: row.key,
    propertyKind: row.propertyKind as TaxParameterRow['propertyKind'],
    occupancy: row.occupancy as TaxParameterRow['occupancy'],
    ownerKind: row.ownerKind as TaxParameterRow['ownerKind'],
    bracketIndex: row.bracketIndex,
    lowerBound: row.lowerBound === null ? null : Number(row.lowerBound),
    upperBound: row.upperBound === null ? null : Number(row.upperBound),
    value: row.value === null ? null : Number(row.value),
    valueText: row.valueText,
    unit: row.unit,
    label: row.label,
    source: row.source,
    sourceUrl: row.sourceUrl,
    status: row.status,
    notes: row.notes
  }));
}

// ---------------------------------------------------------------------------
// Profil fiscal d'un bien
// ---------------------------------------------------------------------------

async function derivedProfileData(
  tenantId: string,
  propertyId: string,
  profile: { country: string | null; builtStatus: string | null; occupancy: string | null } | null
) {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, tenantId },
    select: { propertyType: true }
  });
  const yieldInput = await loadPropertyYieldInput(tenantId, propertyId);
  const holdings = await prisma.propertyHolding.findMany({
    where: { tenantId, propertyId },
    select: { entity: { select: { country: true } } }
  });
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { country: true } });

  const builtStatus = deriveBuiltStatus(property?.propertyType ?? null, (profile?.builtStatus as any) ?? null);
  const occupancy = deriveOccupancy(yieldInput.annualRent, (profile?.occupancy as any) ?? null);
  const { country, countrySource } = resolveTaxCountry({
    query: null,
    profile: (profile?.country as FiscalCountry) ?? null,
    entityCountries: holdings.map(h => h.entity.country as FiscalCountry),
    agencyCountry: tenant?.country ?? null
  });

  return {
    builtStatus,
    occupancy,
    annualRent: yieldInput.annualRent,
    marketValue: yieldInput.currentValue > 0 ? yieldInput.currentValue : null,
    country,
    countrySource
  };
}

export async function getPropertyTaxProfile(tenantId: string, propertyId: string): Promise<PropertyTaxProfileData> {
  await getPropertyForTenant(propertyId, tenantId);
  const profile = await prisma.propertyTaxProfile.findFirst({ where: { tenantId, propertyId } });
  const derived = await derivedProfileData(tenantId, propertyId, profile);

  return {
    propertyId,
    profile: profile
      ? {
          country: profile.country as FiscalCountry | null,
          builtStatus: profile.builtStatus as 'BUILT' | 'UNBUILT' | null,
          occupancy: profile.occupancy as PropertyTaxProfileData['derived']['occupancy'] | null,
          declaredRentalValue: profile.declaredRentalValue === null ? null : Number(profile.declaredRentalValue),
          exemptUntilYear: profile.exemptUntilYear,
          exemptionReason: profile.exemptionReason,
          notes: profile.notes,
          updatedAt: profile.updatedAt.toISOString()
        }
      : null,
    derived
  };
}

export async function setPropertyTaxProfile(
  tenantId: string,
  propertyId: string,
  input: TaxProfileInput,
  actorUserId?: string
): Promise<PropertyTaxProfileData> {
  await getPropertyForTenant(propertyId, tenantId);

  await prisma.propertyTaxProfile.upsert({
    where: { propertyId },
    create: {
      tenantId,
      propertyId,
      country: input.country ?? null,
      builtStatus: input.builtStatus ?? null,
      occupancy: input.occupancy ?? null,
      declaredRentalValue:
        input.declaredRentalValue === undefined || input.declaredRentalValue === null
          ? null
          : input.declaredRentalValue,
      exemptUntilYear: input.exemptUntilYear ?? null,
      exemptionReason: input.exemptionReason ?? null,
      notes: input.notes ?? null,
      updatedByUserId: actorUserId ?? null
    },
    update: {
      country: input.country,
      builtStatus: input.builtStatus,
      occupancy: input.occupancy,
      declaredRentalValue: input.declaredRentalValue,
      exemptUntilYear: input.exemptUntilYear,
      exemptionReason: input.exemptionReason,
      notes: input.notes,
      updatedByUserId: actorUserId ?? null
    }
  });

  return getPropertyTaxProfile(tenantId, propertyId);
}

// ---------------------------------------------------------------------------
// Estimation fiscale d'un bien (tous détenteurs)
// ---------------------------------------------------------------------------

function currentUtcYear(): number {
  return new Date().getUTCFullYear();
}

function mergeComputations(computations: TaxComputation[]): {
  parametersYear: number | null;
  parametersFallback: boolean;
  allParametersValidated: boolean;
} {
  let parametersYear: number | null = null;
  let parametersFallback = false;
  let allParametersValidated = true;
  for (const computation of computations) {
    if (computation.parametersYear !== null) parametersYear = computation.parametersYear;
    if (computation.parametersFallback) parametersFallback = true;
    if (!computation.allParametersValidated) allParametersValidated = false;
  }
  return { parametersYear, parametersFallback, allParametersValidated };
}

export async function getPropertyTaxEstimate(
  tenantId: string,
  propertyId: string,
  query: { year?: number; country?: FiscalCountry }
): Promise<PropertyTaxEstimate> {
  const property = await getPropertyForTenant(propertyId, tenantId);
  const profile = await prisma.propertyTaxProfile.findFirst({ where: { tenantId, propertyId } });
  const yieldInput = await loadPropertyYieldInput(tenantId, propertyId);
  const holdings = await prisma.propertyHolding.findMany({
    where: { tenantId, propertyId },
    include: { entity: { select: { id: true, name: true, legalForm: true, fiscalOwnerKind: true, country: true } } }
  });
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { country: true } });

  const fiscalYear = query.year ?? currentUtcYear();
  const builtStatus = deriveBuiltStatus(property.propertyType, (profile?.builtStatus as any) ?? null);
  const occupancy = deriveOccupancy(yieldInput.annualRent, (profile?.occupancy as any) ?? null);

  const { country, countrySource } = resolveTaxCountry({
    query: query.country ?? null,
    profile: (profile?.country as FiscalCountry) ?? null,
    entityCountries: holdings.map(h => h.entity.country as FiscalCountry),
    agencyCountry: tenant?.country ?? null
  });

  const rows = country ? await loadTaxParameterRows(country, fiscalYear) : [];

  const baseInput: Omit<TaxEngineInput, 'ownerKind'> = {
    country,
    fiscalYear,
    propertyKind: builtStatus,
    occupancy,
    annualRent: yieldInput.annualRent,
    declaredRentalValue:
      profile?.declaredRentalValue === null || profile?.declaredRentalValue === undefined
        ? null
        : Number(profile.declaredRentalValue),
    marketValue: yieldInput.currentValue > 0 ? yieldInput.currentValue : null,
    exemptUntilYear: profile?.exemptUntilYear ?? null
  };

  const holders: PropertyTaxEstimate['holders'] = [];
  const allComputations: TaxComputation[] = [];
  let assignedShare = 0;

  for (const holding of holdings) {
    const ownerKind = ownerKindOf({
      legalForm: holding.entity.legalForm,
      fiscalOwnerKind: holding.entity.fiscalOwnerKind as any
    });
    const taxes = computePropertyTaxes({ ...baseInput, ownerKind }, rows);
    allComputations.push(...taxes);
    const { totalShare } = applyShare(taxes, Number(holding.sharePercent));
    assignedShare += Number(holding.sharePercent);
    holders.push({
      entityId: holding.entity.id,
      entityName: holding.entity.name,
      sharePercent: Number(holding.sharePercent),
      ownerKind,
      taxes,
      totalShare
    });
  }

  const unassignedShare = Math.max(0, 100 - assignedShare);
  if (unassignedShare > SHARE_TOLERANCE || holdings.length === 0) {
    const taxes = computePropertyTaxes({ ...baseInput, ownerKind: 'INDIVIDUAL' }, rows);
    allComputations.push(...taxes);
    const { totalShare } = applyShare(taxes, unassignedShare > SHARE_TOLERANCE ? unassignedShare : 100);
    holders.push({
      entityId: null,
      entityName: null,
      sharePercent: unassignedShare > SHARE_TOLERANCE ? unassignedShare : 100,
      ownerKind: 'INDIVIDUAL',
      taxes,
      totalShare
    });
  }

  const merged = mergeComputations(allComputations);
  const totalShare = holders.reduce((sum, holder) => sum + holder.totalShare, 0);

  return {
    propertyId,
    fiscalYear,
    country,
    countrySource,
    parametersYear: merged.parametersYear,
    parametersFallback: merged.parametersFallback,
    allParametersValidated: merged.allParametersValidated,
    inputs: {
      propertyKind: builtStatus,
      occupancy,
      annualRent: yieldInput.annualRent,
      declaredRentalValue: baseInput.declaredRentalValue,
      marketValue: baseInput.marketValue,
      exemptUntilYear: baseInput.exemptUntilYear
    },
    holders,
    totalShare
  };
}

// ---------------------------------------------------------------------------
// Estimation fiscale d'une entité (tous ses biens)
// ---------------------------------------------------------------------------

export async function getEntityTaxEstimate(
  tenantId: string,
  entityId: string,
  query: { year?: number }
): Promise<EntityTaxEstimate> {
  const entity = await prisma.holdingEntity.findFirst({ where: { id: entityId, tenantId } });
  if (!entity) throw new NotFoundError('Entité introuvable.');

  const fiscalYear = query.year ?? currentUtcYear();
  const ownerKind = ownerKindOf({ legalForm: entity.legalForm, fiscalOwnerKind: entity.fiscalOwnerKind as any });

  const holdings = await prisma.propertyHolding.findMany({
    where: { tenantId, entityId },
    include: { property: { select: { id: true, title: true, internalReference: true, propertyType: true } } }
  });

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { country: true } });
  const endOfYear = new Date(Date.UTC(fiscalYear, 11, 31, 23, 59, 59, 999));
  const startOfYear = new Date(Date.UTC(fiscalYear, 0, 1));

  const counted = holdings.filter(h => !h.effectiveFrom || h.effectiveFrom.getTime() <= endOfYear.getTime());

  const properties: EntityTaxEstimate['properties'] = [];
  const allComputations: TaxComputation[] = [];
  const parametersByCountry = new Map<FiscalCountry, { parametersYear: number | null; fallback: boolean }>();
  const totals: EntityTaxEstimate['totals'] = { PROPERTY_TAX: 0, RENTAL_INCOME_TAX: 0, total: 0 };

  for (const holding of counted) {
    const profile = await prisma.propertyTaxProfile.findFirst({
      where: { tenantId, propertyId: holding.propertyId }
    });
    const yieldInput = await loadPropertyYieldInput(tenantId, holding.propertyId);

    const { country } = resolveTaxCountry({
      query: null,
      profile: (profile?.country as FiscalCountry) ?? null,
      entityCountries: [entity.country as FiscalCountry],
      agencyCountry: tenant?.country ?? null
    });

    const builtStatus = deriveBuiltStatus(holding.property.propertyType, (profile?.builtStatus as any) ?? null);
    const occupancy = deriveOccupancy(yieldInput.annualRent, (profile?.occupancy as any) ?? null);
    const rows = country ? await loadTaxParameterRows(country, fiscalYear) : [];

    const taxes = computePropertyTaxes(
      {
        country,
        fiscalYear,
        propertyKind: builtStatus,
        occupancy,
        ownerKind,
        annualRent: yieldInput.annualRent,
        declaredRentalValue:
          profile?.declaredRentalValue === null || profile?.declaredRentalValue === undefined
            ? null
            : Number(profile.declaredRentalValue),
        marketValue: yieldInput.currentValue > 0 ? yieldInput.currentValue : null,
        exemptUntilYear: profile?.exemptUntilYear ?? null
      },
      rows
    );
    allComputations.push(...taxes);

    const { amountShareByKind, totalShare } = applyShare(taxes, Number(holding.sharePercent));
    totals.PROPERTY_TAX += amountShareByKind.PROPERTY_TAX;
    totals.RENTAL_INCOME_TAX += amountShareByKind.RENTAL_INCOME_TAX;
    totals.total += totalShare;

    const propertyTaxComputation = taxes.find(t => t.taxKind === 'PROPERTY_TAX');
    if (country && !parametersByCountry.has(country)) {
      parametersByCountry.set(country, {
        parametersYear: propertyTaxComputation?.parametersYear ?? null,
        fallback: propertyTaxComputation?.parametersFallback ?? false
      });
    }

    const partialYear = Boolean(holding.effectiveFrom && holding.effectiveFrom.getTime() > startOfYear.getTime());

    properties.push({
      propertyId: holding.propertyId,
      title: holding.property.title,
      internalReference: holding.property.internalReference,
      sharePercent: Number(holding.sharePercent),
      partialYear,
      country,
      parametersYear: propertyTaxComputation?.parametersYear ?? null,
      taxes,
      amountShareByKind,
      totalShare
    });
  }

  const merged = mergeComputations(allComputations);

  return {
    entityId,
    fiscalYear,
    ownerKind,
    parameters: Array.from(parametersByCountry.entries()).map(([country, info]) => ({
      country,
      parametersYear: info.parametersYear,
      fallback: info.fallback
    })),
    allParametersValidated: merged.allParametersValidated,
    totals,
    properties
  };
}

// ---------------------------------------------------------------------------
// Référentiel des paramètres fiscaux (lecture seule)
// ---------------------------------------------------------------------------

export async function getTaxParameters(query: { country: FiscalCountry; year?: number }): Promise<TaxParametersData> {
  const allYearsRows = await prisma.taxParameter.groupBy({ by: ['country', 'year'] });
  const countries = new Map<FiscalCountry, number[]>();
  for (const row of allYearsRows) {
    const country = row.country as FiscalCountry;
    const list = countries.get(country) ?? [];
    list.push(row.year);
    countries.set(country, list);
  }
  for (const list of countries.values()) list.sort((a, b) => a - b);

  const availableYears = countries.get(query.country) ?? [];
  const requestedYear = query.year ?? null;
  const maxYear = requestedYear ?? currentUtcYear();
  const eligibleYears = availableYears.filter(year => year <= maxYear);
  const parametersYear = eligibleYears.length > 0 ? Math.max(...eligibleYears) : null;
  const fallback = parametersYear !== null && parametersYear !== maxYear;

  const rows =
    parametersYear === null
      ? []
      : await prisma.taxParameter.findMany({ where: { country: query.country, year: parametersYear } });

  return {
    countries: Array.from(countries.entries()).map(([country, years]) => ({ country, years })),
    country: query.country,
    requestedYear,
    parametersYear,
    fallback,
    parameters: rows.map(row => ({
      id: row.id,
      taxKind: row.taxKind as TaxKind,
      key: row.key,
      propertyKind: row.propertyKind as TaxParameterRow['propertyKind'],
      occupancy: row.occupancy as TaxParameterRow['occupancy'],
      ownerKind: row.ownerKind as TaxParameterRow['ownerKind'],
      bracketIndex: row.bracketIndex,
      lowerBound: row.lowerBound === null ? null : Number(row.lowerBound),
      upperBound: row.upperBound === null ? null : Number(row.upperBound),
      value: row.value === null ? null : Number(row.value),
      valueText: row.valueText,
      unit: row.unit,
      label: row.label,
      source: row.source,
      sourceUrl: row.sourceUrl,
      status: row.status,
      notes: row.notes
    }))
  };
}

// Utilitaire exporté pour les tests unitaires (normalisation du pays agence).
export { normalizeCountry };
