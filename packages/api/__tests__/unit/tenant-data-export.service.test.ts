/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Lot S7 — cycle de vie d'un export d'agence (service), Prisma simule.
 *
 * Verifie : un export d'une autre agence est introuvable (meme 404 qu'un
 * export inexistant), une seule demande en cours par agence, 410 pour une
 * archive expiree, passage RUNNING → READY (expiration a 7 jours) ou FAILED
 * (message generique), reprise au demarrage, journal d'audit.
 */

const db = {
  tenant: { findUnique: jest.fn() },
  user: { findMany: jest.fn() },
  tenantDataExport: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn()
  },
  $queryRaw: jest.fn()
};
jest.mock('../../src/utils/database', () => ({ prisma: db }));

const auditMock = jest.fn();
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: (...a: any[]) => auditMock(...a) }));

const buildMock = jest.fn();
jest.mock('../../src/services/tenant-data-export/archive-builder', () => ({
  buildTenantArchive: (...a: any[]) => buildMock(...a)
}));

import {
  deleteTenantDataExport,
  getTenantDataExport,
  openTenantDataExportDownload,
  recoverTenantDataExports,
  requestTenantDataExport,
  runTenantDataExport
} from '../../src/services/tenant-data-export/export-service';

const TENANT = 'tenant-a';
const EXPORT_ID = '11111111-2222-4333-8444-555555555555';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: EXPORT_ID,
    tenantId: TENANT,
    status: 'READY',
    requestedById: 'u-super',
    filePath: null,
    sizeBytes: null,
    modelCount: null,
    rowCount: null,
    fileCount: null,
    missingFileCount: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    expiresAt: null,
    createdAt: new Date('2026-09-29T10:00:00Z'),
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  db.tenant.findUnique.mockResolvedValue({ id: TENANT, name: 'Agence A', slug: 'agence-a' });
  db.user.findMany.mockResolvedValue([{ id: 'u-super', fullName: 'Super', email: 's@x.ci' }]);
  db.tenantDataExport.findMany.mockResolvedValue([]);
  db.tenantDataExport.updateMany.mockResolvedValue({ count: 0 });
  db.$queryRaw.mockResolvedValue([{ migration_name: '20260929160000_export_donnees_agence' }]);
});

describe('Export agence — lecture bornee a l’agence', () => {
  it('cherche l’export avec l’agence de l’URL et renvoie 404 pour une autre agence', async () => {
    db.tenantDataExport.findFirst.mockResolvedValue(null);
    await expect(getTenantDataExport(TENANT, EXPORT_ID)).rejects.toMatchObject({ statusCode: 404 });
    expect(db.tenantDataExport.findFirst).toHaveBeenCalledWith({ where: { id: EXPORT_ID, tenantId: TENANT } });
  });

  it('un identifiant malforme repond 404 sans requete', async () => {
    await expect(getTenantDataExport(TENANT, '../etc')).rejects.toMatchObject({ statusCode: 404 });
    expect(db.tenantDataExport.findFirst).not.toHaveBeenCalled();
  });

  it('le DTO ne porte jamais filePath', async () => {
    db.tenantDataExport.findFirst.mockResolvedValue(
      row({ filePath: '/srv/uploads/exports/a.zip', sizeBytes: BigInt(10) })
    );
    const dto = await getTenantDataExport(TENANT, EXPORT_ID);
    expect(dto).not.toHaveProperty('filePath');
    expect(JSON.stringify(dto)).not.toContain('/srv/');
    expect(dto.sizeBytes).toBe(10);
    expect(dto.downloadPath).toBe(`/api/admin/tenants/${TENANT}/data-exports/${EXPORT_ID}/download`);
  });
});

describe('Export agence — demande', () => {
  it('refuse une seconde demande quand une est en cours (409)', async () => {
    db.tenantDataExport.findFirst.mockResolvedValue({ id: 'other' });
    await expect(requestTenantDataExport(TENANT, 'u-super')).rejects.toMatchObject({ statusCode: 409 });
    expect(db.tenantDataExport.create).not.toHaveBeenCalled();
  });

  it('agence inconnue : 404', async () => {
    db.tenant.findUnique.mockResolvedValue(null);
    await expect(requestTenantDataExport('nope', 'u-super')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('cree un export QUEUED et journalise la demande', async () => {
    db.tenantDataExport.findFirst.mockResolvedValue(null);
    db.tenantDataExport.create.mockResolvedValue(row({ status: 'QUEUED' }));
    const dto = await requestTenantDataExport(TENANT, 'u-super');
    expect(dto).toMatchObject({ status: 'QUEUED', downloadPath: null });
    expect(db.tenantDataExport.create).toHaveBeenCalledWith({
      data: { tenantId: TENANT, requestedById: 'u-super', status: 'QUEUED' }
    });
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: 'TENANT_DATA_EXPORT_REQUESTED', tenantId: TENANT, entityId: EXPORT_ID })
    );
  });
});

