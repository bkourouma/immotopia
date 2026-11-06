import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { PDFDocument } from 'pdf-lib';
import { runWithLanguage } from '../../src/i18n';
import * as documentBranding from '../../src/lib/documents/document-branding';
import { renderChargeCallNoticePdf, type ChargeCallNoticeData } from '../../src/lib/syndics/charge-call-notice-pdf';
import { buildOwnerAccountStatementPdf } from '../../src/lib/syndics/owner-account-statement';
import { renderArabicReceiptTranslationPdf } from '../../src/lib/syndics/charge-receipt-translation-pdf';
import type { ChargeReceiptSnapshot } from '../../src/lib/syndics/charge-receipt-snapshot';
import { buildPlatformInvoicePdf } from '../../src/lib/subscription/platform-invoice-pdf';
import { generateRevenueReportPDF, generateOccupancyReportPDF } from '../../src/utils/report-generator';
import { buildCashVoucherPdf } from '../../src/controllers/finance-sites-controller';
import { buildPatrimoinePdf } from '../../src/lib/patrimoine/export/pdf';
import type { PatrimoineExportData } from '../../src/lib/patrimoine/export/data';
import { buildNetWorthPdf } from '../../src/lib/patrimoine/export/net-worth-pdf';
import type { NetWorthExportData } from '../../src/lib/patrimoine/export/net-worth-data';
import { buildAccountStatementPdf } from '../../src/lib/finance/statement-pdf';
import { arabicFaces, drawArabicNumber } from '../../src/lib/documents/pdf-arabic';

