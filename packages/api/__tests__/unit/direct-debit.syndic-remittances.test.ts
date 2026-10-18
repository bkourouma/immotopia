/**
 * Remises de prélèvement des copropriétés : service (spec 042, P4, data-model §9).
 *
 * Prisma est remplacé par un magasin en mémoire qui applique les filtres
 * d'agence, de périmètre et de syndicat, l'unicité (tenantId, activeKey) et la
 * restauration de l'état quand une transaction échoue.
 */

const IBAN = 'CI93CI0080111301134291200589';
const TENANT = 'tenant-a';
const OTHER = 'tenant-b';
const SYN = '11111111-1111-4111-8111-111111111111';
const SYN_X = '11111111-1111-4111-8111-999999999999';
const CR = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-10-16T09:00:00Z'); // vendredi
// Date de collecte utilisée : lundi 26/10/2026 ; date limite de prénotification : 19/10.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

interface State {
  syndicates: Row[];
  creditors: Row[];
  lots: Row[];
  contacts: Row[];
  mandates: Row[];
  calls: Row[];
  allocations: Row[];
  remittances: Row[];
  lines: Row[];
}
const empty = (): State => ({
  syndicates: [],
  creditors: [],
  lots: [],
  contacts: [],
  mandates: [],
  calls: [],
  allocations: [],
  remittances: [],
  lines: []
});
const state: State = empty();
let counter = 0;

const mockAudit = { record: jest.fn(), log: jest.fn() };
const mockMail = {
  syndic: jest.fn(),
  rental: jest.fn(),
  config: jest.fn()
};

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

const contactBrief = (id: string | null | undefined) => {
  const contact = state.contacts.find(entry => entry.id === id);
  return contact
    ? {
        id: contact.id,
        contactType: contact.contactType ?? 'PERSON',
        firstName: contact.firstName ?? null,
        lastName: contact.lastName ?? null,
        legalName: contact.legalName ?? null,
        email: contact.email ?? null
      }
    : null;
};
const lotBrief = (id: string | null | undefined) => {
  const lot = state.lots.find(entry => entry.id === id);
  return lot ? { id: lot.id, lotNumber: lot.lotNumber } : null;
};

function lineView(line: Row): Row {
  return {
    ...line,
    chargeCallIds: line.chargeCallIds ?? [],
    mandate: state.mandates.find(entry => entry.id === line.mandateId),
    debtor: null,
    debtorContact: contactBrief(line.debtorContactId),
    lot: lotBrief(line.lotId),
    lease: null,
    installment: null
  };
}

