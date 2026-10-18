/**
 * Créancier du syndicat et mandats des lots — spec 042, P4 (data-model §9.1, §9.3).
 *
 * Prisma est remplacé par un petit magasin en mémoire qui applique les filtres
 * d'agence, de périmètre et de syndicat comme la vraie base : une référence
 * étrangère doit se comporter comme un objet inexistant.
 */

const IBAN = 'CI93CI0080111301134291200589';
const TENANT = 'tenant-a';
const OTHER_TENANT = 'tenant-b';
const SYN = '11111111-1111-4111-8111-111111111111';
const SYN2 = '11111111-1111-4111-8111-222222222222';
const SYN_X = '11111111-1111-4111-8111-333333333333';
const LOT1 = '22222222-2222-4222-8222-111111111111';
const LOT2 = '22222222-2222-4222-8222-222222222222';
const LOT_OTHER_SYNDIC = '22222222-2222-4222-8222-333333333333';
const CREDITOR = '33333333-3333-4333-8333-333333333333';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const NOW = new Date('2026-10-17T09:00:00Z');

const state: {
  syndicates: Row[];
  lots: Row[];
  contacts: Row[];
  creditors: Row[];
  mandates: Row[];
} = { syndicates: [], lots: [], contacts: [], creditors: [], mandates: [] };

const mockAudit = { record: jest.fn(), log: jest.fn() };
const mockCancel = jest.fn();
const mockFiles = { store: jest.fn(), remove: jest.fn() };
const mockCrypto = { available: true };

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (expected === undefined) return true;
    const actual = row[key];
    if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
      if ('in' in expected) return (expected.in as unknown[]).includes(actual);
      if ('not' in expected) return actual !== expected.not;
    }
    return actual === expected;
  });
}

const contactBrief = (id: string | null | undefined) => {
  const contact = state.contacts.find(entry => entry.id === id);
  return contact
    ? {
        id: contact.id,
        contactType: contact.contactType ?? 'PERSON',
        firstName: contact.firstName ?? null,
        lastName: contact.lastName ?? null,
        legalName: contact.legalName ?? null
      }
    : null;
};

function creditorView(row: Row): Row {
  const syndicate = state.syndicates.find(entry => entry.id === row.syndicateId);
  return {
    bankName: null,
    bankAccountRef: null,
    creditorIdentifier: null,
    fileFormat: 'GENERIC_CSV',
    collectionDay: 5,
    prenotificationBusinessDays: 5,
    maxConsecutiveRejects: 2,
    rejectFeeAmount: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...row,
    treasuryAccountId: row.treasuryAccountId ?? null,
    treasuryAccount: null,
    syndicate: syndicate ? { id: syndicate.id, name: syndicate.name } : null,
    _count: { mandates: state.mandates.filter(m => m.creditorId === row.id && m.status !== 'REVOKED').length }
  };
}

function mandateView(row: Row): Row {
  const creditor = state.creditors.find(entry => entry.id === row.creditorId) as Row;
  const lot = state.lots.find(entry => entry.id === row.lotId);
  const syndicate = state.syndicates.find(entry => entry.id === row.syndicateId);
  return {
    ...row,
    creditor: {
      id: creditor.id,
      label: creditor.label,
      creditorIdentifier: creditor.creditorIdentifier ?? null,
      collectionDay: creditor.collectionDay ?? 5
    },
    debtor: row.debtorClientId ? { id: row.debtorClientId, details: null, user: { fullName: 'Locataire' } } : null,
    lease: null,
    debtorContact: contactBrief(row.debtorContactId),
    syndicate: syndicate ? { id: syndicate.id, name: syndicate.name } : null,
    lot: lot ? { id: lot.id, lotNumber: lot.lotNumber } : null
  };
}

