/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Réponses des portails locataire et propriétaire : aucun chemin disque.
 *
 * Les réponses qui décrivent un fichier (médias et documents d'un bien,
 * documents locatifs, pièces jointes de maintenance) rendaient la ligne
 * entière : `filePath` / `file_path` (chemin absolu sur le serveur) et
 * l'identifiant de stockage `/uploads/...` d'un fichier privé. Elles passent
 * désormais par un `select` explicite (lib/files/portal-files.ts) : nom, type,
 * taille, date, et `downloadPath` quand une route authentifiée sert le fichier.
 *
 * La base en mémoire (`helpers/fake-prisma.ts`) applique `select` : chaque
 * ligne y porte volontairement des chemins disque et des URL de stockage, qui
 * ressortiraient dans la réponse si un `select` manquait.
 * Le portail copropriétaire est couvert par `syndics.coowner-portal.test.ts`,
 * avec le même contrôle (`helpers/disk-path-leaks.ts`).
 */

import express from 'express';
import request from 'supertest';
import { createFakePrisma } from '../helpers/fake-prisma';
import { findDiskPathLeaks } from '../helpers/disk-path-leaks';

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

jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: jest.fn(),
  flushAuditQueue: jest.fn()
}));

import tenantPortalRoutes from '../../src/routes/tenant-portal-routes';
import ownerPortalRoutes from '../../src/routes/owner-portal-routes';
import { errorHandler } from '../../src/middleware/error-middleware';

const app = express();
app.use(express.json());
app.use('/api/portal/tenant', tenantPortalRoutes);
app.use('/api/portal/owner', ownerPortalRoutes);
app.use(errorHandler);

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const TENANT_A = 'tenant-a';
const P1 = 'prop-1';
const LEASE = id(11);
const TICKET = id(21);
const USER_AWA = 'user-awa';
const USER_OUMAR = 'user-oumar';

// Des chemins tels que le serveur les stocke : disque Windows, disque Unix,
// identifiants de stockage de fichiers privés.
const DISK = 'D:\\APP\\Immobillier\\uploads';

function seed() {
  mockPrisma.reset();
  const ACTIVE = { status: 'ACTIVE' };
  mockPrisma.tenant.rows.push({ id: TENANT_A, status: 'ACTIVE' });
  mockPrisma.tenantClient.rows.push(
    {
      id: 'tc-awa',
      userId: USER_AWA,
      tenantId: TENANT_A,
      clientType: 'RENTER',
      createdAt: new Date('2026-01-01'),
      tenant: ACTIVE,
      user: { email: 'awa@example.com' }
    },
    {
      id: 'tc-oumar',
      userId: USER_OUMAR,
      tenantId: TENANT_A,
      clientType: 'OWNER',
      createdAt: new Date('2026-01-02'),
      tenant: ACTIVE
    }
  );
  mockPrisma.crmContact.rows.push({ id: 'contact-awa', tenantId: TENANT_A, email: 'awa@example.com' });

  const media = {
    id: 'media-1',
    propertyId: P1,
    mediaType: 'PHOTO',
    filePath: `${DISK}\\properties\\${P1}\\salon.jpg`,
    fileUrl: `/uploads/properties/${P1}/salon.jpg`,
    fileName: 'salon.jpg',
    fileSize: 2048,
    mimeType: 'image/jpeg',
    displayOrder: 0,
    isPrimary: true,
    createdAt: new Date()
  };
  const propertyDocument = {
    id: 'pdoc-1',
    propertyId: P1,
    documentType: 'TITLE_DEED',
    filePath: `${DISK}\\properties\\${P1}\\documents\\titre.pdf`,
    fileUrl: `/uploads/properties/${P1}/documents/titre.pdf`,
    fileName: 'Titre foncier.pdf',
    fileSize: 4096,
    mimeType: 'application/pdf',
    expirationDate: null,
    isValid: true,
    createdAt: new Date()
  };
  mockPrisma.property.rows.push({
    id: P1,
    tenantId: TENANT_A,
    ownerUserId: USER_OUMAR,
    title: 'Villa Cocody',
    address: 'Cocody',
    media: [media],
    documents: [propertyDocument]
  });

  mockPrisma.rentalLease.rows.push({
    id: LEASE,
    tenant_id: TENANT_A,
    property_id: P1,
    status: 'ACTIVE',
    primary_renter_client_id: 'tc-awa',
    owner_client_id: null,
    end_date: null,
    property: { id: P1, address: 'Cocody', title: 'Villa Cocody' },
    coRenters: []
  });

  mockPrisma.rentalDocument.rows.push({
    id: id(31),
    tenant_id: TENANT_A,
    lease_id: LEASE,
    type: 'RENT_RECEIPT',
    status: 'ISSUED',
    document_number: 'Q-2026-001',
    title: 'Quittance avril',
    mime_type: 'application/pdf',
    file_path: '/srv/immotopia/storage/documents/tenant-a/Q-2026-001.pdf',
    file_url: '/uploads/documents/tenant-a/Q-2026-001.pdf',
    file_key: 'tenant-a/Q-2026-001.pdf',
    issued_at: new Date('2026-04-30'),
    created_at: new Date('2026-04-30'),
    lease: { id: LEASE, lease_number: 'BAIL-1', property_id: P1, property: { id: P1, address: 'Cocody' } }
  });

  const attachment = {
    id: id(41),
    tenant_id: TENANT_A,
    ticket_id: TICKET,
    file_url: `/uploads/maintenance/${TENANT_A}/${TICKET}/fuite.jpg`,
    file_name: 'fuite.jpg',
    mime_type: 'image/jpeg',
    file_size: 1024,
    created_at: new Date()
  };
  mockPrisma.maintenanceTicket.rows.push({
    id: TICKET,
    tenant_id: TENANT_A,
    property_id: P1,
    lease_id: LEASE,
    tenant_contact_id: 'contact-awa',
    created_by_contact_id: 'contact-awa',
    status: 'DECLARED',
    title: 'Fuite',
    category: 'PLUMBING',
    priority: 'HIGH',
    description: 'Fuite sous l’évier',
    created_at: new Date(),
    property: { id: P1, address: 'Cocody', title: 'Villa Cocody' },
    attachments: [attachment],
    comments: [],
    statusHistory: []
  });
  mockPrisma.maintenanceTicketAttachment.rows.push(attachment);
}

