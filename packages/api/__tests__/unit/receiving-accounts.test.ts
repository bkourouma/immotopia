/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Spec 048, lot Q : comptes de réception de l'agence et des copropriétés
 * (`lib/receiving-accounts/*`, contrat §1 à §4, §6). Prisma est remplacé par un
 * magasin en mémoire, le disque par un dossier temporaire : aucune base requise.
 */
import express from 'express';
import request from 'supertest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { deflateSync } from 'zlib';

type Row = Record<string, any>;

let tmpRoot = '';

jest.mock('../../src/utils/project-root', () => ({
  getProjectRoot: () => tmpRoot,
  getUploadsRoot: () => require('path').join(tmpRoot, 'uploads')
}));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const SYNDIC_A1 = '11111111-1111-4111-8111-111111111111';
const SYNDIC_A2 = '22222222-2222-4222-8222-222222222222';
const SYNDIC_B = '33333333-3333-4333-8333-333333333333';
const ACTOR = 'user-1';

const store = { syndicates: [] as Row[], accounts: [] as Row[], seq: 0 };

function resetStore() {
  store.syndicates = [
    { id: SYNDIC_A1, tenantId: TENANT_A },
    { id: SYNDIC_A2, tenantId: TENANT_A },
    { id: SYNDIC_B, tenantId: TENANT_B }
  ];
  store.accounts = [];
  store.seq = 0;
}

function matchValue(actual: any, expected: any): boolean {
  if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
    if ('in' in expected) return expected.in.includes(actual);
  }
  if (actual instanceof Date && expected instanceof Date) return actual.getTime() === expected.getTime();
  return actual === expected;
}
const matches = (row: Row, where: Row = {}) =>
  Object.entries(where).every(([key, value]) => value === undefined || matchValue(row[key], value));

const mockPrisma: Row = {
  receivingAccount: {
    findFirst: jest.fn(async ({ where }: Row) => {
      const found = store.accounts.find(r => matches(r, where));
      return found ? { ...found } : null;
    }),
    findMany: jest.fn(async ({ where }: Row) =>
      store.accounts
        .filter(r => matches(r, where))
        .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.sortOrder - b.sortOrder || a.seq - b.seq)
        .map(r => ({ ...r }))
    ),
    count: jest.fn(async ({ where }: Row) => store.accounts.filter(r => matches(r, where)).length),
    create: jest.fn(async ({ data }: Row) => {
      store.seq += 1;
      const row = {
        id: `00000000-0000-4000-8000-${String(store.seq).padStart(12, '0')}`,
        seq: store.seq,
        createdAt: new Date('2026-11-01T10:00:00Z'),
        updatedAt: new Date('2026-11-01T10:00:00Z'),
        ...data
      };
      store.accounts.push(row);
      return { ...row };
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const found = store.accounts.filter(r => matches(r, where));
      found.forEach(r => Object.assign(r, data, { updatedAt: new Date('2026-11-02T10:00:00Z') }));
      return { count: found.length };
    }),
    deleteMany: jest.fn(async ({ where }: Row) => {
      const before = store.accounts.length;
      store.accounts = store.accounts.filter(r => !matches(r, where));
      return { count: before - store.accounts.length };
    })
  },
  $executeRaw: jest.fn(async () => 0),
  $transaction: jest.fn(async (arg: any) => arg(mockPrisma))
};
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

jest.mock('../../src/lib/syndics/charge-allocation', () => {
  const { NotFoundError } = require('../../src/middleware/error-middleware');
  return {
    assertSyndicateOfTenant: async (_client: unknown, tenantId: string, syndicateId: string) => {
      if (!store.syndicates.some(s => s.id === syndicateId && s.tenantId === tenantId)) {
        throw new NotFoundError('Copropriété introuvable ou inaccessible.');
      }
    }
  };
});

const auditEvents: Row[] = [];
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (entry: Row) => auditEvents.push(entry)
}));

const notified: Row[] = [];
jest.mock('../../src/lib/receiving-accounts/notifications', () => ({
  notifyReceivingAccountChanged: (alert: Row) => notified.push(alert)
}));

