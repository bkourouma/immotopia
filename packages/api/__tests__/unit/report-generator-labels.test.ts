/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BUG-2026-11-04-009 — exports du portail propriétaire : libellés lisibles (pas
 * BANK_TRANSFER / SUCCESS / PAID...) et cellules Excel neutralisées contre les
 * formules.
 */
const mockPrisma: any = {
  rentalPayment: { findMany: jest.fn() },
  rentalInstallment: { findMany: jest.fn() },
  rentalLease: { findMany: jest.fn() }
};
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

import ExcelJS from 'exceljs';
import { exportData } from '../../src/utils/report-generator';
import { runWithLanguage } from '../../src/i18n';

const lease = {
  property: { address: '=HYPERLINK("http://x")' },
  primaryRenter: { user: { id: 'u', fullName: '+Pirate' } }
};

beforeEach(() => {
  mockPrisma.rentalPayment.findMany.mockResolvedValue([
    {
      id: 'p1',
      amount: 1000,
      succeeded_at: new Date('2026-10-01'),
      method: 'BANK_TRANSFER',
      status: 'SUCCESS',
      lease
    }
  ]);
  mockPrisma.rentalInstallment.findMany.mockResolvedValue([
    {
      id: 'i1',
      period_month: 10,
      period_year: 2026,
      due_date: new Date('2026-10-01'),
      amount_rent: 1000,
      amount_service: 0,
      amount_other_fees: 0,
      penalty_amount: 0,
      amount_paid: 0,
      status: 'PARTIAL',
      lease
    }
  ]);
  mockPrisma.rentalLease.findMany.mockResolvedValue([
    {
      id: 'l1',
      start_date: new Date('2026-01-01'),
      end_date: null,
      rent_amount: 1000,
      status: 'ACTIVE',
      property: lease.property,
      primaryRenter: lease.primaryRenter
    }
  ]);
});

const csv = (type: 'payments' | 'installments' | 'leases') =>
  runWithLanguage('fr', async () => (await exportData(type, ['p'], 'T', {}, 'csv')).toString('utf-8'));

describe('exports — valeurs lisibles', () => {
  it('paiements : méthode et statut en français', async () => {
    const text = await csv('payments');
    expect(text).toContain('Virement bancaire');
    expect(text).toContain('Réussi');
    expect(text).not.toMatch(/BANK_TRANSFER|SUCCESS/);
  });

  it('échéances : statut en français', async () => {
    const text = await csv('installments');
    expect(text).toContain('Partiellement payée');
    expect(text).not.toContain('PARTIAL');
  });

  it('baux : statut en français', async () => {
    const text = await csv('leases');
    expect(text).toContain('Actif');
    expect(text).not.toContain('ACTIVE');
  });
});

describe('export Excel — formules neutralisées', () => {
  it("préfixe d'une apostrophe un texte qui commence par = ou +", async () => {
    const buffer = await exportData('payments', ['p'], 'T', {}, 'excel');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const row = workbook.worksheets[0].getRow(2);
    expect(String(row.getCell(2).value)).toBe(`'=HYPERLINK("http://x")`);
    expect(String(row.getCell(3).value)).toBe("'+Pirate");
  });
});
