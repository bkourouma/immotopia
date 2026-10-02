/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Lot B3 (spec 034) — accès en lecture seule des tiers de confiance, bout en
 * bout sur une BASE RÉELLE (services, routes publiques, Postgres).
 *
 * Base : jetable, jamais celle de développement. Même garde que
 * `isolation.test.ts` : `DATABASE_URL_TEST` doit égaler `DATABASE_URL`
 * (`__tests__/helpers/run-isolation-tests.js` y veille) ; sinon la suite est
 * ignorée (`describe.skip`) et `npm test` reste vert. Elle est exécutée par
 * `npm run test:isolation` (même script, même base dédiée, avec `isolation.test.ts`).
 *
 * Le garde-fou Prisma tourne en mode `enforce` : toute lecture de la vue
 * publique qui oublierait `tenantId` lèverait une 500 et ferait échouer ces
 * tests. Aucun envoi réel : `emailService` est simulé.
 */
process.env.TENANT_GUARD_MODE = 'enforce';

import { promises as fs } from 'fs';
import * as path from 'path';
import express from 'express';
import request from 'supertest';
import { randomUUID } from 'crypto';

const sendEmail = jest.fn().mockResolvedValue(undefined);
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendEmail: (...a: any[]) => sendEmail(...a) }
}));

import { prisma } from '../../src/utils/database';
import { flushAuditEvents } from '../../src/services/audit-service';
import { errorHandler, NotFoundError } from '../../src/middleware/error-middleware';
import { privateUploadReadRoots } from '../../src/lib/files/private-files';
import {
  createExternalAccessGrant,
  getExternalAccessDocumentByToken,
  getExternalAccessViewByToken,
  listExternalAccessGrants,
  listExternalAccessLog,
  revokeExternalAccessGrant,
  sendExternalAccessLink,
  updateExternalAccessGrant,
  getExternalAccessGrantDetail
} from '../../src/lib/external-access';
import { createSecureLink } from '../../src/lib/secure-links';
import { hashToken } from '../../src/lib/secure-links/token';
import externalAccessPublicRoutes, {
  PUBLIC_EXTERNAL_ACCESS_PREFIX
} from '../../src/routes/external-access-public-routes';
import { createTestTenant, cleanupTenants, createPropertyDirect, TestTenant } from '../helpers/fixtures';

const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST;
const HAS_TEST_DATABASE = Boolean(DATABASE_URL_TEST) && process.env.DATABASE_URL === DATABASE_URL_TEST;
const maybeDescribe = HAS_TEST_DATABASE ? describe : describe.skip;

if (!HAS_TEST_DATABASE) {
  // eslint-disable-next-line no-console
  console.log('DATABASE_URL_TEST absente (ou exécution hors base dédiée) : external-access.db.test.ts est ignorée.');
}

const DAY = 24 * 60 * 60 * 1000;
const SECRET_LABEL = 'LIBELLE-INTERNE-CONFIDENTIEL';
const SUPPLIER = 'FOURNISSEUR-CONFIDENTIEL';
const RUN = randomUUID().slice(0, 8);
const RENTER_EMAIL = `locataire-secret-${RUN}@example.test`;
const OWNER_EMAIL = `proprietaire-secret-${RUN}@example.test`;

/** Parcours complet d'un JSON : chaque chaîne et chaque clé. */
function walk(value: unknown, visit: (text: string, kind: 'key' | 'value') => void): void {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') return visit(value, 'value');
  if (Array.isArray(value)) return value.forEach(item => walk(item, visit));
  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      visit(key, 'key');
      walk(item, visit);
    }
  }
}