import { AppError, errorHandler, NotFoundError } from '../../src/middleware/error-middleware';
import { createReceivingAccountBodySchema } from '../../src/lib/receiving-accounts/schemas';
import {
  createReceivingAccount,
  deleteReceivingAccount,
  listReceivingAccounts,
  readReceivingAccountQr,
  updateReceivingAccount
} from '../../src/lib/receiving-accounts/service';
import {
  listCoOwnerPortalReceivingAccounts,
  listTenantPortalReceivingAccounts,
  readCoOwnerPortalReceivingAccountQr,
  readTenantPortalReceivingAccountQr
} from '../../src/lib/receiving-accounts/portal';
import {
  listTenantPortalReceivingAccountsHandler,
  readTenantPortalReceivingAccountQrHandler
} from '../../src/controllers/receiving-account-controller';
import type { ReceivingAccountTarget } from '../../src/lib/receiving-accounts/types';

const AGENCY: ReceivingAccountTarget = { scope: 'AGENCY', syndicateId: null };
const syndic = (syndicateId: string): ReceivingAccountTarget => ({ scope: 'SYNDICATE', syndicateId });

const GPS_MARKER = 'GPS-LATITUDE-SECRET';
const UUID_V4 = '341C3E1B-8F2A-4B6D-9C1E-5A7D2F0B3C44';

// --- Images de test -----------------------------------------------------------

const CRC_TABLE = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

/** PNG valide avec un bloc texte qui porte un marqueur à retirer. */
function pngWithMetadata(): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = pngChunk('IHDR', Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]));
  const text = pngChunk('tEXt', Buffer.from(`Comment\0${GPS_MARKER}`, 'latin1'));
  const idat = pngChunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 0])));
  return Buffer.concat([signature, ihdr, text, idat, pngChunk('IEND', Buffer.alloc(0))]);
}

const svg = () => Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const pdf = () => Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');

const baseBody = { institution: 'Wave', holderName: 'Agence Soleil', alias: UUID_V4 };

async function createAccount(target: ReceivingAccountTarget, extra: Row = {}, file?: Buffer, tenantId = TENANT_A) {
  return createReceivingAccount({
    tenantId,
    target,
    actorUserId: ACTOR,
    body: { ...baseBody, ...extra } as any,
    file: file ? { buffer: file } : undefined
  });
}

async function rejection(promise: Promise<unknown>): Promise<any> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('une erreur était attendue');
}

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'receiving-accounts-'));
  resetStore();
  auditEvents.length = 0;
  notified.length = 0;
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------

describe('validation de l’alias et des champs', () => {
  it('un UUID v4 est normalisé en minuscules', () => {
    const parsed = createReceivingAccountBodySchema.parse(baseBody);
    expect(parsed.alias).toBe(UUID_V4.toLowerCase());
  });

  it('un UUID qui n’est pas de version 4 est refusé', () => {
    const notV4 = '341c3e1b-8f2a-1b6d-9c1e-5a7d2f0b3c44';
    expect(() => createReceivingAccountBodySchema.parse({ ...baseBody, alias: notV4 })).toThrow();
  });

  it('un alias libre est gardé tel quel, sans caractère de contrôle', () => {
    expect(createReceivingAccountBodySchema.parse({ ...baseBody, alias: '0701020304' }).alias).toBe('0701020304');
    expect(() => createReceivingAccountBodySchema.parse({ ...baseBody, alias: 'abc\u0007def' })).toThrow();
  });

  it('refuse un champ inconnu, un nom trop court et un établissement vide (strict)', () => {
    expect(() => createReceivingAccountBodySchema.parse({ ...baseBody, qrFileUrl: '/uploads/x' })).toThrow();
    expect(() => createReceivingAccountBodySchema.parse({ ...baseBody, holderName: 'A' })).toThrow();
    expect(() => createReceivingAccountBodySchema.parse({ ...baseBody, institution: '  ' })).toThrow();
  });

  it('accepte les booléens et entiers en chaîne (multipart)', () => {
    const parsed = createReceivingAccountBodySchema.parse({ ...baseBody, isActive: 'false', sortOrder: '3' });
    expect(parsed.isActive).toBe(false);
    expect(parsed.sortOrder).toBe(3);
  });
});

