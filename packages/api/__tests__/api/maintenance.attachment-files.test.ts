/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Pièces jointes de maintenance — étanchéité, de bout en bout sur HTTP.
 *
 * Avant ce correctif, les pièces étaient servies en statique sous
 * `/uploads/maintenance/<agence>/<ticket>/...` à tout membre OU CLIENT de
 * l'agence : un locataire ouvrait la photo du ticket d'un autre locataire, ou
 * d'un propriétaire, en connaissant l'URL. Elles ne sortent plus que par trois
 * routes qui contrôlent le ticket (lib/maintenance/attachment-files.ts).
 *
 * La pile est la vraie : gardes des portails (`requireTenantPortalAccess`,
 * `requireOwnerPortalAccess`), `requireTenantAccess` + permission sur la route
 * de gestion, garde statique `uploadsAccessGuard` devant `express.static`.
 * Seules changent la session (un en-tête `x-test-user` tient lieu de jeton) et
 * la base, remplacée par la base en mémoire de `helpers/fake-prisma.ts`, qui
 * applique réellement les filtres `where`.
 *
 * Jeu de données :
 *   Agence A — biens P1 (propriétaire Oumar) et P2 ; locataires Awa (bail sur
 *              P1) et Bakary (bail sur P2) ; ticket T_AWA (P1, 2 pièces),
 *              ticket T_BAKARY (P2, 1 pièce) ; gestionnaire Mariam
 *              (MAINTENANCE_ADMIN), collaborateur Ibrahim (sans permission
 *              maintenance).
 *   Agence B — bien PB, ticket T_B (1 pièce) ; gestionnaire Fanta.
 *
 * `tenant_contact_id` des tickets porte l'identifiant du `TenantClient` :
 * c'est la règle de visibilité du portail locataire telle qu'elle est écrite
 * (`getTicketById(tenantId, ticketId, tenantClientId)`), reprise à
 * l'identique par la route des pièces jointes.
 */

import * as os from 'os';
import * as path from 'path';
import { promises as fs } from 'fs';

// Racine des fichiers déposés, lue par config/env au premier import : à
// poser AVANT d'importer l'application.
const UPLOADS_ROOT = path.join(os.tmpdir(), `maintenance-attachments-test-${process.pid}`);
process.env.UPLOADS_DIR = UPLOADS_ROOT;

import express from 'express';
import cookieParser from 'cookie-parser';
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

// La garde statique lit le jeton du cookie : l'identifiant de l'utilisateur
// en tient lieu.
jest.mock('../../src/utils/jwt-utils', () => ({
  verifyToken: (token: string) => (token ? { userId: token, globalRole: 'USER' } : null)
}));

jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: jest.fn(),
  flushAuditQueue: jest.fn()
}));

import maintenanceRoutes from '../../src/routes/maintenance-routes';
import tenantPortalRoutes from '../../src/routes/tenant-portal-routes';
import ownerPortalRoutes from '../../src/routes/owner-portal-routes';
import { uploadsAccessGuard } from '../../src/middleware/uploads-access-middleware';
import { errorHandler } from '../../src/middleware/error-middleware';
import { clearPermissionCache } from '../../src/services/permission-service';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/uploads', uploadsAccessGuard, express.static(UPLOADS_ROOT));
app.use('/api/tenants/:tenantId/maintenance', maintenanceRoutes);
app.use('/api/portal/tenant', tenantPortalRoutes);
app.use('/api/portal/owner', ownerPortalRoutes);
app.use(errorHandler);

// --- Identifiants -----------------------------------------------------------

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

const P1 = 'prop-1';
const P2 = 'prop-2';
const PB = 'prop-b';

const LEASE_AWA = id(11);
const LEASE_BAKARY = id(12);

const T_AWA = id(21);
const T_BAKARY = id(22);
const T_B = id(23);

const ATT_AWA_PHOTO = id(31);
const ATT_AWA_PDF = id(32);
const ATT_BAKARY = id(33);
const ATT_B = id(34);
const ATT_MISSING_FILE = id(35);
const UNKNOWN = id(99);

const USER_AWA = 'user-awa';
const USER_BAKARY = 'user-bakary';
const USER_OUMAR = 'user-oumar';
const USER_MARIAM = 'user-mariam';
const USER_IBRAHIM = 'user-ibrahim';
const USER_FANTA = 'user-fanta';

const TC_AWA = 'tc-awa';
const TC_BAKARY = 'tc-bakary';
const TC_OUMAR = 'tc-oumar';

const PHOTO_AWA = Buffer.from('photo-fuite-awa');
const PDF_AWA = Buffer.from('%PDF-1.4 devis');
const PHOTO_BAKARY = Buffer.from('photo-bakary');
const PHOTO_B = Buffer.from('photo-agence-b');

