/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Portail locataire — quels tickets de maintenance le locataire voit-il ?
 *
 * Le défaut : la liste, le détail et les pièces jointes du portail filtraient
 * sur `tenant_contact_id = TenantClient.id`. Or `tenant_contact_id` référence
 * `crm_contacts` (clé étrangère) : la création depuis le portail y enregistre
 * la fiche CRM du locataire (`resolveTenantPortalCrmContactId`), ou rien. Un
 * ticket déposé par le locataire lui-même n'apparaissait donc jamais dans sa
 * liste.
 *
 * Règle retenue (lib/maintenance/portal-visibility.ts) : un ticket de
 * l'agence est au locataire s'il porte sur son bail actif — la clé de tout le
 * reste du portail — ou s'il est rattaché à sa fiche CRM (déclarant ou
 * contact locataire), ce qui couvre un ticket saisi par l'agence pour lui sans
 * bail.
 *
 * La pile est la vraie (garde du portail, contrôleur, services) ; la base est
 * la base en mémoire de `helpers/fake-prisma.ts`.
 *
 * Jeu de données (agence A, sauf mention) :
 *   Awa     — TenantClient tc-awa, fiche CRM contact-awa, bail L_AWA sur P1.
 *   Bakary  — TenantClient tc-bakary, fiche CRM contact-bakary, bail L_BAKARY sur P2.
 *   Agence B — ticket T_B sur PB, pour une fiche CRM de même adresse e-mail qu'Awa.
 */

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

jest.mock('../../src/services/maintenance-notification-service', () => ({
  sendTicketCreatedNotification: jest.fn(async () => undefined),
  sendStatusChangeNotification: jest.fn(async () => undefined)
}));

import tenantPortalRoutes from '../../src/routes/tenant-portal-routes';
import { errorHandler } from '../../src/middleware/error-middleware';

const app = express();
app.use(express.json());
app.use('/api/portal/tenant', tenantPortalRoutes);
app.use(errorHandler);

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const P1 = 'prop-1';
const P2 = 'prop-2';
const PB = 'prop-b';
const L_AWA = id(11);
const L_BAKARY = id(12);
const L_AWA_OLD = id(13);

const USER_AWA = 'user-awa';
const USER_BAKARY = 'user-bakary';

/** Tickets posés par le jeu de données (les tickets créés par le portail s'y ajoutent). */
const T_AGENCY_LEASE_AWA = id(21); // saisi par l'agence sur le bail d'Awa, sans contact
const T_AGENCY_CONTACT_AWA = id(22); // saisi par l'agence pour la fiche d'Awa, sans bail
const T_BAKARY = id(23); // ticket de Bakary
const T_AGENCY_P1_NO_LEASE = id(24); // sur le bien d'Awa, sans bail ni contact : pas à elle
const T_B = id(25); // autre agence

const ATT_AGENCY_CONTACT_AWA = id(31);
const ATT_BAKARY = id(32);

