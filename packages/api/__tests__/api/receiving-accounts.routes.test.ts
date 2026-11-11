/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Spec 048, lot Q : comptes de réception à travers les VRAIS routeurs (contrat §3 et §6).
 *
 * La pile est la vraie : `requireTenantAccess` + `requirePermission` sur les routes de gestion de
 * l'agence, `requireTenantPortalAccess` et `requireCoOwnerPortalAccess` sur les portails, limiteurs,
 * multer, contrôleurs, services et fichiers. Seules changent la session (un en-tête `x-test-user`
 * tient lieu de jeton, absent = 401 comme `authenticate`) et la base, remplacée par la base en mémoire
 * qui applique réellement les filtres `where` (`__tests__/helpers/fake-prisma.ts`).
 *
 * Vérifie : l'image du QR n'est jamais servie sans session (401) ni sans droit ou portail (403) ; un
 * compte d'une autre agence, d'une copropriété hors périmètre ou inactif rend 404 ; aucune réponse de
 * portail ne porte `qrFileUrl`, `qrSha256`, `/uploads/` ni un chemin disque ; la version attendue
 * (`expectedUpdatedAt`) protège une modification concurrente.
 */

import * as os from 'os';
import * as path from 'path';
import { promises as fs } from 'fs';

// Racine des fichiers déposés, lue par config/env au premier import : à poser AVANT l'application.
const UPLOADS_ROOT = path.join(os.tmpdir(), `receiving-accounts-routes-${process.pid}`);
process.env.UPLOADS_DIR = UPLOADS_ROOT;

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

const mockAuditEvents: any[] = [];
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (entry: any) => mockAuditEvents.push(entry),
  recordAuditEvent: jest.fn(),
  flushAuditQueue: jest.fn()
}));

import tenantPortalRoutes from '../../src/routes/tenant-portal-routes';
import coOwnerPortalRoutes from '../../src/routes/coowner-portal-routes';
import agencySettingsRoutes from '../../src/routes/agency-settings-routes';
import { errorHandler } from '../../src/middleware/error-middleware';
import { clearPermissionCache } from '../../src/services/permission-service';

const app = express();
app.use(express.json());
app.use('/api/portal/tenant', tenantPortalRoutes);
app.use('/api/portal/copropriete', coOwnerPortalRoutes);
app.use('/api', agencySettingsRoutes);
app.use(errorHandler);

// --- Jeu de données -----------------------------------------------------------

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const USER_MANAGER_A = 'user-mariam';
const USER_MANAGER_B = 'user-koffi';
const USER_RENTER = 'user-awa';
const USER_COOWNER = 'user-bakary';
const USER_NOBODY = 'user-inconnu';

const S1 = id(101); // copropriété de l'agence A, dans le périmètre de Bakary
const S2 = id(102); // copropriété de l'agence A, hors périmètre de Bakary
const SB = id(103); // copropriété de l'agence B
const LOT_S1 = id(201);
const LEASE = id(301);

const ACC_AGENCY_A = id(401);
const ACC_AGENCY_A_INACTIVE = id(402);
const ACC_AGENCY_B = id(403);
const ACC_S1 = id(404);
const ACC_S1_INACTIVE = id(405);
const ACC_S2 = id(406);
const ACC_SB = id(407);
const UNKNOWN = id(499);

const SHA = 'f'.repeat(64);

/** PNG 1×1 valide (signature lue sur le contenu par le service). */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

const user = (userId: string, email: string) => ({
  id: userId,
  email,
  fullName: userId,
  globalRole: 'USER',
  emailVerified: true,
  isActive: true,
  preferredLanguage: null
});

const manager = (userId: string, tenantId: string, n: number) => {
  mockPrisma.membership.rows.push({ id: `m-${n}`, userId, tenantId, status: 'ACTIVE' });
  mockPrisma.userRole.rows.push({
    id: `ur-${n}`,
    userId,
    tenantId,
    role: {
      scope: 'TENANT',
      permissions: [{ permission: { key: 'TENANT_SETTINGS_VIEW' } }, { permission: { key: 'TENANT_SETTINGS_EDIT' } }]
    }
  });
};

