/**
 * BUG-2026-11-04-010 — sans valorisation, le rendement du portail est `null`
 * (« Non renseigné »), pas 0 %.
 */

jest.mock('../../src/utils/database', () => ({ prisma: {} }));
jest.mock('../../src/lib/patrimoine/queries', () => ({ buildPropertyYieldInput: jest.fn() }));
jest.mock('../../src/lib/settings/owner-portal-settings', () => ({ getOwnerPortalSettings: jest.fn() }));
jest.mock('../../src/lib/ownership/service', () => ({ ownerSharesByProperty: jest.fn() }));

import { portalGrossYield, portalNetYield } from '../../src/lib/patrimoine/owner-portal-view';

const base = { annualRent: 1200000, currentValue: 0, costBasis: 0, annualExpenses: 200000, annualLoanPayments: 0 };

describe('rendement du portail propriétaire', () => {
  it('renvoie null sans valeur estimée', () => {
    expect(portalGrossYield(base)).toBeNull();
    expect(portalNetYield(base)).toBeNull();
  });

  it('calcule le rendement quand la valeur est connue', () => {
    const input = { ...base, currentValue: 10000000 };
    expect(portalGrossYield(input)).toBeCloseTo(12);
    expect(portalNetYield(input)).toBeCloseTo(10);
  });
});
