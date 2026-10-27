/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Base en mémoire et doubles du moteur de paiement en ligne Syndic (spec 042,
 * lot M2). Pas un test : partagé par les suites `syndics.online-payment-*`.
 *
 * Ce qui est SIMULÉ : les tables Prisma utilisées par le moteur (filtres
 * `where` réellement appliqués, y compris `hasSome` et les relations
 * `config` / `tenant` / `syndicate`), la transaction avec retour arrière
 * (instantané des tables restauré si la fonction lève), `recordLotPaymentTx`
 * (affectation, unicité de la clé d'idempotence et de la transaction
 * fournisseur => P2002) et l'émission des reçus.
 * Ce qui ne l'est PAS : PostgreSQL (verrous consultatifs, concurrence réelle
 * entre connexions) et la comptabilité (écritures 5525/450).
 */

import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { matchesWhere } from '../helpers/fake-prisma';

type Row = Record<string, any>;

const OPS = new Set(['in', 'notIn', 'not', 'gt', 'gte', 'lt', 'lte', 'equals', 'path', 'array_contains', 'hasSome']);

function isObject(value: unknown): value is Row {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

function match(row: Row, where: any): boolean {
  for (const [key, cond] of Object.entries(where ?? {})) {
    if (cond === undefined) continue;
    if (key === 'OR') {
      if (!(cond as any[]).some(branch => match(row, branch))) return false;
      continue;
    }
    if (key === 'AND') {
      if (!(Array.isArray(cond) ? cond : [cond]).every(branch => match(row, branch))) return false;
      continue;
    }
    if (isObject(cond) && 'hasSome' in cond) {
      if (!Array.isArray(row[key]) || !row[key].some((v: any) => cond.hasSome.includes(v))) return false;
      continue;
    }
    if (isObject(cond) && !Object.keys(cond).some(k => OPS.has(k)) && isObject(row[key])) {
      if (!match(row[key], cond)) return false;
      continue;
    }
    if (!matchesWhere(row, { [key]: cond })) return false;
  }
  return true;
}

function applyData(row: Row, data: Row) {
  for (const [key, value] of Object.entries(data ?? {})) {
    if (value === undefined) continue;
    if (isObject(value) && 'increment' in value && Object.keys(value).length === 1) {
      row[key] = Number(row[key] ?? 0) + Number(value.increment);
    } else if (value === Prisma.JsonNull) {
      row[key] = null;
    } else {
      row[key] = value;
    }
  }
}

export const IDS = {
  T1: 'tenant-1',
  T2: 'tenant-2',
  S1: '00000000-0000-4000-8000-000000000001',
  S2: '00000000-0000-4000-8000-000000000002',
  SB: '00000000-0000-4000-8000-000000000003',
  L1: '00000000-0000-4000-8000-000000000011',
  L2: '00000000-0000-4000-8000-000000000012',
  L3: '00000000-0000-4000-8000-000000000013',
  LB: '00000000-0000-4000-8000-000000000014',
  C1: '00000000-0000-4000-8000-000000000021',
  C2: '00000000-0000-4000-8000-000000000022',
  C3: '00000000-0000-4000-8000-000000000023',
  C4: '00000000-0000-4000-8000-000000000024',
  CB: '00000000-0000-4000-8000-000000000025',
  CFG1: '00000000-0000-4000-8000-000000000031',
  CFGB: '00000000-0000-4000-8000-000000000032',
  AWA: 'contact-awa',
  MANAGER: 'user-manager'
} as const;

export const SYNDIC_KEY = 'SYNDIC-S1-SECRET-KEY';
export const AGENCY_KEY = 'AGENCY-SECRET-KEY';
export const CODE = 'IMS-abcdefghij0123456789';

export function p2002(target: string): Error {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: [target] }
  });
}

const d = (value: string) => new Date(`${value}T00:00:00.000Z`);

