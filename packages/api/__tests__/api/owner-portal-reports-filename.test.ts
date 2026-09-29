/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Non-régression — nom de fichier des rapports du portail propriétaire
 * (`POST /reports/revenue|occupancy|export`).
 *
 * `owner-portal-controller.ts` construisait le nom de fichier avec
 * `format(new Date(), 'yyyy-MM-dd')` (date-fns), mais chaque contrôleur
 * déstructure aussi `const { format: outputFormat } = req.body` : cette
 * variable locale `format` masquait l'import `format` de date-fns dans toute
 * la fonction. `format(...)` appelait alors la CHAÎNE reçue du corps
 * (`'csv'`, `'pdf'`…) comme une fonction → `TypeError: format is not a
 * function`, jamais rattrapé par le contrôleur (pas de `try/catch` autour du
 * calcul du nom de fichier) → 500 sur les trois routes, avant même d'écrire
 * les en-têtes de réponse.
 *
 * Correction : la variable du corps est renommée `outputFormat`, et le nom
 * de fichier utilise `new Date().toISOString().slice(0, 10)` (plus besoin de
 * date-fns ici). Ce test fige le comportement corrigé : 200, le bon
 * `Content-Type`, et un `Content-Disposition` avec un nom daté AAAA-MM-JJ et
 * la bonne extension.
 *
 * Sur le code d'avant la correction, ce test échouerait : les trois requêtes
 * recevraient un statut 500 (`Erreur lors de la génération...` /
 * `Erreur lors de l'export des données.`) au lieu de 200, puisque l'appel
 * `format(new Date(), 'yyyy-MM-dd')` lève un `TypeError` avant que
 * `res.setHeader`/`res.send` ne soient atteints.
 *
 * Garde réelle (comme `owner-portal-patrimoine.test.ts`) : la base en
 * mémoire de `helpers/fake-prisma.ts` et `requireOwnerPortalAccess` tournent
 * sans mock — seul `OwnerPortalService` est simulé, pour isoler ce test du
 * contenu réel des rapports (hors périmètre de cette régression).
 */

import express from 'express';
import request from 'supertest';
import { createFakePrisma } from '../helpers/fake-prisma';

const mockPrisma = createFakePrisma();

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, res: any, next: any) => {
    const userId = req.headers['x-test-user'];
    if (!userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }
    req.user = { userId, globalRole: 'USER' };
    next();
  }
}));

const revenueReportMock = jest.fn(async () => Buffer.from('date,revenue\n2026-06-01,100000\n'));
const occupancyReportMock = jest.fn(async () => Buffer.from('%PDF-1.4 rapport factice'));
const exportDataMock = jest.fn(async () => Buffer.from('id,label\n1,ligne\n'));

jest.mock('../../src/services/owner-portal-service', () => ({
  OwnerPortalService: jest.fn().mockImplementation(() => ({
    generateRevenueReport: revenueReportMock,
    generateOccupancyReport: occupancyReportMock,
    exportData: exportDataMock
  }))
}));

import ownerPortalRoutes from '../../src/routes/owner-portal-routes';
import { errorHandler } from '../../src/middleware/error-middleware';

const app = express();
app.use(express.json());
app.use('/api/portal/owner', ownerPortalRoutes);
app.use(errorHandler);

const TENANT_A = 'tenant-a';
const P1 = 'prop-1';
const USER_OUMAR = 'user-oumar';

function seed() {
  mockPrisma.reset();
  mockPrisma.tenant.rows.push({ id: TENANT_A, status: 'ACTIVE' });
  mockPrisma.tenantClient.rows.push({
    id: 'tc-oumar-a',
    userId: USER_OUMAR,
    tenantId: TENANT_A,
    clientType: 'OWNER',
    createdAt: new Date('2026-01-01'),
    tenant: { status: 'ACTIVE' }
  });
  mockPrisma.property.rows.push({
    id: P1,
    tenantId: TENANT_A,
    ownerUserId: USER_OUMAR,
    title: 'Villa Cocody',
    address: 'Cocody'
  });
}

beforeEach(() => {
  seed();
  jest.clearAllMocks();
});

const TODAY = new Date().toISOString().slice(0, 10);

describe('POST /reports/revenue — format csv', () => {
  it('200, Content-Type text/csv, nom de fichier daté AAAA-MM-JJ', async () => {
    const res = await request(app)
      .post('/api/portal/owner/reports/revenue')
      .set('x-test-user', USER_OUMAR)
      .send({ startDate: '2026-01-01', endDate: '2026-06-30', format: 'csv' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toBe(`attachment; filename="revenue-report-${TODAY}.csv"`);
    expect(revenueReportMock).toHaveBeenCalledTimes(1);
  });
});

describe('POST /reports/occupancy — format pdf', () => {
  it('200, Content-Type application/pdf, nom de fichier daté AAAA-MM-JJ', async () => {
    const res = await request(app)
      .post('/api/portal/owner/reports/occupancy')
      .set('x-test-user', USER_OUMAR)
      .send({ asOfDate: '2026-06-30', format: 'pdf' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toBe(`attachment; filename="occupancy-report-${TODAY}.pdf"`);
    expect(occupancyReportMock).toHaveBeenCalledTimes(1);
  });
});

describe('POST /reports/export — format csv', () => {
  it('200, Content-Type text/csv, nom de fichier daté AAAA-MM-JJ', async () => {
    const res = await request(app)
      .post('/api/portal/owner/reports/export')
      .set('x-test-user', USER_OUMAR)
      .send({ entityType: 'payments', format: 'csv' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toBe(`attachment; filename="payments-export-${TODAY}.csv"`);
    expect(exportDataMock).toHaveBeenCalledTimes(1);
  });
});

describe('POST /reports/export — validation entityType/format', () => {
  it('400 sur un entityType inconnu (ex. "revenues", hors payments|installments|leases)', async () => {
    const res = await request(app)
      .post('/api/portal/owner/reports/export')
      .set('x-test-user', USER_OUMAR)
      .send({ entityType: 'revenues', format: 'csv' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: 'entityType invalide.' });
    expect(exportDataMock).not.toHaveBeenCalled();
  });

  it('400 sur un format inconnu (ex. "pdf", hors csv|excel)', async () => {
    const res = await request(app)
      .post('/api/portal/owner/reports/export')
      .set('x-test-user', USER_OUMAR)
      .send({ entityType: 'payments', format: 'pdf' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: 'format invalide.' });
    expect(exportDataMock).not.toHaveBeenCalled();
  });
});