/** Écrit l'image sur le disque et rend son identifiant de stockage. */
async function storedQr(tenantId: string, name: string): Promise<string> {
  const folder = path.join(UPLOADS_ROOT, 'receiving-accounts', tenantId);
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, name), PNG);
  return `/uploads/receiving-accounts/${tenantId}/${name}`;
}

async function account(
  accountId: string,
  tenantId: string,
  syndicateId: string | null,
  extra: Record<string, unknown> = {}
) {
  mockPrisma.receivingAccount.rows.push({
    id: accountId,
    tenantId,
    scope: syndicateId ? 'SYNDICATE' : 'AGENCY',
    syndicateId,
    institution: `Wave ${accountId.slice(-3)}`,
    scannableWith: 'Application Wave',
    alias: '341c3e1b-8f2a-4b6d-9c1e-5a7d2f0b3c44',
    holderName: 'Agence Soleil',
    instructions: null,
    qrFileUrl: await storedQr(tenantId, `${accountId}.png`),
    qrMimeType: 'image/png',
    qrSha256: SHA,
    isActive: true,
    sortOrder: 0,
    createdAt: new Date('2026-11-01T10:00:00.000Z'),
    updatedAt: new Date('2026-11-01T10:00:00.000Z'),
    ...extra
  });
}

async function seed() {
  mockPrisma.reset();
  clearPermissionCache();
  mockAuditEvents.length = 0;
  await fs.rm(UPLOADS_ROOT, { recursive: true, force: true });

  mockPrisma.tenant.rows.push(
    { id: TENANT_A, name: 'Agence Plateau', status: 'ACTIVE', type: 'AGENCY' },
    { id: TENANT_B, name: 'Agence Cocody', status: 'ACTIVE', type: 'AGENCY' }
  );
  mockPrisma.user.rows.push(
    user(USER_MANAGER_A, 'mariam@agence.ci'),
    user(USER_MANAGER_B, 'koffi@agence.ci'),
    user(USER_RENTER, 'awa@example.com'),
    user(USER_COOWNER, 'bakary@example.com'),
    user(USER_NOBODY, 'inconnu@example.com')
  );
  manager(USER_MANAGER_A, TENANT_A, 1);
  manager(USER_MANAGER_B, TENANT_B, 2);

  // Locataire de l'agence A, bail actif.
  mockPrisma.tenantClient.rows.push({
    id: 'tc-awa',
    userId: USER_RENTER,
    tenantId: TENANT_A,
    clientType: 'RENTER',
    createdAt: new Date('2026-01-01'),
    tenant: { status: 'ACTIVE' }
  });
  mockPrisma.rentalLease.rows.push({
    id: LEASE,
    tenant_id: TENANT_A,
    property_id: 'prop-1',
    status: 'ACTIVE',
    primary_renter_client_id: 'tc-awa',
    start_date: new Date('2026-01-01'),
    coRenters: []
  });

  // Copropriétaire de l'agence A, lot dans S1 seulement.
  mockPrisma.crmContact.rows.push({
    id: 'contact-bakary',
    tenantId: TENANT_A,
    firstName: 'Bakary',
    lastName: 'Traoré',
    legalName: null,
    email: 'bakary@example.com'
  });
  mockPrisma.tenantClient.rows.push({
    id: 'tc-bakary',
    userId: USER_COOWNER,
    tenantId: TENANT_A,
    clientType: 'CO_OWNER',
    createdAt: new Date('2026-01-01'),
    tenant: { status: 'ACTIVE' },
    details: { crmContactId: 'contact-bakary', syndicCoOwnerContactIds: ['contact-bakary'] }
  });
  mockPrisma.syndicate.rows.push(
    { id: S1, tenantId: TENANT_A, name: 'Résidence Les Acacias', address: 'Plateau' },
    { id: S2, tenantId: TENANT_A, name: 'Résidence Les Palmiers', address: 'Plateau' },
    { id: SB, tenantId: TENANT_B, name: 'Résidence Cocody', address: 'Cocody' }
  );
  mockPrisma.syndicateLot.rows.push({
    id: LOT_S1,
    syndicateId: S1,
    lotNumber: 'A1',
    lotType: 'APARTMENT',
    generalShares: 1000,
    specialShares: null,
    coownerId: 'contact-bakary',
    ownerContactId: 'contact-bakary'
  });
  mockPrisma.lotOwnerProfile.rows.push({
    id: id(501),
    lotId: LOT_S1,
    contactId: 'contact-bakary',
    ownershipPercentage: 100,
    ownedSince: new Date('2026-01-01'),
    ownedUntil: null,
    portalAccessEnabled: true,
    portalAccessToken: 'token-bakary',
    isActive: true,
    createdAt: new Date('2026-01-01')
  });

  await account(ACC_AGENCY_A, TENANT_A, null);
  await account(ACC_AGENCY_A_INACTIVE, TENANT_A, null, { isActive: false, sortOrder: 1 });
  await account(ACC_AGENCY_B, TENANT_B, null);
  await account(ACC_S1, TENANT_A, S1);
  await account(ACC_S1_INACTIVE, TENANT_A, S1, { isActive: false });
  await account(ACC_S2, TENANT_A, S2);
  await account(ACC_SB, TENANT_B, SB);
}

