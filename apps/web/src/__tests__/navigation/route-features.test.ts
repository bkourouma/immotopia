import { describe, it, expect } from 'vitest';
import { featureAccessFromModules } from '../../navigation/feature-access';
import { featureForAgencyPath, isAgencyPathNotIncluded } from '../../navigation/route-features';

const T = '/tenant/2b41a322';

describe('featureForAgencyPath', () => {
  it.each([
    ['finance/chantiers', 'CONSTRUCTION'],
    ['finance/chantiers/abc/budget', 'CONSTRUCTION'],
    ['finance/stock/inventaire', 'CONSTRUCTION'],
    ['finance/tacherons', 'CONSTRUCTION'],
    ['finance/salaires', 'CONSTRUCTION'],
    ['finance/retenues', 'CONSTRUCTION'],
    ['finance/baux-terrain', 'CONSTRUCTION'],
    ['finance/tableau-de-bord-chantiers', 'CONSTRUCTION'],
    ['finance/owner-accounts', 'RENTAL'],
    ['crm/deals/new', 'CRM'],
    ['sales/mandates', 'SALES'],
    ['rental/leases', 'RENTAL'],
    ['patrimoine/performance', 'PATRIMOINE'],
    ['patrimoine/plan-tresorerie', 'PATRIMOINE'],
    ['patrimoine/statements', 'RENTAL'],
    ['patrimoine/external-access', 'PATRIMOINE'],
    ['syndics/s1/lots', 'SYNDIC']
  ])('%s -> %s', (path, feature) => {
    expect(featureForAgencyPath(`${T}/${path}`)).toBe(feature);
  });

  it('ne classe ni le socle ni les portails', () => {
    for (const path of [
      `${T}/properties`,
      `${T}/crm/contacts`,
      `${T}/finance/comptabilite`,
      `${T}/finance/chantiersX`,
      `${T}/settings/abonnement`,
      '/tenant',
      '/tenant/payments',
      '/owner/revenues',
      '/copropriete/documents',
      '/dashboard'
    ]) {
      expect(featureForAgencyPath(path)).toBeNull();
    }
  });
});

describe('isAgencyPathNotIncluded', () => {
  const agence = featureAccessFromModules({ MODULE_AGENCY: 'FULL' });
  const syndic = featureAccessFromModules({ MODULE_SYNDIC: 'FULL' });
  const patrimoine = featureAccessFromModules({ MODULE_PATRIMOINE: 'FULL' });

  it('pack Agence : chantiers refusés, ventes et baux ouverts', () => {
    expect(isAgencyPathNotIncluded(`${T}/finance/chantiers`, agence)).toBe(true);
    expect(isAgencyPathNotIncluded(`${T}/finance/salaires`, agence)).toBe(true);
    expect(isAgencyPathNotIncluded(`${T}/sales`, agence)).toBe(false);
    expect(isAgencyPathNotIncluded(`${T}/rental/leases`, agence)).toBe(false);
  });

  it('pack Syndic : tout sauf syndic et socle est refusé', () => {
    for (const p of ['rental/leases', 'crm/deals', 'sales', 'patrimoine', 'finance/chantiers']) {
      expect(isAgencyPathNotIncluded(`${T}/${p}`, syndic)).toBe(true);
    }
    expect(isAgencyPathNotIncluded(`${T}/syndics`, syndic)).toBe(false);
    expect(isAgencyPathNotIncluded(`${T}/properties`, syndic)).toBe(false);
  });

  it('pack Patrimoine : ni affaires, ni ventes, ni syndic, ni chantiers ; patrimoine et baux ouverts', () => {
    for (const p of ['crm/deals', 'sales', 'syndics', 'finance/chantiers']) {
      expect(isAgencyPathNotIncluded(`${T}/${p}`, patrimoine)).toBe(true);
    }
    expect(isAgencyPathNotIncluded(`${T}/patrimoine`, patrimoine)).toBe(false);
    expect(isAgencyPathNotIncluded(`${T}/rental/leases`, patrimoine)).toBe(false);
  });

  it('module retiré (lecture seule) : jamais refusé', () => {
    const access = featureAccessFromModules({ MODULE_AGENCY: 'FULL', MODULE_PROMOTER: 'READ_ONLY' });
    expect(isAgencyPathNotIncluded(`${T}/finance/chantiers`, access)).toBe(false);
  });

  it('droits inconnus (chargement, échec, contrôle non appliqué) : jamais refusé', () => {
    expect(isAgencyPathNotIncluded(`${T}/finance/chantiers`, null)).toBe(false);
  });
});
