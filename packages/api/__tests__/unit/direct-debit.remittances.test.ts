/**
 * Remises de prélèvement : service (spec 042, P2, data-model §7).
 *
 * Prisma est remplacé par un magasin en mémoire qui applique les filtres
 * d'agence (tenantId / tenant_id), l'unicité (tenantId, activeKey) et la
 * restauration de l'état quand une transaction échoue.
 */

const IBAN = 'CI93CI0080111301134291200589';
const TENANT = 'tenant-a';
const OTHER = 'tenant-b';
const CREDITOR = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-10-16T09:00:00Z'); // vendredi
const COLLECTION = new Date('2026-10-26T00:00:00Z'); // lundi, date limite de prénotification : 19/10

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

interface State {
  creditors: Row[];
  mandates: Row[];
  leases: Row[];
  installments: Row[];
  debtors: Row[];
  contacts: Row[];
  remittances: Row[];
  lines: Row[];
}
const state: State & { failLineCreate: unknown; failRemittanceCreate: unknown; failStatusUpdate: boolean } = {
  creditors: [],
  mandates: [],
  leases: [],
  installments: [],
  debtors: [],
  contacts: [],
  remittances: [],
  lines: [],
  failLineCreate: null,
  failRemittanceCreate: null,
  failStatusUpdate: false
};

const mockAudit = { record: jest.fn(), log: jest.fn() };
const mockMail = { send: jest.fn(), config: jest.fn() };
let counter = 0;

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (expected === undefined) return true;
    const actual = row[key];
    if (expected instanceof Date) return actual instanceof Date && actual.getTime() === expected.getTime();
    if (expected && typeof expected === 'object') {
      if ('in' in expected) return (expected.in as unknown[]).includes(actual);
      if ('not' in expected) return actual !== expected.not;
    }
    return actual === expected;
  });
}

const debtorView = (id: string) => {
  const debtor = state.debtors.find(entry => entry.id === id) as Row;
  return { id, details: debtor.details ?? null, user: { fullName: debtor.fullName, email: debtor.email ?? null } };
};

function lineView(line: Row): Row {
  const mandate = state.mandates.find(entry => entry.id === line.mandateId) as Row;
  const lease = state.leases.find(entry => entry.id === line.leaseId) as Row;
  const installment = state.installments.find(entry => entry.id === line.installmentId) as Row;
  return {
    ...line,
    mandate,
    lease: { id: lease.id, lease_number: lease.lease_number },
    installment,
    debtor: debtorView(line.debtorClientId)
  };
}

function remittanceView(row: Row, select?: Row): Row {
  const linesSelect = select?.lines;
  const lines = state.lines
    .filter(line => line.remittanceId === row.id && matches(line, linesSelect?.where))
    .sort((a, b) => a.lineNumber - b.lineNumber)
    .map(lineView);
  return {
    ...row,
    creditor: state.creditors.find(entry => entry.id === row.creditorId),
    tenant: { name: 'Agence Test' },
    lines
  };
}

function applyData(row: Row, data: Row) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && !(value instanceof Date) && 'increment' in value) {
      row[key] = (row[key] ?? 0) + value.increment;
    } else if (value !== undefined) {
      row[key] = value;
    }
  }
}

const uniqueError = (target: string[]) =>
  Object.assign(new Error('Unique constraint'), { code: 'P2002', meta: { target } });

const snapshot = () => {
  const { creditors, mandates, leases, installments, debtors, contacts, remittances, lines } = state;
  return structuredClone({ creditors, mandates, leases, installments, debtors, contacts, remittances, lines });
};

const mockDb: Row = {
  $transaction: jest.fn(async (fn: (tx: Row) => unknown) => {
    const before = snapshot();
    try {
      return await fn(mockDb);
    } catch (error) {
      Object.assign(state, before);
      throw error;
    }
  }),
  directDebitCreditor: {
    findFirst: jest.fn(async ({ where }: Row) => state.creditors.find(row => matches(row, where)) ?? null)
  },
  directDebitMandate: {
    findMany: jest.fn(async ({ where }: Row) =>
      state.mandates
        .filter(row => matches(row, where))
        .map(row => {
          const lease = state.leases.find(entry => entry.id === row.leaseId);
          return {
            ...row,
            lease: lease && { id: lease.id, lease_number: lease.lease_number, status: lease.status },
            debtor: debtorView(row.debtorClientId)
          };
        })
    )
  },
  rentalInstallment: {
    findMany: jest.fn(async ({ where }: Row) => state.installments.filter(row => matches(row, where)))
  },
  crmContact: {
    findMany: jest.fn(async ({ where }: Row) => state.contacts.filter(row => matches(row, where)))
  },
  tenantClient: {
    findMany: jest.fn(async ({ where }: Row) =>
      state.debtors
        .filter(row => where.id.in.includes(row.id))
        .map(row => ({ id: row.id, details: row.details ?? null, user: { email: row.email ?? null } }))
    )
  },
  directDebitRemittance: {
    count: jest.fn(async ({ where }: Row) => state.remittances.filter(row => matches(row, where)).length),
    findFirst: jest.fn(async ({ where, select, orderBy }: Row) => {
      let found = state.remittances.filter(row => matches(row, where));
      if (orderBy?.sequence === 'desc') found = [...found].sort((a, b) => b.sequence - a.sequence);
      return found[0] ? remittanceView(found[0], select) : null;
    }),
    findMany: jest.fn(async ({ where, skip = 0, take = 100 }: Row) =>
      state.remittances
        .filter(row => matches(row, where))
        .sort(
          (a, b) =>
            b.collectionDate.getTime() - a.collectionDate.getTime() || b.year - a.year || b.sequence - a.sequence
        )
        .slice(skip, skip + take)
        .map(row => remittanceView(row))
    ),
    create: jest.fn(async ({ data }: Row) => {
      if (state.failRemittanceCreate) {
        const error = state.failRemittanceCreate;
        state.failRemittanceCreate = null;
        throw error;
      }
      counter += 1;
      const row = {
        id: `rem-${counter}`,
        status: 'DRAFT',
        lineCount: 0,
        totalAmount: 0,
        exportCount: 0,
        fileFormat: null,
        creditorLabelSnapshot: null,
        creditorIdentifierSnapshot: null,
        validatedAt: null,
        firstExportedAt: null,
        lastExportedAt: null,
        lastFileDigest: null,
        submittedAt: null,
        canceledAt: null,
        cancellationReason: null,
        createdAt: new Date(NOW),
        updatedAt: new Date(NOW),
        ...data
      };
      state.remittances.push(row);
      return { id: row.id };
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      if (state.failStatusUpdate && data.status) return { count: 0 };
      const rows = state.remittances.filter(row => matches(row, where));
      rows.forEach(row => applyData(row, data));
      return { count: rows.length };
    })
  },
  directDebitRemittanceLine: {
    count: jest.fn(async ({ where }: Row) => state.lines.filter(row => matches(row, where)).length),
    findFirst: jest.fn(async ({ where }: Row) => {
      const found = state.lines.find(row => matches(row, where));
      return found ? lineView(found) : null;
    }),
    findMany: jest.fn(async ({ where }: Row) => state.lines.filter(row => matches(row, where)).map(lineView)),
    // createMany : tout le lot ou rien (une violation d'unicité annule les lignes déjà posées).
    createMany: jest.fn(async ({ data }: { data: Row[] }) => {
      if (state.failLineCreate) {
        const error = state.failLineCreate;
        state.failLineCreate = null;
        throw error;
      }
      const added: Row[] = [];
      for (const entry of data) {
        const taken = [...state.lines, ...added].some(
          l => l.tenantId === entry.tenantId && entry.activeKey && l.activeKey === entry.activeKey
        );
        if (taken) throw uniqueError(['tenant_id', 'active_key']);
        counter += 1;
        added.push({
          id: `line-${counter}`,
          status: 'PENDING',
          capped: false,
          canceledAt: null,
          cancellationReason: null,
          prenotificationStatus: 'PENDING',
          prenotifiedAt: null,
          ...entry
        });
      }
      state.lines.push(...added);
      return { count: added.length };
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const rows = state.lines.filter(row => matches(row, where));
      rows.forEach(row => applyData(row, data));
      return { count: rows.length };
    })
  }
};