function remittanceView(row: Row, select?: Row): Row {
  const linesSelect = select?.lines;
  const lines = state.lines
    .filter(line => line.remittanceId === row.id && matches(line, linesSelect?.where))
    .sort((a, b) => a.lineNumber - b.lineNumber)
    .map(lineView);
  const syndicate = state.syndicates.find(entry => entry.id === row.syndicateId);
  return {
    ...row,
    creditor: state.creditors.find(entry => entry.id === row.creditorId),
    tenant: { name: 'Agence Test' },
    syndicate: syndicate ? { id: syndicate.id, name: syndicate.name } : null,
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

const mockDb: Row = {
  $transaction: jest.fn(async (fn: (tx: Row) => unknown) => {
    const before = structuredClone(state);
    try {
      return await fn(mockDb);
    } catch (error) {
      Object.assign(state, before);
      throw error;
    }
  }),
  syndicate: {
    findFirst: jest.fn(async ({ where }: Row) => state.syndicates.find(row => matches(row, where)) ?? null)
  },
  directDebitCreditor: {
    findFirst: jest.fn(async ({ where }: Row) => state.creditors.find(row => matches(row, where)) ?? null)
  },
  directDebitMandate: {
    findMany: jest.fn(async ({ where }: Row) =>
      state.mandates
        .filter(row => matches(row, where))
        .map(row => ({ ...row, lot: lotBrief(row.lotId), debtorContact: contactBrief(row.debtorContactId) }))
    )
  },
  chargeCall: {
    findMany: jest.fn(async ({ where }: Row) => {
      // Sélection : appels des lots ; affichage : appels figés sur les lignes.
      if (where.lotId) {
        return state.calls.filter(
          call => where.lotId.in.includes(call.lotId) && call.syndicateId === where.syndicateId && call.amount > 0
        );
      }
      return state.calls.filter(call => where.id.in.includes(call.id));
    })
  },
  chargePaymentAllocation: {
    findMany: jest.fn(async ({ where }: Row) =>
      state.allocations.filter(allocation => where.chargeCallId.in.includes(allocation.chargeCallId))
    )
  },
  crmContact: {
    findMany: jest.fn(async ({ where }: Row) =>
      state.contacts.filter(row => where.id.in.includes(row.id) && row.tenantId === where.tenantId)
    )
  },
  tenantClient: { findMany: jest.fn(async () => []) },
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
        .slice(skip, skip + take)
        .map(row => remittanceView(row))
    ),
    create: jest.fn(async ({ data }: Row) => {
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
    createMany: jest.fn(async ({ data }: { data: Row[] }) => {
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
          prenotificationRecipientMasked: null,
          prenotificationRecipientSource: null,
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
  emailService: {
    sendSyndicDirectDebitPrenotification: (...args: unknown[]) => mockMail.syndic(...args),
    sendDirectDebitPrenotification: (...args: unknown[]) => mockMail.rental(...args)
  }
}));
jest.mock('../../src/services/email-notification-config-service', () => ({
  getEmailNotificationConfig: (...args: unknown[]) => mockMail.config(...args)
}));
jest.mock('../../src/lib/direct-debit/iban-crypto', () => ({
  isIbanEncryptionAvailable: () => true,
  encryptIban: (plain: string) => `ddk1:key:iv:tag:${Buffer.from(plain).toString('base64')}`,
  decryptIban: (enc: string) => Buffer.from(enc.split(':')[4], 'base64').toString()
}));

import { BadRequestError, ConflictError, NotFoundError } from '../../src/middleware/error-middleware';
import {
  cancelRemittance,
  cancelRemittanceLine,
  exportRemittance,
  getRemittance,
  listRemittances,
  refreshRemittance,
  resendPrenotifications,
  validateRemittance
} from '../../src/lib/direct-debit/remittances';
import { createSyndicRemittance } from '../../src/lib/direct-debit/syndic/remittances';
import { createSyndicRemittanceSchema } from '../../src/lib/direct-debit/syndic/schemas';
import { syndicCtx } from '../../src/lib/direct-debit/syndic/scope';
import { waitForSyndicRemittancePrenotifications } from '../../src/lib/direct-debit/syndic/prenotification';

const CTX = syndicCtx(SYN);
const enc = (iban: string) => `ddk1:key:iv:tag:${Buffer.from(iban).toString('base64')}`;
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const lastCall = (fn: jest.Mock): any[] => fn.mock.calls[fn.mock.calls.length - 1];

function resetState() {
  counter = 0;
  Object.assign(state, empty());
  state.syndicates = [
    { id: SYN, tenantId: TENANT, name: 'Résidence Les Palmiers' },
    { id: SYN_X, tenantId: OTHER, name: 'Résidence étrangère' }
  ];
  state.creditors = [
    {
      id: CR,
      tenantId: TENANT,
      scope: 'SYNDIC_LOT',
      syndicateId: SYN,
      label: 'Compte du syndicat',
      creditorIdentifier: 'CI-SYN-001',
      isActive: true,
      collectionDay: 5,
      prenotificationBusinessDays: 5,
      fileFormat: 'GENERIC_CSV'
    }
  ];
  state.lots = [
    { id: 'lot-1', syndicateId: SYN, lotNumber: 'A12' },
    { id: 'lot-2', syndicateId: SYN, lotNumber: 'B03' },
    { id: 'lot-3', syndicateId: SYN, lotNumber: 'C01' },
    { id: 'lot-4', syndicateId: SYN, lotNumber: 'D07' }
  ];
  state.contacts = [
    { id: 'ct-1', tenantId: TENANT, firstName: 'Awa', lastName: 'Traoré', email: 'awa.traore@example.ci' },
    { id: 'ct-2', tenantId: TENANT, firstName: 'Koffi', lastName: 'Yao', email: null },
    { id: 'ct-3', tenantId: TENANT, contactType: 'COMPANY', legalName: 'SCI Soleil', email: 'sci@example.ci' },
    { id: 'ct-4', tenantId: TENANT, firstName: 'Nina', lastName: 'Diallo', email: 'nina@example.ci' }
  ];
  const mandate = (n: number, over: Row = {}) => ({
    id: `mandate-${n}`,
    tenantId: TENANT,
    scope: 'SYNDIC_LOT',
    syndicateId: SYN,
    creditorId: CR,
    status: 'ACTIVE',
    year: 2026,
    sequence: n,
    lotId: `lot-${n}`,
    debtorContactId: `ct-${n}`,
    maxAmount: null,
    collectionDay: null,
    holderName: `Titulaire ${n}`,
    ibanEncrypted: enc(IBAN),
    ibanLast4: '0589',
    signedAt: day('2026-09-01'),
    ...over
  });
  state.mandates = [mandate(1), mandate(2, { maxAmount: 30000 }), mandate(3), mandate(4, { status: 'DRAFT' })];
  const call = (id: string, lotId: string, amount: number, due: string) => ({
    id,
    lotId,
    syndicateId: SYN,
    amount,
    dueDate: day(due),
    createdAt: day('2026-09-01'),
    period: due.slice(0, 7)
  });
  state.calls = [
    call('c1', 'lot-1', 50000, '2026-10-01'),
    call('c2', 'lot-1', 50000, '2026-10-15'),
    call('c-futur', 'lot-1', 50000, '2026-12-01'),
    call('c3', 'lot-2', 80000, '2026-10-05'),
    call('c4', 'lot-3', 20000, '2026-10-01'),
    call('c5', 'lot-4', 10000, '2026-10-01')
  ];
  // c1 : 10 000 déjà imputés (avance comprise) ; c4 : soldé.
  state.allocations = [
    { chargeCallId: 'c1', amount: 10000 },
    { chargeCallId: 'c4', amount: 20000 }
  ];
}

/** Ni l'IBAN complet, ni le texte chiffré, ni une adresse e-mail n'apparaissent. */
function expectNoLeak(value: unknown) {
  const text = JSON.stringify(value);
  expect(text).not.toContain(IBAN);
  expect(text).not.toContain('0080111301134291200589');
  expect(text).not.toContain('ibanEncrypted');
  expect(text).not.toContain('ddk1:');
  expect(text).not.toMatch(/@example\.ci/);
}

const create = (over: Row = {}) =>
  createSyndicRemittance(
    TENANT,
    SYN,
    createSyndicRemittanceSchema.parse({ collectionDate: '2026-10-26', ...over }),
    'user-1',
    NOW
  );
const validated = async () => {
  const { remittance } = await create();
  await validateRemittance(TENANT, remittance.id, 'user-1', NOW, CTX);
  await waitForSyndicRemittancePrenotifications();
  return remittance.id as string;
};

beforeEach(() => {
  jest.clearAllMocks();
  resetState();
  mockMail.config.mockResolvedValue({ enabled: true, subjectOverride: null, bodyHtmlOverride: null });
  mockMail.syndic.mockResolvedValue(undefined);
});

describe('syndic / préparation d une remise', () => {
  it('crée un brouillon du syndicat : une ligne par lot dû, appels figés, plafond, clé vivante par lot', async () => {
    const { remittance, skipped } = await create();

    expect(remittance).toMatchObject({
      reference: 'PRL-2026-0001',
      scope: 'SYNDIC_LOT',
      syndicate: { id: SYN, name: 'Résidence Les Palmiers' },
      status: 'DRAFT',
      lineCount: 2,
      totalAmount: 120000
    });
    const [first, second] = remittance.lines;
    expect(first).toMatchObject({
      lineNumber: 1,
      amount: 90000,
      remainingDueAtSelection: 90000,
      capped: false,
      lease: null,
      installment: null,
      lot: { id: 'lot-1', lotNumber: 'A12' },
      debtor: { id: 'ct-1', displayName: 'Awa Traoré', kind: 'CONTACT' },
      paymentId: null
    });
    // Appels couverts, plus ancien d abord, avec l échéance et le montant de chaque appel.
    expect(first.chargeCalls.map(entry => entry.id)).toEqual(['c1', 'c2']);
    expect(first.chargeCalls[0]).toMatchObject({ dueDate: '2026-10-01', amount: 50000 });
    expect(second).toMatchObject({ amount: 30000, remainingDueAtSelection: 80000, capped: true });

    const stored = state.lines.map(line => ({
      lotId: line.lotId,
      debtorContactId: line.debtorContactId,
      chargeCallIds: line.chargeCallIds,
      activeKey: line.activeKey
    }));
    expect(stored).toEqual([
      { lotId: 'lot-1', debtorContactId: 'ct-1', chargeCallIds: ['c1', 'c2'], activeKey: 'lot:lot-1' },
      { lotId: 'lot-2', debtorContactId: 'ct-2', chargeCallIds: ['c3'], activeKey: 'lot:lot-2' }
    ]);
    expect(state.lines[0].leaseId).toBeUndefined();
    expect(state.lines[0].installmentId).toBeUndefined();
    expect(state.remittances[0]).toMatchObject({ scope: 'SYNDIC_LOT', syndicateId: SYN, creditorId: CR });

    // Mandats écartés : lot soldé (NOTHING_DUE) et mandat en brouillon (MANDATE_NOT_ACTIVE).
    expect(skipped).toEqual([
      expect.objectContaining({ reason: 'NOTHING_DUE', lotNumber: 'C01', debtorName: 'SCI Soleil', leaseNumber: null }),
      expect.objectContaining({ reason: 'MANDATE_NOT_ACTIVE', lotNumber: 'D07' })
    ]);
    expect(mockAudit.record.mock.calls[0][1]).toMatchObject({
      actionKey: 'DIRECT_DEBIT_REMITTANCE_CREATED',
      payload: expect.objectContaining({ scope: 'SYNDIC_LOT', syndicateId: SYN, lineCount: 2, totalAmount: 120000 })
    });
    expectNoLeak(remittance);
  });

  it('un lot déjà dans une remise vivante n est pas repris (ALREADY_IN_REMITTANCE)', async () => {
    await create();
    state.mandates = state.mandates.filter(m => ['mandate-1', 'mandate-2'].includes(m.id));
    // Les deux lots sont déjà pris : rien à prélever, et rien n est écrit.
    await expect(create()).rejects.toBeInstanceOf(BadRequestError);
    expect(state.remittances).toHaveLength(1);
    expect(state.lines).toHaveLength(2);
  });

  it('refuse une préparation sans créancier, sur un syndicat étranger, ou sans rien à prélever', async () => {
    state.creditors = [];
    await expect(create()).rejects.toBeInstanceOf(BadRequestError);
    resetState();
    await expect(
      createSyndicRemittance(
        TENANT,
        SYN_X,
        createSyndicRemittanceSchema.parse({ collectionDate: '2026-10-26' }),
        'u',
        NOW
      )
    ).rejects.toBeInstanceOf(NotFoundError);
    state.allocations.push(
      { chargeCallId: 'c1', amount: 40000 },
      { chargeCallId: 'c2', amount: 50000 },
      { chargeCallId: 'c3', amount: 80000 }
    );
    await expect(create()).rejects.toBeInstanceOf(BadRequestError);
    expect(state.remittances).toHaveLength(0);
  });

  it('le jour de collecte propre au mandat et celui du créancier décalent le lot (COLLECTION_DAY_LATER)', async () => {
    state.mandates[0].collectionDay = 28;
    const { remittance, skipped } = await create();
    expect(remittance.lines.map(line => line.lot?.lotNumber)).toEqual(['B03']);
    expect(skipped.some(entry => entry.reason === 'COLLECTION_DAY_LATER' && entry.lotNumber === 'A12')).toBe(true);
  });

  it('le corps refuse un créancier choisi par l appelant et un champ inconnu', () => {
    expect(createSyndicRemittanceSchema.safeParse({ collectionDate: '2026-10-26', creditorId: CR }).success).toBe(
      false
    );
    expect(createSyndicRemittanceSchema.safeParse({ collectionDate: '2026-02-30' }).success).toBe(false);
  });

  it('étanchéité : une remise de copropriété est introuvable côté locatif ou depuis un autre syndicat, et inversement', async () => {
    const { remittance } = await create();
    await expect(getRemittance(TENANT, remittance.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getRemittance(TENANT, remittance.id, syndicCtx(SYN_X))).rejects.toBeInstanceOf(NotFoundError);
    await expect(getRemittance(OTHER, remittance.id, CTX)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getRemittance(TENANT, remittance.id, CTX)).resolves.toMatchObject({ id: remittance.id });
    await expect(exportRemittance(TENANT, remittance.id, 'u', NOW)).rejects.toBeInstanceOf(NotFoundError);
    await expect(validateRemittance(TENANT, remittance.id, 'u', NOW)).rejects.toBeInstanceOf(NotFoundError);
    await expect(cancelRemittance(TENANT, remittance.id, 'x', 'u', NOW)).rejects.toBeInstanceOf(NotFoundError);
    await expect(refreshRemittance(TENANT, remittance.id, 'u')).rejects.toBeInstanceOf(NotFoundError);

    expect((await listRemittances(TENANT, { page: 1, pageSize: 20 })).total).toBe(0);
    expect((await listRemittances(TENANT, { page: 1, pageSize: 20 }, CTX)).items.map(item => item.id)).toEqual([
      remittance.id
    ]);
    expect((await listRemittances(TENANT, { page: 1, pageSize: 20 }, syndicCtx(SYN_X))).total).toBe(0);
    // Un brouillon d une autre agence ne fuit pas non plus.
    state.remittances.push({ ...state.remittances[0], id: 'rem-autre', tenantId: OTHER, sequence: 1 });
    expect((await listRemittances(TENANT, { page: 1, pageSize: 20 }, CTX)).total).toBe(1);
  });

  it('actualise : un règlement entre-temps réduit la ligne, un lot soldé est retiré, un nouvel appel échu est repris', async () => {
    const { remittance } = await create();
    // c2 est réglé, c1 aussi à moitié : il reste 20 000 sur le lot 1.
    state.allocations.push({ chargeCallId: 'c2', amount: 50000 }, { chargeCallId: 'c1', amount: 20000 });
    // Le lot 2 est entièrement soldé.
    state.allocations.push({ chargeCallId: 'c3', amount: 80000 });

    const refreshed = await refreshRemittance(TENANT, remittance.id, 'user-1', CTX);
    const [one, two] = refreshed.remittance.lines;
    expect(one).toMatchObject({ status: 'PENDING', amount: 20000, remainingDueAtSelection: 20000 });
    expect(one.chargeCalls.map(entry => entry.id)).toEqual(['c1']);
    expect(two).toMatchObject({ status: 'CANCELED', cancellationReason: expect.stringContaining('Plus rien') });
    expect(refreshed.remittance).toMatchObject({ lineCount: 1, totalAmount: 20000 });
    // La clé vivante du lot soldé est libérée.
    expect(state.lines[1].activeKey).toBeNull();
    expect(lastCall(mockAudit.record)[1].payload).toMatchObject({ scope: 'SYNDIC_LOT', syndicateId: SYN, canceled: 1 });
  });

  it('retire une ligne puis annule la remise : les lots redeviennent prélevables', async () => {
    const { remittance } = await create();
    const lineId = remittance.lines[0].id;
    const afterCancel = await cancelRemittanceLine(TENANT, remittance.id, lineId, 'Contestation', 'user-1', CTX);
    expect(afterCancel.lines[0]).toMatchObject({ status: 'CANCELED' });
    expect(state.lines[0].activeKey).toBeNull();

    const canceled = await cancelRemittance(TENANT, remittance.id, 'Erreur', 'user-1', NOW, CTX);
    expect(canceled.status).toBe('CANCELED');
    expect(state.lines.every(line => line.activeKey === null)).toBe(true);
    const next = await create();
    expect(next.remittance.lineCount).toBe(2);
  });
});

describe('syndic / validation et avis de prélèvement', () => {
  it('valide, fige le créancier et envoie l avis au contact débiteur ; jamais par le circuit locatif', async () => {
    const id = await validated();
    const remittance = await getRemittance(TENANT, id, CTX);

    expect(remittance).toMatchObject({
      status: 'VALIDATED',
      creditor: { label: 'Compte du syndicat', creditorIdentifier: 'CI-SYN-001' }
    });
    expect(mockMail.rental).not.toHaveBeenCalled();
    expect(mockMail.syndic).toHaveBeenCalledTimes(1); // ct-2 n a pas d adresse
    const [to, vars, options] = mockMail.syndic.mock.calls[0];
    expect(to).toBe('awa.traore@example.ci');
    expect(vars).toEqual({
      debtorName: 'Awa Traoré',
      agencyName: 'Agence Test',
      syndicateName: 'Résidence Les Palmiers',
      lotNumber: 'A12',
      amount: expect.stringContaining('90'),
      collectionDate: '26/10/2026',
      ibanMasked: expect.stringContaining('0589'),
      mandateReference: 'MDT-2026-0001',
      creditorIdentifier: 'CI-SYN-001'
    });
    expect(options).toMatchObject({ tenantId: TENANT });
    expect(mockMail.config).toHaveBeenCalledWith(TENANT, 'SYNDIC_DIRECT_DEBIT_PRENOTIFICATION');
    // Message et réponse : l IBAN masqué seulement.
    expect(JSON.stringify(vars)).not.toContain(IBAN);

    expect(remittance.lines.map(line => line.prenotificationStatus)).toEqual(['SENT', 'NO_EMAIL']);
    // Adresse masquée et source CONTACT gardées sur la ligne envoyée ; l adresse complète nulle part.
    expect(state.lines[0]).toMatchObject({
      prenotificationRecipientMasked: 'a•••@ex•••.ci',
      prenotificationRecipientSource: 'CONTACT'
    });
    expect(state.lines[1].prenotificationRecipientMasked).toBeNull();
    expect(remittance.lines[0].prenotificationRecipient).toEqual({ masked: 'a•••@ex•••.ci', source: 'CONTACT' });
    expect(remittance.prenotificationSummary).toMatchObject({
      sent: 1,
      noEmail: 1,
      recipients: { contact: 1, none: 1 }
    });
    expectNoLeak(remittance);
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKey: 'DIRECT_DEBIT_REMITTANCE_PRENOTIFIED',
        payload: expect.objectContaining({ scope: 'SYNDIC_LOT', syndicateId: SYN, sent: 1, noEmail: 1 })
      })
    );
  });

  it('avant l envoi, une ligne PENDING affiche l adresse prévue masquée du contact', async () => {
    const { remittance } = await create();
    expect(remittance.lines[0].prenotificationRecipient).toEqual({ masked: 'a•••@ex•••.ci', source: 'CONTACT' });
    expect(remittance.lines[1].prenotificationRecipient).toBeNull();
    expectNoLeak(remittance);
  });

  it('notification désactivée par l agence : DISABLED ; échec d envoi : FAILED et ligne rejouable au renvoi', async () => {
    mockMail.config.mockResolvedValue({ enabled: false, subjectOverride: null, bodyHtmlOverride: null });
    const id = await validated();
    expect(mockMail.syndic).not.toHaveBeenCalled();
    expect((await getRemittance(TENANT, id, CTX)).lines.map(line => line.prenotificationStatus)).toEqual([
      'DISABLED',
      'DISABLED'
    ]);

    mockMail.config.mockResolvedValue({ enabled: true, subjectOverride: null, bodyHtmlOverride: null });
    mockMail.syndic.mockRejectedValueOnce(new Error('SMTP indisponible pour awa.traore@example.ci'));
    await resendPrenotifications(TENANT, id, 'user-1', NOW, CTX);
    await waitForSyndicRemittancePrenotifications();
    const after = await getRemittance(TENANT, id, CTX);
    expect(after.lines.map(line => line.prenotificationStatus)).toEqual(['FAILED', 'NO_EMAIL']);
    // Adresse masquée gardée pour la ligne en échec : l opérateur voit où l avis devait partir.
    expect(state.lines[0].prenotificationRecipientMasked).toBe('a•••@ex•••.ci');

    await resendPrenotifications(TENANT, id, 'user-1', NOW, CTX);
    await waitForSyndicRemittancePrenotifications();
    expect((await getRemittance(TENANT, id, CTX)).lines[0].prenotificationStatus).toBe('SENT');
    // Un renvoi ne réexpédie pas ce qui est parti.
    mockMail.syndic.mockClear();
    await resendPrenotifications(TENANT, id, 'user-1', NOW, CTX);
    await waitForSyndicRemittancePrenotifications();
    expect(mockMail.syndic).not.toHaveBeenCalled();
  });

  it('refuse la validation si l ensemble des appels couverts a changé depuis la préparation (409)', async () => {
    const { remittance } = await create();
    // Un appel est remplacé par un autre, de même montant : montant et reste dû inchangés, ensemble différent.
    state.calls = state.calls.map(call => (call.id === 'c2' ? { ...call, id: 'c2-bis' } : call));
    await expect(validateRemittance(TENANT, remittance.id, 'user-1', NOW, CTX)).rejects.toBeInstanceOf(ConflictError);
    await expect(validateRemittance(TENANT, remittance.id, 'user-1', NOW, CTX)).rejects.toThrow(/montants ont changé/);
    expect(state.remittances[0].status).toBe('DRAFT');
    expect(mockMail.syndic).not.toHaveBeenCalled();
  });

  it('refuse aussi un montant changé, puis valide après actualisation', async () => {
    const { remittance } = await create();
    state.allocations.push({ chargeCallId: 'c2', amount: 10000 });
    await expect(validateRemittance(TENANT, remittance.id, 'user-1', NOW, CTX)).rejects.toThrow(/montants ont changé/);
    await refreshRemittance(TENANT, remittance.id, 'user-1', CTX);
    await expect(validateRemittance(TENANT, remittance.id, 'user-1', NOW, CTX)).resolves.toMatchObject({
      remittance: { status: 'VALIDATED' }
    });
    await waitForSyndicRemittancePrenotifications();
  });

  it('refuse un mandat devenu inactif depuis la préparation', async () => {
    const { remittance } = await create();
    state.mandates[0].status = 'SUSPENDED';
    await expect(validateRemittance(TENANT, remittance.id, 'user-1', NOW, CTX)).rejects.toThrow(/plus prélevable/);
  });

  it('exige le numéro d émetteur du syndicat avant de valider', async () => {
    const { remittance } = await create();
    state.creditors[0].creditorIdentifier = null;
    await expect(validateRemittance(TENANT, remittance.id, 'user-1', NOW, CTX)).rejects.toBeInstanceOf(BadRequestError);
  });
});

describe('syndic / fichier de remise', () => {
  it('produit le CSV : libellé CHARGES LOT <n> MM/AAAA, IBAN complet, une ligne par lot', async () => {
    const id = await validated();
    const file = await exportRemittance(TENANT, id, 'user-1', NOW, CTX);

    expect(file.fileName).toBe('PRL-2026-0001.csv');
    const text = file.buffer.toString('utf8').replace(new RegExp('^' + String.fromCharCode(0xfeff)), '');
    const rows = text
      .split('\r\n')
      .filter(Boolean)
      .map(row => row.split(';'));
    expect(rows).toHaveLength(3);
    const header = rows[0];
    const cell = (row: string[], name: string) => row[header.indexOf(name)];
    expect(cell(rows[1], 'libelle')).toBe('CHARGES LOT A12 10/2026');
    expect(cell(rows[2], 'libelle')).toBe('CHARGES LOT B03 10/2026');
    expect(cell(rows[1], 'iban')).toBe(IBAN);
    expect(cell(rows[1], 'montant')).toBe('90000');
    expect(cell(rows[2], 'montant')).toBe('30000');
    expect(cell(rows[1], 'reference_operation')).toBe('PRL-2026-0001-001');
    expect(cell(rows[1], 'reference_mandat')).toBe('MDT-2026-0001');
    expect(cell(rows[1], 'date_echeance')).toBe('2026-10-26');
    expect(cell(rows[1], 'numero_emetteur')).toBe('CI-SYN-001');
    expect(cell(rows[1], 'devise')).toBe('XOF');

    // Audit critique avec le périmètre, sans IBAN.
    const event = lastCall(mockAudit.record)[1];
    expect(event).toMatchObject({
      actionKey: 'DIRECT_DEBIT_REMITTANCE_EXPORTED',
      payload: expect.objectContaining({ scope: 'SYNDIC_LOT', syndicateId: SYN, lineCount: 2 })
    });
    expect(JSON.stringify(event)).not.toContain(IBAN);
    expect((await getRemittance(TENANT, id, CTX)).status).toBe('EXPORTED');
  });

  it('refuse le fichier d une remise non validée, d un autre syndicat ou du périmètre locatif', async () => {
    const { remittance } = await create();
    await expect(exportRemittance(TENANT, remittance.id, 'u', NOW, CTX)).rejects.toBeInstanceOf(ConflictError);
    await validateRemittance(TENANT, remittance.id, 'u', NOW, CTX);
    await waitForSyndicRemittancePrenotifications();
    await expect(exportRemittance(TENANT, remittance.id, 'u', NOW, syndicCtx(SYN_X))).rejects.toBeInstanceOf(
      NotFoundError
    );
    await expect(exportRemittance(TENANT, remittance.id, 'u', NOW)).rejects.toBeInstanceOf(NotFoundError);
  });
});
