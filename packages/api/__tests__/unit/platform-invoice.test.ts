/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Factures PLATFORM des abonnements (vague 3, lot A) —
 * services/platform-invoice-service.ts, lib/subscription/platform-invoice*.ts.
 *
 * Numerotation continue IMT-AAAA-NNNNN (y compris en concurrence), idempotence,
 * prorata en attente repris, depassement mensuel separe en annuel, premiere
 * facture avec mise en route, avoir, TVA 18 %, PDF avec montants >= 1 000 et
 * accents. Faux client Prisma en memoire, aucune base, aucun e-mail reel.
 */

import { PDFDocument } from 'pdf-lib';
import {
  assembleInvoice,
  creditNoteLines,
  formatPlatformInvoiceNumber,
  parsePlatformInvoiceNumber,
  withoutPendingLines
} from '../../src/lib/subscription/platform-invoice';
import { buildPlatformInvoicePdf, formatFcfa } from '../../src/lib/subscription/platform-invoice-pdf';
import { finalizeInvoice } from '../../src/lib/subscription';

type Row = Record<string, any>;

// ------------------------------------------------------------------ faux Prisma

const mockDb: {
  invoices: Row[];
  lines: Row[];
  subscriptions: Row[];
  items: Row[];
  sequence: Map<number, number>;
  lockChain: Promise<void>;
} = { invoices: [], lines: [], subscriptions: [], items: [], sequence: new Map(), lockChain: Promise.resolve() };

let mockId = 0;
const newId = (p: string) => `${p}-${++mockId}`;

function mockMatches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (cond === undefined) return true;
    const value = row[key];
    if (key === 'metadata' && cond && cond.path) return (value ?? {})[cond.path[0]] === cond.equals;
    if (key === 'catalogItem') return false;
    if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
    if (cond !== null && typeof cond === 'object') {
      if ('in' in cond) return cond.in.includes(value);
      if ('not' in cond) return value !== cond.not;
      if ('lt' in cond) return value !== null && value !== undefined && value.getTime() < cond.lt.getTime();
      if ('gte' in cond) return value.getTime() >= cond.gte.getTime() && (!cond.lt || value.getTime() < cond.lt.getTime());
      if ('equals' in cond) return value === cond.equals;
      return true;
    }
    return value === cond;
  });
}

function withRelations(invoice: Row | undefined) {
  if (!invoice) return null;
  const credited = invoice.creditedInvoiceId ? mockDb.invoices.find(i => i.id === invoice.creditedInvoiceId) : null;
  return {
    ...invoice,
    lines: mockDb.lines.filter(l => l.invoiceId === invoice.id).sort((a, b) => a.sortOrder - b.sortOrder),
    creditedInvoice: credited ? { id: credited.id, invoiceNumber: credited.invoiceNumber } : null
  };
}

/** Upsert du compteur : un verrou (chaine de promesses) imite le verrou de ligne de PostgreSQL. */
async function mockSequenceNext(year: number): Promise<number> {
  let release!: () => void;
  const previous = mockDb.lockChain;
  mockDb.lockChain = new Promise<void>(resolve => {
    release = resolve;
  });
  await previous;
  try {
    const current = mockDb.sequence.get(year) ?? 0;
    await new Promise(resolve => setImmediate(resolve)); // laisse les autres « transactions » s'intercaler
    mockDb.sequence.set(year, current + 1);
    return current + 1;
  } finally {
    release();
  }
}

