/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Documents d'un bien (`PropertyDocument`) : `filePath` (chemin disque
 * absolu) partait dans trois réponses JSON — la liste, la création (201) et
 * le détail du bien (`documents` inclus) — faute d'un `select` explicite
 * (`services/property-document-service.ts` `PROPERTY_DOCUMENT_SELECT`,
 * réutilisé par `services/property-service.ts` pour le détail du bien).
 *
 * Même modèle que `__tests__/api/portal-no-disk-paths.test.ts` : base Prisma
 * en mémoire (`helpers/fake-prisma.ts`) qui applique vraiment `select`, ligne
 * seedée avec un chemin disque et une URL de stockage privée, qui
 * ressortiraient dans la réponse si un `select` manquait.
 */

import * as os from 'os';
import * as path from 'path';
import { promises as fsp } from 'fs';
import express from 'express';
import request from 'supertest';
import { createFakePrisma } from '../helpers/fake-prisma';
import { findDiskPathLeaks } from '../helpers/disk-path-leaks';

const mockRoot = path.join(os.tmpdir(), `property-documents-no-disk-paths-${process.pid}`);

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

jest.mock('../../src/middleware/property-rbac-middleware', () => ({
  requirePropertyPermission: () => (_req: any, _res: any, next: any) => next()
}));

import { authenticate } from '../../src/middleware/auth-middleware';
import { requireTenantAccess } from '../../src/middleware/tenant-middleware';
import { enforcePropertyTenantIsolation } from '../../src/middleware/tenant-isolation-middleware';
import { requirePropertyPermission } from '../../src/middleware/property-rbac-middleware';
import { uploadDocument as uploadDocumentMiddleware } from '../../src/middleware/upload-middleware';
import { getPropertyHandler } from '../../src/controllers/property-controller';
import { uploadDocumentHandler, listDocumentsHandler } from '../../src/controllers/property-document-controller';
import { errorHandler } from '../../src/middleware/error-middleware';

const app = express();
app.use(express.json());

app.get(
  '/tenants/:tenantId/properties/:id',
  authenticate,
  requireTenantAccess,
  enforcePropertyTenantIsolation,
  requirePropertyPermission('PROPERTIES_VIEW'),
  getPropertyHandler
);

app.post(
  '/tenants/:tenantId/properties/:id/documents',
  authenticate,
  requireTenantAccess,
  enforcePropertyTenantIsolation,
  requirePropertyPermission('PROPERTIES_EDIT'),
  uploadDocumentMiddleware.single('file'),
  uploadDocumentHandler
);

app.get(
  '/tenants/:tenantId/properties/:id/documents',
  authenticate,
  requireTenantAccess,
  enforcePropertyTenantIsolation,
  requirePropertyPermission('PROPERTIES_VIEW'),
  listDocumentsHandler
);

app.use(errorHandler);

const TENANT = 'tenant-1';
const PROPERTY = 'prop-1';
// Chemin tel que le serveur le stocke reellement : disque Windows, et
// l'identifiant de stockage `/uploads/.../documents/...` d'un fichier prive.
const DISK_FILE_PATH = 'D:\\APP\\Immobillier\\uploads\\properties\\prop-1\\documents\\titre.pdf';
const PRIVATE_FILE_URL = `/uploads/properties/${PROPERTY}/documents/titre.pdf`;

function seed() {
  mockPrisma.reset();
  const existingDoc = {
    id: 'pdoc-1',
    propertyId: PROPERTY,
    tenantId: TENANT,
    documentType: 'TITLE_DEED',
    filePath: DISK_FILE_PATH,
    fileUrl: PRIVATE_FILE_URL,
    fileName: 'Titre foncier.pdf',
    fileSize: 4096,
    mimeType: 'application/pdf',
    expirationDate: null,
    isRequired: false,
    isValid: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01')
  };
  mockPrisma.propertyDocument.rows.push(existingDoc);
  mockPrisma.property.rows.push({
    id: PROPERTY,
    tenantId: TENANT,
    ownerUserId: null,
    title: 'Villa Cocody',
    tenant: { id: TENANT, name: 'Agence Demo' },
    owner: null,
    media: [],
    documents: [existingDoc],
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

describe('Documents d’un bien — aucune réponse ne porte de chemin disque', () => {
  it('détail du bien : documents décrits, sans filePath ni fileUrl', async () => {
    const res = await request(app).get(`/tenants/${TENANT}/properties/${PROPERTY}`);

    expect(res.status).toBe(200);
    expect(findDiskPathLeaks(res.body)).toEqual([]);
    expect(res.body.data.documents).toEqual([
      expect.objectContaining({
        id: 'pdoc-1',
        propertyId: PROPERTY,
        documentType: 'TITLE_DEED',
        fileName: 'Titre foncier.pdf',
        isValid: true
      })
    ]);
    expect(res.body.data.documents[0]).not.toHaveProperty('filePath');
    expect(res.body.data.documents[0]).not.toHaveProperty('fileUrl');
  });

  it('liste des documents : sans filePath ni fileUrl', async () => {
    const res = await request(app).get(`/tenants/${TENANT}/properties/${PROPERTY}/documents`);

    expect(res.status).toBe(200);
    expect(findDiskPathLeaks(res.body)).toEqual([]);
    expect(res.body.data[0]).toMatchObject({ id: 'pdoc-1', fileName: 'Titre foncier.pdf' });
    expect(res.body.data[0]).not.toHaveProperty('filePath');
    expect(res.body.data[0]).not.toHaveProperty('fileUrl');
  });

  it('upload (201) : le document créé ne renvoie ni filePath ni fileUrl', async () => {
    const res = await request(app)
      .post(`/tenants/${TENANT}/properties/${PROPERTY}/documents`)
      .field('documentType', 'INSURANCE')
      .attach('file', Buffer.from('%PDF-1.4 contenu de test'), {
        filename: 'assurance.pdf',
        contentType: 'application/pdf'
      });

    expect(res.status).toBe(201);
    expect(findDiskPathLeaks(res.body)).toEqual([]);
    expect(res.body.data.fileName).toBe('assurance.pdf');
    expect(res.body.data.documentType).toBe('INSURANCE');
    expect(res.body.data).not.toHaveProperty('filePath');
    expect(res.body.data).not.toHaveProperty('fileUrl');

    // Le fichier est bien ecrit sur disque (hors chemin reel du depot, via
    // le mock de `getProjectRoot`) : le select ne cache pas une ecriture ratee.
    const writtenDir = path.join(mockRoot, 'uploads', 'properties', PROPERTY, 'documents');
    const writtenFiles = await fsp.readdir(writtenDir);
    expect(writtenFiles.length).toBeGreaterThan(0);
    // Extension derivee du mime type valide, jamais du nom fourni par le client.
    expect(writtenFiles.some(name => name.endsWith('.pdf'))).toBe(true);
  });
});