describe('image du QR', () => {
  it('PNG accepté : métadonnées retirées, réponse sans chemin ni empreinte', async () => {
    const created = await createAccount(AGENCY, {}, pngWithMetadata());
    expect(created.hasQr).toBe(true);
    expect(created.qrPath).toBe(`/api/tenants/${TENANT_A}/settings/receiving-accounts/${created.id}/qr`);
    const serialized = JSON.stringify(created);
    expect(serialized).not.toMatch(/uploads|qrFileUrl|qrSha256|sha256|\\\\/);

    const stored = store.accounts[0];
    expect(stored.qrFileUrl).toMatch(new RegExp(`^/uploads/receiving-accounts/${TENANT_A}/[0-9a-f-]+\\.png$`));
    expect(stored.qrMimeType).toBe('image/png');
    const file = await readReceivingAccountQr(TENANT_A, AGENCY, created.id);
    expect(file.mimeType).toBe('image/png');
    expect(file.buffer.includes(Buffer.from(GPS_MARKER))).toBe(false);
  });

  it('SVG, PDF et fichier non image sont refusés sur le contenu (400)', async () => {
    for (const bad of [svg(), pdf(), Buffer.from('MZ' + 'x'.repeat(100))]) {
      const error = await rejection(createAccount(AGENCY, {}, bad));
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('RECEIVING_ACCOUNT_QR_INVALID');
    }
    expect(store.accounts).toHaveLength(0);
  });

  it('une image de plus de 2 Mo est refusée (413)', async () => {
    const big = Buffer.concat([pngWithMetadata(), Buffer.alloc(2 * 1024 * 1024)]);
    const error = await rejection(createAccount(AGENCY, {}, big));
    expect(error.statusCode).toBe(413);
    expect(error.code).toBe('RECEIVING_ACCOUNT_QR_TOO_LARGE');
  });
});

describe('création', () => {
  it('un compte actif sans alias ni QR est refusé ; inactif, il est accepté', async () => {
    const error = await rejection(createAccount(AGENCY, { alias: undefined }));
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('RECEIVING_ACCOUNT_INCOMPLETE');
    const draft = await createAccount(AGENCY, { alias: undefined, isActive: false });
    expect(draft.isActive).toBe(false);
  });

  it('journalise (sans image) et notifie après la création', async () => {
    const created = await createAccount(AGENCY, {}, pngWithMetadata());
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      actionKey: 'RECEIVING_ACCOUNT_CREATED',
      tenantId: TENANT_A,
      entityId: created.id,
      payload: { institution: 'Wave', previousAlias: null, newAlias: UUID_V4.toLowerCase(), hadQr: false, hasQr: true }
    });
    expect(JSON.stringify(auditEvents[0])).not.toMatch(/uploads|sha256/i);
    expect(notified).toHaveLength(1);
    expect(notified[0]).toMatchObject({ tenantId: TENANT_A, changes: ['CREATED'], scope: 'AGENCY' });
  });

  it('limite de 10 comptes par agence ; une copropriété a sa propre limite', async () => {
    for (let i = 0; i < 10; i += 1) await createAccount(AGENCY, { institution: `Banque ${i}` });
    const error = await rejection(createAccount(AGENCY));
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('RECEIVING_ACCOUNT_LIMIT');
    await expect(createAccount(syndic(SYNDIC_A1))).resolves.toMatchObject({ institution: 'Wave' });
    await expect(createAccount(syndic(SYNDIC_A2))).resolves.toMatchObject({ institution: 'Wave' });
  });

  it('une copropriété d’une autre agence est introuvable', async () => {
    await expect(createAccount(syndic(SYNDIC_B))).rejects.toBeInstanceOf(NotFoundError);
    expect(store.accounts).toHaveLength(0);
  });
});

