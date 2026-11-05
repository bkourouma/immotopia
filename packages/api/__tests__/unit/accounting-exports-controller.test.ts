/**
 * `controllers/accounting-exports-controller.ts` — bout en bout léger sur une
 * app Express minimale : les handlers réels, le vrai `errorHandler`, les
 * modules de requête et l'ordonnanceur mockés à la frontière service.
 * `parsePeriod`, `parseAsOfDate` et `toCsv` restent réels (purs).
 */

import express from 'express';
import request from 'supertest';

jest.mock('../../src/utils/database', () => ({ prisma: {} }));
jest.mock('../../src/lib/owner-account/service', () => ({ syncAllOwnerAccounts: jest.fn() }));

const requestBackgroundSync = jest.fn();
const awaitFreshSync = jest.fn();
const forceSync = jest.fn();
const getSyncState = jest.fn();
jest.mock('../../src/lib/accounting-exports/sync-scheduler', () => ({
  requestBackgroundSync: (...a: any[]) => requestBackgroundSync(...a),
  awaitFreshSync: (...a: any[]) => awaitFreshSync(...a),
  forceSync: (...a: any[]) => forceSync(...a),
  getSyncState: (...a: any[]) => getSyncState(...a)
}));

const getJournalPage = jest.fn();
jest.mock(
  '../../src/lib/accounting-exports/queries/journal',
  () => ({
    getJournalPage: (...a: any[]) => getJournalPage(...a),
    journalPageTable: () => ({ sheet: 'Journal', headers: ['A'], rows: [['x']], money: [] })
  }),
  { virtual: true }
);

const listAccounts = jest.fn();
const getLedgerSummary = jest.fn();
const getAccountLedger = jest.fn();
jest.mock(
  '../../src/lib/accounting-exports/queries/ledger',
  () => ({
    listAccounts: (...a: any[]) => listAccounts(...a),
    getLedgerSummary: (...a: any[]) => getLedgerSummary(...a),
    getAccountLedger: (...a: any[]) => getAccountLedger(...a),
    accountLedgerTable: () => ({ sheet: 'Compte', headers: ['A'], rows: [['x']], money: [] })
  }),
  { virtual: true }
);

const getTrialBalanceData = jest.fn();
jest.mock(
  '../../src/lib/accounting-exports/queries/balance',
  () => ({ getTrialBalanceData: (...a: any[]) => getTrialBalanceData(...a) }),
  { virtual: true }
);

const getMandantOwnersPage = jest.fn();
const getMandantOwnerLedger = jest.fn();
const getMandantTrialBalancePage = jest.fn();
const getMandantSubledger = jest.fn();
const mandantOwnerLedgerTableMock = jest.fn((..._a: any[]) => ({
  sheet: 'Mandant',
  headers: ['A'],
  rows: [['x']],
  money: []
}));
jest.mock('../../src/lib/accounting-exports/mandants', () => ({
  getMandantOwnersPage: (...a: any[]) => getMandantOwnersPage(...a),
  getMandantOwnerLedger: (...a: any[]) => getMandantOwnerLedger(...a),
  getMandantTrialBalancePage: (...a: any[]) => getMandantTrialBalancePage(...a),
  getMandantSubledger: (...a: any[]) => getMandantSubledger(...a),
  mandantOwnerLedgerTable: (...a: any[]) => mandantOwnerLedgerTableMock(...a),
  mandantSubledgerTable: () => ({ sheet: 'Mandants', headers: ['A'], rows: [['x']], money: [] }),
  mandantTrialBalancePageTable: () => ({ sheet: 'Balance mandants', headers: ['A'], rows: [['x']], money: [] })
}));

const getAccountingMeta = jest.fn();
jest.mock('../../src/lib/accounting-exports/meta', () => ({
  getAccountingMeta: (...a: any[]) => getAccountingMeta(...a)
}));

// Le service garde ses fonctions pures ; seules les lectures qui touchent la base sont remplacées.
const getGeneralLedger = jest.fn();
jest.mock('../../src/lib/accounting-exports/service', () => {
  const actual = jest.requireActual('../../src/lib/accounting-exports/service');
  return {
    ...actual,
    getGeneralLedger: (...a: any[]) => getGeneralLedger(...a),
    ledgerTable: () => ({ sheet: 'Grand livre', headers: ['A'], rows: [['x']], money: [] }),
    trialBalanceTable: () => ({ sheet: 'Balance', headers: ['A'], rows: [['x']], money: [] })
  };
});

