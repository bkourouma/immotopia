/**
 * Sources de signature « mandat de prélèvement » (spec 042 §10.4) : enregistrement,
 * droits, assertTarget, titre sans IBAN, empreinte HMAC, scellement (onSealed),
 * signataire proposé et lecture du scan `signature:<id>`. La base est simulée.
 */
import { PDFDocument, PDFPage } from 'pdf-lib';

type Row = Record<string, any>;

const TENANT = 'tenant-1';
const OTHER_TENANT = 'tenant-2';
const RENTAL_ID = '11111111-1111-4111-8111-111111111111';
const SYNDIC_ID = '22222222-2222-4222-8222-222222222222';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const IBAN = 'CI93CI0080111301134291200589';

const db: { mandates: Row[]; signers: Row[]; requests: Row[]; contacts: Row[] } = {
  mandates: [],
  signers: [],
  requests: [],
  contacts: []
};

const matchesWhere = (row: Row, where: Row) =>
  Object.entries(where).every(([key, value]) => {
    if (value === null) return row[key] === null || row[key] === undefined;
    if (typeof value === 'object' && value !== null && 'not' in value) return row[key] !== value.not;
    return row[key] === value;
  });

const mandateFindFirst = jest.fn(async ({ where }: Row) => db.mandates.find(row => matchesWhere(row, where)) ?? null);
const mandateUpdateMany = jest.fn(async ({ where, data }: Row) => {
  const rows = db.mandates.filter(row => matchesWhere(row, where));
  rows.forEach(row => Object.assign(row, data));
  return { count: rows.length };
});
const signerFindFirst = jest.fn(async ({ where }: Row) => {
  const rows = db.signers
    .filter(row => matchesWhere(row, { requestId: where.requestId, tenantId: where.tenantId }) && row.signedAt)
    .sort((a, b) => b.signedAt.getTime() - a.signedAt.getTime());
  return rows[0] ?? null;
});
const requestFindFirst = jest.fn(async ({ where }: Row) => db.requests.find(row => matchesWhere(row, where)) ?? null);
const contactFindFirst = jest.fn(async ({ where }: Row) => db.contacts.find(row => matchesWhere(row, where)) ?? null);

const prismaMock: Row = {
  directDebitMandate: { findFirst: mandateFindFirst, updateMany: mandateUpdateMany },
  signatureSigner: { findFirst: signerFindFirst },
  signatureRequest: { findFirst: requestFindFirst },
  crmContact: { findFirst: contactFindFirst, findMany: jest.fn(async () => []) }
};
jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));

const mockEnv: Record<string, string | undefined> = {
  DIRECT_DEBIT_IBAN_KEY: Buffer.alloc(32, 7).toString('base64')
};
jest.mock('../../src/config/env', () => ({ env: mockEnv, parseKeyList: () => [] }));

const recordAuditEvent = jest.fn(async (_tx: unknown, _entry: Row) => undefined);
jest.mock('../../src/services/audit-service', () => ({
  AuditActionKey: jest.requireActual('../../src/types/audit-types').AuditActionKey,
  recordAuditEvent,
  logAuditEvent: jest.fn()
}));

// Garde d'appartenance : refuse toute cible d'une autre agence (NotFoundError, comme l'originale).
jest.mock('../../src/utils/tenant-ownership', () => ({
  assertBelongsToTenant: jest.fn(
    async (_client: unknown, _model: string, id: string, tenantId: string, options: Row) => {
      const row = db.mandates.find(mandate => mandate.id === id);
      if (!row || row.tenantId !== tenantId) {
        const { NotFoundError } = jest.requireActual('../../src/middleware/error-middleware');
        throw new NotFoundError(options?.message ?? 'Ressource introuvable.');
      }
    }
  )
}));

// L'IBAN est « chiffré » par un simple préfixe : le déchiffrement réel est testé ailleurs.
jest.mock('../../src/lib/direct-debit/mandates', () => ({
  decryptMandateIban: (value: string) => value.replace(/^enc:/, '')
}));

