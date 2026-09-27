/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Lot S6 — factures et paiements des prestataires d'une copropriete.
 *
 * Base en memoire qui applique VRAIMENT les filtres `where` (via
 * `matchesWhere` de helpers/fake-prisma.ts) et annule une transaction qui
 * echoue : un refus doit ne rien laisser derriere lui. Couvre l'equilibre des
 * ecritures, le fonds debite et son mouvement, le solde negatif signale, le
 * realise budgetaire, les annulations, l'isolation et la piece jointe.
 */

import { randomUUID } from 'crypto';
import * as os from 'os';
import * as path from 'path';
import { promises as fs } from 'fs';
import { matchesWhere } from '../helpers/fake-prisma';

const mockUploadsDir = path.join(os.tmpdir(), `s6-factures-${process.pid}`);

jest.mock('../../src/config/env', () => {
  const actual = jest.requireActual('../../src/config/env');
  return { ...actual, env: { ...actual.env, UPLOADS_DIR: mockUploadsDir } };
});

type Row = Record<string, any>;

/** Relations resolues par `select`/`include` : champ -> [modele, cle etrangere]. */
const RELATIONS: Record<string, Record<string, [string, string]>> = {
  syndicProviderInvoice: {
    provider: ['serviceProvider', 'providerId'],
    contract: ['maintenanceContract', 'contractId'],
    incident: ['syndicateIncident', 'incidentId'],
    budgetLine: ['budgetLineItem', 'budgetLineItemId'],
    fund: ['syndicateFund', 'fundId']
  },
  syndicProviderPayment: { fund: ['syndicateFund', 'fundId'] }
};

/** Valeurs `@default` du schema que Postgres poserait. */
const DEFAULTS: Record<string, Row> = {
  syndicProviderInvoice: { amountPaid: 0, vatAmount: 0, status: 'RECORDED', currency: 'XOF' },
  syndicProviderPayment: { cancelledAt: null },
  journalEntry: { voidedByEntryId: null, isLocked: false }
};

const MODELS = [
  'syndicate',
  'serviceProvider',
  'maintenanceContract',
  'syndicateIncident',
  'budgetLineItem',
  'syndicateFund',
  'syndicateContractLink',
  'chartOfAccount',
  'accountingJournal',
  'journalEntry',
  'journalEntryLine',
  'syndicProviderInvoice',
  'syndicProviderPayment',
  'syndicateFundMovement',
  'incidentCostImputation',
  'syndicateBudget'
];

function createDb() {
  const db: any = {};
  const project = (model: string, row: Row | null, args: any): any => {
    if (!row) return row;
    const relations = RELATIONS[model] ?? {};
    const resolve = (key: string, wanted: any) => {
      const [target, fk] = relations[key];
      const related = db[target].rows.find((candidate: Row) => candidate.id === row[fk]) ?? null;
      return wanted === true ? related : project(target, related, wanted);
    };
    if (args?.select) {
      const out: Row = {};
      for (const [key, wanted] of Object.entries(args.select)) {
        if (!wanted) continue;
        out[key] = relations[key] ? resolve(key, wanted) : row[key];
      }
      return out;
    }
    return { ...row };
  };
  const applyData = (row: Row, data: Row) => {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && 'increment' in value)
        row[key] = Number(row[key] ?? 0) + value.increment;
      else if (value && typeof value === 'object' && 'decrement' in value)
        row[key] = Number(row[key] ?? 0) - value.decrement;
      else if (value !== undefined) row[key] = value;
    }
  };
  for (const name of MODELS) {
    const model: any = { rows: [] as Row[] };
    const find = (args: any = {}) => model.rows.filter((row: Row) => matchesWhere(row, args.where));
    model.findMany = jest.fn(async (args: any = {}) => find(args).map((row: Row) => project(name, row, args)));
    model.findFirst = jest.fn(async (args: any = {}) => project(name, find(args)[0] ?? null, args));
    model.findUnique = model.findFirst;
    model.count = jest.fn(async (args: any = {}) => find(args).length);
    model.create = jest.fn(async (args: any) => {
      const row = { id: randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...DEFAULTS[name], ...args.data };
      model.rows.push(row);
      return project(name, row, args);
    });
    model.createMany = jest.fn(async (args: any) => {
      for (const data of args.data) model.rows.push({ id: randomUUID(), createdAt: new Date(), ...data });
      return { count: args.data.length };
    });
    model.update = jest.fn(async (args: any) => {
      const row = find(args)[0];
      if (!row) throw Object.assign(new Error(`${name}.update : aucune ligne`), { code: 'P2025' });
      applyData(row, args.data);
      return project(name, row, args);
    });
    model.updateMany = jest.fn(async (args: any) => {
      const rows = find(args);
      rows.forEach((row: Row) => applyData(row, args.data));
      return { count: rows.length };
    });
    db[name] = model;
  }
  db.$queryRaw = jest.fn(async () => []);
  // Transaction : les lignes sont restaurees si la fonction echoue.
  db.$transaction = jest.fn(async (fn: any) => {
    const snapshot = MODELS.map(name => db[name].rows.map((row: Row) => ({ ...row })));
    try {
      return await fn(db);
    } catch (error) {
      MODELS.forEach((name, index) => {
        db[name].rows = snapshot[index];
      });
      throw error;
    }
  });
  db.reset = () => MODELS.forEach(name => (db[name].rows = []));
  return db;
}

