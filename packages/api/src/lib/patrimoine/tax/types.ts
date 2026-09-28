/**
 * Types du moteur fiscal patrimoine (lot P4, territoire A1).
 *
 * Contrat : voir la section 2 du contrat partagé du lot (`p4-contrat.md`).
 * Ce fichier ne dépend d'aucune autre partie du moteur ; il n'importe rien.
 */

export type FiscalCountry = 'CI' | 'ML';
export type TaxKind = 'PROPERTY_TAX' | 'RENTAL_INCOME_TAX';
export type PropertyKind = 'BUILT' | 'UNBUILT';
export type Occupancy = 'MAIN_RESIDENCE' | 'OWNER_OCCUPIED' | 'RENTED' | 'VACANT';
export type OwnerKind = 'INDIVIDUAL' | 'COMPANY';
export type Selector<T> = T | 'ANY';
export type TaxBaseKind = 'RENTAL_VALUE' | 'MARKET_VALUE' | 'GROSS_RENT';
export type ParameterStatus = 'A_VALIDER' | 'VALIDE';
export type CountrySource = 'QUERY' | 'PROFILE' | 'ENTITY' | 'AGENCY';
export type HoldingEntityForm = 'SCI' | 'HOLDING' | 'COMPANY' | 'INDIVIDUAL' | 'OTHER';

export interface TaxParameterRow {
  id: string;
  country: FiscalCountry;
  year: number;
  taxKind: TaxKind;
  key: string;
  propertyKind: Selector<PropertyKind>;
  occupancy: Selector<Occupancy>;
  ownerKind: Selector<OwnerKind>;
  bracketIndex: number;
  lowerBound: number | null;
  upperBound: number | null;
  value: number | null;
  valueText: string | null;
  unit: 'PERCENT' | 'AMOUNT' | 'YEARS' | 'BOOLEAN' | 'CODE';
  label: string;
  source: string;
  sourceUrl: string | null;
  status: ParameterStatus;
  notes: string | null;
}

export interface TaxContext {
  propertyKind: PropertyKind;
  occupancy: Occupancy;
  ownerKind: OwnerKind;
}

export interface TaxEngineInput extends TaxContext {
  country: FiscalCountry | null;
  fiscalYear: number;
  /** Loyer annuel des baux actifs (YieldInput.annualRent). */
  annualRent: number;
  /** PropertyTaxProfile.declaredRentalValue. */
  declaredRentalValue: number | null;
  /** Dernière valorisation ; null si absente ou 0. */
  marketValue: number | null;
  exemptUntilYear: number | null;
}

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
