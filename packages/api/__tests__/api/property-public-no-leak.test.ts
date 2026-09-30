/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * `/public/properties` (sans authentification) : le détail d'un bien publié ne
 * porte ni documents (titre de propriété, diagnostics), ni `tenantId`,
 * `ownerUserId`, `internalReference`, ni `filePath` de média. Une panne
 * interne ne renvoie jamais son message brut.
 */
import express from 'express';
import request from 'supertest';
import { createFakePrisma } from '../helpers/fake-prisma';
import { findDiskPathLeaks } from '../helpers/disk-path-leaks';

const mockPrisma = createFakePrisma();
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), flushAuditQueue: jest.fn() }));
jest.mock('../../src/services/property-service', () => ({ getPropertyById: jest.fn() }));
jest.mock('../../src/services/whatsapp-group-automation-service', () => ({
  sendPropertyPublishedGroupBroadcast: jest.fn()
}));

import publicRoutes from '../../src/routes/property-public-routes';
import { errorHandler } from '../../src/middleware/error-middleware';

const app = express();
app.use(publicRoutes);
app.use(errorHandler);

const DISK = 'D:\\APP\\Immobillier\\titre.pdf';

function seed() {
  mockPrisma.reset();
  mockPrisma.property.rows.push({
    id: 'prop-1',
    internalReference: 'INT-SECRET-1',
    tenantId: 'tenant-1',
    ownerUserId: 'owner-1',
    partnershipId: 'p-1',
    title: 'Villa Cocody',
    description: 'Belle villa',
    address: 'Cocody',
    price: 100,
    status: 'AVAILABLE',
    isPublished: true,
    media: [
      {
        id: 'm1',
        propertyId: 'prop-1',
        tenantId: 'tenant-1',
        mediaType: 'PHOTO',
        fileUrl: '/uploads/properties/prop-1/a.jpg',
        filePath: 'D:\\APP\\a.jpg',
        fileName: 'a.jpg',
        displayOrder: 0,
        isPrimary: true
      }
    ],
    documents: [
      {
        id: 'd1',
        documentType: 'TITLE_DEED',
        filePath: DISK,
        fileUrl: '/uploads/properties/prop-1/documents/titre.pdf',
        tenantId: 'tenant-1',
        isValid: true
      }
    ]
  });
}

beforeEach(seed);

describe('GET /public/properties/:id', () => {
  it('ne renvoie ni documents, ni tenantId, ni ownerUserId, ni chemin disque', async () => {
    const res = await request(app).get('/public/properties/prop-1');
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(res.body.data.title).toBe('Villa Cocody');
    expect(res.body.data.documents).toBeUndefined();
    expect(body).not.toContain('tenant-1');
    expect(body).not.toContain('owner-1');
    expect(body).not.toContain('INT-SECRET-1');
    expect(body).not.toContain('filePath');
    expect(findDiskPathLeaks(res.body)).toEqual([]);
  });

  it('la liste publique ne renvoie pas non plus de champ privé', async () => {
    const res = await request(app).get('/public/properties');
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('tenant-1');
    expect(body).not.toContain('owner-1');
    expect(body).not.toContain('filePath');
  });

  it('un bien inconnu répond 404 typé', async () => {
    const res = await request(app).get('/public/properties/inconnu');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('une panne interne ne renvoie pas son message brut', async () => {
    const spy = jest
      .spyOn(mockPrisma.property, 'findFirst')
      .mockRejectedValueOnce(new Error('relation "properties" does not exist at D:\\APP\\x.ts:12'));
    const res = await request(app).get('/public/properties/prop-1');
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/properties|D:|x\.ts/);
  });
});