const mockDb: Row = {
  $transaction: jest.fn(async (fn: (tx: Row) => unknown) => fn(mockDb)),
  syndicate: {
    findFirst: jest.fn(async ({ where }: Row) => state.syndicates.find(row => matches(row, where)) ?? null)
  },
  syndicateLot: {
    findFirst: jest.fn(async ({ where }: Row) => {
      const lot = state.lots.find(
        row =>
          row.id === where.id &&
          row.syndicateId === where.syndicateId &&
          state.syndicates.some(s => s.id === row.syndicateId && s.tenantId === where.syndicate.tenantId)
      );
      if (!lot) return null;
      const profiles = (lot.ownerProfiles ?? []).filter(
        (profile: Row) => profile.isActive && (profile.ownedUntil === null || profile.ownedUntil > NOW)
      );
      return { ...lot, ownerProfiles: profiles.map((profile: Row) => ({ contactId: profile.contactId })) };
    })
  },
  crmContact: {
    findFirst: jest.fn(async ({ where }: Row) => state.contacts.find(row => matches(row, where)) ?? null),
    findMany: jest.fn(async ({ where }: Row) =>
      state.contacts.filter(row => row.tenantId === where.tenantId && where.id.in.includes(row.id))
    )
  },
  directDebitCreditor: {
    findFirst: jest.fn(async ({ where, select }: Row) => {
      const row = state.creditors.find(entry => matches(entry, where));
      if (!row) return null;
      return select?._count ? creditorView(row) : row;
    }),
    create: jest.fn(async ({ data }: Row) => {
      const row = {
        id: `creditor-${state.creditors.length + 1}`,
        collectionDay: 5,
        prenotificationBusinessDays: 5,
        maxConsecutiveRejects: 2,
        fileFormat: 'GENERIC_CSV',
        createdAt: NOW,
        updatedAt: NOW,
        ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined))
      };
      state.creditors.push(row);
      return { id: row.id };
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const rows = state.creditors.filter(row => matches(row, where));
      rows.forEach(row => Object.assign(row, data));
      return { count: rows.length };
    })
  },
  directDebitMandate: {
    findFirst: jest.fn(async ({ where, orderBy }: Row) => {
      let found = state.mandates.filter(row => matches(row, where));
      if (orderBy?.sequence === 'desc') found = [...found].sort((a, b) => b.sequence - a.sequence);
      return found[0] ? mandateView(found[0]) : null;
    }),
    count: jest.fn(async ({ where }: Row) => state.mandates.filter(row => matches(row, where)).length),
    findMany: jest.fn(async ({ where }: Row) => {
      const { OR: _or, ...rest } = where;
      return state.mandates.filter(row => matches(row, rest)).map(mandateView);
    }),
    create: jest.fn(async ({ data }: Row) => {
      const row = {
        id: `mandate-${state.mandates.length + 1}`,
        status: 'DRAFT',
        consecutiveRejects: 0,
        signedAt: null,
        signedScanUrl: null,
        signedScanUploadedAt: null,
        activatedAt: null,
        suspendedAt: null,
        suspensionReason: null,
        revokedAt: null,
        revocationReason: null,
        createdAt: NOW,
        updatedAt: NOW,
        ...data
      };
      state.mandates.push(row);
      return { id: row.id };
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const rows = state.mandates.filter(row => matches(row, where));
      rows.forEach(row => Object.assign(row, data));
      return { count: rows.length };
    })
  }
};

jest.mock('../../src/utils/database', () => ({ prisma: mockDb }));
jest.mock('../../src/services/audit-service', () => ({
  recordAuditEvent: (...args: unknown[]) => mockAudit.record(...args),
  logAuditEvent: (...args: unknown[]) => mockAudit.log(...args)
}));
jest.mock('../../src/lib/signature/cancel', () => ({
  cancelOpenRequestsForTarget: (...args: unknown[]) => mockCancel(...args)
}));
jest.mock('../../src/lib/direct-debit/iban-crypto', () => ({
  isIbanEncryptionAvailable: () => mockCrypto.available,
  encryptIban: (plain: string) =>
    `ddk1:key:iv:tag:${Buffer.from(plain.split('').reverse().join('')).toString('base64')}`,
  decryptIban: (enc: string) => Buffer.from(enc.split(':')[4], 'base64').toString().split('').reverse().join('')
}));
jest.mock('../../src/lib/direct-debit/mandate-files', () => ({
  ...jest.requireActual('../../src/lib/direct-debit/mandate-files'),
  storeMandateScan: (...args: unknown[]) => mockFiles.store(...args),
  removeMandateScan: (...args: unknown[]) => mockFiles.remove(...args)
}));
jest.mock('../../src/lib/documents/document-branding', () => ({
  ...jest.requireActual('../../src/lib/documents/document-branding'),
  resolveDocumentBranding: async () => ({
    issuer: {
      kind: 'AGENCY',
      name: 'Agence Test',
      legalName: null,
      address: null,
      phone: null,
      email: null,
      rccm: null,
      taxId: null
    },
    issuerLogo: null,
    signature: null,
    stamp: null,
    syndicate: null
  })
}));

