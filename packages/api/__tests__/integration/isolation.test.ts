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
import {
  ensureTenantAdminRole,
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
// ImmoCopilot est desactive par defaut (AI_PROVIDER=disabled -> 503 avant toute
// verification). Ces tests ciblent les gardes qui suivent : on force donc le
// faux fournisseur, sans toucher a l'environnement.
jest.mock('../../src/lib/ai/providers', () => {
  const actual = jest.requireActual('../../src/lib/ai/providers');
  return { ...actual, getLlmProvider: () => new actual.FakeProvider() };
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

    beforeAll(async () => {
      // Le role de test n'a pas la permission de generation : on la lui donne ici,
      // pour que la verification du jeton (et non la permission) soit ce qui refuse.
      const roleId = await ensureTenantAdminRole();
      const permission = await prisma.permission.upsert({
        where: { key: 'RENTAL_DOCUMENTS_GENERATE' },
        update: {},
        create: { key: 'RENTAL_DOCUMENTS_GENERATE', description: 'Permission de test : generation de documents' }
      });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId: permission.id } },
        update: {},
        create: { roleId, permissionId: permission.id }
      });
    });

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
    },
    {
      // Patrimoine multi-actifs (lot 1). Pas de DELETE d'actif : la route n'existe pas (404 dans tous les cas).
      name: 'Actif (patrimoine multi-actifs)',
      createDirect: tenantId =>
        prisma.asset
          .create({
            data: {
              tenantId,
              name: 'ActifB',
              assetClass: 'CASH',
              details: { institution: 'Banque B', cashKind: 'BANK' }
            }
          })
          .then(asset => asset.id),
      itemPath: (tenantId, id) => `/api/tenants/${tenantId}/patrimoine/assets/${id}`,
      listPath: tenantId => `/api/tenants/${tenantId}/patrimoine/assets`,
      updateMethod: 'patch',
      updateBody: { name: 'Modifie par A — ne doit jamais arriver' },
      listItems: body => body.data ?? [],
      assertIntact: async id => {
        const row = await prisma.asset.findUnique({ where: { id } });
        expect(row).not.toBeNull();
        expect(row!.name).toBe('ActifB');
        expect(row!.status).toBe('ACTIVE');
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
   * Patrimoine multi-actifs : écritures, références croisées et valeur nette
   * entre deux agences. L'agence A ne lit, n'écrit ni ne compte rien de B.
   */
  describe('Patrimoine multi-actifs — étanchéité entre agences', () => {
    const P = (tenantId: string) => `/api/tenants/${tenantId}/patrimoine`;
    let assetOfB: string;
    let propertyOfB: string;
    let entityOfB: string;
    let debtOfB: string;
    let valuationOfB: string;

    beforeEach(async () => {
      const asset = await prisma.asset.create({
        data: {
          tenantId: tenantB.id,
          name: 'ActifB',
          assetClass: 'BUSINESS_EQUITY',
          details: { companyName: 'SARL B', legalForm: 'SARL', country: 'CI', ownershipPercent: 50 }
        }
      });
      assetOfB = asset.id;
      propertyOfB = await createPropertyDirect(tenantB.id, 'BienPatrimoineB');
      entityOfB = (
        await prisma.holdingEntity.create({
          data: { tenantId: tenantB.id, name: `EntiteB-${randomUUID()}`, legalForm: 'SCI', country: 'CI' }
        })
      ).id;
      valuationOfB = (
        await prisma.assetValuation.create({
          data: { tenantId: tenantB.id, assetId: assetOfB, valuatedAt: new Date('2026-01-01'), estimatedValue: 1000000 }
        })
      ).id;
      debtOfB = (
        await prisma.propertyLoan.create({
          data: {
            tenantId: tenantB.id,
            assetId: assetOfB,
            lender: 'Banque B',
            capitalAmount: 500000,
            remainingCapital: 400000,
            interestRate: 5,
            monthlyPayment: 10000,
            startDate: new Date('2025-01-01'),
            endDate: new Date('2030-01-01')
          }
        })
      ).id;
    });

    const debtBody = (extra: Record<string, unknown> = {}) => ({
      lender: 'Banque A',
      capitalAmount: 100,
      remainingCapital: 80,
      interestRate: 5,
      monthlyPayment: 2,
      startDate: '2025-01-01',
      endDate: '2030-01-01',
      ...extra
    });

    it('A crée un actif immobilier sur un bien de B -> 404, aucun actif créé', async () => {
      const res = await request(app)
        .post(`${P(tenantA.id)}/assets`)
        .set(authed(adminA))
        .send({ name: 'Volé', assetClass: 'REAL_ESTATE', propertyId: propertyOfB, details: {} });
      expect(res.status).toBe(404);
      expect(await prisma.asset.count({ where: { propertyId: propertyOfB } })).toBe(0);
    });

    it('A crée un actif rattaché à une entité de B -> 404, aucun actif créé', async () => {
      const res = await request(app)
        .post(`${P(tenantA.id)}/assets`)
        .set(authed(adminA))
        .send({
          name: 'Cpt',
          assetClass: 'CASH',
          holdingEntityId: entityOfB,
          details: { institution: 'Banque', cashKind: 'BANK' }
        });
      expect(res.status).toBe(404);
      expect(await prisma.asset.count({ where: { tenantId: tenantA.id, name: 'Cpt' } })).toBe(0);
    });

    it("A lit, crée et supprime des valorisations sur l'actif de B -> 404, données de B intactes", async () => {
      const path = `${P(tenantA.id)}/assets/${assetOfB}/valuations`;
      expect((await request(app).get(path).set(authed(adminA))).status).toBe(404);
      const post = await request(app)
        .post(path)
        .set(authed(adminA))
        .send({ valuatedAt: '2026-02-01', estimatedValue: 5 });
      expect(post.status).toBe(404);
      const del = await request(app).delete(`${path}/${valuationOfB}`).set(authed(adminA));
      expect(del.status).toBe(404);
      expect(await prisma.assetValuation.count({ where: { assetId: assetOfB } })).toBe(1);
    });

    it("A demande la suggestion de valeur de l'actif de B -> 404, rien n'est écrit", async () => {
      const before = await prisma.assetValuation.count({ where: { tenantId: tenantB.id } });
      const res = await request(app)
        .post(`${P(tenantA.id)}/assets/${assetOfB}/valuations/suggest`)
        .set(authed(adminA))
        .send({});
      expect(res.status).toBe(404);
      expect(await prisma.assetValuation.count({ where: { tenantId: tenantB.id } })).toBe(before);
    });

    it('fiabilité : un corps portant reliability est refusé, sinon elle est calculée et renvoyée à la lecture', async () => {
      const own = await request(app)
        .post(`${P(tenantA.id)}/assets`)
        .set(authed(adminA))
        .send({ name: 'ActifA-fiabilité', assetClass: 'CASH', details: { institution: 'Banque A', cashKind: 'BANK' } });
      expect(own.status).toBe(201);
      const path = `${P(tenantA.id)}/assets/${own.body.data.id}/valuations`;
      const today = new Date().toISOString().slice(0, 10);

      const forged = await request(app)
        .post(path)
        .set(authed(adminA))
        .send({ valuatedAt: today, estimatedValue: 100, reliability: 'HIGH' });
      expect(forged.status).toBe(400);
      expect(await prisma.assetValuation.count({ where: { assetId: own.body.data.id } })).toBe(0);

      const created = await request(app)
        .post(path)
        .set(authed(adminA))
        .send({ valuatedAt: today, estimatedValue: 100, method: 'BALANCE' });
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({ reliability: 'HIGH', reliabilityReasons: ['METHOD_BALANCE'] });
      const stored = await prisma.assetValuation.findUnique({ where: { id: created.body.data.id } });
      expect(stored).toMatchObject({ reliability: 'HIGH', reliabilityReasons: ['METHOD_BALANCE'] });

      const read = await request(app).get(path).set(authed(adminA));
      expect(read.body.data[0]).toMatchObject({ reliability: 'HIGH' });
      const asset = await request(app)
        .get(`${P(tenantA.id)}/assets/${own.body.data.id}`)
        .set(authed(adminA));
      expect(asset.body.data).toMatchObject({ stale: false, currentValue: { reliability: 'HIGH' } });
    });

    it("A cède ou archive l'actif de B -> 404, statut de B inchangé", async () => {
      const dispose = await request(app)
        .post(`${P(tenantA.id)}/assets/${assetOfB}/dispose`)
        .set(authed(adminA))
        .send({ disposedAt: '2026-03-01' });
      expect(dispose.status).toBe(404);
      const archive = await request(app)
        .post(`${P(tenantA.id)}/assets/${assetOfB}/archive`)
        .set(authed(adminA));
      expect(archive.status).toBe(404);
      const row = await prisma.asset.findUnique({ where: { id: assetOfB } });
      expect(row!.status).toBe('ACTIVE');
      expect(row!.disposedAt).toBeNull();
    });

    it("A pose une dette sur l'actif de B -> 404 ; PATCH/DELETE de la dette de B -> 404, dette intacte", async () => {
      const create = await request(app)
        .post(`${P(tenantA.id)}/debts`)
        .set(authed(adminA))
        .send(debtBody({ assetId: assetOfB }));
      expect(create.status).toBe(404);
      const patch = await request(app)
        .patch(`${P(tenantA.id)}/debts/${debtOfB}`)
        .set(authed(adminA))
        .send({ remainingCapital: 1 });
      expect(patch.status).toBe(404);
      const del = await request(app)
        .delete(`${P(tenantA.id)}/debts/${debtOfB}`)
        .set(authed(adminA));
      expect(del.status).toBe(404);
      const row = await prisma.propertyLoan.findUnique({ where: { id: debtOfB } });
      expect(Number(row!.remainingCapital)).toBe(400000);
      expect(await prisma.propertyLoan.count({ where: { lender: 'Banque A' } })).toBe(0);
    });

    it("la liste des dettes de A ne contient pas celle de B ; filtrer sur l'actif de B -> 404", async () => {
      const list = await request(app)
        .get(`${P(tenantA.id)}/debts`)
        .set(authed(adminA));
      expect(list.status).toBe(200);
      expect(list.body.data.map((d: any) => d.id)).not.toContain(debtOfB);
      const filtered = await request(app)
        .get(`${P(tenantA.id)}/debts?assetId=${assetOfB}`)
        .set(authed(adminA));
      expect(filtered.status).toBe(404);
    });

    it("A pose une part sur l'actif de B, ou avec une entité de B -> 404, aucune part créée", async () => {
      const onAssetOfB = await request(app)
        .put(`${P(tenantA.id)}/assets/${assetOfB}/holdings/${entityOfB}`)
        .set(authed(adminA))
        .send({ sharePercent: 50 });
      expect(onAssetOfB.status).toBe(404);

      const own = await request(app)
        .post(`${P(tenantA.id)}/assets`)
        .set(authed(adminA))
        .send({ name: 'ActifA-parts', assetClass: 'OTHER', details: { label: 'Objet' } });
      expect(own.status).toBe(201);
      const withEntityOfB = await request(app)
        .put(`${P(tenantA.id)}/assets/${own.body.data.id}/holdings/${entityOfB}`)
        .set(authed(adminA))
        .send({ sharePercent: 50 });
      expect(withEntityOfB.status).toBe(404);
      expect(await prisma.propertyHolding.count({ where: { entityId: entityOfB } })).toBe(0);
    });

    it('la valeur nette de A ne compte ni les actifs ni les dettes de B', async () => {
      const own = await request(app)
        .post(`${P(tenantA.id)}/assets`)
        .set(authed(adminA))
        .send({
          name: 'ActifA-valeur',
          assetClass: 'CASH',
          details: { institution: 'Banque A', cashKind: 'BANK' },
          initialValuation: { valuatedAt: '2026-01-01', estimatedValue: 250000 }
        });
      expect(own.status).toBe(201);

      const a = await request(app)
        .get(`${P(tenantA.id)}/net-worth?asOf=2026-06-30`)
        .set(authed(adminA));
      expect(a.status).toBe(200);
      expect(a.body.data.totalAssets).toBe(250000);
      expect(a.body.data.totalDebts).toBe(0);
      expect(a.body.data.assets.map((x: any) => x.id)).not.toContain(assetOfB);

      const b = await request(app)
        .get(`${P(tenantB.id)}/net-worth?asOf=2026-06-30`)
        .set(authed(adminB));
      // beforeEach recrée un actif (1 000 000) et une dette (400 000) de B à chaque cas.
      const copiesOfB = await prisma.asset.count({ where: { tenantId: tenantB.id, assetClass: 'BUSINESS_EQUITY' } });
      expect(b.body.data.totalAssets).toBe(copiesOfB * 1000000);
      expect(b.body.data.totalDebts).toBe(copiesOfB * 400000);
      expect(b.body.data.netWorth).toBe(copiesOfB * 600000);

      const history = await request(app)
        .get(`${P(tenantA.id)}/net-worth/history?from=2026-05-30&to=2026-06-30`)
        .set(authed(adminA));
      expect(history.status).toBe(200);
      expect(history.body.data.at(-1).totalAssets).toBe(250000);
    });

    it("un actif immobilier de A partage les valorisations du bien : la route de l'actif écrit sur le bien", async () => {
      const propertyOfA = await createPropertyDirect(tenantA.id, 'BienPatrimoineA');
      const created = await request(app)
        .post(`${P(tenantA.id)}/assets`)
        .set(authed(adminA))
        .send({
          name: 'Immeuble A',
          assetClass: 'REAL_ESTATE',
          propertyId: propertyOfA,
          details: {},
          initialValuation: { valuatedAt: '2026-01-01', estimatedValue: 9000000 }
        });
      expect(created.status).toBe(201);
      const rows = await prisma.assetValuation.findMany({ where: { tenantId: tenantA.id, propertyId: propertyOfA } });
      expect(rows).toHaveLength(1);
      expect(rows[0].assetId).toBeNull();
      expect(created.body.data.currentValue.amount).toBe(9000000);

      const twice = await request(app)
        .post(`${P(tenantA.id)}/assets`)
        .set(authed(adminA))
        .send({ name: 'Doublon', assetClass: 'REAL_ESTATE', propertyId: propertyOfA, details: {} });
      expect(twice.status).toBe(409);
    });

    it('parts concurrentes sur un même actif : la somme ne dépasse jamais 100 % (verrou FOR UPDATE)', async () => {
      const asset = await prisma.asset.create({
        data: {
          tenantId: tenantA.id,
          name: 'SARL A',
          assetClass: 'BUSINESS_EQUITY',
          details: { companyName: 'SARL A', legalForm: 'SARL', country: 'CI', ownershipPercent: 50 }
        }
      });
      const entities = await Promise.all(
        [1, 2, 3, 4].map(n =>
          prisma.holdingEntity.create({
            data: { tenantId: tenantA.id, name: `EntiteA${n}-${randomUUID()}`, legalForm: 'SCI', country: 'CI' }
          })
        )
      );
      const results = await Promise.all(
        entities.map(entity =>
          request(app)
            .put(`${P(tenantA.id)}/assets/${asset.id}/holdings/${entity.id}`)
            .set(authed(adminA))
            .send({ sharePercent: 40 })
        )
      );
      expect(results.filter(r => r.status === 200)).toHaveLength(2);
      expect(results.filter(r => r.status === 422)).toHaveLength(2);
      const total = await prisma.propertyHolding.aggregate({
        where: { tenantId: tenantA.id, assetId: asset.id },
        _sum: { sharePercent: true }
      });
      expect(Number(total._sum.sharePercent)).toBeLessThanOrEqual(100);
    });

    it('actif archivé : valorisation, dette, part et PATCH refusés en 409', async () => {
      const created = await request(app)
        .post(`${P(tenantA.id)}/assets`)
        .set(authed(adminA))
        .send({
          name: 'A archiver',
          assetClass: 'BUSINESS_EQUITY',
          details: { companyName: 'C', legalForm: 'SARL', country: 'CI', ownershipPercent: 10 }
        });
      expect(created.status).toBe(201);
      const id = created.body.data.id;
      expect(
        (
          await request(app)
            .post(`${P(tenantA.id)}/assets/${id}/archive`)
            .set(authed(adminA))
        ).status
      ).toBe(200);
      const base = `${P(tenantA.id)}/assets/${id}`;
      const attempts = [
        request(app).patch(base).set(authed(adminA)).send({ name: 'Renommé' }),
        request(app)
          .post(`${base}/valuations`)
          .set(authed(adminA))
          .send({ valuatedAt: '2026-02-01', estimatedValue: 5 }),
        request(app)
          .post(`${P(tenantA.id)}/debts`)
          .set(authed(adminA))
          .send(debtBody({ assetId: id })),
        request(app).put(`${base}/holdings/${randomUUID()}`).set(authed(adminA)).send({ sharePercent: 10 })
      ];
      const statuses = (await Promise.all(attempts)).map(r => r.status);
      expect(statuses).toEqual([409, 409, 409, 409]);
      expect(await prisma.asset.count({ where: { id, name: 'A archiver' } })).toBe(1);
    });
  });
  /**
   * Projections et scénarios (lot 3) : la projection lit le patrimoine de
   * l'agence appelante seulement, et un identifiant d'une autre agence (actif,
   * dette, scénario) reçoit EXACTEMENT la réponse d'un identifiant inexistant.
   */
  describe('Patrimoine — projections et scénarios, étanchéité entre agences', () => {
    const P = (tenantId: string) => `/api/tenants/${tenantId}/patrimoine`;
    const MISSING = '99999999-9999-4999-8999-999999999999';
    let assetOfB: string;
    let debtOfB: string;
    let scenarioOfB: string;

    /** Réponse comparable : statut et corps (le corps ne doit rien révéler de l'autre agence). */
    const shape = (res: request.Response) => ({ status: res.status, body: res.body });

    beforeEach(async () => {
      assetOfB = (
        await prisma.asset.create({
          data: { tenantId: tenantB.id, name: 'ActifB-proj', assetClass: 'REAL_ESTATE', details: {} }
        })
      ).id;
      await prisma.assetValuation.create({
        data: { tenantId: tenantB.id, assetId: assetOfB, valuatedAt: new Date('2026-01-01'), estimatedValue: 7000000 }
      });
      debtOfB = (
        await prisma.propertyLoan.create({
          data: {
            tenantId: tenantB.id,
            assetId: assetOfB,
            lender: 'Banque B proj',
            capitalAmount: 500000,
            remainingCapital: 400000,
            interestRate: 5,
            monthlyPayment: 10000,
            startDate: new Date('2025-01-01'),
            endDate: new Date('2030-01-01')
          }
        })
      ).id;
      await prisma.patrimonyScenario.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
      scenarioOfB = (
        await prisma.patrimonyScenario.create({
          data: {
            tenantId: tenantB.id,
            name: 'Plan secret de B',
            horizonYears: 10,
            baseScenario: 'CENTRAL',
            operations: [{ type: 'SELL_ASSET', year: 1, assetId: assetOfB }]
          }
        })
      ).id;
    });

    it("A lit, modifie, supprime et exécute le scénario de B -> même réponse qu'un scénario inexistant, B intact", async () => {
      const path = (id: string) => `${P(tenantA.id)}/scenarios/${id}`;
      const attempts: Array<(id: string) => Promise<request.Response>> = [
        id => request(app).get(path(id)).set(authed(adminA)),
        id => request(app).patch(path(id)).set(authed(adminA)).send({ name: 'Volé' }),
        id => request(app).delete(path(id)).set(authed(adminA)),
        id =>
          request(app)
            .post(`${path(id)}/run`)
            .set(authed(adminA))
            .send({})
      ];
      for (const attempt of attempts) {
        const foreign = await attempt(scenarioOfB);
        const missing = await attempt(MISSING);
        expect(foreign.status).toBe(404);
        expect(shape(foreign)).toEqual(shape(missing));
      }
      const row = await prisma.patrimonyScenario.findUnique({ where: { id: scenarioOfB } });
      expect(row).toMatchObject({ tenantId: tenantB.id, name: 'Plan secret de B' });
    });

    it('les scénarios de A et de B sont disjoints ; le même nom est permis dans chaque agence', async () => {
      const own = await request(app)
        .post(`${P(tenantA.id)}/scenarios`)
        .set(authed(adminA))
        .send({ name: 'Plan secret de B', horizonYears: 5, baseScenario: 'PRUDENT' });
      expect(own.status).toBe(201);
      expect(Object.keys(own.body.data)).not.toContain('tenantId');
      expect(Object.keys(own.body.data)).not.toContain('createdByUserId');
      expect(Object.keys(own.body.data)).not.toContain('schemaVersion');

      const listA = await request(app)
        .get(`${P(tenantA.id)}/scenarios`)
        .set(authed(adminA));
      expect(listA.status).toBe(200);
      expect(listA.body.data.map((s: any) => s.id)).toEqual([own.body.data.id]);
      const listB = await request(app)
        .get(`${P(tenantB.id)}/scenarios`)
        .set(authed(adminB));
      expect(listB.body.data.map((s: any) => s.id)).toEqual([scenarioOfB]);

      const duplicate = await request(app)
        .post(`${P(tenantA.id)}/scenarios`)
        .set(authed(adminA))
        .send({ name: 'Plan secret de B', horizonYears: 5, baseScenario: 'PRUDENT' });
      expect(duplicate.status).toBe(409);
      const badId = await request(app)
        .get(`${P(tenantA.id)}/scenarios/pas-un-uuid`)
        .set(authed(adminA));
      expect(badId.status).toBe(400);
    });

    it("une projection de A avec l'actif ou la dette de B -> même réponse qu'un identifiant inexistant", async () => {
      const project = (operations: unknown[]) =>
        request(app)
          .post(`${P(tenantA.id)}/projections`)
          .set(authed(adminA))
          .send({ horizonYears: 5, baseScenario: 'CENTRAL', operations });
      const foreignAsset = await project([{ type: 'SELL_ASSET', year: 1, assetId: assetOfB }]);
      const missingAsset = await project([{ type: 'SELL_ASSET', year: 1, assetId: MISSING }]);
      expect(foreignAsset.status).toBe(422);
      expect(shape(foreignAsset)).toEqual(shape(missingAsset));
      expect(foreignAsset.body.errors[0].field).toBe('operations.0.assetId');

      const foreignDebt = await project([{ type: 'PREPAY_LOAN', year: 1, loanId: debtOfB, amount: 1 }]);
      const missingDebt = await project([{ type: 'PREPAY_LOAN', year: 1, loanId: MISSING, amount: 1 }]);
      expect(foreignDebt.status).toBe(422);
      expect(shape(foreignDebt)).toEqual(shape(missingDebt));
    });

    it("la projection de A ne compte ni les actifs ni les dettes de B, et n'écrit rien", async () => {
      const own = await request(app)
        .post(`${P(tenantA.id)}/assets`)
        .set(authed(adminA))
        .send({
          name: 'ActifA-proj',
          assetClass: 'CASH',
          details: { institution: 'Banque A', cashKind: 'BANK' },
          initialValuation: { valuatedAt: '2026-01-01', estimatedValue: 250000 }
        });
      expect(own.status).toBe(201);
      const before = {
        assets: await prisma.asset.count(),
        valuations: await prisma.assetValuation.count(),
        loans: await prisma.propertyLoan.count(),
        scenarios: await prisma.patrimonyScenario.count()
      };

      const res = await request(app)
        .post(`${P(tenantA.id)}/projections`)
        .set(authed(adminA))
        .send({
          horizonYears: 3,
          baseScenario: 'CENTRAL',
          compareScenarios: true,
          operations: [{ type: 'MONTHLY_SAVING', fromYear: 1, amount: 1000 }]
        });
      expect(res.status).toBe(200);
      // L'agence A porte déjà d'autres actifs (cas précédents) : le départ égale sa propre valeur nette.
      const netWorthA = await request(app)
        .get(`${P(tenantA.id)}/net-worth`)
        .set(authed(adminA));
      expect(netWorthA.status).toBe(200);
      expect(res.body.data.base.points[0]).toMatchObject({
        assets: netWorthA.body.data.totalAssets,
        debts: netWorthA.body.data.totalDebts,
        netWorth: netWorthA.body.data.netWorth
      });
      expect(netWorthA.body.data.totalAssets).toBeGreaterThanOrEqual(250000);
      expect(netWorthA.body.data.assets.map((x: any) => x.id)).not.toContain(assetOfB);
      expect(res.body.data.simulated.points).toHaveLength(4);
      expect(Object.keys(res.body.data.byScenario).sort()).toEqual(['CENTRAL', 'OPTIMISTIC', 'PRUDENT']);
      expect(JSON.stringify(res.body)).not.toContain(assetOfB);

      expect({
        assets: await prisma.asset.count(),
        valuations: await prisma.assetValuation.count(),
        loans: await prisma.propertyLoan.count(),
        scenarios: await prisma.patrimonyScenario.count()
      }).toEqual(before);
    });

    it("enregistrer un scénario de A qui cite l'actif ou la dette de B -> même 422 qu'un identifiant inexistant, rien n'est créé", async () => {
      const create = (operations: unknown[]) =>
        request(app)
          .post(`${P(tenantA.id)}/scenarios`)
          .set(authed(adminA))
          .send({ name: 'Cite B', horizonYears: 5, baseScenario: 'CENTRAL', operations });
      const foreignAsset = await create([{ type: 'SELL_ASSET', year: 1, assetId: assetOfB }]);
      const missingAsset = await create([{ type: 'SELL_ASSET', year: 1, assetId: MISSING }]);
      expect(foreignAsset.status).toBe(422);
      expect(shape(foreignAsset)).toEqual(shape(missingAsset));
      expect(foreignAsset.body.errors).toEqual([{ field: 'operations.0.assetId', message: 'Actif introuvable' }]);

      const foreignDebt = await create([{ type: 'PREPAY_LOAN', year: 1, loanId: debtOfB, amount: 1 }]);
      const missingDebt = await create([{ type: 'PREPAY_LOAN', year: 1, loanId: MISSING, amount: 1 }]);
      expect(foreignDebt.status).toBe(422);
      expect(shape(foreignDebt)).toEqual(shape(missingDebt));
      expect(foreignDebt.body.errors[0].field).toBe('operations.0.loanId');
      expect(JSON.stringify([foreignAsset.body, foreignDebt.body])).not.toContain(assetOfB);
      expect(await prisma.patrimonyScenario.count({ where: { tenantId: tenantA.id } })).toBe(0);

      const own = await request(app)
        .post(`${P(tenantA.id)}/scenarios`)
        .set(authed(adminA))
        .send({
          name: 'Plan A',
          horizonYears: 5,
          baseScenario: 'CENTRAL'
        });
      expect(own.status).toBe(201);
      const patchForeign = await request(app)
        .patch(`${P(tenantA.id)}/scenarios/${own.body.data.id}`)
        .set(authed(adminA))
        .send({ operations: [{ type: 'SELL_ASSET', year: 1, assetId: assetOfB }] });
      const patchMissing = await request(app)
        .patch(`${P(tenantA.id)}/scenarios/${own.body.data.id}`)
        .set(authed(adminA))
        .send({ operations: [{ type: 'SELL_ASSET', year: 1, assetId: MISSING }] });
      expect(patchForeign.status).toBe(422);
      expect(shape(patchForeign)).toEqual(shape(patchMissing));
      const stored = await prisma.patrimonyScenario.findUnique({ where: { id: own.body.data.id } });
      expect(stored?.operations).toEqual([]);
    });

    it("un scénario déjà enregistré qui cite l'actif de B ou un actif inexistant : mêmes avertissements à l'exécution (tolérance), rien de B ne fuit", async () => {
      const store = (name: string, assetId: string) =>
        prisma.patrimonyScenario.create({
          data: {
            tenantId: tenantA.id,
            name,
            horizonYears: 5,
            baseScenario: 'CENTRAL',
            operations: [{ type: 'SELL_ASSET', year: 1, assetId }]
          }
        });
      const withForeign = await store('Cite B', assetOfB);
      const withMissing = await store('Cite rien', MISSING);

      const run = (id: string) =>
        request(app)
          .post(`${P(tenantA.id)}/scenarios/${id}/run`)
          .set(authed(adminA))
          .send({});
      const runForeign = await run(withForeign.id);
      const runMissing = await run(withMissing.id);
      expect(runForeign.status).toBe(200);
      expect(runForeign.body.data.simulated.warnings).toContainEqual({
        code: 'OPERATION_NOT_APPLICABLE',
        index: 0,
        reason: 'ASSET_NOT_FOUND'
      });
      expect(runForeign.body.data).toEqual(runMissing.body.data);
      expect(JSON.stringify(runForeign.body)).not.toContain(assetOfB);
    });

    it('le plafond de 100 scénarios tient sous création concurrente (verrou consultatif)', async () => {
      const PRESET = 96;
      await prisma.patrimonyScenario.createMany({
        data: Array.from({ length: PRESET }, (_, i) => ({
          tenantId: tenantA.id,
          name: `Préchargé ${i}`,
          horizonYears: 5,
          baseScenario: 'CENTRAL' as const
        }))
      });
      const responses = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          request(app)
            .post(`${P(tenantA.id)}/scenarios`)
            .set(authed(adminA))
            .send({ name: `Concurrent ${i}`, horizonYears: 5, baseScenario: 'CENTRAL' })
        )
      );
      const statuses = responses.map(res => res.status).sort();
      expect(statuses).toEqual([201, 201, 201, 201, 409, 409, 409, 409]);
      expect(await prisma.patrimonyScenario.count({ where: { tenantId: tenantA.id } })).toBe(100);
    });
  });
});