const mockDb = createDb();
jest.mock('../../src/utils/database', () => ({ prisma: mockDb }));

const mockLogAuditEvent = jest.fn();
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (...args: any[]) => mockLogAuditEvent(...args)
}));

import {
  attachProviderInvoiceFile,
  cancelProviderInvoice,
  cancelProviderPayment,
  computeInvoiceStatus,
  createProviderInvoice,
  getProviderInvoice,
  getProviderInvoiceFile,
  listFundMovements,
  listProviderBalances,
  listProviderInvoices,
  payProviderInvoice,
  removeProviderInvoiceAttachment,
  updateProviderInvoice
} from '../../src/lib/syndics/provider-invoices';
import { detectProviderInvoiceFileKind } from '../../src/lib/syndics/provider-invoice-files';
import { createProviderInvoiceSchema } from '../../src/lib/syndics/provider-invoice-schemas';

const TENANT = 'tenant-a';
const OTHER_TENANT = 'tenant-b';
const SYND = randomUUID();
const OTHER_SYND = randomUUID();
const FOREIGN_SYND = randomUUID();
const PROVIDER = randomUUID();
const FOREIGN_PROVIDER = randomUUID();
const CONTRACT = randomUUID();
const OTHER_CONTRACT = randomUUID();
const INCIDENT = randomUUID();
const BUDGET_LINE = randomUUID();
const FUND = randomUUID();
const OTHER_FUND = randomUUID();
const EUR_FUND = randomUUID();
const OTHER_BUDGET_LINE = randomUUID();
const OTHER_INCIDENT = randomUUID();
const OTHER_ACCOUNT = randomUUID();

const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(64, 1)]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);

function seed() {
  mockDb.reset();
  mockDb.syndicate.rows.push(
    { id: SYND, tenantId: TENANT, name: 'Residence A' },
    { id: OTHER_SYND, tenantId: TENANT, name: 'Residence B' },
    { id: FOREIGN_SYND, tenantId: OTHER_TENANT, name: 'Residence etrangere' }
  );
  mockDb.serviceProvider.rows.push(
    { id: PROVIDER, tenantId: TENANT, name: 'Ascenseurs Plus' },
    { id: FOREIGN_PROVIDER, tenantId: OTHER_TENANT, name: 'Prestataire etranger' }
  );
  mockDb.maintenanceContract.rows.push(
    { id: CONTRACT, syndicateId: SYND, providerId: PROVIDER, nature: 'Maintenance ascenseur' },
    { id: OTHER_CONTRACT, syndicateId: OTHER_SYND, providerId: PROVIDER, nature: 'Autre copropriete' }
  );
  mockDb.syndicateIncident.rows.push({ id: INCIDENT, syndicateId: SYND, description: 'Fuite', status: 'REPORTED' });
  mockDb.budgetLineItem.rows.push({
    id: BUDGET_LINE,
    budget: { syndicateId: SYND },
    category: 'Entretien',
    description: 'Ascenseur',
    amountActual: 0,
    accountId: null
  });
  mockDb.syndicateFund.rows.push(
    { id: FUND, syndicateId: SYND, name: 'Compte courant', balance: 100000, currency: 'XOF' },
    { id: OTHER_FUND, syndicateId: OTHER_SYND, name: 'Fonds B', balance: 100000, currency: 'XOF' },
    { id: EUR_FUND, syndicateId: SYND, name: 'Compte en euros', balance: 100000, currency: 'EUR' }
  );
  // Objets d'une AUTRE copropriete de la meme agence.
  mockDb.budgetLineItem.rows.push({
    id: OTHER_BUDGET_LINE,
    budget: { syndicateId: OTHER_SYND },
    category: 'Autre',
    description: 'Autre',
    amountActual: 0,
    accountId: null
  });
  mockDb.syndicateIncident.rows.push({ id: OTHER_INCIDENT, syndicateId: OTHER_SYND, description: 'Autre' });
  mockDb.chartOfAccount.rows.push({
    id: OTHER_ACCOUNT,
    tenantId: TENANT,
    syndicateId: OTHER_SYND,
    scope: 'SYNDICATE',
    accountNumber: '628',
    accountType: 'EXPENSE',
    isActive: true
  });
}

