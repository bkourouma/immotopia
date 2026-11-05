import i18next from 'i18next';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PROPERTY_TYPE_LABELS,
  STATUS_LABELS,
  TRANSACTION_MODE_LABELS,
  propertySearchCriteria
} from '../../pages/properties/property-search-criteria';

afterEach(async () => {
  await i18next.changeLanguage('fr');
});

describe('libellés de la liste des biens', () => {
  it('traduit les valeurs des cartes et des filtres après un changement de langue', async () => {
    expect(PROPERTY_TYPE_LABELS.APPARTEMENT).toBe('Appartement');

    i18next.addResourceBundle('ar', 'app', { Appartement: 'شقة', Vente: 'بيع', Disponible: 'متاح' }, true, true);
    await i18next.changeLanguage('ar');

    expect(PROPERTY_TYPE_LABELS.APPARTEMENT).toBe('شقة');
    expect(TRANSACTION_MODE_LABELS.SALE).toBe('بيع');
    expect(STATUS_LABELS.AVAILABLE).toBe('متاح');
    const propertyType = propertySearchCriteria([]).find(criterion => criterion.key === 'propertyType');
    if (propertyType?.type !== 'select') throw new Error('Critère de type de bien introuvable');
    expect(propertyType.options).toContainEqual({
      value: 'APPARTEMENT',
      label: 'شقة'
    });
  });
});
