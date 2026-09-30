/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Portail copropriétaire enrichi (lot S5, besoin 2) — de bout en bout sur HTTP.
 *
 * Pile réelle : garde `requireCoOwnerPortalAccess`, contrôleur et services
 * du lot S5, livraison PDF du lot S3, en-tête S1. Seules changent la session
 * (en-tête `x-test-user`) et la base, remplacée par la base en mémoire qui
 * applique réellement les filtres `where` et les `select`
 * (`__tests__/helpers/fake-prisma.ts`) : une fuite entre copropriétaires ou
 * entre agences s'y verrait comme sur Postgres.
 *
 * Jeu de données :
 *   Agence A — copropriété S1 (mandant M1, logo ; lots L1 d'Awa, L2 de
 *              Bakary), copropriété S2 (sans mandant ni logo ; lot L3 d'Awa).
 *   Agence B — copropriété SB (lot LB d'Awa, sous une autre fiche CRM).
 *   Agence C — Awa n'y est pas copropriétaire.
 */

import * as os from 'os';
import * as path from 'path';
import { promises as fs } from 'fs';

const UPLOADS_ROOT = path.join(os.tmpdir(), `coowner-portal-s5-test-${process.pid}`);
process.env.UPLOADS_DIR = UPLOADS_ROOT;

import express from 'express';
import request from 'supertest';
import { createFakePrisma, matchesWhere } from '../helpers/fake-prisma';
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

jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: jest.fn(),
  flushAuditQueue: jest.fn()
}));

// Le vrai générateur de relevé, espionné pour lire ce que le portail lui passe.
jest.mock('../../src/lib/syndics/owner-account-statement', () => {
  const actual = jest.requireActual('../../src/lib/syndics/owner-account-statement');
  return { ...actual, buildOwnerAccountStatementPdf: jest.fn(actual.buildOwnerAccountStatementPdf) };
});

import coOwnerPortalRoutes from '../../src/routes/coowner-portal-routes';
import { buildOwnerAccountStatementPdf } from '../../src/lib/syndics/owner-account-statement';
import { ownedChargeCallsWhere } from '../../src/lib/syndics/coowner-portal';
import { requireCoOwnerPortalAccess } from '../../src/middleware/coowner-portal-access';
import { errorHandler } from '../../src/middleware/error-middleware';

const app = express();
app.use(express.json());
app.use('/api/portal/copropriete', coOwnerPortalRoutes);
app.use(errorHandler);

const BASE = '/api/portal/copropriete';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const TENANT_C = 'tenant-c';
const USER_AWA = 'user-awa';
const USER_BAKARY = 'user-bakary';
const CONTACT_AWA = 'contact-awa';
const CONTACT_BAKARY = 'contact-bakary';
const CONTACT_AWA_IN_B = 'contact-awa-b';
const CONTACT_PREVIOUS = 'contact-ancien';
const CONTACT_MANAGER = 'contact-gestionnaire';
const CONTACT_MANAGER_B = 'contact-gestionnaire-b';

const S1 = id(101);
const S2 = id(102);
const SB = id(103);
const MANDANT = id(110);
const L1 = id(201);
const L2 = id(202);
const L3 = id(203);
const LB = id(204);
const CALL_L1 = id(301);
const CALL_L2 = id(302);
const CALL_L1_2025 = id(303);
const CALL_LB = id(304);
const PAY_L1 = id(401);
const PAY_L1_2025 = id(402);
const PAY_L2 = id(403);
const PAY_LB = id(404);
const R_L1_RECEIPT = id(501);
const R_L1_QUITTANCE = id(502);
const R_L1_PREVIOUS = id(503);
const R_L2 = id(504);
const R_LB = id(505);
const ACCOUNT_L1 = id(601);

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);
const SYNDIC_LOGO_KEY = `branding/${TENANT_A}/syndics/${S1}/logo-1.png`;
const MANDANT_LOGO_KEY = `branding/${TENANT_A}/mandants/${MANDANT}/logo-1.png`;
const MANDANT_SIGNATURE_KEY = `branding/${TENANT_A}/mandants/${MANDANT}/signature-1.png`;
const receiptUrl = (syndicateId: string, receiptId: string) =>
  `/uploads/syndics/${syndicateId}/quittances/${receiptId}.pdf`;

function snapshot(kind: 'RECEIPT' | 'QUITTANCE', number: string, coowner: string) {
  return {
    version: 1,
    kind,
    number,
    issuedAt: '2026-02-01T10:00:00.000Z',
    currency: 'XOF',
    amount: 30000,
    issuer: {
      key: MANDANT,
      kind: 'MANDANT',
      name: 'Cabinet Mandant',
      legalName: null,
      address: 'Plateau',
      phone: null,
      email: null,
      rccm: null,
      taxId: null
    },
    syndicate: { name: 'Résidence Les Acacias', address: 'Plateau', registrationNo: null, cadastralReference: null },
    lot: { number: 'A1', type: 'Appartement', label: null },
    coowner: { name: coowner, address: null },
    call: {
      id: CALL_L1,
      period: { label: '2026-01', start: '2026-01-01', end: '2026-01-31' },
      amount: 30000,
      dueDate: '2026-01-31T00:00:00.000Z'
    },
    settlements: [],
    settledAt: '2026-01-15T00:00:00.000Z',
    payment: null,
    allocations: [],
    outstandingAfter: 0,
    advance: 0,
    lotAdvanceBalance: 0,
    backfilled: false
  };
}

function seedPeople() {
  mockPrisma.user.rows.push({ id: USER_AWA, isActive: true }, { id: USER_BAKARY, isActive: true });
  mockPrisma.tenant.rows.push(
    { id: TENANT_A, name: 'Agence Plateau', status: 'ACTIVE', logoUrl: null, contactEmail: 'contact@plateau.ci' },
    { id: TENANT_B, name: 'Agence Cocody', status: 'ACTIVE', logoUrl: null },
    { id: TENANT_C, name: 'Agence Yopougon', status: 'ACTIVE', logoUrl: null }
  );
  const contact = (contactId: string, tenantId: string, firstName: string, extra: any = {}) => ({
    id: contactId,
    tenantId,
    firstName,
    lastName: 'Test',
    legalName: null,
    email: `${firstName.toLowerCase()}@example.com`,
    ...extra
  });
  mockPrisma.crmContact.rows.push(
    contact(CONTACT_AWA, TENANT_A, 'Awa'),
    contact(CONTACT_BAKARY, TENANT_A, 'Bakary'),
    contact(CONTACT_AWA_IN_B, TENANT_B, 'Awa'),
    contact(CONTACT_PREVIOUS, TENANT_A, 'Ancien'),
    contact(CONTACT_MANAGER, TENANT_A, 'Mariam', { phonePrimary: '0700000000' }),
    contact(CONTACT_MANAGER_B, TENANT_B, 'Intrus', { phonePrimary: '0799999999' })
  );
  const client = (clientId: string, userId: string, tenantId: string, contactId: string, createdAt: string) => ({
    id: clientId,
    userId,
    tenantId,
    clientType: 'CO_OWNER',
    createdAt: new Date(createdAt),
    details: { crmContactId: contactId, syndicCoOwnerContactIds: [contactId] }
  });
  mockPrisma.tenantClient.rows.push(
    client('tc-awa-a', USER_AWA, TENANT_A, CONTACT_AWA, '2026-01-01'),
    client('tc-awa-b', USER_AWA, TENANT_B, CONTACT_AWA_IN_B, '2026-02-01'),
    client('tc-bakary-a', USER_BAKARY, TENANT_A, CONTACT_BAKARY, '2026-01-01')
  );
}

