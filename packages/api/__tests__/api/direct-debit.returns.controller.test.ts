import express from 'express';
import request from 'supertest';

/**
 * Retour banque des loyers : routes et contrôleur (spec 042, P3, data-model §8.7).
 *
 * Le vrai routeur est monté ; les gardes d'authentification et de permission sont
 * remplacés par des passe-plats qui appliquent la règle « MANAGE pour écrire, VIEW
 * pour lire » (en-tête `x-permission`). Le service de retour est simulé : le test
 * vérifie ce que le contrôleur lui transmet (agence, périmètre, acteur, corps validé,
 * fichier) et ce qu'il répond.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockService = {
  settleRemittanceLine: jest.fn(),
  rejectRemittanceLine: jest.fn(),
  settleAllRemittanceLines: jest.fn(),
  previewReturnFile: jest.fn(),
  applyReturnFile: jest.fn(),
  listReturnImports: jest.fn()
};

jest.mock('../../src/utils/database', () => ({ prisma: {} }));
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
jest.mock('../../src/middleware/rental-rbac-middleware', () => ({
  requireDirectDebitManage: (req: any, res: any, next: any) =>
    req.headers['x-permission'] === 'manage' ? next() : res.status(403).json({ success: false }),
  requireDirectDebitView: (req: any, res: any, next: any) =>
    ['view', 'manage'].includes(req.headers['x-permission']) ? next() : res.status(403).json({ success: false })
}));
// Les autres contrôleurs du routeur ne sont pas l'objet du test.
jest.mock('../../src/controllers/direct-debit-controller', () => mockNoopController());
jest.mock('../../src/controllers/direct-debit-remittance-controller', () => mockNoopController());
jest.mock('../../src/lib/direct-debit/returns', () => ({
  settleRemittanceLine: (...args: unknown[]) => mockService.settleRemittanceLine(...args),
  rejectRemittanceLine: (...args: unknown[]) => mockService.rejectRemittanceLine(...args),
  settleAllRemittanceLines: (...args: unknown[]) => mockService.settleAllRemittanceLines(...args),
  previewReturnFile: (...args: unknown[]) => mockService.previewReturnFile(...args),
  applyReturnFile: (...args: unknown[]) => mockService.applyReturnFile(...args),
  listReturnImports: (...args: unknown[]) => mockService.listReturnImports(...args)
}));

function mockNoopController() {
  return new Proxy(
    {},
    {
      get: (_target, name) =>
        name === '__esModule' ? false : (_req: unknown, res: { json: (body: unknown) => void }) => res.json({})
    }
  );
}

import { errorHandler, NotFoundError } from '../../src/middleware/error-middleware';
import router from '../../src/routes/direct-debit-routes';

const TENANT = 'tenant-a';
const REMITTANCE = '22222222-2222-4222-8222-222222222222';
const LINE = '55555555-5555-4555-8555-555555555551';
const BASE = `/api/tenants/${TENANT}/rental/direct-debit`;
const RENTAL = { scope: 'RENTAL_LEASE' };

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  app.use(errorHandler);
  return app;
}

const manage = (req: request.Test) => req.set('x-permission', 'manage');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('retour banque / contrôleur', () => {
  describe('constat de règlement', () => {
    it('répond 200 et transmet agence, périmètre, identifiants, corps validé et acteur', async () => {
      mockService.settleRemittanceLine.mockResolvedValue({ id: REMITTANCE, reference: 'PRL-2026-0001' });
      const response = await manage(
        request(buildApp()).post(`${BASE}/remittances/${REMITTANCE}/lines/${LINE}/settle`)
      ).send({
        settledAt: '2026-10-27'
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { id: REMITTANCE, reference: 'PRL-2026-0001' } });
      expect(mockService.settleRemittanceLine).toHaveBeenCalledWith(
        TENANT,
        RENTAL,
        REMITTANCE,
        LINE,
        { settledAt: '2026-10-27' },
        'user-1'
      );
    });

    it('400 pour une date invalide ou un champ inconnu, sans appeler le service', async () => {
      const app = buildApp();
      const url = `${BASE}/remittances/${REMITTANCE}/lines/${LINE}/settle`;
      expect((await manage(request(app).post(url)).send({ settledAt: '27/10/2026' })).status).toBe(400);
      expect((await manage(request(app).post(url)).send({})).status).toBe(400);
      expect((await manage(request(app).post(url)).send({ settledAt: '2026-10-27', amount: 1 })).status).toBe(400);
      expect(mockService.settleRemittanceLine).not.toHaveBeenCalled();
    });

    it('404 pour un identifiant qui n’est pas un UUID, 404 et 409 du service transmis', async () => {
      const app = buildApp();
      const body = { settledAt: '2026-10-27' };
      expect(
        (await manage(request(app).post(`${BASE}/remittances/pas-un-uuid/lines/${LINE}/settle`)).send(body)).status
      ).toBe(404);
      expect(
        (await manage(request(app).post(`${BASE}/remittances/${REMITTANCE}/lines/pas-un-uuid/settle`)).send(body))
          .status
      ).toBe(404);
      expect(mockService.settleRemittanceLine).not.toHaveBeenCalled();

      mockService.settleRemittanceLine.mockRejectedValue(new NotFoundError('Ligne de remise introuvable.'));
      const missing = await manage(request(app).post(`${BASE}/remittances/${REMITTANCE}/lines/${LINE}/settle`)).send(
        body
      );
      expect(missing.status).toBe(404);
      expect(missing.body.message).toBe('Ligne de remise introuvable.');
    });
  });

  describe('constat de rejet', () => {
    it('transmet code et motif, 400 sans ni l’un ni l’autre', async () => {
      mockService.rejectRemittanceLine.mockResolvedValue({ id: REMITTANCE });
      const app = buildApp();
      const url = `${BASE}/remittances/${REMITTANCE}/lines/${LINE}/reject`;

      const ok = await manage(request(app).post(url)).send({
        rejectedAt: '2026-10-27',
        code: 'AC04',
        reason: ' Compte clôturé '
      });
      expect(ok.status).toBe(200);
      expect(mockService.rejectRemittanceLine).toHaveBeenCalledWith(
        TENANT,
        RENTAL,
        REMITTANCE,
        LINE,
        { rejectedAt: '2026-10-27', code: 'AC04', reason: 'Compte clôturé' },
        'user-1'
      );

      expect((await manage(request(app).post(url)).send({ rejectedAt: '2026-10-27' })).status).toBe(400);
      expect((await manage(request(app).post(url)).send({ rejectedAt: '2026-10-27', code: 'AC 04' })).status).toBe(400);
      expect(
        (await manage(request(app).post(url)).send({ rejectedAt: '2026-10-27', reason: 'x'.repeat(501) })).status
      ).toBe(400);
      expect(mockService.rejectRemittanceLine).toHaveBeenCalledTimes(1);
    });
  });

  describe('constat de toute la remise', () => {
    it('renvoie le résultat du service tel quel', async () => {
      const data = {
        remittance: { id: REMITTANCE },
        settled: 2,
        failed: [{ lineId: LINE, reference: 'PRL-2026-0001-001', error: 'Erreur' }]
      };
      mockService.settleAllRemittanceLines.mockResolvedValue(data);
      const response = await manage(request(buildApp()).post(`${BASE}/remittances/${REMITTANCE}/settle-all`)).send({
        settledAt: '2026-10-27'
      });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data });
      expect(mockService.settleAllRemittanceLines).toHaveBeenCalledWith(
        TENANT,
        RENTAL,
        REMITTANCE,
        { settledAt: '2026-10-27' },
        'user-1'
      );
    });
  });

  describe('fichier de retour', () => {
    it('aperçu : transmet le fichier en mémoire et le format du formulaire', async () => {
      mockService.previewReturnFile.mockResolvedValue({ format: 'GENERIC_CSV', records: [] });
      const response = await manage(request(buildApp()).post(`${BASE}/returns/preview`))
        .field('format', 'GENERIC_CSV')
        .attach('file', Buffer.from('reference_operation;statut\n'), 'retour.csv');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { format: 'GENERIC_CSV', records: [] } });
      const [tenantId, scope, file, format] = mockService.previewReturnFile.mock.calls[0];
      expect([tenantId, scope, format]).toEqual([TENANT, RENTAL, 'GENERIC_CSV']);
      expect(file.originalname).toBe('retour.csv');
      expect(Buffer.isBuffer(file.buffer)).toBe(true);
      expect(file.buffer.toString()).toBe('reference_operation;statut\n');
    });

    it('application : même fichier, acteur transmis', async () => {
      mockService.applyReturnFile.mockResolvedValue({ importId: 'import-1', results: [] });
      const response = await manage(request(buildApp()).post(`${BASE}/returns/apply`)).attach(
        'file',
        Buffer.from('a;b\n'),
        'retour.csv'
      );
      expect(response.status).toBe(200);
      expect(response.body.data.importId).toBe('import-1');
      const [tenantId, scope, file, format, actor] = mockService.applyReturnFile.mock.calls[0];
      expect([tenantId, scope, format, actor]).toEqual([TENANT, RENTAL, undefined, 'user-1']);
      expect(file.buffer.length).toBe(4);
    });

    it('413 pour un fichier de plus de 2 Mo, sans appeler le service', async () => {
      const app = buildApp();
      for (const path of ['preview', 'apply']) {
        const response = await manage(request(app).post(`${BASE}/returns/${path}`)).attach(
          'file',
          Buffer.alloc(2 * 1024 * 1024 + 1, 'a'),
          'enorme.csv'
        );
        expect(response.status).toBe(413);
      }
      expect(mockService.previewReturnFile).not.toHaveBeenCalled();
      expect(mockService.applyReturnFile).not.toHaveBeenCalled();
    });

    it('un fichier sous le plafond passe (la limite est incluse)', async () => {
      mockService.previewReturnFile.mockResolvedValue({ records: [] });
      const response = await manage(request(buildApp()).post(`${BASE}/returns/preview`)).attach(
        'file',
        Buffer.alloc(2 * 1024 * 1024, 'a'),
        'limite.csv'
      );
      expect(response.status).toBe(200);
    });

    it('sans fichier, le service reçoit undefined (et répond 400)', async () => {
      mockService.previewReturnFile.mockImplementation(async (_t: string, _s: unknown, file: unknown) => {
        if (!file) {
          const { BadRequestError } = jest.requireActual('../../src/middleware/error-middleware');
          throw new BadRequestError('Joignez le fichier de retour de la banque.');
        }
        return {};
      });
      const response = await manage(request(buildApp()).post(`${BASE}/returns/preview`)).send({});
      expect(response.status).toBe(400);
      expect(mockService.previewReturnFile.mock.calls[0][2]).toBeUndefined();
    });
  });

  describe('historique', () => {
    it('lit la page demandée avec VIEW', async () => {
      mockService.listReturnImports.mockResolvedValue({ items: [], total: 0, page: 2, pageSize: 10 });
      const response = await request(buildApp()).get(`${BASE}/returns?page=2&pageSize=10`).set('x-permission', 'view');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { items: [], total: 0, page: 2, pageSize: 10 } });
      expect(mockService.listReturnImports).toHaveBeenCalledWith(TENANT, RENTAL, { page: 2, pageSize: 10 });
    });

    it('400 pour une page invalide', async () => {
      const response = await request(buildApp()).get(`${BASE}/returns?page=0`).set('x-permission', 'view');
      expect(response.status).toBe(400);
    });
  });

  describe('permissions', () => {
    it('toutes les écritures exigent MANAGE ; la lecture accepte VIEW', async () => {
      const app = buildApp();
      const writes = [
        `${BASE}/remittances/${REMITTANCE}/lines/${LINE}/settle`,
        `${BASE}/remittances/${REMITTANCE}/lines/${LINE}/reject`,
        `${BASE}/remittances/${REMITTANCE}/settle-all`,
        `${BASE}/returns/preview`,
        `${BASE}/returns/apply`
      ];
      for (const url of writes) {
        expect((await request(app).post(url).send({})).status).toBe(403);
        expect((await request(app).post(url).set('x-permission', 'view').send({})).status).toBe(403);
      }
      expect((await request(app).get(`${BASE}/returns`)).status).toBe(403);
      expect((await request(app).get(`${BASE}/returns`).set('x-permission', 'view')).status).not.toBe(403);
      // Seule la lecture autorisée (VIEW) a atteint le service.
      const { listReturnImports, ...writers } = mockService;
      expect(listReturnImports).toHaveBeenCalledTimes(1);
      for (const fn of Object.values(writers)) expect(fn).not.toHaveBeenCalled();
    });
  });
});
