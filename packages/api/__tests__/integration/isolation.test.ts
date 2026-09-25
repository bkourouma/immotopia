/**
 * Lot E (multi-tenant) — E1 : isolation bout en bout, base dediee.
 *
 * Deux agences A et B, chacune avec un administrateur (TENANT_ADMIN). Pour un
 * echantillon de ressources (table `RESOURCES` ci-dessous — en ajouter une
 * est une ligne) : B cree, A tente GET/PATCH(ou PUT)/DELETE par id sur SES
 * PROPRES URL d'agence (`/api/tenants/<A>/.../<id de B>`) -> 404, et la ligne
 * de B reste intacte ; les listes de A ne contiennent aucun id de B.
 *
 * Plus les verifications generales (independantes de la ressource) : un
 * utilisateur de A qui appelle `/api/tenants/<B>/...` -> 403 ; agence
 * suspendue -> 403 `TENANT_SUSPENDED` ; `GET /api/tenants/:id` sans session ->
 * 401 ; A qui cree un objet referencant un id de B -> 404 et rien n'est cree
 * (CrmDeal.contactId, seule reference croisee couverte par l'echantillon
 * actuel — voir le rapport pour l'etendre).
 *
 * Base : DEDIEE aux tests (JAMAIS la base de developpement). Resolue via
 * `DATABASE_URL_TEST` (documentee dans env.example). Absente -> la suite est
 * ignoree (`describe.skip`, visible mais non executee) pour ne pas casser
 * `npm test`. `npm run test:isolation` applique les migrations sur cette base
 * puis lance ce fichier (voir __tests__/helpers/run-isolation-tests.js).
 */

import '../helpers/app-shims';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/utils/database';
import {
  createTestTenant,
  createTenantAdminUser,
  suspendTenant,
  createContactDirect,
  createPropertyDirect,
  createMaintenanceTicketDirect,
  cleanupTenants,
  TestTenant,
  TestUser
} from '../helpers/fixtures';

/**
 * `DATABASE_URL_TEST` peut trainer dans `.env` (pratique en local) sans que
 * CETTE execution ait ete lancee via `npm run test:isolation` — un simple
 * `npm test` ou `npx jest` chargerait quand meme `.env` (dotenv, via
 * `src/config/env.ts`) et verrait la variable « presente ». Se fier a sa
 * seule presence ferait alors tourner la suite pour de vrai contre la base
 * factice de `__tests__/setup.ts` (`DATABASE_URL=postgresql://test:test@...`),
 * avec des echecs de connexion illisibles au lieu d'un skip propre.
 *
 * Gate plus sur : `DATABASE_URL` (pose par `setup.ts` a partir de
 * `TEST_DATABASE_URL`) doit egaler EXACTEMENT `DATABASE_URL_TEST` — ce que
 * seul `__tests__/helpers/run-isolation-tests.js` garantit (il propage la
 * meme valeur aux deux variables avant de lancer Jest).
 */
const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST;
const HAS_TEST_DATABASE = Boolean(DATABASE_URL_TEST) && process.env.DATABASE_URL === DATABASE_URL_TEST;
const maybeDescribe = HAS_TEST_DATABASE ? describe : describe.skip;

if (!HAS_TEST_DATABASE) {
  // eslint-disable-next-line no-console
  console.log(
    'DATABASE_URL_TEST absente (ou execution hors `npm run test:isolation`) : ' +
      'E1 (isolation.test.ts) est ignoree. Voir env.example et __tests__/helpers/run-isolation-tests.js.'
  );
}

interface ResourceSpec {
  name: string;
  /** Cree la ressource DIRECTEMENT (Prisma) dans l'agence donnee ; retourne son id. */
  createDirect: (tenantId: string) => Promise<string>;
  itemPath: (tenantId: string, id: string) => string;
  listPath: (tenantId: string) => string;
  updateMethod: 'patch' | 'put';
  updateBody: Record<string, unknown>;
  /** Extrait le tableau d'items de la reponse de liste. */
  listItems: (body: any) => any[];
  /** Verifie que la ligne de B n'a pas ete alteree par les tentatives de A. */
  assertIntact: (id: string) => Promise<void>;
}