beforeEach(seed);

async function expectClean(userId: string, path: string) {
  const res = await request(app).get(path).set('x-test-user', userId);
  expect(`${path} : ${res.status}`).toBe(`${path} : 200`);
  expect(findDiskPathLeaks(res.body)).toEqual([]);
  return res.body.data;
}

describe('portail locataire — aucune réponse ne porte de chemin disque', () => {
  it('bail : documents décrits, avec la route de téléchargement', async () => {
    const data = await expectClean(USER_AWA, '/api/portal/tenant/lease');
    expect(data.documents[0]).toMatchObject({
      id: id(31),
      title: 'Quittance avril',
      downloadPath: `/portal/tenant/documents/${id(31)}/download`
    });
  });

  it('documents', async () => {
    const data = await expectClean(USER_AWA, '/api/portal/tenant/documents');
    expect(data.documents[0].downloadPath).toBe(`/portal/tenant/documents/${id(31)}/download`);
  });

  it('détail d’un ticket : pièces jointes sans URL de stockage', async () => {
    const data = await expectClean(USER_AWA, `/api/portal/tenant/maintenance/${TICKET}`);
    expect(data.attachments).toEqual([
      expect.objectContaining({
        id: id(41),
        file_name: 'fuite.jpg',
        downloadPath: `/portal/tenant/maintenance/${TICKET}/attachments/${id(41)}`
      })
    ]);
  });
});

describe('portail propriétaire — aucune réponse ne porte de chemin disque', () => {
  it('détail d’un bien : médias publics, documents décrits sans chemin ni URL', async () => {
    const data = await expectClean(USER_OUMAR, `/api/portal/owner/properties/${P1}`);
    expect(data.property.media[0].fileUrl).toBe(`/uploads/properties/${P1}/salon.jpg`);
    expect(data.property.documents[0]).toEqual(
      expect.objectContaining({ id: 'pdoc-1', fileName: 'Titre foncier.pdf', documentType: 'TITLE_DEED' })
    );
    expect(data.property.documents[0]).not.toHaveProperty('fileUrl');
  });

  it('détail d’un ticket', async () => {
    const data = await expectClean(USER_OUMAR, `/api/portal/owner/maintenance/${TICKET}`);
    expect(data.ticket.attachments[0].downloadPath).toBe(`/portal/owner/maintenance/${TICKET}/attachments/${id(41)}`);
  });

  it('documents', async () => {
    const data = await expectClean(USER_OUMAR, '/api/portal/owner/documents');
    expect(data.documents[0]).toMatchObject({
      downloadPath: `/portal/owner/documents/${id(31)}/download`,
      lease: { property: { address: 'Cocody' } }
    });
  });
});

describe('findDiskPathLeaks — le contrôle lui-même', () => {
  it('repère clés et chaînes interdites, laisse passer les médias publics', () => {
    expect(
      findDiskPathLeaks({
        a: { filePath: 'x' },
        b: 'C:\\srv\\uploads\\x.pdf',
        c: '/srv/app/uploads/maintenance/x.jpg',
        d: '/uploads/maintenance/t/k/x.jpg',
        e: '/uploads/properties/p1/documents/t.pdf',
        ok: [
          '/uploads/properties/p1/photo.jpg',
          '/uploads/properties/agency-logos/t/logo.png',
          'https://exemple.ci/reglement.pdf',
          'Titre'
        ]
      })
    ).toEqual([
      '$.a.filePath (clé interdite)',
      '$.b = C:\\srv\\uploads\\x.pdf',
      '$.c = /srv/app/uploads/maintenance/x.jpg',
      '$.d = /uploads/maintenance/t/k/x.jpg',
      '$.e = /uploads/properties/p1/documents/t.pdf'
    ]);
  });
});
