/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * `uploadsAccessGuard` — le service statique de `/uploads`.
 *
 *   - `/uploads/syndics/...` est refusé en accès direct, quelle que soit la
 *     session (collaborateur de l'agence compris) : ces documents ne sortent
 *     que par les routes authentifiées de lib/syndics/document-files.ts ;
 *   - documents de bien, justificatifs de paiement du portail locataire et
 *     pièces de pénalité : réservés au personnel de l'agence — un client du
 *     portail (locataire, propriétaire, copropriétaire) ne les ouvre plus
 *     par leur URL ;
 *   - pièces jointes de maintenance : inchangé (les portails les affichent) ;
 *   - médias d'annonce : publics, inchangé.
 *
 * La base est la base en mémoire de `helpers/fake-prisma.ts` ; le jeton est
 * remplacé par un identifiant lisible (`verifyToken` mocké).
 */

import { createFakePrisma } from '../helpers/fake-prisma';

const mockPrisma = createFakePrisma();
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/utils/jwt-utils', () => ({
  verifyToken: (token: string) => (token ? { userId: token, globalRole: 'USER' } : null)
}));

import { uploadsAccessGuard } from '../../src/middleware/uploads-access-middleware';

const STAFF = 'user-staff';
const CLIENT = 'user-client';
const OTHER_AGENCY_STAFF = 'user-other-staff';

function seed() {
  mockPrisma.reset();
  mockPrisma.tenant.rows.push({ id: 'tenant-a', status: 'ACTIVE' }, { id: 'tenant-b', status: 'ACTIVE' });
  mockPrisma.membership.rows.push(
    { id: 'm-1', userId: STAFF, tenantId: 'tenant-a', status: 'ACTIVE' },
    { id: 'm-2', userId: OTHER_AGENCY_STAFF, tenantId: 'tenant-b', status: 'ACTIVE' }
  );
  mockPrisma.userRole.rows.push(
    { id: 'ur-1', userId: STAFF, tenantId: 'tenant-a', role: { scope: 'TENANT' } },
    { id: 'ur-2', userId: OTHER_AGENCY_STAFF, tenantId: 'tenant-b', role: { scope: 'TENANT' } }
  );
  // Un client du portail de l'agence A (locataire, propriétaire ou copropriétaire).
  mockPrisma.tenantClient.rows.push({ id: 'tc-1', userId: CLIENT, tenantId: 'tenant-a', clientType: 'CO_OWNER' });
  mockPrisma.property.rows.push({ id: 'prop-1', tenantId: 'tenant-a' });
  mockPrisma.rentalPenalty.rows.push({ id: 'pen-1', tenant_id: 'tenant-a' });
  mockPrisma.syndicate.rows.push({ id: 'syn-1', tenantId: 'tenant-a' });
}

async function hit(path: string, userId?: string) {
  const req: any = { method: 'GET', path, cookies: userId ? { accessToken: userId } : {}, headers: {} };
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  const next = jest.fn();
  await uploadsAccessGuard(req, res, next);
  return { served: next.mock.calls.length === 1, status: res.status.mock.calls[0]?.[0] as number | undefined };
}

beforeEach(seed);

describe('uploadsAccessGuard — documents de copropriété', () => {
  it('refuse /uploads/syndics/... en accès direct, même au personnel de l’agence', async () => {
    expect(await hit('/syndics/syn-1/documents/reglement.pdf', STAFF)).toEqual({ served: false, status: 404 });
    expect(await hit('/syndics/syn-1/documents/reglement.pdf', CLIENT)).toEqual({ served: false, status: 404 });
    expect(await hit('/syndics/syn-1/documents/reglement.pdf')).toEqual({ served: false, status: 404 });
  });
});

describe('uploadsAccessGuard — fichiers réservés au personnel', () => {
  const staffOnly = [
    '/properties/prop-1/documents/titre.pdf',
    '/portal/payments/tenant-a/preuve.jpg',
    '/rental/penalties/pen-1/accord.pdf'
  ];

  it.each(staffOnly)('%s : servi au personnel de l’agence', async path => {
    expect((await hit(path, STAFF)).served).toBe(true);
  });

  it.each(staffOnly)('%s : refusé à un client du portail de la même agence', async path => {
    expect(await hit(path, CLIENT)).toEqual({ served: false, status: 403 });
  });

  it.each(staffOnly)('%s : refusé au personnel d’une autre agence', async path => {
    expect(await hit(path, OTHER_AGENCY_STAFF)).toEqual({ served: false, status: 403 });
  });

  it('un membre sans rôle d’agence n’est pas du personnel', async () => {
    mockPrisma.userRole.rows = [];
    expect(await hit('/properties/prop-1/documents/titre.pdf', STAFF)).toEqual({ served: false, status: 403 });
  });
});

describe('uploadsAccessGuard — inchangé', () => {
  it('pièces jointes de maintenance : ouvertes aux clients de l’agence (portails)', async () => {
    expect((await hit('/maintenance/tenant-a/ticket-1/photo.jpg', CLIENT)).served).toBe(true);
    expect(await hit('/maintenance/tenant-a/ticket-1/photo.jpg', OTHER_AGENCY_STAFF)).toEqual({
      served: false,
      status: 403
    });
  });

  it("médias d'annonce : publics", async () => {
    expect((await hit('/properties/prop-1/photo.jpg')).served).toBe(true);
  });
});
