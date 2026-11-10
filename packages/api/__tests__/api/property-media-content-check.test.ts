/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * SUR-01 : le contenu d'un média de bien doit correspondre à son type déclaré,
 * et l'extension stockée vient du type réel, jamais de `originalname`.
 */
import * as os from 'os';
import * as path from 'path';
import { promises as fsp } from 'fs';
import express from 'express';
import request from 'supertest';
import { createFakePrisma } from '../helpers/fake-prisma';

const mockRoot = path.join(os.tmpdir(), `property-media-content-check-${process.pid}`);

jest.mock('../../src/utils/project-root', () => ({ getProjectRoot: () => mockRoot }));

const mockPrisma = createFakePrisma();
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), flushAuditQueue: jest.fn() }));
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
import { uploadMediaHandler } from '../../src/controllers/property-media-controller';
import { errorHandler } from '../../src/middleware/error-middleware';

const app = express();
app.use(express.json());
app.post(
  '/tenants/:tenantId/properties/:id/media',
  authenticate,
  requireTenantAccess,
  enforcePropertyTenantIsolation,
  uploadMediaMiddleware.single('file'),
  uploadMediaHandler
);
app.use(errorHandler);

const TENANT = 'tenant-1';
const PROPERTY = 'prop-1';
const PNG = Buffer.from('89504e470d0a1a0a0000000d', 'hex');
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom')]);
const HTML = Buffer.from('<html><script>alert(document.cookie)</script></html>');
const uploadDir = path.join(mockRoot, 'uploads', 'properties', PROPERTY);

function post(mediaType: string, buffer: Buffer, filename: string, contentType: string) {
  return request(app)
    .post(`/tenants/${TENANT}/properties/${PROPERTY}/media`)
    .field('mediaType', mediaType)
    .attach('file', buffer, { filename, contentType });
}

async function writtenFiles(): Promise<string[]> {
  try {
    return await fsp.readdir(uploadDir);
  } catch {
    return [];
  }
}

beforeEach(async () => {
  mockPrisma.reset();
  mockPrisma.property.rows.push({ id: PROPERTY, tenantId: TENANT, ownerUserId: null, title: 'Villa' });
  await fsp.rm(mockRoot, { recursive: true, force: true });
});
afterAll(async () => {
  await fsp.rm(mockRoot, { recursive: true, force: true });
});

describe('uploadMedia — contrôle du contenu', () => {
  it('PNG valide : extension .png dérivée même si originalname = x.html', async () => {
    const res = await post('PHOTO', PNG, 'x.html', 'image/png');
    expect(res.status).toBe(201);
    expect(res.body.data.fileUrl).toMatch(/\.png$/);
    expect(await writtenFiles()).toEqual([expect.stringMatching(/\.png$/)]);
  });

  it('HTML déclaré image/png : 400 et rien écrit sur le disque', async () => {
    const res = await post('PHOTO', HTML, 'x.png', 'image/png');
    expect(res.status).toBe(400);
    expect(await writtenFiles()).toEqual([]);
    expect(mockPrisma.propertyMedia.rows).toHaveLength(0);
  });

  it('MP4 (ftyp) déclaré video/mp4 : accepté en .mp4', async () => {
    const res = await post('VIDEO', MP4, 'v.html', 'video/mp4');
    expect(res.status).toBe(201);
    expect(res.body.data.fileUrl).toMatch(/\.mp4$/);
  });

  it('image déclarée video/mp4 : refusée', async () => {
    const res = await post('VIDEO', PNG, 'v.mp4', 'video/mp4');
    expect(res.status).toBe(400);
    expect(await writtenFiles()).toEqual([]);
  });

  it('mime image/jpeg mais octets PNG : 400', async () => {
    const res = await post('PHOTO', PNG, 'p.jpg', 'image/jpeg');
    expect(res.status).toBe(400);
    expect(await writtenFiles()).toEqual([]);
  });
});