const mockEnv: Record<string, string | undefined> = {
  DIRECT_DEBIT_IBAN_KEY: Buffer.alloc(32, 7).toString('base64')
};
jest.mock('../../src/config/env', () => ({ env: mockEnv, parseKeyList: () => [] }));
// Verrou consultatif : une file par clé, comme le vrai (mutex local + verrou PostgreSQL).
jest.mock('../../src/lib/ai/advisory-lock', () => {
  const tails = new Map<string, Promise<unknown>>();
  return {
    withExclusiveSection: jest.fn(async (key: string, fn: () => Promise<unknown>) => {
      const run = (tails.get(key) ?? Promise.resolve()).then(fn, fn);
      tails.set(
        key,
        run.catch(() => undefined)
      );
      return run;
    })
  };
});
jest.mock('../../src/utils/database', () => ({ prisma: mockDb }));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({
  recordAuditEvent: (...args: unknown[]) => mockAudit.record(...args),
  logAuditEvent: (...args: unknown[]) => mockAudit.log(...args)
}));
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendDirectDebitPrenotification: (...args: unknown[]) => mockMail.send(...args) }
}));
jest.mock('../../src/services/email-notification-config-service', () => ({
  getEmailNotificationConfig: (...args: unknown[]) => mockMail.config(...args)
}));
jest.mock('../../src/lib/direct-debit/iban-crypto', () => ({
  isIbanEncryptionAvailable: () => true,
  encryptIban: (plain: string) => `ddk1:key:iv:tag:${Buffer.from(plain).toString('base64')}`,
  decryptIban: (enc: string) => Buffer.from(enc.split(':')[4], 'base64').toString()
}));

import { createHash, createHmac, hkdfSync } from 'node:crypto';
import { BadRequestError, ConflictError, NotFoundError } from '../../src/middleware/error-middleware';
import { logger } from '../../src/utils/logger';
import { waitForRemittancePrenotifications } from '../../src/lib/direct-debit/prenotification';
import {
  cancelRemittance,
  cancelRemittanceLine,
  createRemittance,
  exportRemittance,
  getRemittance,
  listRemittances,
  refreshRemittance,
  resendPrenotifications,
  submitRemittance,
  validateRemittance
} from '../../src/lib/direct-debit/remittances';

/** Calcul indépendant : HKDF-SHA-256 (info fixée) de la clé IBAN, puis HMAC-SHA-256 du fichier. */
function expectedDigest(buffer: Buffer): string {
  const master = Buffer.from(mockEnv.DIRECT_DEBIT_IBAN_KEY as string, 'base64');
  const key = Buffer.from(
    hkdfSync('sha256', master, Buffer.alloc(0), Buffer.from('immotopia:direct-debit:remittance-file-digest'), 32)
  );
  return createHmac('sha256', key).update(buffer).digest('hex');
}

const enc = (iban: string) => `ddk1:key:iv:tag:${Buffer.from(iban).toString('base64')}`;

function resetState() {
  counter = 0;
  const base = { tenantId: TENANT, scope: 'RENTAL_LEASE', creditorId: CREDITOR, status: 'ACTIVE', year: 2026 };
  state.creditors = [
    {
      id: CREDITOR,
      tenantId: TENANT,
      label: 'Compte loyers',
      creditorIdentifier: 'CI-EMET-001',
      isActive: true,
      collectionDay: 5,
      prenotificationBusinessDays: 5,
      fileFormat: 'GENERIC_CSV'
    }
  ];
  const lease = (n: number, status = 'ACTIVE') => ({
    id: `lease-${n}`,
    tenant_id: TENANT,
    lease_number: `BAIL-00${n}`,
    status
  });
  state.leases = [lease(1), lease(2), lease(3, 'SUSPENDED'), lease(4), lease(5)];
  const mandate = (n: number, over: Row = {}) => ({
    ...base,
    id: `mandate-${n}`,
    sequence: n,
    leaseId: `lease-${n}`,
    debtorClientId: `client-${n}`,
    maxAmount: null,
    collectionDay: null,
    holderName: `Titulaire ${n}`,
    ibanEncrypted: enc(IBAN),
    ibanLast4: '0589',
    signedAt: new Date('2026-09-01T00:00:00Z'),
    ...over
  });
  state.mandates = [
    mandate(1, { holderName: 'Awa Traoré' }),
    mandate(2, { maxAmount: 100000 }),
    mandate(3),
    mandate(4),
    mandate(5, { collectionDay: 28 })
  ];
  state.debtors = [
    { id: 'client-1', fullName: 'Awa Traoré', email: 'awa@example.test' },
    { id: 'client-2', fullName: 'Koffi Yao', email: null },
    { id: 'client-3', fullName: 'Marie Kouassi', email: 'marie@example.test' },
    { id: 'client-4', fullName: 'Ibrahim Sylla', email: null },
    { id: 'client-5', fullName: 'Fatou Bamba', email: null, details: { crmContactId: 'contact-5' } }
  ];
  state.contacts = [{ id: 'contact-5', tenantId: TENANT, email: 'fatou@example.test' }];
  const installment = (n: number, over: Row) => ({
    id: `inst-${n}`,
    tenant_id: TENANT,
    lease_id: `lease-${n}`,
    period_year: 2026,
    period_month: 10,
    due_date: new Date('2026-10-05T00:00:00Z'),
    status: 'DUE',
    amount_service: 0,
    amount_other_fees: 0,
    penalty_amount: 0,
    amount_paid: 0,
    ...over
  });
  state.installments = [
    installment(1, { amount_rent: 150000, amount_service: 10000, penalty_amount: 5000 }),
    installment(2, { amount_rent: 200000, amount_paid: 50000, status: 'PARTIAL' }),
    installment(3, { amount_rent: 100000 }),
    installment(5, { amount_rent: 80000 })
  ];
  state.remittances = [];
  state.lines = [];
  state.failLineCreate = null;
  state.failRemittanceCreate = null;
  state.failStatusUpdate = false;
}

const create = (over: Row = {}) =>
  createRemittance(
    TENANT,
    { creditorId: CREDITOR, collectionDate: COLLECTION, notes: null, ...over } as any,
    'user-1',
    NOW
  );
const validated = async () => {
  const { remittance } = await create();
  await validateRemittance(TENANT, remittance.id, 'user-1', NOW);
  await waitForRemittancePrenotifications();
  return remittance.id as string;
};

/** Ni l'IBAN complet, ni le texte chiffré, ni une adresse e-mail n'apparaissent. */
function expectNoLeak(value: unknown) {
  const text = JSON.stringify(value);
  expect(text).not.toContain(IBAN);
  expect(text).not.toContain('0080111301134291200589');
  expect(text).not.toContain('ibanEncrypted');
  expect(text).not.toContain('ddk1:');
  expect(text).not.toMatch(/@example\.test/);
}

beforeEach(() => {
  jest.clearAllMocks();
  resetState();
  mockMail.config.mockResolvedValue({ enabled: true, subjectOverride: null, bodyHtmlOverride: null });
  mockMail.send.mockResolvedValue(undefined);
  mockAudit.record.mockResolvedValue(undefined);
});