function seedSyndicates() {
  mockPrisma.syndicMandatingAgency.rows.push({
    id: MANDANT,
    tenantId: TENANT_A,
    name: 'Cabinet Mandant',
    legalName: 'Cabinet Mandant SARL',
    address: 'Plateau, rue 12',
    phone: '0102030405',
    email: 'mandant@example.com',
    rccm: 'RCCM-INTERNE',
    taxId: 'NCC-INTERNE',
    logoPath: MANDANT_LOGO_KEY,
    signaturePath: MANDANT_SIGNATURE_KEY,
    stampPath: null
  });
  mockPrisma.syndicate.rows.push(
    {
      id: S1,
      tenantId: TENANT_A,
      name: 'Résidence Les Acacias',
      address: 'Plateau',
      registrationNo: 'IMM-001',
      cadastralReference: 'CAD-42',
      logoPath: SYNDIC_LOGO_KEY,
      mandatingAgencyId: MANDANT,
      // Relation lue par l'identité S1 (`resolveDocumentBranding`), copiée ici
      // parce que la base en mémoire ne suit pas les clés étrangères.
      mandatingAgency: {
        name: 'Cabinet Mandant',
        legalName: null,
        address: 'Plateau, rue 12',
        phone: null,
        email: null,
        rccm: null,
        taxId: null,
        logoPath: MANDANT_LOGO_KEY,
        signaturePath: MANDANT_SIGNATURE_KEY,
        stampPath: null
      },
      syndicManagerId: CONTACT_MANAGER
    },
    {
      id: S2,
      tenantId: TENANT_A,
      name: 'Résidence Les Palmiers',
      address: 'Plateau',
      registrationNo: null,
      cadastralReference: null,
      logoPath: null,
      mandatingAgencyId: null,
      // Contact d'une AUTRE agence : ne doit jamais sortir.
      syndicManagerId: CONTACT_MANAGER_B
    },
    {
      id: SB,
      tenantId: TENANT_B,
      name: 'Résidence Cocody',
      address: 'Cocody',
      logoPath: null,
      mandatingAgencyId: null,
      syndicManagerId: null
    }
  );
  const lot = (lotId: string, syndicateId: string, lotNumber: string, owner: string) => ({
    id: lotId,
    syndicateId,
    lotNumber,
    lotType: 'APARTMENT',
    generalShares: 100,
    specialShares: null,
    coownerId: owner,
    ownerContactId: owner
  });
  mockPrisma.syndicateLot.rows.push(
    lot(L1, S1, 'A1', CONTACT_AWA),
    lot(L2, S1, 'A2', CONTACT_BAKARY),
    lot(L3, S2, 'P1', CONTACT_AWA),
    lot(LB, SB, 'C1', CONTACT_AWA_IN_B)
  );
  const profile = (profileId: string, lotId: string, contactId: string) => ({
    id: profileId,
    lotId,
    contactId,
    ownershipPercentage: 100,
    ownedSince: new Date('2025-01-01'),
    ownedUntil: null,
    portalAccessEnabled: true,
    isActive: true,
    createdAt: new Date('2025-01-01')
  });
  mockPrisma.lotOwnerProfile.rows.push(
    profile('p-1', L1, CONTACT_AWA),
    profile('p-2', L2, CONTACT_BAKARY),
    profile('p-3', L3, CONTACT_AWA),
    profile('p-4', LB, CONTACT_AWA_IN_B)
  );
}

function seedFinance() {
  const call = (callId: string, syndicateId: string, lotId: string, extra: any) => ({
    id: callId,
    syndicateId,
    lotId,
    currency: 'XOF',
    status: 'PARTIAL',
    createdAt: new Date('2026-01-01'),
    ...extra
  });
  mockPrisma.chargeCall.rows.push(
    call(CALL_L1, S1, L1, {
      period: '2026-T1',
      periodStart: new Date('2026-01-01'),
      periodEnd: new Date('2026-03-31'),
      amount: 90000,
      dueDate: new Date('2026-01-31')
    }),
    call(CALL_L1_2025, S1, L1, {
      period: '2025-12',
      periodStart: new Date('2025-12-01'),
      periodEnd: new Date('2025-12-31'),
      amount: 1000,
      dueDate: new Date('2025-12-31')
    }),
    call(CALL_L2, S1, L2, {
      period: '2026-T1',
      periodStart: new Date('2026-01-01'),
      periodEnd: new Date('2026-03-31'),
      amount: 60000,
      dueDate: new Date('2026-01-31')
    }),
    call(CALL_LB, SB, LB, {
      period: '2026-01',
      periodStart: new Date('2026-01-01'),
      periodEnd: new Date('2026-01-31'),
      amount: 5000,
      dueDate: new Date('2026-01-31')
    })
  );
  const payment = (
    paymentId: string,
    lotId: string,
    amount: number,
    unallocated: number,
    paidAt: string,
    extra = {}
  ) => ({
    id: paymentId,
    lotId,
    chargeCallId: null,
    amount,
    unallocatedAmount: unallocated,
    paidAt: new Date(paidAt),
    method: 'MOBILE_MONEY',
    reference: null,
    createdById: 'user-mariam',
    createdAt: new Date(paidAt),
    ...extra
  });
  mockPrisma.chargePayment.rows.push(
    payment(PAY_L1, L1, 50000, 10000, '2026-01-15', { reference: 'OM-AWA-1' }),
    payment(PAY_L1_2025, L1, 1000, 0, '2025-12-20', { method: 'CASH' }),
    payment(PAY_L2, L2, 30000, 5000, '2026-01-20', { reference: 'BAKARY-REF' }),
    payment(PAY_LB, LB, 5000, 0, '2026-01-10', { reference: 'COCODY-REF' })
  );
  const allocation = (paymentId: string, chargeCallId: string, amount: number, source = 'PAYMENT') => ({
    id: `${paymentId}-${chargeCallId}`,
    paymentId,
    chargeCallId,
    amount,
    source,
    createdAt: new Date('2026-01-15')
  });
  mockPrisma.chargePaymentAllocation.rows.push(
    allocation(PAY_L1, CALL_L1, 40000),
    allocation(PAY_L1_2025, CALL_L1_2025, 1000),
    allocation(PAY_L2, CALL_L2, 25000),
    allocation(PAY_LB, CALL_LB, 5000)
  );
  mockPrisma.ownerAccount.rows.push({
    id: ACCOUNT_L1,
    syndicateId: S1,
    lotId: L1,
    contactId: CONTACT_AWA,
    balance: 50000,
    currency: 'XOF'
  });
  mockPrisma.ownerAccountTransaction.rows.push(
    {
      id: 'tx-1',
      accountId: ACCOUNT_L1,
      transactionDate: new Date('2026-01-01'),
      createdAt: new Date('2026-01-01'),
      type: 'CHARGE_CALL',
      label: 'Appel T1',
      debit: 90000,
      credit: null,
      balanceAfter: 90000
    },
    {
      id: 'tx-2',
      accountId: ACCOUNT_L1,
      transactionDate: new Date('2026-01-15'),
      createdAt: new Date('2026-01-15'),
      type: 'PAYMENT',
      label: 'Paiement',
      debit: null,
      credit: 40000,
      balanceAfter: 50000
    }
  );
}

