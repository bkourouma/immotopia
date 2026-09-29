/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Maintenance › « Mes demandes » — BUG-2026-09-29-019 (faille d'accès), 007, 008.
 *
 * Le défaut : `GET …/maintenance/tenant/tickets` ne se restreignait qu'à un
 * `tenantContactId` fourni par le client ; sans lui, tout collaborateur ayant
 * `MAINTENANCE_TENANT` (les quatre rôles agence) recevait tous les tickets de
 * l'agence, ceux des locataires compris, et pouvait les modifier, les annuler
 * ou les supprimer. Détail, annulation, suppression, commentaire, pièces
 * jointes : même faiblesse.
 *
 * Règle : « mes demandes » = les tickets déclarés par l'utilisateur
 * authentifié (`created_by_user_id`), quel que soit le paramètre reçu. Un
 * ticket d'autrui ou d'une autre agence répond 404, comme un objet inexistant.
 *
 * La pile est la vraie (routeur, gardes d'agence et de permission,
 * contrôleurs, services) ; seules la session (en-tête `x-test-user`) et la
 * base (`helpers/fake-prisma.ts`, qui applique réellement les `where`) sont
 * simulées.
 *
 * Jeu de données :
 *   Agence A — Ibrahim (collaborateur : MAINTENANCE_TENANT + PROPERTIES_VIEW,
 *              pas de droit locatif), Mariam (MAINTENANCE_TENANT +
 *              MAINTENANCE_ADMIN). Ticket T_IBRAHIM (déclaré par Ibrahim),
 *              T_MARIAM (par Mariam), T_LOCATAIRE (déclaré par la locataire
 *              Aminata depuis le portail : pas d'utilisateur agence).
 *   Agence B — Fanta (MAINTENANCE_TENANT), ticket T_B.
 */

import * as os from 'os';
import * as path from 'path';
import { promises as fs } from 'fs';

// Racine des fichiers déposés, lue par config/env au premier import.
const UPLOADS_ROOT = path.join(os.tmpdir(), `maintenance-mes-demandes-test-${process.pid}`);
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

jest.mock('../../src/services/maintenance-notification-service', () => ({
  sendTicketCreatedNotification: jest.fn(async () => undefined),
  sendStatusChangeNotification: jest.fn(async () => undefined)
}));

import maintenanceRoutes from '../../src/routes/maintenance-routes';
import { errorHandler } from '../../src/middleware/error-middleware';
import { clearPermissionCache } from '../../src/services/permission-service';

const app = express();
app.use(express.json());
app.use('/api/tenants/:tenantId/maintenance', maintenanceRoutes);
app.use(errorHandler);

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

const P1 = id(1);
const P_B = id(2);
const LEASE_1 = id(11);
const LEASE_OTHER_AGENCY = id(12);

const T_IBRAHIM = id(21);
const T_MARIAM = id(22);
const T_LOCATAIRE = id(23);
const T_B = id(24);

const ATT_LOCATAIRE = id(31);
const ATT_IBRAHIM = id(32);

const USER_IBRAHIM = 'user-ibrahim';
const USER_MARIAM = 'user-mariam';
const USER_FANTA = 'user-fanta';

const CONTACT_AMINATA = id(41);

function role(permissions: string[]) {
  return { scope: 'TENANT', permissions: permissions.map(key => ({ permission: { key } })) };
}

function fileUrl(tenantId: string, ticketId: string, name: string) {
  return `/uploads/maintenance/${tenantId}/${ticketId}/${name}`;
}

function ticket(overrides: Record<string, any>) {
  return {
    tenant_id: TENANT_A,
    property_id: P1,
    lease_id: LEASE_1,
    tenant_contact_id: null,
    created_by_user_id: null,
    created_by_contact_id: null,
    title: 'Ticket',
    category: 'PLUMBING',
    priority: 'MEDIUM',
    description: 'Description du ticket',
    status: 'DECLARED',
    declared_at: new Date('2026-09-01'),
    created_at: new Date('2026-09-01'),
    updated_at: new Date('2026-09-01'),
    ...overrides
  };
}

function seed() {
  mockPrisma.reset();
  clearPermissionCache();

  mockPrisma.tenant.rows.push({ id: TENANT_A, status: 'ACTIVE' }, { id: TENANT_B, status: 'ACTIVE' });
  mockPrisma.membership.rows.push(
    { id: 'm-1', userId: USER_IBRAHIM, tenantId: TENANT_A, status: 'ACTIVE' },
    { id: 'm-2', userId: USER_MARIAM, tenantId: TENANT_A, status: 'ACTIVE' },
    { id: 'm-3', userId: USER_FANTA, tenantId: TENANT_B, status: 'ACTIVE' }
  );
  mockPrisma.userRole.rows.push(
    {
      id: 'ur-1',
      userId: USER_IBRAHIM,
      tenantId: TENANT_A,
      role: role(['MAINTENANCE_TENANT', 'PROPERTIES_VIEW'])
    },
    {
      id: 'ur-2',
      userId: USER_MARIAM,
      tenantId: TENANT_A,
      role: role(['MAINTENANCE_TENANT', 'MAINTENANCE_ADMIN'])
    },
    { id: 'ur-3', userId: USER_FANTA, tenantId: TENANT_B, role: role(['MAINTENANCE_TENANT']) }
  );

  mockPrisma.property.rows.push({ id: P1, tenantId: TENANT_A }, { id: P_B, tenantId: TENANT_B });
  mockPrisma.crmContact.rows.push({
    id: CONTACT_AMINATA,
    tenantId: TENANT_A,
    firstName: 'Aminata',
    lastName: 'Traoré'
  });
  mockPrisma.rentalLease.rows.push(
    {
      id: LEASE_1,
      tenant_id: TENANT_A,
      property_id: P1,
      status: 'ACTIVE',
      lease_number: 'BAIL-2026-0001',
      start_date: new Date('2026-01-01')
    },
    {
      id: LEASE_OTHER_AGENCY,
      tenant_id: TENANT_B,
      property_id: P_B,
      status: 'ACTIVE',
      lease_number: 'BAIL-B-1',
      start_date: new Date('2026-01-01')
    }
  );

  mockPrisma.maintenanceTicket.rows.push(
    ticket({ id: T_IBRAHIM, title: 'Fuite évier', created_by_user_id: USER_IBRAHIM }),
    ticket({ id: T_MARIAM, title: 'Porte qui grince', created_by_user_id: USER_MARIAM }),
    ticket({
      id: T_LOCATAIRE,
      title: 'Prise électrique qui grésille',
      tenant_contact_id: CONTACT_AMINATA,
      created_by_contact_id: CONTACT_AMINATA
    }),
    ticket({
      id: T_B,
      tenant_id: TENANT_B,
      property_id: P_B,
      lease_id: LEASE_OTHER_AGENCY,
      title: 'Toit',
      created_by_user_id: USER_FANTA
    })
  );

  mockPrisma.maintenanceTicketAttachment.rows.push(
    {
      id: ATT_LOCATAIRE,
      tenant_id: TENANT_A,
      ticket_id: T_LOCATAIRE,
      file_url: fileUrl(TENANT_A, T_LOCATAIRE, 'prise.jpg'),
      file_name: 'prise.jpg',
      mime_type: 'image/jpeg'
    },
    {
      id: ATT_IBRAHIM,
      tenant_id: TENANT_A,
      ticket_id: T_IBRAHIM,
      file_url: fileUrl(TENANT_A, T_IBRAHIM, 'evier.jpg'),
      file_name: 'evier.jpg',
      mime_type: 'image/jpeg'
    }
  );
}

async function writeUpload(url: string, content: Buffer) {
  const absolute = path.join(UPLOADS_ROOT, url.replace(/^\/uploads\//, ''));
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, content);
}

beforeAll(async () => {
  await writeUpload(fileUrl(TENANT_A, T_LOCATAIRE, 'prise.jpg'), Buffer.from('photo-locataire'));
  await writeUpload(fileUrl(TENANT_A, T_IBRAHIM, 'evier.jpg'), Buffer.from('photo-ibrahim'));
});

afterAll(async () => {
  await fs.rm(UPLOADS_ROOT, { recursive: true, force: true });
});

beforeEach(seed);

const base = (tenantId = TENANT_A) => `/api/tenants/${tenantId}/maintenance/tenant`;
const as = (userId: string) => ({ 'x-test-user': userId });
const rowOf = (ticketId: string) => mockPrisma.maintenanceTicket.rows.find((r: any) => r.id === ticketId);

describe('« Mes demandes » — la liste ne montre que mes tickets (BUG-019)', () => {
  it('un collaborateur ne voit pas le ticket du locataire ni ceux des collègues', async () => {
    const res = await request(app).get(`${base()}/tickets`).set(as(USER_IBRAHIM));

    expect(res.status).toBe(200);
    expect(res.body.data.map((t: any) => t.id)).toEqual([T_IBRAHIM]);
    expect(res.body.pagination.total).toBe(1);
  });

  it('aucun paramètre de requête n’élargit la liste (contact, demandeur, créateur…)', async () => {
    const paramsHostiles = [
      `tenantContactId=${CONTACT_AMINATA}`,
      `requester=${CONTACT_AMINATA}`,
      `createdByUserId=${USER_MARIAM}`,
      `created_by_user_id=${USER_MARIAM}`,
      `userId=${USER_MARIAM}`
    ];

    for (const query of paramsHostiles) {
      const res = await request(app).get(`${base()}/tickets?${query}`).set(as(USER_IBRAHIM));
      expect(res.status).toBe(200);
      const ids = res.body.data.map((t: any) => t.id);
      expect(ids).not.toContain(T_LOCATAIRE);
      expect(ids).not.toContain(T_MARIAM);
      expect(ids).toEqual([T_IBRAHIM]);
    }
  });

  it('même avec MAINTENANCE_ADMIN, « Mes demandes » reste limité à ses propres tickets', async () => {
    const res = await request(app).get(`${base()}/tickets`).set(as(USER_MARIAM));
    expect(res.status).toBe(200);
    expect(res.body.data.map((t: any) => t.id)).toEqual([T_MARIAM]);
  });

  it('les tickets de l’agence restent visibles côté gestion (routeur admin)', async () => {
    const res = await request(app).get(`/api/tenants/${TENANT_A}/maintenance/admin/tickets`).set(as(USER_MARIAM));
    expect(res.status).toBe(200);
    expect(res.body.data.map((t: any) => t.id).sort()).toEqual([T_IBRAHIM, T_MARIAM, T_LOCATAIRE].sort());
  });

  it('un collaborateur sans permission de gestion n’ouvre pas la liste de l’agence (403)', async () => {
    const res = await request(app).get(`/api/tenants/${TENANT_A}/maintenance/admin/tickets`).set(as(USER_IBRAHIM));
    expect(res.status).toBe(403);
  });
});

describe('« Mes demandes » — détail, modification, annulation, suppression', () => {
  it('le détail du ticket d’un locataire ou d’un collègue répond 404, contact fourni ou non', async () => {
    for (const ticketId of [T_LOCATAIRE, T_MARIAM]) {
      const plain = await request(app).get(`${base()}/tickets/${ticketId}`).set(as(USER_IBRAHIM));
      expect(plain.status).toBe(404);

      const withContact = await request(app)
        .get(`${base()}/tickets/${ticketId}?tenantContactId=${CONTACT_AMINATA}`)
        .set(as(USER_IBRAHIM));
      expect(withContact.status).toBe(404);
    }
  });

  it('le détail de mon ticket est servi', async () => {
    const res = await request(app).get(`${base()}/tickets/${T_IBRAHIM}`).set(as(USER_IBRAHIM));
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(T_IBRAHIM);
  });

  it('un identifiant d’une autre agence répond 404, comme un ticket inexistant', async () => {
    const foreign = await request(app).get(`${base()}/tickets/${T_B}`).set(as(USER_IBRAHIM));
    const unknown = await request(app)
      .get(`${base()}/tickets/${id(99)}`)
      .set(as(USER_IBRAHIM));
    expect(foreign.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(foreign.body.message).toBe(unknown.body.message);
  });

  it('modifier le ticket d’un locataire est refusé (404) et la donnée reste intacte', async () => {
    const res = await request(app)
      .patch(`${base()}/tickets/${T_LOCATAIRE}`)
      .set(as(USER_IBRAHIM))
      .send({ title: 'Titre piraté', tenantContactId: CONTACT_AMINATA });

    expect(res.status).toBe(404);
    expect(rowOf(T_LOCATAIRE).title).toBe('Prise électrique qui grésille');
  });

  it('annuler le ticket d’un locataire est refusé (404)', async () => {
    const res = await request(app)
      .patch(`${base()}/tickets/${T_LOCATAIRE}`)
      .set(as(USER_IBRAHIM))
      .send({ status: 'CANCELED', tenantContactId: CONTACT_AMINATA });

    expect(res.status).toBe(404);
    expect(rowOf(T_LOCATAIRE).status).toBe('DECLARED');
  });

  it('supprimer le ticket d’un locataire est refusé (404), contact fourni ou non', async () => {
    const plain = await request(app).delete(`${base()}/tickets/${T_LOCATAIRE}`).set(as(USER_IBRAHIM));
    const withContact = await request(app)
      .delete(`${base()}/tickets/${T_LOCATAIRE}?tenantContactId=${CONTACT_AMINATA}`)
      .set(as(USER_IBRAHIM))
      .send({ tenantContactId: CONTACT_AMINATA });

    expect(plain.status).toBe(404);
    expect(withContact.status).toBe(404);
    expect(rowOf(T_LOCATAIRE)).toBeDefined();
  });

  it('même un gestionnaire ne supprime pas, par cette route, le ticket d’autrui', async () => {
    const res = await request(app).delete(`${base()}/tickets/${T_LOCATAIRE}`).set(as(USER_MARIAM));
    expect(res.status).toBe(404);
    expect(rowOf(T_LOCATAIRE)).toBeDefined();
  });

  it('je modifie, annule et supprime mes propres tickets', async () => {
    const edit = await request(app)
      .patch(`${base()}/tickets/${T_IBRAHIM}`)
      .set(as(USER_IBRAHIM))
      .send({ title: 'Fuite sous l’évier' });
    expect(edit.status).toBe(200);
    expect(rowOf(T_IBRAHIM).title).toBe('Fuite sous l’évier');

    const cancel = await request(app)
      .patch(`${base()}/tickets/${T_IBRAHIM}`)
      .set(as(USER_IBRAHIM))
      .send({ status: 'CANCELED' });
    expect(cancel.status).toBe(200);
    expect(rowOf(T_IBRAHIM).status).toBe('CANCELED');

    const del = await request(app).delete(`${base()}/tickets/${T_IBRAHIM}`).set(as(USER_IBRAHIM));
    expect(del.status).toBe(200);
    expect(rowOf(T_IBRAHIM)).toBeUndefined();
  });
});

describe('« Mes demandes » — commentaires (BUG-008) et pièces jointes', () => {
  it('le demandeur commente sa propre demande, signée de son compte (pas de fiche contact requise)', async () => {
    const res = await request(app)
      .post(`${base()}/tickets/${T_IBRAHIM}/comments`)
      .set(as(USER_IBRAHIM))
      .send({ content: 'Le propriétaire a été prévenu', authorUserId: USER_MARIAM, tenantContactId: CONTACT_AMINATA });

    expect(res.status).toBe(201);
    const [comment] = mockPrisma.maintenanceTicketComment.rows;
    expect(comment.ticket_id).toBe(T_IBRAHIM);
    expect(comment.author_type).toBe('TENANT');
    expect(comment.author_user_id).toBe(USER_IBRAHIM);
    expect(comment.author_contact_id ?? null).toBeNull();
  });

  it('on ne commente pas la demande d’un locataire ou d’une autre agence (404)', async () => {
    const onTenantTicket = await request(app)
      .post(`${base()}/tickets/${T_LOCATAIRE}/comments`)
      .set(as(USER_IBRAHIM))
      .send({ content: 'Intrusion', tenantContactId: CONTACT_AMINATA });
    const onForeignTicket = await request(app)
      .post(`${base()}/tickets/${T_B}/comments`)
      .set(as(USER_IBRAHIM))
      .send({ content: 'Intrusion' });

    expect(onTenantTicket.status).toBe(404);
    expect(onForeignTicket.status).toBe(404);
    expect(mockPrisma.maintenanceTicketComment.rows).toHaveLength(0);
  });

  it('on ne dépose pas de pièce jointe sur la demande d’un locataire (404, rien n’est écrit)', async () => {
    const res = await request(app)
      .post(`${base()}/tickets/${T_LOCATAIRE}/attachments`)
      .set(as(USER_IBRAHIM))
      .attach('file', Buffer.from('x'), { filename: 'photo.png', contentType: 'image/png' });

    expect(res.status).toBe(404);
    expect(mockPrisma.maintenanceTicketAttachment.rows).toHaveLength(2);
  });

  it('sans droit de gestion, on n’ouvre que les pièces de ses propres tickets', async () => {
    const foreign = await request(app)
      .get(`/api/tenants/${TENANT_A}/maintenance/files/${ATT_LOCATAIRE}`)
      .set(as(USER_IBRAHIM));
    expect(foreign.status).toBe(404);

    const own = await request(app)
      .get(`/api/tenants/${TENANT_A}/maintenance/files/${ATT_IBRAHIM}`)
      .set(as(USER_IBRAHIM));
    expect(own.status).toBe(200);
  });

  it('avec MAINTENANCE_ADMIN, toute pièce de l’agence reste accessible', async () => {
    const res = await request(app)
      .get(`/api/tenants/${TENANT_A}/maintenance/files/${ATT_LOCATAIRE}`)
      .set(as(USER_MARIAM));
    expect(res.status).toBe(200);
  });
});

describe('Création d’un ticket par un collaborateur sans droit locatif (BUG-007)', () => {
  const body = {
    title: 'Fuite au niveau de l’évier',
    category: 'PLUMBING',
    priority: 'HIGH',
    description: 'Le robinet fuit depuis ce matin',
    propertyId: P1
  };

  it('le bail actif du bien se lit sous la permission maintenance (pas de 403)', async () => {
    const res = await request(app).get(`${base()}/properties/${P1}/active-leases`).set(as(USER_IBRAHIM));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      { id: LEASE_1, leaseNumber: 'BAIL-2026-0001', startDate: new Date('2026-01-01').toISOString() }
    ]);
  });

  it('un bien d’une autre agence répond 404, comme un bien inexistant', async () => {
    const foreign = await request(app).get(`${base()}/properties/${P_B}/active-leases`).set(as(USER_IBRAHIM));
    const unknown = await request(app)
      .get(`${base()}/properties/${id(98)}/active-leases`)
      .set(as(USER_IBRAHIM));
    expect(foreign.status).toBe(404);
    expect(unknown.status).toBe(404);
  });

  it('la route exige la permission maintenance', async () => {
    mockPrisma.userRole.rows.push({
      id: 'ur-x',
      userId: 'user-sans-droit',
      tenantId: TENANT_A,
      role: role(['PROPERTIES_VIEW'])
    });
    mockPrisma.membership.rows.push({ id: 'm-x', userId: 'user-sans-droit', tenantId: TENANT_A, status: 'ACTIVE' });

    const res = await request(app).get(`${base()}/properties/${P1}/active-leases`).set(as('user-sans-droit'));
    expect(res.status).toBe(403);
  });

  it('l’Agent crée son ticket, déclaré à son nom', async () => {
    const res = await request(app)
      .post(`${base()}/tickets`)
      .set(as(USER_IBRAHIM))
      .send({ ...body, leaseId: LEASE_1 });

    expect(res.status).toBe(201);
    const created = rowOf(res.body.data.id);
    expect(created.created_by_user_id).toBe(USER_IBRAHIM);
    expect(created.status).toBe('DECLARED');

    // Et il le retrouve dans « Mes demandes ».
    const list = await request(app).get(`${base()}/tickets`).set(as(USER_IBRAHIM));
    expect(list.body.data.map((t: any) => t.id)).toContain(res.body.data.id);
  });

  it('sans bail choisi, le serveur retrouve seul le bail actif', async () => {
    const res = await request(app).post(`${base()}/tickets`).set(as(USER_IBRAHIM)).send(body);
    expect(res.status).toBe(201);
  });
});
