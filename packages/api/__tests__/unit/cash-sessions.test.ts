/**
 * Caisse d'agence — lot 6 : le billetage.
 *
 * Le compté d'une caisse se déduit du nombre de billets et de pièces. Une
 * valeur inventée ou un nombre négatif fausserait l'écart, et donc
 * l'écriture de manquant ou d'excédent qui en découle.
 */

jest.mock('../../src/utils/database', () => ({
  prisma: {
    rentalPayment: { findMany: jest.fn() },
    ownerPayout: { findMany: jest.fn() },
    cashVoucher: { findMany: jest.fn() },
    voidDocument: { findMany: jest.fn() }
  }
}));
jest.mock('../../src/services/permission-service', () => ({ hasPermission: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { countDenominations, DENOMINATIONS, computeExpected } = require('../../src/lib/cash-sessions/service');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockedDb = require('../../src/utils/database');
const mockPrisma = mockedDb.prisma;

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

describe('computeExpected — filtrage par caisse (lot 10)', () => {
  const tenantId = 'tenant-1';
  const cashierUserId = 'cashier-1';
  const sessionCashId = 'treasury-session-cash';
  const otherCashId = 'treasury-other-cash';
  const from = new Date('2026-09-01T00:00:00.000Z');
  const to = new Date('2026-09-30T00:00:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.voidDocument.findMany.mockResolvedValue([]);
  });

  it('ne retient que les loyers et reversements portant le compte de CETTE session', async () => {
    mockPrisma.rentalPayment.findMany.mockResolvedValue([
      { amount: 10000, created_at: from, treasury_account_id: sessionCashId, lease: null },
      { amount: 5000, created_at: from, treasury_account_id: otherCashId, lease: null }
    ]);
    mockPrisma.ownerPayout.findMany.mockResolvedValue([
      { amount: 2000, createdAt: from, year: 2026, sequence: 1, treasuryAccountId: sessionCashId },
      { amount: 3000, createdAt: from, year: 2026, sequence: 2, treasuryAccountId: otherCashId }
    ]);
    mockPrisma.cashVoucher.findMany.mockResolvedValue([]);

    const expected = await computeExpected(tenantId, cashierUserId, sessionCashId, false, 0, from, to);

    expect(expected.receipts).toBe(10000);
    expect(expected.disbursements).toBe(2000);
    expect(mockPrisma.cashVoucher.findMany).not.toHaveBeenCalled();
  });

  it('compte les mouvements sans compte désigné seulement quand la session tient la caisse par défaut', async () => {
    mockPrisma.rentalPayment.findMany.mockResolvedValue([
      { amount: 7000, created_at: from, treasury_account_id: null, lease: null }
    ]);
    mockPrisma.ownerPayout.findMany.mockResolvedValue([]);
    mockPrisma.cashVoucher.findMany.mockResolvedValue([
      {
        id: 'v1',
        amount: 1500,
        validatedAt: from,
        voucherYear: 2026,
        voucherNumber: 1,
        beneficiaryName: 'Fournisseur X'
      }
    ]);

    const notDefault = await computeExpected(tenantId, cashierUserId, sessionCashId, false, 0, from, to);
    expect(notDefault.receipts).toBe(0);
    expect(notDefault.disbursements).toBe(0);
    expect(mockPrisma.cashVoucher.findMany).not.toHaveBeenCalled();

    const asDefault = await computeExpected(tenantId, cashierUserId, sessionCashId, true, 0, from, to);
    expect(asDefault.receipts).toBe(7000);
    expect(asDefault.disbursements).toBe(1500);
  });

  it('ajoute le fond de caisse au solde attendu', async () => {
    mockPrisma.rentalPayment.findMany.mockResolvedValue([]);
    mockPrisma.ownerPayout.findMany.mockResolvedValue([]);
    mockPrisma.cashVoucher.findMany.mockResolvedValue([]);

    const expected = await computeExpected(tenantId, cashierUserId, sessionCashId, true, 25000, from, to);
    expect(expected.amount).toBe(25000);
  });
});
