import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { purgePersonalLocalData } from '../../utils/personal-local-data';
import { LANGUAGE_STORAGE_KEY } from '../../i18n/config';
import {
  loadLocalDraft,
  purgeLocalDrafts,
  saveLocalDraft
} from '../../components/rental/inspections/local-draft-storage';
import {
  purgeLocalYieldAssumptions,
  readYieldAssumptions,
  writeYieldAssumptions
} from '../../components/patrimoine/yield-assumptions-storage';

/**
 * FRI-11 : les données personnelles gardées dans localStorage (brouillons
 * d'états des lieux, téléphone du payeur, hypothèses de rendement) sont
 * purgées ; ce qui n'est pas personnel n'est pas touché.
 */

const PAYER_PHONE_KEY = 'coowner-portal:payer-phone';
const ASSUMPTIONS = {
  years: 10,
  valueGrowthRate: 0.02,
  rentGrowthRate: 0.02,
  expenseGrowthRate: 0.02,
  vacancyRate: 0.05
};
const DRAFT = {
  inspectionDate: '2026-11-09',
  rooms: [],
  meters: {} as never,
  keysCount: 2,
  generalComment: 'Dégât des eaux au salon',
  tenantPresent: true,
  tenantSignatoryName: 'Mariam Diomandé',
  agentSignatoryName: 'Agent',
  deductions: []
};

function seed(): void {
  saveLocalDraft('insp-1', DRAFT);
  saveLocalDraft('insp-2', DRAFT);
  window.localStorage.setItem(PAYER_PHONE_KEY, '+2250700000000');
  writeYieldAssumptions('tenant-1', 'prop-1', ASSUMPTIONS);
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'ar');
  window.localStorage.setItem('theme', 'dark');
}

describe('purgePersonalLocalData', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('supprime brouillons, téléphone du payeur et hypothèses, et laisse le reste', () => {
    seed();
    expect(loadLocalDraft('insp-1')).not.toBeNull();
    expect(readYieldAssumptions('tenant-1', 'prop-1')).toBeDefined();

    purgePersonalLocalData();

    expect(loadLocalDraft('insp-1')).toBeNull();
    expect(loadLocalDraft('insp-2')).toBeNull();
    expect(window.localStorage.getItem(PAYER_PHONE_KEY)).toBeNull();
    expect(readYieldAssumptions('tenant-1', 'prop-1')).toBeUndefined();
    // La purge ne touche ni la langue ni les clés étrangères.
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('ar');
    expect(window.localStorage.getItem('theme')).toBe('dark');
  });

  it('est exposée par chaque module de stockage', () => {
    seed();
    purgeLocalDrafts();
    expect(loadLocalDraft('insp-1')).toBeNull();

    seed();
    purgeLocalYieldAssumptions();
    expect(readYieldAssumptions('tenant-1', 'prop-1')).toBeUndefined();
  });

  it('ne lève jamais quand le stockage est refusé', () => {
    vi.spyOn(Storage.prototype, 'key').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(() => purgePersonalLocalData()).not.toThrow();
  });
});