const branding: documentBranding.DocumentBranding = {
  issuer: {
    kind: 'AGENCY',
    name: 'وكالة النخيل Agence Palmiers',
    legalName: null,
    address: 'شارع النخيل, Abidjan',
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

async function check(name: string, buffer: Buffer, minimumPages = 1) {
  expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect((await PDFDocument.load(buffer)).getPageCount()).toBeGreaterThanOrEqual(minimumPages);
  if (process.env.PDF_AR_QA_DIR) {
    await mkdir(process.env.PDF_AR_QA_DIR, { recursive: true });
    await writeFile(join(process.env.PDF_AR_QA_DIR, `${name}.pdf`), buffer);
  }
}

describe('PDF arabes non archivés et copies de lecture', () => {
  afterEach(() => jest.restoreAllMocks());

  it('compose un avis de charges avec nom, adresse, montants et date mixtes', async () => {
    const data: ChargeCallNoticeData = {
      chargeCallId: 'call-1',
      period: { label: 'الربع الأول T1', start: '2026-01-01', end: '2026-03-31' },
      issuedAt: '2026-01-05',
      dueDate: '2026-01-31',
      currency: 'XOF',
      amount: 150000,
      advanceImputed: 25000,
      paid: 50000,
      outstanding: 75000,
      lot: { number: 'A-12', type: 'Appartement', label: 'شقة النخيل' },
      coowner: { name: 'مريم ديوماندي Mariam Diomandé', address: 'Rue des Palmiers، أبيدجان' },
      paymentMethods: [
        { type: 'BANK_TRANSFER', label: 'تحويل bancaire', provider: 'Banque X', accountRef: 'CI12 3456' }
      ]
    };
    await check('avis-charges-ar', await runWithLanguage('ar', () => renderChargeCallNoticePdf(data, branding)));
  });

  it('pagine un relevé copropriétaire sans omettre les opérations reçues', async () => {
    const transactions = Array.from({ length: 75 }, (_, index) => ({
      transactionDate: new Date('2026-09-01T00:00:00.000Z'),
      type: index % 2 ? 'PAYMENT' : 'CHARGE_CALL',
      label: `رسوم الإقامة Résidence des Palmiers ${index + 1}`,
      debit: index % 2 ? null : 150000,
      credit: index % 2 ? 125000 : null,
      balanceAfter: index % 2 ? -25000 : 125000
    }));
    await check(
      'releve-copro-ar',
      await runWithLanguage('ar', () =>
        buildOwnerAccountStatementPdf(
          {
            syndicateName: 'إقامة النخيل',
            lotNumber: 'A-12',
            ownerName: 'مريم ديوماندي Mariam',
            currency: 'XOF',
            openingBalance: -125000,
            closingBalance: 75000,
            transactions
          },
          branding
        )
      ),
      2
    );
  });

  it('produit une copie arabe distincte d’un reçu figé, sans signature', async () => {
    const snapshot: ChargeReceiptSnapshot = {
      version: 1,
      kind: 'RECEIPT',
      number: 'R-2026-001',
      issuedAt: '2026-09-05',
      currency: 'XOF',
      amount: 150000,
      issuer: { ...branding.issuer, key: 'AGENCY' },
      syndicate: { name: 'إقامة النخيل', address: 'Rue des Palmiers', registrationNo: null, cadastralReference: null },
      lot: { number: 'A-12', type: 'Appartement', label: 'شقة النخيل' },
      coowner: { name: 'مريم ديوماندي', address: 'أبيدجان' },
      call: null,
      settlements: [],
      settledAt: null,
      payment: { id: 'payment-1', amount: 150000, paidAt: '2026-09-05', method: 'VIREMENT', reference: 'CI12 3456' },
      allocations: [
        {
          chargeCallId: 'call-1',
          period: { label: 'T3', start: '2026-07-01', end: '2026-09-30' },
          callAmount: 180000,
          allocated: 150000,
          source: 'PAYMENT',
          outstandingAfter: 30000
        }
      ],
      outstandingAfter: 30000,
      advance: 0,
      lotAdvanceBalance: 0,
      backfilled: false
    };
    await check('recu-traduction-ar', await renderArabicReceiptTranslationPdf(snapshot));
  });

  it('rend une copie arabe de facture avec montants négatifs et lignes mixtes', async () => {
    await check(
      'facture-traduction-ar',
      await buildPlatformInvoicePdf(
        {
          invoiceNumber: 'IMT-2026-001',
          nature: 'PERIOD',
          status: 'ISSUED',
          issueDate: new Date('2026-09-01'),
          dueDate: new Date('2026-09-30'),
          periodStart: new Date('2026-09-01'),
          periodEnd: new Date('2026-10-01'),
          currency: 'XOF',
          issuer: { name: 'ImmoTopia', address: 'Abidjan', phone: null, email: null, rccm: null, taxId: null },
          customer: {
            tenantId: 'tenant-1',
            name: 'وكالة النخيل Agence Palmiers',
            address: 'شارع النخيل, Abidjan',
            email: null,
            phone: null,
            taxId: null
          },
          lines: [
            { kind: 'PACK', label: 'اشتراك plateforme September 2026', quantity: 1, unitPrice: 150000, amount: 150000 },
            { kind: 'DISCOUNT', label: 'خصم remise commerciale', quantity: 1, unitPrice: -25000, amount: -25000 }
          ],
          amountExclTax: 125000,
          taxRate: 0,
          taxAmount: 0,
          amountTotal: 125000
        },
        'ar'
      )
    );
  });

  it('pagine les rapports revenus et occupation avec des adresses arabes', async () => {
    jest.spyOn(documentBranding, 'resolveDocumentBranding').mockResolvedValue(branding);
    const revenuesByProperty = Array.from({ length: 20 }, (_, index) => ({
      propertyAddress: `شقة ${index + 1} - Résidence des Palmiers`,
      revenue: index % 2 ? -25000 : 150000,
      paymentCount: 2
    }));
    await check(
      'rapport-revenus-ar',
      await runWithLanguage('ar', () =>
        generateRevenueReportPDF(
          {
            startDate: new Date('2026-01-01'),
            endDate: new Date('2026-12-31'),
            totalRevenue: 125000,
            paymentCount: 40,
            revenuesByProperty,
            revenuesByMonth: []
          },
          'tenant-1'
        )
      )
    );
    const properties = Array.from({ length: 30 }, (_, index) => ({
      address: `شقة ${index + 1} - Résidence des Palmiers`,
      status: index % 2 ? 'OCCUPIED' : 'AVAILABLE'
    }));
    await check(
      'rapport-occupation-ar',
      await runWithLanguage('ar', () =>
        generateOccupancyReportPDF(
          {
            asOfDate: new Date('2026-11-05'),
            totalProperties: 30,
            occupiedProperties: 15,
            availableProperties: 15,
            occupancyRate: 50,
            properties
          },
          'tenant-1'
        )
      )
    );
  });

  it('rend un bon de caisse arabe avec montant, chantier et bénéficiaire mixtes', async () => {
    jest.spyOn(documentBranding, 'resolveDocumentBranding').mockResolvedValue(branding);
    await check(
      'bon-caisse-ar',
      await runWithLanguage('ar', () =>
        buildCashVoucherPdf({
          tenantId: 'tenant-1',
          number: 'BC-2026-001',
          beneficiary: 'مريم ديوماندي Mariam',
          amount: -25000,
          currency: 'XOF',
          reason: 'تسوية frais de chantier',
          voucherDate: new Date('2026-09-05'),
          siteName: 'مشروع النخيل Abidjan',
          costCategoryLabel: 'مواد construction',
          status: 'VALIDATED',
          validatedAt: new Date('2026-09-06')
        })
      )
    );
  });

  it('rend l’export patrimoine arabe avec valeurs, emprunt et performance non nuls', async () => {
    jest.spyOn(documentBranding, 'resolveDocumentBranding').mockResolvedValue(branding);
    const data: PatrimoineExportData = {
      scope: 'AGENCY',
      generatedAt: new Date('2026-11-05'),
      overview: {
        totalProperties: 1,
        occupiedProperties: 1,
        occupancyRate: 1,
        totalEstimatedValue: 125000000,
        totalLoanBalance: 32000000,
        totalExpensesThisYear: 1500000,
        totalAnnualRent: 9600000
      },
      properties: [
        {
          id: 'prop-1',
          internalReference: 'REF-001',
          title: 'إقامة النخيل Résidence des Palmiers',
          propertyType: 'APPARTEMENT',
          status: 'OCCUPIED',
          address: 'شارع النخيل, Cocody Abidjan',
          valuations: [
            { valuatedAt: new Date('2026-09-01'), estimatedValue: 125000000, currency: 'XOF', method: 'MANUAL' }
          ],
          loans: [
            {
              lender: 'Banque Atlantique بنك',
              capitalAmount: 50000000,
              remainingCapital: 32000000,
              interestRate: 6.5,
              monthlyPayment: 850000,
              currency: 'XOF',
              startDate: new Date('2024-01-01'),
              endDate: new Date('2030-01-01'),
              status: 'ACTIVE'
            }
          ],
          expenses: [
            {
              category: 'ROUTINE_MAINTENANCE',
              label: 'صيانة climatisation',
              amount: 1500000,
              currency: 'XOF',
              paidAt: new Date('2026-09-05'),
              isCapitalized: false
            }
          ],
          workPrograms: [
            {
              title: 'إصلاح toiture',
              status: 'PLANNED',
              estimatedCost: 4500000,
              actualCost: null,
              currency: 'XOF',
              plannedDate: new Date('2027-03-01'),
              completedDate: null
            }
          ],
          documents: [
            {
              type: 'INSURANCE',
              label: 'تأمين assurance.pdf',
              expiresAt: new Date('2026-12-01'),
              state: 'EXPIRING_SOON',
              daysRemaining: 26
            }
          ],
          yield: {
            currentValue: 125000000,
            annualRent: 9600000,
            annualExpenses: 1500000,
            grossYield: 7.68,
            netYield: 6.1,
            netNetYield: 4.2,
            latentCapitalGain: -15000000
          }
        }
      ]
    };
    await check('patrimoine-export-ar', await runWithLanguage('ar', () => buildPatrimoinePdf('tenant-1', data)));
  });

  it('rend la valeur nette arabe avec dette, actif et solde négatif non nuls', async () => {
    jest.spyOn(documentBranding, 'resolveDocumentBranding').mockResolvedValue(branding);
    const data: NetWorthExportData = {
      generatedAt: new Date('2026-11-05'),
      asOf: new Date('2026-11-05'),
      currency: 'XOF',
      totalAssets: 125000000,
      totalDebts: 150000000,
      netWorth: -25000000,
      lowReliabilityShare: 12.5,
      byClass: [{ assetClass: 'REAL_ESTATE', value: 125000000, count: 1, share: 100 }],
      assets: [
        {
          id: 'asset-1',
          name: 'إقامة النخيل Résidence des Palmiers',
          assetClass: 'REAL_ESTATE',
          currency: 'XOF',
          originalValue: 125000000,
          valueXof: 125000000,
          valuatedAt: new Date('2026-09-01'),
          reliability: 'MEDIUM',
          stale: false
        }
      ],
      excludedAssets: [
        { id: 'asset-2', name: 'أرض Terrain sans valeur', assetClass: 'REAL_ESTATE', reason: 'NO_VALUATION' }
      ],
      debts: [
        {
          id: 'debt-1',
          lender: 'Banque Atlantique بنك',
          assetName: 'إقامة النخيل',
          currency: 'XOF',
          remainingCapital: 150000000,
          valueXof: 150000000,
          endDate: new Date('2030-01-01')
        }
      ],
      history: [{ date: '2026-11-05', totalAssets: 125000000, totalDebts: 150000000, netWorth: -25000000 }],
      totals: { assets: 1, excludedAssets: 1, debts: 1 },
      truncated: { assets: false, excludedAssets: false, debts: false }
    };
    await check('valeur-nette-ar', await runWithLanguage('ar', () => buildNetWorthPdf('tenant-1', data)));
  });

  it('garde un solde négatif maximal complet dans une colonne numérique étroite', async () => {
    jest.spyOn(documentBranding, 'resolveDocumentBranding').mockResolvedValue(branding);
    const opening = -Number.MAX_SAFE_INTEGER;
    const billed = 1_000_000;
    await check(
      'releve-ar-montant-extreme',
      await runWithLanguage('ar', () =>
        buildAccountStatementPdf({
          tenantId: 'tenant-1',
          accountLabel: 'الحساب الضخم Compte principal',
          currency: 'XOF',
          openingBalance: opening,
          closingBalance: opening + billed,
          movements: [
            {
              id: 'extreme-movement',
              accountId: 'account-1',
              sourceType: 'MANUAL',
              sourceId: 'extreme-movement',
              leaseId: null,
              createdAt: new Date('2026-09-05'),
              movementDate: new Date('2026-09-05'),
              type: 'INSTALLMENT',
              label: 'فاتورة إيجار سبتمبر',
              amountBilled: billed,
              amountSettled: 0,
              balanceAfter: opening + billed
            }
          ]
        })
      )
    );
  });

  it('réduit la taille d’un montant extrême sans tronquer son signe, ses chiffres ou XOF', async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const faces = await arabicFaces(pdf);
    const value = `-${Number.MAX_SAFE_INTEGER.toLocaleString('fr-FR')} XOF`;
    const draw = jest.spyOn(faces.regular.withDirection('ltr'), 'draw').mockImplementation(() => undefined);
    drawArabicNumber(page, faces.regular, value, { x: 330, y: 650, size: 8, maxWidth: 90, align: 'start' });
    expect(draw).toHaveBeenCalledWith(
      page,
      value.replace(/[\u00a0\u202f]/g, ' '),
      expect.objectContaining({ x: 330, y: 650 })
    );
    const usedSize = draw.mock.calls[0][2].size;
    expect(usedSize).toBeLessThanOrEqual(8);
    expect(faces.regular.width(value, usedSize)).toBeLessThanOrEqual(90.01);
  });
});