jest.mock('../../src/lib/documents/document-branding', () => ({
  ...jest.requireActual('../../src/lib/documents/document-branding'),
  resolveDocumentBranding: jest.fn(async () => ({
    issuer: {
      kind: 'AGENCY',
      name: 'Agence Test',
      legalName: null,
      address: 'Abidjan',
      phone: null,
      email: null,
      rccm: null,
      taxId: null
    },
    issuerLogo: null,
    signature: null,
    stamp: null,
    syndicate: null
  }))
}));

const readSignatureFile = jest.fn(async (_tenantId: string, _requestId: string, _key: string) => ({
  buffer: Buffer.from('%PDF-signed'),
  fileName: 'signed.pdf',
  mimeType: 'application/pdf'
}));
jest.mock('../../src/lib/signature/files', () => ({ readSignatureFile }));

import { BadRequestError, ConflictError, NotFoundError } from '../../src/middleware/error-middleware';
import { findSignatureSource, SourceChangedError } from '../../src/lib/signature/sources';
import {
  directDebitMandateSource,
  syndicDirectDebitMandateSource
} from '../../src/lib/signature/sources/direct-debit-mandate';
import { computeMandateSignatureSnapshot } from '../../src/lib/direct-debit/signature-snapshot';
import { loadMandateSignatureData } from '../../src/lib/direct-debit/signature-pdf-data';
import { readMandateScan } from '../../src/lib/direct-debit/mandate-files';

/** Textes dessinés par le rendu du PDF d'autorisation (pdf-lib encode les glyphes : on écoute drawText). */
async function renderedTexts(render: () => Promise<unknown>): Promise<string> {
  const drawn: string[] = [];
  const original = PDFPage.prototype.drawText;
  const spy = jest.spyOn(PDFPage.prototype, 'drawText').mockImplementation(function (this: PDFPage, text, options) {
    drawn.push(String(text));
    return original.call(this, text, options);
  });
  try {
    await render();
  } finally {
    spy.mockRestore();
  }
  return drawn.join('\n');
}

const ctx = { tenantId: TENANT, userId: 'caller-user' };
const intruder = { tenantId: OTHER_TENANT, userId: 'caller-user' };

const creditor = {
  id: 'creditor-1',
  label: 'Compte loyers',
  creditorIdentifier: 'CI-EMET-01',
  collectionDay: 5,
  bankName: 'Banque Test',
  treasuryAccount: null
};

function seed() {
  db.mandates = [
    {
      id: RENTAL_ID,
      tenantId: TENANT,
      year: 2026,
      sequence: 12,
      scope: 'RENTAL_LEASE',
      status: 'DRAFT',
      signedScanUrl: null,
      signedScanUploadedAt: null,
      signedAt: null,
      signatureRequestId: null,
      ibanEncrypted: `enc:${IBAN}`,
      ibanBankCode: 'CI008',
      holderName: 'Awa Traoré',
      maxAmount: '150000',
      collectionDay: null,
      leaseId: 'lease-1',
      lotId: null,
      syndicateId: null,
      creditor,
      debtor: {
        id: 'client-1',
        details: { crmContactId: 'contact-1' },
        user: { fullName: 'Awa Traoré', email: 'awa@example.test' }
      },
      debtorContact: null,
      lease: { lease_number: 'BAIL-001', currency: 'FCFA', property: { title: 'Villa', address: 'Cocody' } },
      lot: null,
      syndicate: null
    },
    {
      id: SYNDIC_ID,
      tenantId: TENANT,
      year: 2026,
      sequence: 13,
      scope: 'SYNDIC_LOT',
      status: 'DRAFT',
      signedScanUrl: null,
      signedScanUploadedAt: null,
      signedAt: null,
      signatureRequestId: null,
      ibanEncrypted: `enc:${IBAN}`,
      ibanBankCode: 'CI008',
      holderName: 'Koffi Yao',
      maxAmount: null,
      collectionDay: 10,
      leaseId: null,
      lotId: 'lot-1',
      syndicateId: 'syn-1',
      creditor,
      debtor: null,
      debtorContact: {
        id: 'contact-2',
        contactType: 'INDIVIDUAL',
        firstName: 'Koffi',
        lastName: 'Yao',
        legalName: null,
        email: 'koffi@example.test',
        phonePrimary: '+2250700000000'
      },
      lease: null,
      lot: { lotNumber: 'A12', syndicate: { name: 'Résidence Palmiers', address: 'Marcory' } },
      syndicate: null
    }
  ];
  db.contacts = [
    {
      id: 'contact-1',
      tenantId: TENANT,
      contactType: 'INDIVIDUAL',
      firstName: 'Awa',
      lastName: 'Traoré',
      legalName: null,
      email: 'awa.crm@example.test',
      phonePrimary: '+2250101010101'
    }
  ];
  db.signers = [];
  db.requests = [];
}