function seed() {
  mockPrisma.reset();
  const ACTIVE = { status: 'ACTIVE' };
  mockPrisma.tenant.rows.push({ id: TENANT_A, status: 'ACTIVE' }, { id: TENANT_B, status: 'ACTIVE' });

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
      id: 'tc-bakary',
      userId: USER_BAKARY,
      tenantId: TENANT_A,
      clientType: 'RENTER',
      createdAt: new Date('2026-01-02'),
      tenant: ACTIVE,
      user: { email: 'bakary@example.com' }
    }
  );

  mockPrisma.crmContact.rows.push(
    { id: 'contact-awa', tenantId: TENANT_A, email: 'awa@example.com' },
    { id: 'contact-bakary', tenantId: TENANT_A, email: 'bakary@example.com' },
    { id: 'contact-awa-b', tenantId: TENANT_B, email: 'awa@example.com' }
  );

  mockPrisma.property.rows.push(
    { id: P1, tenantId: TENANT_A },
    { id: P2, tenantId: TENANT_A },
    { id: PB, tenantId: TENANT_B }
  );

  mockPrisma.rentalLease.rows.push(
    {
      id: L_AWA,
      tenant_id: TENANT_A,
      property_id: P1,
      property: { id: P1 },
      status: 'ACTIVE',
      primary_renter_client_id: 'tc-awa'
    },
    {
      id: L_BAKARY,
      tenant_id: TENANT_A,
      property_id: P2,
      property: { id: P2 },
      status: 'ACTIVE',
      primary_renter_client_id: 'tc-bakary'
    },
    { id: L_AWA_OLD, tenant_id: TENANT_A, property_id: P2, status: 'TERMINATED', primary_renter_client_id: 'tc-awa' }
  );

  const ticket = (row: Record<string, unknown>) => ({
    status: 'DECLARED',
    title: 'Ticket',
    category: 'PLUMBING',
    priority: 'MEDIUM',
    description: '—',
    created_at: new Date('2026-03-01'),
    created_by_user_id: null,
    created_by_contact_id: null,
    tenant_contact_id: null,
    lease_id: null,
    ...row
  });
  mockPrisma.maintenanceTicket.rows.push(
    ticket({ id: T_AGENCY_LEASE_AWA, tenant_id: TENANT_A, property_id: P1, lease_id: L_AWA, created_by_user_id: 'u-staff' }),
    ticket({
      id: T_AGENCY_CONTACT_AWA,
      tenant_id: TENANT_A,
      property_id: P2,
      lease_id: L_AWA_OLD,
      tenant_contact_id: 'contact-awa',
      created_by_user_id: 'u-staff'
    }),
    ticket({
      id: T_BAKARY,
      tenant_id: TENANT_A,
      property_id: P2,
      lease_id: L_BAKARY,
      tenant_contact_id: 'contact-bakary',
      created_by_contact_id: 'contact-bakary'
    }),
    ticket({ id: T_AGENCY_P1_NO_LEASE, tenant_id: TENANT_A, property_id: P1, created_by_user_id: 'u-staff' }),
    ticket({ id: T_B, tenant_id: TENANT_B, property_id: PB, tenant_contact_id: 'contact-awa-b' })
  );

  mockPrisma.maintenanceTicketAttachment.rows.push(
    {
      id: ATT_AGENCY_CONTACT_AWA,
      tenant_id: TENANT_A,
      ticket_id: T_AGENCY_CONTACT_AWA,
      file_url: `/uploads/maintenance/${TENANT_A}/${T_AGENCY_CONTACT_AWA}/absent.jpg`,
      file_name: 'absent.jpg'
    },
    {
      id: ATT_BAKARY,
      tenant_id: TENANT_A,
      ticket_id: T_BAKARY,
      file_url: `/uploads/maintenance/${TENANT_A}/${T_BAKARY}/absent.jpg`,
      file_name: 'absent.jpg'
    }
  );
}

beforeEach(seed);

async function listIds(userId: string): Promise<string[]> {
  const res = await request(app).get('/api/portal/tenant/maintenance').set('x-test-user', userId);
  expect(res.status).toBe(200);
  return res.body.data.tickets.map((t: any) => t.id).sort();
}