function fileUrl(tenantId: string, ticketId: string, name: string) {
  return `/uploads/maintenance/${tenantId}/${ticketId}/${name}`;
}

async function writeUpload(url: string, content: Buffer) {
  const absolute = path.join(UPLOADS_ROOT, url.replace(/^\/uploads\//, ''));
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, content);
}

function role(permissions: string[]) {
  return { scope: 'TENANT', permissions: permissions.map(key => ({ permission: { key } })) };
}

function seed() {
  mockPrisma.reset();
  clearPermissionCache();

  const ACTIVE = { status: 'ACTIVE' };
  mockPrisma.tenant.rows.push({ id: TENANT_A, status: 'ACTIVE' }, { id: TENANT_B, status: 'ACTIVE' });

  // Personnel : Mariam (A) et Fanta (B) gèrent la maintenance ; Ibrahim (A)
  // est collaborateur sans permission maintenance.
  mockPrisma.membership.rows.push(
    { id: 'm-1', userId: USER_MARIAM, tenantId: TENANT_A, status: 'ACTIVE' },
    { id: 'm-2', userId: USER_IBRAHIM, tenantId: TENANT_A, status: 'ACTIVE' },
    { id: 'm-3', userId: USER_FANTA, tenantId: TENANT_B, status: 'ACTIVE' }
  );
  mockPrisma.userRole.rows.push(
    { id: 'ur-1', userId: USER_MARIAM, tenantId: TENANT_A, role: role(['MAINTENANCE_ADMIN']) },
    { id: 'ur-2', userId: USER_IBRAHIM, tenantId: TENANT_A, role: role(['PROPERTIES_VIEW']) },
    { id: 'ur-3', userId: USER_FANTA, tenantId: TENANT_B, role: role(['MAINTENANCE_ADMIN']) }
  );

  // Clients du portail de l'agence A.
  mockPrisma.tenantClient.rows.push(
    {
      id: TC_AWA,
      userId: USER_AWA,
      tenantId: TENANT_A,
      clientType: 'RENTER',
      createdAt: new Date('2026-01-01'),
      tenant: ACTIVE
    },
    {
      id: TC_BAKARY,
      userId: USER_BAKARY,
      tenantId: TENANT_A,
      clientType: 'RENTER',
      createdAt: new Date('2026-01-02'),
      tenant: ACTIVE
    },
    {
      id: TC_OUMAR,
      userId: USER_OUMAR,
      tenantId: TENANT_A,
      clientType: 'OWNER',
      createdAt: new Date('2026-01-03'),
      tenant: ACTIVE
    }
  );

  mockPrisma.property.rows.push(
    { id: P1, tenantId: TENANT_A, ownerUserId: USER_OUMAR },
    { id: P2, tenantId: TENANT_A, ownerUserId: null },
    { id: PB, tenantId: TENANT_B, ownerUserId: USER_OUMAR }
  );

  mockPrisma.rentalLease.rows.push(
    {
      id: LEASE_AWA,
      tenant_id: TENANT_A,
      property_id: P1,
      status: 'ACTIVE',
      primary_renter_client_id: TC_AWA,
      owner_client_id: null
    },
    {
      id: LEASE_BAKARY,
      tenant_id: TENANT_A,
      property_id: P2,
      status: 'ACTIVE',
      primary_renter_client_id: TC_BAKARY,
      owner_client_id: null
    }
  );

  mockPrisma.maintenanceTicket.rows.push(
    { id: T_AWA, tenant_id: TENANT_A, property_id: P1, lease_id: LEASE_AWA, tenant_contact_id: TC_AWA },
    { id: T_BAKARY, tenant_id: TENANT_A, property_id: P2, lease_id: LEASE_BAKARY, tenant_contact_id: TC_BAKARY },
    { id: T_B, tenant_id: TENANT_B, property_id: PB, lease_id: null, tenant_contact_id: null }
  );

  mockPrisma.maintenanceTicketAttachment.rows.push(
    {
      id: ATT_AWA_PHOTO,
      tenant_id: TENANT_A,
      ticket_id: T_AWA,
      file_url: fileUrl(TENANT_A, T_AWA, 'fuite.jpg'),
      file_name: 'fuite.jpg',
      mime_type: 'image/jpeg'
    },
    {
      id: ATT_AWA_PDF,
      tenant_id: TENANT_A,
      ticket_id: T_AWA,
      file_url: fileUrl(TENANT_A, T_AWA, 'devis.pdf'),
      file_name: 'devis plombier.pdf',
      // Type déclaré par le navigateur : jamais repris tel quel.
      mime_type: 'text/html'
    },
    {
      id: ATT_BAKARY,
      tenant_id: TENANT_A,
      ticket_id: T_BAKARY,
      file_url: fileUrl(TENANT_A, T_BAKARY, 'salon.jpg'),
      file_name: 'salon.jpg',
      mime_type: 'image/jpeg'
    },
    {
      id: ATT_B,
      tenant_id: TENANT_B,
      ticket_id: T_B,
      file_url: fileUrl(TENANT_B, T_B, 'toit.jpg'),
      file_name: 'toit.jpg',
      mime_type: 'image/jpeg'
    },
    {
      id: ATT_MISSING_FILE,
      tenant_id: TENANT_A,
      ticket_id: T_AWA,
      file_url: fileUrl(TENANT_A, T_AWA, 'absent.jpg'),
      file_name: 'absent.jpg',
      mime_type: 'image/jpeg'
    }
  );
}

beforeAll(async () => {
  await writeUpload(fileUrl(TENANT_A, T_AWA, 'fuite.jpg'), PHOTO_AWA);
  await writeUpload(fileUrl(TENANT_A, T_AWA, 'devis.pdf'), PDF_AWA);
  await writeUpload(fileUrl(TENANT_A, T_BAKARY, 'salon.jpg'), PHOTO_BAKARY);
  await writeUpload(fileUrl(TENANT_B, T_B, 'toit.jpg'), PHOTO_B);
});

afterAll(async () => {
  await fs.rm(UPLOADS_ROOT, { recursive: true, force: true });
});

beforeEach(seed);

const tenantPortalFile = (userId: string, ticketId: string, attachmentId: string) =>
  request(app)
    .get(`/api/portal/tenant/maintenance/${ticketId}/attachments/${attachmentId}`)
    .set('x-test-user', userId);

const ownerPortalFile = (userId: string, ticketId: string, attachmentId: string) =>
  request(app)
    .get(`/api/portal/owner/maintenance/${ticketId}/attachments/${attachmentId}`)
    .set('x-test-user', userId);

const agencyFile = (userId: string, tenantId: string, attachmentId: string) =>
  request(app).get(`/api/tenants/${tenantId}/maintenance/files/${attachmentId}`).set('x-test-user', userId);

describe('portail locataire — seulement les pièces de ses tickets', () => {
  it('le locataire obtient la photo de son ticket, avec le type de son extension', async () => {
    const res = await tenantPortalFile(USER_AWA, T_AWA, ATT_AWA_PHOTO);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['content-disposition']).toContain("filename*=UTF-8''fuite.jpg");
    expect(Buffer.compare(res.body, PHOTO_AWA)).toBe(0);
  });

  it('un PDF déposé avec un type trompeur sort en application/pdf, jamais en text/html', async () => {
    const res = await tenantPortalFile(USER_AWA, T_AWA, ATT_AWA_PDF);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
  });

  it('le locataire A n’obtient pas la pièce du ticket du locataire B (404)', async () => {
    expect((await tenantPortalFile(USER_AWA, T_BAKARY, ATT_BAKARY)).status).toBe(404);
    // Son propre ticket dans l'URL, la pièce d'un autre : même 404.
    expect((await tenantPortalFile(USER_AWA, T_AWA, ATT_BAKARY)).status).toBe(404);
    // Et réciproquement.
    expect((await tenantPortalFile(USER_BAKARY, T_AWA, ATT_AWA_PHOTO)).status).toBe(404);
  });

  it('rien d’une autre agence (404), ni en changeant d’agence par l’en-tête (403)', async () => {
    expect((await tenantPortalFile(USER_AWA, T_B, ATT_B)).status).toBe(404);
    expect((await tenantPortalFile(USER_AWA, T_AWA, ATT_B)).status).toBe(404);
    const viaHeader = await tenantPortalFile(USER_AWA, T_B, ATT_B).set('X-Portal-Tenant-Id', TENANT_B);
    expect(viaHeader.status).toBe(403);
  });

  it('identifiant inconnu, mal formé ou fichier absent du disque : 404', async () => {
    expect((await tenantPortalFile(USER_AWA, T_AWA, UNKNOWN)).status).toBe(404);
    expect((await tenantPortalFile(USER_AWA, 'pas-un-uuid', ATT_AWA_PHOTO)).status).toBe(404);
    expect((await tenantPortalFile(USER_AWA, T_AWA, 'pas-un-uuid')).status).toBe(404);
    expect((await tenantPortalFile(USER_AWA, T_AWA, ATT_MISSING_FILE)).status).toBe(404);
  });

  it('reprend exactement la règle du détail de ticket du portail', async () => {
    for (const [userId, ticketId, attachmentId] of [
      [USER_AWA, T_AWA, ATT_AWA_PHOTO],
      [USER_AWA, T_BAKARY, ATT_BAKARY],
      [USER_BAKARY, T_BAKARY, ATT_BAKARY],
      [USER_BAKARY, T_AWA, ATT_AWA_PHOTO],
      [USER_AWA, T_B, ATT_B]
    ]) {
      const detail = await request(app).get(`/api/portal/tenant/maintenance/${ticketId}`).set('x-test-user', userId);
      const file = await tenantPortalFile(userId, ticketId, attachmentId);
      expect(`${userId} ${ticketId} : ${file.status}`).toBe(`${userId} ${ticketId} : ${detail.status}`);
    }
  });

  it('sans session : 401', async () => {
    const res = await request(app).get(`/api/portal/tenant/maintenance/${T_AWA}/attachments/${ATT_AWA_PHOTO}`);
    expect(res.status).toBe(401);
  });
});

