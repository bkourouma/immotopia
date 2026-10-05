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
import * as fs from 'fs/promises';
import PizZip from 'pizzip';
import request from 'supertest';
import { DocumentType } from '@prisma/client';
import app from '../../src/app';
import { prisma } from '../../src/utils/database';
import { signProposal } from '../../src/lib/ai/proposal-token';
import { flushAuditEvents } from '../../src/services/audit-service';
import { encodeAuditCursor } from '../../src/services/audit-read-service';
import { updateMemberRoles } from '../../src/services/membership-service';
import { generateAccessToken } from '../../src/utils/jwt-utils';
import { createSupplierTx } from '../../src/lib/finance/suppliers';
import { getEntitlements } from '../../src/services/subscription-v2-service';
import { env } from '../../src/config/env';
import { deleteCapturePhoto, storeCapturePhoto } from '../../src/lib/stock-whatsapp/capture-files';
import {
  applyPlatformProviderStatus,
  reconcilePlatformCheckoutPublic
} from '../../src/services/platform-payment-service';
import {
  createTestTenant,
  createTenantAdminUser,
  ensureTenantAdminRole,
  grantPersonalPatrimoineRole,
  suspendTenant,
  createContactDirect,
  createParticulierTenant,
  createPropertyDirect,
  createMaintenanceTicketDirect,
  createOutsiderUser,
  createTenantMemberUser,
  createSuperAdminUser,
  createPlatformDelegateUser,
  createRentalFixtureDirect,
  RentalFixture,
  cleanupTenants,
  ensureGlobalDocumentTemplates,
  removeSeededGlobalTemplates,
  SeededGlobalTemplates,
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
  // Modeles DOCX globaux semes par le bloc « generation DOCX reelle » (retires en fin de suite).
  let seededTemplates: SeededGlobalTemplates | undefined;

  beforeAll(async () => {
    tenantA = await createTestTenant('Agence-A');
    tenantB = await createTestTenant('Agence-B');
    createdTenantIds.push(tenantA.id, tenantB.id);
    adminA = await createTenantAdminUser(tenantA, 'admin-a');
    adminB = await createTenantAdminUser(tenantB, 'admin-b');
    // Les routes de données personnelles du patrimoine exigent PATRIMOINE_PERSONAL_* (rôle dédié, jamais TENANT_ADMIN).
    await grantPersonalPatrimoineRole(adminA, tenantA);
    await grantPersonalPatrimoineRole(adminB, tenantB);
  });

  afterAll(async () => {
    try {
      // Fichiers produits par la generation reelle (hors base) : a supprimer avec les lignes.
      const generated = await prisma.rentalDocument.findMany({
        where: { tenant_id: { in: createdTenantIds }, file_path: { not: null } },
        select: { file_path: true }
      });
      await Promise.all(generated.map(row => fs.rm(row.file_path as string, { force: true })));
      // Un echec de nettoyage remonte (il fait echouer la suite) : jamais silencieux.
      await cleanupTenants(createdTenantIds);
      // Apres les agences : leurs documents generes referencent le modele.
      if (seededTemplates) await removeSeededGlobalTemplates(seededTemplates);
    } finally {
      await prisma.$disconnect();
    }
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
      await grantPersonalPatrimoineRole(adminA2, tenantA);
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

  describe('ImmoCopilot — cas passant : generation DOCX reelle apres confirmation', () => {
    let rentalA: RentalFixture;
    let rentalB: RentalFixture;
    const executeOn = (tenantId: string, user: TestUser, proposalToken: string) =>
      request(app).post(`/api/tenants/${tenantId}/ai/actions/execute`).set(authed(user)).send({ proposalToken });

    const download = (tenantId: string, user: TestUser, documentId: string) =>
      request(app)
        .get(`/api/tenants/${tenantId}/documents/${documentId}/download`)
        .set(authed(user))
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });

    /** Texte brut de word/document.xml : prouve que le fichier est un .docx (ZIP) lisible. */
    function docxText(buffer: Buffer): string {
      const entry = new PizZip(buffer).file('word/document.xml');
      expect(entry).not.toBeNull();
      return entry!.asText().replace(/<[^>]+>/g, '');
    }

    beforeAll(async () => {
      seededTemplates = await ensureGlobalDocumentTemplates([DocumentType.RENT_STATEMENT, DocumentType.RENT_RECEIPT]);
      rentalA = await createRentalFixtureDirect(tenantA.id, adminA.id, 'A-DOCX');
      rentalB = await createRentalFixtureDirect(tenantB.id, adminB.id, 'B-DOCX');
    });

    it('releve de compte : bail reel de A -> proposition -> execution -> document genere, telechargeable, .docx valide', async () => {
      const token = signProposal({
        userId: adminA.id,
        tenantId: tenantA.id,
        args: { docType: 'RENT_STATEMENT', leaseId: rentalA.leaseId, startDate: '2026-01-01', endDate: '2026-03-31' }
      }).token;

      const res = await executeOn(tenantA.id, adminA, token);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      const payload = res.body.data;
      expect(payload.alreadyExisted).toBe(false);
      expect(payload.document.type).toBe('STATEMENT');
      expect(payload.document.filename).toMatch(/\.docx$/);
      expect(payload.document.downloadPath).toBe(`/tenants/${tenantA.id}/documents/${payload.document.id}/download`);

      const row = await prisma.rentalDocument.findFirst({ where: { id: payload.document.id } });
      expect(row).not.toBeNull();
      expect(row!.tenant_id).toBe(tenantA.id);
      expect(row!.lease_id).toBe(rentalA.leaseId);
      expect(row!.file_path).toBeTruthy();
      await expect(fs.stat(row!.file_path as string)).resolves.toBeTruthy();

      const file = await download(tenantA.id, adminA, payload.document.id);
      expect(file.status).toBe(200);
      expect(file.headers['content-type']).toContain('wordprocessingml.document');
      const buffer = file.body as Buffer;
      expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK');
      const text = docxText(buffer);
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toContain('{{');
      expect(text).not.toContain(rentalB.leaseNumber);
      expect(text).not.toContain(rentalB.renterName);
    });

    it("le document genere pour A n'est servi ni via l'URL de B (404), ni a un membre de B via l'URL de A (403)", async () => {
      const doc = await prisma.rentalDocument.findFirst({
        where: { tenant_id: tenantA.id, lease_id: rentalA.leaseId, file_path: { not: null } },
        select: { id: true }
      });
      expect(doc).not.toBeNull();

      const viaB = await download(tenantB.id, adminB, doc!.id);
      expect(viaB.status).toBe(404);
      const viaA = await download(tenantA.id, adminB, doc!.id);
      expect(viaA.status).toBe(403);
    });

    it('quittance : paiement reel de A -> execution -> .docx valide ; un second jeton pour le meme paiement renvoie la meme quittance', async () => {
      // Un paiement sans quittance (celui de la fixture en a deja une) : echeance, paiement, affectation.
      const installment = await prisma.rentalInstallment.create({
        data: {
          tenant_id: tenantA.id,
          lease_id: rentalA.leaseId,
          period_year: 2026,
          period_month: 2,
          due_date: new Date('2026-02-05T00:00:00.000Z'),
          status: 'PAID',
          currency: 'XOF',
          amount_rent: 100000,
          amount_paid: 100000
        }
      });
      const payment = await prisma.rentalPayment.create({
        data: {
          tenant_id: tenantA.id,
          lease_id: rentalA.leaseId,
          method: 'CASH',
          status: 'SUCCESS',
          currency: 'XOF',
          amount: 100000,
          idempotency_key: `idem-docx-${randomUUID()}`
        }
      });
      await prisma.rentalPaymentAllocation.create({
        data: {
          tenant_id: tenantA.id,
          payment_id: payment.id,
          installment_id: installment.id,
          amount: 100000,
          currency: 'XOF'
        }
      });
      const mint = () =>
        signProposal({
          userId: adminA.id,
          tenantId: tenantA.id,
          args: {
            docType: 'RENT_RECEIPT',
            leaseId: rentalA.leaseId,
            paymentId: payment.id,
            installmentId: installment.id
          }
        }).token;

      const first = await executeOn(tenantA.id, adminA, mint());
      expect(first.status).toBe(201);
      expect(first.body.data.alreadyExisted).toBe(false);
      expect(first.body.data.document.type).toBe('RENT_RECEIPT');

      const file = await download(tenantA.id, adminA, first.body.data.document.id);
      expect(file.status).toBe(200);
      const buffer = file.body as Buffer;
      expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK');
      expect(docxText(buffer).length).toBeGreaterThan(0);

      const second = await executeOn(tenantA.id, adminA, mint());
      expect(second.status).toBe(201);
      expect(second.body.data.alreadyExisted).toBe(true);
      expect(second.body.data.document.id).toBe(first.body.data.document.id);
      expect(
        await prisma.rentalDocument.count({
          where: { tenant_id: tenantA.id, type: 'RENT_RECEIPT', status: 'FINAL', payment_id: payment.id }
        })
      ).toBe(1);
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
  /**
   * Événements de la phase 3 (ADR-006) sur la vraie pile : refus de droit,
   * tentative d'un étranger, écriture transactionnelle, téléchargement.
   */
  describe("Journal d'activité — événements d'accès et actions critiques", () => {
    let agentA: TestUser;

    beforeAll(async () => {
      agentA = await createTenantMemberUser(tenantA, 'agent-a2', 'TENANT_AGENT_TEST', ['PROPERTIES_VIEW']);
    });

    async function visibleTo(user: TestUser, tenantId: string): Promise<any[]> {
      await flushAuditEvents();
      const res = await request(app).get(`/api/tenants/${tenantId}/audit?limit=100`).set(authed(user));
      expect(res.status).toBe(200);
      return res.body.data.logs;
    }

    it("un refus de droit d'un membre est tracé : l'administrateur de SON agence le voit, pas celui d'une autre", async () => {
      const denied = await request(app).get(`/api/tenants/${tenantA.id}/audit`).set(authed(agentA));
      expect(denied.status).toBe(403);
      await flushAuditEvents();

      const row = await prisma.auditLog.findFirst({
        where: { tenantId: tenantA.id, actionKey: 'ACCESS_DENIED', actorUserId: agentA.id }
      });
      expect(row).toMatchObject({ outcome: 'DENIED', category: 'SECURITY', visibility: 'TENANT', scope: 'TENANT' });
      expect((row?.payload as any)?.permission).toBe('TENANT_AUDIT_VIEW');

      expect((await visibleTo(adminA, tenantA.id)).map(log => log.id)).toContain(row?.id);
      expect((await visibleTo(adminB, tenantB.id)).map(log => log.id)).not.toContain(row?.id);
    });

    it("la tentative d'un étranger sur l'URL d'une agence est tracée, mais jamais montrée à cette agence", async () => {
      const probe = await request(app).get(`/api/tenants/${tenantA.id}/audit`).set(authed(adminB));
      expect(probe.status).toBe(403);
      await flushAuditEvents();

      const row = await prisma.auditLog.findFirst({
        where: { actionKey: 'TENANT_ACCESS_DENIED', actorUserId: adminB.id, entityId: tenantA.id }
      });
      expect(row).toMatchObject({ tenantId: null, scope: 'PLATFORM', visibility: 'PLATFORM_ONLY' });
      expect((row?.payload as any)?.targetTenantId).toBe(tenantA.id);

      const seenByA = await visibleTo(adminA, tenantA.id);
      expect(seenByA.map(log => log.id)).not.toContain(row?.id);
      expect(JSON.stringify(seenByA)).not.toContain(adminB.email);
    });

    it("un changement de rôle est écrit dans la transaction : la trace existe sans attendre la file, et l'agence la voit", async () => {
      const role = await prisma.role.findUniqueOrThrow({ where: { key: 'TENANT_AGENT_TEST' } });
      await updateMemberRoles(agentA.id, tenantA.id, { roleIds: [role.id] }, adminA.id);

      // Aucun `flushAuditEvents()` : une écriture asynchrone ne serait pas encore là.
      const row = await prisma.auditLog.findFirst({
        where: { tenantId: tenantA.id, actionKey: 'ROLE_ASSIGNED', entityId: agentA.id }
      });
      expect(row).toMatchObject({ category: 'SECURITY', visibility: 'TENANT', actorUserId: adminA.id });
      expect((await visibleTo(adminA, tenantA.id)).map(log => log.id)).toContain(row?.id);
    });

    it("un document téléchargé est tracé au nom de l'agence (témoin : le bloc Syndic ci-dessus télécharge un PDF de B)", async () => {
      await flushAuditEvents();
      const row = await prisma.auditLog.findFirst({
        where: { tenantId: tenantB.id, actionKey: 'DOCUMENT_DOWNLOADED', actorUserId: adminB.id }
      });
      expect(row).toMatchObject({ category: 'EXPORT', visibility: 'TENANT', outcome: 'SUCCESS' });
      expect((row?.payload as any)?.contentType).toBe('application/pdf');
      expect((await visibleTo(adminB, tenantB.id)).map(log => log.id)).toContain(row?.id);
      expect((await visibleTo(adminA, tenantA.id)).map(log => log.id)).not.toContain(row?.id);
    });
  });
  /**
   * Console plateforme (ADR-006, phase 4) sur la vraie pile : le super-admin lit
   * TOUT, un administrateur d'agence n'y entre pas, un rôle plateforme délégué
   * consulte sans exporter, et l'export est tracé avant d'envoyer des données.
   */
  describe("Journal d'audit — console plateforme", () => {
    const marker = randomUUID().slice(0, 8);
    const requestId = `rid-${marker}`;
    let superAdmin: TestUser;
    let delegate: TestUser;
    const ids: Record<string, string> = {};

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

    async function readAll(user: TestUser, query: string): Promise<any[]> {
      const logs: any[] = [];
      let cursor: string | null = null;
      for (let guard = 0; guard < 200; guard++) {
        const suffix: string = `?limit=2${query}${cursor ? `&cursor=${cursor}` : ''}`;
        const res: request.Response = await request(app).get(`/api/admin/audit${suffix}`).set(authed(user));
        expect(res.status).toBe(200);
        logs.push(...res.body.data.logs);
        cursor = res.body.data.nextCursor;
        if (!cursor) return logs;
      }
      throw new Error('pagination sans fin');
    }

    beforeAll(async () => {
      superAdmin = await createSuperAdminUser('super-admin');
      delegate = await createPlatformDelegateUser('delegue', `PLATFORM_AUDIT_DELEGATE_${marker}`, [
        'PLATFORM_AUDIT_VIEW',
        'PLATFORM_AUDIT_EXPORT'
      ]);
      const now = Date.now();
      await insertRow('pA', {
        tenantId: tenantA.id,
        actorUserId: adminA.id,
        requestId,
        createdAt: new Date(now - 5000)
      });
      await insertRow('pAInternal', {
        tenantId: tenantA.id,
        visibility: 'PLATFORM_ONLY',
        category: 'BILLING',
        actionKey: 'CAPACITY_OVERRIDE_GRANTED',
        requestId,
        createdAt: new Date(now - 4000)
      });
      await insertRow('pB', { tenantId: tenantB.id, actorUserId: adminB.id, createdAt: new Date(now - 3000) });
      await insertRow('pNull', {
        tenantId: null,
        scope: 'PLATFORM',
        visibility: 'PLATFORM_ONLY',
        actionKey: 'AI_SETTINGS_UPDATED',
        category: 'AI',
        createdAt: new Date(now - 2000)
      });
      await insertRow('pStaff', {
        tenantId: tenantA.id,
        actionKey: 'TENANT_UPDATED',
        actorType: 'SUPER_ADMIN',
        actorUserId: superAdmin.id,
        actorLabel: 'staff@immotopia.test',
        ipAddress: '203.0.113.9',
        userAgent: 'staff-browser',
        createdAt: new Date(now - 1000)
      });
    });

    it('le super-admin lit tout : toutes les agences, les lignes réservées à la plateforme et sans agence', async () => {
      const read = (await readAll(superAdmin, `&requestId=${requestId}`)).map(log => log.id);
      expect(read.sort()).toEqual([ids.pA, ids.pAInternal].sort());

      const all = await readAll(superAdmin, '');
      const allIds = all.map(log => log.id);
      for (const key of ['pA', 'pAInternal', 'pB', 'pNull', 'pStaff']) expect(allIds).toContain(ids[key]);
    });

    it("l'identité complète du personnel (nom, IP, navigateur) est visible de la plateforme", async () => {
      const staff = (await readAll(superAdmin, '&actorType=SUPER_ADMIN')).find(log => log.id === ids.pStaff);
      expect(staff).toMatchObject({
        actorType: 'SUPER_ADMIN',
        actorLabel: 'staff@immotopia.test',
        ipAddress: '203.0.113.9',
        userAgent: 'staff-browser',
        user: { email: superAdmin.email },
        tenant: { id: tenantA.id }
      });
    });

    it('les filtres agence, visibilité et portée restreignent bien la lecture', async () => {
      const ofA = (await readAll(superAdmin, `&tenantId=${tenantA.id}`)).map(log => log.id);
      expect(ofA).toEqual(expect.arrayContaining([ids.pA, ids.pAInternal, ids.pStaff]));
      expect(ofA).not.toContain(ids.pB);
      expect(ofA).not.toContain(ids.pNull);

      const platformOnly = await readAll(superAdmin, '&visibility=PLATFORM_ONLY');
      expect(platformOnly.every(log => log.visibility === 'PLATFORM_ONLY')).toBe(true);
      expect(platformOnly.map(log => log.id)).toEqual(expect.arrayContaining([ids.pAInternal, ids.pNull]));

      const platformScope = (await readAll(superAdmin, '&scope=PLATFORM')).map(log => log.id);
      expect(platformScope).toContain(ids.pNull);
      expect(platformScope).not.toContain(ids.pA);
    });

    it('la pagination par curseur ne perd ni ne répète une ligne', async () => {
      const read = (await readAll(superAdmin, `&tenantId=${tenantA.id}`)).map(log => log.id);
      expect(new Set(read).size).toBe(read.length);
      const expected = await prisma.auditLog.findMany({
        where: { tenantId: tenantA.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true }
      });
      expect(read).toEqual(expected.map(row => row.id));
    });

    it("un administrateur d'agence n'entre ni dans la console ni dans l'export, un anonyme non plus", async () => {
      expect((await request(app).get('/api/admin/audit')).status).toBe(401);
      const view = await request(app).get('/api/admin/audit').set(authed(adminA));
      const exp = await request(app).get('/api/admin/audit/export').set(authed(adminA));
      expect(view.status).toBe(403);
      expect(exp.status).toBe(403);
      expect(JSON.stringify(view.body)).not.toContain(ids.pNull);
      expect(exp.headers['content-type']).not.toContain('text/csv');
    });

    it('un rôle plateforme délégué consulte, mais seul le super-admin exporte', async () => {
      const view = await request(app).get(`/api/admin/audit?requestId=${requestId}`).set(authed(delegate));
      expect(view.status).toBe(200);
      expect(view.body.data.logs.length).toBe(2);

      const exp = await request(app).get('/api/admin/audit/export').set(authed(delegate));
      expect(exp.status).toBe(403);
      expect(exp.headers['content-type']).not.toContain('text/csv');
    });

    it('les anciens paramètres et ceux de l’export non prévus sont refusés en 400', async () => {
      for (const url of [
        '/api/admin/audit?page=1',
        '/api/admin/audit?action=PROPERTY_CREATED',
        '/api/admin/audit/export?limit=10',
        '/api/admin/audit/export?cursor=abc'
      ]) {
        expect((await request(app).get(url).set(authed(superAdmin))).status).toBe(400);
      }
    });

    it("l'export est tracé AVANT l'envoi des données, ne se double pas, et contient les lignes filtrées", async () => {
      const before = await prisma.auditLog.count({
        where: { actionKey: 'AUDIT_EXPORTED', actorUserId: superAdmin.id }
      });
      const res = await request(app)
        .get(`/api/admin/audit/export?requestId=${requestId}`)
        .set(authed(superAdmin))
        .buffer(true)
        .parse((response, callback) => {
          let data = '';
          response.setEncoding('utf8');
          response.on('data', chunk => (data += chunk));
          response.on('end', () => callback(null, data));
        });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toMatch(/journal-audit-\d{4}-\d{2}-\d{2}\.csv/);
      expect(res.headers['x-export-truncated']).toBe('false');
      expect(res.headers['x-export-rows']).toBe('2');
      const lines = String(res.body).trimEnd().split('\r\n');
      expect(lines).toHaveLength(1 + 2);
      expect(String(res.body)).toContain(`pA-${marker}`);
      expect(String(res.body)).toContain('CAPACITY_OVERRIDE_GRANTED');

      // Aucun `flushAuditEvents()` : la trace de l'export est écrite de façon synchrone.
      const traces = await prisma.auditLog.findMany({
        where: { actionKey: 'AUDIT_EXPORTED', actorUserId: superAdmin.id },
        orderBy: { createdAt: 'desc' }
      });
      expect(traces.length).toBe(before + 1);
      expect(traces[0]).toMatchObject({ category: 'SECURITY', visibility: 'PLATFORM_ONLY', tenantId: null });
      expect((traces[0].payload as any).rows).toBe(2);
      expect((traces[0].payload as any).filters.requestId).toBe(requestId);

      // Le middleware d'accès ne double pas l'export par un DATA_EXPORTED.
      await flushAuditEvents();
      const doubled = await prisma.auditLog.count({
        where: { actionKey: 'DATA_EXPORTED', actorUserId: superAdmin.id }
      });
      expect(doubled).toBe(0);
    });

    it('consulter la console est tracé, réservé à la plateforme', async () => {
      await flushAuditEvents();
      const before = await prisma.auditLog.count({ where: { actionKey: 'AUDIT_VIEWED', actorUserId: superAdmin.id } });
      expect((await request(app).get('/api/admin/audit?limit=5').set(authed(superAdmin))).status).toBe(200);
      await flushAuditEvents();
      const traces = await prisma.auditLog.findMany({
        where: { actionKey: 'AUDIT_VIEWED', actorUserId: superAdmin.id }
      });
      expect(traces.length).toBe(before + 1);
      expect(traces.every(trace => trace.visibility === 'PLATFORM_ONLY')).toBe(true);
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

  describe('Espace particulier — montée de palier payante (lot 4D, simulateur PaySecureHub)', () => {
    const upgradeUrl = (tenantId: string) => `/api/tenants/${tenantId}/subscription/upgrade`;

    async function particulier(prefix: string, options: { phone?: string | null } = {}) {
      const tenant = await createParticulierTenant(prefix, options);
      createdTenantIds.push(tenant.id);
      const admin = await createTenantAdminUser(tenant, `${prefix.toLowerCase()}-admin`);
      return { tenant, admin };
    }

    const startUpgrade = (tenantId: string, user: TestUser, body: unknown = { target: 'PARTICULIER_PLUS' }) =>
      request(app)
        .post(upgradeUrl(tenantId))
        .set(authed(user))
        .send(body as object);

    const simulate = (code: string, outcome: 'success' | 'failed' | 'canceled') =>
      request(app).post(`/api/payment-gateway/simulator/${code}/${outcome}`);

    const activePacks = async (tenantId: string) =>
      (
        await prisma.subscriptionItem.findMany({
          where: { tenantId, status: 'ACTIVE', catalogItem: { kind: 'PACK' } },
          select: { unitMonthlyPrice: true, catalogItem: { select: { code: true } } }
        })
      ).map(i => i.catalogItem.code);

    const actifsLimit = async (tenantId: string) => (await getEntitlements(tenantId)).capacities.ACTIFS.limit;

    it('parcours complet : facture du premier mois, paiement simulé réussi, pack PLUS et plafond 100 visible aussitôt', async () => {
      const { tenant, admin } = await particulier('Part-parcours');
      expect(await actifsLimit(tenant.id)).toBe(10); // réchauffe le cache des droits (30 s)

      const res = await startUpgrade(tenant.id, admin);
      expect(res.status).toBe(201);
      const { invoiceId, checkoutUrl, code } = res.body.data;
      expect(checkoutUrl).toContain(`/api/payment-gateway/simulator/${code}`);

      // Facture : 2 900 HT + TVA 18 % = 3 422, entiers, une seule ligne de pack (aucune mise en route).
      const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { lines: true } });
      expect(invoice.status).toBe('ISSUED');
      expect(Number(invoice.amountExclTax)).toBe(2900);
      expect(Number(invoice.taxAmount)).toBe(522);
      expect(Number(invoice.amountTotal)).toBe(3422);
      expect(invoice.lines.filter(l => l.kind === 'PACK')).toHaveLength(1);
      expect(invoice.lines.filter(l => l.kind === 'SETUP')).toHaveLength(0);

      // Aucun changement de droits avant la confirmation.
      expect(await activePacks(tenant.id)).toEqual(['PARTICULIER_GRATUIT']);
      expect(await actifsLimit(tenant.id)).toBe(10);
      const periodBefore = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } });

      const paid = await simulate(code, 'success');
      expect(paid.status).toBe(303);

      expect(await activePacks(tenant.id)).toEqual(['PARTICULIER_PLUS']);
      // Le cache de 30 s a été invalidé : le plafond de 100 est lu tout de suite.
      expect(await actifsLimit(tenant.id)).toBe(100);
      const sub = await prisma.subscription.findUniqueOrThrow({
        where: { tenantId: tenant.id },
        include: { items: { include: { catalogItem: true }, orderBy: { createdAt: 'asc' } } }
      });
      expect(sub.status).toBe('ACTIVE');
      expect(sub.billingCycle).toBe('MONTHLY');
      expect(sub.quotaPolicy).toBe('BLOCK');
      expect(sub.currentPeriodStart.getTime()).toBeGreaterThan(periodBefore.currentPeriodStart.getTime());
      expect(sub.currentPeriodEnd.getTime()).toBeGreaterThan(sub.currentPeriodStart.getTime());
      expect(sub.nextBillingAt?.getTime()).toBe(sub.currentPeriodEnd.getTime());
      const free = sub.items.find(i => i.catalogItem.code === 'PARTICULIER_GRATUIT');
      const plus = sub.items.find(i => i.catalogItem.code === 'PARTICULIER_PLUS');
      expect(free?.status).toBe('ENDED');
      expect(free?.endReason).toBe('UPGRADE');
      expect(Number(plus?.unitMonthlyPrice)).toBe(2900);
      expect(plus?.billedThrough?.getTime()).toBe(sub.currentPeriodEnd.getTime());
      const settled = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
      expect(settled.status).toBe('PAID');
      expect(settled.periodStart?.getTime()).toBe(sub.currentPeriodStart.getTime());

      // Déjà sur la cible : 409 ALREADY_ON_TARGET.
      const again = await startUpgrade(tenant.id, admin);
      expect(again.status).toBe(409);
      expect(again.body.code).toBe('ALREADY_ON_TARGET');
    });

    it('notification rejouée et réconciliations répétées : un seul changement, un seul règlement', async () => {
      const { tenant, admin } = await particulier('Part-rejeu');
      const { invoiceId, code } = (await startUpgrade(tenant.id, admin)).body.data;
      await simulate(code, 'success');
      await simulate(code, 'success');
      await reconcilePlatformCheckoutPublic(code);
      await reconcilePlatformCheckoutPublic(code);
      const poll = await request(app)
        .get(`/api/tenants/${tenant.id}/subscription/checkouts/${code}`)
        .set(authed(admin));
      expect(poll.status).toBe(200);
      expect(poll.body.data.status).toBe('SUCCESS');

      expect(await prisma.platformInvoicePayment.count({ where: { invoiceId } })).toBe(1);
      expect(await prisma.subscriptionItem.count({ where: { tenantId: tenant.id } })).toBe(2);
      expect(await activePacks(tenant.id)).toEqual(['PARTICULIER_PLUS']);
    });

    it('paiement annulé ou échoué : reste gratuit ; réessai possible sur la même facture', async () => {
      const { tenant, admin } = await particulier('Part-annule');
      const first = (await startUpgrade(tenant.id, admin)).body.data;
      await simulate(first.code, 'canceled');
      expect(await activePacks(tenant.id)).toEqual(['PARTICULIER_GRATUIT']);
      expect(await actifsLimit(tenant.id)).toBe(10);

      const second = await startUpgrade(tenant.id, admin);
      expect(second.status).toBe(201);
      expect(second.body.data.invoiceId).toBe(first.invoiceId);
      expect(second.body.data.code).not.toBe(first.code);
      await simulate(second.body.data.code, 'failed');
      expect(await activePacks(tenant.id)).toEqual(['PARTICULIER_GRATUIT']);
      expect(await prisma.platformInvoicePayment.count({ where: { tenantId: tenant.id } })).toBe(0);

      const third = await startUpgrade(tenant.id, admin);
      expect(third.status).toBe(201);
      await simulate(third.body.data.code, 'success');
      expect(await activePacks(tenant.id)).toEqual(['PARTICULIER_PLUS']);
      // Une seule facture d'upgrade pour les trois essais.
      expect(await prisma.invoice.count({ where: { tenantId: tenant.id, kind: 'PLATFORM' } })).toBe(1);
    });

    it('paiement expiré ou en REVIEW : aucun droit ne change', async () => {
      const { tenant, admin } = await particulier('Part-expire');
      const { code } = (await startUpgrade(tenant.id, admin)).body.data;
      await prisma.platformPaymentCheckout.update({
        where: { codePaiement: code },
        data: { status: 'EXPIRED', simulatedOutcome: 'SUCCESS' }
      });
      await reconcilePlatformCheckoutPublic(code);
      expect((await prisma.platformPaymentCheckout.findUniqueOrThrow({ where: { codePaiement: code } })).status).toBe(
        'EXPIRED'
      );
      expect(await activePacks(tenant.id)).toEqual(['PARTICULIER_GRATUIT']);
    });

    it('montant divergent : checkout en REVIEW, aucun changement de pack', async () => {
      const { tenant, admin } = await particulier('Part-diverge');
      const { code, invoiceId } = (await startUpgrade(tenant.id, admin)).body.data;
      const row = await prisma.platformPaymentCheckout.findUniqueOrThrow({ where: { codePaiement: code } });
      const result = await applyPlatformProviderStatus(row, {
        rawState: 'SUCCESSFUL',
        mappedState: 'SUCCESS',
        transactionId: 'T-DIVERGE',
        amount: 100,
        fees: 0,
        serviceName: 'Wave',
        error: null,
        raw: {}
      });
      expect(result.status).toBe('REVIEW');
      expect(await activePacks(tenant.id)).toEqual(['PARTICULIER_GRATUIT']);
      expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).status).toBe('ISSUED');
      expect(await actifsLimit(tenant.id)).toBe(10);
    });

    it('refus : agence 403, téléphone absent 422 (rien créé), paiement en cours 409 avec reprise, corps strict 400', async () => {
      // Tenant de type agence.
      const agency = await startUpgrade(tenantA.id, adminA);
      expect(agency.status).toBe(403);
      expect(await prisma.invoice.count({ where: { tenantId: tenantA.id, lines: { some: { kind: 'PACK' } } } })).toBe(
        0
      );

      // Téléphone absent.
      const noPhone = await particulier('Part-sans-tel', { phone: null });
      const phone = await startUpgrade(noPhone.tenant.id, noPhone.admin);
      expect(phone.status).toBe(422);
      expect(phone.body.code).toBe('PHONE_REQUIRED');
      expect(await prisma.invoice.count({ where: { tenantId: noPhone.tenant.id } })).toBe(0);
      expect(await prisma.platformPaymentCheckout.count({ where: { tenantId: noPhone.tenant.id } })).toBe(0);

      // Paiement en cours (moins de 15 minutes).
      const { tenant, admin } = await particulier('Part-en-cours');
      const first = (await startUpgrade(tenant.id, admin)).body.data;
      const busy = await startUpgrade(tenant.id, admin);
      expect(busy.status).toBe(409);
      expect(busy.body.code).toBe('PAYMENT_IN_PROGRESS');
      expect(busy.body.data.codePaiement).toBe(first.code);
      expect(busy.body.data.checkoutUrl).toBe(first.checkoutUrl);

      // Corps strict et cible en liste blanche.
      expect((await startUpgrade(tenant.id, admin, { target: 'AGENCE' })).status).toBe(400);
      expect((await startUpgrade(tenant.id, admin, { target: 'PARTICULIER_GRATUIT' })).status).toBe(400);
      expect((await startUpgrade(tenant.id, admin, { target: 'PARTICULIER_PLUS', tenantId: tenantA.id })).status).toBe(
        400
      );
      expect((await startUpgrade(tenant.id, admin, {})).status).toBe(400);
      // Sans session.
      expect((await request(app).post(upgradeUrl(tenant.id)).send({ target: 'PARTICULIER_PLUS' })).status).toBe(401);
    });

    it("étanchéité : un espace ne voit ni ne paie l'upgrade d'un autre (même réponse qu'un objet inexistant)", async () => {
      const a = await particulier('Part-iso-a');
      const b = await particulier('Part-iso-b');
      const ofB = (await startUpgrade(b.tenant.id, b.admin)).body.data;

      // A tente d'agir sur B via l'URL de B : refusé.
      const onB = await startUpgrade(b.tenant.id, a.admin);
      expect(onB.status).toBe(403);
      expect(await prisma.platformPaymentCheckout.count({ where: { tenantId: b.tenant.id } })).toBe(1);

      // A tente de payer la facture de B, ou de suivre son paiement, via SES URL.
      const payForeign = await request(app)
        .post(`/api/tenants/${a.tenant.id}/subscription/invoices/${ofB.invoiceId}/checkout`)
        .set(authed(a.admin));
      const payMissing = await request(app)
        .post(`/api/tenants/${a.tenant.id}/subscription/invoices/${randomUUID()}/checkout`)
        .set(authed(a.admin));
      expect(payForeign.status).toBe(404);
      expect(payForeign.body).toEqual(payMissing.body);

      const pollForeign = await request(app)
        .get(`/api/tenants/${a.tenant.id}/subscription/checkouts/${ofB.code}`)
        .set(authed(a.admin));
      const pollMissing = await request(app)
        .get(`/api/tenants/${a.tenant.id}/subscription/checkouts/IMP-INEXISTANT`)
        .set(authed(a.admin));
      expect(pollForeign.status).toBe(404);
      expect(pollForeign.body).toEqual(pollMissing.body);
      expect(JSON.stringify(pollForeign.body)).not.toContain(ofB.invoiceId);

      // Rien n'a bougé chez A ni chez B.
      expect(await activePacks(a.tenant.id)).toEqual(['PARTICULIER_GRATUIT']);
      expect(await activePacks(b.tenant.id)).toEqual(['PARTICULIER_GRATUIT']);
    });
  });

  /**
   * Lot 040 — contrôle du stock (spec §8.4, B8-R3). B possède un preneur, un
   * bon de sortie, un inventaire en cours, une pièce jointe, une alerte et une
   * facture réceptionnable ; un responsable du stock de A, sur SES propres URL,
   * n'atteint aucun de ces objets (404) et aucune réponse de A n'en cite un.
   */
  describe('Stock — étanchéité entre agences (lot 040)', () => {
    const STOCK_ALL = [
      'STOCK_VIEW',
      'STOCK_VALUES_VIEW',
      'STOCK_RECEIVE',
      'STOCK_ISSUE',
      'STOCK_TRANSFER',
      'STOCK_COUNT',
      'STOCK_TAKERS_MANAGE',
      'STOCK_COUNT_VALIDATE',
      'STOCK_DISPOSE',
      'STOCK_ALERTS_VIEW'
    ];
    const S = (tenantId: string) => `/api/tenants/${tenantId}/finance/stock`;
    const today = () => new Date().toISOString().slice(0, 10);
    const month = () => new Date().toISOString().slice(0, 7);

    let stockA: TestUser;
    let stockB: TestUser;
    /** Ce qui appartient à A : une sortie de A ne diffère d'une sortie valable que par UN identifiant de B. */
    const ofA = { locationId: '', itemId: '', siteId: '', costCategoryId: '', takerId: '' };
    const ofB = {
      locationId: '',
      itemId: '',
      siteId: '',
      takerId: '',
      slipId: '',
      countId: '',
      validatedCountId: '',
      costCategoryId: '',
      attachmentId: '',
      alertId: '',
      invoiceId: '',
      takerName: `Preneur de B ${randomUUID().slice(0, 6)}`,
      locationLabel: `Magasin de B ${randomUUID().slice(0, 6)}`
    };
    /** Identifiants et libellés de B qu'aucune réponse de A ne doit citer. */
    const secretsOfB = () => Object.values(ofB).filter(value => value.length > 0);

    function expectNoTraceOfB(body: unknown): void {
      const text = JSON.stringify(body ?? {});
      for (const secret of secretsOfB()) {
        expect(text).not.toContain(secret);
      }
    }

    beforeAll(async () => {
      stockA = await createTenantMemberUser(tenantA, 'stock-a', 'STOCK_ISOLATION_TEST', STOCK_ALL);
      stockB = await createTenantMemberUser(tenantB, 'stock-b', 'STOCK_ISOLATION_TEST', STOCK_ALL);
      const tid = tenantB.id;

      // A a son propre stock : ses listes ne sont pas vides, la comparaison discrimine.
      ofA.locationId = (
        await prisma.stockLocation.create({
          data: { tenantId: tenantA.id, kind: 'WAREHOUSE', label: `Magasin de A ${randomUUID().slice(0, 6)}` }
        })
      ).id;
      ofA.itemId = (
        await prisma.stockItem.create({
          data: { tenantId: tenantA.id, reference: `A-${randomUUID().slice(0, 6)}`, label: 'Ciment de A', unit: 'sac' }
        })
      ).id;
      await prisma.stockBalance.create({
        data: {
          tenantId: tenantA.id,
          itemId: ofA.itemId,
          locationId: ofA.locationId,
          quantity: 100,
          value: 500_000,
          currency: 'XOF'
        }
      });
      ofA.siteId = (await prisma.constructionSite.create({ data: { tenantId: tenantA.id, name: 'Chantier de A' } })).id;
      ofA.costCategoryId = (
        await prisma.costCategory.create({ data: { tenantId: tenantA.id, label: 'Gros œuvre A' } })
      ).id;
      ofA.takerId = (
        await prisma.stockTaker.create({
          data: {
            tenantId: tenantA.id,
            fullName: 'Preneur de A',
            normalizedName: 'preneur de a',
            createdByUserId: stockA.id
          }
        })
      ).id;

      ofB.siteId = (await prisma.constructionSite.create({ data: { tenantId: tid, name: 'Chantier de B' } })).id;
      const costCategoryId = (await prisma.costCategory.create({ data: { tenantId: tid, label: 'Gros œuvre B' } })).id;
      ofB.costCategoryId = costCategoryId;
      ofB.locationId = (
        await prisma.stockLocation.create({ data: { tenantId: tid, kind: 'WAREHOUSE', label: ofB.locationLabel } })
      ).id;
      ofB.itemId = (
        await prisma.stockItem.create({
          data: { tenantId: tid, reference: `B-${randomUUID().slice(0, 6)}`, label: 'Ciment de B', unit: 'sac' }
        })
      ).id;
      await prisma.stockBalance.create({
        data: {
          tenantId: tid,
          itemId: ofB.itemId,
          locationId: ofB.locationId,
          quantity: 100,
          value: 500_000,
          currency: 'XOF'
        }
      });
      ofB.takerId = (
        await prisma.stockTaker.create({
          data: {
            tenantId: tid,
            fullName: ofB.takerName,
            normalizedName: ofB.takerName.toLowerCase(),
            createdByUserId: stockB.id
          }
        })
      ).id;

      // Un vrai bon de sortie, par l'API de B.
      const issue = await request(app)
        .post(`${S(tid)}/issues`)
        .set({ Authorization: stockB.authHeader })
        .send({
          locationId: ofB.locationId,
          siteId: ofB.siteId,
          issueDate: today(),
          takerId: ofB.takerId,
          lines: [{ itemId: ofB.itemId, quantity: 10, costCategoryId }]
        });
      expect(issue.status).toBe(201);
      ofB.slipId = issue.body.data.slip.id;

      // Un inventaire en cours, avec une ligne.
      const count = await request(app)
        .post(`${S(tid)}/counts`)
        .set({ Authorization: stockB.authHeader })
        .send({ locationId: ofB.locationId, countedAt: today() });
      expect(count.status).toBe(201);
      ofB.countId = count.body.data.id;
      const line = await request(app)
        .put(`${S(tid)}/counts/${ofB.countId}/lines`)
        .set({ Authorization: stockB.authHeader })
        .send({ itemId: ofB.itemId, countedQuantity: 88 });
      expect(line.status).toBe(200);

      // Un inventaire VALIDÉ (procès-verbal émis), sur un second lieu : compté
      // et clos par stockB, validé par une autre personne de B (quatre yeux).
      const validatorB = await createTenantMemberUser(tenantB, 'stock-b-valideur', 'STOCK_ISOLATION_TEST', STOCK_ALL);
      const secondLocationId = (
        await prisma.stockLocation.create({
          data: { tenantId: tid, kind: 'WAREHOUSE', label: `Dépôt de B ${randomUUID().slice(0, 6)}` }
        })
      ).id;
      await prisma.stockBalance.create({
        data: {
          tenantId: tid,
          itemId: ofB.itemId,
          locationId: secondLocationId,
          quantity: 30,
          value: 150_000,
          currency: 'XOF'
        }
      });
      const toValidate = await request(app)
        .post(`${S(tid)}/counts`)
        .set({ Authorization: stockB.authHeader })
        .send({ locationId: secondLocationId, countedAt: today() });
      expect(toValidate.status).toBe(201);
      ofB.validatedCountId = toValidate.body.data.id;
      const counted = await request(app)
        .put(`${S(tid)}/counts/${ofB.validatedCountId}/lines`)
        .set({ Authorization: stockB.authHeader })
        .send({ itemId: ofB.itemId, countedQuantity: 30 });
      expect(counted.status).toBe(200);
      const closed = await request(app)
        .post(`${S(tid)}/counts/${ofB.validatedCountId}/close`)
        .set({ Authorization: stockB.authHeader });
      expect(closed.status).toBe(200);
      const validated = await request(app)
        .post(`${S(tid)}/counts/${ofB.validatedCountId}/validate`)
        .set({ Authorization: validatorB.authHeader })
        .send({});
      expect(validated.status).toBe(200);

      // Pièce jointe et alerte : posées en base, sans fichier ni seuil à franchir.
      ofB.attachmentId = (
        await prisma.stockAttachment.create({
          data: {
            tenantId: tid,
            targetType: 'SLIP',
            slipId: ofB.slipId,
            purpose: 'SIGNED_SLIP',
            fileName: 'bon-signe-de-b.jpg',
            fileUrl: null,
            mimeType: 'image/jpeg',
            sizeBytes: 1234,
            sha256: 'b'.repeat(64),
            uploadedByUserId: stockB.id
          }
        })
      ).id;
      ofB.alertId = (
        await prisma.stockAlert.create({
          data: {
            tenantId: tid,
            kind: 'LARGE_ISSUE',
            severity: 'WARNING',
            dedupeKey: `LARGE_ISSUE:${ofB.slipId}`,
            amount: 50_000,
            threshold: 10_000,
            locationId: ofB.locationId,
            siteId: ofB.siteId,
            subjectType: 'StockSlip',
            subjectId: ofB.slipId
          }
        })
      ).id;

      // Une facture validée de B : réceptionnable chez B, jamais chez A.
      const supplier = await prisma.$transaction(tx =>
        createSupplierTx(tx, tid, { name: `Fournisseur de B ${randomUUID().slice(0, 6)}`, kind: 'MATERIALS' as any })
      );
      ofB.invoiceId = (
        await prisma.supplierInvoice.create({
          data: {
            tenantId: tid,
            supplierId: supplier.id,
            siteId: ofB.siteId,
            invoiceDate: new Date(),
            reference: `FAC-B-${randomUUID().slice(0, 6)}`,
            amount: 100_000,
            status: 'VALIDATED',
            createdByUserId: stockB.id,
            validatedByUserId: stockB.id,
            validatedAt: new Date()
          }
        })
      ).id;
    });

    afterAll(async () => {
      // Les clés `Restrict` du stock (bons, pièces, lignes) refusent une
      // suppression en cascade dans le désordre : on vide d'abord, dans l'ordre.
      for (const tenantId of [tenantA.id, tenantB.id]) {
        const steps: Array<() => Promise<unknown>> = [
          () => prisma.stockAttachment.deleteMany({ where: { tenantId } }),
          () => prisma.stockAlert.deleteMany({ where: { tenantId } }),
          () => prisma.costAllocation.deleteMany({ where: { tenantId } }),
          () => prisma.stockMovement.deleteMany({ where: { tenantId } }),
          () => prisma.stockCountLine.deleteMany({ where: { count: { tenantId } } }),
          () => prisma.stockSlip.deleteMany({ where: { tenantId } }),
          () => prisma.stockCount.deleteMany({ where: { tenantId } }),
          () => prisma.stockTaker.deleteMany({ where: { tenantId } }),
          () => prisma.stockClientRequest.deleteMany({ where: { tenantId } }),
          () => prisma.stockBalance.deleteMany({ where: { tenantId } }),
          () => prisma.stockItem.deleteMany({ where: { tenantId } }),
          () => prisma.stockLocation.deleteMany({ where: { tenantId } })
        ];
        for (const step of steps) {
          // eslint-disable-next-line no-await-in-loop -- l'ordre des suppressions compte.
          await step();
        }
      }
    });

    const asA = () => ({ Authorization: stockA.authHeader });
    const asB = () => ({ Authorization: stockB.authHeader });

    it('témoin : B lit ses propres objets (les tests ci-dessous discriminent)', async () => {
      const slip = await request(app)
        .get(`${S(tenantB.id)}/slips/${ofB.slipId}`)
        .set(asB());
      expect(slip.status).toBe(200);
      const takers = await request(app)
        .get(`${S(tenantB.id)}/takers`)
        .set(asB());
      expect(JSON.stringify(takers.body)).toContain(ofB.takerId);
      const alerts = await request(app)
        .get(`${S(tenantB.id)}/alerts`)
        .set(asB());
      expect(JSON.stringify(alerts.body)).toContain(ofB.alertId);
      const receivable = await request(app)
        .get(`${S(tenantB.id)}/receivable-invoices`)
        .set(asB());
      expect(JSON.stringify(receivable.body)).toContain(ofB.invoiceId);
      const context = await request(app)
        .get(`${S(tenantB.id)}/field-context`)
        .set(asB());
      expect(JSON.stringify(context.body)).toContain(ofB.locationId);
      const report = await request(app)
        .get(`${S(tenantB.id)}/counts/${ofB.validatedCountId}/report.pdf`)
        .set(asB());
      expect(report.status).toBe(200);
      const slipPdf = await request(app)
        .get(`${S(tenantB.id)}/slips/${ofB.slipId}/pdf`)
        .set(asB());
      expect(slipPdf.status).toBe(200);
    });

    it("preneur de B : PATCH via l'URL de A -> 404, preneur intact ; le carnet de A ne le cite pas", async () => {
      const patch = await request(app)
        .patch(`${S(tenantA.id)}/takers/${ofB.takerId}`)
        .set(asA())
        .send({ fullName: 'Modifie par A — ne doit jamais arriver' });
      expect(patch.status).toBe(404);
      expect((await prisma.stockTaker.findUnique({ where: { id: ofB.takerId } }))!.fullName).toBe(ofB.takerName);
      const list = await request(app)
        .get(`${S(tenantA.id)}/takers`)
        .set(asA());
      expect(list.status).toBe(200);
      expectNoTraceOfB(list.body);
    });

    it("bon de B : détail et PDF via l'URL de A -> 404", async () => {
      const detail = await request(app)
        .get(`${S(tenantA.id)}/slips/${ofB.slipId}`)
        .set(asA());
      expect(detail.status).toBe(404);
      expectNoTraceOfB(detail.body);
      const pdf = await request(app)
        .get(`${S(tenantA.id)}/slips/${ofB.slipId}/pdf`)
        .set(asA());
      expect(pdf.status).toBe(404);
    });

    it("inventaire de B : détail, saisie, clôture et procès-verbal via l'URL de A -> 404, rien ne bouge", async () => {
      expect(
        (
          await request(app)
            .get(`${S(tenantA.id)}/counts/${ofB.countId}`)
            .set(asA())
        ).status
      ).toBe(404);
      const put = await request(app)
        .put(`${S(tenantA.id)}/counts/${ofB.countId}/lines`)
        .set(asA())
        .send({ itemId: ofB.itemId, countedQuantity: 1 });
      expect(put.status).toBe(404);
      expect(
        (
          await request(app)
            .post(`${S(tenantA.id)}/counts/${ofB.countId}/close`)
            .set(asA())
        ).status
      ).toBe(404);
      const report = await request(app)
        .get(`${S(tenantA.id)}/counts/${ofB.countId}/report.pdf`)
        .set(asA());
      expect(report.status).toBe(404);
      // L'inventaire VALIDÉ de B : ni son détail ni son procès-verbal.
      const validated = await request(app)
        .get(`${S(tenantA.id)}/counts/${ofB.validatedCountId}`)
        .set(asA());
      expect(validated.status).toBe(404);
      expectNoTraceOfB(validated.body);
      const validatedReport = await request(app)
        .get(`${S(tenantA.id)}/counts/${ofB.validatedCountId}/report.pdf`)
        .set(asA());
      expect(validatedReport.status).toBe(404);
      const count = await prisma.stockCount.findUnique({ where: { id: ofB.countId }, include: { lines: true } });
      expect(count!.status).toBe('DRAFT');
      expect(count!.lines.map(l => Number(l.countedQuantity))).toEqual([88]);
      const list = await request(app)
        .get(`${S(tenantA.id)}/counts`)
        .set(asA());
      expect(list.status).toBe(200);
      expectNoTraceOfB(list.body);
    });

    it("pièce jointe de B : fichier, liste et retrait via l'URL de A -> 404, pièce intacte", async () => {
      const file = await request(app)
        .get(`${S(tenantA.id)}/attachments/${ofB.attachmentId}/file`)
        .set(asA());
      expect(file.status).toBe(404);
      const list = await request(app)
        .get(`${S(tenantA.id)}/attachments`)
        .query({ targetType: 'SLIP', targetId: ofB.slipId })
        .set(asA());
      expect(list.status).toBe(404);
      expectNoTraceOfB(list.body);
      const remove = await request(app)
        .post(`${S(tenantA.id)}/attachments/${ofB.attachmentId}/remove`)
        .set(asA())
        .send({ reason: 'Retrait tenté par A' });
      expect(remove.status).toBe(404);
      expect((await prisma.stockAttachment.findUnique({ where: { id: ofB.attachmentId } }))!.removedAt).toBeNull();
    });

    it("alerte de B : traitement via l'URL de A -> 404, alerte encore ouverte ; la liste de A ne la cite pas", async () => {
      const ack = await request(app)
        .post(`${S(tenantA.id)}/alerts/${ofB.alertId}/acknowledge`)
        .set(asA())
        .send({});
      expect(ack.status).toBe(404);
      expect((await prisma.stockAlert.findUnique({ where: { id: ofB.alertId } }))!.status).toBe('OPEN');
      const list = await request(app)
        .get(`${S(tenantA.id)}/alerts`)
        .set(asA());
      expect(list.status).toBe(200);
      expectNoTraceOfB(list.body);
    });

    it('contexte terrain, indicateurs et journal de A : aucune trace de B', async () => {
      const context = await request(app)
        .get(`${S(tenantA.id)}/field-context`)
        .set(asA());
      expect(context.status).toBe(200);
      expectNoTraceOfB(context.body);
      const indicators = await request(app)
        .get(`${S(tenantA.id)}/indicators`)
        .query({ from: month(), to: month() })
        .set(asA());
      expect(indicators.status).toBe(200);
      expectNoTraceOfB(indicators.body);
      const filtered = await request(app)
        .get(`${S(tenantA.id)}/indicators`)
        .query({ from: month(), to: month(), locationId: ofB.locationId })
        .set(asA());
      expect([200, 404]).toContain(filtered.status);
      expectNoTraceOfB(filtered.body);
      const movements = await request(app)
        .get(`${S(tenantA.id)}/movements`)
        .set(asA());
      expect(movements.status).toBe(200);
      expectNoTraceOfB(movements.body);
    });

    it("factures réceptionnables : celle de B n'apparaît pas chez A, et ses réceptions -> 404", async () => {
      const receivable = await request(app)
        .get(`${S(tenantA.id)}/receivable-invoices`)
        .set(asA());
      expect(receivable.status).toBe(200);
      expectNoTraceOfB(receivable.body);
      const receipts = await request(app)
        .get(`${S(tenantA.id)}/supplier-invoices/${ofB.invoiceId}/receipts`)
        .set(asA());
      expect(receipts.status).toBe(404);
      expectNoTraceOfB(receipts.body);
    });

    const issueOfA = (override: Record<string, string>) => {
      const { costCategoryId, ...head } = override;
      return {
        locationId: ofA.locationId,
        siteId: ofA.siteId,
        issueDate: today(),
        takerId: ofA.takerId,
        ...head,
        lines: [{ itemId: ofA.itemId, quantity: 1, costCategoryId: costCategoryId ?? ofA.costCategoryId }]
      };
    };

    it.each([
      ['takerId', () => ({ takerId: ofB.takerId })],
      ['siteId', () => ({ siteId: ofB.siteId })],
      ['costCategoryId', () => ({ costCategoryId: ofB.costCategoryId })],
      ['locationId', () => ({ locationId: ofB.locationId })]
    ])("A écrit une sortie portant le %s de B -> 404, rien n'est écrit", async (_field, override) => {
      const scope = { tenantId: { in: [tenantA.id, tenantB.id] } };
      const before = await prisma.stockMovement.count({ where: scope });
      const res = await request(app)
        .post(`${S(tenantA.id)}/issues`)
        .set(asA())
        .send(issueOfA(override()));
      expect(res.status).toBe(404);
      expectNoTraceOfB(res.body);
      expect(await prisma.stockMovement.count({ where: scope })).toBe(before);
    });

    it('témoin : la même sortie, toute de A, passe (201)', async () => {
      const res = await request(app)
        .post(`${S(tenantA.id)}/issues`)
        .set(asA())
        .send(issueOfA({}));
      expect(res.status).toBe(201);
    });

    it("le responsable du stock de A sur l'URL de B -> 403", async () => {
      const res = await request(app)
        .get(`${S(tenantB.id)}/slips/${ofB.slipId}`)
        .set(asA());
      expect(res.status).toBe(403);
      expectNoTraceOfB(res.body);
    });
  });

  /**
   * Lot 041 — inventaire par WhatsApp (spec §8.2). B possède une inscription,
   * une capture et son fichier, une session et sa conversation, un inventaire
   * ouvert par WhatsApp ; un administrateur de A, sur SES propres URL,
   * n'atteint aucun de ces objets (404) et aucune réponse de A n'en cite un.
   * Le webhook Meta refuse un corps sans signature (401) et n'écrit rien.
   */
  describe('Inventaire WhatsApp — étanchéité entre agences (lot 041)', () => {
    const WA_ALL = [
      'FINANCE_SETTINGS_MANAGE',
      'STOCK_VIEW',
      'STOCK_VALUES_VIEW',
      'STOCK_COUNT',
      'STOCK_COUNT_VALIDATE',
      'STOCK_DISPOSE'
    ];
    const W = (tenantId: string) => `/api/tenants/${tenantId}/finance/stock/whatsapp`;
    const PHONE_B = '+2250100000301';
    const PHONE_A = '+2250100000302';

    let waA: TestUser;
    let waB: TestUser;
    const ofA = { siteId: '', registrationId: '', chefId: '' };
    const ofB = {
      chefId: '',
      siteId: '',
      locationId: '',
      registrationId: '',
      sessionId: '',
      captureId: '',
      countId: '',
      messageId: '',
      sha256: '',
      siteName: `Chantier WA de B ${randomUUID().slice(0, 6)}`,
      messageText: `Texte du chef de B ${randomUUID().slice(0, 6)}`,
      phone: PHONE_B,
      phoneDigits: PHONE_B.slice(1)
    };
    let fileUrlOfB = '';
    const secretsOfB = () => Object.values(ofB).filter(value => value.length > 0);

    function expectNoTraceOfB(body: unknown): void {
      const text = JSON.stringify(body ?? {});
      for (const secret of secretsOfB()) expect(text).not.toContain(secret);
    }

    async function siteManagerMember(tenant: TestTenant, prefix: string): Promise<string> {
      const role = await prisma.role.findUniqueOrThrow({ where: { key: 'TENANT_SITE_MANAGER' }, select: { id: true } });
      const user = await prisma.user.create({
        data: {
          email: `${prefix}-${randomUUID().slice(0, 8)}@isolation-test.local`,
          passwordHash: null,
          fullName: `${prefix} (test isolation)`,
          globalRole: 'USER',
          emailVerified: true,
          isActive: true
        }
      });
      await prisma.membership.create({
        data: { userId: user.id, tenantId: tenant.id, status: 'ACTIVE', acceptedAt: new Date() }
      });
      await prisma.userRole.create({ data: { userId: user.id, roleId: role.id, tenantId: tenant.id } });
      return user.id;
    }

    async function siteWithLocation(tenantId: string, name: string): Promise<{ siteId: string; locationId: string }> {
      const site = await prisma.constructionSite.create({ data: { tenantId, name, stockEnabledAt: new Date() } });
      const location = await prisma.stockLocation.create({
        data: { tenantId, kind: 'SITE', label: `Lieu ${name}`, siteId: site.id }
      });
      return { siteId: site.id, locationId: location.id };
    }

    /** Un JPEG minimal bien formé (le stockage refuse ce qu'il ne sait pas nettoyer). */
    function tinyJpeg(): Buffer {
      const segment = (marker: number, payload: Buffer) =>
        Buffer.concat([Buffer.from([0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]), payload]);
      return Buffer.concat([
        Buffer.from([0xff, 0xd8]),
        segment(0xe0, Buffer.from([0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0])),
        segment(0xdb, Buffer.concat([Buffer.from([0]), Buffer.alloc(64, 1)])),
        segment(0xc0, Buffer.from([8, 0, 16, 0, 16, 1, 1, 0x11, 0])),
        segment(0xc4, Buffer.concat([Buffer.from([0x00, 1]), Buffer.alloc(15, 0), Buffer.from([0])])),
        segment(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])),
        Buffer.from([0x12, 0x34, 0x56, 0xff, 0xd9])
      ]);
    }

    beforeAll(async () => {
      waA = await createTenantMemberUser(tenantA, 'wa-a', 'WA_ISOLATION_TEST', WA_ALL);
      waB = await createTenantMemberUser(tenantB, 'wa-b', 'WA_ISOLATION_TEST', WA_ALL);

      // A : son propre chantier et sa propre inscription (ses listes ne sont pas vides).
      ofA.chefId = await siteManagerMember(tenantA, 'chef-wa-a');
      ofA.siteId = (await siteWithLocation(tenantA.id, `Chantier WA de A ${randomUUID().slice(0, 6)}`)).siteId;
      ofA.registrationId = (
        await prisma.stockWhatsappRegistration.create({
          data: {
            tenantId: tenantA.id,
            userId: ofA.chefId,
            phoneE164: PHONE_A,
            status: 'ACTIVE',
            activatedAt: new Date(),
            createdByUserId: waA.id
          }
        })
      ).id;
      await prisma.stockWhatsappRegistrationSite.create({
        data: { tenantId: tenantA.id, registrationId: ofA.registrationId, siteId: ofA.siteId }
      });

      // B : inscription active, session, inventaire ouvert par WhatsApp, capture et fichier, message.
      const tid = tenantB.id;
      ofB.chefId = await siteManagerMember(tenantB, 'chef-wa-b');
      const placeB = await siteWithLocation(tid, ofB.siteName);
      ofB.siteId = placeB.siteId;
      ofB.locationId = placeB.locationId;
      ofB.registrationId = (
        await prisma.stockWhatsappRegistration.create({
          data: {
            tenantId: tid,
            userId: ofB.chefId,
            phoneE164: PHONE_B,
            status: 'ACTIVE',
            activatedAt: new Date(),
            createdByUserId: waB.id
          }
        })
      ).id;
      await prisma.stockWhatsappRegistrationSite.create({
        data: { tenantId: tid, registrationId: ofB.registrationId, siteId: ofB.siteId }
      });
      ofB.countId = (
        await prisma.stockCount.create({
          data: {
            tenantId: tid,
            locationId: ofB.locationId,
            countedAt: new Date(),
            createdByUserId: ofB.chefId,
            status: 'DRAFT',
            source: 'WHATSAPP'
          }
        })
      ).id;
      const item = await prisma.stockItem.create({
        data: { tenantId: tid, reference: `WA-B-${randomUUID().slice(0, 6)}`, label: 'Ciment de B', unit: 'sac' }
      });
      ofB.sessionId = (
        await prisma.stockWhatsappSession.create({
          data: {
            tenantId: tid,
            registrationId: ofB.registrationId,
            state: 'READY',
            siteId: ofB.siteId,
            locationId: ofB.locationId,
            countId: ofB.countId,
            lastInboundAt: new Date()
          }
        })
      ).id;
      const stored = await storeCapturePhoto(tid, tinyJpeg());
      if ('refused' in stored) throw new Error(`Photo de test refusée : ${stored.refused}`);
      fileUrlOfB = stored.fileUrl;
      ofB.sha256 = stored.sha256;
      const line = await prisma.stockCountLine.create({
        data: {
          countId: ofB.countId,
          itemId: item.id,
          expectedQuantity: 84,
          countedQuantity: 84,
          countedByUserId: ofB.chefId
        }
      });
      ofB.captureId = (
        await prisma.stockFieldCapture.create({
          data: {
            tenantId: tid,
            registrationId: ofB.registrationId,
            sessionId: ofB.sessionId,
            userId: ofB.chefId,
            siteId: ofB.siteId,
            locationId: ofB.locationId,
            countId: ofB.countId,
            countLineId: line.id,
            itemId: item.id,
            outcome: 'ACCEPTED',
            via: 'SIMULATOR',
            fileUrl: stored.fileUrl,
            mimeType: stored.mimeType,
            sizeBytes: stored.sizeBytes,
            sha256: stored.sha256,
            proposedTotal: 84,
            confirmedQuantity: 84,
            lineQuantityAfter: 84,
            confirmedAt: new Date()
          }
        })
      ).id;
      ofB.messageId = (
        await prisma.stockWhatsappMessage.create({
          data: {
            tenantId: tid,
            registrationId: ofB.registrationId,
            sessionId: ofB.sessionId,
            direction: 'INBOUND',
            kind: 'TEXT',
            text: ofB.messageText,
            via: 'SIMULATOR'
          }
        })
      ).id;
    });

    afterAll(async () => {
      if (fileUrlOfB) await deleteCapturePhoto(fileUrlOfB).catch(() => undefined);
      for (const tenantId of [tenantA.id, tenantB.id]) {
        const steps: Array<() => Promise<unknown>> = [
          () => prisma.stockWhatsappMessage.deleteMany({ where: { tenantId } }),
          () => prisma.stockWhatsappSession.updateMany({ where: { tenantId }, data: { pendingCaptureId: null } }),
          () => prisma.stockFieldCapture.deleteMany({ where: { tenantId } }),
          () => prisma.stockWhatsappSession.deleteMany({ where: { tenantId } }),
          () => prisma.stockWhatsappRegistrationSite.deleteMany({ where: { tenantId } }),
          () => prisma.stockWhatsappRegistration.deleteMany({ where: { tenantId } }),
          () => prisma.stockCountLine.deleteMany({ where: { count: { tenantId, source: 'WHATSAPP' } } }),
          () => prisma.stockCount.deleteMany({ where: { tenantId, source: 'WHATSAPP' } }),
          () => prisma.stockItem.deleteMany({ where: { tenantId, reference: { startsWith: 'WA-B-' } } }),
          () => prisma.stockLocation.deleteMany({ where: { tenantId, label: { startsWith: 'Lieu Chantier WA de ' } } }),
          () => prisma.constructionSite.deleteMany({ where: { tenantId, name: { startsWith: 'Chantier WA de ' } } })
        ];
        for (const step of steps) {
          // eslint-disable-next-line no-await-in-loop -- l'ordre des suppressions compte.
          await step();
        }
      }
    });

    const asA = () => ({ Authorization: waA.authHeader });
    const asB = () => ({ Authorization: waB.authHeader });

    it('témoin : B lit ses propres objets (les tests ci-dessous discriminent)', async () => {
      const registration = await request(app)
        .get(`${W(tenantB.id)}/registrations/${ofB.registrationId}`)
        .set(asB());
      expect(registration.status).toBe(200);
      const capture = await request(app)
        .get(`${W(tenantB.id)}/captures/${ofB.captureId}`)
        .set(asB());
      expect(capture.status).toBe(200);
      expect(JSON.stringify(capture.body)).toContain(ofB.sha256);
      const file = await request(app)
        .get(`${W(tenantB.id)}/captures/${ofB.captureId}/file`)
        .set(asB());
      expect(file.status).toBe(200);
      const messages = await request(app)
        .get(`${W(tenantB.id)}/sessions/${ofB.sessionId}/messages`)
        .set(asB());
      expect(messages.status).toBe(200);
      expect(JSON.stringify(messages.body)).toContain(ofB.messageText);
      const captures = await request(app)
        .get(`${W(tenantB.id)}/counts/${ofB.countId}/captures`)
        .set(asB());
      expect(captures.status).toBe(200);
      expect(JSON.stringify(captures.body)).toContain(ofB.captureId);
      const fieldCounts = await request(app)
        .get(`${W(tenantB.id)}/field-counts`)
        .set(asB());
      expect(fieldCounts.status).toBe(200);
      expect(JSON.stringify(fieldCounts.body)).toContain(ofB.locationId);
    });

    it("inscription de B : lecture, chantiers, code et révocation via l'URL de A -> 404, rien ne bouge", async () => {
      const base = `${W(tenantA.id)}/registrations/${ofB.registrationId}`;
      const read = await request(app).get(base).set(asA());
      expect(read.status).toBe(404);
      expectNoTraceOfB(read.body);
      const patch = await request(app)
        .patch(base)
        .set(asA())
        .send({ siteIds: [ofA.siteId] });
      expect(patch.status).toBe(404);
      const regenerate = await request(app).post(`${base}/regenerate-code`).set(asA()).send({});
      expect(regenerate.status).toBe(404);
      expectNoTraceOfB(regenerate.body);
      const revoke = await request(app).post(`${base}/revoke`).set(asA()).send({ reason: 'Révocation tentée par A' });
      expect(revoke.status).toBe(404);
      const row = await prisma.stockWhatsappRegistration.findUniqueOrThrow({
        where: { id: ofB.registrationId },
        include: { sites: { select: { siteId: true } } }
      });
      expect(row.status).toBe('ACTIVE');
      expect(row.activationCodeHash).toBeNull();
      expect(row.sites.map(site => site.siteId)).toEqual([ofB.siteId]);
      const list = await request(app)
        .get(`${W(tenantA.id)}/registrations`)
        .set(asA());
      expect(list.status).toBe(200);
      expect(JSON.stringify(list.body)).toContain(ofA.registrationId);
      expectNoTraceOfB(list.body);
    });

    it('A inscrit un chef avec un chantier, un membre ou le numéro de B -> refus, aucune inscription écrite', async () => {
      const before = await prisma.stockWhatsappRegistration.count({ where: { tenantId: tenantA.id } });
      const otherChefOfA = await siteManagerMember(tenantA, 'chef-wa-a2');
      const withSiteOfB = await request(app)
        .post(`${W(tenantA.id)}/registrations`)
        .set(asA())
        .send({ userId: otherChefOfA, phone: '+2250100000303', siteIds: [ofB.siteId] });
      expect(withSiteOfB.status).toBe(404);
      expectNoTraceOfB(withSiteOfB.body);
      const withMemberOfB = await request(app)
        .post(`${W(tenantA.id)}/registrations`)
        .set(asA())
        .send({ userId: ofB.chefId, phone: '+2250100000304', siteIds: [ofA.siteId] });
      expect(withMemberOfB.status).toBe(409);
      expect(withMemberOfB.body.code).toBe('STOCK_WHATSAPP_MEMBER_NOT_ELIGIBLE');
      expectNoTraceOfB(withMemberOfB.body);
      // Le numéro de B : refus neutre, sans dire qu'une autre agence l'utilise.
      const withPhoneOfB = await request(app)
        .post(`${W(tenantA.id)}/registrations`)
        .set(asA())
        .send({ userId: otherChefOfA, phone: PHONE_B, siteIds: [ofA.siteId] });
      expect(withPhoneOfB.status).toBe(409);
      expect(withPhoneOfB.body.code).toBe('STOCK_WHATSAPP_PHONE_UNAVAILABLE');
      expectNoTraceOfB(withPhoneOfB.body);
      expect(await prisma.stockWhatsappRegistration.count({ where: { tenantId: tenantA.id } })).toBe(before);
    });

    it("capture de B : détail, fichier et retrait de la photo via l'URL de A -> 404, photo intacte", async () => {
      const detail = await request(app)
        .get(`${W(tenantA.id)}/captures/${ofB.captureId}`)
        .set(asA());
      expect(detail.status).toBe(404);
      expectNoTraceOfB(detail.body);
      const file = await request(app)
        .get(`${W(tenantA.id)}/captures/${ofB.captureId}/file`)
        .set(asA());
      expect(file.status).toBe(404);
      const remove = await request(app)
        .post(`${W(tenantA.id)}/captures/${ofB.captureId}/remove-photo`)
        .set(asA())
        .send({ reason: 'Retrait tenté par A' });
      expect(remove.status).toBe(404);
      const capture = await prisma.stockFieldCapture.findUniqueOrThrow({ where: { id: ofB.captureId } });
      expect(capture.fileUrl).toBe(fileUrlOfB);
      expect(capture.photoRemovedAt).toBeNull();
      const list = await request(app)
        .get(`${W(tenantA.id)}/captures`)
        .set(asA());
      expect(list.status).toBe(200);
      expectNoTraceOfB(list.body);
      const filtered = await request(app)
        .get(`${W(tenantA.id)}/captures`)
        .query({ locationId: ofB.locationId })
        .set(asA());
      expect([200, 404]).toContain(filtered.status);
      expectNoTraceOfB(filtered.body);
    });

    it("session et conversation de B via l'URL de A -> 404 ; les sessions de A ne la citent pas", async () => {
      const messages = await request(app)
        .get(`${W(tenantA.id)}/sessions/${ofB.sessionId}/messages`)
        .set(asA());
      expect(messages.status).toBe(404);
      expectNoTraceOfB(messages.body);
      const sessions = await request(app)
        .get(`${W(tenantA.id)}/sessions`)
        .set(asA());
      expect(sessions.status).toBe(200);
      expectNoTraceOfB(sessions.body);
      const byRegistration = await request(app)
        .get(`${W(tenantA.id)}/sessions`)
        .query({ registrationId: ofB.registrationId })
        .set(asA());
      expect([200, 404]).toContain(byRegistration.status);
      expectNoTraceOfB(byRegistration.body);
    });

    it("comptages terrain et captures de l'inventaire de B via l'URL de A -> 404 ou sans fuite", async () => {
      const captures = await request(app)
        .get(`${W(tenantA.id)}/counts/${ofB.countId}/captures`)
        .set(asA());
      expect(captures.status).toBe(404);
      expectNoTraceOfB(captures.body);
      const fieldCounts = await request(app)
        .get(`${W(tenantA.id)}/field-counts`)
        .set(asA());
      expect(fieldCounts.status).toBe(200);
      expectNoTraceOfB(fieldCounts.body);
      for (const query of [{ locationId: ofB.locationId }, { siteId: ofB.siteId }]) {
        // eslint-disable-next-line no-await-in-loop
        const filtered = await request(app)
          .get(`${W(tenantA.id)}/field-counts`)
          .query(query)
          .set(asA());
        expect([200, 404]).toContain(filtered.status);
        expectNoTraceOfB(filtered.body);
      }
      const overview = await request(app)
        .get(`${W(tenantA.id)}/overview`)
        .set(asA());
      expect(overview.status).toBe(200);
      expectNoTraceOfB(overview.body);
    });

    it("l'administrateur de A sur l'URL de B -> 403", async () => {
      const res = await request(app)
        .get(`${W(tenantB.id)}/registrations/${ofB.registrationId}`)
        .set(asA());
      expect(res.status).toBe(403);
      expectNoTraceOfB(res.body);
    });

    it('webhook Meta : un corps sans signature, ou mal signé, -> 401 et aucun événement écrit', async () => {
      const mutable = env as unknown as Record<string, unknown>;
      const saved = {
        WHATSAPP_INVENTORY_TRANSPORT: mutable.WHATSAPP_INVENTORY_TRANSPORT,
        META_WA_APP_SECRET: mutable.META_WA_APP_SECRET,
        META_WA_PHONE_NUMBER_ID: mutable.META_WA_PHONE_NUMBER_ID
      };
      mutable.WHATSAPP_INVENTORY_TRANSPORT = 'meta';
      mutable.META_WA_APP_SECRET = 'secret-de-test-du-webhook-meta-isolation-041';
      mutable.META_WA_PHONE_NUMBER_ID = '100000000000001';
      try {
        const body = JSON.stringify({
          object: 'whatsapp_business_account',
          entry: [
            {
              changes: [
                {
                  field: 'messages',
                  value: {
                    metadata: { phone_number_id: '100000000000001' },
                    messages: [
                      { from: ofB.phoneDigits, id: `wamid.${randomUUID()}`, type: 'text', text: { body: 'FIN' } }
                    ]
                  }
                }
              ]
            }
          ]
        });
        const before = await prisma.whatsappCloudEvent.count();
        const unsigned = await request(app)
          .post('/api/webhooks/whatsapp-cloud/events')
          .set('Content-Type', 'application/json')
          .send(body);
        expect(unsigned.status).toBe(401);
        const forged = await request(app)
          .post('/api/webhooks/whatsapp-cloud/events')
          .set('Content-Type', 'application/json')
          .set('X-Hub-Signature-256', `sha256=${'0'.repeat(64)}`)
          .send(body);
        expect(forged.status).toBe(401);
        expect(await prisma.whatsappCloudEvent.count()).toBe(before);
        // Rien n'a touché la session de B.
        const session = await prisma.stockWhatsappSession.findUniqueOrThrow({ where: { id: ofB.sessionId } });
        expect(session.closedAt).toBeNull();
      } finally {
        Object.assign(mutable, saved);
      }
    });
  });
});

