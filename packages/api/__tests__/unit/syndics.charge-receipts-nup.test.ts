/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Impression groupée (N-up) des reçus et quittances : l'en-tête standard est
 * plus haut qu'avant, il ne doit pas chasser les lignes essentielles (montant,
 * copropriétaire) des petites cases ni chevaucher le bloc de signature.
 */
import { PDFPage } from 'pdf-lib';
import { gridCells, renderChargeReceiptSheets, type RenderItem } from '../../src/lib/syndics/charge-receipt-pdf';
import type { ChargeReceiptSnapshot } from '../../src/lib/syndics/charge-receipt-snapshot';

function snapshot(kind: 'RECEIPT' | 'QUITTANCE', index: number): ChargeReceiptSnapshot {
  return {
    version: 1,
    kind,
    number: `${kind === 'QUITTANCE' ? 'QUI' : 'REC'}-2026-${String(index).padStart(5, '0')}`,
    issuedAt: '2026-02-01T10:00:00.000Z',
    currency: 'XOF',
    amount: 2500001.5,
    issuer: {
      key: 'AGENCY',
      kind: 'AGENCY',
      name: 'Agence Immobilière du Plateau',
      legalName: 'Agence Immobilière du Plateau SARL',
      address: 'Rue 1, Plateau, Abidjan',
      phone: '0102030405',
      email: 'contact@agence.test',
      rccm: 'CI-ABJ-2020-B-1234',
      taxId: 'NCC-1'
    },
    syndicate: {
      name: 'Résidence Les Palmiers',
      address: 'Cocody, Abidjan',
      registrationNo: 'IMM-001',
      cadastralReference: 'CAD-9'
    },
    lot: { number: `A-${index}`, type: 'Appartement', label: 'Bâtiment A' },
    coowner: { name: 'Awa Koné née Traoré', address: 'Cocody, villa 12' },
    call:
      kind === 'QUITTANCE'
        ? {
            id: 'call',
            period: { label: '2026-01', start: '2026-01-01', end: '2026-01-31' },
            amount: 2500001.5,
            dueDate: '2026-01-31T00:00:00.000Z'
          }
        : null,
    settlements:
      kind === 'QUITTANCE'
        ? Array.from({ length: 4 }, (_, n) => ({
            paidAt: `2026-01-${String(n + 10).padStart(2, '0')}T00:00:00.000Z`,
            method: 'MOBILE_MONEY',
            reference: `REF-${n}`,
            amount: 1000,
            source: 'PAYMENT' as const
          }))
        : [],
    settledAt: kind === 'QUITTANCE' ? '2026-01-15T00:00:00.000Z' : null,
    payment:
      kind === 'RECEIPT'
        ? { id: 'p', amount: 2500001.5, paidAt: '2026-01-10T00:00:00.000Z', method: 'VIREMENT', reference: 'VIR-1' }
        : null,
    allocations:
      kind === 'RECEIPT'
        ? Array.from({ length: 6 }, (_, n) => ({
            chargeCallId: `c${n}`,
            period: { label: `2026-${n + 1}`, start: null, end: null },
            callAmount: 10000,
            allocated: 10000,
            source: 'PAYMENT' as const,
            outstandingAfter: 0
          }))
        : [],
    outstandingAfter: 0,
    advance: 0,
    lotAdvanceBalance: 0,
    backfilled: false
  };
}

const item = (kind: 'RECEIPT' | 'QUITTANCE', index: number): RenderItem => {
  const data = snapshot(kind, index);
  return {
    snapshot: data,
    branding: {
      issuer: data.issuer,
      issuerLogo: null,
      signature: null,
      stamp: null,
      syndicate: { ...data.syndicate, logo: null }
    }
  };
};

interface Drawn {
  text: string;
  x: number;
  y: number;
  size: number;
}

let drawn: Drawn[];
beforeEach(() => {
  drawn = [];
  const original = PDFPage.prototype.drawText;
  jest.spyOn(PDFPage.prototype, 'drawText').mockImplementation(function (this: PDFPage, text: string, options?: any) {
    drawn.push({ text, x: options?.x, y: options?.y, size: options?.size });
    return original.call(this, text, options);
  });
});
afterEach(() => jest.restoreAllMocks());

const GRIDS: Array<[number, number]> = [
  [2, 2],
  [2, 4],
  [3, 4]
];

describe('impression groupée des reçus (N-up)', () => {
  for (const kind of ['QUITTANCE', 'RECEIPT'] as const) {
    for (const [cols, rows] of GRIDS) {
      it(`${kind} en ${cols}×${rows} : montant et copropriétaire présents dans chaque case`, async () => {
        const count = cols * rows;
        const items = Array.from({ length: count }, (_, index) => item(kind, index + 1));
        await renderChargeReceiptSheets(items, cols, rows);
        expect(drawn.filter(entry => /^Montant (acquitté|reçu) : /.test(entry.text))).toHaveLength(count);
        expect(drawn.filter(entry => entry.text.startsWith('Awa Koné'))).toHaveLength(count);
        expect(drawn.filter(entry => entry.text === 'Pour acquit')).toHaveLength(count);
        if (kind === 'RECEIPT') {
          expect(drawn.filter(entry => entry.text.startsWith('Reste dû'))).toHaveLength(count);
        }
        // Les lignes d'identification principales survivent aussi à la place réduite.
        for (const label of ['Copropriété', 'Lot', 'Copropriétaire']) {
          expect(drawn.filter(entry => entry.text === label)).toHaveLength(count);
        }
      });

      it(`${kind} en ${cols}×${rows} : le contenu reste au-dessus de la signature et dans la case`, async () => {
        await renderChargeReceiptSheets([item(kind, 1)], cols, rows);
        const cell = gridCells(cols, rows)[0];
        const acquit = drawn.find(entry => entry.text === 'Pour acquit');
        expect(acquit).toBeDefined();
        const amount = drawn.find(entry => /^Montant (acquitté|reçu) : /.test(entry.text))!;
        const coowner = drawn.find(entry => entry.text.startsWith('Awa Koné'))!;
        // Le dernier contenu (montant) finit au-dessus de la ligne « Pour acquit ».
        expect(amount.y).toBeGreaterThan(acquit!.y + acquit!.size);
        expect(coowner.y).toBeGreaterThan(amount.y);
        // Aucune ligne ne sort par le haut de la case, ni sous son bord inférieur.
        for (const entry of drawn) {
          expect(entry.y + entry.size).toBeLessThanOrEqual(cell.y + cell.height + 0.5);
          expect(entry.y).toBeGreaterThanOrEqual(cell.y - 0.5);
        }
        // Les lignes du corps ne se chevauchent pas : écarts verticaux au moins égaux à la police.
        const body = drawn.filter(entry => entry.x === cell.x).sort((a, b) => b.y - a.y);
        for (let index = 1; index < body.length; index += 1) {
          expect(body[index - 1].y - body[index].y).toBeGreaterThanOrEqual(Math.min(body[index].size, 4) - 0.01);
        }
      });
    }
  }
});
