import {
  deriveBuiltStatus,
  deriveOccupancy,
  normalizeCountry,
  ownerKindOf,
  resolveTaxCountry
} from '../../src/lib/patrimoine/tax/inputs';

describe('deriveBuiltStatus', () => {
  it('priorise le profil fiscal', () => {
    expect(deriveBuiltStatus('TERRAIN', 'BUILT')).toBe('BUILT');
    expect(deriveBuiltStatus('APARTMENT', 'UNBUILT')).toBe('UNBUILT');
  });

  it("déduit UNBUILT d'un bien TERRAIN sans profil", () => {
    expect(deriveBuiltStatus('TERRAIN', null)).toBe('UNBUILT');
    expect(deriveBuiltStatus('TERRAIN', undefined)).toBe('UNBUILT');
  });

  it('déduit BUILT de tout le reste sans profil', () => {
    expect(deriveBuiltStatus('APARTMENT', null)).toBe('BUILT');
    expect(deriveBuiltStatus(null, null)).toBe('BUILT');
    expect(deriveBuiltStatus(undefined, undefined)).toBe('BUILT');
  });
});

describe('deriveOccupancy', () => {
  it('priorise le profil fiscal', () => {
    expect(deriveOccupancy(1_000_000, 'VACANT')).toBe('VACANT');
    expect(deriveOccupancy(0, 'MAIN_RESIDENCE')).toBe('MAIN_RESIDENCE');
  });

  it('déduit RENTED si le loyer est positif, sans profil', () => {
    expect(deriveOccupancy(1_000_000, null)).toBe('RENTED');
    expect(deriveOccupancy(1, undefined)).toBe('RENTED');
  });

  it('déduit VACANT si le loyer est nul ou négatif, sans profil', () => {
    expect(deriveOccupancy(0, null)).toBe('VACANT');
    expect(deriveOccupancy(-1, null)).toBe('VACANT');
  });
});

describe('ownerKindOf', () => {
  it('priorise la surcharge fiscalOwnerKind', () => {
    expect(ownerKindOf({ legalForm: 'INDIVIDUAL', fiscalOwnerKind: 'COMPANY' })).toBe('COMPANY');
    expect(ownerKindOf({ legalForm: 'SCI', fiscalOwnerKind: 'INDIVIDUAL' })).toBe('INDIVIDUAL');
  });

  it('déduit INDIVIDUAL pour une forme INDIVIDUAL sans surcharge', () => {
    expect(ownerKindOf({ legalForm: 'INDIVIDUAL', fiscalOwnerKind: null })).toBe('INDIVIDUAL');
  });

  it('déduit COMPANY pour toute autre forme sans surcharge', () => {
    expect(ownerKindOf({ legalForm: 'SCI', fiscalOwnerKind: null })).toBe('COMPANY');
    expect(ownerKindOf({ legalForm: 'HOLDING', fiscalOwnerKind: null })).toBe('COMPANY');
    expect(ownerKindOf({ legalForm: 'COMPANY', fiscalOwnerKind: null })).toBe('COMPANY');
    expect(ownerKindOf({ legalForm: 'OTHER', fiscalOwnerKind: null })).toBe('COMPANY');
  });
});

describe('normalizeCountry', () => {
  it.each([
    ["Côte d'Ivoire", 'CI'],
    ['Cote dIvoire', 'CI'],
    ['COTE DIVOIRE', 'CI'],
    ['Ivory Coast', 'CI'],
    ['ci', 'CI'],
    ['CI', 'CI'],
    ['Mali', 'ML'],
    ['ML', 'ML'],
    ['ml', 'ML']
  ])('normalise %s en %s', (text, expected) => {
    expect(normalizeCountry(text)).toBe(expected);
  });

  it('retourne null pour un pays non géré', () => {
    expect(normalizeCountry('Sénégal')).toBeNull();
    expect(normalizeCountry('Senegal')).toBeNull();
    expect(normalizeCountry('France')).toBeNull();
  });

  it('retourne null pour une valeur nulle ou vide', () => {
    expect(normalizeCountry(null)).toBeNull();
    expect(normalizeCountry(undefined)).toBeNull();
    expect(normalizeCountry('')).toBeNull();
    expect(normalizeCountry('   ')).toBeNull();
  });
});

describe('resolveTaxCountry', () => {
  it('priorise la requête', () => {
    const result = resolveTaxCountry({
      query: 'ML',
      profile: 'CI',
      entityCountries: ['CI'],
      agencyCountry: "Côte d'Ivoire"
    });
    expect(result).toEqual({ country: 'ML', countrySource: 'QUERY' });
  });

  it('sinon priorise le profil', () => {
    const result = resolveTaxCountry({
      query: null,
      profile: 'ML',
      entityCountries: ['CI'],
      agencyCountry: "Côte d'Ivoire"
    });
    expect(result).toEqual({ country: 'ML', countrySource: 'PROFILE' });
  });

  it('sinon priorise le pays des entités si elles sont toutes identiques', () => {
    const result = resolveTaxCountry({
      entityCountries: ['CI', 'CI'],
      agencyCountry: 'Mali'
    });
    expect(result).toEqual({ country: 'CI', countrySource: 'ENTITY' });
  });

  it('ignore les entités de pays différents', () => {
    const result = resolveTaxCountry({
      entityCountries: ['CI', 'ML'],
      agencyCountry: 'Mali'
    });
    expect(result).toEqual({ country: 'ML', countrySource: 'AGENCY' });
  });

  it("sinon retombe sur le pays de l'agence normalisé", () => {
    const result = resolveTaxCountry({ agencyCountry: "Côte d'Ivoire" });
    expect(result).toEqual({ country: 'CI', countrySource: 'AGENCY' });
  });

  it('retourne null si rien ne permet de résoudre le pays', () => {
    const result = resolveTaxCountry({ agencyCountry: 'France' });
    expect(result).toEqual({ country: null, countrySource: null });
  });
});