maybeDescribe('Espace particulier — création en libre-service et compteur d’usage (lot 4B)', () => {
  jest.setTimeout(60000);

  const tenantIds: string[] = [];
  const userIds: string[] = [];

  async function verifiedUser(emailVerified = true): Promise<{ id: string; headers: { Authorization: string } }> {
    const user = await prisma.user.create({
      data: {
        email: `ps-http-${randomUUID().slice(0, 8)}@isolation-test.local`,
        passwordHash: null,
        fullName: 'Particulier (test isolation)',
        globalRole: 'USER',
        emailVerified,
        isActive: true
      }
    });
    userIds.push(user.id);
    const token = generateAccessToken({ userId: user.id, email: user.email, globalRole: user.globalRole });
    return { id: user.id, headers: { Authorization: `Bearer ${token}` } };
  }

  async function createSpaceFor(user: { headers: { Authorization: string } }, displayName = 'Mon espace') {
    const res = await request(app).post('/api/personal-space').set(user.headers).send({ displayName, country: 'CI' });
    if (res.status === 201) tenantIds.push(res.body.data.tenantId);
    return res;
  }

  beforeAll(async () => {
    await ensureTenantAdminRole();
  });

  afterAll(async () => {
    await cleanupTenants(tenantIds);
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('POST /api/personal-space : sans jeton -> 401 ; corps avec userId -> 400 ; e-mail non vérifié -> 403', async () => {
    const anonymous = await request(app).post('/api/personal-space').send({ displayName: 'X', country: 'CI' });
    expect(anonymous.status).toBe(401);

    const user = await verifiedUser();
    const forged = await request(app)
      .post('/api/personal-space')
      .set(user.headers)
      .send({ displayName: 'X', country: 'CI', userId: randomUUID() });
    expect(forged.status).toBe(400);
    expect(await prisma.membership.count({ where: { userId: user.id } })).toBe(0);

    const unverified = await verifiedUser(false);
    const blocked = await createSpaceFor(unverified);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('crée l’espace (201), le rend utilisable (usage FREE 0/10) et refuse un second espace (409 + tenantId)', async () => {
    const user = await verifiedUser();
    const created = await createSpaceFor(user, '<img src=x onerror=alert(1)>');
    expect(created.status).toBe(201);
    expect(Object.keys(created.body.data).sort()).toEqual(['name', 'slug', 'tenantId']);
    expect(created.body.data.name).toBe('<img src=x onerror=alert(1)>');
    expect(created.headers['content-type']).toMatch(/application\/json/);
    const tenantId: string = created.body.data.tenantId;

    const again = await createSpaceFor(user, 'Autre');
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('PERSONAL_SPACE_EXISTS');
    expect(again.body.data).toEqual({ tenantId });

    const usage = await request(app).get(`/api/tenants/${tenantId}/patrimoine/usage`).set(user.headers);
    expect(usage.status).toBe(200);
    expect(usage.body.data).toMatchObject({
      plan: 'FREE',
      limit: 10,
      used: 0,
      canAdd: true,
      upgrade: { target: 'PARTICULIER_PLUS', currency: 'XOF', limit: 100 }
    });
    expect(typeof usage.body.data.upgrade.priceMonthly).toBe('number');
  });

  it('le 11e actif créé par l’API est refusé en 409 FREE_TIER_LIMIT { limit, used } ; usage : canAdd faux', async () => {
    const user = await verifiedUser();
    const { body } = await createSpaceFor(user);
    const tenantId: string = body.data.tenantId;
    const post = () =>
      request(app)
        .post(`/api/tenants/${tenantId}/patrimoine/assets`)
        .set(user.headers)
        .send({ name: 'Actif', assetClass: 'OTHER', details: { label: 'Divers' } });
    for (let i = 0; i < 10; i += 1) expect((await post()).status).toBe(201);

    const refused = await post();
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('FREE_TIER_LIMIT');
    expect(refused.body.data).toEqual({ limit: 10, used: 10 });

    const usage = await request(app).get(`/api/tenants/${tenantId}/patrimoine/usage`).set(user.headers);
    expect(usage.body.data).toMatchObject({ used: 10, canAdd: false });
  });

  it('étanchéité : un particulier et une agence ne lisent pas l’usage l’un de l’autre, l’usage d’agence est AGENCY', async () => {
    const agency = await createTestTenant('Agence-Usage');
    tenantIds.push(agency.id);
    const agencyAdmin = await createTenantAdminUser(agency, 'admin-usage');
    // Le compteur d'usage exige PATRIMOINE_PERSONAL_VIEW ; le rôle est donné ici pour vérifier le plan AGENCY.
    await grantPersonalPatrimoineRole(agencyAdmin, agency);
    userIds.push(agencyAdmin.id);
    const user = await verifiedUser();
    const { body } = await createSpaceFor(user);
    const spaceId: string = body.data.tenantId;

    const own = await request(app)
      .get(`/api/tenants/${agency.id}/patrimoine/usage`)
      .set({ Authorization: agencyAdmin.authHeader });
    expect(own.status).toBe(200);
    expect(own.body.data).toMatchObject({ plan: 'AGENCY', limit: null, canAdd: true, upgrade: null });

    const particulierOnAgency = await request(app).get(`/api/tenants/${agency.id}/patrimoine/usage`).set(user.headers);
    expect(particulierOnAgency.status).toBe(403);
    const agencyOnParticulier = await request(app)
      .get(`/api/tenants/${spaceId}/patrimoine/usage`)
      .set({ Authorization: agencyAdmin.authHeader });
    expect(agencyOnParticulier.status).toBe(403);
    expect(JSON.stringify(agencyOnParticulier.body)).not.toContain(spaceId);

    // Le particulier n'a aucun droit sur l'agence : ses rôles (TENANT_ADMIN + PERSONAL_SPACE_OWNER) ne portent que son espace.
    const roles = await prisma.userRole.findMany({ where: { userId: user.id }, select: { tenantId: true } });
    expect(roles).toEqual([{ tenantId: spaceId }, { tenantId: spaceId }]);
  });

  it('garde de type (mode warn) : un TENANT_ADMIN particulier reçoit 403 sur les routes d’agence, 200 sur son patrimoine ; l’agence n’est pas touchée', async () => {
    const user = await verifiedUser();
    const { body } = await createSpaceFor(user);
    const tenantId: string = body.data.tenantId;
    const base = `/api/tenants/${tenantId}`;

    const forbidden: Array<['get' | 'post', string]> = [
      ['get', '/newsletter/campaigns'],
      ['get', '/crm/deals'],
      ['post', '/users/invite'],
      ['get', '/invitations'],
      ['get', '/finance/accounting/journal'],
      ['get', '/finance/sites'],
      ['get', '/syndics'],
      ['get', '/whatsapp-notifications'],
      ['get', '/settings/payment-gateway'],
      ['get', '/ai/status']
    ];
    for (const [method, path] of forbidden) {
      // eslint-disable-next-line no-await-in-loop -- une requête à la fois, lisible en cas d'échec.
      const res = await request(app)[method](`${base}${path}`).set(user.headers).send({});
      expect({ path, status: res.status, code: res.body.code }).toEqual({
        path,
        status: 403,
        code: 'PERSONAL_SPACE_ROUTE_FORBIDDEN'
      });
    }

    for (const path of [
      '/patrimoine/usage',
      '/patrimoine/assets',
      '/subscription/payment-availability',
      '/entitlements',
      ''
    ]) {
      // eslint-disable-next-line no-await-in-loop -- idem.
      const res = await request(app).get(`${base}${path}`).set(user.headers);
      expect({ path, status: res.status }).toEqual({ path, status: 200 });
    }

    // Non-régression : une agence passe le même garde de type (jamais ce code de refus).
    const agency = await createTestTenant('Agence-Type');
    tenantIds.push(agency.id);
    const agencyAdmin = await createTenantAdminUser(agency, 'admin-type');
    userIds.push(agencyAdmin.id);
    for (const path of ['/newsletter/campaigns', '/crm/deals', '/invitations']) {
      // eslint-disable-next-line no-await-in-loop -- idem.
      const res = await request(app)
        .get(`/api/tenants/${agency.id}${path}`)
        .set({ Authorization: agencyAdmin.authHeader });
      expect({ path, code: res.body.code }).not.toEqual({ path, code: 'PERSONAL_SPACE_ROUTE_FORBIDDEN' });
    }
  });

  it('6 POST concurrents du même utilisateur -> un 201, cinq 409, un seul tenant', async () => {
    const user = await verifiedUser();
    const responses = await Promise.all(Array.from({ length: 6 }, (_, i) => createSpaceFor(user, `Course ${i}`)));
    const statuses = responses.map(r => r.status).sort();
    expect(statuses).toEqual([201, 409, 409, 409, 409, 409]);
    expect(await prisma.membership.count({ where: { userId: user.id } })).toBe(1);
  });
});
