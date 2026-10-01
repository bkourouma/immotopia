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
import { randomUUID } from 'crypto';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/utils/database';
import { signProposal } from '../../src/lib/ai/proposal-token';
import { flushAuditEvents } from '../../src/services/audit-service';
import { encodeAuditCursor } from '../../src/services/audit-read-service';
import {
  createTestTenant,
  createTenantAdminUser,
  suspendTenant,
  createContactDirect,
  createPropertyDirect,
  createMaintenanceTicketDirect,
  createOutsiderUser,
  createTenantMemberUser,
  createRentalFixtureDirect,
  RentalFixture,
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
// ImmoCopilot est desactive par defaut (AI_PROVIDER=disabled -> 503 avant toute
// verification). Ces tests ciblent les gardes qui suivent : on force donc le
// faux fournisseur, sans toucher a l'environnement.
//
// Le faux fournisseur est enveloppe : `mockProviderRequests` garde chaque requete
// qu'il recoit (ce que le « modele » verrait vraiment), et `mockFakeScript`
// permet de lui faire emettre des appels d'outils precis.
const mockProviderRequests: Array<{ messages: unknown }> = [];
let mockFakeScript: Array<{ text?: string; toolCalls?: Array<{ name: string; input: unknown }> }> | undefined;
jest.mock('../../src/lib/ai/providers', () => {
  const actual = jest.requireActual('../../src/lib/ai/providers');
  return {
    ...actual,
    getLlmProvider: () => {
      const fake = new actual.FakeProvider(mockFakeScript);
      return {
        id: fake.id,
        runTurn: (req: { messages: unknown }, ...rest: unknown[]) => {
          mockProviderRequests.push(req);
          return fake.runTurn(req, ...rest);
        }
      };
    }
  };
});

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

    it('un utilisateur de A qui appelle /api/tenants/<B>/... -> 403', async () => {
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

  describe('ImmoCopilot — jeton de proposition et agences (assistant IA)', () => {
    const statementArgs = {
      docType: 'RENT_STATEMENT' as const,
      leaseId: randomUUID(),
      startDate: '2026-01-01',
      endDate: '2026-03-31'
    };

    it("un jeton signe pour l'agence A, presente sur /tenants/<B>, est refuse : PROPOSAL_INVALID", async () => {
      const token = signProposal({ userId: adminB.id, tenantId: tenantA.id, args: statementArgs }).token;

      const res = await request(app)
        .post(`/api/tenants/${tenantB.id}/ai/actions/execute`)
        .set(authed(adminB))
        .send({ proposalToken: token });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PROPOSAL_INVALID');
      expect(await prisma.rentalDocument.count({ where: { tenant_id: { in: [tenantA.id, tenantB.id] } } })).toBe(0);
    });

    it("le jeton d'un administrateur de A, presente par celui de B sur B : PROPOSAL_INVALID", async () => {
      const token = signProposal({ userId: adminA.id, tenantId: tenantB.id, args: statementArgs }).token;

      const res = await request(app)
        .post(`/api/tenants/${tenantB.id}/ai/actions/execute`)
        .set(authed(adminB))
        .send({ proposalToken: token });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PROPOSAL_INVALID');
    });

    it("un administrateur de A n'atteint ni le chat ni l'execution sur l'agence B -> 403", async () => {
      const token = signProposal({ userId: adminA.id, tenantId: tenantA.id, args: statementArgs }).token;

      const execute = await request(app)
        .post(`/api/tenants/${tenantB.id}/ai/actions/execute`)
        .set(authed(adminA))
        .send({ proposalToken: token });
      expect(execute.status).toBe(403);

      const chat = await request(app)
        .post(`/api/tenants/${tenantB.id}/ai/chat`)
        .set(authed(adminA))
        .send({ messages: [{ role: 'user', content: 'Bonjour' }] });
      expect(chat.status).toBe(403);

      const status = await request(app).get(`/api/tenants/${tenantB.id}/ai/status`).set(authed(adminA));
      expect(status.status).toBe(403);
    });
  });

  describe('ImmoCopilot — cas de bout en bout : aucune donnee de A n atteint B', () => {
    let adminA2: TestUser;
    let outsider: TestUser;
    let rentalA: RentalFixture;
    let rentalB: RentalFixture;

    const executeOn = (tenantId: string, user: TestUser, proposalToken: string) =>
      request(app).post(`/api/tenants/${tenantId}/ai/actions/execute`).set(authed(user)).send({ proposalToken });

    const rentalDocumentCount = () =>
      prisma.rentalDocument.count({ where: { tenant_id: { in: [tenantA.id, tenantB.id] } } });

    /** Aucune trace de A dans un texte (corps de reponse, flux SSE, requete au modele). */
    const expectNoTraceOfA = (text: string) => {
      for (const secret of [
        rentalA.leaseId,
        rentalA.leaseNumber,
        rentalA.renterName,
        rentalA.propertyId,
        rentalA.propertyReference,
        rentalA.documentId,
        rentalA.paymentId,
        rentalA.installmentId
      ]) {
        expect(text).not.toContain(secret);
      }
    };

    beforeAll(async () => {
      adminA2 = await createTenantAdminUser(tenantA, 'admin-a2');
      outsider = await createOutsiderUser('sans-agence');
      rentalA = await createRentalFixtureDirect(tenantA.id, adminA.id, 'A');
      rentalB = await createRentalFixtureDirect(tenantB.id, adminB.id, 'B');
    });

    beforeEach(() => {
      mockProviderRequests.length = 0;
      mockFakeScript = undefined;
    });

    afterAll(() => {
      mockFakeScript = undefined;
    });

    it('temoin : un jeton valide de B sur B passe la verification (404 bail inconnu, pas PROPOSAL_INVALID), puis est a usage unique', async () => {
      const token = signProposal({
        userId: adminB.id,
        tenantId: tenantB.id,
        args: { docType: 'RENT_STATEMENT', leaseId: randomUUID(), startDate: '2026-01-01', endDate: '2026-03-31' }
      }).token;

      const first = await executeOn(tenantB.id, adminB, token);
      expect(first.status).toBe(404);
      expect(first.body.code).not.toBe('PROPOSAL_INVALID');

      const replay = await executeOn(tenantB.id, adminB, token);
      expect(replay.status).toBe(409);
      expect(replay.body.code).toBe('PROPOSAL_ALREADY_USED');
    });

    it("le jeton d'un utilisateur de A, presente par un autre utilisateur de la MEME agence A : PROPOSAL_INVALID", async () => {
      const token = signProposal({
        userId: adminA.id,
        tenantId: tenantA.id,
        args: { docType: 'RENT_STATEMENT', leaseId: rentalA.leaseId, startDate: '2026-01-01', endDate: '2026-03-31' }
      }).token;
      const before = await rentalDocumentCount();

      const res = await executeOn(tenantA.id, adminA2, token);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PROPOSAL_INVALID');
      expect(await rentalDocumentCount()).toBe(before);
    });

    it("un bail de A dans les arguments d'un jeton VALIDE de B -> 404, aucun document cree, aucune donnee de A dans la reponse", async () => {
      const token = signProposal({
        userId: adminB.id,
        tenantId: tenantB.id,
        args: { docType: 'RENT_STATEMENT', leaseId: rentalA.leaseId, startDate: '2026-01-01', endDate: '2026-03-31' }
      }).token;
      const before = await rentalDocumentCount();

      const res = await executeOn(tenantB.id, adminB, token);

      expect(res.status).toBe(404);
      expect(await rentalDocumentCount()).toBe(before);
      expectNoTraceOfA(JSON.stringify(res.body) + res.text);
    });

    it('une quittance : bail, paiement ou echeance de A dans un jeton valide de B -> 404, rien de genere', async () => {
      const before = await rentalDocumentCount();
      const cases = [
        // Tout vient de A.
        { leaseId: rentalA.leaseId, paymentId: rentalA.paymentId, installmentId: rentalA.installmentId },
        // Bail de B, mais paiement et echeance de A.
        { leaseId: rentalB.leaseId, paymentId: rentalA.paymentId, installmentId: rentalA.installmentId },
        // Bail et paiement de B, echeance de A.
        { leaseId: rentalB.leaseId, paymentId: rentalB.paymentId, installmentId: rentalA.installmentId }
      ];
      for (const ids of cases) {
        const token = signProposal({
          userId: adminB.id,
          tenantId: tenantB.id,
          args: { docType: 'RENT_RECEIPT', ...ids }
        }).token;
        const res = await executeOn(tenantB.id, adminB, token);
        expect(res.status).toBe(404);
        expectNoTraceOfA(JSON.stringify(res.body) + res.text);
      }
      expect(await rentalDocumentCount()).toBe(before);
    });

    it("un jeton de B ne s'execute pas sur l'URL de A par un membre de B : 403 (agence, pas jeton)", async () => {
      const token = signProposal({
        userId: adminB.id,
        tenantId: tenantA.id,
        args: { docType: 'RENT_STATEMENT', leaseId: rentalA.leaseId, startDate: '2026-01-01', endDate: '2026-03-31' }
      }).token;
      const before = await rentalDocumentCount();

      const res = await executeOn(tenantA.id, adminB, token);

      expect(res.status).toBe(403);
      expect(await rentalDocumentCount()).toBe(before);
    });

    it("telechargement : le document de A n'est pas servi via l'URL de B (404), ni via l'URL de A a un membre de B (403)", async () => {
      const viaB = await request(app)
        .get(`/api/tenants/${tenantB.id}/documents/${rentalA.documentId}/download`)
        .set(authed(adminB));
      expect(viaB.status).toBe(404);
      expect(viaB.body.message).toBe('Document not found');

      const viaA = await request(app)
        .get(`/api/tenants/${tenantA.id}/documents/${rentalA.documentId}/download`)
        .set(authed(adminB));
      expect(viaA.status).toBe(403);

      // Temoin : le document de B est bien retrouve dans B (404 « fichier » absent, pas « document » inconnu).
      const own = await request(app)
        .get(`/api/tenants/${tenantB.id}/documents/${rentalB.documentId}/download`)
        .set(authed(adminB));
      expect(own.status).toBe(404);
      expect(own.body.message).toBe('Document file not found');
    });

    it("chat : le contexte d'ecran visant un bail ou un bien de A, depuis B, n'atteint jamais le modele ni le flux", async () => {
      const contexts = [
        { activeEntityType: 'LEASE', activeEntityId: rentalA.leaseId },
        { activeEntityType: 'PROPERTY', activeEntityId: rentalA.propertyId },
        // Chemin annoncant l'agence A avec une entite de B : ignore en bloc.
        {
          currentPath: `/tenants/${tenantA.id}/rental/leases/x`,
          activeEntityType: 'LEASE',
          activeEntityId: rentalB.leaseId
        }
      ] as const;

      for (const context of contexts) {
        mockProviderRequests.length = 0;
        const res = await request(app)
          .post(`/api/tenants/${tenantB.id}/ai/chat`)
          .set(authed(adminB))
          .send({ messages: [{ role: 'user', content: 'Resume ce dossier' }], context });

        expect(res.status).toBe(200);
        expect(mockProviderRequests.length).toBeGreaterThan(0);
        const seenByModel = JSON.stringify(mockProviderRequests);
        expectNoTraceOfA(res.text + seenByModel);
        expect(seenByModel).not.toContain(rentalB.leaseId);
        expect(seenByModel).not.toContain('"entity_id"');
      }
    });

    it("chat : temoin, le contexte d'ecran d'un bail de SA propre agence est bien transmis (le test ci-dessus discrimine)", async () => {
      const res = await request(app)
        .post(`/api/tenants/${tenantB.id}/ai/chat`)
        .set(authed(adminB))
        .send({
          messages: [{ role: 'user', content: 'Resume ce dossier' }],
          context: { activeEntityType: 'LEASE', activeEntityId: rentalB.leaseId }
        });

      expect(res.status).toBe(200);
      const seenByModel = JSON.stringify(mockProviderRequests);
      expect(seenByModel).toContain(rentalB.leaseId);
      expect(seenByModel).toContain('entity_id');
    });

    it('chat : chercher un bail ou un locataire de A depuis B ne renvoie rien de A', async () => {
      const res = await request(app)
        .post(`/api/tenants/${tenantB.id}/ai/chat`)
        .set(authed(adminB))
        .send({ messages: [{ role: 'user', content: `Cherche le bail du locataire ${rentalA.renterName}` }] });

      expect(res.status).toBe(200);
      const leaked = res.text + JSON.stringify(mockProviderRequests);
      for (const secret of [rentalA.leaseId, rentalA.leaseNumber, rentalA.propertyId, rentalA.propertyReference]) {
        expect(leaked).not.toContain(secret);
      }
    });

    it('chat : un outil appele avec le bail de A (arguments choisis par le modele) echoue sans rien reveler', async () => {
      mockFakeScript = [
        { toolCalls: [{ name: 'list_lease_documents', input: { leaseId: rentalA.leaseId } }] },
        { text: 'Termine.' }
      ];

      const res = await request(app)
        .post(`/api/tenants/${tenantB.id}/ai/chat`)
        .set(authed(adminB))
        .send({ messages: [{ role: 'user', content: 'Liste les documents' }] });

      expect(res.status).toBe(200);
      // Le resultat d'outil (renvoye au modele) est une erreur, sans document ni numero de A.
      const toolResults = JSON.stringify(mockProviderRequests.slice(1));
      expect(toolResults).toContain('tool_result');
      expect(toolResults).not.toContain(rentalA.documentId);
      expect(toolResults).not.toContain('DOC-A-');
      expect(toolResults).not.toContain(rentalA.leaseNumber);
      expect(toolResults).not.toContain(rentalA.renterName);
      expect(res.text).not.toContain(rentalA.documentId);
      expect(res.text).not.toContain(rentalA.leaseNumber);
    });

    it('statut : un membre de B voit l assistant de B ; un utilisateur sans agence, un membre de A sur B et un anonyme sont refuses', async () => {
      const own = await request(app).get(`/api/tenants/${tenantB.id}/ai/status`).set(authed(adminB));
      expect(own.status).toBe(200);
      expect(own.body.data.enabled).toBe(true);
      expectNoTraceOfA(own.text);

      const cross = await request(app).get(`/api/tenants/${tenantB.id}/ai/status`).set(authed(adminA));
      expect(cross.status).toBe(403);

      const stranger = await request(app).get(`/api/tenants/${tenantB.id}/ai/status`).set(authed(outsider));
      expect(stranger.status).toBe(403);

      const anonymous = await request(app).get(`/api/tenants/${tenantB.id}/ai/status`);
      expect(anonymous.status).toBe(401);
    });

    it("un utilisateur sans agence n'atteint ni le chat ni l'execution : 403", async () => {
      const chat = await request(app)
        .post(`/api/tenants/${tenantB.id}/ai/chat`)
        .set(authed(outsider))
        .send({ messages: [{ role: 'user', content: 'Bonjour' }] });
      expect(chat.status).toBe(403);

      const token = signProposal({
        userId: outsider.id,
        tenantId: tenantB.id,
        args: { docType: 'RENT_STATEMENT', leaseId: rentalB.leaseId, startDate: '2026-01-01', endDate: '2026-03-31' }
      }).token;
      const execute = await executeOn(tenantB.id, outsider, token);
      expect(execute.status).toBe(403);
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
    },
    {
      // Lot P4 (Patrimoine — entités détentrices et fiscalité).
      name: 'Entité détentrice (patrimoine)',
      createDirect: tenantId =>
        prisma.holdingEntity
          .create({
            data: { tenantId, name: `EntiteB-${Date.now()}-${Math.random()}`, legalForm: 'SCI', country: 'CI' }
          })
          .then(entity => entity.id),
      itemPath: (tenantId, id) => `/api/tenants/${tenantId}/patrimoine/entities/${id}`,
      listPath: tenantId => `/api/tenants/${tenantId}/patrimoine/entities`,
      updateMethod: 'patch',
      updateBody: { notes: 'Modifie par A — ne doit jamais arriver' },
      listItems: body => body.data ?? [],
      assertIntact: async id => {
        const row = await prisma.holdingEntity.findUnique({ where: { id } });
        expect(row).not.toBeNull();
        expect(row!.notes).toBeNull();
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

    it('la liste de A ne contient aucun id de B', async () => {
      const res = await request(app).get(spec.listPath(tenantA.id)).set(authed(adminA));
      expect(res.status).toBe(200);
      const ids = spec.listItems(res.body).map((item: any) => item.id);
      expect(ids).not.toContain(idOfB);
    });

    it('GET/DELETE/liste depuis SA PROPRE agence (B) fonctionnent (non-regression)', async () => {
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

  // -------------------------------------------------------------------------
  // Lot S3 — reçus et quittances de charges : A contre B
  // -------------------------------------------------------------------------

  describe('Syndic — recus et quittances (lot S3)', () => {
    /** Copropriété, lot, appel PAID réglé, et (facultatif) sa quittance, directement en base. */
    async function createSyndicWithPaidCall(tenantId: string, label: string, withReceipt: boolean) {
      const syndicate = await prisma.syndicate.create({
        data: { tenantId, name: `Copro ${label}`, address: '1 rue du Test' }
      });
      const lot = await prisma.syndicateLot.create({
        data: { syndicateId: syndicate.id, lotNumber: `${label}-01`, lotType: 'APARTMENT', generalShares: 100 }
      });
      const call = await prisma.chargeCall.create({
        data: {
          syndicateId: syndicate.id,
          lotId: lot.id,
          period: '2026-01',
          amount: 1000,
          currency: 'XOF',
          dueDate: new Date('2026-01-31T00:00:00.000Z'),
          status: 'PAID'
        }
      });
      const payment = await prisma.chargePayment.create({
        data: { lotId: lot.id, chargeCallId: call.id, amount: 1000, paidAt: new Date('2026-01-10T00:00:00.000Z') }
      });
      await prisma.chargePaymentAllocation.create({
        data: { paymentId: payment.id, chargeCallId: call.id, amount: 1000, source: 'PAYMENT' }
      });
      let receiptId: string | null = null;
      if (withReceipt) {
        const receipt = await prisma.syndicChargeReceipt.create({
          data: {
            tenantId,
            syndicateId: syndicate.id,
            lotId: lot.id,
            kind: 'QUITTANCE',
            number: `Q-2026-${label}`,
            issuerKey: 'AGENCY',
            chargeCallId: call.id,
            amount: 1000,
            currency: 'XOF',
            // Envoyé il y a longtemps : seul le cloisonnement peut refuser le renvoi.
            emailedAt: new Date('2026-01-10T00:00:00.000Z'),
            snapshot: {
              version: 1,
              kind: 'QUITTANCE',
              number: `Q-2026-${label}`,
              issuedAt: '2026-01-10T00:00:00.000Z',
              currency: 'XOF',
              amount: 1000,
              issuer: {
                key: 'AGENCY',
                kind: 'AGENCY',
                name: label,
                legalName: null,
                address: null,
                phone: null,
                email: null,
                rccm: null,
                taxId: null
              },
              syndicate: { name: `Copro ${label}`, address: null, registrationNo: null, cadastralReference: null },
              lot: { number: `${label}-01`, type: 'Appartement', label: null },
              coowner: null,
              call: {
                id: call.id,
                period: { label: '2026-01', start: null, end: null },
                amount: 1000,
                dueDate: '2026-01-31T00:00:00.000Z'
              },
              settlements: [],
              settledAt: null,
              payment: null,
              allocations: [],
              outstandingAfter: 0,
              advance: 0,
              lotAdvanceBalance: 0,
              backfilled: false
            }
          }
        });
        receiptId = receipt.id;
      }
      return { syndicateId: syndicate.id, lotId: lot.id, callId: call.id, receiptId };
    }

    let own: Awaited<ReturnType<typeof createSyndicWithPaidCall>>;
    let foreign: Awaited<ReturnType<typeof createSyndicWithPaidCall>>;
    let foreignBare: Awaited<ReturnType<typeof createSyndicWithPaidCall>>;

    beforeAll(async () => {
      own = await createSyndicWithPaidCall(tenantA.id, 'A', true);
      foreign = await createSyndicWithPaidCall(tenantB.id, 'B', true);
      // Copropriété de B avec un appel PAID sans quittance : cible du rattrapage.
      foreignBare = await createSyndicWithPaidCall(tenantB.id, 'B2', false);
    });

    const base = (tenantId: string, syndicateId: string) => `/api/tenants/${tenantId}/syndics/${syndicateId}`;

    it('liste : A ne voit pas la copropriete de B (404) et sa propre liste ne contient aucun document de B', async () => {
      const foreignList = await request(app)
        .get(`${base(tenantA.id, foreign.syndicateId)}/quittances`)
        .set(authed(adminA));
      expect(foreignList.status).toBe(404);

      const ownList = await request(app)
        .get(`${base(tenantA.id, own.syndicateId)}/quittances`)
        .set(authed(adminA));
      expect(ownList.status).toBe(200);
      const ids = (ownList.body.data.items as Array<{ id: string }>).map(item => item.id);
      expect(ids).toContain(own.receiptId);
      expect(ids).not.toContain(foreign.receiptId);

      const foreignLot = await request(app)
        .get(`${base(tenantA.id, own.syndicateId)}/lots/${foreign.lotId}/quittances`)
        .set(authed(adminA));
      expect(foreignLot.status).toBe(404);
    });

    it('telechargement : un document de B via une copropriete de A ou de B -> 404', async () => {
      for (const syndicateId of [own.syndicateId, foreign.syndicateId]) {
        const res = await request(app)
          .get(`${base(tenantA.id, syndicateId)}/quittances/${foreign.receiptId}/fichier`)
          .set(authed(adminA));
        expect(res.status).toBe(404);
      }
    });

    it("appel direct sur l'URL de B par un utilisateur de A -> 403", async () => {
      const res = await request(app)
        .get(`${base(tenantB.id, foreign.syndicateId)}/quittances/${foreign.receiptId}/fichier`)
        .set(authed(adminA));
      expect(res.status).toBe(403);
    });

    it("renvoi : un document de B -> 404, et rien n'est modifie", async () => {
      const res = await request(app)
        .post(`${base(tenantA.id, own.syndicateId)}/quittances/${foreign.receiptId}/envoi`)
        .set(authed(adminA));
      expect(res.status).toBe(404);
      const row = await prisma.syndicChargeReceipt.findUnique({ where: { id: foreign.receiptId! } });
      expect(row?.emailedAt?.toISOString()).toBe('2026-01-10T00:00:00.000Z');
      expect(row?.emailErrorCode ?? null).toBeNull();
    });

    it('impression : lotId de B dans une copropriete de A -> 404 ; copropriete de B -> 404', async () => {
      const query = 'from=2026-01-01&to=2026-12-31&kind=ALL&cols=1&rows=1';
      const foreignLot = await request(app)
        .get(`${base(tenantA.id, own.syndicateId)}/quittances/impression?${query}&lotId=${foreign.lotId}`)
        .set(authed(adminA));
      expect(foreignLot.status).toBe(404);
      const foreignSyndicate = await request(app)
        .get(`${base(tenantA.id, foreign.syndicateId)}/quittances/impression?${query}`)
        .set(authed(adminA));
      expect(foreignSyndicate.status).toBe(404);
    });

    it('rattrapage : copropriete de B -> 404, aucune quittance creee chez B', async () => {
      const res = await request(app)
        .post(`${base(tenantA.id, foreignBare.syndicateId)}/quittances/generer-manquantes`)
        .set(authed(adminA));
      expect(res.status).toBe(404);
      const created = await prisma.syndicChargeReceipt.count({
        where: { tenantId: tenantB.id, syndicateId: foreignBare.syndicateId }
      });
      expect(created).toBe(0);
    });

    it('non-regression : B lit et telecharge ses propres documents', async () => {
      const list = await request(app)
        .get(`${base(tenantB.id, foreign.syndicateId)}/quittances`)
        .set(authed(adminB));
      expect(list.status).toBe(200);
      expect((list.body.data.items as Array<{ id: string }>).map(item => item.id)).toContain(foreign.receiptId);
      const file = await request(app)
        .get(`${base(tenantB.id, foreign.syndicateId)}/quittances/${foreign.receiptId}/fichier`)
        .set(authed(adminB));
      expect(file.status).toBe(200);
      expect(file.headers['content-type']).toBe('application/pdf');
    });
  });
  /**
   * Journal d'activite de l'agence (ADR-006, phase 2). `AuditLog` est exempte de
   * l'extension de garde d'agence : seule la lecture unique
   * `getTenantAuditLogs` l'isole, d'ou ce test de bout en bout, sur de vraies
   * lignes et la vraie pile Express.
   */
  describe("Journal d'activité — étanchéité entre agences", () => {
    const marker = randomUUID().slice(0, 8);
    const T0 = Date.now() - 60_000;
    let agentA: TestUser;
    let propertyOfB: string;
    const ids: Record<string, string> = {};

    const at = (secondsAgo: number) => new Date(T0 + (60 - secondsAgo) * 1000);

    async function insertRow(key: string, data: Record<string, unknown>) {
      const row = await prisma.auditLog.create({
        data: {
          actionKey: 'PROPERTY_CREATED',
          entityType: 'PROPERTY',
          entityId: `${key}-${marker}`,
          scope: 'TENANT',
          visibility: 'TENANT',
          category: 'DATA',
          actorType: 'USER',
          ...data
        } as any
      });
      ids[key] = row.id;
    }

    /** Parcourt toutes les pages (2 lignes par page) et renvoie tous les journaux lus. */
    async function readAll(user: TestUser, tenantId: string, query = ''): Promise<any[]> {
      const logs: any[] = [];
      let cursor: string | null = null;
      for (let guard = 0; guard < 200; guard++) {
        const suffix: string = `?limit=2${query}${cursor ? `&cursor=${cursor}` : ''}`;
        const res: request.Response = await request(app)
          .get(`/api/tenants/${tenantId}/audit${suffix}`)
          .set(authed(user));
        expect(res.status).toBe(200);
        logs.push(...res.body.data.logs);
        cursor = res.body.data.nextCursor;
        if (!cursor) return logs;
      }
      throw new Error('pagination sans fin');
    }

    beforeAll(async () => {
      agentA = await createTenantMemberUser(tenantA, 'agent-a', 'TENANT_AGENT_TEST', ['PROPERTIES_VIEW']);
      propertyOfB = await createPropertyDirect(tenantB.id, `Bien-B-${marker}`);

      await insertRow('a1', {
        tenantId: tenantA.id,
        actorUserId: adminA.id,
        actorLabel: adminA.email,
        createdAt: at(50)
      });
      await insertRow('a2', {
        tenantId: tenantA.id,
        actionKey: 'RENTAL_LEASE_CREATED',
        entityType: 'RENTAL_LEASE',
        actorUserId: adminA.id,
        createdAt: at(40)
      });
      await insertRow('aStaff', {
        tenantId: tenantA.id,
        actionKey: 'TENANT_UPDATED',
        entityType: 'Tenant',
        actorType: 'SUPER_ADMIN',
        actorUserId: adminB.id,
        actorLabel: 'staff@immotopia.test',
        ipAddress: '203.0.113.9',
        userAgent: 'staff-browser',
        createdAt: at(30)
      });
      // Meme agence, mais reservee a la plateforme.
      await insertRow('aInternal', {
        tenantId: tenantA.id,
        actionKey: 'CAPACITY_OVERRIDE_GRANTED',
        entityType: 'Tenant',
        visibility: 'PLATFORM_ONLY',
        category: 'BILLING',
        createdAt: at(20)
      });
      // Ligne de A dont l'entityId designe un bien de B : le libelle ne doit pas fuiter.
      await insertRow('aForged', { tenantId: tenantA.id, entityId: propertyOfB, createdAt: at(10) });

      await insertRow('b1', { tenantId: tenantB.id, actorUserId: adminB.id, createdAt: at(45) });
      await insertRow('b2', { tenantId: tenantB.id, actorUserId: adminB.id, createdAt: at(15) });
      await insertRow('bOwn', { tenantId: tenantB.id, entityId: propertyOfB, createdAt: at(5) });
      await insertRow('platform', {
        tenantId: null,
        scope: 'PLATFORM',
        visibility: 'PLATFORM_ONLY',
        actionKey: 'AI_SETTINGS_UPDATED',
        entityType: 'Platform',
        createdAt: at(25)
      });
    });

    it("A lit ses lignes visibles, et AUCUNE ligne d'une autre agence, de la plateforme ou réservée à la plateforme", async () => {
      const read = (await readAll(adminA, tenantA.id)).map(log => log.id);

      for (const key of ['a1', 'a2', 'aStaff', 'aForged']) expect(read).toContain(ids[key]);

      const forbidden = await prisma.auditLog.findMany({
        where: { OR: [{ NOT: { tenantId: tenantA.id } }, { tenantId: null }, { visibility: 'PLATFORM_ONLY' }] },
        select: { id: true }
      });
      expect(forbidden.length).toBeGreaterThan(0); // le test discrimine : il existe bien des lignes interdites
      const forbiddenIds = new Set(forbidden.map(row => row.id));
      expect(read.filter(id => forbiddenIds.has(id))).toEqual([]);
    });

    it('la pagination ne perd ni ne répète une ligne, du plus récent au plus ancien', async () => {
      const read = await readAll(adminA, tenantA.id);
      const readIds = read.map(log => log.id);
      expect(new Set(readIds).size).toBe(readIds.length);

      const expected = await prisma.auditLog.findMany({
        where: { tenantId: tenantA.id, visibility: 'TENANT' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true }
      });
      expect(readIds).toEqual(expected.map(row => row.id));
    });

    it("l'URL de B par un administrateur de A -> 403, rien de B n'est servi", async () => {
      const res = await request(app).get(`/api/tenants/${tenantB.id}/audit`).set(authed(adminA));
      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body)).not.toContain(ids.b1);
    });

    it('un membre de A sans TENANT_AUDIT_VIEW -> 403, et sans session -> 401', async () => {
      const agent = await request(app).get(`/api/tenants/${tenantA.id}/audit`).set(authed(agentA));
      expect(agent.status).toBe(403);
      expect((await request(app).get(`/api/tenants/${tenantA.id}/audit`)).status).toBe(401);
    });

    it('?tenantId=<B> sur l’URL de A -> 400 : l’agence ne se choisit pas dans la requête', async () => {
      const res = await request(app).get(`/api/tenants/${tenantA.id}/audit?tenantId=${tenantB.id}`).set(authed(adminA));
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).not.toContain(ids.b1);
    });

    it("un curseur forgé à partir d'une ligne de B ne fait rien lire de B", async () => {
      const b2 = await prisma.auditLog.findUniqueOrThrow({ where: { id: ids.b2 } });
      const forged = encodeAuditCursor({ createdAt: b2.createdAt, id: b2.id });
      const res = await request(app).get(`/api/tenants/${tenantA.id}/audit?cursor=${forged}`).set(authed(adminA));
      expect(res.status).toBe(200);
      const read = res.body.data.logs.map((log: any) => log.id);
      expect(read).not.toContain(ids.b1);
      expect(read).not.toContain(ids.b2);
      expect(read).not.toContain(ids.bOwn);
    });

    it('le personnel de la plateforme apparaît sans identité, sans IP et sans navigateur', async () => {
      const res = await request(app)
        .get(`/api/tenants/${tenantA.id}/audit?actionKey=TENANT_UPDATED`)
        .set(authed(adminA));
      expect(res.status).toBe(200);
      const staff = res.body.data.logs.find((log: any) => log.id === ids.aStaff);
      expect(staff).toMatchObject({ actorType: 'SUPER_ADMIN' });
      const raw = JSON.stringify(res.body);
      for (const secret of ['staff@immotopia.test', '203.0.113.9', 'staff-browser', adminB.email]) {
        expect(raw).not.toContain(secret);
      }
    });

    it("le libellé d'une ressource n'est jamais emprunté à une autre agence (témoin : B voit le sien)", async () => {
      const forged = (await readAll(adminA, tenantA.id)).find(log => log.id === ids.aForged);
      expect(forged.resourceLabel).toBeUndefined();

      const own = (await readAll(adminB, tenantB.id)).find(log => log.id === ids.bOwn);
      expect(own.resourceLabel).toContain(`Bien-B-${marker}`);
    });

    it('consulter le journal est tracé, et cette trace est réservée à la plateforme', async () => {
      // Les lectures des tests précédents ont aussi laissé une trace : on les
      // écrit d'abord, pour ne compter que celle de CETTE lecture.
      await flushAuditEvents();
      const before = await prisma.auditLog.count({ where: { tenantId: tenantA.id, actionKey: 'AUDIT_VIEWED' } });
      const res = await request(app).get(`/api/tenants/${tenantA.id}/audit?limit=5`).set(authed(adminA));
      expect(res.status).toBe(200);
      expect(await flushAuditEvents()).toBe(0);

      const traces = await prisma.auditLog.findMany({ where: { tenantId: tenantA.id, actionKey: 'AUDIT_VIEWED' } });
      expect(traces.length).toBe(before + 1);
      expect(traces.every(trace => trace.visibility === 'PLATFORM_ONLY' && trace.category === 'SECURITY')).toBe(true);

      const read = (await readAll(adminA, tenantA.id)).map(log => log.id);
      expect(read.filter(id => traces.some(trace => trace.id === id))).toEqual([]);
    });
  });
});