import { PDFPage } from 'pdf-lib';
import { BadRequestError, ConflictError, NotFoundError } from '../../src/middleware/error-middleware';
import { generateAuthorizationPdf } from '../../src/lib/direct-debit/authorization-pdf';
import { getSyndicCreditor, upsertSyndicCreditor } from '../../src/lib/direct-debit/syndic/creditors';
import { createSyndicMandate, listLotDebtors, listSyndicMandates } from '../../src/lib/direct-debit/syndic/mandates';
import { syndicCtx } from '../../src/lib/direct-debit/syndic/scope';
import {
  activateMandate,
  getMandate,
  revokeMandate,
  suspendMandate,
  uploadSignedScan
} from '../../src/lib/direct-debit/mandates';
import { listCreditors } from '../../src/lib/direct-debit/creditors';
import {
  activateSyndicMandateSchema,
  createSyndicMandateSchema,
  upsertSyndicCreditorSchema
} from '../../src/lib/direct-debit/schemas';

const lastCall = (fn: jest.Mock): any[] => fn.mock.calls[fn.mock.calls.length - 1];

const pdf = Buffer.from('%PDF-1.4 contenu');

function resetState() {
  state.syndicates = [
    { id: SYN, tenantId: TENANT, name: 'Résidence Les Palmiers' },
    { id: SYN2, tenantId: TENANT, name: 'Résidence Les Acacias' },
    { id: SYN_X, tenantId: OTHER_TENANT, name: 'Résidence étrangère' }
  ];
  state.lots = [
    {
      id: LOT1,
      syndicateId: SYN,
      lotNumber: 'A12',
      ownerContactId: 'ct-1',
      coownerId: 'ct-2',
      ownerProfiles: [
        { contactId: 'ct-3', isActive: true, ownedUntil: null },
        { contactId: 'ct-4', isActive: true, ownedUntil: new Date('2026-01-01T00:00:00Z') },
        { contactId: 'ct-5', isActive: false, ownedUntil: null },
        { contactId: 'ct-x', isActive: true, ownedUntil: null }
      ]
    },
    { id: LOT2, syndicateId: SYN, lotNumber: 'B03', ownerContactId: 'ct-1', coownerId: null, ownerProfiles: [] },
    { id: LOT_OTHER_SYNDIC, syndicateId: SYN2, lotNumber: 'Z99', ownerContactId: 'ct-1', ownerProfiles: [] }
  ];
  state.contacts = [
    { id: 'ct-1', tenantId: TENANT, firstName: 'Awa', lastName: 'Traoré', email: 'awa@example.ci' },
    { id: 'ct-2', tenantId: TENANT, firstName: 'Koffi', lastName: 'Yao', email: null },
    { id: 'ct-3', tenantId: TENANT, contactType: 'COMPANY', legalName: 'SCI Soleil', email: ' ' },
    { id: 'ct-4', tenantId: TENANT, firstName: 'Ancien', lastName: 'Propriétaire', email: 'a@example.ci' },
    { id: 'ct-5', tenantId: TENANT, firstName: 'Inactif', lastName: 'Profil', email: 'i@example.ci' },
    { id: 'ct-x', tenantId: OTHER_TENANT, firstName: 'Étranger', lastName: 'Autre', email: 'x@example.ci' },
    { id: 'ct-6', tenantId: TENANT, firstName: 'Pas', lastName: 'Copropriétaire', email: 'p@example.ci' }
  ];
  state.creditors = [
    {
      id: CREDITOR,
      tenantId: TENANT,
      scope: 'SYNDIC_LOT',
      syndicateId: SYN,
      label: 'Compte du syndicat',
      isActive: true,
      collectionDay: 5,
      creditorIdentifier: 'CI-SYN-001'
    }
  ];
  state.mandates = [];
  mockCrypto.available = true;
}

/** Aucun des champs interdits n'apparaît nulle part dans un objet renvoyé. */
function expectNoLeak(value: unknown) {
  const text = JSON.stringify(value);
  expect(text).not.toContain(IBAN);
  expect(text).not.toContain('0080111301134291200589');
  expect(text).not.toContain('ibanEncrypted');
  expect(text).not.toContain('ddk1:');
  expect(text).not.toContain('signedScanUrl');
  expect(text).not.toContain('/uploads/');
}

const input = (over: Row = {}) =>
  createSyndicMandateSchema.parse({
    lotId: LOT1,
    debtorContactId: 'ct-1',
    iban: IBAN,
    holderName: 'Awa Traoré',
    ...over
  });

async function draft(over: Row = {}) {
  const { mandate } = await createSyndicMandate(TENANT, SYN, input(over), 'user-1', NOW);
  return mandate;
}