beforeEach(seed);

afterAll(async () => {
  await fs.rm(UPLOADS_ROOT, { recursive: true, force: true });
});

const get = (url: string, userId?: string) => {
  const req = request(app).get(url);
  return userId ? req.set('x-test-user', userId) : req;
};

const agencyQr = (tenantId: string, accountId: string) =>
  `/api/tenants/${tenantId}/settings/receiving-accounts/${accountId}/qr`;
const tenantPortalQr = (accountId: string) => `/api/portal/tenant/receiving-accounts/${accountId}/qr`;
const coOwnerPortalQr = (accountId: string) => `/api/portal/copropriete/receiving-accounts/${accountId}/qr`;

/** Aucune réponse de portail ne porte de clé de stockage, d'empreinte ni de chemin. */
function expectNoStorageLeak(body: unknown) {
  expect(findDiskPathLeaks(body)).toEqual([]);
  const serialized = JSON.stringify(body);
  for (const forbidden of ['qrFileUrl', 'qrSha256', 'qrMimeType', '/uploads/', SHA, UPLOADS_ROOT]) {
    expect(serialized).not.toContain(forbidden);
  }
}

// ---------------------------------------------------------------------------

describe('image du QR : jamais servie sans session ni sans droit', () => {
  it('sans session : 401 sur les trois routes d’image et les listes', async () => {
    for (const url of [
      agencyQr(TENANT_A, ACC_AGENCY_A),
      tenantPortalQr(ACC_AGENCY_A),
      coOwnerPortalQr(ACC_S1),
      `/api/tenants/${TENANT_A}/settings/receiving-accounts`,
      '/api/portal/tenant/receiving-accounts',
      '/api/portal/copropriete/receiving-accounts'
    ]) {
      const res = await get(url);
      expect(`${url} : ${res.status}`).toBe(`${url} : 401`);
      expect(res.headers['content-type']).not.toMatch(/^image\//);
    }
  });

  it('session sans droit ni portail : 403, jamais l’image', async () => {
    const cases: Array<[string, string]> = [
      // Le locataire et le copropriétaire n'ont pas TENANT_SETTINGS_VIEW.
      [agencyQr(TENANT_A, ACC_AGENCY_A), USER_RENTER],
      [agencyQr(TENANT_A, ACC_AGENCY_A), USER_COOWNER],
      // Un inconnu et le gestionnaire d'une autre agence ne sont pas membres de l'agence A.
      [agencyQr(TENANT_A, ACC_AGENCY_A), USER_NOBODY],
      [agencyQr(TENANT_A, ACC_AGENCY_A), USER_MANAGER_B],
      // Un gestionnaire n'a pas de portail locataire ni copropriétaire.
      [tenantPortalQr(ACC_AGENCY_A), USER_MANAGER_A],
      [coOwnerPortalQr(ACC_S1), USER_MANAGER_A],
      // Le locataire n'est pas copropriétaire, et inversement.
      [coOwnerPortalQr(ACC_S1), USER_RENTER],
      [tenantPortalQr(ACC_AGENCY_A), USER_COOWNER]
    ];
    for (const [url, userId] of cases) {
      const res = await get(url, userId);
      expect(`${userId} ${url} : ${res.status}`).toBe(`${userId} ${url} : 403`);
      expect(res.headers['content-type']).not.toMatch(/^image\//);
    }
  });

  it('avec le droit ou le portail : l’image part en privé', async () => {
    for (const [url, userId] of [
      [agencyQr(TENANT_A, ACC_AGENCY_A), USER_MANAGER_A],
      [tenantPortalQr(ACC_AGENCY_A), USER_RENTER],
      [coOwnerPortalQr(ACC_S1), USER_COOWNER]
    ]) {
      const res = await get(url, userId);
      expect(`${url} : ${res.status}`).toBe(`${url} : 200`);
      expect(res.headers['content-type']).toBe('image/png');
      expect(res.headers['cache-control']).toBe('private, no-store');
    }
  });
});

describe('compte d’une autre agence, hors périmètre ou inactif : 404', () => {
  it('gestion : le compte d’une autre agence, demandé sous sa propre agence, est introuvable', async () => {
    expect((await get(agencyQr(TENANT_B, ACC_AGENCY_A), USER_MANAGER_B)).status).toBe(404);
    expect((await get(agencyQr(TENANT_A, ACC_AGENCY_B), USER_MANAGER_A)).status).toBe(404);
    // Un compte de copropriété n'est pas atteignable par la route de l'agence.
    expect((await get(agencyQr(TENANT_A, ACC_S1), USER_MANAGER_A)).status).toBe(404);
    expect((await get(agencyQr(TENANT_A, UNKNOWN), USER_MANAGER_A)).status).toBe(404);
    // La gestion voit aussi un compte inactif.
    expect((await get(agencyQr(TENANT_A, ACC_AGENCY_A_INACTIVE), USER_MANAGER_A)).status).toBe(200);
  });

  it('portail locataire : autre agence, inactif, copropriété ou inexistant = même 404', async () => {
    for (const accountId of [ACC_AGENCY_B, ACC_AGENCY_A_INACTIVE, ACC_S1, UNKNOWN]) {
      const res = await get(tenantPortalQr(accountId), USER_RENTER);
      expect(`${accountId} : ${res.status}`).toBe(`${accountId} : 404`);
    }
  });

  it('portail copropriétaire : autre agence, hors périmètre, inactif, agence ou inexistant = même 404', async () => {
    for (const accountId of [ACC_SB, ACC_S2, ACC_S1_INACTIVE, ACC_AGENCY_A, UNKNOWN]) {
      const res = await get(coOwnerPortalQr(accountId), USER_COOWNER);
      expect(`${accountId} : ${res.status}`).toBe(`${accountId} : 404`);
    }
    // Filtre sur une copropriété hors périmètre : 404 aussi.
    expect((await get(`/api/portal/copropriete/receiving-accounts?syndicId=${S2}`, USER_COOWNER)).status).toBe(404);
  });
});

describe('listes des portails : aucun chemin de stockage', () => {
  it('portail locataire : comptes actifs de l’agence seulement, sans qrFileUrl ni empreinte', async () => {
    const res = await get('/api/portal/tenant/receiving-accounts', USER_RENTER);
    expect(res.status).toBe(200);
    expect(res.body.data.map((a: any) => a.id)).toEqual([ACC_AGENCY_A]);
    expect(res.body.data[0].qrPath).toBe(tenantPortalQr(ACC_AGENCY_A));
    expectNoStorageLeak(res.body);
  });

  it('portail copropriétaire : comptes actifs des copropriétés du périmètre seulement', async () => {
    const res = await get('/api/portal/copropriete/receiving-accounts', USER_COOWNER);
    expect(res.status).toBe(200);
    expect(res.body.data.map((a: any) => a.id)).toEqual([ACC_S1]);
    expect(res.body.data[0]).toMatchObject({ syndicateId: S1, qrPath: coOwnerPortalQr(ACC_S1) });
    expectNoStorageLeak(res.body);
    const filtered = await get(`/api/portal/copropriete/receiving-accounts?syndicId=${S1}`, USER_COOWNER);
    expect(filtered.body.data.map((a: any) => a.id)).toEqual([ACC_S1]);
    expectNoStorageLeak(filtered.body);
  });

  it('gestion : la liste ne porte ni qrFileUrl ni empreinte non plus', async () => {
    const res = await get(`/api/tenants/${TENANT_A}/settings/receiving-accounts`, USER_MANAGER_A);
    expect(res.status).toBe(200);
    expect(res.body.data.map((a: any) => a.id).sort()).toEqual([ACC_AGENCY_A, ACC_AGENCY_A_INACTIVE].sort());
    expectNoStorageLeak(res.body);
  });
});

describe('modification concurrente par HTTP (expectedUpdatedAt)', () => {
  const url = `/api/tenants/${TENANT_A}/settings/receiving-accounts/${ACC_AGENCY_A}`;
  const opened = '2026-11-01T10:00:00.000Z';

  it('version périmée : 409, rien n’est écrit ni journalisé', async () => {
    const first = await request(app)
      .put(url)
      .set('x-test-user', USER_MANAGER_A)
      .field('instructions', 'Premier formulaire')
      .field('expectedUpdatedAt', opened);
    expect(first.status).toBe(200);
    expect(first.body.data.updatedAt).not.toBe(opened);
    mockAuditEvents.length = 0;

    const stale = await request(app)
      .put(url)
      .set('x-test-user', USER_MANAGER_A)
      .field('alias', '0701020304')
      .field('expectedUpdatedAt', opened)
      .attach('qr', PNG, { filename: 'nouveau.png', contentType: 'image/png' });
    expect(stale.status).toBe(409);
    const row = mockPrisma.receivingAccount.rows.find((r: any) => r.id === ACC_AGENCY_A);
    expect(row).toMatchObject({ alias: '341c3e1b-8f2a-4b6d-9c1e-5a7d2f0b3c44', instructions: 'Premier formulaire' });
    expect(row?.qrFileUrl).toBe(`/uploads/receiving-accounts/${TENANT_A}/${ACC_AGENCY_A}.png`);
    const files = await fs.readdir(path.join(UPLOADS_ROOT, 'receiving-accounts', TENANT_A));
    expect(files.filter(name => !name.startsWith('00000000'))).toEqual([]);
    expect(mockAuditEvents).toHaveLength(0);
  });

  it('activation seule (isActive + expectedUpdatedAt + removeQr=false) : rien d’autre ne bouge', async () => {
    const res = await request(app)
      .put(url)
      .set('x-test-user', USER_MANAGER_A)
      .field('isActive', 'false')
      .field('expectedUpdatedAt', opened)
      .field('removeQr', 'false');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      isActive: false,
      alias: '341c3e1b-8f2a-4b6d-9c1e-5a7d2f0b3c44',
      holderName: 'Agence Soleil',
      scannableWith: 'Application Wave',
      hasQr: true
    });
    expectNoStorageLeak(res.body);
  });

  it('expectedUpdatedAt invalide : 400 VALIDATION_ERROR, rien n’est écrit', async () => {
    const res = await request(app)
      .put(url)
      .set('x-test-user', USER_MANAGER_A)
      .field('isActive', 'false')
      .field('expectedUpdatedAt', 'pas une date');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(mockPrisma.receivingAccount.rows.find((r: any) => r.id === ACC_AGENCY_A)?.isActive).toBe(true);
  });
});
