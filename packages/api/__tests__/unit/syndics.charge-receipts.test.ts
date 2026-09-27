/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Lot S3 — reçus de paiement et quittances de charges, sur une base en
 * mémoire qui applique vraiment les filtres `where`
 * (`__tests__/helpers/fake-prisma.ts`).
 *
 * Jeu de données :
 *   Agence A — copropriété S1 (sans mandant) : lots L1 (Awa) et L2 (Bakary) ;
 *              copropriété S2 (mandant M1) : lot L3 (Awa).
 *   Agence B — copropriété SB : lot LB.
 */

import * as path from 'path';
import { promises as fs } from 'fs';
import { PDFDocument } from 'pdf-lib';
import { createFakePrisma } from '../helpers/fake-prisma';

const mockPrisma = createFakePrisma();
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

// Les PDF sont écrits dans un dossier temporaire propre à cette suite.
const mockUploadsDir = require('path').join(require('os').tmpdir(), `immotopia-s3-${process.pid}-${Date.now()}`);
jest.mock('../../src/config/env', () => {
  const actual = jest.requireActual('../../src/config/env');
  return { ...actual, env: { ...actual.env, UPLOADS_DIR: mockUploadsDir } };
});

const mockSendEmail = jest.fn(async (_params: any) => undefined);
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendEmail: (params: any) => mockSendEmail(params) }
}));
const mockEmailConfig = jest.fn(async (_tenantId: string, _key: string) => ({
  enabled: true,
  subjectOverride: null as string | null,
  bodyHtmlOverride: null as string | null
}));
jest.mock('../../src/services/email-notification-config-service', () => ({
  getEmailNotificationConfig: (tenantId: string, key: string) => mockEmailConfig(tenantId, key)
}));
jest.mock('../../src/services/whatsapp-notification-send-service', () => ({
  sendWhatsappNotification: jest.fn(async () => false)
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), flushAuditQueue: jest.fn() }));

import { recordLotPayment, type LotPaymentInput } from '../../src/lib/syndics/charge-allocation';
import { createChargeCallAndUpdateStatus, recordChargePaymentWithStatusUpdate } from '../../src/lib/syndics/queries';
import { settledCallIds, shouldIssueReceipt } from '../../src/lib/syndics/charge-receipts';
import { formatChargeReceiptNumber, nextChargeReceiptNumberTx } from '../../src/lib/syndics/charge-receipt-numbering';
import { deliverChargeDocuments } from '../../src/lib/syndics/charge-receipt-delivery';
import {
  backfillMissingQuittances,
  getReceiptFile,
  listLotReceipts,
  listSyndicateReceipts,
  MAX_DOCUMENTS_PER_PRINT,
  printReceipts,
  resendReceiptEmail
} from '../../src/lib/syndics/charge-receipt-queries';
import {
  gridCells,
  renderChargeReceiptPdf,
  renderChargeReceiptSheets,
  sheetCount
} from '../../src/lib/syndics/charge-receipt-pdf';
import type { ChargeReceiptSnapshot } from '../../src/lib/syndics/charge-receipt-snapshot';
import { findDiskPathLeaks } from '../helpers/disk-path-leaks';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const S1 = id(1);
const S2 = id(2);
const SB = id(3);
const L1 = id(11);
const L2 = id(12);
const L3 = id(13);
const LB = id(14);
const M1 = id(21);
const AWA = 'contact-awa';
const BAKARY = 'contact-bakary';
const YEAR = new Date().getUTCFullYear();
const d = (value: string) => new Date(`${value}T00:00:00.000Z`);

const syndicates: Record<string, { tenantId: string; name: string; mandatingAgencyId?: string }> = {
  [S1]: { tenantId: TENANT_A, name: 'Residence Les Palmiers' },
  [S2]: { tenantId: TENANT_A, name: 'Residence Les Cocotiers', mandatingAgencyId: M1 },
  [SB]: { tenantId: TENANT_B, name: 'Residence B' }
};

function linkOnCreate(model: any, augment: (row: any) => void) {
  const original = model.create.getMockImplementation();
  model.create.mockImplementation(async (args: any) => {
    const result = await original(args);
    augment(model.rows[model.rows.length - 1]);
    return result;
  });
}

const contacts: Record<string, any> = {
  [AWA]: {
    id: AWA,
    tenantId: TENANT_A,
    firstName: 'Awa',
    lastName: 'Kone',
    legalName: null,
    email: 'awa@example.test',
    address: 'Cocody'
  },
  [BAKARY]: {
    id: BAKARY,
    tenantId: TENANT_A,
    firstName: 'Bakary',
    lastName: 'Traore',
    legalName: null,
    email: '',
    address: null
  }
};