beforeEach(() => {
  jest.clearAllMocks();
  resetState();
  mockCancel.mockResolvedValue(0);
  mockFiles.store.mockResolvedValue('/uploads/rental/direct-debit/tenant-a/mandate-1/nouveau.pdf');
  mockFiles.remove.mockResolvedValue(undefined);
});

describe('syndic / créancier du syndicat', () => {
  it('le crée au premier PUT : périmètre SYNDIC_LOT, sans compte de trésorerie, frais de rejet à 0', async () => {
    state.creditors = [];
    const dto = await upsertSyndicCreditor(
      TENANT,
      SYN,
      upsertSyndicCreditorSchema.parse({
        label: '  Compte du syndicat  ',
        bankName: 'Banque Atlantique',
        bankAccountRef: 'CI008 01113 0113',
        creditorIdentifier: 'CI-SYN-009',
        collectionDay: 10
      }),
      'user-1'
    );

    expect(mockDb.directDebitCreditor.create.mock.calls[0][0].data).toMatchObject({
      tenantId: TENANT,
      scope: 'SYNDIC_LOT',
      syndicateId: SYN,
      rejectFeeAmount: 0,
      createdByUserId: 'user-1'
    });
    expect(mockDb.directDebitCreditor.create.mock.calls[0][0].data.treasuryAccountId).toBeUndefined();
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKey: 'DIRECT_DEBIT_CREDITOR_CREATED',
        payload: expect.objectContaining({ scope: 'SYNDIC_LOT', syndicateId: SYN })
      })
    );
    expect(dto).toMatchObject({
      scope: 'SYNDIC_LOT',
      label: 'Compte du syndicat',
      treasuryAccountId: null,
      treasuryAccountLabel: null,
      syndicate: { id: SYN, name: 'Résidence Les Palmiers' }
    });
  });

  it('un second PUT met à jour le même créancier (un seul par syndicat), un champ absent reste inchangé', async () => {
    const dto = await upsertSyndicCreditor(
      TENANT,
      SYN,
      upsertSyndicCreditorSchema.parse({ label: 'Compte principal', maxConsecutiveRejects: 3 }),
      'user-1'
    );
    expect(mockDb.directDebitCreditor.create).not.toHaveBeenCalled();
    expect(state.creditors).toHaveLength(1);
    expect(state.creditors[0]).toMatchObject({ label: 'Compte principal', maxConsecutiveRejects: 3, collectionDay: 5 });
    expect(dto.id).toBe(CREDITOR);
    expect(mockDb.directDebitCreditor.updateMany.mock.calls[0][0].where).toEqual({
      id: CREDITOR,
      tenantId: TENANT,
      scope: 'SYNDIC_LOT',
      syndicateId: SYN
    });
  });

  it('un syndicat d une autre agence ou inconnu est introuvable (404), en lecture comme en écriture', async () => {
    await expect(
      upsertSyndicCreditor(TENANT, SYN_X, upsertSyndicCreditorSchema.parse({ label: 'X' }))
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(getSyndicCreditor(TENANT, SYN_X)).rejects.toBeInstanceOf(NotFoundError);
    expect(state.creditors).toHaveLength(1);
  });

  it('refuse les frais de rejet et tout champ inconnu', () => {
    expect(upsertSyndicCreditorSchema.safeParse({ label: 'A', rejectFeeAmount: 5000 }).success).toBe(false);
    expect(upsertSyndicCreditorSchema.safeParse({ label: 'A', tenantId: 'x' }).success).toBe(false);
    expect(upsertSyndicCreditorSchema.safeParse({ label: '' }).success).toBe(false);
    expect(upsertSyndicCreditorSchema.safeParse({ label: 'A', bankName: 'B'.repeat(121) }).success).toBe(false);
    expect(upsertSyndicCreditorSchema.safeParse({ label: 'A', bankAccountRef: 'R'.repeat(65) }).success).toBe(false);
    expect(upsertSyndicCreditorSchema.safeParse({ label: 'A', collectionDay: 29 }).success).toBe(false);
    expect(upsertSyndicCreditorSchema.safeParse({ label: 'A', prenotificationBusinessDays: 31 }).success).toBe(false);
    expect(upsertSyndicCreditorSchema.safeParse({ label: 'A', maxConsecutiveRejects: 11 }).success).toBe(false);
    expect(upsertSyndicCreditorSchema.safeParse({ label: 'A\nB' }).success).toBe(false);
  });

  it('la liste des créanciers locatifs ne voit que le périmètre RENTAL_LEASE', async () => {
    mockDb.directDebitCreditor.findMany = jest.fn(async () => []);
    await listCreditors(TENANT);
    expect(mockDb.directDebitCreditor.findMany.mock.calls[0][0].where).toEqual({
      tenantId: TENANT,
      scope: 'RENTAL_LEASE'
    });
  });
});

