/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Derniers fichiers privés sortis du service statique — étanchéité, de bout
 * en bout sur HTTP :
 *
 *   - documents de bien    GET /api/tenants/:t/properties/:id/documents/:documentId/file   (PROPERTIES_VIEW)
 *   - preuves de paiement  GET /api/tenants/:t/rental/payment-declarations/:id/proof       (RENTAL_PAYMENTS_VIEW)
 *   - justificatifs        GET /api/tenants/:t/rental/penalties/:id/justification          (RENTAL_PENALTIES_VIEW)
 *
 * La pile est la vraie (`requireTenantAccess`, permissions de rôle, garde
 * statique devant `express.static`) ; la session est un en-tête `x-test-user`
 * et la base la base en mémoire de `helpers/fake-prisma.ts`, qui applique
 * réellement les filtres `where`.
 *
 * Jeu de données :
 *   Agence A — bien P1 (document DOC_A), déclaration DECL_A, pénalité PEN_A ;
 *              gestionnaire Mariam (les trois permissions), collaborateur
 *              Ibrahim (aucune des trois), locataire Awa (client du portail).
 *   Agence B — bien PB (DOC_B), déclaration DECL_B, pénalité PEN_B ;
 *              gestionnaire Fanta (les trois permissions).
 */

import * as os from 'os';
import * as path from 'path';
import { promises as fs } from 'fs';

const UPLOADS_ROOT = path.join(os.tmpdir(), `private-files-test-${process.pid}`);
process.env.UPLOADS_DIR = UPLOADS_ROOT;

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

jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: jest.fn(),
  flushAuditQueue: jest.fn()
}));

import propertyRoutes from '../../src/routes/property-routes';
import rentalRoutes from '../../src/routes/rental-routes';
import { uploadsAccessGuard } from '../../src/middleware/uploads-access-middleware';
import { errorHandler } from '../../src/middleware/error-middleware';
import { clearPermissionCache } from '../../src/services/permission-service';

const app = express();
app.use(express.json());
app.use('/uploads', uploadsAccessGuard, express.static(UPLOADS_ROOT));
app.use('/api', propertyRoutes);
app.use('/api/tenants', rentalRoutes);
app.use(errorHandler);

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const P1 = 'prop-1';
const PB = 'prop-b';

const DOC_A = 'doc-a';
const DOC_B = 'doc-b';
const DOC_FORGED = 'doc-forged';
const DECL_A = id(11);
const DECL_B = id(12);
const DECL_NO_PROOF = id(13);
const PEN_A = id(21);
const PEN_B = id(22);
const PEN_FREE_TEXT = id(23);

const USER_MARIAM = 'user-mariam';
const USER_IBRAHIM = 'user-ibrahim';
const USER_FANTA = 'user-fanta';
const USER_AWA = 'user-awa';

const url = {
  docA: `/uploads/properties/${P1}/documents/TITLE_DEED-a.pdf`,
  docB: `/uploads/properties/${PB}/documents/TITLE_DEED-b.pdf`,
  proofA: `/uploads/portal/payments/${TENANT_A}/payment-proof-a.jpg`,
  proofB: `/uploads/portal/payments/${TENANT_B}/payment-proof-b.jpg`,
  penA: `/uploads/rental/penalties/${PEN_A}/justification-a.pdf`,
  penB: `/uploads/rental/penalties/${PEN_B}/justification-b.pdf`
};

const CONTENT: Record<string, Buffer> = Object.fromEntries(
  Object.entries(url).map(([key]) => [key, Buffer.from(`contenu-${key}`)])
);