function seedReceipts() {
  const receipt = (
    receiptId: string,
    syndicateId: string,
    lotId: string,
    tenantId: string,
    contactId: string | null,
    kind: 'RECEIPT' | 'QUITTANCE',
    number: string,
    extra: any = {}
  ) => ({
    id: receiptId,
    tenantId,
    syndicateId,
    lotId,
    contactId,
    kind,
    number,
    issuerKey: MANDANT,
    chargePaymentId: null,
    chargeCallId: null,
    periodStart: null,
    periodEnd: null,
    periodLabel: null,
    amount: 30000,
    currency: 'XOF',
    snapshot: snapshot(kind, number, 'Nom du destinataire'),
    filePath: receiptUrl(syndicateId, receiptId),
    issuedAt: new Date('2026-02-01'),
    emailedAt: new Date('2026-02-01'),
    emailError: 'SMTP refuse : secret interne',
    createdById: 'user-mariam',
    ...extra
  });
  mockPrisma.syndicChargeReceipt.rows.push(
    receipt(R_L1_RECEIPT, S1, L1, TENANT_A, CONTACT_AWA, 'RECEIPT', 'R-2026-000001', {
      chargePaymentId: PAY_L1,
      issuedAt: new Date('2026-01-15')
    }),
    // Pas de fichier stocké : reconstruit depuis le snapshot à la demande.
    receipt(R_L1_QUITTANCE, S1, L1, TENANT_A, CONTACT_AWA, 'QUITTANCE', 'Q-2026-000001', {
      chargeCallId: CALL_L1,
      periodStart: new Date('2026-01-01'),
      periodEnd: new Date('2026-01-31'),
      periodLabel: '2026-01',
      filePath: null
    }),
    receipt(R_L1_PREVIOUS, S1, L1, TENANT_A, CONTACT_PREVIOUS, 'QUITTANCE', 'Q-2025-000009', {
      issuedAt: new Date('2025-06-01')
    }),
    receipt(R_L2, S1, L2, TENANT_A, CONTACT_BAKARY, 'RECEIPT', 'R-2026-000002', { chargePaymentId: PAY_L2 }),
    receipt(R_LB, SB, LB, TENANT_B, CONTACT_AWA_IN_B, 'RECEIPT', 'R-2026-000001', { chargePaymentId: PAY_LB })
  );
}

function seed() {
  mockPrisma.reset();
  seedPeople();
  seedSyndicates();
  seedFinance();
  seedReceipts();
}

const as = (userId: string, tenantId?: string) => ({
  'x-test-user': userId,
  ...(tenantId ? { 'x-portal-tenant-id': tenantId } : {})
});

