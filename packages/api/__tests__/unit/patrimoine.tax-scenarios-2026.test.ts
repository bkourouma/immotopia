import { computeTax } from '../../src/lib/patrimoine/tax/engine';
import type { TaxEngineInput } from '../../src/lib/patrimoine/tax/types';
import { TAX_PARAMETERS_2026 } from '../fixtures/tax-parameters-2026';

function input(overrides: Partial<TaxEngineInput>): TaxEngineInput {
  return {
    country: 'CI',
    fiscalYear: 2026,
    propertyKind: 'BUILT',
    occupancy: 'RENTED',
    ownerKind: 'INDIVIDUAL',
    annualRent: 0,
    declaredRentalValue: null,
    marketValue: null,
    exemptUntilYear: null,
    ...overrides
  };
}

describe('Scénarios de contrôle 2026 (section 6 du contrat P4)', () => {
  it('CI, bâti loué, personne physique, loyer 1 200 000 : impôt foncier 108 000, IRF 36 000, total 144 000 (12 %)', () => {
    const propertyTax = computeTax(
      'PROPERTY_TAX',
      input({ occupancy: 'RENTED', ownerKind: 'INDIVIDUAL', annualRent: 1_200_000 }),
      TAX_PARAMETERS_2026
    );
    const rentalIncomeTax = computeTax(
      'RENTAL_INCOME_TAX',
      input({ occupancy: 'RENTED', ownerKind: 'INDIVIDUAL', annualRent: 1_200_000 }),
      TAX_PARAMETERS_2026
    );

    expect(propertyTax.amountFull).toBe(108_000);
    expect(rentalIncomeTax.amountFull).toBe(36_000);
    expect(propertyTax.amountFull + rentalIncomeTax.amountFull).toBe(144_000);
  });

  it('CI, bâti loué, société, loyer 1 200 000 : 132 000 + 48 000 = 180 000 (15 %)', () => {
    const propertyTax = computeTax(
      'PROPERTY_TAX',
      input({ occupancy: 'RENTED', ownerKind: 'COMPANY', annualRent: 1_200_000 }),
      TAX_PARAMETERS_2026
    );
    const rentalIncomeTax = computeTax(
      'RENTAL_INCOME_TAX',
      input({ occupancy: 'RENTED', ownerKind: 'COMPANY', annualRent: 1_200_000 }),
      TAX_PARAMETERS_2026
    );

    expect(propertyTax.amountFull).toBe(132_000);
    expect(rentalIncomeTax.amountFull).toBe(48_000);
    expect(propertyTax.amountFull + rentalIncomeTax.amountFull).toBe(180_000);
  });

  it('CI, habitation principale, valeur marchande 50 000 000 : impôt foncier 250 000, IRF non applicable', () => {
    const propertyTax = computeTax(
      'PROPERTY_TAX',
      input({ occupancy: 'MAIN_RESIDENCE', ownerKind: 'INDIVIDUAL', marketValue: 50_000_000 }),
      TAX_PARAMETERS_2026
    );
    const rentalIncomeTax = computeTax(
      'RENTAL_INCOME_TAX',
      input({ occupancy: 'MAIN_RESIDENCE', ownerKind: 'INDIVIDUAL', marketValue: 50_000_000 }),
      TAX_PARAMETERS_2026
    );

    expect(propertyTax.amountFull).toBe(250_000);
    expect(rentalIncomeTax.applicable).toBe(false);
    expect(rentalIncomeTax.reason).toBe('NOT_APPLICABLE');
  });

  it('CI, terrain non bâti, valeur marchande 20 000 000 : impôt foncier 200 000, IRF non applicable (vacant déduit)', () => {
    const propertyTax = computeTax(
      'PROPERTY_TAX',
      input({
        propertyKind: 'UNBUILT',
        occupancy: 'VACANT',
        ownerKind: 'INDIVIDUAL',
        annualRent: 0,
        marketValue: 20_000_000
      }),
      TAX_PARAMETERS_2026
    );
    const rentalIncomeTax = computeTax(
      'RENTAL_INCOME_TAX',
      input({
        propertyKind: 'UNBUILT',
        occupancy: 'VACANT',
        ownerKind: 'INDIVIDUAL',
        annualRent: 0,
        marketValue: 20_000_000
      }),
      TAX_PARAMETERS_2026
    );

    expect(propertyTax.amountFull).toBe(200_000);
    expect(rentalIncomeTax.applicable).toBe(false);
    expect(rentalIncomeTax.reason).toBe('NOT_APPLICABLE');
  });

  it('CI, société occupant son immeuble, sans valeur locative saisie : NO_BASE ; avec valeur locative saisie 3 000 000 : 390 000', () => {
    const withoutValue = computeTax(
      'PROPERTY_TAX',
      input({
        occupancy: 'OWNER_OCCUPIED',
        ownerKind: 'COMPANY',
        annualRent: 0,
        declaredRentalValue: null,
        marketValue: null
      }),
      TAX_PARAMETERS_2026
    );
    expect(withoutValue.reason).toBe('NO_BASE');
    expect(withoutValue.applicable).toBe(true);
    expect(withoutValue.amountFull).toBe(0);

    const withValue = computeTax(
      'PROPERTY_TAX',
      input({ occupancy: 'OWNER_OCCUPIED', ownerKind: 'COMPANY', annualRent: 0, declaredRentalValue: 3_000_000 }),
      TAX_PARAMETERS_2026
    );
    expect(withValue.amountFull).toBe(390_000);
  });

  it('ML, bâti loué, personne physique, loyer 1 234 567 : taxe foncière 37 037, IRF sur 1 234 000 → 148 080', () => {
    const propertyTax = computeTax(
      'PROPERTY_TAX',
      input({ country: 'ML', occupancy: 'RENTED', ownerKind: 'INDIVIDUAL', annualRent: 1_234_567 }),
      TAX_PARAMETERS_2026
    );
    const rentalIncomeTax = computeTax(
      'RENTAL_INCOME_TAX',
      input({ country: 'ML', occupancy: 'RENTED', ownerKind: 'INDIVIDUAL', annualRent: 1_234_567 }),
      TAX_PARAMETERS_2026
    );

    expect(propertyTax.amountFull).toBe(37_037);
    expect(rentalIncomeTax.amountFull).toBe(148_080);
  });

  it('ML, société : taxe foncière due, IRF non applicable', () => {
    const propertyTax = computeTax(
      'PROPERTY_TAX',
      input({ country: 'ML', occupancy: 'RENTED', ownerKind: 'COMPANY', annualRent: 1_000_000 }),
      TAX_PARAMETERS_2026
    );
    const rentalIncomeTax = computeTax(
      'RENTAL_INCOME_TAX',
      input({ country: 'ML', occupancy: 'RENTED', ownerKind: 'COMPANY', annualRent: 1_000_000 }),
      TAX_PARAMETERS_2026
    );

    expect(propertyTax.applicable).toBe(true);
    expect(propertyTax.amountFull).toBeGreaterThan(0);
    expect(rentalIncomeTax.applicable).toBe(false);
    expect(rentalIncomeTax.reason).toBe('NOT_APPLICABLE');
  });

  it('ML, occupé par le propriétaire : les deux impôts sont EXEMPT', () => {
    const propertyTax = computeTax(
      'PROPERTY_TAX',
      input({ country: 'ML', occupancy: 'OWNER_OCCUPIED', ownerKind: 'INDIVIDUAL', annualRent: 0 }),
      TAX_PARAMETERS_2026
    );
    const rentalIncomeTax = computeTax(
      'RENTAL_INCOME_TAX',
      input({ country: 'ML', occupancy: 'OWNER_OCCUPIED', ownerKind: 'INDIVIDUAL', annualRent: 0 }),
      TAX_PARAMETERS_2026
    );

    expect(propertyTax.reason).toBe('EXEMPT');
    expect(propertyTax.amountFull).toBe(0);
    expect(rentalIncomeTax.reason).toBe('EXEMPT');
    expect(rentalIncomeTax.amountFull).toBe(0);
  });

  it('Année 2027 : paramètres 2026 avec parametersFallback true', () => {
    const propertyTax = computeTax(
      'PROPERTY_TAX',
      input({ fiscalYear: 2027, occupancy: 'RENTED', ownerKind: 'INDIVIDUAL', annualRent: 1_200_000 }),
      TAX_PARAMETERS_2026
    );

    expect(propertyTax.parametersYear).toBe(2026);
    expect(propertyTax.parametersFallback).toBe(true);
    expect(propertyTax.amountFull).toBe(108_000);
  });

  it('Année 2025 : NO_PARAMETERS', () => {
    const propertyTax = computeTax(
      'PROPERTY_TAX',
      input({ fiscalYear: 2025, occupancy: 'RENTED', ownerKind: 'INDIVIDUAL', annualRent: 1_200_000 }),
      TAX_PARAMETERS_2026
    );

    expect(propertyTax.reason).toBe('NO_PARAMETERS');
    expect(propertyTax.parametersYear).toBeNull();
  });
});