function invoiceInput(overrides: Record<string, unknown> = {}) {
  return createProviderInvoiceSchema.parse({
    providerId: PROVIDER,
    number: 'F-001',
    label: 'Maintenance trimestrielle',
    invoiceDate: '2026-09-01',
    amountHT: 50000,
    vatAmount: 9000,
    ...overrides
  });
}

function entryLines(entryId: string) {
  return mockDb.journalEntryLine.rows.filter((line: Row) => line.entryId === entryId);
}

function accountNumber(accountId: string) {
  return mockDb.chartOfAccount.rows.find((account: Row) => account.id === accountId)?.accountNumber;
}

function expectBalanced(entryId: string) {
  const lines = entryLines(entryId);
  const debit = lines.reduce((sum: number, line: Row) => sum + Number(line.debit), 0);
  const credit = lines.reduce((sum: number, line: Row) => sum + Number(line.credit), 0);
  expect(lines.length).toBeGreaterThanOrEqual(2);
  expect(debit).toBeCloseTo(credit, 2);
  return { debit, credit, lines };
}

beforeEach(() => seed());

afterAll(async () => {
  await fs.rm(mockUploadsDir, { recursive: true, force: true });
});

describe('enregistrement d une facture', () => {
  it('ecrit une charge equilibree 624 / 401 dans la comptabilite de la copropriete', async () => {
    const { invoice } = await createProviderInvoice(TENANT, SYND, invoiceInput({ fundId: FUND }), 'user-1');

    expect(invoice.amountTTC).toBe(59000);
    expect(invoice.amountDue).toBe(59000);
    expect(invoice.status).toBe('RECORDED');
    expect(invoice.provider).toEqual({ id: PROVIDER, name: 'Ascenseurs Plus' });

    const { debit, lines } = expectBalanced(invoice.journalEntryId!);
    expect(debit).toBe(59000);
    const debitLine = lines.find((line: Row) => Number(line.debit) > 0);
    const creditLine = lines.find((line: Row) => Number(line.credit) > 0);
    expect(accountNumber(debitLine.accountId)).toBe('624');
    expect(accountNumber(creditLine.accountId)).toBe('401');

    const entry = mockDb.journalEntry.rows.find((row: Row) => row.id === invoice.journalEntryId);
    expect(entry).toMatchObject({ tenantId: TENANT, sourceType: 'PROVIDER_INVOICE', sourceId: invoice.id });
    const journal = mockDb.accountingJournal.rows.find((row: Row) => row.id === entry.journalId);
    expect(journal).toMatchObject({ syndicateId: SYND, scope: 'SYNDICATE', code: 'ACH', fiscalYear: 2026 });
    // Portee copropriete : les comptes crees sont ceux de la copropriete.
    const created = mockDb.chartOfAccount.rows.filter((row: Row) => row.id !== OTHER_ACCOUNT);
    expect(created.every((row: Row) => row.syndicateId === SYND && row.scope === 'SYNDICATE')).toBe(true);
  });

  it('pose le plan comptable minimal une seule fois (idempotent)', async () => {
    await createProviderInvoice(TENANT, SYND, invoiceInput());
    await createProviderInvoice(TENANT, SYND, invoiceInput({ number: 'F-002', expenseKind: 'WORKS' }));
    const numbers = mockDb.chartOfAccount.rows
      .filter((row: Row) => row.syndicateId === SYND)
      .map((row: Row) => row.accountNumber)
      .sort();
    expect(numbers).toEqual(['401', '521', '624', '6241']);
    const works = mockDb.journalEntryLine.rows.filter((line: Row) => accountNumber(line.accountId) === '6241');
    expect(works).toHaveLength(1);
  });

  it('incremente le realise de la ligne budgetaire liee', async () => {
    await createProviderInvoice(TENANT, SYND, invoiceInput({ budgetLineItemId: BUDGET_LINE }));
    expect(mockDb.budgetLineItem.rows[0].amountActual).toBe(59000);
  });

  it('deduit la ligne budgetaire du lien contrat quand elle est unique', async () => {
    mockDb.syndicateContractLink.rows.push({
      id: randomUUID(),
      syndicateId: SYND,
      maintenanceContractId: CONTRACT,
      budgetLineItemId: BUDGET_LINE
    });
    const { invoice } = await createProviderInvoice(TENANT, SYND, invoiceInput({ contractId: CONTRACT }));
    expect(invoice.budgetLineItemId).toBe(BUDGET_LINE);
    expect(mockDb.budgetLineItem.rows[0].amountActual).toBe(59000);
  });

  it('refuse un TTC qui ne vaut pas HT + TVA (422)', async () => {
    await expect(createProviderInvoice(TENANT, SYND, invoiceInput({ amountTTC: 60000 }))).rejects.toMatchObject({
      status: 422
    });
  });

  it('refuse un numero deja pris pour ce prestataire (409), accepte apres annulation', async () => {
    const { invoice } = await createProviderInvoice(TENANT, SYND, invoiceInput());
    await expect(createProviderInvoice(TENANT, SYND, invoiceInput())).rejects.toMatchObject({ statusCode: 409 });
    await cancelProviderInvoice(TENANT, SYND, invoice.id, { reason: 'Erreur de saisie' });
    await expect(createProviderInvoice(TENANT, SYND, invoiceInput())).resolves.toBeDefined();
  });

  it("rattache l'ecriture a l'unique imputation SYNDICATE_BUDGET de l'incident", async () => {
    mockDb.incidentCostImputation.rows.push({
      id: 'imp-1',
      incidentId: INCIDENT,
      imputationType: 'SYNDICATE_BUDGET',
      journalEntryId: null
    });
    const { invoice, incidentImputation } = await createProviderInvoice(
      TENANT,
      SYND,
      invoiceInput({ incidentId: INCIDENT })
    );
    expect(incidentImputation).toEqual({ linked: true, imputationId: 'imp-1' });
    expect(mockDb.incidentCostImputation.rows[0].journalEntryId).toBe(invoice.journalEntryId);
  });

  it('signale une imputation ambigue sans rien rattacher', async () => {
    for (const id of ['imp-1', 'imp-2']) {
      mockDb.incidentCostImputation.rows.push({
        id,
        incidentId: INCIDENT,
        imputationType: 'SYNDICATE_BUDGET',
        journalEntryId: null
      });
    }
    const { incidentImputation } = await createProviderInvoice(TENANT, SYND, invoiceInput({ incidentId: INCIDENT }));
    expect(incidentImputation).toEqual({ linked: false, reason: 'AMBIGUOUS' });
    expect(mockDb.incidentCostImputation.rows.every((row: Row) => row.journalEntryId === null)).toBe(true);
  });
});