/** Récupère un corps binaire (PDF, image) en Buffer. */
function binary(res: any, callback: (error: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

async function writeUpload(relative: string, content: Buffer | string) {
  const absolute = path.join(UPLOADS_ROOT, ...relative.split('/'));
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, content);
}

beforeAll(async () => {
  await writeUpload(SYNDIC_LOGO_KEY, PNG);
  await writeUpload(MANDANT_LOGO_KEY, PNG);
  await writeUpload(MANDANT_SIGNATURE_KEY, PNG);
  await writeUpload(`syndics/${S1}/quittances/${R_L1_RECEIPT}.pdf`, '%PDF-RECU-AWA');
  await writeUpload(`syndics/${S1}/quittances/${R_L1_PREVIOUS}.pdf`, '%PDF-ANCIEN');
  await writeUpload(`syndics/${S1}/quittances/${R_L2}.pdf`, '%PDF-BAKARY');
  await writeUpload(`syndics/${SB}/quittances/${R_LB}.pdf`, '%PDF-COCODY');
});

afterAll(async () => {
  await fs.rm(UPLOADS_ROOT, { recursive: true, force: true });
});

beforeEach(seed);

/** Aucune donnée interne ni chemin disque dans une réponse JSON du portail. */
function expectClean(body: unknown) {
  expect(findDiskPathLeaks(body)).toEqual([]);
  const text = JSON.stringify(body);
  for (const forbidden of ['emailError', 'createdById', 'user-mariam', 'contactId', 'snapshot', 'SMTP', 'issuerKey']) {
    expect(text).not.toContain(forbidden);
  }
}

// ---------------------------------------------------------------------------
// Mes paiements
// ---------------------------------------------------------------------------

describe('GET /paiements', () => {
  it('rend les paiements de SES lots avec affectations, avance restante et reçu', async () => {
    const res = await request(app).get(`${BASE}/paiements`).set(as(USER_AWA));

    expect(res.status).toBe(200);
    expect(res.body.data.items.map((item: any) => item.id)).toEqual([PAY_L1, PAY_L1_2025]);
    expect(res.body.data.items[0]).toEqual({
      id: PAY_L1,
      paidAt: '2026-01-15T00:00:00.000Z',
      amount: 50000,
      currency: 'XOF',
      method: 'MOBILE_MONEY',
      methodLabel: 'Mobile money',
      reference: 'OM-AWA-1',
      lot: { id: L1, lotNumber: 'A1' },
      syndicate: { id: S1, name: 'Résidence Les Acacias' },
      allocations: [
        {
          chargeCallId: CALL_L1,
          period: '2026-T1',
          periodStart: '2026-01-01',
          periodEnd: '2026-03-31',
          dueDate: '2026-01-31',
          amount: 40000,
          source: 'PAYMENT'
        }
      ],
      remainingAdvance: 10000,
      documents: [
        {
          id: R_L1_RECEIPT,
          kind: 'RECEIPT',
          number: 'R-2026-000001',
          downloadPath: `/portal/copropriete/quittances/${R_L1_RECEIPT}/fichier`
        }
      ]
    });
    expect(res.body.data.advances).toEqual([
      {
        lot: { id: L1, lotNumber: 'A1' },
        syndicate: { id: S1, name: 'Résidence Les Acacias' },
        advance: 10000,
        currency: 'XOF'
      },
      {
        lot: { id: L3, lotNumber: 'P1' },
        syndicate: { id: S2, name: 'Résidence Les Palmiers' },
        advance: 0,
        currency: 'XOF'
      }
    ]);
    expect(JSON.stringify(res.body)).not.toContain('BAKARY-REF');
    expect(JSON.stringify(res.body)).not.toContain('COCODY-REF');
    expectClean(res.body);
  });

  it('filtre par année et par lot', async () => {
    const year = await request(app).get(`${BASE}/paiements?year=2025`).set(as(USER_AWA));
    expect(year.body.data.items.map((item: any) => item.id)).toEqual([PAY_L1_2025]);
    expect(year.body.data.items[0].methodLabel).toBe('Espèces');

    const lot = await request(app).get(`${BASE}/paiements?lotId=${L3}`).set(as(USER_AWA));
    expect(lot.status).toBe(200);
    expect(lot.body.data.items).toEqual([]);
    expect(lot.body.data.advances.map((row: any) => row.lot.id)).toEqual([L3]);
  });

  it('lot d’un autre copropriétaire ou d’une autre agence : 404 identique à l’inexistant', async () => {
    const other = await request(app).get(`${BASE}/paiements?lotId=${L2}`).set(as(USER_AWA));
    const otherTenant = await request(app).get(`${BASE}/paiements?lotId=${LB}`).set(as(USER_AWA));
    const missing = await request(app)
      .get(`${BASE}/paiements?lotId=${id(999)}`)
      .set(as(USER_AWA));

    expect([other.status, otherTenant.status, missing.status]).toEqual([404, 404, 404]);
    expect(other.body.message).toBe(missing.body.message);
    expect(otherTenant.body.message).toBe(missing.body.message);
  });

  it('400 sur un filtre invalide', async () => {
    for (const query of ['year=1999', 'year=abc', 'lotId=pas-un-uuid']) {
      expect((await request(app).get(`${BASE}/paiements?${query}`).set(as(USER_AWA))).status).toBe(400);
    }
  });

  it('dans l’agence B (en-tête), seulement les paiements de ses lots de B', async () => {
    const res = await request(app).get(`${BASE}/paiements`).set(as(USER_AWA, TENANT_B));
    expect(res.status).toBe(200);
    expect(res.body.data.items.map((item: any) => item.id)).toEqual([PAY_LB]);
  });
});

// ---------------------------------------------------------------------------
// Mes reçus et quittances
// ---------------------------------------------------------------------------

describe('GET /quittances', () => {
  it('rend SES documents, sans ceux de l’ancien propriétaire du lot ni ceux d’un autre lot', async () => {
    const res = await request(app).get(`${BASE}/quittances`).set(as(USER_AWA));

    expect(res.status).toBe(200);
    expect(res.body.data.items.map((item: any) => item.id)).toEqual([R_L1_QUITTANCE, R_L1_RECEIPT]);
    expect(res.body.data.pagination).toEqual({ page: 1, limit: 20, total: 2, totalPages: 1 });
    expect(res.body.data.items[0]).toEqual({
      id: R_L1_QUITTANCE,
      kind: 'QUITTANCE',
      number: 'Q-2026-000001',
      lot: { id: L1, lotNumber: 'A1' },
      syndicate: { id: S1, name: 'Résidence Les Acacias' },
      chargeCallId: CALL_L1,
      chargePaymentId: null,
      periodLabel: '2026-01',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      amount: 30000,
      currency: 'XOF',
      issuedAt: '2026-02-01T00:00:00.000Z',
      emailedAt: '2026-02-01T00:00:00.000Z',
      downloadPath: `/portal/copropriete/quittances/${R_L1_QUITTANCE}/fichier`
    });
    expect(JSON.stringify(res.body)).not.toContain('Q-2025-000009');
    expectClean(res.body);
  });

  it('filtres : type, période, lot', async () => {
    const kind = await request(app).get(`${BASE}/quittances?kind=RECEIPT`).set(as(USER_AWA));
    expect(kind.body.data.items.map((item: any) => item.id)).toEqual([R_L1_RECEIPT]);

    const period = await request(app).get(`${BASE}/quittances?from=2026-02-01&to=2026-02-28`).set(as(USER_AWA));
    expect(period.body.data.items).toEqual([]);

    const lot = await request(app).get(`${BASE}/quittances?lotId=${L3}`).set(as(USER_AWA));
    expect(lot.body.data.items).toEqual([]);

    const other = await request(app).get(`${BASE}/quittances?lotId=${L2}`).set(as(USER_AWA));
    expect(other.status).toBe(404);
  });

  it('400 sur un filtre invalide', async () => {
    for (const query of ['kind=AUTRE', 'from=2026-02-30', 'from=2026-03-01&to=2026-01-01', 'limit=500']) {
      expect((await request(app).get(`${BASE}/quittances?${query}`).set(as(USER_AWA))).status).toBe(400);
    }
  });
});

describe('GET /quittances/:receiptId/fichier', () => {
  it('sert le PDF stocké de son reçu', async () => {
    const res = await request(app)
      .get(`${BASE}/quittances/${R_L1_RECEIPT}/fichier`)
      .set(as(USER_AWA))
      .buffer(true)
      .parse(binary);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe("attachment; filename*=UTF-8''Re%C3%A7u%20R-2026-000001.pdf");
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.body.toString()).toBe('%PDF-RECU-AWA');
  });

  it('reconstruit depuis le snapshot une quittance sans fichier', async () => {
    const res = await request(app)
      .get(`${BASE}/quittances/${R_L1_QUITTANCE}/fichier`)
      .set(as(USER_AWA))
      .buffer(true)
      .parse(binary);

    expect(res.status).toBe(200);
    expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('404 identique pour le document d’un autre copropriétaire, d’un ancien propriétaire, d’une autre agence', async () => {
    const missing = await request(app)
      .get(`${BASE}/quittances/${id(999)}/fichier`)
      .set(as(USER_AWA));
    for (const receiptId of [R_L2, R_L1_PREVIOUS, R_LB]) {
      const res = await request(app).get(`${BASE}/quittances/${receiptId}/fichier`).set(as(USER_AWA));
      expect(res.status).toBe(404);
      expect(res.body.message).toBe(missing.body.message);
    }
    expect((await request(app).get(`${BASE}/quittances/pas-un-id/fichier`).set(as(USER_AWA))).status).toBe(404);
  });

  it('le document de l’agence B se lit en choisissant l’agence B', async () => {
    const res = await request(app)
      .get(`${BASE}/quittances/${R_LB}/fichier`)
      .set(as(USER_AWA, TENANT_B))
      .buffer(true)
      .parse(binary);
    expect(res.status).toBe(200);
    expect(res.body.toString()).toBe('%PDF-COCODY');
  });
});

// ---------------------------------------------------------------------------
// Relevé PDF
// ---------------------------------------------------------------------------

describe('GET /lots/:lotId/releve', () => {
  it('produit le relevé PDF de son lot', async () => {
    const res = await request(app)
      .get(`${BASE}/lots/${L1}/releve?from=2026-01-01&to=2026-12-31`)
      .set(as(USER_AWA))
      .buffer(true)
      .parse(binary);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe("attachment; filename*=UTF-8''Releve%20lot%20A1.pdf");
    expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('lot sans compte : relevé vide, et le compte n’est pas créé', async () => {
    const res = await request(app).get(`${BASE}/lots/${L3}/releve`).set(as(USER_AWA)).buffer(true).parse(binary);

    expect(res.status).toBe(200);
    expect(mockPrisma.ownerAccount.rows).toHaveLength(1);
  });

  it('404 identique pour un lot d’un autre copropriétaire ou d’une autre agence ; 400 sur une période inversée', async () => {
    const missing = await request(app)
      .get(`${BASE}/lots/${id(999)}/releve`)
      .set(as(USER_AWA));
    for (const lotId of [L2, LB]) {
      const res = await request(app).get(`${BASE}/lots/${lotId}/releve`).set(as(USER_AWA));
      expect(res.status).toBe(404);
      expect(res.body.message).toBe(missing.body.message);
    }
    const inverted = await request(app)
      .get(`${BASE}/lots/${L1}/releve?from=2026-03-01&to=2026-01-01`)
      .set(as(USER_AWA));
    expect(inverted.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Suivi mensuel
// ---------------------------------------------------------------------------

describe('GET /lots/:lotId/suivi-mensuel', () => {
  it('rend la ligne de SON lot : mois réglés, en retard, sans appel', async () => {
    const res = await request(app).get(`${BASE}/lots/${L1}/suivi-mensuel?year=2026`).set(as(USER_AWA));

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data).toMatchObject({
      year: 2026,
      currency: 'XOF',
      lot: { id: L1, lotNumber: 'A1' },
      syndicate: { id: S1, name: 'Résidence Les Acacias' },
      advance: 10000,
      totals: { due: 90000, paid: 40000, outstanding: 50000 }
    });
    expect(data.months).toHaveLength(12);
    expect(data.months[0]).toEqual({ month: 1, due: 30000, paid: 30000, status: 'PAID' });
    expect(data.months[1]).toEqual({ month: 2, due: 30000, paid: 10000, status: 'OVERDUE' });
    expect(data.months[3]).toEqual({ month: 4, due: 0, paid: 0, status: 'NONE' });
    // Seulement ce lot : aucune trace du lot de Bakary dans la même copropriété.
    expect(JSON.stringify(res.body)).not.toContain(L2);
    expect(data.lots).toBeUndefined();
  });

  it('année courante par défaut ; 400 sur une année invalide', async () => {
    const res = await request(app).get(`${BASE}/lots/${L1}/suivi-mensuel`).set(as(USER_AWA));
    expect(res.status).toBe(200);
    expect(res.body.data.year).toBe(new Date().getUTCFullYear());
    expect((await request(app).get(`${BASE}/lots/${L1}/suivi-mensuel?year=20x6`).set(as(USER_AWA))).status).toBe(400);
  });

  it('404 identique pour un lot d’un autre copropriétaire ou d’une autre agence', async () => {
    const missing = await request(app)
      .get(`${BASE}/lots/${id(999)}/suivi-mensuel`)
      .set(as(USER_AWA));
    for (const lotId of [L2, LB]) {
      const res = await request(app).get(`${BASE}/lots/${lotId}/suivi-mensuel`).set(as(USER_AWA));
      expect(res.status).toBe(404);
      expect(res.body.message).toBe(missing.body.message);
    }
  });
});

// ---------------------------------------------------------------------------
// Fiche copropriété et logos
// ---------------------------------------------------------------------------

describe('GET /coproprietes/:syndicId', () => {
  it('fiche avec le mandant comme émetteur, le contact du syndic, sans données internes', async () => {
    const res = await request(app).get(`${BASE}/coproprietes/${S1}`).set(as(USER_AWA));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      id: S1,
      name: 'Résidence Les Acacias',
      address: 'Plateau',
      registrationNo: 'IMM-001',
      cadastralReference: 'CAD-42',
      lotCount: 2,
      myLots: [{ id: L1, lotNumber: 'A1', lotType: 'APARTMENT' }],
      issuer: {
        kind: 'MANDANT',
        name: 'Cabinet Mandant',
        address: 'Plateau, rue 12',
        phone: '0102030405',
        email: 'mandant@example.com'
      },
      syndicContact: { name: 'Mariam Test', email: 'mariam@example.com' },
      hasLogo: true,
      logoDownloadPath: `/portal/copropriete/coproprietes/${S1}/logo`,
      hasIssuerLogo: true,
      issuerLogoDownloadPath: `/portal/copropriete/coproprietes/${S1}/logo-emetteur`
    });
    const text = JSON.stringify(res.body);
    for (const forbidden of ['branding/', 'signature', 'stamp', 'RCCM-INTERNE', 'NCC-INTERNE', 'Bakary']) {
      expect(text).not.toContain(forbidden);
    }
    expectClean(res.body);
  });

  it('sans mandant : l’agence émet ; un contact de syndic d’une autre agence ne sort pas', async () => {
    const res = await request(app).get(`${BASE}/coproprietes/${S2}`).set(as(USER_AWA));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      issuer: { kind: 'AGENCY', name: 'Agence Plateau', email: 'contact@plateau.ci' },
      syndicContact: null,
      hasLogo: false,
      logoDownloadPath: null,
      hasIssuerLogo: false,
      issuerLogoDownloadPath: null
    });
    expect(JSON.stringify(res.body)).not.toContain('Intrus');
  });

  it('404 identique : copropriété sans lot à lui, d’une autre agence, inexistante, identifiant invalide', async () => {
    const missing = await request(app)
      .get(`${BASE}/coproprietes/${id(999)}`)
      .set(as(USER_AWA));
    expect(missing.status).toBe(404);
    const cases = [
      request(app).get(`${BASE}/coproprietes/${S2}`).set(as(USER_BAKARY)),
      request(app).get(`${BASE}/coproprietes/${SB}`).set(as(USER_AWA)),
      request(app).get(`${BASE}/coproprietes/pas-un-id`).set(as(USER_AWA))
    ];
    for (const res of await Promise.all(cases)) {
      expect(res.status).toBe(404);
      expect(res.body.message).toBe(missing.body.message);
    }
  });
});

describe('GET /coproprietes/:syndicId/logo et /logo-emetteur', () => {
  it('sert le logo de la copropriété et celui du mandant', async () => {
    for (const suffix of ['logo', 'logo-emetteur']) {
      const res = await request(app)
        .get(`${BASE}/coproprietes/${S1}/${suffix}`)
        .set(as(USER_AWA))
        .buffer(true)
        .parse(binary);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/png');
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(Buffer.compare(res.body, PNG)).toBe(0);
    }
  });

  it('sans mandant, le logo émetteur est celui de l’agence', async () => {
    await writeUpload(`properties/agency-logos/${TENANT_A}/logo.png`, PNG);
    mockPrisma.tenant.rows[0].logoUrl = `/uploads/properties/agency-logos/${TENANT_A}/logo.png`;

    const card = await request(app).get(`${BASE}/coproprietes/${S2}`).set(as(USER_AWA));
    expect(card.body.data.hasIssuerLogo).toBe(true);
    const res = await request(app)
      .get(`${BASE}/coproprietes/${S2}/logo-emetteur`)
      .set(as(USER_AWA))
      .buffer(true)
      .parse(binary);
    expect(res.status).toBe(200);
    expect(Buffer.compare(res.body, PNG)).toBe(0);
  });

  it('404 sans logo, ou pour une copropriété hors de son périmètre', async () => {
    expect((await request(app).get(`${BASE}/coproprietes/${S2}/logo`).set(as(USER_AWA))).status).toBe(404);
    expect((await request(app).get(`${BASE}/coproprietes/${S2}/logo-emetteur`).set(as(USER_AWA))).status).toBe(404);
    expect((await request(app).get(`${BASE}/coproprietes/${S1}/logo`).set(as(USER_BAKARY))).status).toBe(200);
    expect((await request(app).get(`${BASE}/coproprietes/${S2}/logo`).set(as(USER_BAKARY))).status).toBe(404);
    expect((await request(app).get(`${BASE}/coproprietes/${SB}/logo`).set(as(USER_AWA))).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Garde : agence choisie
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Ancien propriétaire : rien d'avant l'acquisition (audit S5)
// ---------------------------------------------------------------------------

const statementMock = buildOwnerAccountStatementPdf as jest.MockedFunction<typeof buildOwnerAccountStatementPdf>;

/** Awa n'a acquis le lot L1 qu'à cette date. */
function acquiredOn(day: string) {
  const profile = mockPrisma.lotOwnerProfile.rows.find((row: any) => row.id === 'p-1');
  if (!profile) throw new Error('profil p-1 absent');
  profile.ownedSince = new Date(day);
}

describe('Historique de l’ancien propriétaire du lot', () => {
  beforeEach(() => statementMock.mockClear());

  it('/paiements et avances : rien avant l’acquisition', async () => {
    acquiredOn('2026-01-10');
    mockPrisma.chargePayment.rows.push({
      id: id(499),
      lotId: L1,
      chargeCallId: null,
      amount: 7000,
      unallocatedAmount: 7000,
      paidAt: new Date('2026-01-05'),
      method: 'CASH',
      reference: 'ANCIEN-REF',
      createdAt: new Date('2026-01-05')
    });

    const res = await request(app).get(`${BASE}/paiements?lotId=${L1}`).set(as(USER_AWA));
    expect(res.status).toBe(200);
    expect(res.body.data.items.map((item: any) => item.id)).toEqual([PAY_L1]);
    expect(res.body.data.advances[0].advance).toBe(10000);
    expect(JSON.stringify(res.body)).not.toContain('ANCIEN-REF');

    const previousYear = await request(app).get(`${BASE}/paiements?year=2025`).set(as(USER_AWA));
    expect(previousYear.body.data.items).toEqual([]);
  });

  it('/appels : seulement les appels postérieurs à l’acquisition, lot par lot', async () => {
    acquiredOn('2026-01-10');
    const call = (callId: string, dueDate: string) => ({
      id: callId,
      syndicateId: S1,
      lotId: L1,
      period: `libre ${dueDate}`,
      periodStart: null,
      periodEnd: null,
      amount: 1000,
      currency: 'XOF',
      dueDate: new Date(dueDate),
      status: 'PENDING',
      createdAt: new Date(dueDate)
    });
    // Sans bornes : l'échéance décide. Avec bornes : le début de période.
    mockPrisma.chargeCall.rows.push(call(id(310), '2026-03-15'), call(id(311), '2026-01-05'));
    mockPrisma.chargeCall.rows.push({
      ...call(id(312), '2026-12-31'),
      syndicateId: S2,
      lotId: L3,
      periodStart: new Date('2025-06-01'),
      periodEnd: new Date('2025-06-30')
    });

    const res = await request(app).get(`${BASE}/appels`).set(as(USER_AWA));
    expect(res.status).toBe(200);
    // CALL_L1 (période du 01/01, échéance 31/01) et CALL_L1_2025 précèdent l'acquisition.
    // L3 est détenu depuis 2025-01-01 : son appel de juin 2025 reste visible.
    expect(res.body.data.map((row: any) => row.id).sort()).toEqual([id(310), id(312)].sort());

    const lot = await request(app).get(`${BASE}/appels?lotId=${L1}`).set(as(USER_AWA));
    expect(lot.body.data.map((row: any) => row.id)).toEqual([id(310)]);
  });

  it('ownedChargeCallsWhere : un appel antérieur ne correspond pas, comme un appel inconnu', async () => {
    acquiredOn('2026-01-10');
    const req: any = { user: { userId: USER_AWA }, headers: {} };
    await requireCoOwnerPortalAccess(req, {} as any, jest.fn());
    const where = ownedChargeCallsWhere(req.coOwnerPortal.scope, [L1]);
    const byId = (callId: string) => {
      const row = mockPrisma.chargeCall.rows.find((candidate: any) => candidate.id === callId);
      if (!row) throw new Error(`appel ${callId} absent`);
      return row;
    };

    expect(matchesWhere(byId(CALL_L1), { id: CALL_L1, ...where })).toBe(false);
    expect(matchesWhere(byId(CALL_L2), { id: CALL_L2, ...where })).toBe(false);
    expect(matchesWhere(byId(CALL_LB), { id: CALL_LB, ...where })).toBe(false);
    // Témoin : un appel sans bornes, échu après l'acquisition, correspond.
    const later = { id: 'x', syndicateId: S1, lotId: L1, periodStart: null, dueDate: new Date('2026-03-01') };
    expect(matchesWhere(later, { id: 'x', ...where })).toBe(true);
  });

  it('/lots/:lotId/compte : mouvements depuis l’acquisition seulement', async () => {
    acquiredOn('2026-01-10');
    const res = await request(app).get(`${BASE}/lots/${L1}/compte`).set(as(USER_AWA));
    expect(res.status).toBe(200);
    expect(res.body.data.transactions.map((tx: any) => tx.id)).toEqual(['tx-2']);
  });

  it('/suivi-mensuel : année antérieure → 404 identique ; mois antérieurs vidés', async () => {
    acquiredOn('2026-02-10');
    const missing = await request(app)
      .get(`${BASE}/lots/${id(999)}/suivi-mensuel?year=2025`)
      .set(as(USER_AWA));
    const before = await request(app).get(`${BASE}/lots/${L1}/suivi-mensuel?year=2025`).set(as(USER_AWA));
    expect(before.status).toBe(404);
    expect(before.body.message).toBe(missing.body.message);

    const res = await request(app).get(`${BASE}/lots/${L1}/suivi-mensuel?year=2026`).set(as(USER_AWA));
    expect(res.status).toBe(200);
    expect(res.body.data.ownedSince).toBe('2026-02-10');
    expect(res.body.data.months[0]).toEqual({ month: 1, due: 0, paid: 0, status: 'NONE' });
    // CALL_L1 (période commencée le 01/01) est l'appel de l'ancien propriétaire :
    // ni février ni mars ne le reprennent, même partiellement (audit S5).
    expect(res.body.data.months[1]).toEqual({ month: 2, due: 0, paid: 0, status: 'NONE' });
    expect(res.body.data.months[2]).toEqual({ month: 3, due: 0, paid: 0, status: 'NONE' });
    expect(res.body.data.totals).toEqual({ due: 0, paid: 0, outstanding: 0 });
    // Le paiement du 15/01 précède l'acquisition : son avance n'est pas la sienne.
    expect(res.body.data.advance).toBe(0);
  });

  it('/suivi-mensuel : un appel annuel de l’ancien propriétaire ne s’étale pas après l’acquisition', async () => {
    acquiredOn('2026-07-01');
    const CALL_ANNUAL = id(320);
    const CALL_SEPT = id(321);
    const PAY_PREVIOUS = id(420);
    const PAY_SEPT = id(421);
    const call = (callId: string, extra: any) => ({
      id: callId,
      syndicateId: S1,
      lotId: L1,
      currency: 'XOF',
      status: 'PARTIAL',
      createdAt: new Date('2026-01-01'),
      ...extra
    });
    mockPrisma.chargeCall.rows.push(
      // Appel annuel de l'ancien propriétaire, réglé en partie avant la vente.
      call(CALL_ANNUAL, {
        period: '2026',
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-12-31'),
        amount: 120000,
        dueDate: new Date('2026-01-31')
      }),
      // Appel d'Awa, postérieur à l'acquisition, réglé.
      call(CALL_SEPT, {
        period: '2026-09',
        periodStart: new Date('2026-09-01'),
        periodEnd: new Date('2026-09-30'),
        amount: 10000,
        dueDate: new Date('2026-09-30')
      })
    );
    const payment = (paymentId: string, amount: number, paidAt: string) => ({
      id: paymentId,
      lotId: L1,
      chargeCallId: null,
      amount,
      unallocatedAmount: 0,
      paidAt: new Date(paidAt),
      method: 'CASH',
      reference: null,
      createdAt: new Date(paidAt)
    });
    mockPrisma.chargePayment.rows.push(
      payment(PAY_PREVIOUS, 50000, '2026-03-01'),
      payment(PAY_SEPT, 10000, '2026-09-15')
    );
    mockPrisma.chargePaymentAllocation.rows.push(
      {
        id: 'a-prev',
        paymentId: PAY_PREVIOUS,
        chargeCallId: CALL_ANNUAL,
        amount: 50000,
        source: 'PAYMENT',
        createdAt: new Date('2026-03-01')
      },
      {
        id: 'a-sept',
        paymentId: PAY_SEPT,
        chargeCallId: CALL_SEPT,
        amount: 10000,
        source: 'PAYMENT',
        createdAt: new Date('2026-09-15')
      }
    );

    const res = await request(app).get(`${BASE}/lots/${L1}/suivi-mensuel?year=2026`).set(as(USER_AWA));
    expect(res.status).toBe(200);
    const months = res.body.data.months;
    // Juillet à décembre : rien de l'appel annuel (ni dû, ni payé, ni statut).
    for (const month of [7, 8, 10, 11, 12]) {
      expect(months[month - 1]).toEqual({ month, due: 0, paid: 0, status: 'NONE' });
    }
    // L'appel postérieur à l'acquisition reste affiché.
    expect(months[8]).toEqual({ month: 9, due: 10000, paid: 10000, status: 'PAID' });
    expect(res.body.data.totals).toEqual({ due: 10000, paid: 10000, outstanding: 0 });
    expect(res.body.data.advance).toBe(0);
  });

  it('/releve : période ramenée à l’acquisition, ouverture au solde de cette date', async () => {
    acquiredOn('2026-01-10');
    const res = await request(app)
      .get(`${BASE}/lots/${L1}/releve?from=2025-01-01`)
      .set(as(USER_AWA))
      .buffer(true)
      .parse(binary);

    expect(res.status).toBe(200);
    const [payload] = statementMock.mock.calls[0];
    expect(payload.transactions.map(tx => tx.label)).toEqual(['Paiement']);
    expect(payload.openingBalance).toBe(90000);
    expect(payload.closingBalance).toBe(50000);
    expect(payload.ownerName).toBe('Awa Test');
  });

  it('/quittances : un document sans destinataire antérieur à l’acquisition est invisible, son fichier 404', async () => {
    acquiredOn('2026-01-10');
    const R_NULL_BEFORE = id(506);
    const R_NULL_AFTER = id(507);
    const R_NULL_OLD_PERIOD = id(508);
    const orphan = (receiptId: string, number: string, extra: any) => ({
      id: receiptId,
      tenantId: TENANT_A,
      syndicateId: S1,
      lotId: L1,
      contactId: null,
      kind: 'RECEIPT',
      number,
      issuerKey: MANDANT,
      chargePaymentId: null,
      chargeCallId: null,
      periodStart: null,
      periodEnd: null,
      periodLabel: null,
      amount: 7000,
      currency: 'XOF',
      snapshot: snapshot('RECEIPT', number, 'Sans destinataire'),
      // Pas de fichier : le 404 ne peut venir que du périmètre.
      filePath: null,
      issuedAt: new Date('2026-02-01'),
      emailedAt: null,
      createdById: 'user-mariam',
      ...extra
    });
    mockPrisma.syndicChargeReceipt.rows.push(
      // Émis avant l'acquisition : paiement de l'ancien propriétaire.
      orphan(R_NULL_BEFORE, 'R-2026-000090', { issuedAt: new Date('2026-01-05') }),
      // Émis après l'acquisition, sans période : le sien.
      orphan(R_NULL_AFTER, 'R-2026-000091', {}),
      // Émis après, mais sur une période commencée avant l'acquisition.
      orphan(R_NULL_OLD_PERIOD, 'Q-2026-000092', {
        kind: 'QUITTANCE',
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-01-31'),
        periodLabel: '2026-01'
      })
    );

    const list = await request(app).get(`${BASE}/quittances?lotId=${L1}`).set(as(USER_AWA));
    expect(list.status).toBe(200);
    const ids = list.body.data.items.map((item: any) => item.id);
    expect(ids).toContain(R_NULL_AFTER);
    expect(ids).not.toContain(R_NULL_BEFORE);
    expect(ids).not.toContain(R_NULL_OLD_PERIOD);
    // Les documents émis à SA fiche restent visibles, même sur une période antérieure.
    expect(ids).toContain(R_L1_QUITTANCE);

    const missing = await request(app)
      .get(`${BASE}/quittances/${id(999)}/fichier`)
      .set(as(USER_AWA));
    for (const receiptId of [R_NULL_BEFORE, R_NULL_OLD_PERIOD]) {
      const res = await request(app).get(`${BASE}/quittances/${receiptId}/fichier`).set(as(USER_AWA));
      expect(res.status).toBe(404);
      expect(res.body.message).toBe(missing.body.message);
    }
    const after = await request(app)
      .get(`${BASE}/quittances/${R_NULL_AFTER}/fichier`)
      .set(as(USER_AWA))
      .buffer(true)
      .parse(binary);
    expect(after.status).toBe(200);
    expect(after.body.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('/paiements : un reçu sans destinataire antérieur à l’acquisition n’est pas rattaché au paiement', async () => {
    acquiredOn('2026-01-10');
    mockPrisma.syndicChargeReceipt.rows.push({
      id: id(509),
      tenantId: TENANT_A,
      syndicateId: S1,
      lotId: L1,
      contactId: null,
      kind: 'RECEIPT',
      number: 'R-2026-000093',
      issuerKey: MANDANT,
      chargePaymentId: PAY_L1,
      chargeCallId: null,
      periodStart: null,
      periodEnd: null,
      periodLabel: null,
      amount: 50000,
      currency: 'XOF',
      snapshot: snapshot('RECEIPT', 'R-2026-000093', 'Sans destinataire'),
      filePath: null,
      issuedAt: new Date('2026-01-09'),
      emailedAt: null,
      createdById: 'user-mariam'
    });

    const res = await request(app).get(`${BASE}/paiements?lotId=${L1}`).set(as(USER_AWA));
    expect(res.status).toBe(200);
    expect(res.body.data.items[0].documents.map((doc: any) => doc.id)).toEqual([R_L1_RECEIPT]);
  });
});

describe('Relevé du portail : mêmes soldes que l’écran du compte', () => {
  beforeEach(() => statementMock.mockClear());

  it('deux mouvements saisis dans le désordre : soldes du relevé identiques à ceux de l’écran', async () => {
    // Saisi en premier mais daté après l'autre : le solde stocké suit la saisie.
    mockPrisma.ownerAccountTransaction.rows.push(
      {
        id: 'tx-late',
        accountId: ACCOUNT_L1,
        transactionDate: new Date('2026-02-28'),
        createdAt: new Date('2026-02-10'),
        type: 'CHARGE_CALL',
        label: 'Appel T2',
        debit: 30000,
        credit: null,
        balanceAfter: 80000
      },
      {
        id: 'tx-early',
        accountId: ACCOUNT_L1,
        transactionDate: new Date('2026-02-05'),
        createdAt: new Date('2026-02-20'),
        type: 'PAYMENT',
        label: 'Versement tardif',
        debit: null,
        credit: 20000,
        balanceAfter: 60000
      }
    );

    const screen = await request(app).get(`${BASE}/lots/${L1}/compte`).set(as(USER_AWA));
    expect(screen.status).toBe(200);
    const screenBalances = new Map<string, number>(
      screen.body.data.transactions.map((tx: any) => [tx.label, tx.balanceAfter])
    );

    const res = await request(app).get(`${BASE}/lots/${L1}/releve`).set(as(USER_AWA)).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    const [payload] = statementMock.mock.calls[0];
    expect(payload.transactions.map(tx => tx.label)).toEqual(['Appel T1', 'Paiement', 'Versement tardif', 'Appel T2']);
    for (const tx of payload.transactions) {
      expect(tx.balanceAfter).toBe(screenBalances.get(tx.label));
    }
    expect(payload.transactions.map(tx => tx.balanceAfter)).toEqual([90000, 50000, 30000, 60000]);
    expect(payload.openingBalance).toBe(0);
    expect(payload.closingBalance).toBe(60000);
  });

  it('période sans mouvement : ouverture et clôture au solde chronologique d’avant la période', async () => {
    mockPrisma.ownerAccountTransaction.rows.push({
      id: 'tx-late',
      accountId: ACCOUNT_L1,
      transactionDate: new Date('2026-02-28'),
      createdAt: new Date('2026-01-10'),
      type: 'CHARGE_CALL',
      label: 'Appel T2',
      debit: 30000,
      credit: null,
      // Saisi entre tx-1 et tx-2 : solde stocké 120 000, chronologiquement 80 000.
      balanceAfter: 120000
    });

    await request(app)
      .get(`${BASE}/lots/${L1}/releve?from=2026-06-01&to=2026-06-30`)
      .set(as(USER_AWA))
      .buffer(true)
      .parse(binary);

    const [payload] = statementMock.mock.calls[0];
    expect(payload.transactions).toEqual([]);
    expect(payload.openingBalance).toBe(80000);
    expect(payload.closingBalance).toBe(80000);
  });
});

describe('Relevé du portail : informatif et récent', () => {
  beforeEach(() => statementMock.mockClear());

  it('ni signature ni cachet, logos conservés', async () => {
    const res = await request(app).get(`${BASE}/lots/${L1}/releve`).set(as(USER_AWA)).buffer(true).parse(binary);

    expect(res.status).toBe(200);
    const branding = statementMock.mock.calls[0][1];
    expect(branding).toBeTruthy();
    expect(branding?.signature).toBeNull();
    expect(branding?.stamp).toBeNull();
    expect(branding?.issuerLogo).not.toBeNull();
    expect(branding?.syndicate?.logo).not.toBeNull();
  });

  it('imprime les 30 lignes les plus récentes, ouverture au solde qui les précède', async () => {
    // 40 versements de 1 000 après les deux mouvements existants (solde 50 000).
    for (let n = 1; n <= 40; n += 1) {
      const day = new Date(Date.UTC(2026, 1, 1) + n * 24 * 60 * 60 * 1000);
      mockPrisma.ownerAccountTransaction.rows.push({
        id: `tx-extra-${n}`,
        accountId: ACCOUNT_L1,
        transactionDate: day,
        createdAt: day,
        type: 'PAYMENT',
        label: `Versement ${n}`,
        debit: null,
        credit: 1000,
        balanceAfter: 50000 - n * 1000
      });
    }

    await request(app).get(`${BASE}/lots/${L1}/releve`).set(as(USER_AWA)).buffer(true).parse(binary);

    const [payload] = statementMock.mock.calls[0];
    expect(payload.transactions).toHaveLength(30);
    expect(payload.transactions[0].label).toBe('Versement 11');
    expect(payload.transactions[29].label).toBe('Versement 40');
    // Solde avant « Versement 11 » = solde après « Versement 10 ».
    expect(payload.openingBalance).toBe(40000);
    expect(payload.closingBalance).toBe(10000);
  });
});

describe('Garde du portail sur les nouvelles routes', () => {
  const routes = [
    '/paiements',
    '/quittances',
    `/quittances/${R_L1_RECEIPT}/fichier`,
    `/lots/${L1}/releve`,
    `/lots/${L1}/suivi-mensuel`,
    `/coproprietes/${S1}`,
    `/coproprietes/${S1}/logo`,
    `/coproprietes/${S1}/logo-emetteur`
  ];

  it('403 avec X-Portal-Tenant-Id d’une agence où il n’est pas copropriétaire', async () => {
    for (const route of routes) {
      expect((await request(app).get(`${BASE}${route}`).set(as(USER_AWA, TENANT_C))).status).toBe(403);
      expect((await request(app).get(`${BASE}${route}`).set(as(USER_BAKARY, TENANT_B))).status).toBe(403);
    }
  });

  it('401 sans session', async () => {
    for (const route of routes) {
      expect((await request(app).get(`${BASE}${route}`)).status).toBe(401);
    }
  });

  it('dans l’agence B, les identifiants de l’agence A répondent 404', async () => {
    for (const route of routes) {
      expect((await request(app).get(`${BASE}${route}`).set(as(USER_AWA, TENANT_B))).status).toBe(
        route === '/paiements' || route === '/quittances' ? 200 : 404
      );
    }
  });
});

// En dernier : le limiteur garde ses compteurs en mémoire pour tout le fichier.
describe('Limiteur des routes PDF du portail', () => {
  it('30 par minute et par utilisateur, puis 429', async () => {
    const route = `${BASE}/quittances/${id(998)}/fichier`;
    for (let n = 0; n < 30; n += 1) {
      expect((await request(app).get(route).set(as(USER_BAKARY))).status).toBe(404);
    }
    expect((await request(app).get(route).set(as(USER_BAKARY))).status).toBe(429);
    expect((await request(app).get(`${BASE}/lots/${L2}/releve`).set(as(USER_BAKARY))).status).toBe(429);
    // Un autre utilisateur garde son propre quota ; les routes JSON ne sont pas limitées.
    expect((await request(app).get(route).set(as(USER_AWA))).status).toBe(404);
    expect((await request(app).get(`${BASE}/quittances`).set(as(USER_BAKARY))).status).toBe(200);
  });
});