async function createFromPortal(userId: string, title: string): Promise<string> {
  const res = await request(app)
    .post('/api/portal/tenant/maintenance')
    .set('x-test-user', userId)
    .send({ title, category: 'PLUMBING', priority: 'HIGH', description: 'Fuite sous l’évier' });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

describe('portail locataire — tickets créés depuis le portail', () => {
  it('un ticket créé par le locataire apparaît dans sa liste et s’ouvre en détail', async () => {
    const created = await createFromPortal(USER_AWA, 'Fuite cuisine');
    expect(await listIds(USER_AWA)).toContain(created);

    const detail = await request(app).get(`/api/portal/tenant/maintenance/${created}`).set('x-test-user', USER_AWA);
    expect(detail.status).toBe(200);
    expect(detail.body.data.id).toBe(created);
  });

  it('le résumé compte ce même ticket', async () => {
    await createFromPortal(USER_AWA, 'Fuite cuisine');
    const res = await request(app).get('/api/portal/tenant/maintenance').set('x-test-user', USER_AWA);
    expect(res.body.data.summary.total).toBe(res.body.data.pagination.total);
  });

  it('un ticket créé sans fiche CRM (e-mail sans correspondance) reste visible par le bail', async () => {
    mockPrisma.crmContact.rows = mockPrisma.crmContact.rows.filter(row => row.id !== 'contact-awa');
    const created = await createFromPortal(USER_AWA, 'Prise grillée');
    expect(await listIds(USER_AWA)).toContain(created);
  });

  it('le ticket créé par un locataire n’apparaît jamais chez un autre', async () => {
    const created = await createFromPortal(USER_AWA, 'Fuite cuisine');
    expect(await listIds(USER_BAKARY)).not.toContain(created);
    const detail = await request(app).get(`/api/portal/tenant/maintenance/${created}`).set('x-test-user', USER_BAKARY);
    expect(detail.status).toBe(404);
  });
});

describe('portail locataire — tickets saisis par l’agence', () => {
  it('le locataire voit les tickets de son bail et ceux de sa fiche, pas les autres', async () => {
    expect(await listIds(USER_AWA)).toEqual([T_AGENCY_LEASE_AWA, T_AGENCY_CONTACT_AWA].sort());
    expect(await listIds(USER_BAKARY)).toEqual([T_BAKARY]);
  });

  it('détail : 404 pour le ticket d’un autre, d’un bien sans lien, d’une autre agence', async () => {
    for (const ticketId of [T_BAKARY, T_AGENCY_P1_NO_LEASE, T_B]) {
      const res = await request(app).get(`/api/portal/tenant/maintenance/${ticketId}`).set('x-test-user', USER_AWA);
      expect(`${ticketId} : ${res.status}`).toBe(`${ticketId} : 404`);
    }
  });

  it('pièces jointes : même règle que le détail', async () => {
    // Ticket d'Awa : la route passe le contrôle du ticket (le fichier, absent
    // du disque, répond ensuite 404 lui aussi — on ne compare que le refus).
    const other = await request(app)
      .get(`/api/portal/tenant/maintenance/${T_BAKARY}/attachments/${ATT_BAKARY}`)
      .set('x-test-user', USER_AWA);
    expect(other.status).toBe(404);

    const files = await import('../../src/lib/maintenance/attachment-files');
    const visibility = await import('../../src/lib/maintenance/portal-visibility');
    const scope = { tenantId: TENANT_A, tenantClientId: 'tc-awa', leaseId: L_AWA };
    await expect(
      files.getMaintenanceAttachmentFileForTenantPortal(scope, T_AGENCY_CONTACT_AWA, ATT_AGENCY_CONTACT_AWA)
    ).rejects.toMatchObject({ statusCode: 404, message: 'Pièce jointe introuvable.' });
    // Le ticket est bien reconnu : c'est le fichier qui manque, pas le droit.
    const visible = await visibility.findTenantPortalTicket(scope, T_AGENCY_CONTACT_AWA);
    expect(visible?.id).toBe(T_AGENCY_CONTACT_AWA);
    expect(await visibility.findTenantPortalTicket(scope, T_BAKARY)).toBeNull();
    expect(await visibility.findTenantPortalTicket(scope, T_B)).toBeNull();
  });

  it('commentaire : refusé sur le ticket d’un autre (404), accepté sur le sien', async () => {
    const other = await request(app)
      .post(`/api/portal/tenant/maintenance/${T_BAKARY}/comment`)
      .set('x-test-user', USER_AWA)
      .send({ comment: 'Bonjour' });
    expect(other.status).toBe(404);
    expect(mockPrisma.maintenanceTicketComment.rows).toHaveLength(0);

    const mine = await request(app)
      .post(`/api/portal/tenant/maintenance/${T_AGENCY_LEASE_AWA}/comment`)
      .set('x-test-user', USER_AWA)
      .send({ comment: 'Merci' });
    expect(mine.status).toBe(201);
    expect(mockPrisma.maintenanceTicketComment.rows).toHaveLength(1);
  });
});