import {
  getAccountingMetaHandler,
  getGeneralLedgerHandler,
  getJournalHandler,
  getMandantSubledgerHandler,
  getMandantTrialBalanceHandler,
  getTrialBalanceHandler,
  listAccountsHandler,
  syncAccountingHandler
} from '../../src/controllers/accounting-exports-controller';
import { errorHandler } from '../../src/middleware/error-middleware';

const TENANT = 't1';
const SYNC = { status: 'running', lastSyncedAt: null };
const OWNER_ID = '3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b';

function buildApp() {
  const app = express();
  app.use((req, _res, next) => {
    (req as any).tenantContext = { tenantId: TENANT };
    next();
  });
  const base = '/tenants/:tenantId/finance/accounting';
  app.get(`${base}/meta`, getAccountingMetaHandler);
  app.get(`${base}/accounts`, listAccountsHandler);
  app.get(`${base}/journal`, getJournalHandler);
  app.get(`${base}/general-ledger`, getGeneralLedgerHandler);
  app.get(`${base}/trial-balance`, getTrialBalanceHandler);
  app.get(`${base}/mandant-subledger`, getMandantSubledgerHandler);
  app.get(`${base}/mandant-trial-balance`, getMandantTrialBalanceHandler);
  app.post(`${base}/sync`, syncAccountingHandler);
  app.use(errorHandler);
  return app;
}

const url = (path: string) => `/tenants/${TENANT}/finance/accounting/${path}`;