describe('remises / création', () => {
  it('crée un brouillon PRL-AAAA-NNNN avec ses lignes classées et les mandats non retenus', async () => {
    const { remittance, skipped } = await create();

    expect(remittance.reference).toBe('PRL-2026-0001');
    expect(remittance.status).toBe('DRAFT');
    expect(remittance.collectionDate).toBe('2026-10-26');
    expect(remittance.periodYear).toBe(2026);
    expect(remittance.periodMonth).toBe(10);
    expect(remittance.prenotificationDeadline).toBe('2026-10-19');
    expect(remittance.lineCount).toBe(2);
    expect(remittance.totalAmount).toBe(260000);
    expect(remittance.creditor).toEqual({ id: CREDITOR, label: 'Compte loyers', creditorIdentifier: 'CI-EMET-001' });

    expect(remittance.lines.map(line => line.reference)).toEqual(['PRL-2026-0001-001', 'PRL-2026-0001-002']);
    const [first, second] = remittance.lines;
    // Les pénalités (5 000) ne sont jamais prélevées.
    expect(first).toMatchObject({ amount: 160000, remainingDueAtSelection: 160000, capped: false });
    expect(first.mandate).toMatchObject({ reference: 'MDT-2026-0001', ibanMasked: 'CI•• •••• •••• •••• •••• 0589' });
    expect(first.debtor.displayName).toBe('Awa Traoré');
    // Paiement partiel : reste dû 150 000, plafonné à 100 000.
    expect(second).toMatchObject({ amount: 100000, remainingDueAtSelection: 150000, capped: true });

    expect(skipped).toEqual([
      expect.objectContaining({ mandateReference: 'MDT-2026-0003', reason: 'LEASE_NOT_ACTIVE' }),
      expect.objectContaining({ mandateReference: 'MDT-2026-0004', reason: 'NO_INSTALLMENT', leaseNumber: 'BAIL-004' }),
      expect.objectContaining({ mandateReference: 'MDT-2026-0005', reason: 'COLLECTION_DAY_LATER' })
    ]);

    const stored = state.lines[0];
    expect(stored.tenantId).toBe(TENANT);
    expect(stored.activeKey).toBe('inst-1');
    expect(mockAudit.record).toHaveBeenCalledTimes(1);
    expect(mockAudit.record.mock.calls[0][1]).toMatchObject({
      actionKey: 'DIRECT_DEBIT_REMITTANCE_CREATED',
      tenantId: TENANT,
      payload: { reference: 'PRL-2026-0001', lineCount: 2, totalAmount: 260000, collectionDate: '2026-10-26' }
    });
    expectNoLeak(remittance);
    expectNoLeak(mockAudit.record.mock.calls);
  });

  it('numérote la remise suivante et écarte les échéances déjà dans une remise', async () => {
    await create();
    state.installments.push({ ...state.installments[0], id: 'inst-6', lease_id: 'lease-6' });
    state.leases.push({ id: 'lease-6', tenant_id: TENANT, lease_number: 'BAIL-006', status: 'ACTIVE' });
    state.debtors.push({ id: 'client-6', fullName: 'Nina Diallo', email: null });
    state.mandates.push({
      ...state.mandates[0],
      id: 'mandate-6',
      sequence: 6,
      leaseId: 'lease-6',
      debtorClientId: 'client-6'
    });

    const { remittance, skipped } = await create();
    expect(remittance.reference).toBe('PRL-2026-0002');
    expect(remittance.lines).toHaveLength(1);
    expect(remittance.lines[0].mandate.reference).toBe('MDT-2026-0006');
    expect(
      skipped.filter(entry => entry.reason === 'ALREADY_IN_REMITTANCE').map(entry => entry.mandateReference)
    ).toEqual(['MDT-2026-0001', 'MDT-2026-0002']);
  });

  it('refuse une date trop proche en donnant la première date possible, sans rien écrire', async () => {
    const error = await create({ collectionDate: new Date('2026-10-20T00:00:00Z') }).catch(e => e);
    expect(error).toBeInstanceOf(BadRequestError);
    expect(error.message).toContain('23/10/2026');
    expect(state.remittances).toHaveLength(0);
    expect(state.lines).toHaveLength(0);
  });

  it('refuse une remise sans aucune ligne, sans rien écrire', async () => {
    state.installments = [];
    const error = await create().catch(e => e);
    expect(error).toBeInstanceOf(BadRequestError);
    expect(error.message).toBe('Aucune échéance à prélever pour ce créancier à cette date.');
    expect(state.remittances).toHaveLength(0);
  });

  it('traite un créancier d une autre agence comme inexistant et refuse un créancier désactivé', async () => {
    state.creditors[0].tenantId = OTHER;
    await expect(create()).rejects.toBeInstanceOf(NotFoundError);
    state.creditors[0].tenantId = TENANT;
    state.creditors[0].isActive = false;
    await expect(create()).rejects.toBeInstanceOf(BadRequestError);
  });

  it('convertit une violation d unicité sur l échéance en conflit 409', async () => {
    state.failLineCreate = uniqueError(['tenant_id', 'active_key']);
    const error = await create().catch(e => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.message).toContain('déjà dans une autre remise');
    expect(state.remittances).toHaveLength(0);
  });

  it('reprend la numérotation quand la séquence est prise entre-temps', async () => {
    state.failRemittanceCreate = uniqueError(['tenant_id', 'year', 'sequence']);
    const { remittance } = await create();
    expect(remittance.reference).toBe('PRL-2026-0001');
    expect(mockDb.directDebitRemittance.create).toHaveBeenCalledTimes(2);
  });

  it('refuse l unicité réelle : une même échéance ne peut pas être dans deux lignes vivantes', async () => {
    await create();
    await expect(
      mockDb.directDebitRemittanceLine.createMany({ data: [{ tenantId: TENANT, activeKey: 'inst-1' }] })
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});

describe('remises / actualisation', () => {
  it('met à jour un montant changé, annule une ligne devenue inéligible et ajoute un mandat devenu éligible', async () => {
    const { remittance } = await create();
    // Le loyer 1 est payé en partie ; le bail 2 est résilié ; le bail 3 est réactivé.
    state.installments[0].amount_paid = 60000;
    state.leases[1].status = 'ENDED';
    state.leases[2].status = 'ACTIVE';

    const refreshed = await refreshRemittance(TENANT, remittance.id, 'user-1');

    const lines = refreshed.remittance.lines;
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ status: 'PENDING', amount: 100000, remainingDueAtSelection: 100000 });
    expect(lines[1]).toMatchObject({ status: 'CANCELED' });
    expect(lines[1].cancellationReason).toBe("Le bail n'est plus actif.");
    expect(lines[1].canceledAt).not.toBeNull();
    expect(state.lines[1].activeKey).toBeNull();
    // Nouveau mandat : rang suivant, jamais réutilisé.
    expect(lines[2]).toMatchObject({ lineNumber: 3, reference: 'PRL-2026-0001-003', amount: 100000 });
    expect(lines[2].mandate.reference).toBe('MDT-2026-0003');
    expect(refreshed.remittance.lineCount).toBe(2);
    expect(refreshed.remittance.totalAmount).toBe(200000);
    expect(refreshed.skipped.map(entry => entry.mandateReference)).toEqual(['MDT-2026-0004', 'MDT-2026-0005']);
    expect(mockAudit.record.mock.calls.at(-1)?.[1]).toMatchObject({
      actionKey: 'DIRECT_DEBIT_REMITTANCE_REFRESHED',
      payload: { added: 1, updated: 1, canceled: 1 }
    });
  });

  it('ne rajoute pas un mandat dont la ligne a été retirée à la main', async () => {
    const { remittance } = await create();
    await cancelRemittanceLine(TENANT, remittance.id, remittance.lines[0].id, 'litige', 'user-1');
    const refreshed = await refreshRemittance(TENANT, remittance.id, 'user-1');
    expect(refreshed.remittance.lines).toHaveLength(2);
    expect(refreshed.remittance.lines[0].status).toBe('CANCELED');
  });

  it('refuse une remise qui n est plus un brouillon', async () => {
    const id = await validated();
    await expect(refreshRemittance(TENANT, id, 'user-1')).rejects.toBeInstanceOf(ConflictError);
  });

  it('convertit une violation d unicité en conflit', async () => {
    const { remittance } = await create();
    state.leases[2].status = 'ACTIVE';
    state.failLineCreate = uniqueError(['tenant_id', 'active_key']);
    await expect(refreshRemittance(TENANT, remittance.id, 'user-1')).rejects.toBeInstanceOf(ConflictError);
  });

  it('une remise d une autre agence est introuvable', async () => {
    const { remittance } = await create();
    await expect(refreshRemittance(OTHER, remittance.id, 'user-x')).rejects.toBeInstanceOf(NotFoundError);
    await expect(getRemittance(OTHER, remittance.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('remises / retrait d une ligne', () => {
  it('annule la ligne, libère l échéance et recalcule les totaux', async () => {
    const { remittance } = await create();
    const line = remittance.lines[0];
    const dto = await cancelRemittanceLine(TENANT, remittance.id, line.id, 'locataire en litige', 'user-1');

    expect(dto.lines[0]).toMatchObject({ status: 'CANCELED', cancellationReason: 'locataire en litige' });
    expect(state.lines[0].activeKey).toBeNull();
    expect(dto.lineCount).toBe(1);
    expect(dto.totalAmount).toBe(100000);
    expect(mockAudit.record.mock.calls.at(-1)?.[1]).toMatchObject({
      actionKey: 'DIRECT_DEBIT_REMITTANCE_LINE_CANCELED',
      payload: { lineReference: 'PRL-2026-0001-001', mandateReference: 'MDT-2026-0001', totalAmount: 100000 }
    });
    // Une seconde annulation de la même ligne est refusée.
    await expect(cancelRemittanceLine(TENANT, remittance.id, line.id, null, 'user-1')).rejects.toBeInstanceOf(
      ConflictError
    );
  });

  it('traite une ligne d une autre remise, d une autre agence ou inconnue comme inexistante', async () => {
    const { remittance } = await create();
    await expect(
      cancelRemittanceLine(OTHER, remittance.id, remittance.lines[0].id, null, 'user-x')
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(cancelRemittanceLine(TENANT, remittance.id, 'line-inconnue', null, 'user-1')).rejects.toBeInstanceOf(
      NotFoundError
    );
    state.remittances.push({ ...state.remittances[0], id: 'rem-autre', sequence: 9 });
    state.lines.push({
      ...state.lines[0],
      id: 'line-autre',
      remittanceId: 'rem-autre',
      lineNumber: 1,
      activeKey: null
    });
    await expect(cancelRemittanceLine(TENANT, remittance.id, 'line-autre', null, 'user-1')).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it('ne retire pas la dernière ligne d une remise validée ; une remise exportée refuse tout retrait', async () => {
    const id = await validated();
    const [a, b] = state.lines.filter(line => line.remittanceId === id);
    await cancelRemittanceLine(TENANT, id, a.id, null, 'user-1');
    const error = await cancelRemittanceLine(TENANT, id, b.id, null, 'user-1').catch(e => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.message).toContain('annulez la remise');
    await exportRemittance(TENANT, id, 'user-1', NOW);
    await expect(cancelRemittanceLine(TENANT, id, b.id, null, 'user-1')).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('remises / validation et prénotifications', () => {
  it('valide, fige le créancier et envoie les prénotifications ligne par ligne, en arrière-plan', async () => {
    const { remittance } = await create();
    // La configuration d'e-mail reste en attente : rien ne part tant qu'on ne la libère pas.
    let release: () => void = () => undefined;
    mockMail.config.mockReturnValueOnce(
      new Promise(resolve => {
        release = () => resolve({ enabled: true, subjectOverride: null, bodyHtmlOverride: null });
      })
    );
    const first = await validateRemittance(TENANT, remittance.id, 'user-1', NOW);
    // La réponse n'attend pas les e-mails : les lignes sont encore à envoyer.
    expect(first.remittance.status).toBe('VALIDATED');
    expect(first.prenotifications).toMatchObject({ pending: 2, sent: 0, noEmail: 0, disabled: 0, failed: 0 });
    expect(mockMail.send).not.toHaveBeenCalled();
    release();
    await waitForRemittancePrenotifications();
    const result = { remittance: await getRemittance(TENANT, remittance.id), prenotifications: null as unknown };
    result.prenotifications = result.remittance.prenotificationSummary;

    expect(result.remittance.status).toBe('VALIDATED');
    expect(result.remittance.validatedAt).toBe(NOW.toISOString());
    expect(result.remittance.fileFormat).toBe('GENERIC_CSV');
    expect(state.remittances[0]).toMatchObject({
      creditorLabelSnapshot: 'Compte loyers',
      creditorIdentifierSnapshot: 'CI-EMET-001',
      validatedByUserId: 'user-1'
    });
    // Ligne 1 : e-mail du compte ; ligne 2 : aucune adresse.
    expect(result.prenotifications).toMatchObject({ pending: 0, sent: 1, noEmail: 1, disabled: 0, failed: 0 });
    expect(result.remittance.lines.map(line => line.prenotificationStatus)).toEqual(['SENT', 'NO_EMAIL']);
    expect(result.remittance.lines[0].prenotifiedAt).not.toBeNull();

    expect(mockMail.send).toHaveBeenCalledTimes(1);
    const [to, vars, options] = mockMail.send.mock.calls[0];
    expect(to).toBe('awa@example.test');
    expect(vars).toMatchObject({
      debtorName: 'Awa Traoré',
      agencyName: 'Agence Test',
      collectionDate: '26/10/2026',
      period: '10/2026',
      leaseNumber: 'BAIL-001',
      ibanMasked: 'CI•• •••• •••• •••• •••• 0589',
      mandateReference: 'MDT-2026-0001',
      creditorIdentifier: 'CI-EMET-001'
    });
    expect(options.tenantId).toBe(TENANT);
    // Jamais l'IBAN complet dans le message.
    expect(JSON.stringify(mockMail.send.mock.calls)).not.toContain('0080111301134291200589');

    const keys = mockAudit.record.mock.calls.map(call => call[1].actionKey);
    expect(keys).toEqual(['DIRECT_DEBIT_REMITTANCE_CREATED', 'DIRECT_DEBIT_REMITTANCE_VALIDATED']);
    expect(mockAudit.log.mock.calls[0][0]).toMatchObject({
      actionKey: 'DIRECT_DEBIT_REMITTANCE_PRENOTIFIED',
      payload: { sent: 1, noEmail: 1, disabled: 0, failed: 0 }
    });
    expectNoLeak(result);
    expectNoLeak(mockAudit.log.mock.calls);
  });

  it('retrouve l adresse du contact CRM quand le débiteur n a pas de compte avec e-mail', async () => {
    state.leases[4].status = 'ACTIVE';
    state.mandates[4].collectionDay = 5;
    const { remittance } = await create();
    await validateRemittance(TENANT, remittance.id, 'user-1', NOW);
    await waitForRemittancePrenotifications();
    expect(mockMail.send.mock.calls.map(call => call[0])).toContain('fatou@example.test');
  });

  it('marque DISABLED quand la notification est désactivée, FAILED quand l envoi échoue, sans défaire la validation', async () => {
    mockMail.config.mockResolvedValue({ enabled: false, subjectOverride: null, bodyHtmlOverride: null });
    const first = await create();
    await validateRemittance(TENANT, first.remittance.id, 'user-1', NOW);
    await waitForRemittancePrenotifications();
    const disabled = await getRemittance(TENANT, first.remittance.id);
    expect(disabled.prenotificationSummary).toMatchObject({ pending: 0, sent: 0, noEmail: 0, disabled: 2, failed: 0 });
    expect(mockMail.send).not.toHaveBeenCalled();

    resetState();
    mockMail.config.mockResolvedValue({ enabled: true, subjectOverride: null, bodyHtmlOverride: null });
    mockMail.send.mockRejectedValue(new Error('SMTP awa@example.test refusé'));
    const second = await create();
    await validateRemittance(TENANT, second.remittance.id, 'user-1', NOW);
    await waitForRemittancePrenotifications();
    const failed = await getRemittance(TENANT, second.remittance.id);
    expect(failed.status).toBe('VALIDATED');
    expect(failed.prenotificationSummary).toMatchObject({ pending: 0, sent: 0, noEmail: 1, disabled: 0, failed: 1 });
    expectNoLeak(failed);
    // Ni l'adresse ni le texte du transport ne sont journalisés.
    expectNoLeak((logger.warn as jest.Mock).mock.calls);
    expect(JSON.stringify((logger.warn as jest.Mock).mock.calls)).not.toContain('SMTP');
  });

  it('refuse sans numéro d émetteur, sans ligne, après la date limite et à un autre statut', async () => {
    const { remittance } = await create();
    state.creditors[0].creditorIdentifier = null;
    const noId = await validateRemittance(TENANT, remittance.id, 'user-1', NOW).catch(e => e);
    expect(noId).toBeInstanceOf(BadRequestError);
    expect(noId.message).toBe("Renseignez le numéro d'émetteur du créancier avant de valider la remise.");
    state.creditors[0].creditorIdentifier = 'CI-EMET-001';

    const late = await validateRemittance(TENANT, remittance.id, 'user-1', new Date('2026-10-20T08:00:00Z')).catch(
      e => e
    );
    expect(late).toBeInstanceOf(ConflictError);
    expect(late.message).toContain('19/10/2026');

    state.lines.forEach(line => Object.assign(line, { status: 'CANCELED', activeKey: null }));
    await expect(validateRemittance(TENANT, remittance.id, 'user-1', NOW)).rejects.toBeInstanceOf(BadRequestError);
    expect(state.remittances[0].status).toBe('DRAFT');
  });

  it('refuse quand les montants ont changé depuis la préparation', async () => {
    const { remittance } = await create();
    state.installments[0].amount_paid = 10000;
    const error = await validateRemittance(TENANT, remittance.id, 'user-1', NOW).catch(e => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.message).toBe('Les montants ont changé depuis la préparation : actualisez la remise.');
    expect(state.remittances[0].status).toBe('DRAFT');
    expect(mockMail.send).not.toHaveBeenCalled();
    // Après actualisation, la validation passe.
    await refreshRemittance(TENANT, remittance.id, 'user-1');
    const ok = await validateRemittance(TENANT, remittance.id, 'user-1', NOW);
    expect(ok.remittance.status).toBe('VALIDATED');
    expect(ok.remittance.lines[0].amount).toBe(150000);
  });

  it('refuse aussi quand un mandat n est plus actif, et une seconde validation', async () => {
    const { remittance } = await create();
    state.mandates[1].status = 'SUSPENDED';
    await expect(validateRemittance(TENANT, remittance.id, 'user-1', NOW)).rejects.toBeInstanceOf(ConflictError);
    state.mandates[1].status = 'ACTIVE';
    await validateRemittance(TENANT, remittance.id, 'user-1', NOW);
    await expect(validateRemittance(TENANT, remittance.id, 'user-1', NOW)).rejects.toBeInstanceOf(ConflictError);
  });

  it('une seule de deux validations simultanées passe (mise à jour conditionnelle)', async () => {
    const { remittance } = await create();
    state.failStatusUpdate = true;
    const error = await validateRemittance(TENANT, remittance.id, 'user-1', NOW).catch(e => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(state.remittances[0].status).toBe('DRAFT');
    expect(mockMail.send).not.toHaveBeenCalled();
  });
});

describe('remises / renvoi des prénotifications', () => {
  it('ne renvoie que les lignes dont la prénotification n est pas SENT', async () => {
    mockMail.send.mockRejectedValueOnce(new Error('SMTP indisponible'));
    const id = await validated();
    expect(state.lines.map(line => line.prenotificationStatus)).toEqual(['FAILED', 'NO_EMAIL']);

    mockMail.send.mockClear();
    state.debtors[1].email = 'koffi@example.test';
    await resendPrenotifications(TENANT, id, 'user-1', NOW);
    await waitForRemittancePrenotifications();
    expect(mockMail.send).toHaveBeenCalledTimes(2);
    expect((await getRemittance(TENANT, id)).prenotificationSummary).toMatchObject({
      pending: 0,
      sent: 2,
      noEmail: 0,
      disabled: 0,
      failed: 0
    });

    mockMail.send.mockClear();
    await resendPrenotifications(TENANT, id, 'user-1', NOW);
    await waitForRemittancePrenotifications();
    expect(mockMail.send).not.toHaveBeenCalled();
  });

  it('un deuxième déclenchement pendant un envoi en cours n envoie aucun doublon', async () => {
    const id = await validated();
    // Les lignes repassent à envoyer, l'envoi reste bloqué sur le premier e-mail.
    state.lines.forEach(line => Object.assign(line, { prenotificationStatus: 'PENDING' }));
    state.debtors[1].email = 'koffi@example.test';
    mockMail.send.mockClear();
    let release: () => void = () => undefined;
    mockMail.send.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          release = () => resolve();
        })
    );
    await resendPrenotifications(TENANT, id, 'user-1', NOW);
    // Le premier envoi est bloqué sur son premier e-mail ; le second déclenchement se met en file.
    for (let tries = 0; tries < 200 && mockMail.send.mock.calls.length < 1; tries += 1) {
      await new Promise(resolve => setTimeout(resolve, 1));
    }
    await resendPrenotifications(TENANT, id, 'user-1', NOW);
    release();
    await waitForRemittancePrenotifications();
    // Une seule adresse par ligne, une seule fois chacune.
    expect(mockMail.send.mock.calls.map(call => call[0]).sort()).toEqual(['awa@example.test', 'koffi@example.test']);
    expect((await getRemittance(TENANT, id)).prenotificationSummary.sent).toBe(2);
  });

  it('limite à cinq les envois simultanés et écrit le statut ligne par ligne', async () => {
    const { remittance } = await create();
    // Douze lignes supplémentaires avec une adresse.
    for (let n = 10; n < 22; n += 1) {
      state.leases.push({ id: `lease-${n}`, tenant_id: TENANT, lease_number: `BAIL-0${n}`, status: 'ACTIVE' });
      state.debtors.push({ id: `client-${n}`, fullName: `Locataire ${n}`, email: `l${n}@example.test` });
      state.installments.push({ ...state.installments[0], id: `inst-${n}`, lease_id: `lease-${n}` });
      state.mandates.push({
        ...state.mandates[0],
        id: `mandate-${n}`,
        sequence: n,
        leaseId: `lease-${n}`,
        debtorClientId: `client-${n}`
      });
    }
    await refreshRemittance(TENANT, remittance.id, 'user-1');
    expect(state.lines.filter(line => line.status === 'PENDING')).toHaveLength(14);

    let active = 0;
    let peak = 0;
    mockMail.send.mockImplementation(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active -= 1;
    });
    await validateRemittance(TENANT, remittance.id, 'user-1', NOW);
    await waitForRemittancePrenotifications();
    expect(mockMail.send).toHaveBeenCalledTimes(13);
    expect(peak).toBeLessThanOrEqual(5);
    expect(peak).toBeGreaterThan(1);
    expect(mockAudit.log.mock.calls.at(-1)?.[0]).toMatchObject({
      actionKey: 'DIRECT_DEBIT_REMITTANCE_PRENOTIFIED',
      payload: { sent: 13, noEmail: 1, failed: 0 }
    });
  });

  it('journalise sans adresse ni texte du transport quand l envoi en arrière-plan échoue', async () => {
    const id = await validated();
    state.lines.forEach(line => Object.assign(line, { prenotificationStatus: 'PENDING' }));
    mockDb.directDebitRemittanceLine.findMany.mockRejectedValueOnce(new Error('connexion perdue awa@example.test'));
    await resendPrenotifications(TENANT, id, 'user-1', NOW);
    await waitForRemittancePrenotifications();
    const logged = JSON.stringify((logger.warn as jest.Mock).mock.calls);
    expect(logged).toContain('envoi en arrière-plan interrompu');
    expect(logged).not.toContain('awa@example.test');
    expect(logged).not.toContain('connexion perdue');
  });

  it('refuse à partir de la date de collecte et hors des statuts validée ou exportée', async () => {
    const { remittance } = await create();
    await expect(resendPrenotifications(TENANT, remittance.id, 'user-1', NOW)).rejects.toBeInstanceOf(ConflictError);
    await validateRemittance(TENANT, remittance.id, 'user-1', NOW);
    await expect(
      resendPrenotifications(TENANT, remittance.id, 'user-1', new Date('2026-10-26T06:00:00Z'))
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(resendPrenotifications(OTHER, remittance.id, 'user-x', NOW)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('remises / fichier', () => {
  const head =
    'reference_remise;numero_emetteur;creancier;date_echeance;reference_operation;reference_mandat;date_signature_mandat;titulaire;iban;montant;devise;libelle';

  it('produit le CSV exact, passe en EXPORTED, compte l export et garde l empreinte', async () => {
    const id = await validated();
    const file = await exportRemittance(TENANT, id, 'user-1', NOW);

    expect(file.fileName).toBe('PRL-2026-0001.csv');
    expect(file.contentType).toBe('text/csv; charset=utf-8');
    const common = 'PRL-2026-0001;CI-EMET-001;Compte loyers;2026-10-26';
    expect(file.buffer.toString('utf8')).toBe(
      [
        '﻿' + head,
        `${common};PRL-2026-0001-001;MDT-2026-0001;2026-09-01;Awa Traoré;${IBAN};160000;XOF;LOYER 10/2026 BAIL-001`,
        `${common};PRL-2026-0001-002;MDT-2026-0002;2026-09-01;Titulaire 2;${IBAN};100000;XOF;LOYER 10/2026 BAIL-002`
      ].join('\r\n')
    );

    expect(state.remittances[0]).toMatchObject({
      status: 'EXPORTED',
      exportCount: 1,
      firstExportedAt: NOW,
      lastExportedAt: NOW,
      lastFileDigest: expectedDigest(file.buffer)
    });
    const auditCall = mockAudit.record.mock.calls.at(-1)?.[1];
    expect(auditCall).toMatchObject({
      actionKey: 'DIRECT_DEBIT_REMITTANCE_EXPORTED',
      tenantId: TENANT,
      payload: {
        reference: 'PRL-2026-0001',
        lineCount: 2,
        totalAmount: 260000,
        collectionDate: '2026-10-26',
        fileDigest: state.remittances[0].lastFileDigest,
        exportNumber: 1
      }
    });
    // L'audit ne porte jamais l'IBAN ni une adresse e-mail.
    expectNoLeak(mockAudit.record.mock.calls);
    expectNoLeak(await getRemittance(TENANT, id));
  });

  it('un second téléchargement garde le statut, ajoute 1 au compteur et reste identique', async () => {
    const id = await validated();
    const first = await exportRemittance(TENANT, id, 'user-1', NOW);
    // Un mandat suspendu après le premier export n'empêche pas de retélécharger le même fichier.
    state.mandates[1].status = 'SUSPENDED';
    const second = await exportRemittance(TENANT, id, 'user-1', new Date('2026-10-17T10:00:00Z'));
    expect(second.buffer.equals(first.buffer)).toBe(true);
    expect(state.remittances[0]).toMatchObject({ status: 'EXPORTED', exportCount: 2, firstExportedAt: NOW });
    expect(mockAudit.record.mock.calls.at(-1)?.[1].payload.exportNumber).toBe(2);
  });

  it('écrit l audit avant de rendre le fichier : un échec d audit bloque l envoi et ne change rien', async () => {
    const id = await validated();
    mockAudit.record.mockRejectedValueOnce(new Error('audit indisponible'));
    await expect(exportRemittance(TENANT, id, 'user-1', NOW)).rejects.toThrow('audit indisponible');
    expect(state.remittances[0]).toMatchObject({ status: 'VALIDATED', exportCount: 0, firstExportedAt: null });
    expect(state.remittances[0].lastFileDigest).toBeNull();
  });

  it('refuse le premier export si un mandat n est plus actif, en citant la référence', async () => {
    const id = await validated();
    state.mandates[1].status = 'REVOKED';
    const error = await exportRemittance(TENANT, id, 'user-1', NOW).catch(e => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.message).toContain('MDT-2026-0002');
    expect(state.remittances[0].status).toBe('VALIDATED');
    expect(mockAudit.record.mock.calls.map(call => call[1].actionKey)).not.toContain(
      'DIRECT_DEBIT_REMITTANCE_EXPORTED'
    );
  });

  it('neutralise une formule dans le titulaire et refuse une remise brouillon, annulée ou d une autre agence', async () => {
    const { remittance } = await create();
    await expect(exportRemittance(TENANT, remittance.id, 'user-1', NOW)).rejects.toBeInstanceOf(ConflictError);
    await validateRemittance(TENANT, remittance.id, 'user-1', NOW);
    state.mandates[0].holderName = '=CMD()';
    const file = await exportRemittance(TENANT, remittance.id, 'user-1', NOW);
    expect(file.buffer.toString('utf8')).toContain(";'=CMD();");
    await expect(exportRemittance(OTHER, remittance.id, 'user-x', NOW)).rejects.toBeInstanceOf(NotFoundError);
    await cancelRemittance(TENANT, remittance.id, 'erreur', 'user-1');
    await expect(exportRemittance(TENANT, remittance.id, 'user-1', NOW)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('remises / dépôt à la banque et annulation', () => {
  it('marque déposée une remise exportée, et seulement celle-là', async () => {
    const id = await validated();
    await expect(submitRemittance(TENANT, id, 'user-1', NOW)).rejects.toBeInstanceOf(ConflictError);
    await exportRemittance(TENANT, id, 'user-1', NOW);
    const dto = await submitRemittance(TENANT, id, 'user-1', NOW);
    expect(dto.status).toBe('SUBMITTED');
    expect(dto.submittedAt).toBe(NOW.toISOString());
    expect(state.remittances[0].submittedByUserId).toBe('user-1');
    expect(mockAudit.record.mock.calls.at(-1)?.[1].actionKey).toBe('DIRECT_DEBIT_REMITTANCE_SUBMITTED');
    // Une remise déposée ne s'annule pas en P2, mais le fichier reste téléchargeable.
    await expect(cancelRemittance(TENANT, id, 'trop tard', 'user-1')).rejects.toBeInstanceOf(ConflictError);
    const again = await exportRemittance(TENANT, id, 'user-1', NOW);
    expect(again.fileName).toBe('PRL-2026-0001.csv');
    expect(state.remittances[0].status).toBe('SUBMITTED');
    await expect(submitRemittance(OTHER, id, 'user-x', NOW)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('annule la remise, ses lignes et libère les échéances pour une nouvelle remise', async () => {
    const id = await validated();
    const dto = await cancelRemittance(TENANT, id, 'erreur de date', 'user-1', NOW);

    expect(dto.status).toBe('CANCELED');
    expect(dto.cancellationReason).toBe('erreur de date');
    expect(dto.canceledAt).toBe(NOW.toISOString());
    expect(dto.lineCount).toBe(0);
    expect(dto.totalAmount).toBe(0);
    expect(dto.lines.every(line => line.status === 'CANCELED')).toBe(true);
    expect(state.lines.every(line => line.activeKey === null)).toBe(true);
    expect(mockAudit.record.mock.calls.at(-1)?.[1]).toMatchObject({
      actionKey: 'DIRECT_DEBIT_REMITTANCE_CANCELED',
      payload: { reference: 'PRL-2026-0001', from: 'VALIDATED', to: 'CANCELED', reason: 'erreur de date' }
    });

    // Les échéances sont libres : une nouvelle remise les reprend.
    const next = await create();
    expect(next.remittance.reference).toBe('PRL-2026-0002');
    expect(next.remittance.lines).toHaveLength(2);
    await expect(cancelRemittance(TENANT, id, 'encore', 'user-1')).rejects.toBeInstanceOf(ConflictError);
  });

  it('annule aussi un brouillon et une remise exportée, jamais celle d une autre agence', async () => {
    const { remittance } = await create();
    await expect(cancelRemittance(OTHER, remittance.id, 'x', 'user-x')).rejects.toBeInstanceOf(NotFoundError);
    expect((await cancelRemittance(TENANT, remittance.id, 'brouillon abandonné', 'user-1')).status).toBe('CANCELED');

    const id = await validated();
    await exportRemittance(TENANT, id, 'user-1', NOW);
    expect((await cancelRemittance(TENANT, id, 'fichier non déposé', 'user-1')).status).toBe('CANCELED');
  });
});

describe('remises / liste et fuites', () => {
  it('liste les remises de l agence avec filtres, tri et pagination', async () => {
    const first = await create();
    await cancelRemittance(TENANT, first.remittance.id, 'test', 'user-1');
    const second = await create({ collectionDate: new Date('2026-10-30T00:00:00Z') });
    state.remittances.push({ ...state.remittances[0], id: 'rem-autre', tenantId: OTHER, sequence: 1 });

    const all = await listRemittances(TENANT, { page: 1, pageSize: 20 });
    expect(all.total).toBe(2);
    expect(all.items.map(item => item.reference)).toEqual(['PRL-2026-0002', 'PRL-2026-0001']);
    expect(all.items[0].collectionDate).toBe('2026-10-30');
    expect('lines' in all.items[0]).toBe(false);

    const canceled = await listRemittances(TENANT, { page: 1, pageSize: 20, status: 'CANCELED' });
    expect(canceled.items.map(item => item.id)).toEqual([first.remittance.id]);
    const byCreditor = await listRemittances(TENANT, { page: 1, pageSize: 1, creditorId: CREDITOR });
    expect(byCreditor).toMatchObject({ total: 2, page: 1, pageSize: 1 });
    expect(byCreditor.items).toHaveLength(1);
    expect(second.remittance.status).toBe('DRAFT');
    expect((await listRemittances(OTHER, { page: 1, pageSize: 20 })).items.map(item => item.id)).toEqual(['rem-autre']);
  });

  it('aucune réponse ni charge d audit ne contient l IBAN complet, le chiffré ou une adresse e-mail', async () => {
    const id = await validated();
    await exportRemittance(TENANT, id, 'user-1', NOW);
    await refreshRemittance(TENANT, id, 'user-1').catch(() => undefined);
    await submitRemittance(TENANT, id, 'user-1', NOW);
    expectNoLeak(await getRemittance(TENANT, id));
    expectNoLeak(await listRemittances(TENANT, { page: 1, pageSize: 20 }));
    expectNoLeak(mockAudit.record.mock.calls);
    expectNoLeak(mockAudit.log.mock.calls);
  });
});

describe('remises / date limite figée et contrôles de dates', () => {
  it('fige la date limite à la création, la recalcule à l actualisation puis à la validation, et ne bouge plus', async () => {
    const { remittance } = await create();
    expect(remittance.prenotificationDeadline).toBe('2026-10-19');

    // Le créancier change son délai : la remise garde sa date tant qu elle n est pas actualisée.
    state.creditors[0].prenotificationBusinessDays = 3;
    expect((await getRemittance(TENANT, remittance.id)).prenotificationDeadline).toBe('2026-10-19');
    const refreshed = await refreshRemittance(TENANT, remittance.id, 'user-1');
    expect(refreshed.remittance.prenotificationDeadline).toBe('2026-10-21');

    state.creditors[0].prenotificationBusinessDays = 4;
    const result = await validateRemittance(TENANT, remittance.id, 'user-1', NOW);
    await waitForRemittancePrenotifications();
    expect(result.remittance.prenotificationDeadline).toBe('2026-10-20');

    // Figée après validation, quel que soit le délai courant du créancier.
    state.creditors[0].prenotificationBusinessDays = 1;
    expect((await getRemittance(TENANT, remittance.id)).prenotificationDeadline).toBe('2026-10-20');
    expect(state.remittances[0].prenotificationDeadline.toISOString().slice(0, 10)).toBe('2026-10-20');
  });

  it('refuse la validation le jour du prélèvement ou après, même sans délai de prénotification', async () => {
    const { remittance } = await create();
    state.creditors[0].prenotificationBusinessDays = 0;
    const error = await validateRemittance(TENANT, remittance.id, 'user-1', new Date('2026-10-26T08:00:00Z')).catch(
      e => e
    );
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.message).toBe('La date de prélèvement est passée : annulez cette remise et préparez-en une nouvelle.');
    expect(state.remittances[0].status).toBe('DRAFT');
    // La veille, avec un délai nul, la validation passe.
    const ok = await validateRemittance(TENANT, remittance.id, 'user-1', new Date('2026-10-25T08:00:00Z'));
    expect(ok.remittance.status).toBe('VALIDATED');
    await waitForRemittancePrenotifications();
  });

  it('refuse le PREMIER export le jour du prélèvement ou après, mais pas un nouveau téléchargement', async () => {
    const id = await validated();
    const error = await exportRemittance(TENANT, id, 'user-1', new Date('2026-10-26T06:00:00Z')).catch(e => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.message).toBe('La date de prélèvement est passée : annulez cette remise et préparez-en une nouvelle.');
    expect(state.remittances[0]).toMatchObject({ status: 'VALIDATED', exportCount: 0 });
    expect(mockAudit.record.mock.calls.map(call => call[1].actionKey)).not.toContain(
      'DIRECT_DEBIT_REMITTANCE_EXPORTED'
    );

    await exportRemittance(TENANT, id, 'user-1', NOW);
    const again = await exportRemittance(TENANT, id, 'user-1', new Date('2026-10-27T06:00:00Z'));
    expect(again.fileName).toBe('PRL-2026-0001.csv');
    expect(state.remittances[0].exportCount).toBe(2);
  });

  it('utilise le vocabulaire de l écran dans les messages de statut', async () => {
    const { remittance } = await create();
    const draft = await exportRemittance(TENANT, remittance.id, 'user-1', NOW).catch(e => e);
    expect(draft.message).toBe('Transition impossible : la remise est au statut « brouillon ».');
    await cancelRemittance(TENANT, remittance.id, 'libère les échéances', 'user-1');
    const id = await validated();
    await exportRemittance(TENANT, id, 'user-1', NOW);
    const exported = await refreshRemittance(TENANT, id, 'user-1').catch(e => e);
    expect(exported.message).toBe('Transition impossible : la remise est au statut « fichier produit ».');
  });
});

describe('remises / messages de validation', () => {
  it('dit que le créancier est désactivé et comment s en sortir', async () => {
    const { remittance } = await create();
    state.creditors[0].isActive = false;
    const error = await validateRemittance(TENANT, remittance.id, 'user-1', NOW).catch(e => e);
    expect(error).toBeInstanceOf(BadRequestError);
    expect(error.message).toBe('Ce créancier est désactivé : réactivez-le ou annulez la remise.');
  });

  it('cite la référence du mandat qui n est plus prélevable', async () => {
    const { remittance } = await create();
    state.mandates[1].status = 'SUSPENDED';
    const error = await validateRemittance(TENANT, remittance.id, 'user-1', NOW).catch(e => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.message).toBe("Le mandat MDT-2026-0002 n'est plus prélevable : actualisez la remise.");
    state.mandates[1].status = 'ACTIVE';
    state.leases[0].status = 'ENDED';
    const ended = await validateRemittance(TENANT, remittance.id, 'user-1', NOW).catch(e => e);
    expect(ended.message).toBe("Le mandat MDT-2026-0001 n'est plus prélevable : actualisez la remise.");
  });

  it('donne le même message juste à l actualisation quand l échéance est prise ailleurs', async () => {
    const { remittance } = await create();
    state.leases[2].status = 'ACTIVE';
    state.failLineCreate = uniqueError(['tenant_id', 'active_key']);
    const error = await refreshRemittance(TENANT, remittance.id, 'user-1').catch(e => e);
    expect(error.message).toBe('Une échéance figure déjà dans une autre remise : actualisez puis réessayez.');
  });
});

describe('remises / statut du mandat sur chaque ligne', () => {
  it('renvoie le statut courant du mandat, y compris quand il n est plus actif', async () => {
    const id = await validated();
    await exportRemittance(TENANT, id, 'user-1', NOW);
    expect((await getRemittance(TENANT, id)).lines.map(line => line.mandate.status)).toEqual(['ACTIVE', 'ACTIVE']);
    state.mandates[1].status = 'SUSPENDED';
    expect((await getRemittance(TENANT, id)).lines.map(line => line.mandate.status)).toEqual(['ACTIVE', 'SUSPENDED']);
  });
});

describe('remises / garde updatedAt à l export', () => {
  /** Modifie la remise juste APRÈS la lecture de l export, avant son écriture. */
  function changeAfterRead(change: () => void) {
    const original = mockDb.directDebitRemittance.findFirst.getMockImplementation() as (args: Row) => Promise<Row>;
    mockDb.directDebitRemittance.findFirst.mockImplementationOnce(async (args: Row) => {
      const row = await original(args);
      change();
      return row;
    });
  }

  it('premier export : une ligne retirée ou un statut changé entre la lecture et l écriture donne 409 sans rien rendre', async () => {
    const id = await validated();
    changeAfterRead(() => {
      state.lines[0].status = 'CANCELED';
      state.lines[0].activeKey = null;
      state.remittances[0].updatedAt = new Date('2026-10-16T10:00:00Z');
    });
    const error = await exportRemittance(TENANT, id, 'user-1', NOW).catch(e => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.message).toBe("La remise vient d'être modifiée : rechargez la page.");
    expect(state.remittances[0]).toMatchObject({ status: 'VALIDATED', exportCount: 0, lastFileDigest: null });
    expect(mockAudit.record.mock.calls.map(call => call[1].actionKey)).not.toContain(
      'DIRECT_DEBIT_REMITTANCE_EXPORTED'
    );

    resetState();
    const other = await validated();
    changeAfterRead(() => {
      state.remittances[0].status = 'CANCELED';
    });
    await expect(exportRemittance(TENANT, other, 'user-1', NOW)).rejects.toBeInstanceOf(ConflictError);
    expect(state.remittances[0].exportCount).toBe(0);
  });

  it('un nouveau téléchargement ne tombe pas en 409 à cause d un téléchargement simultané', async () => {
    const id = await validated();
    await exportRemittance(TENANT, id, 'user-1', NOW);
    changeAfterRead(() => {
      // Un autre téléchargement a touché la remise entre-temps.
      state.remittances[0].updatedAt = new Date('2026-10-16T11:00:00Z');
    });
    const file = await exportRemittance(TENANT, id, 'user-1', new Date('2026-10-17T09:00:00Z'));
    expect(file.fileName).toBe('PRL-2026-0001.csv');
    expect(state.remittances[0]).toMatchObject({ status: 'EXPORTED', exportCount: 2 });
  });
});

describe('remises / empreinte du fichier', () => {
  it('est un HMAC à clé dérivée, pas le SHA-256 du fichier', async () => {
    const id = await validated();
    const file = await exportRemittance(TENANT, id, 'user-1', NOW);
    const digest = state.remittances[0].lastFileDigest;
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).toBe(expectedDigest(file.buffer));
    expect(digest).not.toBe(createHash('sha256').update(file.buffer).digest('hex'));
    expect(JSON.stringify(mockAudit.record.mock.calls)).not.toContain('Sha256');
  });

  it('refuse l export sans clé de chiffrement courante, avant tout déchiffrement', async () => {
    const id = await validated();
    const key = mockEnv.DIRECT_DEBIT_IBAN_KEY;
    mockEnv.DIRECT_DEBIT_IBAN_KEY = undefined;
    try {
      const error = await exportRemittance(TENANT, id, 'user-1', NOW).catch(e => e);
      expect(error).toBeInstanceOf(BadRequestError);
      expect(error.message).toBe("Le chiffrement des coordonnées bancaires n'est pas configuré sur ce serveur.");
    } finally {
      mockEnv.DIRECT_DEBIT_IBAN_KEY = key;
    }
    expect(state.remittances[0]).toMatchObject({ status: 'VALIDATED', exportCount: 0, lastFileDigest: null });
  });
});

describe('remises / écritures en lot et transactions longues', () => {
  const OPTIONS = { maxWait: 10_000, timeout: 30_000 };

  it('crée toutes les lignes en un seul createMany, dans une transaction aux délais élargis', async () => {
    const { remittance } = await create();
    expect(mockDb.directDebitRemittanceLine.createMany).toHaveBeenCalledTimes(1);
    expect(mockDb.directDebitRemittanceLine.createMany.mock.calls[0][0].data).toHaveLength(2);
    expect(mockDb.$transaction).toHaveBeenCalledWith(expect.any(Function), OPTIONS);

    mockDb.$transaction.mockClear();
    await refreshRemittance(TENANT, remittance.id, 'user-1');
    expect(mockDb.$transaction).toHaveBeenCalledWith(expect.any(Function), OPTIONS);

    mockDb.$transaction.mockClear();
    await validateRemittance(TENANT, remittance.id, 'user-1', NOW);
    await waitForRemittancePrenotifications();
    expect(mockDb.$transaction).toHaveBeenCalledWith(expect.any(Function), OPTIONS);
  });
});

describe('remises / mandats non actifs', () => {
  const addInactiveMandates = () => {
    const extra = (n: number, status: string) => {
      state.leases.push({ id: `lease-${n}`, tenant_id: TENANT, lease_number: `BAIL-00${n}`, status: 'ACTIVE' });
      state.debtors.push({ id: `client-${n}`, fullName: `Débiteur ${n}`, email: null });
      state.installments.push({
        id: `inst-${n}`,
        tenant_id: TENANT,
        lease_id: `lease-${n}`,
        period_year: 2026,
        period_month: 10,
        due_date: new Date('2026-10-05T00:00:00Z'),
        status: 'DUE',
        amount_rent: 90000,
        amount_service: 0,
        amount_other_fees: 0,
        penalty_amount: 0,
        amount_paid: 0
      });
      state.mandates.push({
        ...state.mandates[0],
        id: `mandate-${n}`,
        sequence: n,
        leaseId: `lease-${n}`,
        debtorClientId: `client-${n}`,
        holderName: `Titulaire ${n}`,
        status
      });
    };
    extra(6, 'SUSPENDED');
    extra(7, 'DRAFT');
    extra(8, 'REVOKED');
  };

  it('signale les mandats brouillon et suspendus (jamais révoqués) sans en faire des lignes', async () => {
    addInactiveMandates();
    const { remittance, skipped } = await create();

    expect(remittance.lines.map(line => line.mandate.reference)).toEqual(['MDT-2026-0001', 'MDT-2026-0002']);
    const inactive = skipped.filter(entry => entry.reason === 'MANDATE_NOT_ACTIVE');
    expect(inactive.map(entry => entry.mandateReference)).toEqual(['MDT-2026-0006', 'MDT-2026-0007']);
    expect(skipped.some(entry => entry.mandateReference === 'MDT-2026-0008')).toBe(false);
    expect(state.lines.some(line => ['mandate-6', 'mandate-7', 'mandate-8'].includes(line.mandateId))).toBe(false);
  });

  it('la lecture d un brouillon renvoie les mandats non retenus, pas celle d une remise validée', async () => {
    addInactiveMandates();
    const { remittance } = await create();

    const draft = await getRemittance(TENANT, remittance.id);
    expect(draft.skipped?.map(entry => entry.mandateReference)).toEqual(
      expect.arrayContaining(['MDT-2026-0006', 'MDT-2026-0007', 'MDT-2026-0003'])
    );
    // Les mandats qui ont déjà une ligne ne sont pas « non retenus ».
    expect(draft.skipped?.some(entry => entry.mandateReference === 'MDT-2026-0001')).toBe(false);

    state.mandates = state.mandates.filter(row => row.status === 'ACTIVE');
    await validateRemittance(TENANT, remittance.id, 'user-1', NOW);
    await waitForRemittancePrenotifications();
    expect((await getRemittance(TENANT, remittance.id)).skipped).toBeUndefined();
  });
});

describe('remises / destinataire de l avis', () => {
  it('affiche l adresse prévue masquée des lignes PENDING, jamais l adresse complète', async () => {
    const { remittance } = await create();
    const read = await getRemittance(TENANT, remittance.id);

    expect(read.lines[0].prenotificationRecipient).toEqual({ masked: 'a•••@ex•••.test', source: 'ACCOUNT' });
    expect(read.lines[1].prenotificationRecipient).toBeNull();
    expect(read.prenotificationSummary.recipients).toEqual({ account: 1, contact: 0, none: 1 });
    expect(JSON.stringify(read)).not.toContain('awa@example.test');
  });

  it('reprend les valeurs gardées à l envoi, même si l adresse a changé depuis', async () => {
    const { remittance } = await create();
    state.lines[0].prenotificationStatus = 'SENT';
    state.lines[0].prenotificationRecipientMasked = 'z•••@ma•••.ci';
    state.lines[0].prenotificationRecipientSource = 'CONTACT';
    const read = await getRemittance(TENANT, remittance.id);

    expect(read.lines[0].prenotificationRecipient).toEqual({ masked: 'z•••@ma•••.ci', source: 'CONTACT' });
    expect(read.prenotificationSummary.recipients).toEqual({ account: 0, contact: 1, none: 1 });
  });

  it('une ligne annulée n a pas de destinataire', async () => {
    const { remittance } = await create();
    state.lines[1].status = 'CANCELED';
    const read = await getRemittance(TENANT, remittance.id);

    expect(read.lines[1].prenotificationRecipient).toBeNull();
    expect(read.prenotificationSummary.recipients.none).toBe(0);
  });
});
