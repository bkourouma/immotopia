import { ASSET_CLASSES } from '../../src/lib/patrimoine/assets';
import {
  DEFAULT_ASSUMPTIONS,
  GROWTH_MAX,
  GROWTH_MIN,
  MAX_HORIZON_YEARS,
  MAX_OPERATIONS,
  resolveAssumptions
} from '../../src/lib/patrimoine/projection';

describe('hypothèses de projection', () => {
  it('renseigne toutes les classes dans chaque scénario', () => {
    for (const scenario of Object.values(DEFAULT_ASSUMPTIONS)) {
      expect(Object.keys(scenario.growthPercentByClass).sort()).toEqual([...ASSET_CLASSES].sort());
    }
  });

  it('reprend le tableau du contrat', () => {
    expect(DEFAULT_ASSUMPTIONS.PRUDENT.growthPercentByClass.REAL_ESTATE).toBe(2);
    expect(DEFAULT_ASSUMPTIONS.CENTRAL.growthPercentByClass.BUSINESS_EQUITY).toBe(5);
    expect(DEFAULT_ASSUMPTIONS.OPTIMISTIC.growthPercentByClass.AGRICULTURE).toBe(6);
    expect(DEFAULT_ASSUMPTIONS.CENTRAL.growthPercentByClass.SAVINGS_INVESTMENT).toBe(4);
    expect(DEFAULT_ASSUMPTIONS.PRUDENT.inflationPercent).toBe(4);
    expect(DEFAULT_ASSUMPTIONS.CENTRAL.inflationPercent).toBe(3);
    expect(DEFAULT_ASSUMPTIONS.OPTIMISTIC.inflationPercent).toBe(2);
    for (const scenario of Object.values(DEFAULT_ASSUMPTIONS)) {
      expect(scenario.growthPercentByClass.VEHICLE_EQUIPMENT).toBe(0);
      expect(scenario.growthPercentByClass.CASH).toBe(0);
    }
  });

  it('ordonne prudent <= central <= optimiste pour chaque classe', () => {
    for (const assetClass of ASSET_CLASSES) {
      const { PRUDENT, CENTRAL, OPTIMISTIC } = DEFAULT_ASSUMPTIONS;
      expect(PRUDENT.growthPercentByClass[assetClass]).toBeLessThanOrEqual(CENTRAL.growthPercentByClass[assetClass]);
      expect(CENTRAL.growthPercentByClass[assetClass]).toBeLessThanOrEqual(OPTIMISTIC.growthPercentByClass[assetClass]);
    }
  });

  it('expose les bornes du contrat', () => {
    expect([GROWTH_MIN, GROWTH_MAX, MAX_HORIZON_YEARS, MAX_OPERATIONS]).toEqual([-50, 100, 30, 50]);
  });

  it('résout sans surcharge et signale les classes surchargées', () => {
    const plain = resolveAssumptions('CENTRAL');
    expect(plain.assumptions).toEqual(DEFAULT_ASSUMPTIONS.CENTRAL);
    expect(plain.overriddenClasses).toEqual([]);
    expect(plain.inflationOverridden).toBe(false);

    const custom = resolveAssumptions('PRUDENT', { growthPercentByClass: { REAL_ESTATE: 7 }, inflationPercent: 9 });
    expect(custom.assumptions.growthPercentByClass.REAL_ESTATE).toBe(7);
    expect(custom.assumptions.growthPercentByClass.CASH).toBe(0);
    expect(custom.assumptions.inflationPercent).toBe(9);
    expect(custom.overriddenClasses).toEqual(['REAL_ESTATE']);
    expect(custom.inflationOverridden).toBe(true);
  });

  it('ne modifie jamais la table par défaut', () => {
    const result = resolveAssumptions('CENTRAL', { growthPercentByClass: { REAL_ESTATE: 99 } });
    result.assumptions.growthPercentByClass.OTHER = 42;
    expect(DEFAULT_ASSUMPTIONS.CENTRAL.growthPercentByClass.REAL_ESTATE).toBe(4);
    expect(DEFAULT_ASSUMPTIONS.CENTRAL.growthPercentByClass.OTHER).toBe(0);
  });
});