export function createEngineDb() {
  const store = {
    tenants: [] as Row[],
    syndicates: [] as Row[],
    lots: [] as Row[],
    calls: [] as Row[],
    allocations: [] as Row[],
    payments: [] as Row[],
    checkouts: [] as Row[],
    configs: [] as Row[],
    agencyConfigs: [] as Row[],
    contacts: [] as Row[],
    receipts: [] as Row[],
    users: [] as Row[],
    /** Déclarations de paiement mobile money (spec 047) : vide par défaut, lues pour bloquer le paiement en ligne. */
    declarations: [] as Row[],
    closedYears: new Set<string>(),
    /** Écritures « d'une autre connexion » : appliquées APRÈS le retour arrière de la transaction en cours. */
    afterRollback: [] as Array<() => void>
  };
  const tables = [
    'tenants',
    'syndicates',
    'lots',
    'calls',
    'allocations',
    'payments',
    'checkouts',
    'configs',
    'agencyConfigs',
    'contacts',
    'receipts',
    'users',
    'declarations'
  ] as const;

  /** Relations lues par les filtres du moteur, posées à la lecture. */
  const hydrate = (name: string, row: Row): Row => {
    if (name === 'checkouts') {
      return {
        ...row,
        config: store.configs.find(c => c.id === row.configId),
        tenant: store.tenants.find(t => t.id === row.tenantId)
      };
    }
    if (name === 'lots') return { ...row, syndicate: store.syndicates.find(s => s.id === row.syndicateId) };
    return row;
  };

  function model(name: (typeof tables)[number], defaults: () => Row = () => ({})) {
    const find = (args: any = {}) => {
      const rows = store[name].filter(row => match(hydrate(name, row), args.where));
      if (args.orderBy) {
        const clauses = (Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy]).flatMap((c: Row) =>
          Object.entries(c)
        ) as Array<[string, 'asc' | 'desc']>;
        rows.sort((a, b) => {
          for (const [field, dir] of clauses) {
            const x = a[field] instanceof Date ? a[field].getTime() : a[field];
            const y = b[field] instanceof Date ? b[field].getTime() : b[field];
            if (x !== y) return (x < y ? -1 : 1) * (dir === 'desc' ? -1 : 1);
          }
          return 0;
        });
      }
      return rows;
    };
    const m: any = {};
    m.findFirst = jest.fn(async (args: any = {}) => {
      const row = find(args)[0];
      return row ? { ...hydrate(name, row) } : null;
    });
    m.findFirstOrThrow = jest.fn(async (args: any = {}) => {
      const row = find(args)[0];
      if (!row) throw new Error(`${name}: introuvable`);
      return { ...hydrate(name, row) };
    });
    m.findMany = jest.fn(async (args: any = {}) => {
      let rows = find(args);
      if (args.skip) rows = rows.slice(args.skip);
      if (args.take !== undefined) rows = rows.slice(0, args.take);
      return rows.map(row => ({ ...hydrate(name, row) }));
    });
    m.count = jest.fn(async (args: any = {}) => find(args).length);
    m.create = jest.fn(async (args: any) => {
      const row = { id: randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...defaults(), ...args.data };
      store[name].push(row);
      return { ...row };
    });
    m.update = jest.fn(async (args: any) => {
      const row = find(args)[0];
      if (!row) throw Object.assign(new Error(`${name}.update: aucune ligne`), { code: 'P2025' });
      applyData(row, args.data);
      row.updatedAt = new Date();
      return { ...row };
    });
    m.updateMany = jest.fn(async (args: any) => {
      const rows = find(args);
      rows.forEach(row => {
        applyData(row, args.data);
        row.updatedAt = new Date();
      });
      return { count: rows.length };
    });
    return m;
  }

  const prisma: any = {
    tenant: model('tenants'),
    syndicate: model('syndicates'),
    syndicateLot: model('lots'),
    chargeCall: model('calls'),
    chargePaymentAllocation: model('allocations'),
    chargePayment: model('payments'),
    syndicOnlineCheckout: model('checkouts', () => ({
      status: 'PENDING',
      checkoutUrl: null,
      providerToken: null,
      providerTransactionId: null,
      providerServiceName: null,
      providerFees: null,
      receivedAmount: null,
      lastProviderState: null,
      lastCheckedAt: null,
      checkAttempts: 0,
      failureMessage: null,
      reviewReason: null,
      reviewKind: null,
      simulatedOutcome: null,
      chargePaymentId: null,
      resolvedByUserId: null,
      resolvedAt: null,
      resolution: null,
      resolutionNote: null,
      completedAt: null,
      createdByUserId: null,
      tenantClientId: null,
      secureLinkId: null,
      contactId: null,
      currency: 'FCFA'
    })),
    syndicPaymentGatewayConfig: model('configs'),
    paymentGatewayConfig: model('agencyConfigs'),
    crmContact: model('contacts'),
    syndicChargeReceipt: model('receipts'),
    user: model('users'),
    syndicPaymentDeclaration: model('declarations'),
    $executeRaw: jest.fn(async () => 0)
  };
  // L'agence n'est JAMAIS lue par `findUnique` (c'est ce que fait `loadConfig` des loyers).
  prisma.paymentGatewayConfig.findUnique = jest.fn(async () => {
    throw new Error('Le moteur Syndic ne doit pas lire la configuration de l’agence par findUnique');
  });

  prisma.$transaction = jest.fn(async (arg: any) => {
    if (typeof arg !== 'function') return Promise.all(arg);
    const snapshot = tables.map(table => store[table].map(row => ({ ...row })));
    try {
      return await arg(prisma);
    } catch (error) {
      tables.forEach((table, i) => {
        store[table].splice(0, store[table].length, ...snapshot[i]);
      });
      store.afterRollback.splice(0).forEach(write => write());
      throw error;
    }
  });

  // ---------------------------------------------------------------- doubles des modules d'écriture

  const centsOf = (value: unknown) => Math.round(Number(value) * 100);

  const outstandingCents = (call: Row) =>
    centsOf(call.amount) -
    store.allocations.filter(a => a.chargeCallId === call.id).reduce((sum, a) => sum + centsOf(a.amount), 0);

  const engine = {
    sumAllocationsByCall: async (_client: unknown, ids: string[]) => {
      const out = new Map<string, number>();
      for (const a of store.allocations) {
        if (ids.includes(a.chargeCallId)) out.set(a.chargeCallId, (out.get(a.chargeCallId) ?? 0) + centsOf(a.amount));
      }
      return out;
    },
    assertSyndicateOfTenant: async (_client: unknown, tenantId: string, syndicateId: string) => {
      if (!store.syndicates.some(s => s.id === syndicateId && s.tenantId === tenantId)) {
        const { NotFoundError } = jest.requireActual('../../src/middleware/error-middleware');
        throw new NotFoundError('Copropriété introuvable ou inaccessible.');
      }
    },
    /** Double de `recordLotPaymentTx` : mêmes entrées, mêmes unicités qu'en base. */
    recordLotPaymentTx: jest.fn(async (_tx: unknown, input: any) => {
      if (input.idempotencyKey && store.payments.some(p => p.idempotencyKey === input.idempotencyKey)) {
        throw p2002('idempotency_key');
      }
      if (
        input.providerTransactionId &&
        store.payments.some(p => p.providerTransactionId === input.providerTransactionId)
      ) {
        throw p2002('provider_transaction_id');
      }
      const selection: string[] | null = input.chargeCallIds?.length ? input.chargeCallIds : null;
      const targets = store.calls
        .filter(c => c.lotId === input.lotId && (!selection || selection.includes(c.id)) && outstandingCents(c) > 0)
        .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
      let remaining = centsOf(input.amount);
      const payment: Row = {
        id: randomUUID(),
        lotId: input.lotId,
        amount: input.amount,
        unallocatedAmount: 0,
        paidAt: input.paidAt,
        method: input.method ?? null,
        reference: input.reference ?? null,
        createdById: input.actorUserId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        providerTransactionId: input.providerTransactionId ?? null,
        origin: input.origin ?? 'MANUAL',
        treasuryAccountNumber: input.treasuryAccountNumber ?? null
      };
      const allocations: any[] = [];
      for (const call of targets) {
        if (remaining <= 0) break;
        const applied = Math.min(remaining, outstandingCents(call));
        store.allocations.push({
          id: randomUUID(),
          paymentId: payment.id,
          chargeCallId: call.id,
          amount: applied / 100
        });
        allocations.push({ paymentId: payment.id, chargeCallId: call.id, amount: applied / 100, source: 'PAYMENT' });
        remaining -= applied;
      }
      payment.unallocatedAmount = remaining / 100;
      store.payments.push(payment);
      return {
        record: { ...payment },
        result: {
          payment: { id: payment.id, amount: input.amount, unallocatedAmount: remaining / 100 },
          allocations,
          advance: remaining / 100,
          lotAdvanceBalance: remaining / 100,
          currency: 'XOF'
        }
      };
    }),
    issueReceiptsForPaymentTx: jest.fn(async (_tx: unknown, input: any) => {
      const receipt = {
        id: randomUUID(),
        kind: 'RECEIPT',
        number: `R-2026-${String(store.receipts.length + 1).padStart(6, '0')}`,
        chargePaymentId: input.paymentId
      };
      store.receipts.push({
        ...receipt,
        tenantId: input.tenantId,
        lotId: input.lotId,
        issuedAt: new Date(),
        chargeCallId: null
      });
      return [receipt];
    }),
    assertFiscalYearOpenTx: jest.fn(async (_tx: unknown, _syndicateId: string, date: Date) => {
      if (store.closedYears.has(String(date.getUTCFullYear()))) {
        const { ConflictError } = jest.requireActual('../../src/middleware/error-middleware');
        throw new ConflictError('Exercice clos : aucune écriture ne peut y être passée');
      }
    }),
    evaluateSchedulingGate: jest.fn(async (): Promise<string | null> => null),
    scheduleChargeDocumentDelivery: jest.fn(),
    logAuditEvent: jest.fn(),
    client: {
      buildAway: jest.fn(),
      getStatus: jest.fn(),
      getBalance: jest.fn()
    }
  };

  // ---------------------------------------------------------------- jeu de données

  function seed() {
    store.tenants.push({ id: IDS.T1, status: 'ACTIVE' }, { id: IDS.T2, status: 'ACTIVE' });
    store.syndicates.push(
      { id: IDS.S1, tenantId: IDS.T1, name: 'Résidence Les Palmiers' },
      { id: IDS.S2, tenantId: IDS.T1, name: 'Résidence Sans Compte' },
      { id: IDS.SB, tenantId: IDS.T2, name: 'Résidence B' }
    );
    store.lots.push(
      { id: IDS.L1, syndicateId: IDS.S1, lotNumber: 'A12' },
      { id: IDS.L2, syndicateId: IDS.S1, lotNumber: 'A13' },
      { id: IDS.L3, syndicateId: IDS.S2, lotNumber: 'B01' },
      { id: IDS.LB, syndicateId: IDS.SB, lotNumber: 'X1' }
    );
    const call = (id: string, lotId: string, syndicateId: string, amount: number, due: string, period: string) => ({
      id,
      lotId,
      syndicateId,
      amount,
      currency: 'XOF',
      dueDate: d(due),
      createdAt: d(due),
      period
    });
    store.calls.push(
      call(IDS.C1, IDS.L1, IDS.S1, 30000, '2026-01-10', '2026-01'),
      call(IDS.C2, IDS.L1, IDS.S1, 20000, '2026-02-10', '2026-02'),
      call(IDS.C3, IDS.L2, IDS.S1, 15000, '2026-01-10', '2026-01'),
      call(IDS.C4, IDS.L3, IDS.S2, 10000, '2026-01-10', '2026-01'),
      call(IDS.CB, IDS.LB, IDS.SB, 8000, '2026-01-10', '2026-01')
    );
    // Copropriété S1 : simulateur actif. S2 : AUCUNE configuration (l'agence, elle, en a une active).
    store.configs.push({
      id: IDS.CFG1,
      tenantId: IDS.T1,
      syndicateId: IDS.S1,
      mode: 'SIMULATOR',
      isActive: true,
      merchantId: null,
      apiKeyEncrypted: null
    });
    store.agencyConfigs.push({
      id: 'agency-cfg',
      tenantId: IDS.T1,
      mode: 'LIVE',
      isActive: true,
      merchantId: 'AGENCY-MERCHANT',
      apiKeyEncrypted: `enc:${AGENCY_KEY}`,
      feesPaidBy: 'AGENCY'
    });
    store.contacts.push({
      id: IDS.AWA,
      tenantId: IDS.T1,
      firstName: 'Awa',
      lastName: 'Kone',
      legalName: null,
      email: 'awa@example.test',
      phonePrimary: '+2250700000000',
      whatsappNumber: null
    });
    store.users.push({ id: IDS.MANAGER, fullName: 'Gestionnaire Un' });
  }

  function setLive() {
    Object.assign(store.configs[0], {
      mode: 'LIVE',
      merchantId: 'MERCHANT-S1',
      apiKeyEncrypted: `enc:${SYNDIC_KEY}`
    });
  }

  function addCheckout(overrides: Row = {}): Row {
    const row: Row = {
      id: randomUUID(),
      tenantId: IDS.T1,
      syndicateId: IDS.S1,
      lotId: IDS.L1,
      configId: IDS.CFG1,
      origin: 'PORTAL',
      tenantClientId: 'client-1',
      contactId: IDS.AWA,
      codePaiement: CODE,
      amount: 50000,
      currency: 'FCFA',
      chargeCallIds: [IDS.C1, IDS.C2],
      checkoutUrl: 'http://localhost:8001/api/payment-gateway/simulator/' + CODE,
      providerToken: 'tok',
      providerTransactionId: null,
      providerServiceName: null,
      providerFees: null,
      receivedAmount: null,
      lastProviderState: null,
      lastCheckedAt: null,
      checkAttempts: 0,
      failureMessage: null,
      reviewReason: null,
      reviewKind: null,
      simulatedOutcome: null,
      status: 'PENDING',
      chargePaymentId: null,
      resolvedByUserId: null,
      resolvedAt: null,
      resolution: null,
      resolutionNote: null,
      completedAt: null,
      createdByUserId: null,
      secureLinkId: null,
      createdAt: new Date(Date.now() - 10 * 60 * 1000),
      updatedAt: new Date(),
      ...overrides
    };
    store.checkouts.push(row);
    return row;
  }

  function reset() {
    tables.forEach(table => {
      store[table].length = 0;
    });
    store.closedYears.clear();
    store.afterRollback.length = 0;
    jest.clearAllMocks();
    engine.evaluateSchedulingGate.mockResolvedValue(null);
    seed();
  }

  return { store, prisma, engine, seed, setLive, addCheckout, reset };
}

export type EngineDb = ReturnType<typeof createEngineDb>;

/** Réponse type du fournisseur pour `getStatus`. */
export function providerStatus(overrides: Record<string, unknown> = {}) {
  return {
    rawState: 'SUCCESSFUL',
    mappedState: 'SUCCESS',
    transactionId: 'TX-1',
    amount: 50000,
    fees: 0,
    serviceName: 'Wave CI',
    error: null,
    raw: { payments: { state: 'SUCCESSFUL' } },
    ...overrides
  };
}