describe('accounting-exports-controller', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    getSyncState.mockReturnValue(SYNC);
    awaitFreshSync.mockResolvedValue({ status: 'idle', lastSyncedAt: 'x' });
    forceSync.mockResolvedValue({ status: 'idle', lastSyncedAt: '2026-11-03T10:00:00.000Z' });
    getJournalPage.mockResolvedValue({ items: [], total: 0, page: 1, limit: 50 });
    listAccounts.mockResolvedValue([{ id: 'a1', accountNumber: '411', accountName: 'Clients', accountClass: 4 }]);
    getLedgerSummary.mockResolvedValue({ mode: 'summary', items: [] });
    getAccountLedger.mockResolvedValue({ mode: 'account', items: [] });
    getGeneralLedger.mockResolvedValue({ accounts: [] });
    getTrialBalanceData.mockResolvedValue({ lines: [] });
    getMandantOwnersPage.mockResolvedValue({ mode: 'owners', items: [] });
    getMandantOwnerLedger.mockResolvedValue({ mode: 'owner', items: [] });
    getMandantSubledger.mockResolvedValue({ owners: [] });
    getMandantTrialBalancePage.mockResolvedValue({ items: [] });
    getAccountingMeta.mockResolvedValue({ journals: [], years: [], minDate: null, maxDate: null });
  });

  describe('lectures JSON', () => {
    it('enveloppe data + meta.sync, déclenche la synchronisation sans l’attendre', async () => {
      const res = await request(app)
        .get(url('journal'))
        .query({ page: 2, limit: 20, journal: 'VT', search: ' loyer ' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: { items: [], total: 0, page: 1, limit: 50 },
        meta: { sync: SYNC }
      });
      expect(requestBackgroundSync).toHaveBeenCalledWith(TENANT);
      expect(awaitFreshSync).not.toHaveBeenCalled();
      expect(requestBackgroundSync.mock.invocationCallOrder[0]).toBeLessThan(
        getJournalPage.mock.invocationCallOrder[0]
      );
      expect(getJournalPage).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({ fromLabel: expect.any(String) }),
        { journal: 'VT', account: undefined, search: 'loyer' },
        { page: 2, limit: 20 }
      );
    });

    it('meta : renvoie le contenu de getAccountingMeta avec meta.sync', async () => {
      const res = await request(app).get(url('meta'));
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ journals: [], years: [], minDate: null, maxDate: null });
      expect(res.body.meta.sync).toEqual(SYNC);
      expect(getAccountingMeta).toHaveBeenCalledWith(TENANT);
    });

    it('accounts : data.items, période transmise seulement avec withMovements', async () => {
      let res = await request(app).get(url('accounts')).query({ search: '41' });
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(listAccounts).toHaveBeenLastCalledWith(
        TENANT,
        expect.objectContaining({ search: '41', limit: 20, period: undefined })
      );

      res = await request(app)
        .get(url('accounts'))
        .query({ withMovements: 'true', from: '2026-01-01', to: '2026-03-31' });
      expect(res.status).toBe(200);
      const arg = listAccounts.mock.calls[1][1];
      expect(arg.withMovements).toBe(true);
      expect(arg.period.from).toBeInstanceOf(Date);
      expect(arg.period.to).toBeInstanceOf(Date);
    });

    it('trial-balance : traduit class et hideZero en filtres', async () => {
      const res = await request(app).get(url('trial-balance')).query({ class: '4', hideZero: 'true' });
      expect(res.status).toBe(200);
      expect(getTrialBalanceData).toHaveBeenCalledWith(TENANT, expect.any(Object), {
        accountClass: 4,
        hideZero: true,
        search: undefined
      });
    });

    it('mandant-trial-balance : date d’arrêté et pagination', async () => {
      const res = await request(app).get(url('mandant-trial-balance')).query({ date: '2026-06-30' });
      expect(res.status).toBe(200);
      expect(getMandantTrialBalancePage).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({ label: '2026-06-30' }),
        { search: undefined },
        { page: 1, limit: 50 }
      );
    });

    it('sync : attend forceSync et renvoie l’état en data et en meta', async () => {
      const res = await request(app).post(url('sync'));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: { status: 'idle', lastSyncedAt: '2026-11-03T10:00:00.000Z' },
        meta: { sync: { status: 'idle', lastSyncedAt: '2026-11-03T10:00:00.000Z' } }
      });
      expect(forceSync).toHaveBeenCalledWith(TENANT);
    });
  });

  describe('branches compte / propriétaire', () => {
    it('general-ledger sans compte → récapitulatif, limite 50 par défaut', async () => {
      await request(app).get(url('general-ledger')).expect(200);
      expect(getLedgerSummary).toHaveBeenCalledWith(
        TENANT,
        expect.any(Object),
        { search: undefined },
        { page: 1, limit: 50 }
      );
      expect(getAccountLedger).not.toHaveBeenCalled();
    });

    it('general-ledger avec compte → grand livre du compte, limite 100 par défaut', async () => {
      await request(app).get(url('general-ledger')).query({ account: '411100', journal: 'VT' }).expect(200);
      expect(getAccountLedger).toHaveBeenCalledWith(
        TENANT,
        expect.any(Object),
        '411100',
        { search: undefined, journal: 'VT' },
        { page: 1, limit: 100 }
      );
      expect(getLedgerSummary).not.toHaveBeenCalled();
    });

    it('mandant-subledger sans propriétaire → liste, avec propriétaire → lignes (nature transmise)', async () => {
      await request(app).get(url('mandant-subledger')).expect(200);
      expect(getMandantOwnersPage).toHaveBeenCalledWith(
        TENANT,
        expect.any(Object),
        { search: undefined },
        { page: 1, limit: 50 }
      );

      await request(app).get(url('mandant-subledger')).query({ owner: OWNER_ID, nature: 'DEPOSIT' }).expect(200);
      expect(getMandantOwnerLedger).toHaveBeenCalledWith(
        TENANT,
        expect.any(Object),
        OWNER_ID,
        { nature: 'DEPOSIT' },
        { page: 1, limit: 100 }
      );
    });

    it('mandant-subledger accepte la clé « non-reparti »', async () => {
      await request(app).get(url('mandant-subledger')).query({ owner: 'non-reparti' }).expect(200);
      expect(getMandantOwnerLedger).toHaveBeenCalledWith(
        TENANT,
        expect.any(Object),
        'non-reparti',
        { nature: undefined },
        expect.any(Object)
      );
    });
  });

  describe('exports', () => {
    it('csv journal : attend la synchronisation puis lit toutes les lignes', async () => {
      const res = await request(app).get(url('journal')).query({ format: 'csv', from: '2026-01-01', to: '2026-03-31' });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toBe('attachment; filename="journal_2026-01-01_2026-03-31.csv"');
      expect(awaitFreshSync).toHaveBeenCalledWith(TENANT);
      expect(requestBackgroundSync).not.toHaveBeenCalled();
      expect(awaitFreshSync.mock.invocationCallOrder[0]).toBeLessThan(getJournalPage.mock.invocationCallOrder[0]);
      expect(getJournalPage.mock.calls[0][3]).toBe('all');
    });

    it('xlsx grand livre d’un compte : nom de fichier avec le compte', async () => {
      const res = await request(app)
        .get(url('general-ledger'))
        .query({ format: 'xlsx', account: '411', from: '2026-01-01', to: '2026-03-31' })
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toBe(
        'attachment; filename="grand-livre_411_2026-01-01_2026-03-31.xlsx"'
      );
      expect(getAccountLedger.mock.calls[0][4]).toBe('all');
    });

    it('csv grand livre sans compte : grand livre complet', async () => {
      const res = await request(app)
        .get(url('general-ledger'))
        .query({ format: 'csv', from: '2026-01-01', to: '2026-03-31' });
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('grand-livre_2026-01-01_2026-03-31.csv');
      expect(getGeneralLedger).toHaveBeenCalledWith(TENANT, expect.any(Object), undefined);
      expect(getLedgerSummary).not.toHaveBeenCalled();
    });

    it('csv mandants sans propriétaire : grand livre auxiliaire complet ; avec propriétaire : toutes les lignes', async () => {
      await request(app).get(url('mandant-subledger')).query({ format: 'csv' }).expect(200);
      expect(getMandantSubledger).toHaveBeenCalledWith(TENANT, expect.any(Object));

      await request(app).get(url('mandant-subledger')).query({ format: 'csv', owner: OWNER_ID }).expect(200);
      expect(getMandantOwnerLedger.mock.calls[0][4]).toBe('all');
    });

    it('csv balance auxiliaire : toutes les lignes, nom daté', async () => {
      const res = await request(app).get(url('mandant-trial-balance')).query({ format: 'csv', date: '2026-06-30' });
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('balance-auxiliaire-mandants_2026-06-30.csv');
      expect(getMandantTrialBalancePage.mock.calls[0][3]).toBe('all');
    });

    it('un échec de synchronisation fait échouer l’export sans envoyer de fichier', async () => {
      awaitFreshSync.mockRejectedValue(new Error('sync en échec'));
      const res = await request(app).get(url('trial-balance')).query({ format: 'csv' });
      expect(res.status).toBeGreaterThanOrEqual(500);
      expect(getTrialBalanceData).not.toHaveBeenCalled();
    });
  });

  describe('paramètres invalides → 400', () => {
    const cases: Array<[string, string, Record<string, string>]> = [
      ['page=0', 'journal', { page: '0' }],
      ['page non numérique', 'journal', { page: 'abc' }],
      ['limit=500', 'journal', { limit: '500' }],
      ['limit=500 sur accounts', 'accounts', { limit: '51' }],
      ['class=12', 'trial-balance', { class: '12' }],
      ['owner=xyz', 'mandant-subledger', { owner: 'xyz' }],
      ['from au format français', 'journal', { from: '01/01/2026' }],
      ['paramètre inconnu', 'journal', { foo: 'bar' }],
      ['paramètre inconnu sur meta', 'meta', { foo: 'bar' }],
      ['format inconnu', 'journal', { format: 'pdf' }],
      ['journal avec caractères interdits', 'journal', { journal: 'VT;DROP' }],
      ['compte avec caractères interdits', 'general-ledger', { account: '41 1' }],
      ['search trop long', 'journal', { search: 'x'.repeat(101) }],
      ['nature inconnue', 'mandant-subledger', { nature: 'AUTRE' }],
      ['hideZero invalide', 'trial-balance', { hideZero: 'oui' }],
      ['date impossible', 'journal', { from: '2026-13-45' }],
      ['début après fin', 'journal', { from: '2026-05-01', to: '2026-01-01' }],
      ['date d’arrêté invalide', 'mandant-trial-balance', { date: 'hier' }]
    ];

    it.each(cases)('%s', async (_label, path, query) => {
      const res = await request(app).get(url(path)).query(query);
      expect(res.status).toBe(400);
      expect(getJournalPage).not.toHaveBeenCalled();
      expect(getTrialBalanceData).not.toHaveBeenCalled();
    });

    it('un paramètre répété (tableau) est refusé en 400', async () => {
      const res = await request(app).get(`${url('journal')}?search=a&search=b`);
      expect(res.status).toBe(400);
    });
  });

  it('refuse l’absence de contexte agence', async () => {
    const bare = express();
    bare.get('/x', getAccountingMetaHandler);
    bare.use(errorHandler);
    const res = await request(bare).get('/x');
    expect(res.status).toBe(400);
  });
});