describe('isolation entre agences et entre copropriétés', () => {
  it('lecture, modification, suppression et image d’un compte d’une autre agence : 404', async () => {
    const mine = await createAccount(AGENCY, {}, pngWithMetadata());
    await expect(listReceivingAccounts(TENANT_B, AGENCY)).resolves.toEqual([]);
    await expect(
      updateReceivingAccount({ tenantId: TENANT_B, target: AGENCY, actorUserId: ACTOR, accountId: mine.id, body: {} })
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      deleteReceivingAccount({ tenantId: TENANT_B, target: AGENCY, actorUserId: ACTOR, accountId: mine.id })
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(readReceivingAccountQr(TENANT_B, AGENCY, mine.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(store.accounts).toHaveLength(1);
  });

  it('un compte de copropriété n’est pas atteignable par la portée agence ni par une autre copropriété', async () => {
    const own = await createAccount(syndic(SYNDIC_A1), {}, pngWithMetadata());
    const wrongTargets = [AGENCY, syndic(SYNDIC_A2)];
    for (const target of wrongTargets) {
      await expect(readReceivingAccountQr(TENANT_A, target, own.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        updateReceivingAccount({ tenantId: TENANT_A, target, actorUserId: ACTOR, accountId: own.id, body: {} })
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        deleteReceivingAccount({ tenantId: TENANT_A, target, actorUserId: ACTOR, accountId: own.id })
      ).rejects.toBeInstanceOf(NotFoundError);
    }
    await expect(listReceivingAccounts(TENANT_A, AGENCY)).resolves.toEqual([]);
    await expect(listReceivingAccounts(TENANT_A, syndic(SYNDIC_A2))).resolves.toEqual([]);
    await expect(listReceivingAccounts(TENANT_A, syndic(SYNDIC_A1))).resolves.toHaveLength(1);
    await expect(listReceivingAccounts(TENANT_A, syndic(SYNDIC_B))).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('modification et suppression', () => {
  it('changer l’alias est journalisé et notifié', async () => {
    const created = await createAccount(AGENCY);
    notified.length = 0;
    auditEvents.length = 0;
    const updated = await updateReceivingAccount({
      tenantId: TENANT_A,
      target: AGENCY,
      actorUserId: ACTOR,
      accountId: created.id,
      body: { alias: '0701020304' } as any
    });
    expect(updated.alias).toBe('0701020304');
    expect(auditEvents[0]).toMatchObject({
      actionKey: 'RECEIVING_ACCOUNT_UPDATED',
      payload: { previousAlias: UUID_V4.toLowerCase(), newAlias: '0701020304' }
    });
    expect(notified[0].changes).toEqual(['ALIAS_CHANGED']);
  });

  it('un simple changement d’ordre ne notifie personne', async () => {
    const created = await createAccount(AGENCY);
    notified.length = 0;
    await updateReceivingAccount({
      tenantId: TENANT_A,
      target: AGENCY,
      actorUserId: ACTOR,
      accountId: created.id,
      body: { sortOrder: 4 } as any
    });
    expect(notified).toHaveLength(0);
  });

  it('remplacer puis retirer le QR met à jour le fichier et notifie', async () => {
    const created = await createAccount(AGENCY, {}, pngWithMetadata());
    const firstUrl = store.accounts[0].qrFileUrl as string;
    notified.length = 0;
    await updateReceivingAccount({
      tenantId: TENANT_A,
      target: AGENCY,
      actorUserId: ACTOR,
      accountId: created.id,
      body: {} as any,
      file: { buffer: pngWithMetadata() }
    });
    const secondUrl = store.accounts[0].qrFileUrl as string;
    expect(secondUrl).not.toBe(firstUrl);
    await expect(fs.access(path.join(tmpRoot, firstUrl.replace(/^\//, '')))).rejects.toBeDefined();
    expect(notified[0].changes).toEqual(['QR_CHANGED']);

    const removed = await updateReceivingAccount({
      tenantId: TENANT_A,
      target: AGENCY,
      actorUserId: ACTOR,
      accountId: created.id,
      body: { removeQr: 'true' } as any
    });
    expect(removed.hasQr).toBe(false);
    expect(removed.qrPath).toBeNull();
    expect(store.accounts[0].qrFileUrl).toBeNull();
    await expect(fs.access(path.join(tmpRoot, secondUrl.replace(/^\//, '')))).rejects.toBeDefined();
  });

  it('retirer le seul moyen de payer d’un compte actif est refusé ; le désactiver notifie', async () => {
    const created = await createAccount(AGENCY, { alias: undefined }, pngWithMetadata());
    const error = await rejection(
      updateReceivingAccount({
        tenantId: TENANT_A,
        target: AGENCY,
        actorUserId: ACTOR,
        accountId: created.id,
        body: { removeQr: true } as any
      })
    );
    expect(error.code).toBe('RECEIVING_ACCOUNT_INCOMPLETE');
    notified.length = 0;
    await updateReceivingAccount({
      tenantId: TENANT_A,
      target: AGENCY,
      actorUserId: ACTOR,
      accountId: created.id,
      body: { isActive: false } as any
    });
    expect(notified[0].changes).toEqual(['DEACTIVATED']);
  });

  it('la suppression retire la ligne et le fichier, journalise et notifie', async () => {
    const created = await createAccount(AGENCY, {}, pngWithMetadata());
    const url = store.accounts[0].qrFileUrl as string;
    notified.length = 0;
    auditEvents.length = 0;
    await deleteReceivingAccount({ tenantId: TENANT_A, target: AGENCY, actorUserId: ACTOR, accountId: created.id });
    expect(store.accounts).toHaveLength(0);
    await expect(fs.access(path.join(tmpRoot, url.replace(/^\//, '')))).rejects.toBeDefined();
    expect(auditEvents[0]).toMatchObject({ actionKey: 'RECEIVING_ACCOUNT_DELETED', entityId: created.id });
    expect(notified[0].changes).toEqual(['DELETED']);
  });
});

describe('alertes et audit des autres changements (audit sécurité)', () => {
  const update = (accountId: string, body: Row) =>
    updateReceivingAccount({ tenantId: TENANT_A, target: AGENCY, actorUserId: ACTOR, accountId, body: body as any });

  it('instructions, titulaire, établissement et « scannable avec » alertent, avec ancienne et nouvelle valeur dans l’audit', async () => {
    const created = await createAccount(AGENCY, { scannableWith: 'Wave', instructions: 'Avant' });
    notified.length = 0;
    auditEvents.length = 0;
    await update(created.id, {
      instructions: 'Après',
      holderName: 'Nouveau Titulaire',
      institution: 'Orange Money',
      scannableWith: 'Orange'
    });
    expect(notified[0].changes.sort()).toEqual(
      ['HOLDER_CHANGED', 'INSTITUTION_CHANGED', 'INSTRUCTIONS_CHANGED', 'SCANNABLE_WITH_CHANGED'].sort()
    );
    expect(notified[0]).toMatchObject({ previousHolderName: 'Agence Soleil', newHolderName: 'Nouveau Titulaire' });
    expect(auditEvents[0].payload).toMatchObject({
      previousValues: {
        institution: 'Wave',
        holderName: 'Agence Soleil',
        instructions: 'Avant',
        scannableWith: 'Wave'
      },
      newValues: {
        institution: 'Orange Money',
        holderName: 'Nouveau Titulaire',
        instructions: 'Après',
        scannableWith: 'Orange'
      }
    });
    expect(JSON.stringify(auditEvents[0])).not.toMatch(/uploads|sha256/i);
  });

  it('la réactivation alerte ; un changement d’ordre seul n’alerte pas', async () => {
    const created = await createAccount(AGENCY, { isActive: false });
    notified.length = 0;
    await update(created.id, { isActive: true });
    expect(notified[0].changes).toEqual(['REACTIVATED']);
    notified.length = 0;
    await update(created.id, { sortOrder: 7 });
    expect(notified).toHaveLength(0);
  });
});

describe('modification concurrente (409)', () => {
  it('une ligne modifiée entre la lecture et l’écriture : 409, nouveau fichier supprimé, ni audit ni e-mail', async () => {
    const created = await createAccount(AGENCY, {}, pngWithMetadata());
    const original = store.accounts[0].qrFileUrl as string;
    auditEvents.length = 0;
    notified.length = 0;
    // Un autre utilisateur écrit juste après la lecture de la transaction.
    mockPrisma.receivingAccount.findFirst.mockImplementationOnce(async ({ where }: Row) => {
      const found = store.accounts.find(r => matches(r, where));
      const snapshot = found ? { ...found } : null;
      if (found) found.updatedAt = new Date('2026-11-03T08:00:00Z');
      return snapshot;
    });
    const error = await rejection(
      updateReceivingAccount({
        tenantId: TENANT_A,
        target: AGENCY,
        actorUserId: ACTOR,
        accountId: created.id,
        body: { alias: '0701020304' } as any,
        file: { buffer: pngWithMetadata() }
      })
    );
    expect(error.statusCode).toBe(409);
    expect(store.accounts[0].alias).toBe(UUID_V4.toLowerCase());
    expect(store.accounts[0].qrFileUrl).toBe(original);
    const files = await fs.readdir(path.join(tmpRoot, 'uploads', 'receiving-accounts', TENANT_A));
    expect(files).toHaveLength(1);
    expect(auditEvents).toHaveLength(0);
    expect(notified).toHaveLength(0);
  });

  it('la création prend le verrou consultatif de la cible avant de compter', async () => {
    mockPrisma.$executeRaw.mockClear();
    await createAccount(syndic(SYNDIC_A1));
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
  });
});

describe('modification par le web (tous les champs, multipart)', () => {
  it('chaînes vides = effacement ; removeQr en chaîne « false » ne retire rien ; désactivation sans image', async () => {
    const created = await createAccount(
      AGENCY,
      { scannableWith: 'Application Wave', instructions: 'Texte' },
      pngWithMetadata()
    );
    const updated = await updateReceivingAccount({
      tenantId: TENANT_A,
      target: AGENCY,
      actorUserId: ACTOR,
      accountId: created.id,
      body: {
        institution: 'Wave',
        holderName: 'Agence Soleil',
        alias: '',
        scannableWith: '',
        instructions: '',
        isActive: 'false',
        sortOrder: '0',
        removeQr: 'false'
      } as any
    });
    expect(updated).toMatchObject({
      alias: null,
      scannableWith: null,
      instructions: null,
      isActive: false,
      hasQr: true
    });
    expect(store.accounts[0].qrFileUrl).not.toBeNull();
  });
});

describe('portails', () => {
  it('le locataire ne voit que les comptes actifs de l’agence, jamais ceux d’une copropriété ni d’une autre agence', async () => {
    const active = await createAccount(AGENCY, { institution: 'Wave' }, pngWithMetadata());
    await createAccount(AGENCY, { institution: 'Inactif', isActive: false });
    await createAccount(syndic(SYNDIC_A1), { institution: 'Copro' });
    await createAccount(AGENCY, { institution: 'Autre agence' }, undefined, TENANT_B);

    const list = await listTenantPortalReceivingAccounts(TENANT_A);
    expect(list.map(a => a.institution)).toEqual(['Wave']);
    expect(list[0].qrPath).toBe(`/api/portal/tenant/receiving-accounts/${active.id}/qr`);
    expect(JSON.stringify(list)).not.toMatch(/uploads|qrFileUrl|sha256|isActive/);
  });

  it('image : compte inactif, d’une autre agence ou de copropriété = même 404 que l’inexistant', async () => {
    const inactive = await createAccount(AGENCY, { isActive: false }, pngWithMetadata());
    const copro = await createAccount(syndic(SYNDIC_A1), {}, pngWithMetadata());
    const other = await createAccount(AGENCY, {}, pngWithMetadata(), TENANT_B);
    const active = await createAccount(AGENCY, {}, pngWithMetadata());
    for (const id of [inactive.id, copro.id, other.id, '00000000-0000-4000-8000-0000000000ff']) {
      await expect(readTenantPortalReceivingAccountQr(TENANT_A, id)).rejects.toBeInstanceOf(NotFoundError);
    }
    await expect(readTenantPortalReceivingAccountQr(TENANT_A, active.id)).resolves.toMatchObject({
      mimeType: 'image/png'
    });
  });

  it('le copropriétaire voit les comptes actifs de SES copropriétés seulement', async () => {
    await createAccount(syndic(SYNDIC_A1), { institution: 'Copro 1' }, pngWithMetadata());
    const second = await createAccount(syndic(SYNDIC_A2), { institution: 'Copro 2' }, pngWithMetadata());
    await createAccount(syndic(SYNDIC_A1), { institution: 'Inactif', isActive: false });
    await createAccount(AGENCY, { institution: 'Agence' });

    const mine = await listCoOwnerPortalReceivingAccounts(TENANT_A, [SYNDIC_A1]);
    expect(mine.map(a => a.institution)).toEqual(['Copro 1']);
    expect(mine[0].syndicateId).toBe(SYNDIC_A1);
    expect(mine[0].qrPath).toMatch(/^\/api\/portal\/copropriete\/receiving-accounts\/.+\/qr$/);

    await expect(listCoOwnerPortalReceivingAccounts(TENANT_A, [SYNDIC_A1], SYNDIC_A2)).rejects.toBeInstanceOf(
      NotFoundError
    );
    await expect(listCoOwnerPortalReceivingAccounts(TENANT_A, [])).resolves.toEqual([]);
    await expect(readCoOwnerPortalReceivingAccountQr(TENANT_A, [SYNDIC_A1], second.id)).rejects.toBeInstanceOf(
      NotFoundError
    );
    await expect(
      readCoOwnerPortalReceivingAccountQr(TENANT_A, [SYNDIC_A1, SYNDIC_A2], second.id)
    ).resolves.toBeDefined();
  });
});

describe('routes d’image (contrôleur du portail locataire)', () => {
  const app = express();
  app.use((req: any, _res, next) => {
    if (req.headers['x-test-tenant']) {
      req.tenantPortal = { tenantId: req.headers['x-test-tenant'], tenantClientId: 'c', leaseId: 'l' };
    }
    next();
  });
  app.get('/receiving-accounts', listTenantPortalReceivingAccountsHandler);
  app.get('/receiving-accounts/:accountId/qr', readTenantPortalReceivingAccountQrHandler);
  app.use(errorHandler);

  it('sans contexte de portail, ni liste ni image : 403', async () => {
    const created = await createAccount(AGENCY, {}, pngWithMetadata());
    await request(app).get('/receiving-accounts').expect(403);
    await request(app).get(`/receiving-accounts/${created.id}/qr`).expect(403);
  });

  it('sert l’image en privé, sans exécution possible, et la liste sans chemin disque', async () => {
    const created = await createAccount(AGENCY, {}, pngWithMetadata());
    const image = await request(app)
      .get(`/receiving-accounts/${created.id}/qr`)
      .set('x-test-tenant', TENANT_A)
      .expect(200);
    expect(image.headers['content-type']).toBe('image/png');
    expect(image.headers['cache-control']).toBe('private, no-store');
    expect(image.headers['x-content-type-options']).toBe('nosniff');
    expect(image.headers['content-security-policy']).toContain('sandbox');

    const list = await request(app).get('/receiving-accounts').set('x-test-tenant', TENANT_A).expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain(tmpRoot.replace(/\\/g, '\\\\'));
    expect(JSON.stringify(list.body)).not.toMatch(/\/uploads\//);

    await request(app).get(`/receiving-accounts/${created.id}/qr`).set('x-test-tenant', TENANT_B).expect(404);
    await request(app).get('/receiving-accounts/pas-un-uuid/qr').set('x-test-tenant', TENANT_A).expect(404);
  });
});
