/**
 * Date du règlement d'un paiement saisi à la main.
 *
 * Avant : `succeeded_at` valait l'instant de la saisie. Un loyer reçu le
 * 30 août et saisi le 2 septembre tombait dans le relevé propriétaire de
 * septembre, et dans le tableau de bord de septembre.
 */

jest.mock('../../src/utils/database', () => ({ prisma: {} }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { resolvePaymentDate } = require('../../src/services/rental-payment-service');

const NOW = new Date('2026-09-23T15:42:10.000Z');

describe('resolvePaymentDate', () => {
  it('garde maintenant quand aucune date n’est donnée', () => {
    expect(resolvePaymentDate(undefined, NOW)).toBe(NOW);
  });

  it('garde l’heure réelle quand la date choisie est aujourd’hui', () => {
    expect(resolvePaymentDate('2026-09-23', NOW)).toBe(NOW);
  });

  it('date un règlement passé de ce jour-là, à midi UTC', () => {
    const date = resolvePaymentDate('2026-08-30', NOW);
    expect(date.toISOString()).toBe('2026-08-30T12:00:00.000Z');
  });

  it('range un loyer reçu le 30 août dans août, même saisi en septembre', () => {
    const date = resolvePaymentDate('2026-08-30', NOW);
    expect(date.getUTCMonth()).toBe(7);
  });

  it('refuse une date future', () => {
    expect(() => resolvePaymentDate('2026-09-24', NOW)).toThrow('La date du règlement ne peut pas être dans le futur');
  });

  it('refuse une date qui n’existe pas', () => {
    expect(() => resolvePaymentDate('2026-02-31', NOW)).toThrow("La date du règlement n'existe pas");
  });

  it('refuse un format autre que AAAA-MM-JJ', () => {
    expect(() => resolvePaymentDate('30/08/2026', NOW)).toThrow('AAAA-MM-JJ');
  });
});
