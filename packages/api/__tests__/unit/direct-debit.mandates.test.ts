/**
 * Mandats de prélèvement bancaire — spec 042, P1 (PB2, PB3).
 *
 * Prisma est remplacé par un petit magasin en mémoire qui applique les filtres
 * d'agence (`tenantId` / `tenant_id`) comme la vraie base : une référence
 * d'une autre agence doit donc se comporter comme un objet inexistant.
 */

const IBAN = 'CI93CI0080111301134291200589';
const RIB = 'CI0080111301134291200589';
const TENANT = 'tenant-a';
const OTHER_TENANT = 'tenant-b';
const CREDITOR = '11111111-1111-4111-8111-111111111111';
const LEASE = '22222222-2222-4222-8222-222222222222';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const mockState: {
  creditors: Row[];
  leases: Row[];
  clients: Row[];
  mandates: Row[];
  failNextCreate: unknown;
  failUpdateMany: boolean;
} = { creditors: [], leases: [], clients: [], mandates: [], failNextCreate: null, failUpdateMany: false };

const mockAudit = { record: jest.fn(), log: jest.fn() };
const mockCrypto = { available: true };
const mockFiles = { store: jest.fn(), remove: jest.fn() };

function matches(row: Row, where: Row): boolean {
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

function mandateView(row: Row, select?: Row): Row {
  if (!select || !select.creditor) return { ...row };
  const creditor = mockState.creditors.find(c => c.id === row.creditorId);
  const lease = mockState.leases.find(l => l.id === row.leaseId);
  return {
    ...row,
    creditor: creditor && {
      id: creditor.id,
      label: creditor.label,
      creditorIdentifier: creditor.creditorIdentifier ?? null,
      collectionDay: creditor.collectionDay ?? 5
    },
    debtor: { id: row.debtorClientId, details: null, user: { fullName: 'Awa Traoré' } },
    lease: lease && { id: lease.id, lease_number: lease.lease_number, status: lease.status }
  };
}

const mockDb: Row = {
  $transaction: jest.fn(async (fn: (tx: Row) => unknown) => fn(mockDb)),
  directDebitCreditor: {
    findFirst: jest.fn(async ({ where }: Row) => mockState.creditors.find(r => matches(r, where)) ?? null)
  },
  rentalLease: {
    findFirst: jest.fn(async ({ where }: Row) => mockState.leases.find(r => matches(r, where)) ?? null)
  },
  tenantClient: {
    findFirst: jest.fn(async ({ where }: Row) => mockState.clients.find(r => matches(r, where)) ?? null)
  },
  crmContact: { findMany: jest.fn(async () => []) },
  directDebitMandate: {
    findFirst: jest.fn(async ({ where, select, orderBy }: Row) => {
      let found = mockState.mandates.filter(r => matches(r, where));
      if (orderBy?.sequence === 'desc') found = [...found].sort((a, b) => b.sequence - a.sequence);
      return found[0] ? mandateView(found[0], select) : null;
    }),
    count: jest.fn(async ({ where }: Row) => mockState.mandates.filter(r => matches(r, where)).length),
    findMany: jest.fn(async ({ where, select }: Row) =>
      mockState.mandates.filter(r => matches(r, where)).map(r => mandateView(r, select))
    ),
    create: jest.fn(async ({ data }: Row) => {
      if (mockState.failNextCreate) {
        const error = mockState.failNextCreate;
        mockState.failNextCreate = null;
        throw error;
      }
      const row = {
        id: `mandate-${mockState.mandates.length + 1}`,
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
        createdAt: new Date('2026-10-15T10:00:00Z'),
        updatedAt: new Date('2026-10-15T10:00:00Z'),
        ...data
      };
      mockState.mandates.push(row);
      return { id: row.id };
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      if (mockState.failUpdateMany) return { count: 0 };
      const rows = mockState.mandates.filter(r => matches(r, where));
      rows.forEach(r => Object.assign(r, data));
      return { count: rows.length };
    })
  }
};

jest.mock('../../src/utils/database', () => ({ prisma: mockDb }));
jest.mock('../../src/services/audit-service', () => ({
  recordAuditEvent: (...args: unknown[]) => mockAudit.record(...args),
  logAuditEvent: (...args: unknown[]) => mockAudit.log(...args)
}));
jest.mock('../../src/lib/direct-debit/iban-crypto', () => ({
  isIbanEncryptionAvailable: () => mockCrypto.available,
  // Texte chiffré factice : ne contient jamais l'IBAN en clair.
  encryptIban: (plain: string) =>
    `ddk1:key:iv:tag:${Buffer.from(plain.split('').reverse().join('')).toString('base64')}`,
  decryptIban: (enc: string) => Buffer.from(enc.split(':')[4], 'base64').toString().split('').reverse().join('')
}));
jest.mock('../../src/lib/direct-debit/mandate-files', () => ({
  ...jest.requireActual('../../src/lib/direct-debit/mandate-files'),
  storeMandateScan: (...args: unknown[]) => mockFiles.store(...args),
  removeMandateScan: (...args: unknown[]) => mockFiles.remove(...args)
}));

import { BadRequestError, ConflictError, NotFoundError } from '../../src/middleware/error-middleware';
import {
  activateMandate,
  checkIban,
  createMandate,
  getMandate,
  listMandates,
  reactivateMandate,
  revokeMandate,
  suspendMandate,
  updateMandate,
  uploadSignedScan
} from '../../src/lib/direct-debit/mandates';

const pdf = Buffer.from('%PDF-1.4 contenu');

const baseInput = (over: Row = {}) => ({
  creditorId: CREDITOR,
  leaseId: LEASE,
  debtorClientId: 'client-1',
  iban: IBAN,
  holderName: 'Awa Traoré',
  ...over
});

function resetState() {
  mockState.creditors = [{ id: CREDITOR, tenantId: TENANT, label: 'Compte loyers', isActive: true, collectionDay: 5 }];
  mockState.leases = [
    {
      id: LEASE,
      tenant_id: TENANT,
      lease_number: 'BAIL-001',
      status: 'ACTIVE',
      primary_renter_client_id: 'client-1',
      coRenters: [{ renter_client_id: 'client-2' }]
    }
  ];
  mockState.clients = [
    { id: 'client-1', tenantId: TENANT },
    { id: 'client-2', tenantId: TENANT },
    { id: 'client-3', tenantId: TENANT },
    { id: 'client-x', tenantId: OTHER_TENANT }
  ];
  mockState.mandates = [];
  mockState.failNextCreate = null;
  mockState.failUpdateMany = false;
  mockCrypto.available = true;
}

/** Aucun des champs interdits n'apparaît nulle part dans un objet renvoyé. */
function expectNoLeak(value: unknown) {
  const text = JSON.stringify(value);
  expect(text).not.toContain(IBAN);
  expect(text).not.toContain(RIB);
  expect(text).not.toContain('0080111301134291200589');
  expect(text).not.toContain('ibanEncrypted');
  expect(text).not.toContain('ddk1:');
  expect(text).not.toContain('signedScanUrl');
  expect(text).not.toContain('/uploads/');
}

async function createDraft(over: Row = {}) {
  const { mandate } = await createMandate(TENANT, baseInput(over), 'user-1');
  return mandate;
}

beforeEach(() => {
  jest.clearAllMocks();
  resetState();
  mockFiles.store.mockResolvedValue('/uploads/rental/direct-debit/tenant-a/mandate-1/nouveau.pdf');
  mockFiles.remove.mockResolvedValue(undefined);
});

describe('direct-debit / création', () => {
  it('crée un brouillon référencé MDT-AAAA-NNNN, IBAN chiffré et masqué', async () => {
    const { mandate, warnings } = await createMandate(TENANT, baseInput(), 'user-1');

    const year = new Date().getFullYear();
    expect(mandate.reference).toBe(`MDT-${year}-0001`);
    expect(mandate.status).toBe('DRAFT');
    expect(mandate.scope).toBe('RENTAL_LEASE');
    expect(mandate.ibanMasked).toBe('CI•• •••• •••• •••• •••• 0589');
    expect(mandate.bankCode).toBe('CI008');
    expect(mandate.hasSignedScan).toBe(false);
    expect(mandate.effectiveCollectionDay).toBe(5);
    expect(mandate.debtor).toEqual({ id: 'client-1', displayName: 'Awa Traoré' });
    expect(mandate.lease).toEqual({ id: LEASE, leaseNumber: 'BAIL-001', status: 'ACTIVE' });
    expect(Array.isArray(warnings)).toBe(true);

    const stored = mockState.mandates[0];
    expect(stored.ibanEncrypted).toMatch(/^ddk1:/);
    expect(stored.ibanEncrypted).not.toContain(IBAN);
    expect(stored.ibanLast4).toBe('0589');
    expect(stored.openSlotKey).toBe(`${LEASE}:${CREDITOR}`);
    expect(stored.tenantId).toBe(TENANT);
    expectNoLeak(mandate);
    expectNoLeak(warnings);
  });

  it('numérote en séquence et accepte un RIB de 24 caractères', async () => {
    await createDraft();
    await revokeMandate(TENANT, 'mandate-1', { reason: 'Test' });
    const second = await createDraft({ iban: RIB });
    expect(second.reference.endsWith('-0002')).toBe(true);
    expect(mockState.mandates[1].ibanLast4).toBe('0589');
  });

  it("n'écrit aucun IBAN dans la charge utile d'audit", async () => {
    await createDraft();
    expect(mockAudit.record).toHaveBeenCalledTimes(1);
    const entry = mockAudit.record.mock.calls[0][1];
    expect(entry.actionKey).toBe('DIRECT_DEBIT_MANDATE_CREATED');
    expect(entry.payload).toMatchObject({ bankCode: 'CI008', last4Digits: '0589' });
    expectNoLeak(entry);
  });

  it('refuse un IBAN invalide sans rien écrire', async () => {
    await expect(createMandate(TENANT, baseInput({ iban: 'CI94CI0080111301134291200589' }))).rejects.toBeInstanceOf(
      BadRequestError
    );
    expect(mockDb.$transaction).not.toHaveBeenCalled();
    expect(mockState.mandates).toHaveLength(0);
  });

  it('chiffrement indisponible : BadRequestError traduite, rien écrit', async () => {
    mockCrypto.available = false;
    await expect(createMandate(TENANT, baseInput())).rejects.toThrow(
      "Le chiffrement des coordonnées bancaires n'est pas configuré sur ce serveur."
    );
    await expect(createMandate(TENANT, baseInput())).rejects.toBeInstanceOf(BadRequestError);
    expect(mockDb.$transaction).not.toHaveBeenCalled();
    expect(mockDb.directDebitMandate.create).not.toHaveBeenCalled();
    expect(mockAudit.record).not.toHaveBeenCalled();
  });

  it("une référence d'une autre agence est un NotFoundError, comme un objet inexistant", async () => {
    // Créancier d'une autre agence.
    mockState.creditors[0].tenantId = OTHER_TENANT;
    await expect(createMandate(TENANT, baseInput())).rejects.toBeInstanceOf(NotFoundError);
    resetState();

    // Bail d'une autre agence.
    mockState.leases[0].tenant_id = OTHER_TENANT;
    await expect(createMandate(TENANT, baseInput())).rejects.toBeInstanceOf(NotFoundError);
    resetState();

    // Débiteur d'une autre agence.
    await expect(createMandate(TENANT, baseInput({ debtorClientId: 'client-x' }))).rejects.toBeInstanceOf(
      NotFoundError
    );
    // Identifiants inexistants : même erreur, même message.
    const missing = await createMandate(TENANT, baseInput({ debtorClientId: 'inconnu' })).catch(e => e);
    const foreign = await createMandate(TENANT, baseInput({ debtorClientId: 'client-x' })).catch(e => e);
    expect(missing).toBeInstanceOf(NotFoundError);
    expect(foreign.message).toBe(missing.message);
    expect(mockState.mandates).toHaveLength(0);
  });

  it('refuse un bail terminé ou résilié', async () => {
    for (const status of ['ENDED', 'CANCELED']) {
      mockState.leases[0].status = status;
      await expect(createMandate(TENANT, baseInput())).rejects.toBeInstanceOf(BadRequestError);
    }
    expect(mockState.mandates).toHaveLength(0);
  });

  it('refuse un débiteur qui ne fait pas partie du bail, accepte un colocataire', async () => {
    await expect(createMandate(TENANT, baseInput({ debtorClientId: 'client-3' }))).rejects.toBeInstanceOf(
      BadRequestError
    );
    const coRenter = await createDraft({ debtorClientId: 'client-2' });
    expect(coRenter.debtor.id).toBe('client-2');
  });

  it('refuse un créancier désactivé', async () => {
    mockState.creditors[0].isActive = false;
    await expect(createMandate(TENANT, baseInput())).rejects.toBeInstanceOf(BadRequestError);
  });

  it('un seul mandat ouvert par (bail, créancier), jusqu à sa révocation', async () => {
    const first = await createDraft();
    await expect(createMandate(TENANT, baseInput())).rejects.toThrow(ConflictError);
    await expect(createMandate(TENANT, baseInput())).rejects.toThrow(
      'Un mandat ouvert existe déjà pour ce bail et ce créancier.'
    );

    await revokeMandate(TENANT, first.id, { reason: 'Nouveau compte' });
    expect(mockState.mandates[0].openSlotKey).toBeNull();
    const second = await createDraft();
    expect(second.id).not.toBe(first.id);
  });

  it('une violation d unicité sur la clé ouverte devient un ConflictError', async () => {
    mockState.failNextCreate = Object.assign(new Error('unique'), {
      code: 'P2002',
      meta: { target: ['tenant_id', 'open_slot_key'] }
    });
    await expect(createMandate(TENANT, baseInput())).rejects.toThrow(
      'Un mandat ouvert existe déjà pour ce bail et ce créancier.'
    );
  });

  it('une collision de séquence est retentée', async () => {
    mockState.failNextCreate = Object.assign(new Error('unique'), {
      code: 'P2002',
      meta: { target: ['tenant_id', 'year', 'sequence'] }
    });
    const mandate = await createDraft();
    expect(mandate.status).toBe('DRAFT');
    expect(mockDb.$transaction).toHaveBeenCalledTimes(2);
  });
});

describe('direct-debit / transitions de statut', () => {
  it('activation sans scan déposé : refusée', async () => {
    const draft = await createDraft();
    await expect(activateMandate(TENANT, draft.id, { signedAt: new Date('2026-10-10') })).rejects.toBeInstanceOf(
      BadRequestError
    );
    expect(mockState.mandates[0].status).toBe('DRAFT');
  });

  it('DRAFT → ACTIVE avec un scan et une date de signature', async () => {
    const draft = await createDraft();
    mockState.mandates[0].signedScanUrl = '/uploads/rental/direct-debit/tenant-a/mandate-1/a.pdf';
    const active = await activateMandate(TENANT, draft.id, { signedAt: new Date('2026-10-10T00:00:00Z') }, 'user-1');
    expect(active.status).toBe('ACTIVE');
    expect(active.signedAt).toBe('2026-10-10T00:00:00.000Z');
    expect(active.hasSignedScan).toBe(true);
    expect(active.activatedAt).not.toBeNull();
    const entry = mockAudit.record.mock.calls.at(-1)?.[1];
    expect(entry.actionKey).toBe('DIRECT_DEBIT_MANDATE_ACTIVATED');
    expect(entry.payload).toMatchObject({ from: 'DRAFT', to: 'ACTIVE', last4Digits: '0589' });
    expectNoLeak(active);
    expectNoLeak(entry);
  });

  it('transitions interdites : ConflictError', async () => {
    const draft = await createDraft();
    mockState.mandates[0].signedScanUrl = '/uploads/rental/direct-debit/tenant-a/mandate-1/a.pdf';

    // DRAFT → SUSPENDED et DRAFT → ACTIVE (réactivation) interdits.
    await expect(suspendMandate(TENANT, draft.id, { reason: 'x' })).rejects.toBeInstanceOf(ConflictError);
    await expect(reactivateMandate(TENANT, draft.id)).rejects.toBeInstanceOf(ConflictError);

    await activateMandate(TENANT, draft.id, { signedAt: new Date('2026-10-10') });
    // ACTIVE → ACTIVE, ACTIVE → ACTIVE (réactiver) interdits.
    await expect(activateMandate(TENANT, draft.id, { signedAt: new Date('2026-10-10') })).rejects.toBeInstanceOf(
      ConflictError
    );
    await expect(reactivateMandate(TENANT, draft.id)).rejects.toBeInstanceOf(ConflictError);

    await suspendMandate(TENANT, draft.id, { reason: 'Rejet' });
    // SUSPENDED → SUSPENDED, SUSPENDED → ACTIVE par activate : interdits.
    await expect(suspendMandate(TENANT, draft.id, { reason: 'x' })).rejects.toBeInstanceOf(ConflictError);
    await expect(activateMandate(TENANT, draft.id, { signedAt: new Date('2026-10-10') })).rejects.toBeInstanceOf(
      ConflictError
    );
  });

  it('ACTIVE ↔ SUSPENDED : le motif est gardé, la réactivation remet le compteur à zéro', async () => {
    const draft = await createDraft();
    mockState.mandates[0].signedScanUrl = '/uploads/rental/direct-debit/tenant-a/mandate-1/a.pdf';
    await activateMandate(TENANT, draft.id, { signedAt: new Date('2026-10-10') });
    mockState.mandates[0].consecutiveRejects = 2;

    const suspended = await suspendMandate(TENANT, draft.id, { reason: '2 rejets consécutifs' });
    expect(suspended.status).toBe('SUSPENDED');
    expect(suspended.suspensionReason).toBe('2 rejets consécutifs');
    expect(suspended.suspendedAt).not.toBeNull();

    const reactivated = await reactivateMandate(TENANT, draft.id);
    expect(reactivated.status).toBe('ACTIVE');
    expect(reactivated.consecutiveRejects).toBe(0);
    expect(reactivated.suspensionReason).toBeNull();
    expect(reactivated.suspendedAt).toBeNull();
  });

  it('révocation depuis DRAFT, ACTIVE et SUSPENDED ; définitive ensuite', async () => {
    for (const from of ['DRAFT', 'ACTIVE', 'SUSPENDED']) {
      resetState();
      const mandate = await createDraft();
      mockState.mandates[0].status = from;
      const revoked = await revokeMandate(TENANT, mandate.id, { reason: 'Départ du locataire' }, 'user-1');
      expect(revoked.status).toBe('REVOKED');
      expect(revoked.revocationReason).toBe('Départ du locataire');
      expect(revoked.revokedAt).not.toBeNull();
      expect(mockState.mandates[0].openSlotKey).toBeNull();

      await expect(revokeMandate(TENANT, mandate.id, { reason: 'encore' })).rejects.toBeInstanceOf(ConflictError);
      await expect(suspendMandate(TENANT, mandate.id, { reason: 'x' })).rejects.toBeInstanceOf(ConflictError);
      await expect(reactivateMandate(TENANT, mandate.id)).rejects.toBeInstanceOf(ConflictError);
      await expect(activateMandate(TENANT, mandate.id, { signedAt: new Date('2026-10-10') })).rejects.toBeInstanceOf(
        ConflictError
      );
    }
  });

  it('une transition concurrente (le statut a bougé) est un ConflictError', async () => {
    const draft = await createDraft();
    mockState.failUpdateMany = true;
    await expect(revokeMandate(TENANT, draft.id, { reason: 'x' })).rejects.toBeInstanceOf(ConflictError);
    expect(mockAudit.record).toHaveBeenCalledTimes(1); // seulement la création
  });

  it("un mandat d'une autre agence est un NotFoundError pour chaque action", async () => {
    await createDraft();
    mockState.mandates[0].tenantId = OTHER_TENANT;
    const id = mockState.mandates[0].id;

    await expect(getMandate(TENANT, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateMandate(TENANT, id, { notes: 'x' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(activateMandate(TENANT, id, { signedAt: new Date('2026-10-10') })).rejects.toBeInstanceOf(
      NotFoundError
    );
    await expect(suspendMandate(TENANT, id, { reason: 'x' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(reactivateMandate(TENANT, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(revokeMandate(TENANT, id, { reason: 'x' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(uploadSignedScan(TENANT, id, { buffer: pdf })).rejects.toBeInstanceOf(NotFoundError);
    expect(mockFiles.store).not.toHaveBeenCalled();
  });
});

describe('direct-debit / modification des champs non bancaires', () => {
  it('modifie plafond, jour et notes ; null les efface', async () => {
    const draft = await createDraft({ maxAmount: 150000, collectionDay: 10, notes: 'Note' });
    expect(draft.maxAmount).toBe(150000);
    expect(draft.effectiveCollectionDay).toBe(10);

    const updated = await updateMandate(
      TENANT,
      draft.id,
      { maxAmount: 200000, collectionDay: null, notes: null },
      'user-1'
    );
    expect(updated.maxAmount).toBe(200000);
    expect(updated.collectionDay).toBeNull();
    expect(updated.effectiveCollectionDay).toBe(5);
    expect(updated.notes).toBeNull();
    expect(mockAudit.log).toHaveBeenCalledTimes(1);
    expect(mockAudit.log.mock.calls[0][0].actionKey).toBe('DIRECT_DEBIT_MANDATE_UPDATED');
  });

  it('refuse la modification d un mandat révoqué', async () => {
    const draft = await createDraft();
    await revokeMandate(TENANT, draft.id, { reason: 'x' });
    await expect(updateMandate(TENANT, draft.id, { notes: 'x' })).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('direct-debit / scan signé', () => {
  it('dépose un scan PDF, le mandat l annonce sans exposer le chemin', async () => {
    const draft = await createDraft();
    const updated = await uploadSignedScan(TENANT, draft.id, { buffer: pdf, originalname: 'mandat.pdf' }, 'user-1');
    expect(updated.hasSignedScan).toBe(true);
    expect(updated.signedScanUploadedAt).not.toBeNull();
    expect(mockFiles.store).toHaveBeenCalledWith(TENANT, draft.id, pdf, 'pdf');
    expect(mockFiles.remove).not.toHaveBeenCalled();
    expectNoLeak(updated);
    expect(mockAudit.record.mock.calls.at(-1)?.[1].actionKey).toBe('DIRECT_DEBIT_MANDATE_SCAN_UPLOADED');
  });

  it('remplacer le scan supprime l ancien fichier après validation', async () => {
    const draft = await createDraft();
    mockState.mandates[0].signedScanUrl = '/uploads/rental/direct-debit/tenant-a/mandate-1/ancien.pdf';
    await uploadSignedScan(TENANT, draft.id, { buffer: pdf });
    expect(mockFiles.remove).toHaveBeenCalledWith(
      TENANT,
      draft.id,
      '/uploads/rental/direct-debit/tenant-a/mandate-1/ancien.pdf'
    );
    const entry = mockAudit.record.mock.calls.at(-1)?.[1];
    expect(entry.payload).toMatchObject({ replaced: true });
    expect(JSON.stringify(entry.payload)).not.toContain('/uploads/');
  });

  it("refuse le dépôt d'un scan sur un mandat actif", async () => {
    const draft = await createDraft();
    mockState.mandates[0].status = 'ACTIVE';
    await expect(uploadSignedScan(TENANT, draft.id, { buffer: pdf })).rejects.toBeInstanceOf(ConflictError);
    expect(mockFiles.store).not.toHaveBeenCalled();
  });

  it('refuse un type de fichier non reconnu par ses octets, sans rien écrire', async () => {
    const draft = await createDraft();
    await expect(
      uploadSignedScan(TENANT, draft.id, { buffer: Buffer.from('<html><script>alert(1)</script></html>') })
    ).rejects.toBeInstanceOf(BadRequestError);
    await expect(uploadSignedScan(TENANT, draft.id, undefined)).rejects.toBeInstanceOf(BadRequestError);
    expect(mockFiles.store).not.toHaveBeenCalled();
  });

  it('refuse un fichier de plus de 10 Mo', async () => {
    const draft = await createDraft();
    const big = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(10 * 1024 * 1024)]);
    await expect(uploadSignedScan(TENANT, draft.id, { buffer: big })).rejects.toBeInstanceOf(BadRequestError);
    expect(mockFiles.store).not.toHaveBeenCalled();
  });

  it('refuse le dépôt sur un mandat révoqué', async () => {
    const draft = await createDraft();
    await revokeMandate(TENANT, draft.id, { reason: 'x' });
    await expect(uploadSignedScan(TENANT, draft.id, { buffer: pdf })).rejects.toBeInstanceOf(ConflictError);
    expect(mockFiles.store).not.toHaveBeenCalled();
  });

  it('retire le nouveau fichier si la transaction échoue', async () => {
    const draft = await createDraft();
    mockState.failUpdateMany = true;
    await expect(uploadSignedScan(TENANT, draft.id, { buffer: pdf })).rejects.toBeInstanceOf(ConflictError);
    expect(mockFiles.remove).toHaveBeenCalledWith(
      TENANT,
      draft.id,
      '/uploads/rental/direct-debit/tenant-a/mandate-1/nouveau.pdf'
    );
  });
});

describe('direct-debit / lectures et réponses', () => {
  it('la lecture ne demande jamais le texte chiffré', async () => {
    await createDraft();
    await getMandate(TENANT, mockState.mandates[0].id);
    await listMandates(TENANT, { page: 1, pageSize: 20 });
    const selects = [
      ...mockDb.directDebitMandate.findFirst.mock.calls,
      ...mockDb.directDebitMandate.findMany.mock.calls
    ]
      .map(call => call[0].select)
      .filter(Boolean);
    expect(selects.length).toBeGreaterThan(0);
    for (const select of selects) expect(select.ibanEncrypted).toBeUndefined();
  });

  it('la liste est filtrée par agence et ne contient aucun IBAN', async () => {
    await createDraft();
    mockState.mandates.push({ ...mockState.mandates[0], id: 'autre', tenantId: OTHER_TENANT, sequence: 1 });
    const result = await listMandates(TENANT, { page: 1, pageSize: 20 });
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe(mockState.mandates[0].id);
    expect(mockDb.directDebitMandate.findMany.mock.calls[0][0].where.tenantId).toBe(TENANT);
    expectNoLeak(result);
  });

  it('aucun DTO ne contient l IBAN, le texte chiffré ni le chemin du scan, à aucun statut', async () => {
    const draft = await createDraft();
    mockState.mandates[0].signedScanUrl = '/uploads/rental/direct-debit/tenant-a/mandate-1/a.pdf';
    const results: unknown[] = [await getMandate(TENANT, draft.id)];
    results.push(await activateMandate(TENANT, draft.id, { signedAt: new Date('2026-10-10') }));
    results.push(await suspendMandate(TENANT, draft.id, { reason: 'x' }));
    results.push(await reactivateMandate(TENANT, draft.id));
    results.push(await revokeMandate(TENANT, draft.id, { reason: 'x' }));
    const keys = Object.keys(results[0] as object);
    expect(keys).not.toContain('ibanEncrypted');
    expect(keys).not.toContain('signedScanUrl');
    expect(keys).not.toContain('iban');
    for (const result of results) expectNoLeak(result);
  });
});

describe('direct-debit / contrôle d IBAN', () => {
  it('renvoie le masque et le code banque, jamais l IBAN', () => {
    const result = checkIban(IBAN);
    expect(result).toEqual({
      valid: true,
      ibanMasked: 'CI•• •••• •••• •••• •••• 0589',
      bankCode: 'CI008',
      error: null,
      warnings: expect.any(Array)
    });
    expectNoLeak(result);
  });

  it('renvoie le message d erreur pour une saisie invalide', () => {
    const result = checkIban('CI00');
    expect(result.valid).toBe(false);
    expect(result.ibanMasked).toBeNull();
    expect(result.error).toEqual(expect.any(String));
  });
});