describe('paiements', () => {
  async function recorded(overrides: Record<string, unknown> = {}) {
    const { invoice } = await createProviderInvoice(TENANT, SYND, invoiceInput({ fundId: FUND, ...overrides }));
    return invoice;
  }

  it('debite le fonds, trace le mouvement et ecrit 401 / 521 (paiement partiel puis total)', async () => {
    const invoice = await recorded();
    const first = await payProviderInvoice(TENANT, SYND, invoice.id, {
      amount: 20000,
      paidAt: new Date('2026-09-10'),
      method: 'BANK_TRANSFER'
    });

    expect(first.invoice.status).toBe('PARTIALLY_PAID');
    expect(first.invoice.amountDue).toBe(39000);
    expect(first.fund).toMatchObject({ id: FUND, balance: 80000 });
    expect(first.fundBalanceNegative).toBe(false);
    expect(mockDb.syndicateFund.rows.find((row: Row) => row.id === FUND).balance).toBe(80000);

    const movement = mockDb.syndicateFundMovement.rows[0];
    expect(movement).toMatchObject({
      tenantId: TENANT,
      fundId: FUND,
      direction: 'DEBIT',
      amount: 20000,
      balanceAfter: 80000,
      sourceType: 'PROVIDER_PAYMENT',
      sourceId: first.payment!.id
    });

    const { lines } = expectBalanced(first.payment!.journalEntryId!);
    expect(accountNumber(lines.find((line: Row) => Number(line.debit) > 0).accountId)).toBe('401');
    expect(accountNumber(lines.find((line: Row) => Number(line.credit) > 0).accountId)).toBe('521');

    const second = await payProviderInvoice(TENANT, SYND, invoice.id, {
      amount: 39000,
      paidAt: new Date('2026-09-20'),
      method: 'CHECK'
    });
    expect(second.invoice.status).toBe('PAID');
    expect(second.invoice.amountDue).toBe(0);
  });

  it('accepte un solde de fonds negatif mais le signale', async () => {
    const invoice = await recorded({ amountHT: 150000, vatAmount: 0 });
    const result = await payProviderInvoice(TENANT, SYND, invoice.id, {
      amount: 150000,
      paidAt: new Date('2026-09-10'),
      method: 'CASH'
    });
    expect(result.fund.balance).toBe(-50000);
    expect(result.fundBalanceNegative).toBe(true);
  });

  it('refuse un paiement superieur au reste du (422) sans rien ecrire', async () => {
    const invoice = await recorded();
    const entriesBefore = mockDb.journalEntry.rows.length;
    await expect(
      payProviderInvoice(TENANT, SYND, invoice.id, { amount: 59001, paidAt: new Date(), method: 'CASH' })
    ).rejects.toMatchObject({ status: 422 });
    expect(mockDb.syndicateFund.rows.find((row: Row) => row.id === FUND).balance).toBe(100000);
    expect(mockDb.syndicateFundMovement.rows).toHaveLength(0);
    expect(mockDb.syndicProviderPayment.rows).toHaveLength(0);
    expect(mockDb.journalEntry.rows).toHaveLength(entriesBefore);
  });

  it('exige un fonds quand la facture n en porte pas (422)', async () => {
    const { invoice } = await createProviderInvoice(TENANT, SYND, invoiceInput());
    await expect(
      payProviderInvoice(TENANT, SYND, invoice.id, { amount: 1000, paidAt: new Date(), method: 'CASH' })
    ).rejects.toMatchObject({ status: 422 });
  });

  it('annulation : refusee avec paiement, puis paiement annule, puis facture annulee', async () => {
    const invoice = await recorded({ budgetLineItemId: BUDGET_LINE });
    expect(mockDb.budgetLineItem.rows[0].amountActual).toBe(59000);
    const paid = await payProviderInvoice(TENANT, SYND, invoice.id, {
      amount: 20000,
      paidAt: new Date('2026-09-10'),
      method: 'BANK_TRANSFER'
    });

    await expect(cancelProviderInvoice(TENANT, SYND, invoice.id, { reason: 'Doublon' })).rejects.toMatchObject({
      statusCode: 409
    });

    const cancelledPayment = await cancelProviderPayment(TENANT, SYND, invoice.id, paid.payment!.id, {
      reason: 'Virement rejete'
    });
    expect(cancelledPayment.invoice.status).toBe('RECORDED');
    expect(cancelledPayment.invoice.amountPaid).toBe(0);
    expect(cancelledPayment.payment!.cancelledAt).toBeInstanceOf(Date);
    expect(cancelledPayment.fund).toMatchObject({ balance: 100000 });
    const reversal = mockDb.syndicateFundMovement.rows[1];
    expect(reversal).toMatchObject({ direction: 'CREDIT', amount: 20000, sourceType: 'PROVIDER_PAYMENT_REVERSAL' });
    expectBalanced(cancelledPayment.payment!.cancelEntryId!);
    expect(mockDb.journalEntry.rows.find((row: Row) => row.id === paid.payment!.journalEntryId).voidedByEntryId).toBe(
      cancelledPayment.payment!.cancelEntryId
    );

    await expect(
      cancelProviderPayment(TENANT, SYND, invoice.id, paid.payment!.id, { reason: 'Encore' })
    ).rejects.toMatchObject({ statusCode: 409 });

    const cancelled = await cancelProviderInvoice(TENANT, SYND, invoice.id, { reason: 'Doublon' });
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancelReason).toBe('Doublon');
    expect(cancelled.amountDue).toBe(0);
    expect(mockDb.budgetLineItem.rows[0].amountActual).toBe(0);
    const { lines } = expectBalanced(cancelled.cancelEntryId!);
    // Contre-passation : 401 au debit, charge au credit.
    expect(accountNumber(lines.find((line: Row) => Number(line.debit) > 0).accountId)).toBe('401');

    await expect(
      payProviderInvoice(TENANT, SYND, invoice.id, { amount: 1, paidAt: new Date(), method: 'CASH' })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('historique des mouvements du fonds et soldes dus par prestataire', async () => {
    const invoice = await recorded({ dueDate: '2026-09-05' });
    await payProviderInvoice(TENANT, SYND, invoice.id, {
      amount: 9000,
      paidAt: new Date('2026-09-10'),
      method: 'CASH'
    });

    const movements = await listFundMovements(TENANT, SYND, FUND, { page: 1, limit: 50 });
    expect(movements.fund.balance).toBe(91000);
    expect(movements.total).toBe(1);
    expect(movements.items[0]).toMatchObject({ direction: 'DEBIT', amount: 9000, balanceAfter: 91000 });

    const balances = await listProviderBalances(TENANT, SYND, new Date('2026-10-01'));
    expect(balances).toEqual([
      {
        providerId: PROVIDER,
        providerName: 'Ascenseurs Plus',
        currency: 'XOF',
        invoicesCount: 1,
        totalInvoiced: 59000,
        totalPaid: 9000,
        totalDue: 50000,
        overdueDue: 50000
      }
    ]);

    const detail = await getProviderInvoice(TENANT, SYND, invoice.id);
    expect(detail.payments).toHaveLength(1);
    const list = await listProviderInvoices(TENANT, SYND, { status: 'PARTIALLY_PAID', page: 1, limit: 20 } as any);
    expect(list.total).toBe(1);
  });
});

describe('isolation', () => {
  it("prestataire d'une autre agence : 404", async () => {
    await expect(
      createProviderInvoice(TENANT, SYND, invoiceInput({ providerId: FOREIGN_PROVIDER }))
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("contrat d'une autre copropriete : 404", async () => {
    await expect(
      createProviderInvoice(TENANT, SYND, invoiceInput({ contractId: OTHER_CONTRACT }))
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("fonds d'une autre copropriete : 404 a l'enregistrement et au paiement", async () => {
    await expect(createProviderInvoice(TENANT, SYND, invoiceInput({ fundId: OTHER_FUND }))).rejects.toMatchObject({
      statusCode: 404
    });
    const { invoice } = await createProviderInvoice(TENANT, SYND, invoiceInput());
    await expect(
      payProviderInvoice(TENANT, SYND, invoice.id, {
        amount: 1000,
        paidAt: new Date(),
        method: 'CASH',
        fundId: OTHER_FUND
      })
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(mockDb.syndicateFund.rows.find((row: Row) => row.id === OTHER_FUND).balance).toBe(100000);
  });

  it("copropriete d'une autre agence, ou facture lue depuis une autre agence : 404", async () => {
    await expect(createProviderInvoice(TENANT, FOREIGN_SYND, invoiceInput())).rejects.toMatchObject({
      statusCode: 404
    });
    const { invoice } = await createProviderInvoice(TENANT, SYND, invoiceInput());
    await expect(getProviderInvoice(OTHER_TENANT, SYND, invoice.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(getProviderInvoice(TENANT, OTHER_SYND, invoice.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(listFundMovements(OTHER_TENANT, SYND, FUND, { page: 1, limit: 10 })).rejects.toMatchObject({
      statusCode: 404
    });
  });
});

describe('piece jointe', () => {
  it('reconnait PDF, PNG et JPEG par leurs octets, et rien d autre', () => {
    expect(detectProviderInvoiceFileKind(PDF)).toBe('pdf');
    expect(detectProviderInvoiceFileKind(PNG)).toBe('png');
    expect(detectProviderInvoiceFileKind(JPEG)).toBe('jpg');
    expect(detectProviderInvoiceFileKind(Buffer.from('GIF89a'))).toBeNull();
    expect(detectProviderInvoiceFileKind(Buffer.from('<html>%PDF-'))).toBeNull();
  });

  it('refuse un type non accepte ou un fichier trop lourd AVANT toute ecriture (400)', async () => {
    await expect(
      createProviderInvoice(TENANT, SYND, invoiceInput(), 'user-1', {
        buffer: Buffer.from('<script>alert(1)</script>'),
        originalname: 'facture.pdf'
      })
    ).rejects.toMatchObject({ statusCode: 400 });
    const big = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(10 * 1024 * 1024)]);
    await expect(
      createProviderInvoice(TENANT, SYND, invoiceInput(), 'user-1', { buffer: big, originalname: 'gros.pdf' })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockDb.syndicProviderInvoice.rows).toHaveLength(0);
    expect(mockDb.journalEntry.rows).toHaveLength(0);
  });

  it('stocke la piece en prive, ne renvoie aucun chemin, et ne la sert qu a l agence', async () => {
    const { invoice } = await createProviderInvoice(TENANT, SYND, invoiceInput(), 'user-1', {
      buffer: PDF,
      originalname: 'Facture F-001.pdf'
    });
    expect(invoice.hasFile).toBe(true);
    expect(invoice.fileName).toBe('Facture F-001.pdf');
    expect(JSON.stringify(invoice)).not.toContain('/uploads/');
    expect(invoice).not.toHaveProperty('filePath');

    const stored = mockDb.syndicProviderInvoice.rows[0].filePath as string;
    expect(stored).toMatch(new RegExp(`^/uploads/syndics/${SYND}/factures-prestataires/[0-9a-f-]{36}\\.pdf$`));

    const file = await getProviderInvoiceFile(TENANT, SYND, invoice.id);
    expect(file.mimeType).toBe('application/pdf');
    expect(file.buffer.equals(PDF)).toBe(true);

    await expect(getProviderInvoiceFile(OTHER_TENANT, SYND, invoice.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(getProviderInvoiceFile(TENANT, OTHER_SYND, invoice.id)).rejects.toMatchObject({ statusCode: 404 });

    const replaced = await attachProviderInvoiceFile(TENANT, SYND, invoice.id, {
      buffer: PNG,
      originalname: 'scan.png'
    });
    expect(replaced.fileName).toBe('scan.png');
    expect((await getProviderInvoiceFile(TENANT, SYND, invoice.id)).mimeType).toBe('image/png');
  });
});

describe('isolation des references', () => {
  it("compte de charge, ligne budgetaire et incident d'une autre copropriete : 404", async () => {
    for (const overrides of [
      { expenseAccountId: OTHER_ACCOUNT },
      { budgetLineItemId: OTHER_BUDGET_LINE },
      { incidentId: OTHER_INCIDENT }
    ]) {
      await expect(createProviderInvoice(TENANT, SYND, invoiceInput(overrides))).rejects.toMatchObject({
        statusCode: 404
      });
    }
    expect(mockDb.syndicProviderInvoice.rows).toHaveLength(0);
    expect(mockDb.budgetLineItem.rows.find((row: Row) => row.id === OTHER_BUDGET_LINE).amountActual).toBe(0);
  });

  it("compte de charge d'une autre agence ou hors portee SYNDICATE : 404", async () => {
    const foreign = randomUUID();
    const operations = randomUUID();
    mockDb.chartOfAccount.rows.push(
      {
        id: foreign,
        tenantId: OTHER_TENANT,
        syndicateId: SYND,
        scope: 'SYNDICATE',
        accountType: 'EXPENSE',
        isActive: true
      },
      {
        id: operations,
        tenantId: TENANT,
        syndicateId: SYND,
        scope: 'OPERATIONS',
        accountType: 'EXPENSE',
        isActive: true
      }
    );
    for (const expenseAccountId of [foreign, operations]) {
      await expect(createProviderInvoice(TENANT, SYND, invoiceInput({ expenseAccountId }))).rejects.toMatchObject({
        statusCode: 404
      });
    }
  });

  it("paiement d'une autre facture : 404 a l'annulation", async () => {
    const first = (await createProviderInvoice(TENANT, SYND, invoiceInput({ fundId: FUND }))).invoice;
    const second = (await createProviderInvoice(TENANT, SYND, invoiceInput({ number: 'F-002', fundId: FUND }))).invoice;
    const paid = await payProviderInvoice(TENANT, SYND, first.id, {
      amount: 1000,
      paidAt: new Date('2026-09-10'),
      method: 'CASH'
    });
    await expect(
      cancelProviderPayment(TENANT, SYND, second.id, paid.payment!.id, { reason: 'Mauvaise facture' })
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(mockDb.syndicProviderPayment.rows[0].cancelledAt).toBeNull();
  });
});

describe('garde-fous de saisie', () => {
  it('refuse un montant qui s arrondit a zero (422)', async () => {
    await expect(
      createProviderInvoice(TENANT, SYND, invoiceInput({ amountHT: 0.004, vatAmount: 0 }))
    ).rejects.toMatchObject({ status: 422 });
    const { invoice } = await createProviderInvoice(TENANT, SYND, invoiceInput({ fundId: FUND }));
    await expect(
      payProviderInvoice(TENANT, SYND, invoice.id, { amount: 0.001, paidAt: new Date('2026-09-10'), method: 'CASH' })
    ).rejects.toMatchObject({ status: 422 });
  });

  it('refuse un montant au-dela de Decimal(14,2), une devise inconnue, une date a plus d un an', () => {
    expect(() => invoiceInput({ amountHT: 1e13 })).toThrow();
    expect(() => invoiceInput({ currency: 'BTC' })).toThrow();
    const farFuture = new Date();
    farFuture.setUTCFullYear(farFuture.getUTCFullYear() + 2);
    expect(() => invoiceInput({ invoiceDate: farFuture.toISOString() })).toThrow();
    expect(invoiceInput().currency).toBe('XOF');
  });

  it('refuse un fonds dont la devise differe de celle de la facture (422)', async () => {
    await expect(createProviderInvoice(TENANT, SYND, invoiceInput({ fundId: EUR_FUND }))).rejects.toMatchObject({
      status: 422
    });
    const { invoice } = await createProviderInvoice(TENANT, SYND, invoiceInput());
    await expect(
      payProviderInvoice(TENANT, SYND, invoice.id, {
        amount: 1000,
        paidAt: new Date('2026-09-10'),
        method: 'CASH',
        fundId: EUR_FUND
      })
    ).rejects.toMatchObject({ status: 422 });
    expect(mockDb.syndicateFund.rows.find((row: Row) => row.id === EUR_FUND).balance).toBe(100000);
  });

  it('refuse un paiement anterieur a la facture (422)', async () => {
    const { invoice } = await createProviderInvoice(TENANT, SYND, invoiceInput({ fundId: FUND }));
    await expect(
      payProviderInvoice(TENANT, SYND, invoice.id, { amount: 1000, paidAt: new Date('2026-08-31'), method: 'CASH' })
    ).rejects.toMatchObject({ status: 422 });
  });

  it('refuse une ecriture dans un exercice clos (409)', async () => {
    mockDb.syndicateBudget.rows.push({ id: randomUUID(), syndicateId: SYND, fiscalYear: 2025, status: 'CLOSED' });
    await expect(
      createProviderInvoice(TENANT, SYND, invoiceInput({ invoiceDate: '2025-06-01' }))
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(mockDb.syndicProviderInvoice.rows).toHaveLength(0);
    await expect(createProviderInvoice(TENANT, SYND, invoiceInput())).resolves.toBeDefined();
  });

  it('pose les ecritures verrouillees', async () => {
    const { invoice } = await createProviderInvoice(TENANT, SYND, invoiceInput({ fundId: FUND }));
    await payProviderInvoice(TENANT, SYND, invoice.id, {
      amount: 1000,
      paidAt: new Date('2026-09-10'),
      method: 'CASH'
    });
    expect(mockDb.journalEntry.rows.length).toBe(2);
    expect(mockDb.journalEntry.rows.every((row: Row) => row.isLocked === true)).toBe(true);
  });

  it('PATCH : refuse la modification d une facture payee, relue sous verrou (409)', async () => {
    const { invoice } = await createProviderInvoice(TENANT, SYND, invoiceInput({ fundId: FUND }));
    await payProviderInvoice(TENANT, SYND, invoice.id, {
      amount: 1000,
      paidAt: new Date('2026-09-10'),
      method: 'CASH'
    });
    await expect(updateProviderInvoice(TENANT, SYND, invoice.id, { label: 'Nouveau' })).rejects.toMatchObject({
      statusCode: 409
    });
    expect(mockDb.$queryRaw).toHaveBeenCalled();
  });
});

describe('piece jointe : orphelins et journal', () => {
  async function storedFiles() {
    const dir = path.join(mockUploadsDir, 'syndics', SYND, 'factures-prestataires');
    return fs.readdir(dir).catch(() => [] as string[]);
  }

  it("retire le fichier ecrit si l'enregistrement echoue", async () => {
    mockDb.syndicateBudget.rows.push({ id: randomUUID(), syndicateId: SYND, fiscalYear: 2026, status: 'CLOSED' });
    const before = (await storedFiles()).length;
    await expect(
      createProviderInvoice(TENANT, SYND, invoiceInput(), 'user-1', { buffer: PDF, originalname: 'f.pdf' })
    ).rejects.toMatchObject({ statusCode: 409 });
    expect((await storedFiles()).length).toBe(before);
  });

  it('remplacement : ancien fichier retire, evenement journalise ; suppression refusee si reglee', async () => {
    const { invoice } = await createProviderInvoice(TENANT, SYND, invoiceInput({ fundId: FUND }), 'user-1', {
      buffer: PDF,
      originalname: 'f.pdf'
    });
    const before = (await storedFiles()).length;
    await attachProviderInvoiceFile(TENANT, SYND, invoice.id, { buffer: PNG, originalname: 'scan.png' }, 'user-2');
    expect((await storedFiles()).length).toBe(before);
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKey: 'SYNDIC_PROVIDER_INVOICE_FILE_REPLACED',
        actorUserId: 'user-2',
        tenantId: TENANT,
        entityId: invoice.id
      })
    );

    await payProviderInvoice(TENANT, SYND, invoice.id, {
      amount: 1000,
      paidAt: new Date('2026-09-10'),
      method: 'CASH'
    });
    await expect(removeProviderInvoiceAttachment(TENANT, SYND, invoice.id, 'user-2')).rejects.toMatchObject({
      statusCode: 409
    });
    expect(mockDb.syndicProviderInvoice.rows[0].filePath).toBeTruthy();
  });

  it('suppression d une piece de facture non reglee : fichier retire et journalise', async () => {
    const { invoice } = await createProviderInvoice(TENANT, SYND, invoiceInput(), 'user-1', {
      buffer: PDF,
      originalname: 'f.pdf'
    });
    const before = (await storedFiles()).length;
    const updated = await removeProviderInvoiceAttachment(TENANT, SYND, invoice.id, 'user-1');
    expect(updated.hasFile).toBe(false);
    expect((await storedFiles()).length).toBe(before - 1);
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: 'SYNDIC_PROVIDER_INVOICE_FILE_REMOVED', entityId: invoice.id })
    );
  });
});

describe('calculs', () => {
  it('statut d apres le montant paye', () => {
    expect(computeInvoiceStatus(100, 0)).toBe('RECORDED');
    expect(computeInvoiceStatus(100, 40)).toBe('PARTIALLY_PAID');
    expect(computeInvoiceStatus(100, 100)).toBe('PAID');
  });
});
