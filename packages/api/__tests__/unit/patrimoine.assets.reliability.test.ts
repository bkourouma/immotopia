/**
 * Fiabilité et péremption des valorisations (lot 2, spec 024).
 */

import {
  ASSET_CLASSES,
  computeReliability,
  isStale,
  monthsBetween,
  STALENESS_MONTHS,
  type ReliabilityInput
} from '../../src/lib/patrimoine/assets';

const AS_OF = new Date('2026-09-29T00:00:00Z');
const DAY = 86_400_000;
const MONTH = (365.25 / 12) * DAY;
const monthsAgo = (months: number) => new Date(AS_OF.getTime() - months * MONTH);

function input(overrides: Partial<ReliabilityInput> = {}): ReliabilityInput {
  return {
    assetClass: 'VEHICLE_EQUIPMENT',
    method: 'EXPERT_APPRAISAL',
    valuatedAt: monthsAgo(3),
    asOf: AS_OF,
    hasSource: false,
    legalStatus: null,
    ...overrides
  };
}

describe('péremption', () => {
  it('fixe les seuils par classe', () => {
    expect(STALENESS_MONTHS).toEqual({
      CASH: 3,
      INVENTORY: 3,
      SAVINGS_INVESTMENT: 6,
      RECEIVABLE: 6,
      AGRICULTURE: 6,
      VEHICLE_EQUIPMENT: 12,
      BUSINESS_EQUITY: 12,
      REAL_ESTATE: 24,
      MOVABLE: 24,
      OTHER: 12
    });
    expect(Object.keys(STALENESS_MONTHS).sort()).toEqual([...ASSET_CLASSES].sort());
  });

  it('mesure les mois en fractions de mois moyen', () => {
    expect(monthsBetween(monthsAgo(4), AS_OF)).toBeCloseTo(4, 10);
  });

  it('compte mobile money à 4 mois périmé, terrain à 4 mois non', () => {
    expect(isStale('CASH', monthsAgo(4), AS_OF)).toBe(true);
    expect(isStale('REAL_ESTATE', monthsAgo(4), AS_OF)).toBe(false);
  });

  it('le seuil exact n’est pas encore périmé ; sans valorisation, périmé', () => {
    expect(isStale('CASH', monthsAgo(3), AS_OF)).toBe(false);
    expect(isStale('CASH', null, AS_OF)).toBe(true);
  });
});

describe('niveau de base par méthode', () => {
  it('expertise récente : élevée', () => {
    expect(computeReliability(input())).toEqual({ level: 'HIGH', reasons: ['METHOD_EXPERT'] });
  });

  it('solde saisi il y a 1 mois : élevée', () => {
    expect(computeReliability(input({ assetClass: 'CASH', method: 'BALANCE', valuatedAt: monthsAgo(1) }))).toEqual({
      level: 'HIGH',
      reasons: ['METHOD_BALANCE']
    });
  });

  it.each([
    'DEPRECIATION_LINEAR',
    'DEPRECIATION_DECLINING',
    'EQUITY_SHARE',
    'UNIT_COST',
    'ACCRUED_SAVINGS',
    'DISCOUNTED_CLAIM',
    'UNIT_VALUE'
  ] as const)('%s : moyenne', method => {
    expect(computeReliability(input({ method }))).toEqual({ level: 'MEDIUM', reasons: ['METHOD_COMPUTED'] });
  });

  it('estimation de marché : traitée comme une saisie manuelle, mêmes raisons', () => {
    expect(computeReliability(input({ method: 'MARKET_ESTIMATE' }))).toEqual({
      level: 'LOW',
      reasons: ['METHOD_MANUAL_NO_SOURCE']
    });
    expect(computeReliability(input({ method: 'MARKET_ESTIMATE', hasSource: true }))).toEqual({
      level: 'MEDIUM',
      reasons: ['METHOD_MANUAL_WITH_SOURCE']
    });
  });

  it('saisie manuelle : moyenne avec source, faible sans, jamais élevée', () => {
    expect(computeReliability(input({ method: 'MANUAL', hasSource: true }))).toEqual({
      level: 'MEDIUM',
      reasons: ['METHOD_MANUAL_WITH_SOURCE']
    });
    expect(computeReliability(input({ method: 'MANUAL' }))).toEqual({
      level: 'LOW',
      reasons: ['METHOD_MANUAL_NO_SOURCE']
    });
  });
});

describe('ancienneté', () => {
  it('expertise de 30 mois sur une classe à 12 mois : deux niveaux perdus, faible', () => {
    expect(computeReliability(input({ valuatedAt: monthsAgo(30) }))).toEqual({
      level: 'LOW',
      reasons: ['METHOD_EXPERT', 'STALE_TWO_LEVELS']
    });
  });

  it('au-delà du seuil seulement : un niveau perdu', () => {
    expect(computeReliability(input({ valuatedAt: monthsAgo(18) }))).toEqual({
      level: 'MEDIUM',
      reasons: ['METHOD_EXPERT', 'STALE_ONE_LEVEL']
    });
  });

  it('ne descend jamais sous faible', () => {
    const result = computeReliability(input({ method: 'MANUAL', valuatedAt: monthsAgo(60) }));
    expect(result.level).toBe('LOW');
    expect(result.reasons).toContain('STALE_TWO_LEVELS');
  });

  it('immobilier : seuil de 24 mois', () => {
    const base = input({ assetClass: 'REAL_ESTATE', legalStatus: 'TITRE_FONCIER' });
    expect(computeReliability({ ...base, valuatedAt: monthsAgo(20) }).level).toBe('HIGH');
    expect(computeReliability({ ...base, valuatedAt: monthsAgo(30) }).level).toBe('MEDIUM');
  });
});

describe('statut juridique (immobilier)', () => {
  const land = (legalStatus: string | null | undefined) =>
    computeReliability(input({ assetClass: 'REAL_ESTATE', legalStatus }));

  it('titre foncier : aucun plafond', () => {
    expect(land('TITRE_FONCIER')).toEqual({ level: 'HIGH', reasons: ['METHOD_EXPERT'] });
  });

  it.each(['ACD', 'CERTIFICAT_PROPRIETE', 'AUTRE'])('%s : aucun plafond', status => {
    expect(land(status).level).toBe('HIGH');
  });

  it.each(['ATTESTATION_COUTUMIERE', 'LETTRE_ATTRIBUTION'])('%s : plafonné à faible', status => {
    expect(land(status)).toEqual({ level: 'LOW', reasons: ['METHOD_EXPERT', 'LEGAL_STATUS_FRAGILE'] });
  });

  it('statut non renseigné : au plus moyenne', () => {
    expect(land(null)).toEqual({ level: 'MEDIUM', reasons: ['METHOD_EXPERT', 'LEGAL_STATUS_UNKNOWN'] });
    expect(land(undefined).level).toBe('MEDIUM');
  });

  it('le plafond ne relève pas un niveau déjà plus bas', () => {
    const result = computeReliability(input({ assetClass: 'REAL_ESTATE', method: 'MANUAL', legalStatus: null }));
    expect(result.level).toBe('LOW');
  });

  it('les autres classes ignorent le statut juridique', () => {
    expect(computeReliability(input({ legalStatus: 'ATTESTATION_COUTUMIERE' })).level).toBe('HIGH');
  });
});
