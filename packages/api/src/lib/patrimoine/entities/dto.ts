import type { CountrySource, FiscalCountry, Occupancy, TaxComputation } from '../tax/types';

/**
 * Formes de réponse HTTP exposées par ce lot (section 4 de `p4-contrat.md`),
 * identiques au contrat frontend `apps/web/src/types/patrimoine-entities-types.ts`.
 * `Decimal` → `number`, dates `effectiveFrom` en `AAAA-MM-JJ`, `createdAt`/
 * `updatedAt` en ISO.
 */

export type HoldingEntityForm = 'SCI' | 'HOLDING' | 'COMPANY' | 'INDIVIDUAL' | 'OTHER';

export interface HoldingEntitySummary {
  id: string;
  name: string;
  legalForm: HoldingEntityForm;
  country: FiscalCountry;
  rccm: string | null;
  taxId: string | null;
  isActive: boolean;
  parentEntity: { id: string; name: string } | null;
  contact: { id: string; displayName: string } | null;
  propertiesCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface HoldingEntityDetail extends HoldingEntitySummary {
  notes: string | null;
  fiscalOwnerKind: 'INDIVIDUAL' | 'COMPANY' | null;
  effectiveOwnerKind: 'INDIVIDUAL' | 'COMPANY';
  children: Array<{ id: string; name: string; legalForm: HoldingEntityForm }>;
  holdings: EntityHolding[];
}

export interface EntityHolding {
  id: string;
  propertyId: string;
  sharePercent: number;
  effectiveFrom: string | null;
  notes: string | null;
  property: { id: string; title: string; internalReference: string; propertyType: string; status: string };
  propertyTotalSharePercent: number;
}

export interface PropertyHoldingsData {
  propertyId: string;
  totalSharePercent: number;
  unassignedSharePercent: number;
  holdings: Array<{
    id: string;
    entityId: string;
    entityName: string;
    legalForm: HoldingEntityForm;
    country: FiscalCountry;
    sharePercent: number;
    effectiveFrom: string | null;
    notes: string | null;
  }>;
  entities: Array<{ id: string; name: string; legalForm: HoldingEntityForm; country: FiscalCountry }>;
}

export interface EntityConsolidation {
  entityId: string;
  asOf: string;
  currency: 'XOF';
  totals: {
    propertiesCount: number;
    estimatedValue: number;
    outstandingDebt: number;
    netEquity: number;
    annualRent: number;
    annualExpenses: number;
    annualLoanPayments: number;
    annualCashFlow: number;
    grossYield: number;
    netYield: number;
    netNetYield: number | null;
    latentCapitalGain: number | null;
    costBasisIncomplete: boolean;
  };
  properties: Array<{
    propertyId: string;
    title: string;
    internalReference: string;
    sharePercent: number;
    pending: boolean;
    estimatedValue: number;
    outstandingDebt: number;
    annualRent: number;
    annualExpenses: number;
    annualLoanPayments: number;
    annualCashFlow: number;
    grossYield: number;
    netYield: number;
  }>;
}

export interface PropertyTaxProfileData {
  propertyId: string;
  profile: {
    country: FiscalCountry | null;
    builtStatus: 'BUILT' | 'UNBUILT' | null;
    occupancy: Occupancy | null;
    declaredRentalValue: number | null;
    exemptUntilYear: number | null;
    exemptionReason: string | null;
    notes: string | null;
    updatedAt: string;
  } | null;
  derived: {
    builtStatus: 'BUILT' | 'UNBUILT';
    occupancy: Occupancy;
    annualRent: number;
    marketValue: number | null;
    country: FiscalCountry | null;
    countrySource: CountrySource | null;
  };
}

export interface PropertyTaxEstimate {
  propertyId: string;
  fiscalYear: number;
  country: FiscalCountry | null;
  countrySource: CountrySource | null;
  parametersYear: number | null;
  parametersFallback: boolean;
  allParametersValidated: boolean;
  inputs: {
    propertyKind: 'BUILT' | 'UNBUILT';
    occupancy: Occupancy;
    annualRent: number;
    declaredRentalValue: number | null;
    marketValue: number | null;
    exemptUntilYear: number | null;
  };
  holders: Array<{
    entityId: string | null;
    entityName: string | null;
    sharePercent: number;
    ownerKind: 'INDIVIDUAL' | 'COMPANY';
    taxes: TaxComputation[];
    totalShare: number;
  }>;
  totalShare: number;
}

export interface EntityTaxEstimate {
  entityId: string;
  fiscalYear: number;
  ownerKind: 'INDIVIDUAL' | 'COMPANY';
  parameters: Array<{ country: FiscalCountry; parametersYear: number | null; fallback: boolean }>;
  allParametersValidated: boolean;
  totals: { PROPERTY_TAX: number; RENTAL_INCOME_TAX: number; total: number };
  properties: Array<{
    propertyId: string;
    title: string;
    internalReference: string;
    sharePercent: number;
    partialYear: boolean;
    country: FiscalCountry | null;
    parametersYear: number | null;
    taxes: TaxComputation[];
    amountShareByKind: { PROPERTY_TAX: number; RENTAL_INCOME_TAX: number };
    totalShare: number;
  }>;
}

export interface TaxParametersData {
  countries: Array<{ country: FiscalCountry; years: number[] }>;
  country: FiscalCountry;
  requestedYear: number | null;
  parametersYear: number | null;
  fallback: boolean;
  parameters: Array<Omit<import('../tax/types').TaxParameterRow, 'country' | 'year'>>;
}
