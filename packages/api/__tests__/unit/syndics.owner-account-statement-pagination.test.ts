import { PDFDocument } from 'pdf-lib';
import { buildOwnerAccountStatementPdf } from '../../src/lib/syndics/owner-account-statement';

/**
 * Non-régression : le relevé français ne reprenait que les 30 premiers
 * mouvements (`slice(0, 30)`) et coupait la liste sans page de suite, alors que
 * le solde final couvrait tout le compte. La version arabe, elle, paginait.
 */
describe('buildOwnerAccountStatementPdf : pagination', () => {
  const movements = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      transactionDate: new Date(Date.UTC(2026, 0, 1 + (index % 28))),
      type: 'CHARGE_CALL',
      label: `Appel ${index + 1}`,
      debit: 1000,
      credit: null,
      balanceAfter: 1000 * (index + 1)
    }));

  const payload = (count: number) => ({
    syndicateName: 'Résidence Les Rôniers',
    lotNumber: 'A-12',
    ownerName: 'Amadou Koné',
    currency: 'FCFA',
    openingBalance: 0,
    closingBalance: 1000 * count,
    transactions: movements(count)
  });

  it('garde une seule page pour un compte court', async () => {
    const pdf = await PDFDocument.load(await buildOwnerAccountStatementPdf(payload(5)));
    expect(pdf.getPageCount()).toBe(1);
  });

  it('ajoute des pages de suite au lieu de couper la liste à 30 lignes', async () => {
    const pdf = await PDFDocument.load(await buildOwnerAccountStatementPdf(payload(100)));
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });
});