describe('syndic / copropriétaires d un lot', () => {
  it('liste propriétaire, co-propriétaire et profils en cours ; ni ancien propriétaire, ni profil inactif, ni autre agence', async () => {
    const debtors = await listLotDebtors(TENANT, SYN, LOT1, NOW);
    expect(debtors.map(entry => entry.contactId).sort()).toEqual(['ct-1', 'ct-2', 'ct-3']);
    expect(debtors.find(entry => entry.contactId === 'ct-1')).toEqual({
      contactId: 'ct-1',
      displayName: 'Awa Traoré',
      hasEmail: true
    });
    // Aucune adresse n est renvoyée, seulement sa présence.
    expect(JSON.stringify(debtors)).not.toContain('@');
    expect(debtors.find(entry => entry.contactId === 'ct-2')?.hasEmail).toBe(false);
    expect(debtors.find(entry => entry.contactId === 'ct-3')).toMatchObject({
      displayName: 'SCI Soleil',
      hasEmail: false
    });
  });

  it('un lot d un autre syndicat ou une copropriété d une autre agence est introuvable', async () => {
    await expect(listLotDebtors(TENANT, SYN, LOT_OTHER_SYNDIC, NOW)).rejects.toBeInstanceOf(NotFoundError);
    await expect(listLotDebtors(TENANT, SYN_X, LOT1, NOW)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('syndic / création d un mandat', () => {
  it('crée un brouillon de copropriété : lot, contact débiteur, emplacement lot:<lot>:<créancier>, IBAN chiffré', async () => {
    const { mandate } = await createSyndicMandate(TENANT, SYN, input(), 'user-1', NOW);

    expect(mandate).toMatchObject({
      reference: 'MDT-2026-0001',
      scope: 'SYNDIC_LOT',
      status: 'DRAFT',
      debtor: { id: 'ct-1', displayName: 'Awa Traoré', kind: 'CONTACT' },
      lease: null,
      syndicate: { id: SYN, name: 'Résidence Les Palmiers' },
      lot: { id: LOT1, lotNumber: 'A12' },
      ibanMasked: expect.stringContaining('0589'),
      bankCode: 'CI008',
      effectiveCollectionDay: 5
    });
    expectNoLeak(mandate);

    const stored = state.mandates[0];
    expect(stored).toMatchObject({
      tenantId: TENANT,
      scope: 'SYNDIC_LOT',
      syndicateId: SYN,
      lotId: LOT1,
      debtorContactId: 'ct-1',
      creditorId: CREDITOR,
      openSlotKey: `lot:${LOT1}:${CREDITOR}`
    });
    expect(stored.debtorClientId).toBeUndefined();
    expect(stored.leaseId).toBeUndefined();
    expect(stored.ibanEncrypted).not.toContain(IBAN);
  });

  it('audite sans jamais écrire l IBAN, avec le périmètre et le syndicat', async () => {
    await draft();
    const event = mockAudit.record.mock.calls[0][1];
    expect(event.actionKey).toBe('DIRECT_DEBIT_MANDATE_CREATED');
    expect(event.payload).toMatchObject({
      scope: 'SYNDIC_LOT',
      syndicateId: SYN,
      lotId: LOT1,
      debtorContactId: 'ct-1',
      bankCode: 'CI008',
      last4Digits: '0589'
    });
    expectNoLeak(event);
  });

  it('accepte le co-propriétaire et un profil propriétaire en cours', async () => {
    await expect(draft({ debtorContactId: 'ct-2' })).resolves.toMatchObject({ debtor: { id: 'ct-2' } });
    await expect(draft({ lotId: LOT1, debtorContactId: 'ct-3', iban: IBAN })).rejects.toBeInstanceOf(ConflictError);
  });

  it('un contact qui n est pas copropriétaire du lot est introuvable (404)', async () => {
    for (const debtorContactId of ['ct-6', 'ct-4', 'ct-5', 'ct-x', 'inconnu']) {
      await expect(draft({ debtorContactId })).rejects.toBeInstanceOf(NotFoundError);
    }
    // Un contact d une autre agence reste refusé même s il figure sur le lot (profil ct-x).
    expect(state.mandates).toHaveLength(0);
  });

  it('un lot hors du syndicat de la route, ou une copropriété d une autre agence, est introuvable (404)', async () => {
    await expect(draft({ lotId: LOT_OTHER_SYNDIC })).rejects.toBeInstanceOf(NotFoundError);
    await expect(createSyndicMandate(TENANT, SYN_X, input(), 'user-1', NOW)).rejects.toBeInstanceOf(NotFoundError);
    expect(state.mandates).toHaveLength(0);
  });

  it('un seul mandat ouvert par lot ; un lot voisin ou un lot révoqué se mandate à nouveau', async () => {
    const first = await draft();
    await expect(draft({ debtorContactId: 'ct-2' })).rejects.toBeInstanceOf(ConflictError);
    await expect(draft({ lotId: LOT2 })).resolves.toMatchObject({ lot: { id: LOT2 } });

    await revokeMandate(TENANT, first.id, { reason: 'Vente du lot' }, 'user-1', syndicCtx(SYN));
    await expect(draft({ debtorContactId: 'ct-2' })).resolves.toMatchObject({ status: 'DRAFT' });
    expect(state.mandates.find(entry => entry.id === first.id)?.openSlotKey).toBeNull();
  });

  it('exige un créancier actif pour le syndicat', async () => {
    state.creditors = [];
    await expect(draft()).rejects.toBeInstanceOf(BadRequestError);
    state.creditors = [
      { id: CREDITOR, tenantId: TENANT, scope: 'SYNDIC_LOT', syndicateId: SYN, label: 'C', isActive: false }
    ];
    await expect(draft()).rejects.toBeInstanceOf(BadRequestError);
    // Le créancier d un autre syndicat ne sert pas.
    state.creditors = [
      { id: CREDITOR, tenantId: TENANT, scope: 'SYNDIC_LOT', syndicateId: SYN2, label: 'C', isActive: true }
    ];
    await expect(draft()).rejects.toBeInstanceOf(BadRequestError);
  });

  it('refuse un IBAN invalide et l absence de clé de chiffrement, sans rien écrire', async () => {
    await expect(draft({ iban: 'CI00 pas un iban' })).rejects.toBeInstanceOf(BadRequestError);
    mockCrypto.available = false;
    await expect(draft()).rejects.toBeInstanceOf(BadRequestError);
    expect(state.mandates).toHaveLength(0);
  });

  it('le schéma refuse un champ inconnu (agence, créancier, bail) et un lot sans identifiant', () => {
    expect(
      createSyndicMandateSchema.safeParse({
        lotId: LOT1,
        debtorContactId: 'ct-1',
        iban: IBAN,
        holderName: 'A',
        tenantId: 'x'
      }).success
    ).toBe(false);
    expect(
      createSyndicMandateSchema.safeParse({
        lotId: 'pas-un-uuid',
        debtorContactId: 'ct-1',
        iban: IBAN,
        holderName: 'A'
      }).success
    ).toBe(false);
  });
});

describe('syndic / lecture et étanchéité des périmètres', () => {
  it('la liste ne renvoie que les mandats du syndicat, filtrable par lot et statut, sans IBAN', async () => {
    await draft();
    await draft({ lotId: LOT2 });
    state.mandates.push({
      ...state.mandates[0],
      id: 'mandate-autre',
      syndicateId: SYN2,
      lotId: LOT_OTHER_SYNDIC,
      sequence: 9,
      openSlotKey: 'autre'
    });
    state.mandates.push({
      ...state.mandates[0],
      id: 'mandate-loyer',
      scope: 'RENTAL_LEASE',
      sequence: 10,
      openSlotKey: 'x'
    });

    const all = await listSyndicMandates(TENANT, SYN, { page: 1, pageSize: 20 });
    expect(all.total).toBe(2);
    expect(all.items.map(item => item.lot?.lotNumber).sort()).toEqual(['A12', 'B03']);
    expectNoLeak(all);

    const byLot = await listSyndicMandates(TENANT, SYN, { page: 1, pageSize: 20, lotId: LOT2 });
    expect(byLot.items.map(item => item.lot?.id)).toEqual([LOT2]);
    expect(lastCall(mockDb.directDebitMandate.findMany)[0].where).toMatchObject({
      tenantId: TENANT,
      scope: 'SYNDIC_LOT',
      syndicateId: SYN,
      lotId: LOT2
    });
    await expect(listSyndicMandates(TENANT, SYN_X, { page: 1, pageSize: 20 })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('un mandat de copropriété est introuvable côté locatif, et inversement ou depuis un autre syndicat', async () => {
    const mandate = await draft();
    await expect(getMandate(TENANT, mandate.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getMandate(TENANT, mandate.id, syndicCtx(SYN2))).rejects.toBeInstanceOf(NotFoundError);
    await expect(getMandate(OTHER_TENANT, mandate.id, syndicCtx(SYN))).rejects.toBeInstanceOf(NotFoundError);
    await expect(getMandate(TENANT, mandate.id, syndicCtx(SYN))).resolves.toMatchObject({ id: mandate.id });

    state.mandates.push({
      ...state.mandates[0],
      id: 'mandate-loyer',
      scope: 'RENTAL_LEASE',
      syndicateId: null,
      openSlotKey: 'x'
    });
    await expect(getMandate(TENANT, 'mandate-loyer', syndicCtx(SYN))).rejects.toBeInstanceOf(NotFoundError);
  });

  it('les transitions et le scan sont refusés (404) hors du périmètre du syndicat', async () => {
    const mandate = await draft();
    await expect(suspendMandate(TENANT, mandate.id, { reason: 'x' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(revokeMandate(TENANT, mandate.id, { reason: 'x' }, 'u', syndicCtx(SYN2))).rejects.toBeInstanceOf(
      NotFoundError
    );
    await expect(uploadSignedScan(TENANT, mandate.id, { buffer: pdf }, 'u', syndicCtx(SYN2))).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(state.mandates[0].status).toBe('DRAFT');
    expect(mockFiles.store).not.toHaveBeenCalled();
  });
});

describe('syndic / activation et signature électronique (préparation)', () => {
  it('exige le scan signé, puis la date de signature si le mandat n en porte pas', async () => {
    const mandate = await draft();
    const ctx = syndicCtx(SYN);
    await expect(activateMandate(TENANT, mandate.id, {}, 'user-1', ctx)).rejects.toBeInstanceOf(BadRequestError);

    await uploadSignedScan(TENANT, mandate.id, { buffer: pdf }, 'user-1', ctx);
    await expect(activateMandate(TENANT, mandate.id, {}, 'user-1', ctx)).rejects.toThrow(/date de signature/i);
    expect(state.mandates[0].status).toBe('DRAFT');

    const signedAt = new Date('2026-10-10T00:00:00Z');
    const active = await activateMandate(
      TENANT,
      mandate.id,
      activateSyndicMandateSchema.parse({ signedAt: '2026-10-10' }),
      'user-1',
      ctx
    );
    expect(active).toMatchObject({ status: 'ACTIVE', signedAt: signedAt.toISOString() });
    expect(lastCall(mockAudit.record)[1].payload).toMatchObject({ scope: 'SYNDIC_LOT', syndicateId: SYN });
  });

  it('active sans signedAt un mandat déjà daté, en conservant la date', async () => {
    const mandate = await draft();
    const ctx = syndicCtx(SYN);
    await uploadSignedScan(TENANT, mandate.id, { buffer: pdf }, 'user-1', ctx);
    state.mandates[0].signedAt = new Date('2026-10-08T00:00:00Z');

    const active = await activateMandate(TENANT, mandate.id, {}, 'user-1', ctx);
    expect(active).toMatchObject({ status: 'ACTIVE', signedAt: '2026-10-08T00:00:00.000Z' });
    // La mise à jour n écrase pas la date existante.
    expect(lastCall(mockDb.directDebitMandate.updateMany)[0].data).not.toHaveProperty('signedAt');
  });

  it('parcours signé puis activé : le scan signature:<id> posé au scellement s active avec la date préremplie, sans nouveau scan', async () => {
    const mandate = await draft();
    const ctx = syndicCtx(SYN);
    // État laissé par onSealed (source de signature) : scan électronique, date de dernière signature, demande liée.
    Object.assign(state.mandates[0], {
      signedScanUrl: 'signature:33333333-3333-4333-8333-333333333333',
      signedScanUploadedAt: new Date('2026-10-12T09:00:00Z'),
      signedAt: new Date('2026-10-12T08:30:00Z'),
      signatureRequestId: '33333333-3333-4333-8333-333333333333'
    });

    const body = activateSyndicMandateSchema.parse({});
    const active = await activateMandate(TENANT, mandate.id, body, 'user-1', ctx);
    expect(active).toMatchObject({ status: 'ACTIVE', signedAt: '2026-10-12T08:30:00.000Z' });
    expect(lastCall(mockDb.directDebitMandate.updateMany)[0].data).not.toHaveProperty('signedAt');
    expect(lastCall(mockAudit.record)[1].payload).toMatchObject({
      scope: 'SYNDIC_LOT',
      signedAt: '2026-10-12T08:30:00.000Z'
    });
    // Aucun fichier n'a été déposé à la main et aucune annulation de demande n'a eu lieu.
    expect(mockFiles.store).not.toHaveBeenCalled();
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it('le schéma d activation accepte l absence de signedAt, refuse une date future et un champ inconnu', () => {
    expect(activateSyndicMandateSchema.safeParse({}).success).toBe(true);
    expect(activateSyndicMandateSchema.safeParse({ signedAt: '2999-01-01' }).success).toBe(false);
    expect(activateSyndicMandateSchema.safeParse({ extra: 1 }).success).toBe(false);
  });

  it('la révocation annule les demandes de signature ouvertes du mandat ; un échec d annulation ne défait pas la révocation', async () => {
    const mandate = await draft();
    const revoked = await revokeMandate(TENANT, mandate.id, { reason: 'Départ' }, 'user-1', syndicCtx(SYN));
    expect(revoked.status).toBe('REVOKED');
    expect(mockCancel).toHaveBeenCalledWith({ tenantId: TENANT, userId: 'user-1' }, 'DIRECT_DEBIT_MANDATE', mandate.id);

    const second = await draft({ lotId: LOT2 });
    mockCancel.mockRejectedValueOnce(new Error('fournisseur injoignable'));
    await expect(
      revokeMandate(TENANT, second.id, { reason: 'Départ' }, 'user-1', syndicCtx(SYN))
    ).resolves.toMatchObject({
      status: 'REVOKED'
    });
  });

  it('le dépôt d un scan à la main annule aussi les demandes de signature ouvertes', async () => {
    const mandate = await draft();
    await uploadSignedScan(TENANT, mandate.id, { buffer: pdf }, 'user-1', syndicCtx(SYN));
    expect(mockCancel).toHaveBeenCalledWith({ tenantId: TENANT, userId: 'user-1' }, 'DIRECT_DEBIT_MANDATE', mandate.id);
    expect(mockFiles.store).toHaveBeenCalledTimes(1);
  });
});

describe('syndic / PDF d autorisation', () => {
  it('mentionne le syndicat, le lot et les appels de charges ; jamais de bail ; trace sans IBAN', async () => {
    const mandate = await draft();
    const drawn: string[] = [];
    const spy = jest.spyOn(PDFPage.prototype, 'drawText').mockImplementation(function (this: unknown, text: string) {
      drawn.push(text);
    } as never);
    try {
      mockDb.directDebitMandate.findFirst.mockImplementationOnce(async ({ where }: Row) => {
        expect(where).toMatchObject({ id: mandate.id, tenantId: TENANT, scope: 'SYNDIC_LOT', syndicateId: SYN });
        return {
          ...state.mandates[0],
          creditor: {
            label: 'Compte du syndicat',
            creditorIdentifier: 'CI-SYN-001',
            collectionDay: 5,
            bankName: 'Banque Atlantique',
            treasuryAccount: null
          },
          debtor: null,
          lease: null,
          debtorContact: contactBrief('ct-1'),
          syndicate: { name: 'Résidence Les Palmiers' },
          lot: { lotNumber: 'A12' }
        };
      });
      const file = await generateAuthorizationPdf(TENANT, mandate.id, 'user-1', syndicCtx(SYN));
      expect(file.buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(file.fileName).toContain('MDT-2026-0001');
    } finally {
      spy.mockRestore();
    }
    const text = drawn.join(' ');
    expect(text).toContain('Résidence Les Palmiers');
    expect(text).toContain('A12');
    expect(text).toMatch(/appels de charges de copropriété de ce lot/);
    expect(text).not.toMatch(/Bail|loyer/);
    // Le PDF porte l IBAN complet (c est son objet) ; la trace d audit, jamais.
    const event = lastCall(mockAudit.record)[1];
    expect(event.actionKey).toBe('DIRECT_DEBIT_MANDATE_AUTHORIZATION_DOWNLOADED');
    expect(event.payload).toMatchObject({ scope: 'SYNDIC_LOT', syndicateId: SYN, last4Digits: '0589' });
    expectNoLeak(event);
  });

  it('un mandat hors périmètre ne produit aucun PDF (404)', async () => {
    const mandate = await draft();
    mockDb.directDebitMandate.findFirst.mockImplementationOnce(async () => null);
    await expect(generateAuthorizationPdf(TENANT, mandate.id, 'user-1')).rejects.toBeInstanceOf(NotFoundError);
  });
});