function lotRow(lotId: string, syndicateId: string, lotNumber: string, owner: any) {
  return {
    id: lotId,
    syndicateId,
    lotNumber,
    lotType: 'APARTMENT',
    ownerContactId: owner?.id ?? null,
    owner,
    coowner: null,
    syndicate: { tenantId: syndicates[syndicateId].tenantId }
  };
}

function seed() {
  mockPrisma.reset();
  mockSendEmail.mockReset();
  mockSendEmail.mockImplementation(async () => undefined);
  mockEmailConfig.mockReset();
  mockEmailConfig.mockImplementation(async () => ({ enabled: true, subjectOverride: null, bodyHtmlOverride: null }));
  for (const [syndicId, info] of Object.entries(syndicates)) {
    mockPrisma.syndicate.rows.push({
      id: syndicId,
      tenantId: info.tenantId,
      name: info.name,
      address: 'Abidjan',
      registrationNo: 'IMM-001',
      cadastralReference: null,
      status: 'ACTIVE',
      mandatingAgencyId: info.mandatingAgencyId ?? null,
      mandatingAgency: info.mandatingAgencyId
        ? {
            name: 'Cabinet Mandant',
            legalName: null,
            address: 'Plateau',
            phone: null,
            email: null,
            rccm: 'CI-ABJ-1',
            taxId: null
          }
        : null
    });
  }
  mockPrisma.tenant.rows.push(
    { id: TENANT_A, name: 'Agence A', legalName: null, address: 'Rue 1', city: 'Abidjan', country: 'CI' },
    { id: TENANT_B, name: 'Agence B' }
  );
  mockPrisma.crmContact.rows.push(...Object.values(contacts).map(contact => ({ ...contact })));
  mockPrisma.syndicateLot.rows.push(
    lotRow(L1, S1, 'A-01', contacts[AWA]),
    lotRow(L2, S1, 'A-02', contacts[BAKARY]),
    lotRow(L3, S2, 'C-01', contacts[AWA]),
    lotRow(LB, SB, 'B-01', null)
  );
}

linkOnCreate(mockPrisma.chargeCall, row => {
  row.status = row.status ?? 'PENDING';
  row.syndicate = { tenantId: syndicates[row.syndicateId].tenantId, name: syndicates[row.syndicateId].name };
});

async function createCall(lotId: string, period: string, amount: number, dueDate: string, syndicateId = S1) {
  return createChargeCallAndUpdateStatus(syndicates[syndicateId].tenantId, {
    syndicateId,
    lotId,
    period,
    amount,
    currency: 'XOF',
    dueDate: d(dueDate)
  });
}

function pay(lotId: string, amount: number, paidAt: string, extra: Partial<LotPaymentInput> = {}): LotPaymentInput {
  return {
    tenantId: TENANT_A,
    syndicateId: S1,
    lotId,
    amount,
    paidAt: d(paidAt),
    method: 'VIREMENT',
    reference: 'VIR-42',
    actorUserId: 'user-1',
    ...extra
  };
}

const receipts = () => mockPrisma.syndicChargeReceipt.rows;
const receiptRow = (receiptId: string): any => receipts().find(row => row.id === receiptId);
const kinds = (documents: Array<{ kind: string }>) => documents.map(document => document.kind);

beforeEach(seed);

