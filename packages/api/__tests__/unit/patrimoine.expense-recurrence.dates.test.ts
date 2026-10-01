/**
 * Dépenses périodiques : comparaison par jour UTC et date de paiement réel
 * (une dépense périodique ne peut pas être datée dans le futur au-delà de 24 h).
 */

const propertyFindFirst = jest.fn();
const expenseFindFirst = jest.fn();
const expenseCreate = jest.fn();
const expenseUpdate = jest.fn();

jest.mock('../../src/utils/database', () => {
  const prisma: any = {
    property: { findFirst: (...a: any[]) => propertyFindFirst(...a) },
    propertyExpense: {
      findFirst: (...a: any[]) => expenseFindFirst(...a),
      create: (...a: any[]) => expenseCreate(...a),
      update: (...a: any[]) => expenseUpdate(...a)
    }
  };
  prisma.$transaction = async (callback: (tx: any) => unknown) => callback(prisma);
  return { prisma };
});
jest.mock('../../src/lib/treasury/accounts', () => ({ assertTreasuryAccountUsableTx: jest.fn() }));
jest.mock('../../src/lib/finance/rental-direct-ledger', () => ({ syncDirectExpenseEntryTx: jest.fn() }));

import { createPropertyExpense, updatePropertyExpense } from '../../src/lib/patrimoine/queries';

const TENANT = 'tenant-1';
const PROPERTY = 'prop-1';
const DAY = 24 * 3600 * 1000;
const baseInput = {
  category: 'INSURANCE' as const,
  label: 'Assurance',
  amount: 30_000,
  currency: 'XOF',
  paidAt: new Date('2026-09-01T00:00:00Z'),
  isCapitalized: false
};

beforeEach(() => {
  jest.clearAllMocks();
  propertyFindFirst.mockResolvedValue({ id: PROPERTY, tenantId: TENANT });
  expenseCreate.mockImplementation(async ({ data }: any) => ({ id: 'exp-1', ...data }));
  expenseUpdate.mockImplementation(async ({ data }: any) => ({ id: 'exp-1', ...data }));
});

describe('assertExpenseRecurrence — jour UTC', () => {
  it('une fin le même jour que la dépense est acceptée, même avec une heure antérieure', async () => {
    await createPropertyExpense(TENANT, PROPERTY, {
      ...baseInput,
      paidAt: new Date('2026-09-01T18:00:00Z'),
      recurrence: 'MONTHLY',
      recurrenceEndDate: new Date('2026-09-01T00:00:00Z')
    });
    expect(expenseCreate).toHaveBeenCalledTimes(1);
  });

  it('une fin la veille est refusée', async () => {
    await expect(
      createPropertyExpense(TENANT, PROPERTY, {
        ...baseInput,
        recurrence: 'MONTHLY',
        recurrenceEndDate: new Date('2026-08-31T23:59:00Z')
      })
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('assertExpenseRecurrence — date de paiement réel', () => {
  it('une dépense périodique datée au-delà de 24 h dans le futur est refusée ; en deçà, acceptée', async () => {
    await expect(
      createPropertyExpense(TENANT, PROPERTY, {
        ...baseInput,
        paidAt: new Date(Date.now() + 5 * DAY),
        recurrence: 'ANNUAL'
      })
    ).rejects.toMatchObject({ status: 400 });
    await createPropertyExpense(TENANT, PROPERTY, {
      ...baseInput,
      paidAt: new Date(Date.now() + 12 * 3600 * 1000),
      recurrence: 'ANNUAL'
    });
    expect(expenseCreate).toHaveBeenCalledTimes(1);
  });

  it('une dépense ponctuelle future reste permise', async () => {
    await createPropertyExpense(TENANT, PROPERTY, { ...baseInput, paidAt: new Date(Date.now() + 5 * DAY) });
    expect(expenseCreate).toHaveBeenCalledTimes(1);
  });

  it('à la mise à jour, la règle porte sur les valeurs effectives', async () => {
    expenseFindFirst.mockResolvedValue({
      id: 'exp-1',
      tenantId: TENANT,
      propertyId: PROPERTY,
      paidAt: new Date('2026-09-01T00:00:00Z'),
      agencyIsBuyer: false,
      supplierName: null,
      treasuryAccountId: null,
      paymentMethod: null,
      recurrence: 'MONTHLY',
      recurrenceEndDate: null
    });
    await expect(
      updatePropertyExpense(TENANT, PROPERTY, 'exp-1', { paidAt: new Date(Date.now() + 5 * DAY) })
    ).rejects.toMatchObject({ status: 400 });
    expect(expenseUpdate).not.toHaveBeenCalled();
  });
});