const mockFake: Row = {
  $transaction: jest.fn(async (fn: (tx: Row) => Promise<unknown>) => fn(mockFake)),
  $executeRaw: jest.fn(async () => 1),
  $queryRaw: jest.fn(async (_strings: TemplateStringsArray, year: number) => [{ last_number: await mockSequenceNext(year) }]),
  subscription: {
    findUnique: jest.fn(async ({ where }: Row) =>
      mockDb.subscriptions.find(s => (where.id ? s.id === where.id : s.tenantId === where.tenantId)) ?? null
    ),
    update: jest.fn(async ({ where, data }: Row) => Object.assign(mockDb.subscriptions.find(s => s.id === where.id)!, data))
  },
  subscriptionItem: {
    findMany: jest.fn(async () => []),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const rows = mockDb.items.filter(i => mockMatches(i, where));
      rows.forEach(r => Object.assign(r, data));
      return { count: rows.length };
    })
  },
  tenant: {
    findUnique: jest.fn(async () => ({
      name: 'Ivoire Résidences',
      legalName: "Société Ivoire Résidences SARL",
      address: 'Rue des Jardins, Cocody',
      city: 'Abidjan',
      country: "Côte d'Ivoire",
      contactEmail: 'contact@ivoire.test',
      contactPhone: '+225 01 02 03 04'
    }))
  },
  agencyFinanceSettings: { findFirst: jest.fn(async () => ({ taxpayerNumber: 'CC-1234567' })) },
  role: { findUnique: jest.fn(async () => null) },
  userRole: { findMany: jest.fn(async () => []) },
  user: { findMany: jest.fn(async () => []) },
  invoice: {
    findFirst: jest.fn(async ({ where }: Row) => {
      const rows = mockDb.invoices.filter(i => mockMatches(i, where));
      return withRelations(rows[rows.length - 1]);
    }),
    findMany: jest.fn(async ({ where }: Row) => mockDb.invoices.filter(i => mockMatches(i, where)).map(withRelations)),
    count: jest.fn(async ({ where }: Row) => mockDb.invoices.filter(i => mockMatches(i, where)).length),
    create: jest.fn(async ({ data }: Row) => {
      const row = { id: newId('inv'), createdAt: new Date(), sentAt: null, paidAt: null, creditedInvoiceId: null, ...data };
      mockDb.invoices.push(row);
      return row;
    }),
    update: jest.fn(async ({ where, data }: Row) => Object.assign(mockDb.invoices.find(i => i.id === where.id)!, data)),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const rows = mockDb.invoices.filter(i => mockMatches(i, where));
      rows.forEach(r => Object.assign(r, data));
      return { count: rows.length };
    })
  },
  invoiceLine: {
    findMany: jest.fn(async ({ where }: Row) => mockDb.lines.filter(l => mockMatches(l, where))),
    create: jest.fn(async ({ data }: Row) => {
      const row = { id: newId('line'), createdAt: new Date(), ...data };
      mockDb.lines.push(row);
      return row;
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const rows = mockDb.lines.filter(l => mockMatches(l, where));
      rows.forEach(r => Object.assign(r, data));
      return { count: rows.length };
    }),
    deleteMany: jest.fn(async ({ where }: Row) => {
      const before = mockDb.lines.length;
      mockDb.lines = mockDb.lines.filter(l => !mockMatches(l, where));
      return { count: before - mockDb.lines.length };
    })
  }
};

jest.mock('../../src/utils/database', () => ({
  get prisma() {
    return mockFake;
  }
}));
jest.mock('../../src/services/email-service', () => ({ emailService: { sendEmail: jest.fn(async () => undefined) } }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), recordAuditEvent: jest.fn() }));

const mockPreview = jest.fn();
const mockCatalog = new Map<string, Row>([
  ['SETUP_AGENCE', { id: 'cat-setup-agence', code: 'SETUP_AGENCE', name: 'Mise en route — Pack Agence', setupPrice: 100000 }],
  ['SETUP_SYNDIC', { id: 'cat-setup-syndic', code: 'SETUP_SYNDIC', name: 'Mise en route — Pack Syndic', setupPrice: 150000 }]
]);
jest.mock('../../src/services/subscription-v2-service', () => ({
  previewNextInvoice: (...args: unknown[]) => mockPreview(...args),
  loadCatalogByCodes: jest.fn(async (_db: unknown, codes: string[]) => new Map([...mockCatalog].filter(([c]) => codes.includes(c))))
}));

import { logAuditEvent, recordAuditEvent } from '../../src/services/audit-service';
import {
  dueOverageWindows,
  generateInvoiceForPeriod,
  issueCreditNote,
  listPlatformInvoices,
  markOverdueInvoices,
  nextPlatformInvoiceNumberTx,
  renderPlatformInvoicePdf,
  runPlatformBillingStep
} from '../../src/services/platform-invoice-service';