async function writeUpload(fileUrl: string, content: Buffer) {
  const absolute = path.join(UPLOADS_ROOT, fileUrl.replace(/^\/uploads\//, ''));
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, content);
}

const ALL = ['PROPERTIES_VIEW', 'RENTAL_PAYMENTS_VIEW', 'RENTAL_PENALTIES_VIEW'];
const role = (keys: string[]) => ({ scope: 'TENANT', permissions: keys.map(key => ({ permission: { key } })) });

function seed() {
  mockPrisma.reset();
  clearPermissionCache();

  mockPrisma.tenant.rows.push({ id: TENANT_A, status: 'ACTIVE' }, { id: TENANT_B, status: 'ACTIVE' });
  mockPrisma.membership.rows.push(
    { id: 'm-1', userId: USER_MARIAM, tenantId: TENANT_A, status: 'ACTIVE' },
    { id: 'm-2', userId: USER_IBRAHIM, tenantId: TENANT_A, status: 'ACTIVE' },
    { id: 'm-3', userId: USER_FANTA, tenantId: TENANT_B, status: 'ACTIVE' }
  );
  mockPrisma.userRole.rows.push(
    { id: 'ur-1', userId: USER_MARIAM, tenantId: TENANT_A, role: role(ALL) },
    { id: 'ur-2', userId: USER_IBRAHIM, tenantId: TENANT_A, role: role(['MAINTENANCE_ADMIN']) },
    { id: 'ur-3', userId: USER_FANTA, tenantId: TENANT_B, role: role(ALL) }
  );
  mockPrisma.tenantClient.rows.push({ id: 'tc-awa', userId: USER_AWA, tenantId: TENANT_A, clientType: 'RENTER' });

  mockPrisma.property.rows.push({ id: P1, tenantId: TENANT_A }, { id: PB, tenantId: TENANT_B });
  mockPrisma.propertyDocument.rows.push(
    { id: DOC_A, propertyId: P1, tenantId: TENANT_A, fileUrl: url.docA, fileName: 'Titre foncier.pdf' },
    { id: DOC_B, propertyId: PB, tenantId: TENANT_B, fileUrl: url.docB, fileName: 'Titre B.pdf' },
    // Ligne du bien P1 dont l'URL pointe vers le dossier d'un autre bien.
    { id: DOC_FORGED, propertyId: P1, tenantId: null, fileUrl: url.docB, fileName: 'Détourné.pdf' }
  );

  mockPrisma.rentalPaymentDeclaration.rows.push(
    { id: DECL_A, tenant_id: TENANT_A, proof_file_url: url.proofA },
    { id: DECL_B, tenant_id: TENANT_B, proof_file_url: url.proofB },
    { id: DECL_NO_PROOF, tenant_id: TENANT_A, proof_file_url: null }
  );

  const justification = (fileUrl: string) =>
    JSON.stringify({ reason: 'Accord amiable', justification: { fileUrl, fileName: 'accord.pdf' } });
  mockPrisma.rentalPenalty.rows.push(
    { id: PEN_A, tenant_id: TENANT_A, override_reason: justification(url.penA) },
    { id: PEN_B, tenant_id: TENANT_B, override_reason: justification(url.penB) },
    { id: PEN_FREE_TEXT, tenant_id: TENANT_A, override_reason: 'Geste commercial' }
  );
}

beforeAll(async () => {
  for (const [key, fileUrl] of Object.entries(url)) await writeUpload(fileUrl, CONTENT[key]);
});

afterAll(async () => {
  await fs.rm(UPLOADS_ROOT, { recursive: true, force: true });
});

beforeEach(seed);

const get = (userId: string, apiPath: string) => request(app).get(`/api${apiPath}`).set('x-test-user', userId);

const routes = {
  doc: (tenantId: string, propertyId: string, documentId: string) =>
    `/tenants/${tenantId}/properties/${propertyId}/documents/${documentId}/file`,
  proof: (tenantId: string, declarationId: string) =>
    `/tenants/${tenantId}/rental/payment-declarations/${declarationId}/proof`,
  justification: (tenantId: string, penaltyId: string) => `/tenants/${tenantId}/rental/penalties/${penaltyId}/justification`
};

describe('documents de bien', () => {
  it('le gestionnaire obtient le document d’un bien de son agence', async () => {
    const res = await get(USER_MARIAM, routes.doc(TENANT_A, P1, DOC_A));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain(encodeURIComponent('Titre foncier.pdf'));
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  it('rien d’une autre agence : 404 par la sienne, 403 par l’autre', async () => {
    expect((await get(USER_MARIAM, routes.doc(TENANT_A, PB, DOC_B))).status).toBe(404);
    expect((await get(USER_MARIAM, routes.doc(TENANT_A, P1, DOC_B))).status).toBe(404);
    expect((await get(USER_MARIAM, routes.doc(TENANT_B, PB, DOC_B))).status).toBe(403);
    expect((await get(USER_FANTA, routes.doc(TENANT_B, P1, DOC_A))).status).toBe(404);
  });

  it('une URL stockée qui sort du dossier de son bien n’est pas suivie (404)', async () => {
    expect((await get(USER_MARIAM, routes.doc(TENANT_A, P1, DOC_FORGED))).status).toBe(404);
  });

  it('sans PROPERTIES_VIEW, ou client du portail : 403', async () => {
    expect((await get(USER_IBRAHIM, routes.doc(TENANT_A, P1, DOC_A))).status).toBe(403);
    expect((await get(USER_AWA, routes.doc(TENANT_A, P1, DOC_A))).status).toBe(403);
  });
});

describe('preuves de paiement', () => {
  it('le gestionnaire obtient la preuve d’une déclaration de son agence', async () => {
    const res = await get(USER_MARIAM, routes.proof(TENANT_A, DECL_A));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(Buffer.compare(res.body, CONTENT.proofA)).toBe(0);
  });

  it('rien d’une autre agence, ni d’une déclaration sans preuve ou inconnue (404)', async () => {
    expect((await get(USER_MARIAM, routes.proof(TENANT_A, DECL_B))).status).toBe(404);
    expect((await get(USER_MARIAM, routes.proof(TENANT_B, DECL_B))).status).toBe(403);
    expect((await get(USER_FANTA, routes.proof(TENANT_B, DECL_A))).status).toBe(404);
    expect((await get(USER_MARIAM, routes.proof(TENANT_A, DECL_NO_PROOF))).status).toBe(404);
    expect((await get(USER_MARIAM, routes.proof(TENANT_A, 'pas-un-uuid'))).status).toBe(404);
  });

  it('sans RENTAL_PAYMENTS_VIEW, ou client du portail : 403', async () => {
    expect((await get(USER_IBRAHIM, routes.proof(TENANT_A, DECL_A))).status).toBe(403);
    expect((await get(USER_AWA, routes.proof(TENANT_A, DECL_A))).status).toBe(403);
  });
});

describe('justificatifs de pénalité', () => {
  it('le gestionnaire obtient le justificatif d’une pénalité de son agence', async () => {
    const res = await get(USER_MARIAM, routes.justification(TENANT_A, PEN_A));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain('accord.pdf');
  });

  it('rien d’une autre agence, ni d’une pénalité sans justificatif (404)', async () => {
    expect((await get(USER_MARIAM, routes.justification(TENANT_A, PEN_B))).status).toBe(404);
    expect((await get(USER_MARIAM, routes.justification(TENANT_B, PEN_B))).status).toBe(403);
    expect((await get(USER_FANTA, routes.justification(TENANT_B, PEN_A))).status).toBe(404);
    expect((await get(USER_MARIAM, routes.justification(TENANT_A, PEN_FREE_TEXT))).status).toBe(404);
  });

  it('une pénalité dont le justificatif pointe vers le dossier d’une autre : 404', async () => {
    mockPrisma.rentalPenalty.rows.find(row => row.id === PEN_A)!.override_reason = JSON.stringify({
      justification: { fileUrl: url.penB, fileName: 'x.pdf' }
    });
    expect((await get(USER_MARIAM, routes.justification(TENANT_A, PEN_A))).status).toBe(404);
  });

  it('sans RENTAL_PENALTIES_VIEW, ou client du portail : 403', async () => {
    expect((await get(USER_IBRAHIM, routes.justification(TENANT_A, PEN_A))).status).toBe(403);
    expect((await get(USER_AWA, routes.justification(TENANT_A, PEN_A))).status).toBe(403);
  });
});

describe('accès direct à /uploads', () => {
  it('les trois dossiers répondent 404, fichier présent sur le disque', async () => {
    for (const fileUrl of Object.values(url)) {
      const res = await request(app).get(fileUrl).set('Cookie', `accessToken=${USER_MARIAM}`);
      expect(`${fileUrl} : ${res.status}`).toBe(`${fileUrl} : 404`);
    }
  });
});
