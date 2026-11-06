/**
 * BUG-2026-11-04-024 : les libellés de loyer, de pénalité et de règlement
 * s'écrivent avec leurs accents (« août », « décembre », « février », « espèces »).
 */
jest.mock('../../src/utils/database', () => ({ prisma: {} }));

import { libellePeriodeEcheance } from '../../src/services/rental-installment-service';
import { libelleMoyen } from '../../src/services/rental-payment-service';

describe('libellés accentués', () => {
  it('écrit les mois avec leurs accents et l’élision d’août', () => {
    expect(libellePeriodeEcheance(2026, 8)).toBe("d'août 2026");
    expect(libellePeriodeEcheance(2026, 12)).toBe('de décembre 2026');
    expect(libellePeriodeEcheance(2026, 2)).toBe('de février 2026');
    expect(libellePeriodeEcheance(2026, 1)).toBe('de janvier 2026');
  });

  it('écrit les moyens de paiement avec leurs accents', () => {
    expect(libelleMoyen('CASH')).toBe('espèces');
    expect(libelleMoyen('CHECK')).toBe('chèque');
    expect(libelleMoyen('DIRECT_DEBIT')).toBe('prélèvement bancaire');
  });
});