// ------------------------------------------------------------------ jeux de donnees

const TENANT = 'tenant-ivoire';
const DAY = 24 * 60 * 60 * 1000;
const START = new Date('2026-09-01T00:00:00.000Z');
const END = new Date('2026-10-01T00:00:00.000Z');
const NEXT_END = new Date('2026-11-01T00:00:00.000Z');

function subscription(over: Row = {}): Row {
  return {
    id: 'sub-1',
    tenantId: TENANT,
    status: 'ACTIVE',
    billingCycle: 'MONTHLY',
    currentPeriodStart: START,
    currentPeriodEnd: END,
    trialEndsAt: null,
    graceDays: 7,
    quotaPolicy: 'BILL_OVERAGE',
    metadata: null,
    ...over
  };
}

/** Apercu mensuel Agence (29 900) + Syndic (49 900) - remise 2 990, a partir de END. */
function periodPreview(options: { pending?: Row[]; overage?: number } = {}): Row {
  const recurring = [
    { kind: 'PACK', label: 'Pack Agence', code: 'AGENCE', subscriptionItemId: 'item-agence', quantity: 1, unitPrice: 29900, amount: 29900, periodStart: END, periodEnd: NEXT_END },
    { kind: 'PACK', label: 'Pack Syndic', code: 'SYNDIC', subscriptionItemId: 'item-syndic', quantity: 1, unitPrice: 49900, amount: 49900, periodStart: END, periodEnd: NEXT_END },
    { kind: 'DISCOUNT', label: 'Remise de combinaison (10 % sur Pack Agence)', code: 'AGENCE', quantity: 1, unitPrice: -2990, amount: -2990, periodStart: END, periodEnd: NEXT_END }
  ];
  const pending = (options.pending ?? []).map(p => ({
    kind: p.kind,
    label: p.label,
    subscriptionItemId: p.subscriptionItemId ?? undefined,
    quantity: 1,
    unitPrice: p.amount,
    amount: p.amount
  }));
  const overage = options.overage
    ? [{ kind: 'OVERAGE', label: `Dépassement : ${options.overage} lot(s) au-delà de la réserve`, capacityKey: 'LOTS', quantity: options.overage, unitPrice: 150, amount: options.overage * 150 }]
    : [];
  const totals = finalizeInvoice([...recurring, ...pending, ...overage] as any);
  return {
    tenantId: TENANT,
    billingCycle: 'MONTHLY',
    periodStart: END,
    periodEnd: NEXT_END,
    pendingLineIds: (options.pending ?? []).map(p => p.id),
    overageBilling: 'IN_PERIOD_INVOICE',
    overageInvoice: null,
    ...totals
  };
}

function reset() {
  mockDb.invoices = [];
  mockDb.lines = [];
  mockDb.subscriptions = [subscription()];
  mockDb.items = [
    { id: 'item-agence', tenantId: TENANT, billedThrough: null },
    { id: 'item-syndic', tenantId: TENANT, billedThrough: null }
  ];
  mockDb.sequence = new Map();
  mockPreview.mockReset();
  jest.clearAllMocks();
}

beforeEach(reset);

// ------------------------------------------------------------------ pur

describe('numerotation IMT-AAAA-NNNNN', () => {
  it('formate et relit le numero', () => {
    expect(formatPlatformInvoiceNumber(2026, 1)).toBe('IMT-2026-00001');
    expect(formatPlatformInvoiceNumber(2026, 123456)).toBe('IMT-2026-123456');
    expect(parsePlatformInvoiceNumber('IMT-2026-00042')).toEqual({ year: 2026, sequence: 42 });
    expect(parsePlatformInvoiceNumber('BROUILLON-abc')).toBeNull();
    expect(() => formatPlatformInvoiceNumber(2026, 0)).toThrow();
  });

  it('continue et sans doublon sous 40 emissions concurrentes, recommence a 1 chaque annee', async () => {
    const at = new Date('2026-12-31T12:00:00Z');
    const numbers = await Promise.all(Array.from({ length: 40 }, () => nextPlatformInvoiceNumberTx(mockFake as any, at)));
    const sequences = numbers.map(n => parsePlatformInvoiceNumber(n)!.sequence).sort((a, b) => a - b);
    expect(new Set(numbers).size).toBe(40);
    expect(sequences).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    expect(await nextPlatformInvoiceNumberTx(mockFake as any, new Date('2027-01-01T00:00:00Z'))).toBe('IMT-2027-00001');
    expect(await nextPlatformInvoiceNumberTx(mockFake as any, at)).toBe('IMT-2026-00041');
  });
});