describe('Export agence — execution', () => {
  it('RUNNING puis READY avec expiration a 7 jours', async () => {
    db.tenantDataExport.updateMany.mockResolvedValue({ count: 1 });
    db.tenantDataExport.findUnique.mockResolvedValue(row({ status: 'RUNNING' }));
    buildMock.mockResolvedValue({
      sizeBytes: 42,
      modelCount: 3,
      rowCount: 9,
      fileCount: 2,
      missingFileCount: 1,
      refusedFileCount: 0,
      unclassified: []
    });
    await runTenantDataExport(EXPORT_ID);
    expect(buildMock.mock.calls[0][0]).toMatchObject({
      tenant: { id: TENANT },
      schemaVersion: '20260929160000_export_donnees_agence'
    });
    const data = db.tenantDataExport.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: 'READY', sizeBytes: BigInt(42), fileCount: 2, missingFileCount: 1 });
    expect(data.expiresAt.getTime() - data.finishedAt.getTime()).toBe(7 * 24 * 3600 * 1000);
  });

  it('un echec passe FAILED avec un message generique', async () => {
    db.tenantDataExport.updateMany.mockResolvedValue({ count: 1 });
    db.tenantDataExport.findUnique.mockResolvedValue(row({ status: 'RUNNING' }));
    buildMock.mockRejectedValue(new Error('ENOSPC /srv/secret/path'));
    await runTenantDataExport(EXPORT_ID);
    const data = db.tenantDataExport.update.mock.calls[0][0].data;
    expect(data.status).toBe('FAILED');
    expect(data.error).not.toContain('/srv/');
  });

  it('ne fait rien si l’export n’est plus QUEUED', async () => {
    await runTenantDataExport(EXPORT_ID);
    expect(buildMock).not.toHaveBeenCalled();
  });

  it('au demarrage, les RUNNING orphelins passent FAILED', async () => {
    db.tenantDataExport.findMany.mockImplementation(async ({ where }: any) =>
      where.status === 'RUNNING' ? [{ id: EXPORT_ID, tenantId: TENANT }] : []
    );
    await recoverTenantDataExports();
    expect(db.tenantDataExport.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [EXPORT_ID] }, status: 'RUNNING' },
        data: expect.objectContaining({ status: 'FAILED' })
      })
    );
  });
});

describe('Export agence — telechargement et suppression', () => {
  it('archive expiree : 410', async () => {
    db.tenantDataExport.findFirst.mockResolvedValue(row({ status: 'EXPIRED' }));
    await expect(openTenantDataExportDownload(TENANT, EXPORT_ID, 'u-super')).rejects.toMatchObject({ statusCode: 410 });
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('archive pas encore prete : 409', async () => {
    db.tenantDataExport.findFirst.mockResolvedValue(row({ status: 'RUNNING' }));
    await expect(openTenantDataExportDownload(TENANT, EXPORT_ID, 'u-super')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('fichier hors de la racine des exports : jamais servi (410)', async () => {
    db.tenantDataExport.findFirst.mockResolvedValue(row({ status: 'READY', filePath: '/etc/passwd' }));
    await expect(openTenantDataExportDownload(TENANT, EXPORT_ID, 'u-super')).rejects.toMatchObject({ statusCode: 410 });
  });

  it('les archives echues passent EXPIRED a la lecture', async () => {
    db.tenantDataExport.findMany.mockResolvedValue([{ id: EXPORT_ID, filePath: null }]);
    db.tenantDataExport.findFirst.mockResolvedValue(row({ status: 'EXPIRED' }));
    await getTenantDataExport(TENANT, EXPORT_ID);
    expect(db.tenantDataExport.update).toHaveBeenCalledWith({
      where: { id: EXPORT_ID },
      data: { status: 'EXPIRED', filePath: null }
    });
  });

  it('refuse de supprimer un export en cours, journalise une suppression', async () => {
    db.tenantDataExport.findFirst.mockResolvedValue(row({ status: 'RUNNING' }));
    await expect(deleteTenantDataExport(TENANT, EXPORT_ID, 'u-super')).rejects.toMatchObject({ statusCode: 409 });
    db.tenantDataExport.findFirst.mockResolvedValue(row({ status: 'FAILED' }));
    await deleteTenantDataExport(TENANT, EXPORT_ID, 'u-super');
    expect(db.tenantDataExport.delete).toHaveBeenCalledWith({ where: { id: EXPORT_ID } });
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ actionKey: 'TENANT_DATA_EXPORT_DELETED' }));
  });
});
