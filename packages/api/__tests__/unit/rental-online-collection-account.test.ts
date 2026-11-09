/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Contrat 049 §2.7 (H5) : compte de collecte du locatif = compte de trésorerie 5525 ;
 * le reversement est un virement de trésorerie existant, jamais plus que le solde.
 */

const store = {
  accounts: [] as any[],
  transfers: [] as any[],
  balance: 0,
  config: null as any
};
const calls = { createTransfer: [] as any[], audit: [] as any[] };
let getBalanceImpl: () => Promise<any> = async () => ({ amount: 123456, currency: 'FCFA' });

const prismaMock: any = {
  treasuryAccount: {
    findFirst: jest.fn(async ({ where }: any) => {
      const found = store.accounts.find(
        a =>
          a.tenantId === where.tenantId &&
          (where.accountNumber ? a.accountNumber === where.accountNumber : true) &&
          (where.id ? a.id === where.id : true)
      );
      return found ?? null;
    }),
    findMany: jest.fn(async ({ where }: any) =>
      store.accounts.filter(a => a.tenantId === where.tenantId && where.id.in.includes(a.id))
    )
  },
  treasuryTransfer: {
    count: jest.fn(async ({ where }: any) => store.transfers.filter(tr => matches(tr, where)).length),
    findMany: jest.fn(async ({ where, skip = 0, take = 100 }: any) =>
      store.transfers.filter(tr => matches(tr, where)).slice(skip, skip + take)
    ),
    findFirstOrThrow: jest.fn(async ({ where }: any) => store.transfers.find(tr => tr.id === where.id))
  },
  user: { findMany: jest.fn(async () => []) },
  $transaction: jest.fn(async (fn: any) => fn({}))
};
function matches(tr: any, where: any) {
  return (
    tr.tenantId === where.tenantId && tr.fromTreasuryAccountId === where.fromTreasuryAccountId && tr.status !== 'VOIDED'
  );
}

jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (entry: any) => calls.audit.push(entry)
}));
jest.mock('../../src/lib/treasury/balance', () => ({ treasuryBalanceTx: jest.fn(async () => store.balance) }));
jest.mock('../../src/lib/treasury/service', () => ({
  createTransfer: jest.fn(async (tenantId: string, userId: string, body: any) => {
    calls.createTransfer.push({ tenantId, userId, body });
    store.balance -= body.amount;
    const transfer = {
      id: 'TR-new',
      tenantId,
      year: 2026,
      sequence: 7,
      fromTreasuryAccountId: body.fromTreasuryAccountId,
      toTreasuryAccountId: body.toTreasuryAccountId,
      amount: body.amount,
      transferredAt: new Date(body.transferredAt),
      notes: body.notes ?? null,
      status: 'VALIDATED',
      createdByUserId: userId,
      createdAt: new Date()
    };
    store.transfers.push(transfer);
    return { id: transfer.id, number: 'VIR-2026-0007' };
  })
}));
jest.mock('../../src/lib/payment-gateway/config', () => ({
  loadConfig: jest.fn(async () => store.config),
  credentialsFrom: jest.fn(() => ({ tenantId: 'T1', merchantId: 'M', apiKey: 'K', baseUrl: 'x', timeoutMs: 1 }))
}));
jest.mock('../../src/lib/payment-gateway/paysecurehub', () => ({
  gatewayClientForMode: () => ({ getBalance: () => getBalanceImpl() })
}));

import {
  createCollectionPayout,
  getCollectionAccount,
  listCollectionPayouts
} from '../../src/lib/rental/online-review/collection-account';
import { GatewayError } from '../../src/lib/payment-gateway/types';

const T1 = 'T1';
const body = (over: Record<string, unknown> = {}) => ({
  toTreasuryAccountId: 'BANK1',
  amount: 40000,
  date: '2026-11-01',
  ...over
});

beforeEach(() => {
  store.accounts = [
    { id: 'A5525', tenantId: T1, accountNumber: '5525', chartOfAccountId: 'C5525', isActive: true, label: 'PSH' },
    { id: 'BANK1', tenantId: T1, accountNumber: '5211', chartOfAccountId: 'C5211', isActive: true, label: 'Banque' },
    { id: 'OFF1', tenantId: T1, accountNumber: '5212', chartOfAccountId: 'C5212', isActive: false, label: 'Fermé' },
    {
      id: 'OTHER',
      tenantId: 'T2',
      accountNumber: '5211',
      chartOfAccountId: 'C9',
      isActive: true,
      label: 'Autre agence'
    }
  ];
  store.transfers = [];
  store.balance = 100000;
  store.config = { mode: 'LIVE', merchantId: 'M', apiKeyEncrypted: 'K' };
  calls.createTransfer = [];
  calls.audit = [];
  getBalanceImpl = async () => ({ amount: 123456, currency: 'FCFA' });
});