describe('assemblage et TVA 18 %', () => {
  it('ajoute une ligne TVA separee de 18 % du HT', () => {
    const result = assembleInvoice([
      { kind: 'PACK', label: 'Pack Agence', quantity: 1, unitPrice: 29900, amount: 29900 },
      { kind: 'SETUP', label: 'Mise en route', quantity: 1, unitPrice: 100000, amount: 100000 }
    ]);
    expect(result.amountExclTax).toBe(129900);
    expect(result.taxRate).toBe(18);
    expect(result.taxAmount).toBe(23382);
    expect(result.amountTotal).toBe(153282);
    expect(result.lines.filter(l => l.kind === 'TAX')).toEqual([expect.objectContaining({ amount: 23382, label: 'TVA 18 %' })]);
    expect(result.lines.map(l => l.kind)).toEqual(['PACK', 'SETUP', 'TAX']);
  });

  it('ramene a zero une facture dont les avoirs depassent le du, et reporte le reste', () => {
    const result = assembleInvoice([
      { kind: 'PACK', label: 'Pack Agence', quantity: 1, unitPrice: 29900, amount: 29900 },
      { kind: 'CREDIT', label: 'Avoir de montee en gamme', quantity: 1, unitPrice: -40000, amount: -40000 }
    ]);
    expect(result.amountTotal).toBe(0);
    expect(result.taxAmount).toBe(0);
    expect(result.carryForward).toBe(-10100);
  });

  it("l'avoir est l'exact oppose de la facture, TVA comprise", () => {
    const invoice = assembleInvoice([{ kind: 'PACK', label: 'Pack Syndic', quantity: 1, unitPrice: 49900, amount: 49900 }]);
    const credit = creditNoteLines(invoice.lines);
    expect(credit.amountExclTax).toBe(-49900);
    expect(credit.taxAmount).toBe(-8982);
    expect(credit.amountTotal).toBe(-invoice.amountTotal);
  });

  it('retire de l apercu les lignes en attente, une par une', () => {
    const lines: any[] = [
      { kind: 'PACK', label: 'A', amount: 10, quantity: 1, unitPrice: 10 },
      { kind: 'PRORATA', label: 'P', amount: 5, quantity: 1, unitPrice: 5 },
      { kind: 'PRORATA', label: 'P', amount: 5, quantity: 1, unitPrice: 5 }
    ];
    expect(withoutPendingLines(lines, [{ kind: 'PRORATA', label: 'P', amount: 5 }])).toHaveLength(2);
  });
});

// ------------------------------------------------------------------ service