maybeDescribe('E1 — isolation multi-tenant bout en bout (lot E)', () => {
  jest.setTimeout(30000);

  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let adminA: TestUser;
  let adminB: TestUser;
  const createdTenantIds: string[] = [];

  beforeAll(async () => {
    tenantA = await createTestTenant('Agence-A');
    tenantB = await createTestTenant('Agence-B');
    createdTenantIds.push(tenantA.id, tenantB.id);
    adminA = await createTenantAdminUser(tenantA, 'admin-a');
    adminB = await createTenantAdminUser(tenantB, 'admin-b');
  });

  afterAll(async () => {
    await cleanupTenants(createdTenantIds);
    await prisma.$disconnect();
  });

  function authed(user: TestUser) {
    return { Authorization: user.authHeader };
  }

  describe('Verifications generales', () => {
    it('GET /api/tenants/:id sans session -> 401', async () => {
      const res = await request(app).get(`/api/tenants/${tenantA.id}`);
      expect(res.status).toBe(401);
    });

    it("un utilisateur de A qui appelle /api/tenants/<B>/... -> 403", async () => {
      const res = await request(app).get(`/api/tenants/${tenantB.id}`).set(authed(adminA));
      expect(res.status).toBe(403);
    });

    it('agence suspendue -> 403 TENANT_SUSPENDED', async () => {
      const suspended = await createTestTenant('Agence-Suspendue');
      createdTenantIds.push(suspended.id);
      const suspendedAdmin = await createTenantAdminUser(suspended, 'admin-suspendue');
      await suspendTenant(suspended.id);

      const res = await request(app).get(`/api/tenants/${suspended.id}`).set(authed(suspendedAdmin));

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('TENANT_SUSPENDED');
    });

    it("A cree un CrmDeal referencant un contactId de B -> 404, rien n'est cree", async () => {
      const contactOfB = await createContactDirect(tenantB.id, 'ContactDeB');

      const before = await prisma.crmDeal.count({ where: { contactId: contactOfB } });
      expect(before).toBe(0);

      const res = await request(app)
        .post(`/api/tenants/${tenantA.id}/crm/deals`)
        .set(authed(adminA))
        .send({ contactId: contactOfB, type: 'LOCATION' });

      expect(res.status).toBe(404);

      const after = await prisma.crmDeal.count({ where: { contactId: contactOfB } });
      expect(after).toBe(0);
    });
  });

  /**
   * Ajouter une ressource testee = ajouter une ligne ici (fabrique + chemins).
   * Echantillon actuel : contact CRM, bien, ticket de maintenance (GET seul,
   * cote « manager »). Voir le rapport final pour l'etendre au reste du plan
   * (bail, echeance, paiement, copropriete/lot, fournisseur, facture
   * fournisseur, chantier, article de stock, mandat de vente, releve
   * proprietaire, document...).
   */
  const RESOURCES: ResourceSpec[] = [
    {
      name: 'Contact CRM',
      createDirect: tenantId => createContactDirect(tenantId, 'ContactB'),
      itemPath: (tenantId, id) => `/api/tenants/${tenantId}/crm/contacts/${id}`,
      listPath: tenantId => `/api/tenants/${tenantId}/crm/contacts`,
      updateMethod: 'patch',
      updateBody: { firstName: 'Modifie par A — ne doit jamais arriver' },
      listItems: body => body.contacts ?? [],
      assertIntact: async id => {
        const row = await prisma.crmContact.findUnique({ where: { id } });
        expect(row).not.toBeNull();
        expect(row!.firstName).toBe('ContactB');
      }
    },
    {
      name: 'Bien',
      createDirect: tenantId => createPropertyDirect(tenantId, 'BienB'),
      itemPath: (tenantId, id) => `/api/tenants/${tenantId}/properties/${id}`,
      listPath: tenantId => `/api/tenants/${tenantId}/properties`,
      updateMethod: 'put',
      updateBody: { title: 'Modifie par A — ne doit jamais arriver' },
      listItems: body => body.data ?? [],
      assertIntact: async id => {
        const row = await prisma.property.findUnique({ where: { id } });
        expect(row).not.toBeNull();
        expect(row!.title).toBe('BienB');
      }
    }
  ];

  describe.each(RESOURCES)('Ressource : $name', spec => {
    let idOfB: string;

    beforeEach(async () => {
      idOfB = await spec.createDirect(tenantB.id);
    });

    it("GET par id, via l'URL de A, sur l'id de B -> 404", async () => {
      const res = await request(app).get(spec.itemPath(tenantA.id, idOfB)).set(authed(adminA));
      expect(res.status).toBe(404);
    });

    it(`${'patch/put'.toUpperCase()} par id, via l'URL de A, sur l'id de B -> 404, ligne de B intacte`, async () => {
      const res = await request(app)
        [spec.updateMethod](spec.itemPath(tenantA.id, idOfB))
        .set(authed(adminA))
        .send(spec.updateBody);

      expect(res.status).toBe(404);
      await spec.assertIntact(idOfB);
    });

    it("DELETE par id, via l'URL de A, sur l'id de B -> 404, ligne de B intacte", async () => {
      const res = await request(app).delete(spec.itemPath(tenantA.id, idOfB)).set(authed(adminA));
      expect(res.status).toBe(404);
      await spec.assertIntact(idOfB);
    });

    it("la liste de A ne contient aucun id de B", async () => {
      const res = await request(app).get(spec.listPath(tenantA.id)).set(authed(adminA));
      expect(res.status).toBe(200);
      const ids = spec.listItems(res.body).map((item: any) => item.id);
      expect(ids).not.toContain(idOfB);
    });

    it("GET/DELETE/liste depuis SA PROPRE agence (B) fonctionnent (non-regression)", async () => {
      const getRes = await request(app).get(spec.itemPath(tenantB.id, idOfB)).set(authed(adminB));
      expect(getRes.status).toBe(200);

      const listRes = await request(app).get(spec.listPath(tenantB.id)).set(authed(adminB));
      expect(listRes.status).toBe(200);
      const ids = spec.listItems(listRes.body).map((item: any) => item.id);
      expect(ids).toContain(idOfB);
    });
  });

  describe('Ticket de maintenance (cote manager) — GET seul, guard different (routeur imbrique)', () => {
    it("GET par id, via l'URL de A, sur un ticket de B -> 404", async () => {
      const propertyOfB = await createPropertyDirect(tenantB.id, 'BienPourTicket');
      const ticketOfB = await createMaintenanceTicketDirect(tenantB.id, propertyOfB, 'TicketB');

      const res = await request(app)
        .get(`/api/tenants/${tenantA.id}/maintenance/admin/tickets/${ticketOfB}`)
        .set(authed(adminA));

      expect(res.status).toBe(404);
    });

    it('GET par id, via sa propre agence (B), fonctionne (non-regression)', async () => {
      const propertyOfB = await createPropertyDirect(tenantB.id, 'BienPourTicket2');
      const ticketOfB = await createMaintenanceTicketDirect(tenantB.id, propertyOfB, 'TicketB2');

      const res = await request(app)
        .get(`/api/tenants/${tenantB.id}/maintenance/admin/tickets/${ticketOfB}`)
        .set(authed(adminB));

      expect(res.status).toBe(200);
    });
  });
});
