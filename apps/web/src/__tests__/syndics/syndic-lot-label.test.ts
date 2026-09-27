import { formatLotLabel, isTechnicalPropertyTitle } from '../../utils/syndic-lot-label';

/**
 * Constat de recette (module 5.1) : le sélecteur de lot des appels de charges
 * affichait « Bien non lié (Appartement) » pour les 4 lots d'une copropriété
 * sans bien lié, sans jamais mentionner leur numéro de lot — impossible de
 * savoir lequel on choisissait. D'autres écrans (budgets, recouvrement,
 * incidents) remplaçaient carrément le numéro de lot par le libellé du bien
 * dès qu'il existait. `formatLotLabel` est l'utilitaire unique qui remplace
 * toutes ces implémentations dupliquées : le numéro de lot est toujours en
 * tête.
 */
describe('formatLotLabel', () => {
  it('leads with the lot number, type and tantièmes when there is no linked property', () => {
    expect(
      formatLotLabel({
        lotNumber: 'ACA-A1',
        lotType: 'APARTMENT',
        generalShares: 100,
        property: null
      })
    ).toBe('ACA-A1 · Appartement · 100 tantièmes');
  });

  it('never falls back to a generic placeholder for a lot without a linked property', () => {
    const label = formatLotLabel({ lotNumber: 'ACA-A2', lotType: 'APARTMENT', generalShares: 200, property: null });
    expect(label).not.toMatch(/non li/i);
    expect(label.startsWith('ACA-A2')).toBe(true);
  });

  it('appends the linked property title after the lot number, type and tantièmes', () => {
    expect(
      formatLotLabel({
        lotNumber: 'B-12',
        lotType: 'OFFICE',
        generalShares: 50,
        property: { title: 'Villa Les Cocotiers' }
      })
    ).toBe('B-12 · Bureau · 50 tantièmes · Villa Les Cocotiers');
  });

  it('never hides the lot number behind the property title (former bug in budgets/recouvrement/incidents)', () => {
    const label = formatLotLabel({
      lotNumber: 'C-07',
      lotType: 'COMMERCIAL',
      generalShares: 300,
      property: { title: 'Boutique Awa' }
    });
    expect(label.startsWith('C-07')).toBe(true);
  });

  it('omits a technical, auto-generated property title (PROP-YYYYMMDD-XXXX-NNNN)', () => {
    expect(
      formatLotLabel({
        lotNumber: 'D-03',
        lotType: 'PARKING',
        generalShares: 10,
        property: { title: 'PROP-20260115-AB12-0001' }
      })
    ).toBe('D-03 · Parking · 10 tantièmes');
  });

  it('degrades gracefully when lotType/generalShares are not provided by a lighter API payload', () => {
    // Ex. le tableau de bord des retards (OverdueDashboardItem) ne porte que
    // lotNumber + property : le libellé reste correct, juste moins riche.
    expect(formatLotLabel({ lotNumber: 'E-01', property: { title: 'Duplex Bleu' } })).toBe('E-01 · Duplex Bleu');
  });

  it('falls back to the given reference (e.g. a technical lotId) when the lot itself is missing', () => {
    expect(formatLotLabel(null, 'lot-id-technique')).toBe('lot-id-technique');
    expect(formatLotLabel(undefined, undefined)).toBe('Lot inconnu');
  });

  it('falls back to the given reference when the lot has no lot number', () => {
    expect(formatLotLabel({ lotNumber: '', property: null }, 'charge-42')).toBe('charge-42');
  });
});

describe('isTechnicalPropertyTitle', () => {
  it('recognizes the auto-generated import reference format', () => {
    expect(isTechnicalPropertyTitle('PROP-20260115-AB12-0001')).toBe(true);
  });

  it('does not flag a real, human-entered property title', () => {
    expect(isTechnicalPropertyTitle('Villa Les Cocotiers')).toBe(false);
  });

  it('returns false for an empty or missing title', () => {
    expect(isTechnicalPropertyTitle(null)).toBe(false);
    expect(isTechnicalPropertyTitle(undefined)).toBe(false);
    expect(isTechnicalPropertyTitle('')).toBe(false);
  });
});
