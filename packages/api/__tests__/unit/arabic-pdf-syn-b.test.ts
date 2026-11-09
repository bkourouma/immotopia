import { PDFDocument } from 'pdf-lib';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { runWithLanguage } from '../../src/i18n';
import type { DocumentBranding } from '../../src/lib/documents/document-branding';
import { renderAuthorizationPdf } from '../../src/lib/direct-debit/authorization-pdf';
import { renderSaleAgreementPdf } from '../../src/lib/sales/agreement-pdf';
import { renderClauseDocumentPdf } from '../../src/lib/documents/clause-document-pdf';
import { renderStockPdf } from '../../src/lib/finance/stock-bons-pdf';
import { renderInspectionPdf } from '../../src/lib/lease-inspections/inspection-pdf';

const branding: DocumentBranding = {
  issuer: {
    kind: 'AGENCY',
    name: 'وكالة النخيل',
    legalName: null,
    address: 'أبيدجان',
    phone: null,
    email: null,
    rccm: null,
    taxId: null
  },
  issuerLogo: null,
  signature: null,
  stamp: null,
  syndicate: null
};

async function expectPdf(name: string, buffer: Buffer, minimumPages = 1) {
  expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect((await PDFDocument.load(buffer)).getPageCount()).toBeGreaterThanOrEqual(minimumPages);
  if (process.env.PDF_AR_QA_DIR) {
    await mkdir(process.env.PDF_AR_QA_DIR, { recursive: true });
    await writeFile(join(process.env.PDF_AR_QA_DIR, `${name}.pdf`), buffer);
  }
}

describe('PDF arabes du lot syndics et patrimoine', () => {
  it('rend une autorisation avec IBAN et montants LTR', async () => {
    const pdf = await runWithLanguage('ar', () =>
      renderAuthorizationPdf(
        {
          reference: 'M-2026-001',
          creditorLabel: 'وكالة النخيل',
          creditorIdentifier: 'CI123',
          creditorBankName: 'Banque X',
          debtorName: 'مريم',
          holderName: 'Mariam',
          iban: 'CI12 3456 7890',
          bankCode: 'BK01',
          leaseNumber: null,
          propertyLabel: null,
          syndicateName: 'إقامة النخيل',
          lotNumber: 'A-12',
          maxAmount: 150000,
          collectionDay: 5,
          currency: 'XOF'
        },
        branding
      )
    );
    await expectPdf('autorisation-ar', pdf);
  });

  it('pagine un compromis avec clauses et échéances longues', async () => {
    const pdf = await runWithLanguage('ar', () =>
      renderSaleAgreementPdf(
        {
          number: 'CV-2026-001',
          price: 75000000,
          depositAmount: 5000000,
          depositHolder: 'NOTARY',
          notaryName: 'Maître Diop',
          expectedDeedDate: '2026-12-01',
          financing: 'MIXED',
          seller: { name: 'علي Diallo' },
          buyer: { name: 'Société Palmiers', company: true, representative: 'مريم' },
          property: { title: 'شقة النخيل', reference: 'B-12', address: 'Rue des Palmiers', zone: 'أبيدجان' },
          currency: 'XOF',
          conditions: Array.from({ length: 28 }, (_, index) => ({
            label: `شرط تمويلي ${index + 1} ${'تفاصيل إضافية '.repeat(8)}`,
            dueDate: '2026-11-30'
          })),
          milestones: [{ label: 'الدفعة الأولى', dueDate: '2026-11-15', amount: 10000000 }]
        },
        branding
      )
    );
    await expectPdf('compromis-ar', pdf, 2);
  });

  it('rend les clauses, le stock et un état des lieux avec données Unicode', async () => {
    const clause = await runWithLanguage('ar', () =>
      renderClauseDocumentPdf(
        {
          title: 'Mandat de vente',
          sections: [
            {
              title: 'Conditions',
              rows: [{ label: 'Bien', value: 'شقة النخيل' }],
              paragraphs: ['نص حر fourni par le client '.repeat(12)]
            }
          ],
          signatures: [{ role: 'Le vendeur', name: 'علي' }]
        },
        branding
      )
    );
    await expectPdf('mandat-clauses-ar', clause);

    const stock = await runWithLanguage('ar', () =>
      renderStockPdf(
        {
          fileName: 'stock.pdf',
          title: 'Bon de sortie',
          number: 'BS-001',
          info: [{ label: 'Lieu', value: 'مخزن أبيدجان' }],
          notices: [],
          sections: [
            {
              title: 'Articles',
              columns: [
                { header: 'Désignation', weight: 3 },
                { header: 'Quantité', weight: 1 }
              ],
              rows: [{ cells: ['منتج مختلط', '12,00'] }],
              emptyText: 'Aucun article.'
            }
          ],
          totals: [{ label: 'Valeur totale', value: '150 000 XOF' }],
          signatures: ['Établi par', 'Reçu par'],
          reprintMention: 'Exemplaire réimprimé'
        },
        branding
      )
    );
    await expectPdf('stock-ar', stock);

    const inspection = await runWithLanguage('ar', () =>
      renderInspectionPdf(
        {
          fileName: 'inspection.pdf',
          title: 'État des lieux',
          subtitle: 'Appartement A-12',
          info: [{ label: 'Adresse', value: 'شارع النخيل' }],
          sections: [
            {
              kind: 'table',
              title: 'Pièces',
              columns: [{ header: 'Pièce', weight: 2 }],
              rows: [['غرفة النوم']],
              emptyText: 'Aucune pièce.'
            }
          ],
          photos: [],
          photosOmitted: 0,
          signatures: [{ label: 'Le locataire', name: 'مريم' }],
          footer: 'État des lieux'
        },
        branding
      )
    );
    await expectPdf('etat-des-lieux-ar', inspection);
  });
});