maybeDescribe('B3 — accès tiers de confiance sur base réelle', () => {
  jest.setTimeout(60000);

  let tenantA: TestTenant;
  let tenantB: TestTenant;
  const tenantIds: string[] = [];
  const writtenFiles: string[] = [];

  let ownerUserId: string;
  let ownerClientId: string;
  let ownerClientB: string;
  let renterClientId: string;
  let entityEmpty: string;
  let entityBig: string;
  let pA1: string; // bien de l'agence, toutes données
  let pA2: string; // bien détenu par l'entité
  let pA3: string; // bien de l'agence HORS périmètre des grants
  let pB1: string; // bien d'une autre agence
  let pClient: string; // bien CLIENT sans agence, mandat actif
  let pClientOld: string; // bien CLIENT, mandat révoqué
  let entityA: string;
  let entityB: string;
  let docLinked: string;
  let docOther: string;
  let docB: string;

  async function mkProperty(tenantId: string | null, title: string, ownership: 'TENANT' | 'CLIENT', owner?: string) {
    const created = await prisma.property.create({
      data: {
        tenantId,
        internalReference: `B3-${randomUUID().slice(0, 8)}`,
        propertyType: 'APPARTEMENT',
        ownershipType: ownership,
        ownerUserId: owner ?? null,
        title,
        description: 'Description interne confidentielle',
        address: '12 rue de la Paix',
        locationZone: 'Cocody'
      },
      select: { id: true }
    });
    return created.id;
  }

  async function mkDocument(propertyId: string, tenantId: string | null, fileName: string, content: string) {
    const folderRoot = privateUploadReadRoots()[0];
    const dir = path.join(folderRoot, 'properties', propertyId, 'documents');
    await fs.mkdir(dir, { recursive: true });
    const stored = `${randomUUID()}.pdf`;
    await fs.writeFile(path.join(dir, stored), content);
    writtenFiles.push(path.join(dir, stored));
    const doc = await prisma.propertyDocument.create({
      data: {
        propertyId,
        tenantId,
        documentType: 'OTHER',
        filePath: `/disk/secret/path/${stored}`,
        fileUrl: `/uploads/properties/${propertyId}/documents/${stored}`,
        fileName,
        fileSize: content.length,
        mimeType: 'application/pdf'
      },
      select: { id: true }
    });
    return doc.id;
  }

  beforeAll(async () => {
    tenantA = await createTestTenant('B3 Agence A');
    tenantB = await createTestTenant('B3 Agence B');
    tenantIds.push(tenantA.id, tenantB.id);

    const owner = await prisma.user.create({
      data: { email: OWNER_EMAIL, fullName: 'Awa Proprietaire', emailVerified: true, isActive: true }
    });
    ownerUserId = owner.id;
    const client = await prisma.tenantClient.create({
      data: { userId: owner.id, tenantId: tenantA.id, clientType: 'OWNER' },
      select: { id: true }
    });
    ownerClientId = client.id;
    const ownerB = await prisma.user.create({
      data: { email: `b-${randomUUID().slice(0, 6)}@example.test`, fullName: 'Owner B' }
    });
    ownerClientB = (
      await prisma.tenantClient.create({
        data: { userId: ownerB.id, tenantId: tenantB.id, clientType: 'OWNER' },
        select: { id: true }
      })
    ).id;

    pA1 = await mkProperty(tenantA.id, 'Villa A1', 'TENANT', ownerUserId);
    pA2 = await mkProperty(tenantA.id, 'Immeuble A2', 'TENANT');
    pA3 = await mkProperty(tenantA.id, 'Bien hors perimetre A3', 'TENANT');
    pB1 = await createPropertyDirect(tenantB.id, 'Bien de B');
    pClient = await mkProperty(null, 'Studio client sous mandat', 'CLIENT', ownerUserId);
    pClientOld = await mkProperty(null, 'Studio client mandat revoque', 'CLIENT', ownerUserId);

    await prisma.propertyMandate.create({
      data: {
        propertyId: pClient,
        tenantId: tenantA.id,
        ownerUserId,
        startDate: new Date(Date.now() - 30 * DAY),
        isActive: true
      }
    });
    await prisma.propertyMandate.create({
      data: {
        propertyId: pClientOld,
        tenantId: tenantA.id,
        ownerUserId,
        startDate: new Date(Date.now() - 90 * DAY),
        isActive: false,
        revokedAt: new Date(Date.now() - 10 * DAY)
      }
    });

    // Rubriques de pA1.
    await prisma.assetValuation.createMany({
      data: [
        {
          tenantId: tenantA.id,
          propertyId: pA1,
          valuatedAt: new Date('2025-01-01'),
          estimatedValue: 80_000_000,
          acquisitionCost: 60_000_000,
          method: 'MANUAL',
          notes: SECRET_LABEL
        },
        {
          tenantId: tenantA.id,
          propertyId: pA1,
          valuatedAt: new Date('2026-06-01'),
          estimatedValue: 100_000_000,
          method: 'EXPERT_APPRAISAL',
          notes: SECRET_LABEL
        }
      ]
    });
    await prisma.propertyLoan.create({
      data: {
        tenantId: tenantA.id,
        propertyId: pA1,
        lender: 'Banque Atlantique',
        capitalAmount: 40_000_000,
        remainingCapital: 30_000_000,
        interestRate: 5.5,
        monthlyPayment: 500_000,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2034-01-01'),
        status: 'ACTIVE'
      }
    });
    await prisma.propertyExpense.create({
      data: {
        tenantId: tenantA.id,
        propertyId: pA1,
        category: 'INSURANCE',
        label: SECRET_LABEL,
        amount: 250_000,
        paidAt: new Date(Date.now() - 30 * DAY),
        supplierName: SUPPLIER,
        notes: SECRET_LABEL
      }
    });
    // Un bail actif : le locataire est un autre compte, dont l'identité ne doit jamais sortir.
    const renterUser = await prisma.user.create({ data: { email: RENTER_EMAIL, fullName: 'Locataire Secret' } });
    const renterClient = await prisma.tenantClient.create({
      data: { userId: renterUser.id, tenantId: tenantA.id, clientType: 'RENTER' },
      select: { id: true }
    });
    renterClientId = renterClient.id;
    const creator = await prisma.user.create({ data: { email: `creator-${randomUUID().slice(0, 6)}@example.test` } });
    await prisma.rentalLease.create({
      data: {
        tenant_id: tenantA.id,
        property_id: pA1,
        primary_renter_client_id: renterClient.id,
        owner_client_id: ownerClientId,
        lease_number: `L-${randomUUID().slice(0, 6)}`,
        status: 'ACTIVE',
        start_date: new Date('2025-01-01'),
        rent_amount: 600_000,
        service_charge_amount: 50_000,
        notes: SECRET_LABEL,
        created_by_user_id: creator.id
      }
    });

    // Entité détentrice de pA2 (et d'un bien d'une autre agence : ne doit jamais sortir).
    entityA = (
      await prisma.holdingEntity.create({
        data: {
          tenantId: tenantA.id,
          name: 'SCI Les Palmiers',
          legalForm: 'SCI',
          country: 'CI',
          rccm: 'CI-ABJ-2020-B-1',
          taxId: '1234567A',
          notes: SECRET_LABEL
        },
        select: { id: true }
      })
    ).id;
    entityB = (
      await prisma.holdingEntity.create({
        data: { tenantId: tenantB.id, name: 'SCI Etrangere', legalForm: 'SCI', country: 'CI' },
        select: { id: true }
      })
    ).id;
    await prisma.propertyHolding.create({
      data: { tenantId: tenantA.id, propertyId: pA2, entityId: entityA, sharePercent: 100 }
    });
    await prisma.propertyHolding.create({
      data: { tenantId: tenantA.id, propertyId: pA1, entityId: entityA, sharePercent: 40 }
    });
    await prisma.propertyHolding.create({
      data: { tenantId: tenantB.id, propertyId: pB1, entityId: entityB, sharePercent: 100 }
    });

    // Co-détenteurs de pA1 qui ne doivent JAMAIS être nommés : une personne physique et une société hors grant.
    const entityPP = (
      await prisma.holdingEntity.create({
        data: {
          tenantId: tenantA.id,
          name: 'PERSONNE-PHYSIQUE-SECRETE',
          legalForm: 'INDIVIDUAL',
          country: 'CI',
          taxId: 'NCC-SECRET-PP'
        },
        select: { id: true }
      })
    ).id;
    const entityOther = (
      await prisma.holdingEntity.create({
        data: {
          tenantId: tenantA.id,
          name: 'SOCIETE-HORS-GRANT',
          legalForm: 'COMPANY',
          country: 'CI',
          rccm: 'RCCM-HORS-GRANT',
          taxId: 'NCC-HORS-GRANT'
        },
        select: { id: true }
      })
    ).id;
    await prisma.propertyHolding.create({
      data: { tenantId: tenantA.id, propertyId: pA1, entityId: entityPP, sharePercent: 25 }
    });
    await prisma.propertyHolding.create({
      data: { tenantId: tenantA.id, propertyId: pA1, entityId: entityOther, sharePercent: 35 }
    });
    // Entité sans détention, et entité qui détient 101 biens (plafond de périmètre).
    entityEmpty = (
      await prisma.holdingEntity.create({
        data: { tenantId: tenantA.id, name: 'SCI Vide', legalForm: 'SCI', country: 'CI' },
        select: { id: true }
      })
    ).id;
    entityBig = (
      await prisma.holdingEntity.create({
        data: { tenantId: tenantA.id, name: 'SCI Gros Patrimoine', legalForm: 'SCI', country: 'CI' },
        select: { id: true }
      })
    ).id;
    await prisma.property.createMany({
      data: Array.from({ length: 101 }, (_, i) => ({
        tenantId: tenantA.id,
        internalReference: `GROS-${RUN}-${i}`,
        propertyType: 'APPARTEMENT' as const,
        ownershipType: 'TENANT' as const,
        title: `Gros ${String(i).padStart(3, '0')}`,
        description: 'd',
        address: 'a'
      }))
    });
    const bigProps = await prisma.property.findMany({
      where: { tenantId: tenantA.id, internalReference: { startsWith: `GROS-${RUN}-` } },
      select: { id: true }
    });
    await prisma.propertyHolding.createMany({
      data: bigProps.map(property => ({
        tenantId: tenantA.id,
        propertyId: property.id,
        entityId: entityBig,
        sharePercent: 1
      }))
    });

    // Documents.
    docLinked = await mkDocument(pA1, tenantA.id, 'Titre foncier', 'CONTENU-DU-TITRE');
    docOther = await mkDocument(pA1, tenantA.id, 'Contrat prive', 'CONTENU-PRIVE');
    docB = await mkDocument(pB1, tenantB.id, 'Document de B', 'CONTENU-B');
  });

  afterAll(async () => {
    await flushAuditEvents();
    for (const file of writtenFiles) await fs.rm(file, { force: true });
    await prisma.rentalLease.deleteMany({ where: { tenant_id: { in: tenantIds } } });
    await cleanupTenants(tenantIds);
    await prisma.user.deleteMany({
      where: { email: { in: [OWNER_EMAIL, RENTER_EMAIL] } }
    });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    sendEmail.mockClear();
  });

  function tokenOf(url: string): string {
    const token = url.split('#')[1];
    expect(token).toBeTruthy();
    return token;
  }

  async function createGrant(overrides: Record<string, unknown> = {}) {
    const result = await createExternalAccessGrant(tenantA.id, null, {
      type: 'NOTARY',
      recipientName: 'Maître Koné',
      recipientEmail: 'notaire@example.test',
      ownerClientId: ownerClientId,
      propertyIds: [pA1],
      entityIds: [],
      documentIds: [docLinked],
      ...overrides
    } as any);
    return { ...result, token: tokenOf(result.link.url) };
  }

  describe('création', () => {
    it('défauts du type, URL avec jeton dans le fragment, e-mail envoyé une fois, jamais de jeton en base', async () => {
      const { grant, link, email, token } = await createGrant({ type: 'BANKER', documentIds: [] });

      expect(grant.sections).toEqual(['VALUATIONS', 'YIELD_RATIOS', 'LOANS']);
      expect(link.url).toMatch(/\/acces-partage#[A-Za-z0-9_-]{40,}$/);
      expect(email).toEqual({ sent: true });
      expect(sendEmail).toHaveBeenCalledTimes(1);
      const sent = sendEmail.mock.calls[0][0];
      expect(sent.to).toBe('notaire@example.test');
      expect(sent.subject).not.toContain(token);
      expect(sent.html).toContain(token);

      // Clair jamais en base.
      const links = await prisma.secureLink.findMany({ where: { tenantId: tenantA.id, objectId: grant.id } });
      expect(links).toHaveLength(1);
      expect(links[0].tokenHash).toBe(hashToken(token));
      expect(JSON.stringify(links)).not.toContain(token);
      expect(links[0].scope).toBe('EXTERNAL_ACCESS_GRANT');
      expect(links[0].objectType).toBe('ExternalAccessGrant');
      // Le lien ne dépasse jamais la durée maximale.
      expect(links[0].expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 30 * DAY + 1000);

      // Liste et détail : ni jeton, ni empreinte.
      const list = await listExternalAccessGrants(tenantA.id);
      const detail = await getExternalAccessGrantDetail(tenantA.id, grant.id);
      for (const payload of [list, detail]) {
        const text = JSON.stringify(payload);
        expect(text).not.toContain(token);
        expect(text).not.toContain(hashToken(token));
        expect(text).not.toMatch(/tokenHash|token_hash/);
      }
      expect(detail.activeLinkCount).toBe(1);
      expect(detail.status).toBe('ACTIVE');
    });

    it("refuse un bien, une entité, un propriétaire ou un document d'une autre agence (404 identique)", async () => {
      const base = { type: 'NOTARY', recipientName: 'X', recipientEmail: 'x@example.test', sendEmail: false };
      const cases: Array<Record<string, unknown>> = [
        { propertyIds: [pB1], entityIds: [], documentIds: [] },
        { propertyIds: [pA1], entityIds: [entityB], documentIds: [] },
        { propertyIds: [pA1], entityIds: [], ownerClientId: ownerClientB, documentIds: [] },
        { propertyIds: [pA1], entityIds: [], documentIds: [docB] },
        { propertyIds: [randomUUID()], entityIds: [], documentIds: [] }
      ];
      for (const extra of cases) {
        await expect(createExternalAccessGrant(tenantA.id, null, { ...base, ...extra } as any)).rejects.toBeInstanceOf(
          NotFoundError
        );
      }
      // Rien n'a été créé par ces tentatives.
      const strays = await prisma.externalAccessGrant.count({
        where: { tenantId: tenantA.id, recipientEmail: 'x@example.test' }
      });
      expect(strays).toBe(0);
    });

    it('un bien CLIENT sans mandat actif est refusé ; sous mandat actif il est accepté', async () => {
      await expect(
        createExternalAccessGrant(tenantA.id, null, {
          type: 'NOTARY',
          recipientName: 'X',
          recipientEmail: 'x2@example.test',
          propertyIds: [pClientOld],
          entityIds: [],
          documentIds: [],
          sendEmail: false
        } as any)
      ).rejects.toBeInstanceOf(NotFoundError);
      const ok = await createGrant({ propertyIds: [pClient], documentIds: [], sendEmail: false });
      expect(ok.grant.properties).toHaveLength(1);
    });

    it('un document hors du périmètre est refusé ; sans rubrique DOCUMENTS aussi (400)', async () => {
      await expect(
        createExternalAccessGrant(tenantA.id, null, {
          type: 'NOTARY',
          recipientName: 'X',
          recipientEmail: 'x3@example.test',
          propertyIds: [pA2],
          entityIds: [],
          documentIds: [docLinked],
          sendEmail: false
        } as any)
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        createExternalAccessGrant(tenantA.id, null, {
          type: 'BANKER',
          recipientName: 'X',
          recipientEmail: 'x4@example.test',
          propertyIds: [pA1],
          entityIds: [],
          documentIds: [docLinked],
          sendEmail: false
        } as any)
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("le lien ne dépasse jamais l'expiration du grant", async () => {
      const soon = new Date(Date.now() + 2 * DAY);
      const { link } = await createGrant({ expiresAt: soon, sendEmail: false, documentIds: [] });
      expect(link.expiresAt.getTime()).toBeLessThanOrEqual(soon.getTime());
    });
  });

  describe('vue publique', () => {
    it('ne renvoie que les rubriques accordées, sans contact ni chemin ni identifiant technique', async () => {
      const { token, grant } = await createGrant({
        type: 'NOTARY',
        sections: ['TITLES_OWNERSHIP', 'DOCUMENTS', 'VALUATIONS'],
        propertyIds: [pA1],
        entityIds: [entityA],
        documentIds: [docLinked],
        sendEmail: false
      });

      const view = await getExternalAccessViewByToken(token, { ip: '203.0.113.9', userAgent: 'Jest/1.0' });

      expect(view.sections).toEqual(['VALUATIONS', 'DOCUMENTS', 'TITLES_OWNERSHIP']);
      // pA1 (liste) + pA2 (entité développée) ; ni pA3, ni le bien de B.
      expect(view.properties.map(p => p.title).sort()).toEqual(['Immeuble A2', 'Villa A1']);
      expect(view.summary.propertyCount).toBe(2);
      const a1 = view.properties.find(p => p.title === 'Villa A1')!;
      expect(a1.valuation?.estimatedValue).toBe(100_000_000);
      expect(a1.valuation?.history).toHaveLength(2);
      expect(a1.titles?.holdings[0]).toMatchObject({
        entityName: 'SCI Les Palmiers',
        legalForm: 'SCI',
        rccm: 'CI-ABJ-2020-B-1'
      });
      expect(a1.documents).toHaveLength(1);
      expect(a1.documents?.[0].fileName).toBe('Titre foncier');
      // Rubriques non accordées : clés absentes (jamais lues).
      expect(a1).not.toHaveProperty('yield');
      expect(a1).not.toHaveProperty('loans');
      expect(a1).not.toHaveProperty('expenses');
      expect(a1).not.toHaveProperty('rents');
      expect(view.summary).not.toHaveProperty('totalRemainingLoanCapital');

      // Parcours complet du JSON.
      const forbidden = [
        'PERSONNE-PHYSIQUE-SECRETE',
        'NCC-SECRET-PP',
        'SOCIETE-HORS-GRANT',
        'RCCM-HORS-GRANT',
        'NCC-HORS-GRANT',
        SECRET_LABEL,
        SUPPLIER,
        RENTER_EMAIL,
        OWNER_EMAIL,
        'notaire@example.test',
        'Locataire Secret',
        '/disk/secret',
        '/uploads/',
        'Description interne',
        pA1,
        pA2,
        pA3,
        pB1,
        pClient,
        entityA,
        ownerClientId,
        ownerUserId,
        tenantA.id,
        tenantB.id,
        docLinked,
        grant.id
      ];
      const forbiddenKeys =
        /^(id|tenantId|tenant_id|propertyId|entityId|ownerClientId|ownerUserId|filePath|fileUrl|email|phone|phonePrimary|whatsappNumber|downloadPath|description|notes|label|supplierName|documentId|grantId|userId)$/;
      const everything: string[] = [];
      walk(view, (text, kind) => {
        if (kind === 'key') expect(text).not.toMatch(forbiddenKeys);
        else everything.push(text);
      });
      const blob = JSON.stringify(view);
      for (const needle of forbidden) expect(blob).not.toContain(needle);
      expect(everything.some(text => text.includes('.pdf'))).toBe(false);
    });

    it('quote-part du propriétaire désigné, rendement et prêts selon les rubriques du banquier', async () => {
      const { token } = await createGrant({ type: 'BANKER', propertyIds: [pA1], documentIds: [], sendEmail: false });
      const view = await getExternalAccessViewByToken(token, {});
      const a1 = view.properties[0];
      expect(view.ownerName).toBe('Awa Proprietaire');
      expect(a1.yield).toMatchObject({ annualRent: 7_200_000 });
      expect(a1.yield?.netNetYield).not.toBeUndefined();
      expect(a1.loans?.[0]).toMatchObject({ lender: 'Banque Atlantique', remainingCapital: 30_000_000 });
      expect(view.summary.totalRemainingLoanCapital).toBe(30_000_000);
      expect(a1.valuation?.latentCapitalGain).toBe(40_000_000);
      expect(a1).not.toHaveProperty('rents');
      expect(a1).not.toHaveProperty('documents');
    });

    it("l'expert-comptable voit dépenses sans texte libre et loyers sans identité", async () => {
      const { token } = await createGrant({
        type: 'ACCOUNTANT',
        propertyIds: [pA1],
        documentIds: [],
        sendEmail: false
      });
      const view = await getExternalAccessViewByToken(token, {});
      const a1 = view.properties[0];
      expect(a1.expenses?.totalLast12Months).toBe(250_000);
      expect(a1.expenses?.items[0]).toEqual({ date: expect.any(String), category: 'INSURANCE', amount: 250_000 });
      expect(a1.rents?.[0]).toMatchObject({
        status: 'ACTIVE',
        rentAmount: 600_000,
        chargesAmount: 50_000,
        billingFrequency: 'MONTHLY'
      });
      const blob = JSON.stringify(view);
      expect(blob).not.toContain(SECRET_LABEL);
      expect(blob).not.toContain(SUPPLIER);
      expect(blob).not.toContain('Locataire Secret');
      expect(blob).not.toContain(RENTER_EMAIL);
      // Banquier non accordé : aucun rendement ni valorisation.
      expect(a1).not.toHaveProperty('yield');
      expect(a1).not.toHaveProperty('valuation');
    });

    it("un bien CLIENT n'est visible que tant que le mandat est actif, vérifié à CHAQUE consultation", async () => {
      const { token } = await createGrant({
        propertyIds: [pA1, pClient],
        documentIds: [],
        sections: ['VALUATIONS'],
        sendEmail: false
      });
      const first = await getExternalAccessViewByToken(token, {});
      expect(first.properties.map(p => p.title)).toContain('Studio client sous mandat');

      await prisma.propertyMandate.updateMany({
        where: { propertyId: pClient },
        data: { isActive: false, revokedAt: new Date() }
      });
      const second = await getExternalAccessViewByToken(token, {});
      expect(second.properties.map(p => p.title)).not.toContain('Studio client sous mandat');
      expect(second.properties.map(p => p.title)).toContain('Villa A1');

      await prisma.propertyMandate.updateMany({
        where: { propertyId: pClient },
        data: { isActive: true, revokedAt: null }
      });
    });

    it("un bien retiré de l'agence (passé à une autre) ne sort plus", async () => {
      const moved = await mkProperty(tenantA.id, 'Bien déplacé', 'TENANT');
      const { token } = await createGrant({
        propertyIds: [pA1, moved],
        documentIds: [],
        sections: ['VALUATIONS'],
        sendEmail: false
      });
      expect((await getExternalAccessViewByToken(token, {})).properties.map(p => p.title)).toContain('Bien déplacé');
      await prisma.property.update({ where: { id: moved }, data: { tenantId: tenantB.id } });
      expect((await getExternalAccessViewByToken(token, {})).properties.map(p => p.title)).not.toContain(
        'Bien déplacé'
      );
    });

    it('journalise la consultation (IP, user-agent, rubriques), compte les vues, jamais de jeton en journal', async () => {
      const { token, grant } = await createGrant({ sections: ['VALUATIONS'], documentIds: [], sendEmail: false });
      await getExternalAccessViewByToken(token, { ip: '203.0.113.7', userAgent: 'Mozilla/5.0 (Test)' });
      await getExternalAccessViewByToken(token, { ip: '203.0.113.8', userAgent: 'Mozilla/5.0 (Test)' });
      await flushAuditEvents();

      const row = await prisma.externalAccessGrant.findFirst({ where: { id: grant.id, tenantId: tenantA.id } });
      expect(row?.viewCount).toBe(2);
      expect(row?.lastViewedAt).toBeInstanceOf(Date);

      const logs = await prisma.auditLog.findMany({ where: { tenantId: tenantA.id, entityId: grant.id } });
      const viewed = logs.filter(l => l.actionKey === 'EXTERNAL_ACCESS_GRANT_VIEWED');
      expect(viewed).toHaveLength(2);
      expect(viewed.map(l => l.ipAddress).sort()).toEqual(['203.0.113.7', '203.0.113.8']);
      expect(viewed[0].userAgent).toBe('Mozilla/5.0 (Test)');
      expect((viewed[0].payload as any).sections).toEqual(['VALUATIONS']);
      expect(viewed[0].actorUserId).toBeNull();
      expect(JSON.stringify(logs)).not.toContain(token);
      expect(JSON.stringify(logs)).not.toContain('notaire@example.test');

      const log = await listExternalAccessLog(tenantA.id, grant.id);
      expect(log.items.filter(i => i.action === 'VIEWED')).toHaveLength(2);
      expect(log.items.find(i => i.action === 'VIEWED')).toMatchObject({
        sections: ['VALUATIONS'],
        userAgent: 'Mozilla/5.0 (Test)'
      });
      expect(log.items.some(i => i.action === 'CREATED')).toBe(true);
    });
  });

  describe('refus uniformes et révocation', () => {
    it('inconnu / expiré / révoqué / grant révoqué / grant expiré / autre portée : même 404, même corps, mêmes en-têtes', async () => {
      const app = express();
      app.set('trust proxy', 1);
      app.use('/api', externalAccessPublicRoutes);
      app.use(errorHandler);
      const PATH = `${PUBLIC_EXTERNAL_ACCESS_PREFIX}/patrimoine`;
      // Un IP distinct par requête : le limiteur (30/min/IP) ne doit pas interférer.
      let n = 0;
      const post = (body: unknown) =>
        request(app)
          .post(PATH)
          .set('X-Forwarded-For', `198.51.100.${(n += 1)}`)
          .send(body as object);

      const good = await createGrant({ sections: ['VALUATIONS'], documentIds: [], sendEmail: false });
      const ok = await post({ token: good.token });
      expect(ok.status).toBe(200);
      expect(ok.body.success).toBe(true);
      expect(ok.headers['cache-control']).toBe('no-store');

      // lien révoqué
      const revokedLink = await createGrant({ sections: ['VALUATIONS'], documentIds: [], sendEmail: false });
      await prisma.secureLink.updateMany({
        where: { tenantId: tenantA.id, objectId: revokedLink.grant.id },
        data: { revokedAt: new Date() }
      });
      // lien expiré
      const expiredLink = await createGrant({ sections: ['VALUATIONS'], documentIds: [], sendEmail: false });
      await prisma.secureLink.updateMany({
        where: { tenantId: tenantA.id, objectId: expiredLink.grant.id },
        data: { expiresAt: new Date(Date.now() - 1000) }
      });
      // grant révoqué (lien encore actif en base : la vue doit relire le grant)
      const revokedGrant = await createGrant({ sections: ['VALUATIONS'], documentIds: [], sendEmail: false });
      await prisma.externalAccessGrant.updateMany({
        where: { id: revokedGrant.grant.id, tenantId: tenantA.id },
        data: { revokedAt: new Date() }
      });
      // grant expiré
      const expiredGrant = await createGrant({ sections: ['VALUATIONS'], documentIds: [], sendEmail: false });
      await prisma.externalAccessGrant.updateMany({
        where: { id: expiredGrant.grant.id, tenantId: tenantA.id },
        data: { expiresAt: new Date(Date.now() - 1000) }
      });
      // lien d'une autre portée
      const otherScope = await createSecureLink({
        tenantId: tenantA.id,
        scope: 'OWNER_MONTHLY_REPORT',
        objectType: 'OwnerStatement',
        objectId: randomUUID()
      });
      // lien du bon scope mais objet inexistant
      const ghost = await createSecureLink({
        tenantId: tenantA.id,
        scope: 'EXTERNAL_ACCESS_GRANT',
        objectType: 'ExternalAccessGrant',
        objectId: randomUUID()
      });
      // lien du bon scope mais mauvais type d'objet
      const wrongType = await createSecureLink({
        tenantId: tenantA.id,
        scope: 'EXTERNAL_ACCESS_GRANT',
        objectType: 'OwnerStatement',
        objectId: good.grant.id
      });
      // lien du grant d'une AUTRE agence : l'objet est cherché dans l'agence du lien, donc introuvable
      const crossTenant = await createSecureLink({
        tenantId: tenantB.id,
        scope: 'EXTERNAL_ACCESS_GRANT',
        objectType: 'ExternalAccessGrant',
        objectId: good.grant.id
      });

      const refused = [
        { token: 'A'.repeat(43) },
        { token: revokedLink.token },
        { token: expiredLink.token },
        { token: revokedGrant.token },
        { token: expiredGrant.token },
        { token: otherScope.token },
        { token: ghost.token },
        { token: wrongType.token },
        { token: crossTenant.token },
        {},
        { token: 12 }
      ];
      const results = [];
      for (const body of refused) results.push(await post(body));

      const reference = results[0];
      expect(reference.status).toBe(404);
      for (const res of results) {
        expect(res.status).toBe(reference.status);
        expect(res.body).toEqual(reference.body);
        for (const header of ['cache-control', 'pragma', 'x-robots-tag', 'referrer-policy', 'content-type']) {
          expect(res.headers[header]).toBe(reference.headers[header]);
        }
        expect(res.headers['cache-control']).toBe('no-store');
        expect(res.headers['referrer-policy']).toBe('no-referrer');
      }
      expect(reference.body).toMatchObject({ success: false, message: 'Lien invalide ou expiré.' });
    });

    it('révoquer le grant révoque tous ses liens et la vue refuse aussitôt ; idempotent ; PATCH puis 409', async () => {
      const { token, grant } = await createGrant({ sections: ['VALUATIONS'], documentIds: [], sendEmail: false });
      const second = await sendExternalAccessLink(tenantA.id, null, grant.id, { sendEmail: false });
      await expect(getExternalAccessViewByToken(token, {})).resolves.toBeDefined();

      const revoked = await revokeExternalAccessGrant(tenantA.id, null, grant.id);
      expect(revoked.status).toBe('REVOKED');
      expect(revoked.activeLinkCount).toBe(0);
      await expect(getExternalAccessViewByToken(token, {})).rejects.toBeInstanceOf(NotFoundError);
      await expect(getExternalAccessViewByToken(tokenOf(second.link.url), {})).rejects.toBeInstanceOf(NotFoundError);
      const links = await prisma.secureLink.findMany({ where: { tenantId: tenantA.id, objectId: grant.id } });
      expect(links.every(l => l.revokedAt !== null)).toBe(true);

      // Idempotent.
      await expect(revokeExternalAccessGrant(tenantA.id, null, grant.id)).resolves.toMatchObject({ status: 'REVOKED' });
      // Un grant révoqué ne se modifie plus et n'émet plus de lien.
      await expect(
        updateExternalAccessGrant(tenantA.id, null, grant.id, { recipientName: 'Autre' } as any)
      ).rejects.toMatchObject({ statusCode: 409 });
      await expect(sendExternalAccessLink(tenantA.id, null, grant.id, {})).rejects.toMatchObject({ statusCode: 409 });
    });

    it("un grant d'une autre agence est introuvable côté agence (IDOR)", async () => {
      const { grant } = await createGrant({ sections: ['VALUATIONS'], documentIds: [], sendEmail: false });
      await expect(getExternalAccessGrantDetail(tenantB.id, grant.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(revokeExternalAccessGrant(tenantB.id, null, grant.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        updateExternalAccessGrant(tenantB.id, null, grant.id, { recipientName: 'Y' } as any)
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(sendExternalAccessLink(tenantB.id, null, grant.id, {})).rejects.toBeInstanceOf(NotFoundError);
      await expect(listExternalAccessLog(tenantB.id, grant.id)).rejects.toBeInstanceOf(NotFoundError);
      expect((await listExternalAccessGrants(tenantB.id)).items.find(i => i.id === grant.id)).toBeUndefined();
      // Rien n'a bougé.
      expect((await getExternalAccessGrantDetail(tenantA.id, grant.id)).status).toBe('ACTIVE');
    });

    it("changer l'e-mail du bénéficiaire révoque les liens actifs ; changer les rubriques agit à la consultation suivante", async () => {
      const { token, grant } = await createGrant({ sections: ['VALUATIONS'], documentIds: [], sendEmail: false });
      const updated = await updateExternalAccessGrant(tenantA.id, null, grant.id, {
        sections: ['VALUATIONS', 'LOANS']
      } as any);
      expect(updated.sections).toEqual(['VALUATIONS', 'LOANS']);
      const view = await getExternalAccessViewByToken(token, {});
      expect(view.properties[0].loans).toHaveLength(1);

      await updateExternalAccessGrant(tenantA.id, null, grant.id, { recipientEmail: 'nouveau@example.test' } as any);
      await expect(getExternalAccessViewByToken(token, {})).rejects.toBeInstanceOf(NotFoundError);
    });

    it('prolonger via PATCH un accès expiré est possible mais envoyer un lien expiré est refusé (409)', async () => {
      const { grant } = await createGrant({ sections: ['VALUATIONS'], documentIds: [], sendEmail: false });
      await prisma.externalAccessGrant.updateMany({
        where: { id: grant.id, tenantId: tenantA.id },
        data: { expiresAt: new Date(Date.now() - 1000) }
      });
      await expect(sendExternalAccessLink(tenantA.id, null, grant.id, {})).rejects.toMatchObject({ statusCode: 409 });
      const extended = await updateExternalAccessGrant(tenantA.id, null, grant.id, {
        expiresAt: new Date(Date.now() + 20 * DAY)
      } as any);
      expect(extended.status).toBe('ACTIVE');
      const again = await sendExternalAccessLink(tenantA.id, null, grant.id, { sendEmail: false });
      expect(again.link.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 20 * DAY + 1000);
    });

    it('un grant permanent (sans expiration) reste valide, ses liens, eux, expirent', async () => {
      const { grant, link } = await createGrant({
        sections: ['VALUATIONS'],
        documentIds: [],
        expiresAt: null,
        sendEmail: false
      });
      expect(grant.permanent).toBe(true);
      expect(link.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 30 * DAY + 1000);
    });
  });

  describe('revue sécurité : titres, périmètre et plafonds', () => {
    it('titres : seules les personnes morales du grant sont nommées ; personne physique et co-détenteur hors grant restent anonymes (somme)', async () => {
      const { token } = await createGrant({
        sections: ['TITLES_OWNERSHIP'],
        propertyIds: [pA1],
        entityIds: [entityA],
        documentIds: [],
        sendEmail: false
      });
      const view = await getExternalAccessViewByToken(token, {});
      const a1 = view.properties.find(p => p.title === 'Villa A1')!;
      expect(a1.titles!.holdings.map(h => h.entityName)).toEqual(['SCI Les Palmiers']);
      expect(a1.titles!.otherHoldersSharePercent).toBe(60);
      const blob = JSON.stringify(view);
      for (const secret of [
        'PERSONNE-PHYSIQUE-SECRETE',
        'NCC-SECRET-PP',
        'SOCIETE-HORS-GRANT',
        'RCCM-HORS-GRANT',
        'NCC-HORS-GRANT'
      ]) {
        expect(blob).not.toContain(secret);
      }
      // Même avec un grant SANS entité listée : la personne physique n'est jamais détaillée.
      const byProperty = await createGrant({
        sections: ['TITLES_OWNERSHIP'],
        propertyIds: [pA1],
        documentIds: [],
        sendEmail: false
      });
      const open = await getExternalAccessViewByToken(byProperty.token, {});
      const text = JSON.stringify(open);
      expect(text).not.toContain('PERSONNE-PHYSIQUE-SECRETE');
      expect(text).not.toContain('NCC-SECRET-PP');
      // Accès par biens seuls : aucune société n'est nommée non plus (SCI listée nulle part dans le grant).
      for (const secret of [
        'SOCIETE-HORS-GRANT',
        'RCCM-HORS-GRANT',
        'NCC-HORS-GRANT',
        'SCI Les Palmiers',
        'CI-ABJ-2020-B-1'
      ]) {
        expect(text).not.toContain(secret);
      }
      expect(open.properties[0].titles!.holdings).toEqual([]);
      expect(open.properties[0].titles!.otherHoldersSharePercent).toBe(100);
    });

    it('PATCH avec un bien déjà présent mais sorti du périmètre (mandat échu) : réussit et élague le bien', async () => {
      const { grant } = await createGrant({
        sections: ['VALUATIONS'],
        propertyIds: [pA1, pClient],
        documentIds: [],
        sendEmail: false
      });
      await prisma.propertyMandate.updateMany({
        where: { propertyId: pClient },
        data: { isActive: false, revokedAt: new Date() }
      });
      try {
        const updated = await updateExternalAccessGrant(tenantA.id, null, grant.id, {
          recipientName: 'Nouveau nom',
          propertyIds: [pA1, pClient]
        } as any);
        expect(updated.recipientName).toBe('Nouveau nom');
        expect(updated.properties.map(p => p.id)).toEqual([pA1]);
        // Un bien AJOUTÉ hors périmètre reste refusé.
        await expect(
          updateExternalAccessGrant(tenantA.id, null, grant.id, { propertyIds: [pA1, pClientOld] } as any)
        ).rejects.toBeInstanceOf(NotFoundError);
      } finally {
        await prisma.propertyMandate.updateMany({
          where: { propertyId: pClient },
          data: { isActive: true, revokedAt: null }
        });
      }
    });

    it('retirer la rubrique DOCUMENTS supprime les partages en base', async () => {
      const { grant } = await createGrant({ sections: ['DOCUMENTS'], documentIds: [docLinked], sendEmail: false });
      expect(
        await prisma.externalAccessGrantDocument.count({ where: { tenantId: tenantA.id, grantId: grant.id } })
      ).toBe(1);
      await updateExternalAccessGrant(tenantA.id, null, grant.id, { sections: ['VALUATIONS'] } as any);
      expect(
        await prisma.externalAccessGrantDocument.count({ where: { tenantId: tenantA.id, grantId: grant.id } })
      ).toBe(0);
    });

    it('ownerClientId : un client qui n’est pas propriétaire (locataire) est refusé comme un inconnu', async () => {
      await expect(
        createGrant({ ownerClientId: renterClientId, documentIds: [], sendEmail: false })
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('entité sans détention : 400 explicite ; durée de lien hors bornes : 400 avant toute écriture', async () => {
      await expect(
        createGrant({ propertyIds: [], entityIds: [entityEmpty], documentIds: [], sendEmail: false })
      ).rejects.toMatchObject({ statusCode: 400, message: 'Cette entité ne détient aucun bien.' });
      const before = await prisma.externalAccessGrant.count({ where: { tenantId: tenantA.id } });
      await expect(createGrant({ linkTtlDays: 365, documentIds: [], sendEmail: false })).rejects.toMatchObject({
        statusCode: 400
      });
      expect(await prisma.externalAccessGrant.count({ where: { tenantId: tenantA.id } })).toBe(before);
    });

    it('plafond de 100 biens : refusé à l’écriture (400), tronqué à la consultation (summary.truncated)', async () => {
      await expect(
        createGrant({ propertyIds: [], entityIds: [entityBig], documentIds: [], sendEmail: false })
      ).rejects.toMatchObject({ statusCode: 400, message: 'Un accès partagé ne peut couvrir plus de 100 biens.' });

      // Entité qui « grossit » après la création : on insère le grant directement.
      const grant = await prisma.externalAccessGrant.create({
        data: {
          tenantId: tenantA.id,
          type: 'NOTARY',
          recipientName: 'Maître Gros',
          recipientEmail: 'gros@example.test',
          sections: ['TITLES_OWNERSHIP']
        },
        select: { id: true }
      });
      await prisma.externalAccessGrantEntity.create({
        data: { tenantId: tenantA.id, grantId: grant.id, entityId: entityBig }
      });
      const link = await createSecureLink({
        tenantId: tenantA.id,
        scope: 'EXTERNAL_ACCESS_GRANT',
        objectType: 'ExternalAccessGrant',
        objectId: grant.id
      });
      const view = await getExternalAccessViewByToken(link.token, {});
      expect(view.properties).toHaveLength(100);
      expect(view.summary.truncated).toBe(true);
      expect(view.properties[0].title).toBe('Gros 000');
    });

    it('M6 : un identifiant étranger et un identifiant inexistant donnent le MÊME message de NotFoundError', async () => {
      const attempt = (extra: Record<string, unknown>) =>
        createExternalAccessGrant(tenantA.id, null, {
          type: 'NOTARY',
          recipientName: 'X',
          recipientEmail: 'm6@example.test',
          propertyIds: [pA1],
          entityIds: [],
          documentIds: [],
          sendEmail: false,
          ...extra
        } as any).catch((error: Error) => error);
      const foreignProperty = await attempt({ propertyIds: [pB1] });
      const missingProperty = await attempt({ propertyIds: [randomUUID()] });
      expect(foreignProperty).toBeInstanceOf(NotFoundError);
      expect((foreignProperty as Error).message).toBe((missingProperty as Error).message);

      const foreignOwner = await attempt({ ownerClientId: ownerClientB });
      const missingOwner = await attempt({ ownerClientId: randomUUID() });
      expect((foreignOwner as Error).message).toBe((missingOwner as Error).message);

      const foreignEntity = await attempt({ entityIds: [entityB] });
      const missingEntity = await attempt({ entityIds: [randomUUID()] });
      expect((foreignEntity as Error).message).toBe((missingEntity as Error).message);
    });
  });

  describe('téléchargement', () => {
    it('sert le document lié, journalisé, avec les en-têtes sûrs', async () => {
      const { token, grant } = await createGrant({
        sections: ['DOCUMENTS'],
        documentIds: [docLinked],
        sendEmail: false
      });
      const view = await getExternalAccessViewByToken(token, {});
      const ref = view.properties[0].documents![0].ref;

      const app = express();
      app.set('trust proxy', 1);
      app.use('/api', externalAccessPublicRoutes);
      app.use(errorHandler);
      const res = await request(app)
        .post(`${PUBLIC_EXTERNAL_ACCESS_PREFIX}/documents/download`)
        .set('X-Forwarded-For', '198.51.100.200')
        .set('User-Agent', 'DL/1')
        .send({ token, documentRef: ref });
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toMatch(/^attachment;/);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['content-type']).toMatch(/application\/pdf/);
      expect(Buffer.from(res.body).toString()).toBe('CONTENU-DU-TITRE');

      await flushAuditEvents();
      const log = await prisma.auditLog.findFirst({
        where: { tenantId: tenantA.id, entityId: grant.id, actionKey: 'EXTERNAL_ACCESS_GRANT_DOCUMENT_DOWNLOADED' }
      });
      expect(log).toBeTruthy();
      expect(log?.userAgent).toBe('DL/1');
      expect((log?.payload as any).documentRef).toBe(ref);
      expect(JSON.stringify(log)).not.toContain(token);
    });

    it("document hors grant, d'un autre bien, rubrique retirée, référence inventée : même 404", async () => {
      const { token, grant } = await createGrant({
        sections: ['DOCUMENTS'],
        documentIds: [docLinked],
        sendEmail: false
      });
      const view = await getExternalAccessViewByToken(token, {});
      const ref = view.properties[0].documents![0].ref;

      // L'id d'un PropertyDocument (même lié) n'est pas une référence valable.
      const refused: string[] = [docLinked, docOther, docB, randomUUID(), 'x'.repeat(64)];
      for (const documentRef of refused) {
        await expect(getExternalAccessDocumentByToken(token, documentRef, {})).rejects.toMatchObject({
          statusCode: 404,
          message: 'Lien invalide ou expiré.'
        });
      }
      // Une ligne de liaison d'un AUTRE grant n'ouvre pas ce grant.
      const other = await createGrant({ sections: ['DOCUMENTS'], documentIds: [docOther], sendEmail: false });
      const otherRef = (await getExternalAccessViewByToken(other.token, {})).properties[0].documents![0].ref;
      await expect(getExternalAccessDocumentByToken(token, otherRef, {})).rejects.toBeInstanceOf(NotFoundError);

      // Rubrique DOCUMENTS retirée : le même document devient inaccessible.
      await updateExternalAccessGrant(tenantA.id, null, grant.id, { sections: ['VALUATIONS'] } as any);
      await expect(getExternalAccessDocumentByToken(token, ref, {})).rejects.toBeInstanceOf(NotFoundError);
      // Retirer la rubrique supprime les partages : la rajouter ne les ressuscite pas (pas de partage dormant).
      await updateExternalAccessGrant(tenantA.id, null, grant.id, { sections: ['DOCUMENTS'] } as any);
      await expect(getExternalAccessDocumentByToken(token, ref, {})).rejects.toBeInstanceOf(NotFoundError);
      // Il faut repartager explicitement : nouvelle référence.
      await updateExternalAccessGrant(tenantA.id, null, grant.id, { documentIds: [docLinked] } as any);
      const newRef = (await getExternalAccessViewByToken(token, {})).properties[0].documents![0].ref;
      expect(newRef).not.toBe(ref);
      await expect(getExternalAccessDocumentByToken(token, newRef, {})).resolves.toBeDefined();

      // Le bien quitte le périmètre : le document n'est plus téléchargeable.
      await prisma.externalAccessGrantProperty.deleteMany({ where: { tenantId: tenantA.id, grantId: grant.id } });
      await prisma.externalAccessGrantProperty.create({
        data: { tenantId: tenantA.id, grantId: grant.id, propertyId: pA2 }
      });
      await expect(getExternalAccessDocumentByToken(token, newRef, {})).rejects.toBeInstanceOf(NotFoundError);
    });

    it('fichier absent du disque : même 404 uniforme', async () => {
      const { token } = await createGrant({ sections: ['DOCUMENTS'], documentIds: [docLinked], sendEmail: false });
      const ref = (await getExternalAccessViewByToken(token, {})).properties[0].documents![0].ref;
      const doc = await prisma.propertyDocument.findFirst({ where: { id: docLinked }, select: { fileUrl: true } });
      const stored = path.basename(doc!.fileUrl!);
      const full = writtenFiles.find(f => f.endsWith(stored))!;
      const backup = await fs.readFile(full);
      await fs.rm(full);
      try {
        await expect(getExternalAccessDocumentByToken(token, ref, {})).rejects.toMatchObject({
          message: 'Lien invalide ou expiré.'
        });
      } finally {
        await fs.writeFile(full, backup);
      }
    });
  });
});
