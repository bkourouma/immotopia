/**
 * Périodicité des dépenses d'un bien (plan de trésorerie, spec 030) :
 * schémas Zod et règles de cohérence de `lib/patrimoine/queries.ts`.
 * Mock à la frontière `utils/database`.
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

import { createExpenseSchema, updateExpenseSchema } from '../../src/lib/patrimoine/schemas';
import { createPropertyExpense, updatePropertyExpense } from '../../src/lib/patrimoine/queries';

const TENANT = 'tenant-1';
const PROPERTY = 'prop-1';
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

describe('schémas de dépense — périodicité', () => {
  const body = { category: 'INSURANCE', label: 'Assurance', amount: 30000, paidAt: '2026-09-01' };

  it('ponctuelle par défaut à la création', () => {
    const parsed = createExpenseSchema.parse(body);
    expect(parsed.recurrence).toBe('ONE_OFF');
    expect(parsed.recurrenceEndDate).toBeUndefined();
  });

  it('accepte les trois périodicités et une date de fin nulle', () => {
    for (const recurrence of ['MONTHLY', 'QUARTERLY', 'ANNUAL']) {
      expect(createExpenseSchema.parse({ ...body, recurrence, recurrenceEndDate: null }).recurrence).toBe(recurrence);
    }
    expect(
      createExpenseSchema.parse({ ...body, recurrence: 'MONTHLY', recurrenceEndDate: '2027-01-31' }).recurrenceEndDate
    ).toEqual(new Date('2027-01-31'));
  });

  it('refuse une périodicité inconnue', () => {
    expect(createExpenseSchema.safeParse({ ...body, recurrence: 'WEEKLY' }).success).toBe(false);
  });

  it("à la mise à jour, l'absence de périodicité ne la réinitialise pas", () => {
    const parsed = updateExpenseSchema.parse({ label: 'Nouveau libellé' });
    expect(parsed).toEqual({ label: 'Nouveau libellé' });
  });
});

describe('createPropertyExpense — périodicité', () => {
  it('enregistre ONE_OFF et aucune date de fin par défaut', async () => {
    await createPropertyExpense(TENANT, PROPERTY, baseInput);
    expect(expenseCreate.mock.calls[0][0].data).toMatchObject({ recurrence: 'ONE_OFF', recurrenceEndDate: null });
  });

  it('enregistre une dépense mensuelle avec sa date de fin', async () => {
    const end = new Date('2027-01-31T00:00:00Z');
    await createPropertyExpense(TENANT, PROPERTY, { ...baseInput, recurrence: 'MONTHLY', recurrenceEndDate: end });
    expect(expenseCreate.mock.calls[0][0].data).toMatchObject({ recurrence: 'MONTHLY', recurrenceEndDate: end });
  });

  it('refuse une date de fin sur une dépense ponctuelle, ou antérieure à la date de la dépense', async () => {
    const end = new Date('2027-01-31T00:00:00Z');
    await expect(
      createPropertyExpense(TENANT, PROPERTY, { ...baseInput, recurrenceEndDate: end })
    ).rejects.toMatchObject({
      status: 400
    });
    await expect(
      createPropertyExpense(TENANT, PROPERTY, {
        ...baseInput,
        recurrence: 'MONTHLY',
        recurrenceEndDate: new Date('2026-08-31T00:00:00Z')
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(expenseCreate).not.toHaveBeenCalled();
  });
});

describe('updatePropertyExpense — périodicité', () => {
  const existing = {
    id: 'exp-1',
    tenantId: TENANT,
    propertyId: PROPERTY,
    paidAt: new Date('2026-09-01T00:00:00Z'),
    agencyIsBuyer: false,
    supplierName: null,
    treasuryAccountId: null,
    paymentMethod: null,
    recurrence: 'MONTHLY',
    recurrenceEndDate: new Date('2027-01-31T00:00:00Z')
  };

  beforeEach(() => expenseFindFirst.mockResolvedValue(existing));

  it('repasser en ponctuelle efface la date de fin', async () => {
    await updatePropertyExpense(TENANT, PROPERTY, 'exp-1', { recurrence: 'ONE_OFF' });
    expect(expenseUpdate.mock.calls[0][0].data).toMatchObject({ recurrence: 'ONE_OFF', recurrenceEndDate: null });
  });

  it('une mise à jour sans rapport laisse la périodicité et la date de fin stockées', async () => {
    await updatePropertyExpense(TENANT, PROPERTY, 'exp-1', { label: 'Autre' });
    const data = expenseUpdate.mock.calls[0][0].data;
    expect(data.recurrence).toBeUndefined();
    expect(data.recurrenceEndDate).toEqual(existing.recurrenceEndDate);
  });

  it('vérifie la cohérence avec la valeur stockée : date de dépense reculée après la fin => 400', async () => {
    await expect(
      updatePropertyExpense(TENANT, PROPERTY, 'exp-1', { paidAt: new Date('2027-02-01T00:00:00Z') })
    ).rejects.toMatchObject({ status: 400 });
    expect(expenseUpdate).not.toHaveBeenCalled();
  });

  it('une date de fin sur une dépense stockée ponctuelle est refusée', async () => {
    expenseFindFirst.mockResolvedValue({ ...existing, recurrence: 'ONE_OFF', recurrenceEndDate: null });
    await expect(
      updatePropertyExpense(TENANT, PROPERTY, 'exp-1', { recurrenceEndDate: new Date('2027-03-01T00:00:00Z') })
    ).rejects.toMatchObject({ status: 400 });
  });
});
