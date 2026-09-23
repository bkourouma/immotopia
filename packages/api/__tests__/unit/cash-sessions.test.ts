/**
 * Caisse d'agence — lot 6 : le billetage.
 *
 * Le compté d'une caisse se déduit du nombre de billets et de pièces. Une
 * valeur inventée ou un nombre négatif fausserait l'écart, et donc
 * l'écriture de manquant ou d'excédent qui en découle.
 */

jest.mock('../../src/utils/database', () => ({ prisma: {} }));
jest.mock('../../src/services/permission-service', () => ({ hasPermission: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { countDenominations, DENOMINATIONS } = require('../../src/lib/cash-sessions/service');

describe('countDenominations', () => {
  it('additionne billets et pièces', () => {
    expect(countDenominations({ '10000': 3, '500': 2, '25': 4 })).toBe(31_100);
  });

  it('accepte un billetage vide ou à zéro', () => {
    expect(countDenominations({})).toBe(0);
    expect(countDenominations({ '5000': 0 })).toBe(0);
  });

  it('couvre les billets et les pièces du franc CFA', () => {
    expect(DENOMINATIONS).toEqual([10000, 5000, 2000, 1000, 500, 250, 200, 100, 50, 25, 10, 5]);
  });

  it('refuse une valeur qui n’existe pas', () => {
    expect(() => countDenominations({ '20000': 1 })).toThrow('Valeur de billetage inconnue');
  });

  it('refuse un nombre négatif ou décimal', () => {
    expect(() => countDenominations({ '1000': -1 })).toThrow('invalide');
    expect(() => countDenominations({ '1000': 1.5 })).toThrow('invalide');
  });
});
