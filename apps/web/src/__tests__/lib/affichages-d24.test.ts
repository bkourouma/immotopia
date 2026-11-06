import { describe, it, expect } from 'vitest';
import { formatMoney } from '../../components/primitives/MoneyValue';
import { formatFcfa } from '../../i18n/format';
import { libellePeriodeEcheance } from '../../lib/rental-labels';
import { libelleOperateurMobileMoney } from '../../lib/rental-payment-status';

/** Lot D24 : devise FCFA partout (045), période sur deux chiffres (053), opérateur libellé (051). */
describe('devise : le franc CFA s’écrit FCFA', () => {
  it.each(['XOF', 'CFA', 'F CFA', 'FCFA', 'xof'])('formatMoney(%s) -> FCFA', code => {
    expect(formatMoney(37000, { currency: code })).toMatch(/37\s000 FCFA$/);
  });

  it('laisse les autres devises telles quelles', () => {
    expect(formatMoney(100, { currency: 'EUR' })).toBe('100 EUR');
  });

  it('formatFcfa n’écrit jamais XOF ni « F CFA » du format Intl', () => {
    const texte = formatFcfa(150000);
    expect(texte).toMatch(/150\s000 FCFA$/);
    expect(texte).not.toMatch(/XOF|F CFA/);
  });
});

describe('libellePeriodeEcheance', () => {
  it('met le mois sur deux chiffres', () => {
    expect(libellePeriodeEcheance(9, 2026)).toBe('09/2026');
    expect(libellePeriodeEcheance(12, 2026)).toBe('12/2026');
  });
});

describe('libelleOperateurMobileMoney', () => {
  it('traduit les opérateurs de l’énum et jamais le code brut', () => {
    expect(libelleOperateurMobileMoney('ORANGE')).toBe('Orange Money');
    expect(libelleOperateurMobileMoney('MTN')).toBe('MTN MoMo');
    expect(libelleOperateurMobileMoney('MOOV')).toBe('Moov Money');
    expect(libelleOperateurMobileMoney('WAVE')).toBe('Wave');
    expect(libelleOperateurMobileMoney('OTHER')).toBe('Autre');
    expect(libelleOperateurMobileMoney(null)).toBe('');
  });
});