describe('generation des factures de periode', () => {
  it('premiere facture : packs, remise, mise en route des packs, TVA, numero et statut ISSUED', async () => {
    mockPreview.mockResolvedValue(periodPreview());
    const result = await generateInvoiceForPeriod(TENANT, { at: END });
    expect(result?.created).toBe(true);
    const invoice = mockDb.invoices[0];
    expect(invoice.invoiceNumber).toBe(`IMT-${new Date().getUTCFullYear()}-00001`);
    expect(invoice.status).toBe('ISSUED');
    expect(invoice.kind).toBe('PLATFORM');
    expect(invoice.billingNature).toBe('PERIOD');
    const lines = mockDb.lines.filter(l => l.invoiceId === invoice.id);
    expect(lines.filter(l => l.kind === 'SETUP').map(l => l.amount)).toEqual([100000, 150000]);
    // HT = 29 900 + 49 900 - 2 990 + 100 000 + 150 000 = 326 810 ; TVA 58 826 ; TTC 385 636.
    expect(invoice.amountExclTax).toBe(326810);
    expect(invoice.taxAmount).toBe(58826);
    expect(invoice.amountTotal).toBe(385636);
    expect(lines.find(l => l.kind === 'TAX')?.amount).toBe(58826);
    expect(invoice.issuerSnapshot).toEqual(expect.objectContaining({ name: 'Alliance Consultants' }));
    expect(invoice.customerSnapshot).toEqual(expect.objectContaining({ name: 'Société Ivoire Résidences SARL', taxId: 'CC-1234567' }));
    // Echeance = debut de periode + 7 jours de grace.
    expect(invoice.dueDate.getTime()).toBe(END.getTime() + 7 * DAY);
    expect(mockDb.items.every(i => i.billedThrough?.getTime() === NEXT_END.getTime())).toBe(true);
  });

  it('les factures suivantes ne reprennent pas la mise en route', async () => {
    mockDb.invoices.push({ id: 'old', tenantId: TENANT, kind: 'PLATFORM', billingNature: 'PERIOD', status: 'PAID', periodStart: START });
    mockPreview.mockResolvedValue(periodPreview());
    await generateInvoiceForPeriod(TENANT, { at: END });
    const created = mockDb.invoices.find(i => i.id !== 'old')!;
    expect(mockDb.lines.filter(l => l.invoiceId === created.id && l.kind === 'SETUP')).toHaveLength(0);
    expect(created.amountExclTax).toBe(76810);
  });

  it('idempotente : deux generations de la meme periode ne donnent qu une facture et un numero', async () => {
    mockPreview.mockResolvedValue(periodPreview());
    const first = await generateInvoiceForPeriod(TENANT, { at: END });
    const second = await generateInvoiceForPeriod(TENANT, { at: END });
    expect(first?.created).toBe(true);
    expect(second?.created).toBe(false);
    expect(second?.invoice.id).toBe(first?.invoice.id);
    expect(mockDb.invoices).toHaveLength(1);
    expect(mockDb.sequence.get(new Date().getUTCFullYear())).toBe(1);
  });

  it('reprend le prorata en attente : ligne rattachee, jamais recreee ni refacturee', async () => {
    const pending = {
      id: 'pending-1',
      tenantId: TENANT,
      invoiceId: null,
      kind: 'PRORATA',
      label: 'Prorata : 3 blocs de 10 lots (15/30 jours)',
      subscriptionItemId: 'item-ext',
      quantity: 1,
      unitPrice: 2250,
      amount: 2250
    };
    mockDb.lines.push(pending);
    mockDb.invoices.push({ id: 'old', tenantId: TENANT, kind: 'PLATFORM', billingNature: 'PERIOD', status: 'PAID', periodStart: START });
    mockPreview.mockResolvedValue(periodPreview({ pending: [pending] }));
    await generateInvoiceForPeriod(TENANT, { at: END });
    const invoice = mockDb.invoices.find(i => i.id !== 'old')!;
    expect(pending.invoiceId).toBe(invoice.id);
    expect(mockDb.lines.filter(l => l.kind === 'PRORATA')).toHaveLength(1);
    expect(invoice.amountExclTax).toBe(76810 + 2250);
    expect(invoice.taxAmount).toBe(Math.round((79060 * 18) / 100));
  });

  it('refuse toute facture pendant l essai', async () => {
    mockDb.subscriptions = [subscription({ status: 'TRIALING', trialEndsAt: new Date(Date.now() + 5 * DAY) })];
    await expect(generateInvoiceForPeriod(TENANT)).rejects.toMatchObject({ statusCode: 400 });
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it('facture a zero : reglee d office (le renouvellement la trouve payee)', async () => {
    mockDb.invoices.push({ id: 'old', tenantId: TENANT, kind: 'PLATFORM', billingNature: 'PERIOD', status: 'PAID', periodStart: START });
    mockPreview.mockResolvedValue({ ...periodPreview(), ...finalizeInvoice([]), lines: [] });
    await generateInvoiceForPeriod(TENANT, { at: END });
    const invoice = mockDb.invoices.find(i => i.id !== 'old')!;
    expect(invoice.status).toBe('PAID');
    expect(invoice.paymentMethod).toBe('NONE');
  });

  it('brouillon garde par le super-admin : pas de numero, invisible pour l agence', async () => {
    mockPreview.mockResolvedValue(periodPreview());
    await generateInvoiceForPeriod(TENANT, { at: END, issue: false });
    expect(mockDb.invoices[0].status).toBe('DRAFT');
    expect(mockDb.invoices[0].invoiceNumber).toMatch(/^BROUILLON-/);
    expect(mockDb.sequence.size).toBe(0);
    const agency = await listPlatformInvoices(TENANT);
    expect(agency.invoices).toHaveLength(0);
    const admin = await listPlatformInvoices(TENANT, { includeDrafts: true });
    expect(admin.invoices[0].invoiceNumber).toBeNull();
  });
});

describe('depassement mensuel en annuel (§6 ter)', () => {
  const ANNUAL_START = new Date('2026-01-15T00:00:00.000Z');
  const ANNUAL_END = new Date('2027-01-15T00:00:00.000Z');

  it('fenetres ecoulees : une par mois, bornees par la periode et le deja traite', () => {
    const now = new Date('2026-03-16T02:30:00Z');
    // Sans historique : les fenetres closes depuis moins de 35 jours (rattrapage d'un passage manque).
    expect(dueOverageWindows(ANNUAL_START, ANNUAL_END, now, null).map(w => w.start.toISOString())).toEqual([
      '2026-01-15T00:00:00.000Z',
      '2026-02-15T00:00:00.000Z'
    ]);
    expect(dueOverageWindows(ANNUAL_START, ANNUAL_END, now, new Date('2026-02-15T00:00:00Z')).map(w => w.start.toISOString())).toEqual([
      '2026-02-15T00:00:00.000Z'
    ]);
    // Jamais au-dela de la periode annuelle : la derniere fenetre finit a son echeance.
    expect(dueOverageWindows(ANNUAL_START, ANNUAL_END, new Date('2027-02-01T00:00:00Z'), null).map(w => w.end.toISOString())).toEqual([
      '2027-01-15T00:00:00.000Z'
    ]);
    expect(dueOverageWindows(ANNUAL_START, ANNUAL_END, now, new Date('2026-03-15T00:00:00Z'))).toEqual([]);
  });

  it('facture PLATFORM OVERAGE a part, jamais multipliee par 11, separee de la facture annuelle', async () => {
    mockDb.subscriptions = [
      subscription({ billingCycle: 'ANNUAL', currentPeriodStart: ANNUAL_START, currentPeriodEnd: ANNUAL_END })
    ];
    const window = { start: new Date('2026-02-15T00:00:00Z'), end: new Date('2026-03-15T00:00:00Z') };
    const overageLines = [
      { kind: 'OVERAGE', label: 'Dépassement : 12 lot(s) au-delà de la réserve (101e à 112e)', capacityKey: 'LOTS', quantity: 12, unitPrice: 150, amount: 1800, periodStart: window.start, periodEnd: window.end }
    ];
    mockPreview.mockResolvedValue({
      ...periodPreview(),
      billingCycle: 'ANNUAL',
      overageBilling: 'MONTHLY_SEPARATE',
      overageInvoice: { periodStart: window.start, periodEnd: window.end, usage: { LOTS: { used: 112, limit: 100 } }, ...finalizeInvoice(overageLines as any) }
    });

    const now = new Date('2026-03-16T02:30:00Z');
    const outcome = await runPlatformBillingStep('sub-1', now);
    expect(outcome.overageInvoices).toBe(1);
    expect(outcome.periodInvoice).toBe('NONE'); // echeance annuelle non atteinte
    const invoice = mockDb.invoices[0];
    expect(invoice.billingNature).toBe('OVERAGE');
    expect(invoice.periodStart).toEqual(window.start);
    expect(invoice.amountExclTax).toBe(1800);
    expect(invoice.taxAmount).toBe(324);
    expect(invoice.amountTotal).toBe(2124);
    // L'apercu est interroge a un instant DE la fenetre ecoulee.
    expect(mockPreview).toHaveBeenCalledWith(TENANT, { now: new Date(window.end.getTime() - 1) });
    expect(mockDb.subscriptions[0].metadata.overageCheckedThrough).toBe(window.end.toISOString());

    // Rejeu le lendemain : rien de plus.
    const again = await runPlatformBillingStep('sub-1', new Date(now.getTime() + DAY));
    expect(again.overageInvoices).toBe(0);
    expect(mockDb.invoices).toHaveLength(1);
  });

  it('un abonnement mensuel ne recoit jamais de facture OVERAGE a part', async () => {
    mockPreview.mockResolvedValue(periodPreview({ overage: 5 }));
    await expect(generateInvoiceForPeriod(TENANT, { nature: 'OVERAGE' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('en mensuel, le depassement est une ligne de la facture de periode', async () => {
    mockDb.invoices.push({ id: 'old', tenantId: TENANT, kind: 'PLATFORM', billingNature: 'PERIOD', status: 'PAID', periodStart: START });
    mockPreview.mockResolvedValue(periodPreview({ overage: 5 }));
    const outcome = await runPlatformBillingStep('sub-1', new Date(END.getTime() + 2 * 60 * 60 * 1000));
    expect(outcome.periodInvoice).toBe('CREATED');
    const invoice = mockDb.invoices.find(i => i.id !== 'old')!;
    expect(mockDb.lines.filter(l => l.invoiceId === invoice.id && l.kind === 'OVERAGE').map(l => l.amount)).toEqual([750]);
  });
});

describe('avoir et retard', () => {
  it("annule une facture emise : lignes opposees, facture CANCELED, prorata remis en attente", async () => {
    const pending = { id: 'pending-1', tenantId: TENANT, invoiceId: null, kind: 'PRORATA', label: 'Prorata', subscriptionItemId: null, quantity: 1, unitPrice: 2250, amount: 2250, metadata: null };
    mockDb.lines.push(pending);
    mockPreview.mockResolvedValue(periodPreview({ pending: [pending] }));
    const generated = await generateInvoiceForPeriod(TENANT, { at: END });
    const original = mockDb.invoices[0];

    const note = await issueCreditNote(TENANT, generated!.invoice.id, { reason: 'Erreur de pack' }, 'admin-1');
    expect(note.billingNature).toBe('CREDIT_NOTE');
    expect(note.invoiceNumber).toBe(`IMT-${new Date().getUTCFullYear()}-00002`);
    expect(Number(note.amountTotal)).toBe(-Number(original.amountTotal));
    expect(Number(note.taxAmount)).toBe(-Number(original.taxAmount));
    expect(note.status).toBe('PAID');
    expect(note.paymentMethod).toBe('COMPENSATION');
    expect(original.status).toBe('CANCELED');
    expect(original.cancelReason).toBe('Erreur de pack');
    // Actions critiques : tracees DANS la transaction (tx), pas en file asynchrone.
    expect(recordAuditEvent).toHaveBeenCalledWith(
      mockFake,
      expect.objectContaining({ actionKey: 'INVOICE_CREDIT_NOTE_ISSUED', entityId: note.id, actorUserId: 'admin-1' })
    );
    expect(recordAuditEvent).toHaveBeenCalledWith(
      mockFake,
      expect.objectContaining({ actionKey: 'INVOICE_CANCELED', entityId: original.id })
    );
    expect(logAuditEvent).not.toHaveBeenCalledWith(expect.objectContaining({ actionKey: 'INVOICE_CANCELED' }));
    const repending = mockDb.lines.filter(l => l.invoiceId === null && l.kind === 'PRORATA');
    expect(repending).toHaveLength(1);
    expect(repending[0].metadata.reissuedFromInvoiceId).toBe(original.id);

    await expect(issueCreditNote(TENANT, original.id, { reason: 'bis' }, 'admin-1')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('avoir d une facture payee : remboursement a traiter, jamais payable', async () => {
    mockPreview.mockResolvedValue(periodPreview());
    const generated = await generateInvoiceForPeriod(TENANT, { at: END });
    mockDb.invoices[0].status = 'PAID';
    const note = await issueCreditNote(TENANT, generated!.invoice.id, { reason: 'Geste commercial' }, 'admin-1');
    expect(note.paymentMethod).toBe('REFUND_DUE');
    expect(note.status).toBe('PAID');
  });

  it("une facture emise echue passe OVERDUE, jamais un avoir ni une facture d'une autre nature", async () => {
    mockDb.invoices.push(
      { id: 'a', tenantId: TENANT, kind: 'PLATFORM', billingNature: 'PERIOD', status: 'ISSUED', dueDate: new Date(Date.now() - DAY) },
      { id: 'b', tenantId: TENANT, kind: 'PLATFORM', billingNature: 'PERIOD', status: 'ISSUED', dueDate: new Date(Date.now() + DAY) },
      { id: 'c', tenantId: TENANT, kind: 'RENTAL', billingNature: null, status: 'ISSUED', dueDate: new Date(Date.now() - DAY) }
    );
    expect(await markOverdueInvoices(TENANT)).toBe(1);
    expect(mockDb.invoices.map(i => i.status)).toEqual(['OVERDUE', 'ISSUED', 'ISSUED']);
  });
});

// ------------------------------------------------------------------ PDF

describe('PDF de facture', () => {
  it('se genere avec des montants >= 1 000 (espaces insecables fr-FR) et des accents', async () => {
    // Formatage brut fr-FR : separateurs insecables (U+202F / U+00A0), que le PDF doit nettoyer.
    expect(formatFcfa(1234567)).toMatch(/^1.234.567 FCFA$/);
    const buffer = await buildPlatformInvoicePdf({
      invoiceNumber: 'IMT-2026-00001',
      nature: 'PERIOD',
      status: 'ISSUED',
      issueDate: END,
      dueDate: new Date(END.getTime() + 7 * DAY),
      periodStart: END,
      periodEnd: NEXT_END,
      currency: 'FCFA',
      issuer: { name: 'Alliance Consultants', address: 'Plateau, Abidjan — Côte d’Ivoire', rccm: 'CI-ABJ-2020-B-12345', taxId: '2012345 A', email: 'facturation@alliance.test', phone: '+225 27 20 00 00' },
      customer: { tenantId: TENANT, name: 'Société Ivoire Résidences — Cocody', address: 'Rue des Jardins, Cocody, Abidjan', email: 'contact@ivoire.test', phone: null, taxId: 'CC-1234567', },
      lines: [
        { kind: 'PACK', label: 'Pack Intégré (agence, syndic, promotion)', quantity: 1, unitPrice: 2748900, amount: 2748900, periodStart: END, periodEnd: NEXT_END },
        { kind: 'SETUP', label: 'Mise en route — Pack Intégré', quantity: 1, unitPrice: 650000, amount: 650000 },
        { kind: 'PRORATA', label: 'Prorata : 3 blocs de 10 lots, du 16 au 30 (15 jours) — العربية', quantity: 1, unitPrice: 2250, amount: 2250 },
        { kind: 'TAX', label: 'TVA 18 %', quantity: 1, unitPrice: 612207, amount: 612207 }
      ],
      amountExclTax: 3401150,
      taxRate: 18,
      taxAmount: 612207,
      amountTotal: 4013357,
      notes: 'Réglez par virement ou Mobile Money : référence à rappeler « IMT-2026-00001 ».'
    });
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBe(1);
  });

  it('le service rend le PDF d une facture emise, refuse un brouillon a l agence', async () => {
    mockPreview.mockResolvedValue(periodPreview());
    const generated = await generateInvoiceForPeriod(TENANT, { at: END });
    const file = await renderPlatformInvoicePdf(TENANT, generated!.invoice.id);
    expect(file.filename).toMatch(/^facture-IMT-\d{4}-00001\.pdf$/);
    expect(file.buffer.subarray(0, 5).toString()).toBe('%PDF-');

    mockDb.invoices[0].status = 'DRAFT';
    await expect(renderPlatformInvoicePdf(TENANT, generated!.invoice.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(renderPlatformInvoicePdf('autre-agence', generated!.invoice.id)).rejects.toMatchObject({ statusCode: 404 });
  });
});
