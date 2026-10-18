import express from 'express';
import request from 'supertest';

/**
 * Prélèvement bancaire des copropriétés : gardes route par route (spec 042, P4,
 * data-model §9.4).
 *
 * Vrai routeur, vrai garde « syndicat de l'agence » et vraies gardes de
 * permission (`requirePermission`) ; seuls `authenticate`, le contexte d'agence,
 * le calcul des permissions, la base (syndicats) et les contrôleurs sont simulés.
 * Les permissions de l'utilisateur viennent de `currentPerms`.
 */

const TENANT = 'tenant-a';
const OTHER_TENANT = 'tenant-b';
const SYN = '11111111-1111-4111-8111-111111111111';
const SYN_OTHER_TENANT = '11111111-1111-4111-8111-999999999999';
const LOT = '22222222-2222-4222-8222-222222222222';
const MANDATE = '33333333-3333-4333-8333-333333333333';
const REMITTANCE = '44444444-4444-4444-8444-444444444444';
const LINE = '55555555-5555-4555-8555-555555555555';

let currentPerms: string[] = [];

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-1', globalRole: 'USER' };
    next();
  }
}));
jest.mock('../../src/middleware/tenant-middleware', () => ({
  requireTenantAccess: (req: any, _res: any, next: any) => {
    req.tenantContext = { tenantId: req.params.tenantId, isCollaborator: true, isClient: false };
    next();
  }
}));
jest.mock('../../src/services/permission-service', () => ({
  hasPermission: async (_userId: string, key: string) => currentPerms.includes(key)
}));
jest.mock('../../src/utils/database', () => ({
  prisma: {
    syndicate: {
      findFirst: jest.fn(async ({ where }: any) => {
        const owned = [{ id: SYN, tenantId: TENANT, name: 'Résidence Les Palmiers' }];
        return owned.find(row => row.id === where.id && row.tenantId === where.tenantId) ?? null;
      })
    }
  }
}));

const okHandlers = () => new Proxy({}, { get: () => (_req: any, res: any) => res.status(200).json({ ok: true }) });
jest.mock('../../src/controllers/syndic-direct-debit-controller', () => okHandlers());

/* eslint-disable @typescript-eslint/no-var-requires */
const routes = require('../../src/routes/syndic-direct-debit-routes').default;
/* eslint-enable @typescript-eslint/no-var-requires */

const app = express();
app.use(express.json());
app.use('/api', routes);

const B = `/api/tenants/${TENANT}/syndics/${SYN}/prelevements`;
type Kind = 'VIEW' | 'MANAGE';
type Row = [string, string, Kind];
const R = (method: string, path: string, kind: Kind): Row => [method, `${B}${path}`, kind];

const ROUTES: Row[] = [
  R('get', '/creancier', 'VIEW'),
  R('put', '/creancier', 'MANAGE'),
  R('post', '/controle-iban', 'MANAGE'),
  R('get', `/lots/${LOT}/debiteurs`, 'VIEW'),
  R('get', '/mandats', 'VIEW'),
  R('post', '/mandats', 'MANAGE'),
  R('get', `/mandats/${MANDATE}`, 'VIEW'),
  R('patch', `/mandats/${MANDATE}`, 'MANAGE'),
  R('post', `/mandats/${MANDATE}/activer`, 'MANAGE'),
  R('post', `/mandats/${MANDATE}/suspendre`, 'MANAGE'),
  R('post', `/mandats/${MANDATE}/reactiver`, 'MANAGE'),
  R('post', `/mandats/${MANDATE}/revoquer`, 'MANAGE'),
  // Le PDF et le scan portent des données bancaires : jamais en lecture seule.
  R('get', `/mandats/${MANDATE}/autorisation-pdf`, 'MANAGE'),
  R('post', `/mandats/${MANDATE}/scan-signe`, 'MANAGE'),
  R('get', `/mandats/${MANDATE}/scan-signe`, 'MANAGE'),
  R('get', '/remises', 'VIEW'),
  R('post', '/remises', 'MANAGE'),
  R('get', `/remises/${REMITTANCE}`, 'VIEW'),
  R('post', `/remises/${REMITTANCE}/actualiser`, 'MANAGE'),
  R('post', `/remises/${REMITTANCE}/lignes/${LINE}/retirer`, 'MANAGE'),
  R('post', `/remises/${REMITTANCE}/valider`, 'MANAGE'),
  R('post', `/remises/${REMITTANCE}/avis`, 'MANAGE'),
  // Le fichier porte les IBAN complets.
  R('post', `/remises/${REMITTANCE}/fichier`, 'MANAGE'),
  R('post', `/remises/${REMITTANCE}/deposer`, 'MANAGE'),
  R('post', `/remises/${REMITTANCE}/annuler`, 'MANAGE'),
  R('post', `/remises/${REMITTANCE}/lignes/${LINE}/regler`, 'MANAGE'),
  R('post', `/remises/${REMITTANCE}/lignes/${LINE}/rejeter`, 'MANAGE'),
  R('post', `/remises/${REMITTANCE}/tout-regler`, 'MANAGE'),
  R('post', '/retours/apercu', 'MANAGE'),
  R('post', '/retours/appliquer', 'MANAGE'),
  R('get', '/retours', 'VIEW')
];