afterAll(async () => {
  await fs.rm(mockUploadsDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Règles pures
// ---------------------------------------------------------------------------

describe('regles pures (P5)', () => {
  it('shouldIssueReceipt : reste du, avance restante, ou avance pure', () => {
    expect(shouldIssueReceipt([0], 0)).toBe(false);
    expect(shouldIssueReceipt([0, 0], 0)).toBe(false);
    expect(shouldIssueReceipt([0, 500], 0)).toBe(true);
    expect(shouldIssueReceipt([0], 100)).toBe(true);
    expect(shouldIssueReceipt([], 0)).toBe(true);
  });

  it('settledCallIds : montant positif entierement regle', () => {
    expect(
      settledCallIds([
        { id: 'a', amountCents: 100, paidCents: 100 },
        { id: 'b', amountCents: 100, paidCents: 99 },
        { id: 'c', amountCents: 0, paidCents: 0 }
      ])
    ).toEqual(['a']);
  });
});

// ---------------------------------------------------------------------------
// Reçu ou quittance selon le solde
// ---------------------------------------------------------------------------

describe('emission a chaque paiement (P5)', () => {
  beforeEach(async () => {
    await createCall(L1, '2026-01', 10000, '2026-01-31');
    await createCall(L1, '2026-02', 10000, '2026-02-28');
  });

  it('solde exactement un appel -> une quittance seulement', async () => {
    const result = await recordLotPayment(pay(L1, 10000, '2026-01-10'));
    expect(kinds(result.documents)).toEqual(['QUITTANCE']);
    expect(result.documents[0].number).toBe(`Q-${YEAR}-000001`);
    const row = receiptRow(result.documents[0].id);
    expect(row).toMatchObject({ tenantId: TENANT_A, syndicateId: S1, lotId: L1, contactId: AWA, issuerKey: 'AGENCY' });
    expect(Number(row.amount)).toBe(10000);
    const snapshot: ChargeReceiptSnapshot = row.snapshot;
    expect(snapshot.call?.period.label).toBe('2026-01');
    expect(snapshot.call?.period.start).toBe('2026-01-01');
    expect(snapshot.settlements).toEqual([
      expect.objectContaining({ amount: 10000, method: 'VIREMENT', reference: 'VIR-42', source: 'PAYMENT' })
    ]);
    expect(snapshot.issuer).toMatchObject({ key: 'AGENCY', kind: 'AGENCY', name: 'Agence A' });
    expect(snapshot.coowner).toEqual({ name: 'Awa Kone', address: 'Cocody' });
  });

  it('solde deux appels -> deux quittances', async () => {
    const result = await recordLotPayment(pay(L1, 20000, '2026-01-10'));
    expect(kinds(result.documents)).toEqual(['QUITTANCE', 'QUITTANCE']);
    expect(result.documents.map(document => document.number)).toEqual([`Q-${YEAR}-000001`, `Q-${YEAR}-000002`]);
  });

  it('solde un appel et entame un autre -> une quittance et un recu', async () => {
    const result = await recordLotPayment(pay(L1, 15000, '2026-01-10'));
    expect(kinds(result.documents)).toEqual(['QUITTANCE', 'RECEIPT']);
    const receipt: ChargeReceiptSnapshot = receiptRow(result.documents[1].id).snapshot;
    expect(receipt.payment).toMatchObject({ amount: 15000, method: 'VIREMENT', reference: 'VIR-42' });
    expect(receipt.allocations.map(item => [item.period.label, item.allocated, item.outstandingAfter])).toEqual([
      ['2026-01', 10000, 0],
      ['2026-02', 5000, 5000]
    ]);
    expect(receipt.outstandingAfter).toBe(5000);
    expect(receipt.advance).toBe(0);
  });

  it('paiement partiel -> recu ; le complement solde l appel -> quittance seulement', async () => {
    const first = await recordLotPayment(pay(L1, 4000, '2026-01-10'));
    expect(kinds(first.documents)).toEqual(['RECEIPT']);
    const second = await recordLotPayment(pay(L1, 6000, '2026-01-20'));
    expect(kinds(second.documents)).toEqual(['QUITTANCE']);
    const quittance: ChargeReceiptSnapshot = receiptRow(second.documents[0].id).snapshot;
    expect(quittance.settlements.map(item => item.amount)).toEqual([4000, 6000]);
    expect(quittance.settledAt).toBe(d('2026-01-20').toISOString());
  });

  it('route historique « pay » : memes regles, documents dans la reponse', async () => {
    const janCall = mockPrisma.chargeCall.rows.find(row => row.period === '2026-01')!;
    const response: any = await recordChargePaymentWithStatusUpdate(TENANT_A, {
      chargeCallId: janCall.id,
      syndicateId: S1,
      amount: 12000,
      paidAt: d('2026-01-10'),
      method: 'ESPECES'
    });
    expect(response.documents.map((document: any) => document.kind)).toEqual(['QUITTANCE', 'RECEIPT']);
    expect(response.advance).toBe(0);
  });
});

describe('avance puis imputation (P5)', () => {
  it('avance pure -> recu ; chaque appel couvert plus tard -> quittance', async () => {
    const advance = await recordLotPayment(pay(L2, 25000, '2026-01-05'));
    expect(kinds(advance.documents)).toEqual(['RECEIPT']);
    const receipt: ChargeReceiptSnapshot = receiptRow(advance.documents[0].id).snapshot;
    expect(receipt.allocations).toEqual([]);
    expect(receipt.advance).toBe(25000);

    const jan: any = await createCall(L2, '2026-01', 10000, '2026-01-31');
    const feb: any = await createCall(L2, '2026-02', 10000, '2026-02-28');
    const mar: any = await createCall(L2, '2026-03', 10000, '2026-03-31');

    const quittances = receipts().filter(row => row.kind === 'QUITTANCE');
    expect(quittances.map(row => row.chargeCallId)).toEqual([jan.id, feb.id]);
    expect(quittances.map(row => row.number)).toEqual([`Q-${YEAR}-000001`, `Q-${YEAR}-000002`]);
    expect(quittances[0].snapshot.settlements).toEqual([expect.objectContaining({ source: 'ADVANCE', amount: 10000 })]);
    // Le troisieme appel n'est couvert qu'a moitie : pas de quittance.
    expect(receipts().some(row => row.chargeCallId === mar.id)).toBe(false);
  });

  it('une creation multi-lots emet la quittance du seul lot couvert', async () => {
    await recordLotPayment(pay(L2, 10000, '2026-01-05'));
    await createChargeCallAndUpdateStatus(TENANT_A, {
      syndicateId: S1,
      lotIds: [L1, L2],
      period: '2026-04',
      amount: 10000,
      currency: 'XOF',
      dueDate: d('2026-04-30')
    });
    const quittances = receipts().filter(row => row.kind === 'QUITTANCE');
    expect(quittances).toHaveLength(1);
    expect(quittances[0].lotId).toBe(L2);
  });
});

// ---------------------------------------------------------------------------
// Numérotation
// ---------------------------------------------------------------------------

describe('numerotation', () => {
  it('format Q-AAAA-NNNNNN / R-AAAA-NNNNNN', () => {
    expect(formatChargeReceiptNumber('QUITTANCE', 2026, 123)).toBe('Q-2026-000123');
    expect(formatChargeReceiptNumber('RECEIPT', 2026, 45)).toBe('R-2026-000045');
  });

  it('une serie par emetteur, par type et par annee, reservee par un upsert atomique', async () => {
    const tx: any = mockPrisma;
    const next = (issuerKey: string, kind: 'RECEIPT' | 'QUITTANCE', year: number) =>
      nextChargeReceiptNumberTx(tx, { tenantId: TENANT_A, issuerKey, kind, issuedAt: d(`${year}-06-01`) });
    expect(await next('AGENCY', 'QUITTANCE', 2026)).toBe('Q-2026-000001');
    expect(await next('AGENCY', 'QUITTANCE', 2026)).toBe('Q-2026-000002');
    expect(await next('AGENCY', 'RECEIPT', 2026)).toBe('R-2026-000001');
    expect(await next(M1, 'QUITTANCE', 2026)).toBe('Q-2026-000001');
    expect(await next('AGENCY', 'QUITTANCE', 2027)).toBe('Q-2027-000001');

    const sql = (mockPrisma.$queryRaw.mock.calls[0][0] as string[]).join('?');
    expect(sql).toMatch(/INSERT INTO syndic_receipt_sequences/);
    expect(sql).toMatch(/ON CONFLICT \(tenant_id, issuer_key, kind, year\) DO UPDATE/);
    expect(sql).toMatch(/RETURNING last_value/);
  });

  it('copropriete d un mandant : serie du mandant, distincte de celle de l agence', async () => {
    await createCall(L1, '2026-01', 1000, '2026-01-31');
    await createCall(L3, '2026-01', 1000, '2026-01-31', S2);
    const agency = await recordLotPayment(pay(L1, 1000, '2026-01-10'));
    const mandant = await recordLotPayment(pay(L3, 1000, '2026-01-10', { syndicateId: S2 }));
    expect(agency.documents[0].number).toBe(`Q-${YEAR}-000001`);
    expect(mandant.documents[0].number).toBe(`Q-${YEAR}-000001`);
    const row = receiptRow(mandant.documents[0].id);
    expect(row.issuerKey).toBe(M1);
    expect(row.snapshot.issuer).toMatchObject({ kind: 'MANDANT', name: 'Cabinet Mandant', rccm: 'CI-ABJ-1', key: M1 });
  });

  it('paiements concurrents (simulation) : numeros continus, sans doublon', async () => {
    // Des appels de 1000 sur deux lots ; 10 paiements lances ensemble.
    for (let month = 1; month <= 5; month += 1) {
      await createCall(L1, `2026-0${month}`, 1000, `2026-0${month}-28`);
      await createCall(L2, `2026-0${month}`, 1000, `2026-0${month}-28`);
    }
    // Chaque reservation cede la main avant de repondre : les transactions s'entrelacent.
    const original = mockPrisma.$queryRaw.getMockImplementation()!;
    mockPrisma.$queryRaw.mockImplementation(async (...args: any[]) => {
      await new Promise(resolve => setImmediate(resolve));
      return original(...(args as [TemplateStringsArray]));
    });
    const payments = await Promise.all(
      Array.from({ length: 10 }, (_, index) => recordLotPayment(pay(index % 2 ? L2 : L1, 1000, '2026-01-10')))
    );
    const numbers = payments.flatMap(payment => payment.documents.map(document => document.number)).sort();
    expect(numbers).toHaveLength(10);
    expect(new Set(numbers).size).toBe(10);
    expect(numbers).toEqual(
      Array.from({ length: 10 }, (_, index) => formatChargeReceiptNumber('QUITTANCE', YEAR, index + 1))
    );
  });
});

// ---------------------------------------------------------------------------
// PDF, e-mail
// ---------------------------------------------------------------------------

describe('livraison apres commit : PDF prive et e-mail', () => {
  beforeEach(async () => {
    await createCall(L1, '2026-01', 10000, '2026-01-31');
  });

  it('ecrit le PDF sous syndics/<id>/quittances et l envoie en piece jointe', async () => {
    const result = await recordLotPayment(pay(L1, 15000, '2026-01-10'));
    await deliverChargeDocuments(TENANT_A, result.documents);

    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    const receiptMail = mockSendEmail.mock.calls.find(([params]) => params.subject.startsWith('Reçu'))![0];
    expect(receiptMail.to).toBe('awa@example.test');
    expect(receiptMail.tenantId).toBe(TENANT_A);
    expect(receiptMail.attachments).toHaveLength(1);
    expect(receiptMail.attachments[0].filename).toBe(`Recu R-${YEAR}-000001.pdf`);
    expect(receiptMail.attachments[0].content.subarray(0, 5).toString()).toBe('%PDF-');
    expect(mockEmailConfig.mock.calls.map(([, key]) => key).sort()).toEqual([
      'CHARGE_CALL_SETTLED',
      'CHARGE_PAYMENT_RECEIPT'
    ]);

    for (const document of result.documents) {
      const row = receiptRow(document.id);
      expect(row.filePath).toBe(`/uploads/syndics/${S1}/quittances/${document.id}.pdf`);
      expect(row.emailedAt).toBeInstanceOf(Date);
      await expect(
        fs.stat(path.join(mockUploadsDir, 'syndics', S1, 'quittances', `${document.id}.pdf`))
      ).resolves.toBeTruthy();
    }
  });

  it('respecte la desactivation par l agence (le PDF reste produit)', async () => {
    mockEmailConfig.mockImplementation(async (_tenant, key) => ({
      enabled: key !== 'CHARGE_CALL_SETTLED',
      subjectOverride: null,
      bodyHtmlOverride: null
    }));
    const result = await recordLotPayment(pay(L1, 10000, '2026-01-10'));
    await deliverChargeDocuments(TENANT_A, result.documents);
    expect(mockSendEmail).not.toHaveBeenCalled();
    const row = receiptRow(result.documents[0].id);
    expect(row.emailedAt ?? null).toBeNull();
    expect(row.filePath).toBeTruthy();
  });

  it('un modele de l agence est applique, avec les valeurs echappees', async () => {
    contacts[AWA].firstName = '<b>Awa</b>';
    try {
      seed();
      await createCall(L1, '2026-01', 10000, '2026-01-31');
      mockEmailConfig.mockImplementation(async () => ({
        enabled: true,
        subjectOverride: 'Quittance {{number}}',
        bodyHtmlOverride: '<p>{{ownerName}}</p>'
      }));
      const result = await recordLotPayment(pay(L1, 10000, '2026-01-10'));
      await deliverChargeDocuments(TENANT_A, result.documents);
      expect(mockSendEmail.mock.calls[0][0].subject).toBe(`Quittance Q-${YEAR}-000001`);
      expect(mockSendEmail.mock.calls[0][0].html).toBe('<p>&lt;b&gt;Awa&lt;/b&gt; Kone</p>');
    } finally {
      contacts[AWA].firstName = 'Awa';
    }
  });

  it('un echec d e-mail est note sur le document et n annule pas le paiement', async () => {
    mockSendEmail.mockRejectedValue(new Error('SMTP indisponible'));
    const result = await recordLotPayment(pay(L1, 10000, '2026-01-10'));
    await expect(deliverChargeDocuments(TENANT_A, result.documents)).resolves.toBeUndefined();
    expect(mockPrisma.chargePayment.rows).toHaveLength(1);
    expect(mockPrisma.chargeCall.rows[0].status).toBe('PAID');
    const row = receiptRow(result.documents[0].id);
    expect(row.emailError).toBe('SMTP indisponible');
    expect(row.emailedAt ?? null).toBeNull();
  });

  it('sans adresse e-mail : aucun envoi, document conserve', async () => {
    await createCall(L2, '2026-01', 1000, '2026-01-31');
    const result = await recordLotPayment(pay(L2, 1000, '2026-01-10'));
    await deliverChargeDocuments(TENANT_A, result.documents);
    expect(mockSendEmail).not.toHaveBeenCalled();
    await expect(resendReceiptEmail(TENANT_A, S1, result.documents[0].id)).rejects.toMatchObject({ statusCode: 422 });
  });

  it('renvoi manuel : passe outre la desactivation automatique ; 502 si le serveur refuse', async () => {
    mockEmailConfig.mockImplementation(async () => ({ enabled: false, subjectOverride: null, bodyHtmlOverride: null }));
    const result = await recordLotPayment(pay(L1, 10000, '2026-01-10'));
    const sent = await resendReceiptEmail(TENANT_A, S1, result.documents[0].id);
    expect(sent).toMatchObject({ id: result.documents[0].id, sent: true });
    expect(mockSendEmail).toHaveBeenCalledTimes(1);

    mockSendEmail.mockRejectedValue(new Error('refus'));
    await expect(resendReceiptEmail(TENANT_A, S1, result.documents[0].id)).rejects.toMatchObject({ statusCode: 502 });
  });

  it('un PDF perdu est reconstruit a l identique depuis le snapshot', async () => {
    const result = await recordLotPayment(pay(L1, 10000, '2026-01-10'));
    const first = await getReceiptFile(TENANT_A, S1, result.documents[0].id);
    expect(first.fileName).toBe(`Quittance Q-${YEAR}-000001.pdf`);
    expect(first.mimeType).toBe('application/pdf');

    // Le copropriétaire change de nom : l'original, lui, ne change pas.
    mockPrisma.crmContact.rows.find(row => row.id === AWA)!.lastName = 'Autre';
    await fs.rm(path.join(mockUploadsDir, 'syndics', S1, 'quittances', `${result.documents[0].id}.pdf`));
    const rebuilt = await getReceiptFile(TENANT_A, S1, result.documents[0].id);
    expect(Buffer.compare(first.buffer, rebuilt.buffer)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Rendu PDF
// ---------------------------------------------------------------------------

function sampleSnapshot(kind: 'RECEIPT' | 'QUITTANCE', index: number): ChargeReceiptSnapshot {
  return {
    version: 1,
    kind,
    number: formatChargeReceiptNumber(kind, 2026, index),
    issuedAt: '2026-02-01T10:00:00.000Z',
    currency: 'XOF',
    amount: 2500001.5,
    issuer: {
      key: 'AGENCY',
      kind: 'AGENCY',
      name: 'Agence A',
      legalName: 'Agence A SARL',
      address: 'Rue 1, Abidjan',
      phone: '0102030405',
      email: 'contact@agence.test',
      rccm: null,
      taxId: 'NCC-1'
    },
    syndicate: {
      name: 'Residence Les Palmiers',
      address: 'Cocody',
      registrationNo: 'IMM-001',
      cadastralReference: 'CAD-9'
    },
    lot: { number: `A-${index}`, type: 'Appartement', label: 'Batiment A' },
    coowner: { name: 'Awa Koné – née Traoré', address: 'Cocody, villa 12' },
    call:
      kind === 'QUITTANCE'
        ? {
            id: 'call',
            period: { label: '2026-01', start: '2026-01-01', end: '2026-01-31' },
            amount: 2500001.5,
            dueDate: '2026-01-31T00:00:00.000Z'
          }
        : null,
    settlements:
      kind === 'QUITTANCE'
        ? Array.from({ length: 6 }, (_, n) => ({
            paidAt: `2026-01-${String(n + 10).padStart(2, '0')}T00:00:00.000Z`,
            method: 'MOBILE_MONEY',
            reference: `REF-${n}`,
            amount: 1000,
            source: 'PAYMENT' as const
          }))
        : [],
    settledAt: kind === 'QUITTANCE' ? '2026-01-15T00:00:00.000Z' : null,
    payment:
      kind === 'RECEIPT'
        ? { id: 'p', amount: 2500001.5, paidAt: '2026-01-10T00:00:00.000Z', method: 'VIREMENT', reference: 'VIR-1' }
        : null,
    allocations:
      kind === 'RECEIPT'
        ? Array.from({ length: 12 }, (_, n) => ({
            chargeCallId: `c${n}`,
            period: { label: `2026-${n + 1}`, start: null, end: null },
            callAmount: 10000,
            allocated: 10000,
            source: 'PAYMENT' as const,
            outstandingAfter: n === 11 ? 5000 : 0
          }))
        : [],
    outstandingAfter: kind === 'RECEIPT' ? 5000 : 0,
    advance: 0,
    lotAdvanceBalance: 0,
    backfilled: index % 2 === 0
  };
}

const noImages = (snapshot: ChargeReceiptSnapshot) => ({
  issuer: snapshot.issuer,
  issuerLogo: null,
  signature: null,
  stamp: null,
  syndicate: { ...snapshot.syndicate, logo: null }
});

describe('rendu PDF', () => {
  it('document unitaire : une page A4, texte non Latin-1 accepte', async () => {
    for (const kind of ['QUITTANCE', 'RECEIPT'] as const) {
      const snapshot = sampleSnapshot(kind, 1);
      const pdf = await PDFDocument.load(await renderChargeReceiptPdf({ snapshot, branding: noImages(snapshot) }));
      expect(pdf.getPageCount()).toBe(1);
      expect(pdf.getPage(0).getSize()).toEqual({ width: 595.28, height: 841.89 });
      expect(pdf.getTitle()).toContain(snapshot.number);
    }
  });

  it('impression groupee : 7 documents en 2 x 2 = 2 pages ; 13 en 3 x 4 = 2 pages', async () => {
    const items = (count: number) =>
      Array.from({ length: count }, (_, index) => {
        const snapshot = sampleSnapshot(index % 3 ? 'QUITTANCE' : 'RECEIPT', index + 1);
        return { snapshot, branding: noImages(snapshot) };
      });
    expect((await PDFDocument.load(await renderChargeReceiptSheets(items(7), 2, 2))).getPageCount()).toBe(2);
    expect((await PDFDocument.load(await renderChargeReceiptSheets(items(13), 3, 4))).getPageCount()).toBe(2);
    expect((await PDFDocument.load(await renderChargeReceiptSheets(items(1), 1, 1))).getPageCount()).toBe(1);
    expect(sheetCount(7, 2, 2)).toBe(2);
  });

  it('grille : cases dans la page, sans chevauchement', () => {
    const cells = gridCells(3, 4);
    expect(cells).toHaveLength(12);
    for (const cell of cells) {
      expect(cell.x).toBeGreaterThan(0);
      expect(cell.y).toBeGreaterThan(0);
      expect(cell.x + cell.width).toBeLessThan(595.28);
      expect(cell.y + cell.height).toBeLessThan(841.89);
    }
    expect(cells[1].x).toBeGreaterThanOrEqual(cells[0].x + cells[0].width);
    expect(cells[3].y + cells[3].height).toBeLessThanOrEqual(cells[0].y);
  });
});

// ---------------------------------------------------------------------------
// Lectures, impression, rattrapage, isolation
// ---------------------------------------------------------------------------

describe('listes, impression groupee et isolation', () => {
  beforeEach(async () => {
    await createCall(L1, '2026-01', 1000, '2026-01-31');
    await createCall(L1, '2026-02', 1000, '2026-02-28');
    await createCall(L2, '2026-01', 1000, '2026-01-31');
    await recordLotPayment(pay(L1, 2000, '2026-02-10'));
    await recordLotPayment(pay(L2, 500, '2026-01-10'));
  });

  it('liste de la copropriete, filtres et pagination, sans chemin disque', async () => {
    const all = await listSyndicateReceipts(TENANT_A, S1, { page: 1, limit: 20 });
    expect(all.pagination).toEqual({ page: 1, limit: 20, total: 3, totalPages: 1 });
    expect(findDiskPathLeaks(all)).toEqual([]);
    expect(all.items[0]).not.toHaveProperty('snapshot');
    expect(all.items[0]).not.toHaveProperty('filePath');

    const quittances = await listSyndicateReceipts(TENANT_A, S1, { page: 1, limit: 20, kind: 'QUITTANCE' });
    expect(quittances.items.map(item => item.periodLabel).sort()).toEqual(['2026-01', '2026-02']);
    expect(quittances.items[0]).toMatchObject({ lotNumber: 'A-01', coownerName: 'Awa Kone', backfilled: false });

    const february = await listSyndicateReceipts(TENANT_A, S1, {
      page: 1,
      limit: 20,
      kind: 'QUITTANCE',
      from: d('2026-02-01'),
      to: d('2026-02-28')
    });
    expect(february.items.map(item => item.periodLabel)).toEqual(['2026-02']);

    const byContact = await listSyndicateReceipts(TENANT_A, S1, { page: 1, limit: 20, contactId: BAKARY });
    expect(byContact.items.map(item => item.kind)).toEqual(['RECEIPT']);

    const paged = await listSyndicateReceipts(TENANT_A, S1, { page: 2, limit: 2 });
    expect(paged.items).toHaveLength(1);
    expect(paged.pagination.totalPages).toBe(2);

    const lot = await listLotReceipts(TENANT_A, S1, L2, { page: 1, limit: 20 });
    expect(lot.items.map(item => item.lotId)).toEqual([L2]);
  });

  it('impression groupee : quittances de la periode, un seul coproprietaire, et refus sans document', async () => {
    const pdf = await PDFDocument.load(
      await printReceipts(TENANT_A, S1, {
        from: d('2026-01-01'),
        to: d('2026-12-31'),
        kind: 'QUITTANCE',
        cols: 1,
        rows: 1
      })
    );
    expect(pdf.getPageCount()).toBe(2);
    const all = await PDFDocument.load(
      await printReceipts(TENANT_A, S1, { from: d('2026-01-01'), to: d('2026-12-31'), kind: 'ALL', cols: 2, rows: 2 })
    );
    expect(all.getPageCount()).toBe(1);
    await expect(
      printReceipts(TENANT_A, S1, {
        from: d('2026-01-01'),
        to: d('2026-12-31'),
        kind: 'QUITTANCE',
        contactId: BAKARY,
        cols: 1,
        rows: 1
      })
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('impression groupee : plafond de documents -> 422', async () => {
    const template = receipts()[0];
    for (let index = 0; index < MAX_DOCUMENTS_PER_PRINT; index += 1) {
      receipts().push({ ...template, id: `extra-${index}`, number: `X-${index}` });
    }
    await expect(
      printReceipts(TENANT_A, S1, { from: d('2026-01-01'), to: d('2026-12-31'), kind: 'ALL', cols: 3, rows: 4 })
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('document d une autre copropriete ou d une autre agence -> 404', async () => {
    const own = receipts()[0];
    await expect(getReceiptFile(TENANT_A, S2, own.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(getReceiptFile(TENANT_B, SB, own.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(getReceiptFile(TENANT_B, S1, own.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(resendReceiptEmail(TENANT_B, SB, own.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(listSyndicateReceipts(TENANT_B, S1, { page: 1, limit: 20 })).rejects.toMatchObject({
      statusCode: 404
    });
    await expect(listLotReceipts(TENANT_A, S1, LB, { page: 1, limit: 20 })).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      printReceipts(TENANT_A, S1, {
        from: d('2026-01-01'),
        to: d('2026-12-31'),
        kind: 'ALL',
        lotId: L3,
        cols: 1,
        rows: 1
      })
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(backfillMissingQuittances(TENANT_B, S1, null)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('rattrapage des quittances manquantes', () => {
  it('une quittance par appel PAID sans quittance, marquee backfilled, sans e-mail ; idempotent', async () => {
    await createCall(L1, '2026-01', 1000, '2026-01-31');
    await createCall(L1, '2026-02', 1000, '2026-02-28');
    await createCall(L2, '2026-01', 1000, '2026-01-31');
    await recordLotPayment(pay(L1, 2000, '2026-02-10'));
    await recordLotPayment(pay(L2, 1000, '2026-02-10'));
    // Situation d'avant le lot S3 : les appels sont PAID, sans document.
    mockPrisma.syndicChargeReceipt.rows = [];

    const first = await backfillMissingQuittances(TENANT_A, S1, 'user-1');
    expect(first).toEqual({ created: 3, skipped: 0 });
    expect(receipts().every(row => row.kind === 'QUITTANCE' && row.snapshot.backfilled === true)).toBe(true);
    expect(mockSendEmail).not.toHaveBeenCalled();

    const second = await backfillMissingQuittances(TENANT_A, S1, 'user-1');
    expect(second).toEqual({ created: 0, skipped: 3 });
    expect(receipts()).toHaveLength(3);
  });
});
