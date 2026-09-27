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
import { createFakePrisma } from '../helpers/fake-prisma';
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

import coOwnerPortalRoutes from '../../src/routes/coowner-portal-routes';
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
    expect(res.headers['content-disposition']).toBe("attachment; filename*=UTF-8''Recu%20R-2026-000001.pdf");
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
      syndicContact: { name: 'Mariam Test', email: 'mariam@example.com', phone: '0700000000' },
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