describe('portail propriétaire — seulement les tickets de ses biens', () => {
  it('le propriétaire obtient la pièce d’un ticket de son bien', async () => {
    const res = await ownerPortalFile(USER_OUMAR, T_AWA, ATT_AWA_PHOTO);
    expect(res.status).toBe(200);
    expect(Buffer.compare(res.body, PHOTO_AWA)).toBe(0);
  });

  it('il n’obtient pas celle d’un bien qui n’est pas à lui (404)', async () => {
    expect((await ownerPortalFile(USER_OUMAR, T_BAKARY, ATT_BAKARY)).status).toBe(404);
    expect((await ownerPortalFile(USER_OUMAR, T_AWA, ATT_BAKARY)).status).toBe(404);
  });

  it('rien d’une autre agence, même pour un bien à son nom là-bas (404)', async () => {
    expect((await ownerPortalFile(USER_OUMAR, T_B, ATT_B)).status).toBe(404);
  });

  it('un locataire n’entre pas dans le portail propriétaire (403)', async () => {
    expect((await ownerPortalFile(USER_AWA, T_AWA, ATT_AWA_PHOTO)).status).toBe(403);
  });

  it('reprend exactement la règle du détail de ticket du portail', async () => {
    for (const [ticketId, attachmentId] of [
      [T_AWA, ATT_AWA_PHOTO],
      [T_BAKARY, ATT_BAKARY],
      [T_B, ATT_B]
    ]) {
      const detail = await request(app).get(`/api/portal/owner/maintenance/${ticketId}`).set('x-test-user', USER_OUMAR);
      const file = await ownerPortalFile(USER_OUMAR, ticketId, attachmentId);
      expect(`${ticketId} : ${file.status}`).toBe(`${ticketId} : ${detail.status}`);
    }
  });
});