const view = (
  kind: 'DIRECT_DEBIT_MANDATE' | 'SYNDIC_DIRECT_DEBIT_MANDATE',
  targetId: string,
  sourceDocHash: string | null = null
) => ({
  id: REQUEST_ID,
  tenantId: TENANT,
  kind,
  targetType: 'DIRECT_DEBIT_MANDATE',
  targetId,
  sourceDocumentId: null,
  sourceDocHash
});

beforeEach(() => {
  seed();
  jest.clearAllMocks();
  mockEnv.DIRECT_DEBIT_IBAN_KEY = Buffer.alloc(32, 7).toString('base64');
});

describe('direct-debit / sources de signature du mandat', () => {
  it('enregistre les deux sources avec leurs droits et options', () => {
    const rental = findSignatureSource('DIRECT_DEBIT_MANDATE');
    const syndic = findSignatureSource('SYNDIC_DIRECT_DEBIT_MANDATE');
    expect(rental).toBe(directDebitMandateSource);
    expect(syndic).toBe(syndicDirectDebitMandateSource);
    expect(rental).toMatchObject({
      targetType: 'DIRECT_DEBIT_MANDATE',
      viewPermission: 'RENTAL_DIRECT_DEBIT_MANAGE',
      editPermission: 'RENTAL_DIRECT_DEBIT_MANAGE',
      feature: 'RENTAL',
      codeBeforeView: true,
      allowedChannels: ['EMAIL', 'SMS', 'WHATSAPP'],
      externalGateway: true
    });
    expect(rental?.providerRequired).toBeFalsy();
    expect(syndic).toMatchObject({
      targetType: 'DIRECT_DEBIT_MANDATE',
      viewPermission: 'SYNDIC_DIRECT_DEBIT_MANAGE',
      editPermission: 'SYNDIC_DIRECT_DEBIT_MANAGE',
      feature: 'SYNDIC'
    });
  });

  describe('assertTarget', () => {
    it('accepte un mandat en brouillon du bon périmètre', async () => {
      await expect(directDebitMandateSource.assertTarget(ctx, RENTAL_ID)).resolves.toBeUndefined();
      await expect(syndicDirectDebitMandateSource.assertTarget(ctx, SYNDIC_ID)).resolves.toBeUndefined();
    });

    it('répond 404 pour une autre agence ou un identifiant invalide', async () => {
      await expect(directDebitMandateSource.assertTarget(intruder, RENTAL_ID)).rejects.toBeInstanceOf(NotFoundError);
      await expect(directDebitMandateSource.assertTarget(ctx, 'pas-un-uuid')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('refuse le mauvais périmètre', async () => {
      await expect(directDebitMandateSource.assertTarget(ctx, SYNDIC_ID)).rejects.toBeInstanceOf(BadRequestError);
      await expect(syndicDirectDebitMandateSource.assertTarget(ctx, RENTAL_ID)).rejects.toBeInstanceOf(BadRequestError);
    });

    it("refuse un mandat qui n'est plus un brouillon", async () => {
      db.mandates[0].status = 'ACTIVE';
      await expect(directDebitMandateSource.assertTarget(ctx, RENTAL_ID)).rejects.toBeInstanceOf(BadRequestError);
    });

    it('refuse un mandat qui porte déjà un scan', async () => {
      db.mandates[0].signedScanUrl = '/uploads/rental/direct-debit/x/y/z.pdf';
      await expect(directDebitMandateSource.assertTarget(ctx, RENTAL_ID)).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe('loadSource et empreinte', () => {
    it('produit le PDF, un titre sans IBAN et une empreinte HMAC sans IBAN', async () => {
      const loaded = await directDebitMandateSource.loadSource(ctx, RENTAL_ID);
      expect(loaded.title).toBe('Autorisation de prélèvement MDT-2026-0012');
      expect(loaded.title).not.toContain(IBAN.slice(-8));
      expect(loaded.pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect((await PDFDocument.load(loaded.pdf)).getPageCount()).toBe(1);
      expect(loaded.documentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(loaded.documentHash)).not.toContain(IBAN);
    });

    it('sert aussi un mandat de copropriété (syndicat et lot, jamais un bail)', async () => {
      let loaded!: Awaited<ReturnType<typeof syndicDirectDebitMandateSource.loadSource>>;
      const text = await renderedTexts(async () => {
        loaded = await syndicDirectDebitMandateSource.loadSource(ctx, SYNDIC_ID);
      });
      expect(loaded.title).toBe('Autorisation de prélèvement MDT-2026-0013');
      const data = await loadMandateSignatureData(TENANT, SYNDIC_ID);
      expect(data?.data).toMatchObject({
        debtorName: 'Koffi Yao',
        syndicateName: 'Résidence Palmiers',
        lotNumber: 'A12',
        leaseNumber: null,
        propertyLabel: null,
        collectionDay: 10
      });
      // Le rendu reprend ces données : lignes « Copropriété » et « Lot », mention des appels de charges, pas de bail.
      expect(text).toContain('Copropri');
      expect(text).toContain('Résidence Palmiers');
      expect(text).toContain('Lot');
      expect(text).toContain('A12');
      expect(text).toContain('appels de charges de copropri');
      expect(text).not.toContain('Bien lou');
      expect(text).not.toContain('loyer et des charges de mon bail');
    });

    it('un mandat locatif garde son bail et son bien, sans syndicat ni lot', async () => {
      const text = await renderedTexts(() => directDebitMandateSource.loadSource(ctx, RENTAL_ID));
      const data = await loadMandateSignatureData(TENANT, RENTAL_ID);
      expect(data?.data).toMatchObject({
        leaseNumber: 'BAIL-001',
        propertyLabel: 'Villa - Cocody',
        syndicateName: null
      });
      expect(text).toContain('BAIL-001');
      expect(text).toContain('loyer et des charges de mon bail');
      expect(text).not.toContain('appels de charges de copropri');
    });

    it("refuse un mandat qui n'est pas dans le périmètre de la source", async () => {
      await expect(directDebitMandateSource.loadSource(ctx, SYNDIC_ID)).rejects.toBeInstanceOf(BadRequestError);
      await expect(directDebitMandateSource.loadSource(intruder, RENTAL_ID)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('calcule une empreinte stable, sensible à chaque donnée, non réversible', async () => {
      const snapshot = (await loadMandateSignatureData(TENANT, RENTAL_ID))!.snapshot;
      const hash = computeMandateSignatureSnapshot(snapshot);
      expect(computeMandateSignatureSnapshot({ ...snapshot })).toBe(hash);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(hash).not.toContain(IBAN);
      // Un SHA-256 simple du même contenu serait retrouvable : l'empreinte doit en différer.
      const { createHash } = await import('crypto');
      expect(hash).not.toBe(createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'));

      const changes: Array<Partial<typeof snapshot>> = [
        { iban: 'CI93CI0080111301134291200590' },
        { holderName: 'Autre Titulaire' },
        { maxAmount: 1 },
        { creditorId: 'creditor-2' },
        { leaseNumber: 'BAIL-002' },
        { lotNumber: 'B03' },
        { syndicateName: 'Autre résidence' },
        { collectionDay: 6 },
        { reference: 'MDT-2026-0099' }
      ];
      for (const change of changes) {
        expect(computeMandateSignatureSnapshot({ ...snapshot, ...change })).not.toBe(hash);
      }
    });

    it("l'empreinte d'un mandat locatif garde sa forme initiale ; syndicat et lot s'ajoutent en fin, seulement en copropriété", async () => {
      const { createHmac, hkdfSync } = await import('crypto');
      const snapshot = (await loadMandateSignatureData(TENANT, RENTAL_ID))!.snapshot;
      const key = Buffer.from(
        hkdfSync(
          'sha256',
          Buffer.alloc(32, 7),
          Buffer.alloc(0),
          Buffer.from('immotopia:direct-debit:signature-snapshot', 'utf8'),
          32
        )
      );
      const initial = JSON.stringify([
        snapshot.scope,
        snapshot.reference,
        snapshot.creditorId,
        snapshot.creditorLabel,
        snapshot.creditorIdentifier,
        snapshot.creditorBankName,
        snapshot.debtorName,
        snapshot.holderName,
        snapshot.iban.replace(/\s+/g, '').toUpperCase(),
        snapshot.bankCode,
        snapshot.leaseId,
        snapshot.lotId,
        snapshot.syndicateId,
        snapshot.leaseNumber,
        snapshot.propertyLabel,
        snapshot.maxAmount,
        snapshot.collectionDay,
        snapshot.currency
      ]);
      expect(computeMandateSignatureSnapshot(snapshot)).toBe(
        createHmac('sha256', key).update(initial, 'utf8').digest('hex')
      );
      const copro = (await loadMandateSignatureData(TENANT, SYNDIC_ID))!.snapshot;
      expect(copro).toMatchObject({ syndicateName: 'Résidence Palmiers', lotNumber: 'A12' });
      const withoutLot = { ...copro, syndicateName: null, lotNumber: null };
      expect(computeMandateSignatureSnapshot(copro)).not.toBe(computeMandateSignatureSnapshot(withoutLot));
    });

    it('dépend de la clé : sans clé courante, refuse', async () => {
      const snapshot = (await loadMandateSignatureData(TENANT, RENTAL_ID))!.snapshot;
      const other = Buffer.alloc(32, 9).toString('base64');
      const hash = computeMandateSignatureSnapshot(snapshot);
      mockEnv.DIRECT_DEBIT_IBAN_KEY = other;
      expect(computeMandateSignatureSnapshot(snapshot)).not.toBe(hash);
      mockEnv.DIRECT_DEBIT_IBAN_KEY = undefined;
      expect(() => computeMandateSignatureSnapshot(snapshot)).toThrow(BadRequestError);
    });
  });

  describe('isSourceIntact', () => {
    it("est vrai tant que les données n'ont pas changé, faux ensuite", async () => {
      const { documentHash } = await directDebitMandateSource.loadSource(ctx, RENTAL_ID);
      const request = view('DIRECT_DEBIT_MANDATE', RENTAL_ID, documentHash ?? null);
      await expect(directDebitMandateSource.isSourceIntact(request)).resolves.toBe(true);
      db.mandates[0].holderName = 'Autre Titulaire';
      await expect(directDebitMandateSource.isSourceIntact(request)).resolves.toBe(false);
    });

    it("est faux si le mandat n'est plus brouillon, porte un scan, ou si l'IBAN change", async () => {
      const { documentHash } = await directDebitMandateSource.loadSource(ctx, RENTAL_ID);
      const request = view('DIRECT_DEBIT_MANDATE', RENTAL_ID, documentHash ?? null);
      db.mandates[0].ibanEncrypted = 'enc:CI93CI0080111301134291200590';
      await expect(directDebitMandateSource.isSourceIntact(request)).resolves.toBe(false);
      seed();
      db.mandates[0].status = 'ACTIVE';
      await expect(directDebitMandateSource.isSourceIntact(request)).resolves.toBe(false);
      seed();
      db.mandates[0].signedScanUrl = 'signature:other';
      await expect(directDebitMandateSource.isSourceIntact(request)).resolves.toBe(false);
    });
  });

  describe('defaultSigners', () => {
    it('propose le locataire débiteur avec e-mail du compte et téléphone du contact CRM', async () => {
      await expect(directDebitMandateSource.defaultSigners!(ctx, RENTAL_ID)).resolves.toEqual([
        {
          role: 'DEBITEUR',
          fullName: 'Awa Traoré',
          email: 'awa@example.test',
          phone: '+2250101010101',
          contactId: 'contact-1'
        }
      ]);
    });

    it('propose le copropriétaire (contact CRM) pour un mandat de copropriété', async () => {
      await expect(syndicDirectDebitMandateSource.defaultSigners!(ctx, SYNDIC_ID)).resolves.toEqual([
        {
          role: 'DEBITEUR',
          fullName: 'Koffi Yao',
          email: 'koffi@example.test',
          phone: '+2250700000000',
          contactId: 'contact-2'
        }
      ]);
    });

    it('répond 404 pour une autre agence ou un autre périmètre', async () => {
      await expect(directDebitMandateSource.defaultSigners!(intruder, RENTAL_ID)).rejects.toBeInstanceOf(NotFoundError);
      await expect(directDebitMandateSource.defaultSigners!(ctx, SYNDIC_ID)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('onSealed', () => {
    const now = new Date('2026-10-17T12:00:00Z');

    it("pose le scan, la date de la dernière signature, la demande et l'audit", async () => {
      db.signers = [
        { requestId: REQUEST_ID, tenantId: TENANT, signedAt: new Date('2026-10-16T08:00:00Z') },
        { requestId: REQUEST_ID, tenantId: TENANT, signedAt: new Date('2026-10-17T09:30:00Z') },
        { requestId: 'autre', tenantId: TENANT, signedAt: new Date('2026-10-18T09:30:00Z') }
      ];
      await directDebitMandateSource.onSealed(prismaMock as never, view('DIRECT_DEBIT_MANDATE', RENTAL_ID), now);
      expect(db.mandates[0]).toMatchObject({
        status: 'DRAFT',
        signedScanUrl: `signature:${REQUEST_ID}`,
        signedScanUploadedAt: now,
        signedAt: new Date('2026-10-17T09:30:00Z'),
        signatureRequestId: REQUEST_ID
      });
      expect(mandateUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT }) })
      );
      expect(recordAuditEvent).toHaveBeenCalledTimes(1);
      const entry = recordAuditEvent.mock.calls[0][1];
      expect(entry).toMatchObject({
        tenantId: TENANT,
        actionKey: 'DIRECT_DEBIT_MANDATE_SIGNED_ELECTRONICALLY',
        entityType: 'DirectDebitMandate',
        entityId: RENTAL_ID
      });
      expect(JSON.stringify(entry)).not.toContain(IBAN);
      expect(JSON.stringify(entry)).not.toContain('enc:');
    });

    it('prend la date du scellement à défaut de signataire daté', async () => {
      await syndicDirectDebitMandateSource.onSealed(
        prismaMock as never,
        view('SYNDIC_DIRECT_DEBIT_MANDATE', SYNDIC_ID),
        now
      );
      expect(db.mandates[1].signedAt).toEqual(now);
    });

    it("recalcule l'empreinte DANS la transaction (lecture par tx) et scelle si elle correspond", async () => {
      db.signers = [{ requestId: REQUEST_ID, tenantId: TENANT, signedAt: new Date('2026-10-17T09:30:00Z') }];
      const hash = computeMandateSignatureSnapshot((await loadMandateSignatureData(TENANT, RENTAL_ID))!.snapshot);
      const txFindFirst = jest.fn(async ({ where }: Row) => db.mandates.find(row => matchesWhere(row, where)) ?? null);
      const tx = { ...prismaMock, directDebitMandate: { ...prismaMock.directDebitMandate, findFirst: txFindFirst } };
      mandateFindFirst.mockClear();
      await directDebitMandateSource.onSealed(tx as never, view('DIRECT_DEBIT_MANDATE', RENTAL_ID, hash), now);
      expect(db.mandates[0].signedScanUrl).toBe(`signature:${REQUEST_ID}`);
      // Toutes les lectures du scellement passent par `tx`, aucune par le client global.
      expect(txFindFirst).toHaveBeenCalledTimes(2);
      expect(mandateFindFirst).not.toHaveBeenCalled();
    });

    it("données du mandat changées depuis l'envoi (IBAN, titulaire, plafond) : SourceChangedError, rien n'est posé", async () => {
      const hash = computeMandateSignatureSnapshot((await loadMandateSignatureData(TENANT, RENTAL_ID))!.snapshot);
      db.mandates[0].holderName = 'Autre Titulaire';
      await expect(
        directDebitMandateSource.onSealed(prismaMock as never, view('DIRECT_DEBIT_MANDATE', RENTAL_ID, hash), now)
      ).rejects.toBeInstanceOf(SourceChangedError);
      expect(db.mandates[0]).toMatchObject({ signedScanUrl: null, signatureRequestId: null });
      expect(recordAuditEvent).not.toHaveBeenCalled();
    });

    it('clé de chiffrement absente au scellement : le document n’est plus vérifiable, SourceChangedError', async () => {
      const hash = computeMandateSignatureSnapshot((await loadMandateSignatureData(TENANT, RENTAL_ID))!.snapshot);
      mockEnv.DIRECT_DEBIT_IBAN_KEY = undefined;
      await expect(
        directDebitMandateSource.onSealed(prismaMock as never, view('DIRECT_DEBIT_MANDATE', RENTAL_ID, hash), now)
      ).rejects.toBeInstanceOf(SourceChangedError);
    });

    it("refuse un mandat qui n'est plus brouillon ou porte déjà un scan", async () => {
      db.mandates[0].status = 'ACTIVE';
      await expect(
        directDebitMandateSource.onSealed(prismaMock as never, view('DIRECT_DEBIT_MANDATE', RENTAL_ID), now)
      ).rejects.toBeInstanceOf(SourceChangedError);
      seed();
      db.mandates[0].signedScanUrl = '/uploads/rental/direct-debit/x/y/z.pdf';
      await expect(
        directDebitMandateSource.onSealed(prismaMock as never, view('DIRECT_DEBIT_MANDATE', RENTAL_ID), now)
      ).rejects.toBeInstanceOf(SourceChangedError);
      expect(recordAuditEvent).not.toHaveBeenCalled();
    });

    it("refuse une cible d'une autre agence", async () => {
      await expect(
        directDebitMandateSource.onSealed(
          prismaMock as never,
          { ...view('DIRECT_DEBIT_MANDATE', RENTAL_ID), tenantId: OTHER_TENANT },
          now
        )
      ).rejects.toBeInstanceOf(SourceChangedError);
      expect(db.mandates[0].signedScanUrl).toBeNull();
    });

    it('est idempotent', async () => {
      const request = view('DIRECT_DEBIT_MANDATE', RENTAL_ID);
      await directDebitMandateSource.onSealed(prismaMock as never, request, now);
      const later = new Date('2026-10-18T00:00:00Z');
      await directDebitMandateSource.onSealed(prismaMock as never, request, later);
      expect(db.mandates[0].signedScanUploadedAt).toEqual(now);
      expect(recordAuditEvent).toHaveBeenCalledTimes(1);
    });
  });

  describe('lecture du scan signature:<id>', () => {
    const mandate = {
      tenantId: TENANT,
      id: RENTAL_ID,
      signedScanUrl: `signature:${REQUEST_ID}`,
      reference: 'MDT-2026-0012'
    };
    const signedRequest = {
      id: REQUEST_ID,
      tenantId: TENANT,
      kind: 'DIRECT_DEBIT_MANDATE',
      targetType: 'DIRECT_DEBIT_MANDATE',
      targetId: RENTAL_ID,
      status: 'COMPLETED',
      signedFileKey: `/uploads/signatures/${TENANT}/${REQUEST_ID}/signed.pdf`
    };

    it('sert le signed.pdf de la demande sous le nom attendu', async () => {
      db.requests = [signedRequest];
      const file = await readMandateScan(mandate);
      expect(readSignatureFile).toHaveBeenCalledWith(TENANT, REQUEST_ID, signedRequest.signedFileKey);
      expect(file.fileName).toBe('MDT-2026-0012-autorisation-signee.pdf');
      expect(file.mimeType).toBe('application/pdf');
    });

    it('trace la lecture côté agence AVANT de rendre le fichier, sans IBAN (SIG-S5)', async () => {
      db.requests = [signedRequest];
      recordAuditEvent.mockImplementationOnce(async () => {
        expect(readSignatureFile).toHaveBeenCalled();
      });
      await readMandateScan({ ...mandate, actorUserId: 'user-9' });
      expect(recordAuditEvent).toHaveBeenCalledTimes(1);
      const entry = recordAuditEvent.mock.calls[0][1];
      expect(entry).toMatchObject({
        tenantId: TENANT,
        actorUserId: 'user-9',
        actionKey: 'DIRECT_DEBIT_MANDATE_AUTHORIZATION_DOWNLOADED',
        entityType: 'DirectDebitMandate',
        entityId: RENTAL_ID,
        payload: { channel: 'AGENCY', variant: 'signed', requestId: REQUEST_ID }
      });
      expect(JSON.stringify(entry)).not.toContain(IBAN);
    });

    it('trace aussi un mandat de copropriété', async () => {
      db.requests = [{ ...signedRequest, kind: 'SYNDIC_DIRECT_DEBIT_MANDATE', targetId: SYNDIC_ID }];
      await readMandateScan({ ...mandate, id: SYNDIC_ID, actorUserId: 'user-9' });
      expect(recordAuditEvent.mock.calls[0][1]).toMatchObject({ entityId: SYNDIC_ID, actorUserId: 'user-9' });
    });

    it("un échec d'écriture de l'audit bloque la lecture du fichier", async () => {
      db.requests = [signedRequest];
      recordAuditEvent.mockRejectedValueOnce(new Error('audit indisponible'));
      await expect(readMandateScan({ ...mandate, actorUserId: 'user-9' })).rejects.toThrow('audit indisponible');
    });

    it("répond 404 pour une demande d'une autre agence", async () => {
      db.requests = [{ ...signedRequest, tenantId: OTHER_TENANT }];
      await expect(readMandateScan(mandate)).rejects.toBeInstanceOf(NotFoundError);
      expect(readSignatureFile).not.toHaveBeenCalled();
    });

    it("répond 404 pour une demande d'une autre cible ou d'un autre type", async () => {
      db.requests = [{ ...signedRequest, targetId: SYNDIC_ID }];
      await expect(readMandateScan(mandate)).rejects.toBeInstanceOf(NotFoundError);
      db.requests = [{ ...signedRequest, targetType: 'RentalLease' }];
      await expect(readMandateScan(mandate)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('répond 404 pour une demande non terminée ou un identifiant mal formé', async () => {
      db.requests = [{ ...signedRequest, status: 'SENT', signedFileKey: null }];
      await expect(readMandateScan(mandate)).rejects.toBeInstanceOf(NotFoundError);
      await expect(readMandateScan({ ...mandate, signedScanUrl: 'signature:../../x' })).rejects.toBeInstanceOf(
        NotFoundError
      );
    });
  });
});