const call = (method: string, path: string) => (request(app) as any)[method](path).send({});

beforeEach(() => {
  currentPerms = [];
});

describe('prélèvement des copropriétés / gardes', () => {
  it('couvre toutes les routes du contrat (31)', () => {
    expect(ROUTES).toHaveLength(31);
  });

  it.each(ROUTES)('%s %s : sans permission 403', async (method, path) => {
    const response = await call(method, path);
    expect(response.status).toBe(403);
  });

  it.each(ROUTES)('%s %s : la permission dédiée de la copropriété ouvre la route', async (method, path, kind) => {
    currentPerms = [`SYNDIC_DIRECT_DEBIT_${kind}`];
    const response = await call(method, path);
    expect(response.status).toBe(200);
  });

  it.each(ROUTES.filter(([, , kind]) => kind === 'MANAGE'))(
    '%s %s : la lecture seule ne suffit pas',
    async (method, path) => {
      currentPerms = ['SYNDIC_DIRECT_DEBIT_VIEW', 'SYNDIC_VIEW'];
      expect((await call(method, path)).status).toBe(403);
    }
  );

  it.each(ROUTES)('%s %s : les permissions du locatif et du syndic ordinaires ne servent pas', async (method, path) => {
    currentPerms = ['RENTAL_DIRECT_DEBIT_VIEW', 'RENTAL_DIRECT_DEBIT_MANAGE', 'SYNDIC_VIEW', 'SYNDIC_EDIT'];
    expect((await call(method, path)).status).toBe(403);
  });

  it('une copropriété d une autre agence est introuvable (404), même avec toutes les permissions et avant tout 403', async () => {
    const foreign = `/api/tenants/${TENANT}/syndics/${SYN_OTHER_TENANT}/prelevements`;
    currentPerms = ['SYNDIC_DIRECT_DEBIT_VIEW', 'SYNDIC_DIRECT_DEBIT_MANAGE'];
    expect((await call('get', `${foreign}/creancier`)).status).toBe(404);
    expect((await call('post', `${foreign}/remises`)).status).toBe(404);
    expect((await call('get', `${foreign}/mandats/${MANDATE}/autorisation-pdf`)).status).toBe(404);
    // Sans permission : 404 aussi (le 403 révélerait l existence de la copropriété).
    currentPerms = [];
    expect((await call('get', `${foreign}/creancier`)).status).toBe(404);
  });

  it('la copropriété de l agence A est introuvable depuis l agence B', async () => {
    currentPerms = ['SYNDIC_DIRECT_DEBIT_VIEW', 'SYNDIC_DIRECT_DEBIT_MANAGE'];
    const response = await call('get', `/api/tenants/${OTHER_TENANT}/syndics/${SYN}/prelevements/creancier`);
    expect(response.status).toBe(404);
  });

  it('un identifiant de copropriété qui n est pas un UUID est introuvable (404)', async () => {
    currentPerms = ['SYNDIC_DIRECT_DEBIT_VIEW'];
    expect((await call('get', `/api/tenants/${TENANT}/syndics/pas-un-uuid/prelevements/creancier`)).status).toBe(404);
  });
});
