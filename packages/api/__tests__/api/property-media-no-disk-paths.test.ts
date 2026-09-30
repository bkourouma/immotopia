/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Médias d'un bien (`PropertyMedia`) : `filePath` (chemin disque absolu du
 * serveur) partait dans la réponse de la liste, de l'upload (201), de la photo
 * principale et dans le détail du bien (BUG-2026-09-30-038). Même modèle que
 * `property-documents-no-disk-paths.test.ts` : base Prisma en mémoire qui
 * applique vraiment `select`.
 */

import * as os from 'os';
import * as path from 'path';
import { promises as fsp } from 'fs';
import express from 'express';
import request from 'supertest';
import { createFakePrisma } from '../helpers/fake-prisma';
import { findDiskPathLeaks } from '../helpers/disk-path-leaks';

const mockRoot = path.join(os.tmpdir(), `property-media-no-disk-paths-${process.pid}`);

jest.mock('../../src/utils/project-root', () => ({
  getProjectRoot: () => mockRoot
}));

const mockPrisma = createFakePrisma();
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: jest.fn(),
  flushAuditQueue: jest.fn()
}));

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-1', globalRole: 'USER' };
    next();
  }
}));

jest.mock('../../src/middleware/tenant-middleware', () => ({
  requireTenantAccess: (req: any, _res: any, next: any) => {
    req.tenantContext = { tenantId: req.params.tenantId };
    next();
  }
}));

import { authenticate } from '../../src/middleware/auth-middleware';
import { requireTenantAccess } from '../../src/middleware/tenant-middleware';
import { enforcePropertyTenantIsolation } from '../../src/middleware/tenant-isolation-middleware';
import { uploadMedia as uploadMediaMiddleware } from '../../src/middleware/upload-middleware';
import { getPropertyHandler } from '../../src/controllers/property-controller';
import {
  uploadMediaHandler,
  listMediaHandler,
  setPrimaryMediaHandler
} from '../../src/controllers/property-media-controller';
import { errorHandler } from '../../src/middleware/error-middleware';

const app = express();
app.use(express.json());

const guards = [authenticate, requireTenantAccess, enforcePropertyTenantIsolation];
app.get('/tenants/:tenantId/properties/:id', ...guards, getPropertyHandler);
app.post(
  '/tenants/:tenantId/properties/:id/media',
  ...guards,
  uploadMediaMiddleware.single('file'),
  uploadMediaHandler
);
app.get('/tenants/:tenantId/properties/:id/media', ...guards, listMediaHandler);
app.put('/tenants/:tenantId/properties/:id/media/primary', ...guards, setPrimaryMediaHandler);
app.use(errorHandler);

const TENANT = 'tenant-1';
const OTHER_TENANT = 'tenant-2';
const PROPERTY = 'prop-1';
const DISK_FILE_PATH = 'D:\\APP\\Immobillier\\uploads\\properties\\prop-1\\photo1.png';
const PUBLIC_URL = `/uploads/properties/${PROPERTY}/photo1.png`;

function seed() {
  mockPrisma.reset();
  const existingMedia = {
    id: 'media-1',
    propertyId: PROPERTY,
    tenantId: TENANT,
    mediaType: 'PHOTO',
    filePath: DISK_FILE_PATH,
    fileUrl: PUBLIC_URL,
    fileName: 'photo1.png',
    fileSize: 2048,
    mimeType: 'image/png',
    displayOrder: 0,
    isPrimary: false,
    metadata: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01')
  };
  mockPrisma.propertyMedia.rows.push(existingMedia);
  mockPrisma.property.rows.push({
    id: PROPERTY,
    tenantId: TENANT,
    ownerUserId: null,
    title: 'Villa Cocody',
    tenant: { id: TENANT, name: 'Agence Demo' },
    owner: null,
    media: [existingMedia],
    documents: [],
    statusHistory: [],
    mandates: [],
    containerParent: null,
    containerChildren: []
  });
}

beforeEach(seed);

afterAll(async () => {
  await fsp.rm(mockRoot, { recursive: true, force: true });
});

describe('Médias d’un bien — aucune réponse ne porte de chemin disque', () => {
  it('liste : sans filePath, fileUrl public conservé', async () => {
    const res = await request(app).get(`/tenants/${TENANT}/properties/${PROPERTY}/media`);

    expect(res.status).toBe(200);
    expect(findDiskPathLeaks(res.body)).toEqual([]);
    expect(res.body.data[0]).toMatchObject({ id: 'media-1', fileUrl: PUBLIC_URL, fileName: 'photo1.png' });
    expect(res.body.data[0]).not.toHaveProperty('filePath');
    expect(JSON.stringify(res.body)).not.toMatch(/[A-Za-z]:[\\/]/);
  });

  it('upload (201) : le média créé ne renvoie pas filePath et l’URL reste servie', async () => {
    const res = await request(app)
      .post(`/tenants/${TENANT}/properties/${PROPERTY}/media`)
      .field('mediaType', 'PHOTO')
      .attach('file', Buffer.from('89504e470d0a1a0a', 'hex'), { filename: 'nouvelle.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(findDiskPathLeaks(res.body)).toEqual([]);
    expect(res.body.data).not.toHaveProperty('filePath');
    expect(res.body.data.fileUrl).toMatch(new RegExp(`^/uploads/properties/${PROPERTY}/[^/]+\\.png$`));

    const writtenDir = path.join(mockRoot, 'uploads', 'properties', PROPERTY);
    expect((await fsp.readdir(writtenDir)).length).toBeGreaterThan(0);
    // Le chemin disque reste enregistré en base (usage interne : suppression).
    expect(mockPrisma.propertyMedia.rows.some((r: any) => r.filePath && r.fileName === 'nouvelle.png')).toBe(true);
  });

  it('photo principale : sans filePath', async () => {
    const res = await request(app)
      .put(`/tenants/${TENANT}/properties/${PROPERTY}/media/primary`)
      .send({ mediaId: 'media-1' });

    expect(res.status).toBe(200);
    expect(findDiskPathLeaks(res.body)).toEqual([]);
    expect(res.body.data).not.toHaveProperty('filePath');
    expect(res.body.data.isPrimary).toBe(true);
  });

  it('détail du bien : media sans filePath', async () => {
    const res = await request(app).get(`/tenants/${TENANT}/properties/${PROPERTY}`);

    expect(res.status).toBe(200);
    expect(findDiskPathLeaks(res.body)).toEqual([]);
    expect(res.body.data.media[0]).toMatchObject({ id: 'media-1', fileUrl: PUBLIC_URL });
    expect(res.body.data.media[0]).not.toHaveProperty('filePath');
  });

  it('bien d’une autre agence : même 404 que pour un bien inexistant', async () => {
    const other = await request(app).get(`/tenants/${OTHER_TENANT}/properties/${PROPERTY}/media`);
    const missing = await request(app).get(`/tenants/${TENANT}/properties/inconnu/media`);

    expect(other.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(JSON.stringify(other.body)).not.toContain('photo1.png');
  });
});