describe('gestion — personnel avec la permission maintenance', () => {
  it('le gestionnaire obtient toute pièce de son agence', async () => {
    const photo = await agencyFile(USER_MARIAM, TENANT_A, ATT_AWA_PHOTO);
    expect(photo.status).toBe(200);
    expect(Buffer.compare(photo.body, PHOTO_AWA)).toBe(0);
    expect((await agencyFile(USER_MARIAM, TENANT_A, ATT_BAKARY)).status).toBe(200);
  });

  it('rien d’une autre agence : 404 par sa propre agence, 403 par l’autre', async () => {
    expect((await agencyFile(USER_MARIAM, TENANT_A, ATT_B)).status).toBe(404);
    expect((await agencyFile(USER_MARIAM, TENANT_B, ATT_B)).status).toBe(403);
    expect((await agencyFile(USER_FANTA, TENANT_B, ATT_AWA_PHOTO)).status).toBe(404);
  });

  it('un collaborateur sans permission maintenance est refusé (403)', async () => {
    expect((await agencyFile(USER_IBRAHIM, TENANT_A, ATT_AWA_PHOTO)).status).toBe(403);
  });

  it('un client du portail ne passe plus par la route de gestion (403)', async () => {
    // `requireTenantAccess` accepte un TenantClient : sans la permission, un
    // locataire ouvrait ici n'importe quelle pièce de l'agence.
    expect((await agencyFile(USER_AWA, TENANT_A, ATT_BAKARY)).status).toBe(403);
    expect((await agencyFile(USER_OUMAR, TENANT_A, ATT_BAKARY)).status).toBe(403);
  });

  it('le paramètre tenantContactId n’a plus d’effet', async () => {
    const res = await request(app)
      .get(`/api/tenants/${TENANT_A}/maintenance/files/${ATT_BAKARY}?tenantContactId=${TC_AWA}`)
      .set('x-test-user', USER_MARIAM);
    expect(res.status).toBe(200);
  });
});