describe('getCollectionAccount', () => {
  it('solde comptable, solde PaySecureHub et virements récents', async () => {
    store.transfers.push({
      id: 'TR1',
      tenantId: T1,
      year: 2026,
      sequence: 1,
      fromTreasuryAccountId: 'A5525',
      toTreasuryAccountId: 'BANK1',
      amount: 5000,
      transferredAt: new Date('2026-10-01'),
      notes: null,
      status: 'VALIDATED',
      createdByUserId: null,
      createdAt: new Date()
    });
    const dto = await getCollectionAccount(T1);
    expect(dto).toMatchObject({ accountNumber: '5525', treasuryAccountId: 'A5525', ledgerBalance: 100000 });
    expect(dto.provider).toMatchObject({ available: true, unavailableReason: null });
    expect(dto.provider.balance?.amount).toBe(123456);
    expect(dto.recentPayouts).toHaveLength(1);
    expect(dto.recentPayouts[0]).toMatchObject({ number: 'VIR-2026-0001', toLabel: 'Banque', amount: 5000 });
  });

  it('le compte 5525 absent n’est pas créé : id null, solde 0', async () => {
    store.accounts = store.accounts.filter(a => a.accountNumber !== '5525');
    const dto = await getCollectionAccount(T1);
    expect(dto).toMatchObject({ treasuryAccountId: null, ledgerBalance: 0, recentPayouts: [] });
  });

  it('simulateur, sans identifiants ou sans config : balance null avec motif', async () => {
    store.config = { mode: 'SIMULATOR' };
    expect((await getCollectionAccount(T1)).provider).toMatchObject({ balance: null, unavailableReason: 'SIMULATOR' });
    store.config = { mode: 'LIVE', merchantId: null, apiKeyEncrypted: null };
    expect((await getCollectionAccount(T1)).provider.unavailableReason).toBe('NO_CREDENTIALS');
    store.config = null;
    expect((await getCollectionAccount(T1)).provider.unavailableReason).toBe('NOT_CONFIGURED');
  });

  it('panne du fournisseur : 200 avec UNREACHABLE, jamais une exception', async () => {
    getBalanceImpl = async () => {
      throw new GatewayError('PaySecureHub injoignable');
    };
    const dto = await getCollectionAccount(T1);
    expect(dto.provider).toMatchObject({ available: false, balance: null, unavailableReason: 'UNREACHABLE' });
  });
});

describe('listCollectionPayouts', () => {
  it('liste vide sans 5525 ; pagination et filtre agence sinon', async () => {
    store.accounts = store.accounts.filter(a => a.accountNumber !== '5525');
    expect(await listCollectionPayouts(T1, {})).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
  });

  it('pageSize au-delà de 100 refusé', async () => {
    await expect(listCollectionPayouts(T1, { pageSize: 500 })).rejects.toBeTruthy();
  });
});

describe('createCollectionPayout', () => {
  it('appelle le virement existant du 5525 vers la destination, audit sans secret', async () => {
    const result = await createCollectionPayout(T1, 'U1', body({ note: 'Reversement de novembre' }));
    expect(calls.createTransfer[0]).toMatchObject({
      tenantId: T1,
      userId: 'U1',
      body: {
        fromTreasuryAccountId: 'A5525',
        toTreasuryAccountId: 'BANK1',
        amount: 40000,
        reference: 'REVERSEMENT PSH',
        notes: 'Reversement de novembre'
      }
    });
    expect(result.payout).toMatchObject({ transferId: 'TR-new', number: 'VIR-2026-0007', amount: 40000 });
    expect(result.ledgerBalanceAfter).toBe(60000);
    expect(calls.audit[0]).toMatchObject({
      actionKey: 'RENTAL_COLLECTION_PAYOUT_RECORDED',
      payload: { transferId: 'TR-new', number: 'VIR-2026-0007', toTreasuryAccountId: 'BANK1', amount: 40000 }
    });
  });

  it('montant > solde du 5525 : 400 RENTAL_COLLECTION_PAYOUT_INVALID, aucun virement', async () => {
    await expect(createCollectionPayout(T1, 'U1', body({ amount: 100000.01 }))).rejects.toMatchObject({
      statusCode: 400,
      code: 'RENTAL_COLLECTION_PAYOUT_INVALID'
    });
    expect(calls.createTransfer).toHaveLength(0);
  });

  it('montant égal au solde : accepté', async () => {
    await createCollectionPayout(T1, 'U1', body({ amount: 100000 }));
    expect(calls.createTransfer).toHaveLength(1);
  });

  it('destination désactivée, inconnue ou d’une autre agence : RENTAL_COLLECTION_PAYOUT_INVALID', async () => {
    for (const id of ['OFF1', 'NOPE', 'OTHER']) {
      await expect(createCollectionPayout(T1, 'U1', body({ toTreasuryAccountId: id }))).rejects.toMatchObject({
        code: 'RENTAL_COLLECTION_PAYOUT_INVALID'
      });
    }
    expect(calls.createTransfer).toHaveLength(0);
  });

  it('source = destination : RENTAL_COLLECTION_PAYOUT_INVALID', async () => {
    await expect(createCollectionPayout(T1, 'U1', body({ toTreasuryAccountId: 'A5525' }))).rejects.toMatchObject({
      code: 'RENTAL_COLLECTION_PAYOUT_INVALID'
    });
  });

  it('5525 inexistant : 404', async () => {
    store.accounts = store.accounts.filter(a => a.accountNumber !== '5525');
    await expect(createCollectionPayout(T1, 'U1', body())).rejects.toMatchObject({ statusCode: 404 });
  });

  it('date future, montant nul, champ inconnu : refusés', async () => {
    await expect(createCollectionPayout(T1, 'U1', body({ date: '2999-01-01' }))).rejects.toMatchObject({
      statusCode: 400
    });
    await expect(createCollectionPayout(T1, 'U1', body({ amount: 0 }))).rejects.toBeTruthy();
    await expect(createCollectionPayout(T1, 'U1', body({ tenantId: 'T2' }))).rejects.toBeTruthy();
    expect(calls.createTransfer).toHaveLength(0);
  });
});
