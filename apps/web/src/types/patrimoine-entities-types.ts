/**
 * Types du lot P4 — entités détentrices (SCI/holding) et fiscalité CI/ML.
 *
 * Source du contrat : `p4-contrat.md` §4 (et §2 pour le moteur fiscal). Le
 * backend produit exactement ces formes : `Decimal` converti en `number`,
 * dates `YYYY-MM-DD` pour `effectiveFrom`, ISO pour `createdAt`/`updatedAt`.
 */

export type HoldingEntityForm = 'SCI' | 'HOLDING' | 'COMPANY' | 'INDIVIDUAL' | 'OTHER';
export type FiscalCountry = 'CI' | 'ML';
export type Occupancy = 'MAIN_RESIDENCE' | 'OWNER_OCCUPIED' | 'RENTED' | 'VACANT';
export type CountrySource = 'QUERY' | 'PROFILE' | 'ENTITY' | 'AGENCY';
export type FiscalOwnerKind = 'INDIVIDUAL' | 'COMPANY';
export type BuiltStatus = 'BUILT' | 'UNBUILT';

// --- Moteur fiscal (identiques à la section 2 du contrat) ------------------

export type TaxKind = 'PROPERTY_TAX' | 'RENTAL_INCOME_TAX';
export type ParameterStatus = 'A_VALIDER' | 'VALIDE';
export type TaxPropertyKindSelector = BuiltStatus | 'ANY';
export type TaxOccupancySelector = Occupancy | 'ANY';
export type TaxOwnerKindSelector = FiscalOwnerKind | 'ANY';
export type TaxParameterUnit = 'PERCENT' | 'AMOUNT' | 'YEARS' | 'BOOLEAN' | 'CODE';

export type TaxReason =
  'EXEMPT' | 'TEMPORARY_EXEMPTION' | 'NOT_APPLICABLE' | 'NO_PARAMETERS' | 'NO_BASE' | 'UNSUPPORTED_COUNTRY';

export type TaxWarning =
  | 'MISSING_RATE'
  | 'RENTAL_VALUE_ESTIMATED'
  | 'NO_MARKET_VALUE'
  | 'PARAMETERS_FALLBACK'
  | 'PARAMETERS_NOT_VALIDATED'
  | 'UNKNOWN_BASE_KIND';

export type TaxLineCode =
  'BASE' | 'ABATEMENT' | 'TAXABLE_BASE' | 'PRINCIPAL' | 'BRACKET' | 'MINIMUM' | 'SURCHARGE' | 'EXEMPTION';

export interface TaxLine {
  code: TaxLineCode;
  label: string;
  base: number | null;
  /** En points : 9 pour 9 %. */
  rate: number | null;
  amount: number;
  parameterId: string | null;
  parameterKey: string | null;
  source: string | null;
  status: ParameterStatus | null;
}

export type TaxBaseKind = 'RENTAL_VALUE' | 'MARKET_VALUE' | 'GROSS_RENT';

export interface TaxComputation {
  taxKind: TaxKind;
  applicable: boolean;
  reason: TaxReason | null;
  parametersYear: number | null;
  parametersFallback: boolean;
  baseKind: TaxBaseKind | null;
  amountFull: number;
  lines: TaxLine[];
  warnings: TaxWarning[];
  allParametersValidated: boolean;
}

export interface TaxParameterRow {
  id: string;
  country: FiscalCountry;
  year: number;
  taxKind: TaxKind;
  key: string;
  propertyKind: TaxPropertyKindSelector;
  occupancy: TaxOccupancySelector;
  ownerKind: TaxOwnerKindSelector;
  bracketIndex: number;
  lowerBound: number | null;
  upperBound: number | null;
  value: number | null;
  valueText: string | null;
  unit: TaxParameterUnit;
  label: string;
  source: string;
  sourceUrl: string | null;
  status: ParameterStatus;
  notes: string | null;
}

// --- Entités détentrices -----------------------------------------------

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
  fiscalOwnerKind: FiscalOwnerKind | null;
  effectiveOwnerKind: FiscalOwnerKind;
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
    builtStatus: BuiltStatus | null;
    occupancy: Occupancy | null;
    declaredRentalValue: number | null;
    exemptUntilYear: number | null;
    exemptionReason: string | null;
    notes: string | null;
    updatedAt: string;
  } | null;
  derived: {
    builtStatus: BuiltStatus;
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
    propertyKind: BuiltStatus;
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
    ownerKind: FiscalOwnerKind;
    taxes: TaxComputation[];
    totalShare: number;
  }>;
  totalShare: number;
}

export interface EntityTaxEstimate {
  entityId: string;
  fiscalYear: number;
  ownerKind: FiscalOwnerKind;
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
  parameters: Array<Omit<TaxParameterRow, 'country' | 'year'>>;
}

// --- Entrées (payloads) -------------------------------------------------

export interface CreateHoldingEntityInput {
  name: string;
  legalForm: HoldingEntityForm;
  country: FiscalCountry;
  rccm?: string | null;
  taxId?: string | null;
  contactId?: string | null;
  parentEntityId?: string | null;
  fiscalOwnerKind?: FiscalOwnerKind | null;
  notes?: string | null;
}

export type UpdateHoldingEntityInput = Partial<CreateHoldingEntityInput> & { isActive?: boolean };

export interface EntityHoldingInput {
  propertyId: string;
  sharePercent: number;
  effectiveFrom?: string | null;
  notes?: string | null;
}

export interface EntityHoldingUpdateInput {
  sharePercent?: number;
  effectiveFrom?: string | null;
  notes?: string | null;
}

export interface PropertyHoldingsInput {
  holdings: Array<{ entityId: string; sharePercent: number; effectiveFrom?: string | null; notes?: string | null }>;
}

export interface PropertyTaxProfileInput {
  country?: FiscalCountry | null;
  builtStatus?: BuiltStatus | null;
  occupancy?: Occupancy | null;
  declaredRentalValue?: number | null;
  exemptUntilYear?: number | null;
  exemptionReason?: string | null;
  notes?: string | null;
}

export interface HoldingEntitiesFilters {
  search?: string;
  legalForm?: HoldingEntityForm;
  country?: FiscalCountry;
  includeInactive?: boolean;
}
