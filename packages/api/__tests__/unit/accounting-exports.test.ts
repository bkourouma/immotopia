/**
 * Exports comptables — lot 8 : période et fichiers.
 *
 * Le CSV est lu par Excel en français chez le cabinet comptable : séparateur
 * `;`, virgule décimale, BOM UTF-8 pour les accents, CRLF. Un seul de ces
 * détails de travers, et le fichier s'ouvre en une colonne ou en caractères
 * illisibles.
 */

jest.mock('../../src/utils/database', () => ({ prisma: {} }));
jest.mock('../../src/lib/owner-account/service', () => ({ syncAllOwnerAccounts: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { parsePeriod, toCsv, trialBalanceTable, toXlsx } = require('../../src/lib/accounting-exports/service');

describe('parsePeriod', () => {
  const now = new Date('2026-09-23T15:00:00Z');

  it('va du 1er janvier à aujourd’hui par défaut', () => {
    const period = parsePeriod({}, now);
    expect(period.fromLabel).toBe('2026-01-01');
    expect(period.toLabel).toBe('2026-09-23');
    expect(period.from.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    // Le dernier jour est inclus jusqu'à sa dernière milliseconde.
    expect(period.to.toISOString()).toBe('2026-09-23T23:59:59.999Z');
  });

  it('refuse une date mal formée, inexistante, ou une période à l’envers', () => {
    expect(() => parsePeriod({ from: '01/01/2026' }, now)).toThrow('AAAA-MM-JJ');
    expect(() => parsePeriod({ from: '2026-02-30' }, now)).toThrow("n'existe pas");
    expect(() => parsePeriod({ from: '2026-09-01', to: '2026-08-01' }, now)).toThrow('postérieure');
  });
});

describe('toCsv', () => {
  const table = {
    sheet: 'Test',
    headers: ['Compte', 'Libellé', 'Débit'],
    rows: [
      ['4712', 'Loyer ; septembre', 1250.5],
      ['706', 'Honoraires "gestion"', 20000]
    ],
    money: [2]
  };

  it('écrit pour Excel en français', () => {
    const csv = toCsv(table);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('\r\n');
    expect(csv).toContain('Compte;Libellé;Débit');
    expect(csv).toContain('1250,5');
  });

  it('protège les champs qui contiennent un séparateur ou un guillemet', () => {
    const csv = toCsv(table);
    expect(csv).toContain('"Loyer ; septembre"');
    expect(csv).toContain('"Honoraires ""gestion"""');
  });

  it('ne touche pas au point d’un numéro de compte, seulement aux montants', () => {
    const csv = toCsv({ ...table, rows: [['401.1', 'Sous-compte', 10.5]] });
    expect(csv).toContain('401.1;Sous-compte;10,5');
  });
});

describe('trialBalanceTable', () => {
  it('termine par une ligne de total', () => {
    const table = trialBalanceTable({
      from: '2026-01-01',
      to: '2026-09-23',
      lines: [
        {
          accountNumber: '571',
          accountName: 'Caisse',
          openingDebit: 0,
          openingCredit: 0,
          periodDebit: 100,
          periodCredit: 0,
          closingDebit: 100,
          closingCredit: 0
        }
      ],
      totals: {
        openingDebit: 0,
        openingCredit: 0,
        periodDebit: 100,
        periodCredit: 100,
        closingDebit: 100,
        closingCredit: 100
      },
      isBalanced: true
    });
    expect(table.rows.at(-1)).toEqual(['', 'Total', 0, 0, 100, 100, 100, 100]);
  });

  it('produit un classeur Excel lisible', async () => {
    const buffer = await toXlsx([{ sheet: 'Balance', headers: ['Compte', 'Débit'], rows: [['571', 100]], money: [1] }]);
    // Un fichier .xlsx est une archive zip : il commence par « PK ».
    expect(buffer.subarray(0, 2).toString()).toBe('PK');
  });
});