describe('parametres envoyes par le service web (format=json systematique)', () => {
  const app = buildApp();
  const j = { format: 'json' };

  beforeEach(() => {
    jest.clearAllMocks();
    getSyncState.mockReturnValue(SYNC);
    awaitFreshSync.mockResolvedValue({ status: 'idle', lastSyncedAt: 'x' });
    getJournalPage.mockResolvedValue({ items: [], total: 0, page: 1, limit: 50 });
    listAccounts.mockResolvedValue([]);
    getLedgerSummary.mockResolvedValue({ mode: 'summary', items: [] });
    getAccountLedger.mockResolvedValue({ mode: 'account', items: [] });
    getGeneralLedger.mockResolvedValue({ accounts: [] });
    getTrialBalanceData.mockResolvedValue({ lines: [] });
    getMandantOwnersPage.mockResolvedValue({ mode: 'owners', items: [] });
    getMandantOwnerLedger.mockResolvedValue({ mode: 'owner', items: [] });
    getMandantSubledger.mockResolvedValue({ owners: [] });
    getMandantTrialBalancePage.mockResolvedValue({ items: [] });
    getAccountingMeta.mockResolvedValue({});
  });

  const P = { from: '2026-01-01', to: '2026-03-31' };
  const cases: Array<[string, string, Record<string, string | number>]> = [
    ['meta', 'meta', { ...j }],
    ['accounts : format=json seul', 'accounts', { ...j }],
    ['accounts', 'accounts', { ...j, search: '41', withMovements: 'true', ...P, limit: 20 }],
    ['journal', 'journal', { ...j, ...P, page: 2, limit: 50, journal: 'VT', account: '411', search: 'loyer' }],
    ['recapitulatif', 'general-ledger', { ...j, ...P, page: 1, limit: 50, search: '41' }],
    [
      'grand livre d un compte',
      'general-ledger',
      { ...j, account: '411', ...P, page: 1, limit: 100, search: 'x', journal: 'VT' }
    ],
    ['balance generale', 'trial-balance', { ...j, ...P, class: 4, hideZero: 'false', search: 'cl' }],
    ['balance generale hideZero', 'trial-balance', { ...j, hideZero: 'true' }],
    ['mandants : proprietaires', 'mandant-subledger', { ...j, ...P, page: 1, limit: 50, search: 'zo' }],
    [
      'mandants : un proprietaire',
      'mandant-subledger',
      { ...j, owner: OWNER_ID, nature: 'DEPOSIT', ...P, page: 1, limit: 100 }
    ],
    ['balance auxiliaire', 'mandant-trial-balance', { ...j, date: '2026-06-30', page: 1, limit: 50, search: 'zo' }]
  ];

  it.each(cases)('GET %s -> 200', async (_name, path, query) => {
    const res = await request(app).get(url(path)).query(query);
    expect(res.status).toBe(200);
  });

  const exportCases: Array<[string, string, Record<string, string>]> = [
    ['journal', 'journal', { ...P, journal: 'VT', account: '411', search: 'x' }],
    ['grand livre', 'general-ledger', { ...P, account: '411', search: 'x', journal: 'VT' }],
    ['grand livre complet', 'general-ledger', { ...P, search: '41' }],
    ['balance', 'trial-balance', { ...P, class: '4', hideZero: 'true', search: 'x' }],
    ['mandants', 'mandant-subledger', { ...P, owner: OWNER_ID, nature: 'CURRENT', search: 'x' }],
    ['balance auxiliaire', 'mandant-trial-balance', { date: '2026-06-30', search: 'x' }]
  ];

  it.each(exportCases)('export csv %s (filtres sans page/limit) -> 200', async (_name, path, query) => {
    const res = await request(app)
      .get(url(path))
      .query({ ...query, format: 'csv' });
    expect(res.status).toBe(200);
  });

  it('accounts n accepte que format=json', async () => {
    await request(app).get(url('accounts')).query({ format: 'csv' }).expect(400);
  });

  it('l export du grand livre sans compte transmet la recherche', async () => {
    await request(app).get(url('general-ledger')).query({ format: 'csv', search: ' 41 ' }).expect(200);
    expect(getGeneralLedger).toHaveBeenCalledWith(TENANT, expect.any(Object), '41');
  });

  it('l export mandant filtre par nature passe la nature a la table', async () => {
    await request(app)
      .get(url('mandant-subledger'))
      .query({ format: 'csv', owner: OWNER_ID, nature: 'DEPOSIT' })
      .expect(200);
    expect(mandantOwnerLedgerTableMock.mock.calls[0][1]).toBe('DEPOSIT');
  });
});
