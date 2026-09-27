/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Lot S7 — routes super-admin de l'export complet d'une agence.
 *
 * Le routeur reel est monte avec ses VRAIES gardes (`requirePermission`,
 * `requireSuperAdmin`) ; seuls la resolution des permissions, la lecture du
 * compte et le service d'export sont simules. On verifie : un administrateur
 * d'agence (TENANT_ADMIN) → 403, un role plateforme delegue sans
 * `SUPER_ADMIN` → 403, le super-admin passe ; les codes 202/404/409/410 ;
 * l'en-tete de telechargement ; aucun chemin disque dans les reponses.
 */

const hasPermissionMock = jest.fn();
jest.mock('../../src/services/permission-service', () => ({
  hasPermission: (...args: any[]) => hasPermissionMock(...args),
  hasAnyPermission: jest.fn(),
  hasAllPermissions: jest.fn()
}));
jest.mock('../../src/services/subscription-service', () => ({ checkSubscriptionAccess: jest.fn() }));

const findUserMock = jest.fn();
jest.mock('../../src/utils/database', () => ({
  prisma: { user: { findUnique: (...a: any[]) => findUserMock(...a) } }
}));

const service = {
  requestTenantDataExport: jest.fn(),
  listTenantDataExports: jest.fn(),
  getTenantDataExport: jest.fn(),
  openTenantDataExportDownload: jest.fn(),
  deleteTenantDataExport: jest.fn()
};
jest.mock('../../src/services/tenant-data-export/export-service', () => ({
  requestTenantDataExport: (...a: any[]) => service.requestTenantDataExport(...a),
  listTenantDataExports: (...a: any[]) => service.listTenantDataExports(...a),
  getTenantDataExport: (...a: any[]) => service.getTenantDataExport(...a),
  openTenantDataExportDownload: (...a: any[]) => service.openTenantDataExportDownload(...a),
  deleteTenantDataExport: (...a: any[]) => service.deleteTenantDataExport(...a)
}));

import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import express from 'express';
import request from 'supertest';
import { AppError, ConflictError, NotFoundError, errorHandler } from '../../src/middleware/error-middleware';
import { tenantDataExportAdminRouter } from '../../src/routes/tenant-data-export-routes';
import { requireSuperAdmin } from '../../src/middleware/super-admin-middleware';

type Actor = 'super' | 'tenantAdmin' | 'platformStaff';

const ACTORS: Record<Actor, { userId: string; globalRole: string; platformPermission: boolean }> = {
  super: { userId: 'u-super', globalRole: 'SUPER_ADMIN', platformPermission: true },
  // Administrateur d'agence : aucune permission PLATFORM_* hors contexte d'agence.
  tenantAdmin: { userId: 'u-tenant-admin', globalRole: 'USER', platformPermission: false },
  // Role plateforme delegue portant PLATFORM_TENANTS_* mais pas SUPER_ADMIN.
  platformStaff: { userId: 'u-staff', globalRole: 'USER', platformPermission: true }
};

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  const actor = ACTORS[(req.headers['x-actor'] as Actor) ?? 'super'];
  req.user = { userId: actor.userId, email: `${actor.userId}@x.ci`, globalRole: actor.globalRole };
  next();
});
app.use('/api/admin', tenantDataExportAdminRouter);
app.use(errorHandler);

const TENANT = 'tenant-1';
const EXPORT_ID = '11111111-2222-4333-8444-555555555555';
const base = `/api/admin/tenants/${TENANT}/data-exports`;

const dto = {
  id: EXPORT_ID,
  tenantId: TENANT,
  status: 'READY',
  requestedBy: { id: 'u-super', fullName: 'Super', email: 's@x.ci' },
  sizeBytes: 1234,
  modelCount: 120,
  rowCount: 5000,
  fileCount: 12,
  missingFileCount: 1,
  error: null,
  startedAt: '2026-09-29T16:00:00.000Z',
  finishedAt: '2026-09-29T16:01:00.000Z',
  expiresAt: '2026-10-06T16:01:00.000Z',
  createdAt: '2026-09-29T15:59:00.000Z',
  downloadPath: `${base}/${EXPORT_ID}/download`
};

let tmp: string;
let zipPath: string;

beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 's7-routes-'));
  zipPath = path.join(tmp, `${EXPORT_ID}.zip`);
  await fs.writeFile(zipPath, 'PK-fake-zip');
});

afterAll(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  jest.clearAllMocks();
  hasPermissionMock.mockImplementation(async (userId: string) =>
    Object.values(ACTORS).some(a => a.userId === userId && a.platformPermission)
  );
  findUserMock.mockImplementation(async ({ where }: any) => {
    const actor = Object.values(ACTORS).find(a => a.userId === where.id);
    return actor ? { globalRole: actor.globalRole, isActive: true } : null;
  });
  service.requestTenantDataExport.mockResolvedValue({ ...dto, status: 'QUEUED', downloadPath: null });
  service.listTenantDataExports.mockResolvedValue([dto]);
  service.getTenantDataExport.mockResolvedValue(dto);
  service.openTenantDataExportDownload.mockResolvedValue({
    absolutePath: zipPath,
    fileName: 'immotopia-export-agence-kipe-2026-09-29.zip',
    sizeBytes: 11
  });
  service.deleteTenantDataExport.mockResolvedValue(undefined);
});

const calls: Array<[string, string]> = [
  ['post', base],
  ['get', base],
  ['get', `${base}/${EXPORT_ID}`],
  ['get', `${base}/${EXPORT_ID}/download`],
  ['delete', `${base}/${EXPORT_ID}`]
];

describe('Export agence — routes reservees au super-admin', () => {
  it.each(calls)('%s %s : un administrateur d’agence recoit 403', async (method, url) => {
    const res = await (request(app) as any)[method](url).set('x-actor', 'tenantAdmin');
    expect(res.status).toBe(403);
    expect(Object.values(service).every(fn => fn.mock.calls.length === 0)).toBe(true);
  });

  it.each(calls)('%s %s : un role plateforme sans SUPER_ADMIN recoit 403', async (method, url) => {
    const res = await (request(app) as any)[method](url).set('x-actor', 'platformStaff');
    expect(res.status).toBe(403);
    expect(Object.values(service).every(fn => fn.mock.calls.length === 0)).toBe(true);
  });

  it('un compte super-admin desactive recoit 403', async () => {
    findUserMock.mockResolvedValue({ globalRole: 'SUPER_ADMIN', isActive: false });
    const res = await request(app).get(base);
    expect(res.status).toBe(403);
  });
});

describe('Export agence — contrat HTTP du super-admin', () => {
  it('POST cree un export en file (202) pour le super-admin', async () => {
    const res = await request(app).post(base);
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ success: true, data: { status: 'QUEUED', downloadPath: null } });
    expect(service.requestTenantDataExport).toHaveBeenCalledWith(TENANT, 'u-super');
  });

  it('POST renvoie 409 si un export est deja en preparation', async () => {
    service.requestTenantDataExport.mockRejectedValue(
      new ConflictError('Un export de cette agence est déjà en préparation.')
    );
    expect((await request(app).post(base)).status).toBe(409);
  });

  it('GET liste et detail, sans aucun chemin disque', async () => {
    const list = await request(app).get(base);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    const detail = await request(app).get(`${base}/${EXPORT_ID}`);
    expect(detail.status).toBe(200);
    for (const body of [list.text, detail.text]) {
      // `downloadPath` (route API `/data-exports/...`) est permis ; un chemin disque non.
      expect(body).not.toMatch(/filePath|[\\/]uploads[\\/]|\.zip|[A-Za-z]:\\\\/);
    }
  });

  it('un export d’une autre agence repond 404', async () => {
    service.getTenantDataExport.mockRejectedValue(new NotFoundError('Export introuvable.'));
    expect((await request(app).get(`${base}/${EXPORT_ID}`)).status).toBe(404);
  });

  it('GET download envoie le ZIP avec son nom de fichier', async () => {
    const res = await request(app).get(`${base}/${EXPORT_ID}/download`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="immotopia-export-agence-kipe-2026-09-29.zip"'
    );
    expect(service.openTenantDataExportDownload).toHaveBeenCalledWith(TENANT, EXPORT_ID, 'u-super');
  });

  it('GET download d’une archive expiree repond 410', async () => {
    service.openTenantDataExportDownload.mockRejectedValue(
      new AppError('Cette archive a expiré.', 410, 'EXPORT_EXPIRED')
    );
    const res = await request(app).get(`${base}/${EXPORT_ID}/download`);
    expect(res.status).toBe(410);
    expect(res.body.code).toBe('EXPORT_EXPIRED');
  });

  it('DELETE supprime l’export', async () => {
    const res = await request(app).delete(`${base}/${EXPORT_ID}`);
    expect(res.status).toBe(200);
    expect(service.deleteTenantDataExport).toHaveBeenCalledWith(TENANT, EXPORT_ID, 'u-super');
  });
});

describe('Export agence — inventaire des routes du routeur', () => {
  const routes = (tenantDataExportAdminRouter as any).stack
    .filter((layer: any) => layer.route)
    .map((layer: any) => ({
      method: Object.keys(layer.route.methods)[0].toUpperCase(),
      path: layer.route.path,
      handles: layer.route.stack.map((s: any) => s.handle)
    }));

  it('declare exactement les cinq routes attendues', () => {
    expect(routes.map((r: any) => `${r.method} ${r.path}`).sort()).toEqual(
      [
        'POST /tenants/:tenantId/data-exports',
        'GET /tenants/:tenantId/data-exports',
        'GET /tenants/:tenantId/data-exports/:exportId',
        'GET /tenants/:tenantId/data-exports/:exportId/download',
        'DELETE /tenants/:tenantId/data-exports/:exportId'
      ].sort()
    );
  });

  it('chaque route porte une permission PLATFORM_* puis requireSuperAdmin', () => {
    for (const route of routes) {
      const keys = route.handles.map((h: any) => h.permissionKey).filter(Boolean);
      expect(keys).toHaveLength(1);
      expect(keys[0]).toMatch(/^PLATFORM_TENANTS_/);
      expect(route.handles).toContain(requireSuperAdmin);
      expect(route.handles.indexOf(requireSuperAdmin)).toBeGreaterThan(
        route.handles.findIndex((h: any) => h.permissionKey)
      );
    }
  });
});
