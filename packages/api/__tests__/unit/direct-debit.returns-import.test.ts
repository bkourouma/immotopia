/**
 * Retour banque : import d'un fichier de retour (spec 042, P3, data-model §8.5).
 *
 * Le parseur `GENERIC_CSV` est écrit par un autre lot : il est simulé ici
 * (`getReturnAdapter`). Le rapprochement, l'aperçu sans écriture, l'application
 * idempotente et la trace d'import sont ceux du vrai service.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockAudit = { record: jest.fn() };
const mockParse = jest.fn();
const mockCollector = {
  scope: 'RENTAL_LEASE',
  keepsActiveKeyOnSettle: true,
  settleTx: jest.fn(),
  reverseTx: jest.fn(),
  applyRejectFeeTx: jest.fn()
};
const mockEnv: Record<string, string | undefined> = {
  DIRECT_DEBIT_IBAN_KEY: Buffer.alloc(32, 7).toString('base64')
};

jest.mock('../../src/config/env', () => ({ env: mockEnv, parseKeyList: () => [] }));
jest.mock('../../src/utils/database', () => ({ prisma: require('../helpers/direct-debit-return-db').harness.db }));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({
  recordAuditEvent: (...args: unknown[]) => mockAudit.record(...args),
  logAuditEvent: jest.fn()
}));
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendDirectDebitRejected: jest.fn().mockResolvedValue(undefined) }
}));
jest.mock('../../src/services/email-notification-config-service', () => ({
  getEmailNotificationConfig: jest.fn().mockResolvedValue({ enabled: false })
}));
const mockLock = jest.fn(async (_key: string, fn: () => Promise<unknown>, _options?: unknown) => fn());
jest.mock('../../src/lib/ai/advisory-lock', () => ({
  withExclusiveSection: (...args: [string, () => Promise<unknown>, unknown?]) => mockLock(...args)
}));
jest.mock('../../src/lib/direct-debit/collectors', () => ({ getCollector: () => mockCollector }));
jest.mock('../../src/lib/direct-debit/return-formats', () => ({
  getReturnAdapter: () => ({ format: 'GENERIC_CSV', parse: (...args: unknown[]) => mockParse(...args) })
}));

import { createHmac, hkdfSync } from 'node:crypto';
import { AppError, BadRequestError } from '../../src/middleware/error-middleware';
import { applyReturnFile, listReturnImports, previewReturnFile } from '../../src/lib/direct-debit/returns';
import { AuditActionKey } from '../../src/types/audit-types';
import { logger } from '../../src/utils/logger';
import { NOW, OTHER_TENANT, REMITTANCE, TENANT, harness, lineId } from '../helpers/direct-debit-return-db';

const { state, db } = harness;
const RENTAL = { scope: 'RENTAL_LEASE' } as const;
const SYNDIC = { scope: 'SYNDIC_LOT', syndicateId: 'synd-1' } as const;

const line = (n: number) => state.lines.find(row => row.id === lineId(n)) as Record<string, any>;
const FILE = { buffer: Buffer.from('reference_operation;statut\n'), originalname: 'retour-octobre.csv' };

function record(over: Record<string, any> = {}) {
  return {
    row: 2,
    operationReference: 'PRL-2026-0001-001',
    outcome: 'SETTLED',
    date: '2026-10-27',
    amount: 100000,
    rejectionCode: null,
    rejectionReason: null,
    ...over
  };
}

const parsed = (records: any[], errors: any[] = []) => mockParse.mockReturnValue({ records, errors });
const preview = (file: any = FILE) => previewReturnFile(TENANT, RENTAL, file, undefined);
const apply = (file: any = FILE) => applyReturnFile(TENANT, RENTAL, file, 'GENERIC_CSV', 'user-1');

function expectedDigest(buffer: Buffer): string {
  const master = Buffer.from(mockEnv.DIRECT_DEBIT_IBAN_KEY as string, 'base64');
  const key = Buffer.from(
    hkdfSync('sha256', master, Buffer.alloc(0), Buffer.from('immotopia:direct-debit:remittance-file-digest'), 32)
  );
  return createHmac('sha256', key).update(buffer).digest('hex');
}

const writes = () =>
  [
    db.directDebitRemittanceLine.updateMany,
    db.directDebitRemittance.updateMany,
    db.directDebitMandate.updateMany,
    db.directDebitReturnImport.create,
    db.directDebitReturnImport.updateMany,
    db.$transaction,
    mockCollector.settleTx,
    mockAudit.record
  ].reduce((sum, fn) => sum + fn.mock.calls.length, 0);

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({
    now: NOW,
    doNotFake: [
      'nextTick',
      'setImmediate',
      'setTimeout',
      'setInterval',
      'clearTimeout',
      'clearInterval',
      'queueMicrotask'
    ]
  });
  harness.reset();
  mockEnv.DIRECT_DEBIT_IBAN_KEY = Buffer.alloc(32, 7).toString('base64');
  mockCollector.settleTx.mockImplementation(async (_tx: unknown, _ctx: unknown, l: any) => ({
    rentalPaymentId: `pay-${l.id}`
  }));
  mockCollector.reverseTx.mockResolvedValue({});
  mockCollector.applyRejectFeeTx.mockResolvedValue({ appliedAmount: 0 });
  mockAudit.record.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('import d’un retour / rapprochement (tableau du §8.5)', () => {
  it('rapproche chaque situation', async () => {
    line(2).status = 'SETTLED';
    line(3).status = 'CANCELED';
    parsed([
      record({ row: 2 }), // SETTLE
      record({ row: 3, operationReference: 'PRL-2026-0001-004' }), // ligne inconnue
      record({ row: 4, operationReference: 'PRL-2026-0009-001' }), // remise inconnue
      record({ row: 5, operationReference: 'n’importe quoi' }), // référence illisible
      record({ row: 6, amount: 99999 }), // montant (ligne 1 déjà prévue : voir plus bas)
      record({ row: 7, operationReference: 'PRL-2026-0001-002' }), // déjà réglée
      record({ row: 8, operationReference: 'PRL-2026-0001-003' }), // annulée
      record({ row: 9, operationReference: 'PRL-2026-0001-002', outcome: 'REJECTED', rejectionCode: 'AC04' }) // rejet tardif
    ]);
    const result = await preview();

    const by = (row: number) => result.records.find(entry => entry.row === row) as any;
    expect(by(2)).toMatchObject({ action: 'SETTLE', skipReason: null });
    expect(by(3)).toMatchObject({ action: 'SKIP', skipReason: 'UNKNOWN_REFERENCE', match: null });
    expect(by(4)).toMatchObject({ action: 'SKIP', skipReason: 'UNKNOWN_REFERENCE', match: null });
    expect(by(5)).toMatchObject({ action: 'SKIP', skipReason: 'UNKNOWN_REFERENCE', match: null });
    expect(by(6)).toMatchObject({ action: 'SKIP', skipReason: 'ALREADY_PROCESSED' });
    expect(by(7)).toMatchObject({ action: 'SKIP', skipReason: 'ALREADY_PROCESSED' });
    expect(by(8)).toMatchObject({ action: 'SKIP', skipReason: 'LINE_CANCELED' });
    expect(by(9)).toMatchObject({ action: 'REJECT', skipReason: null, rejectionCode: 'AC04' });
    expect(by(2).match).toEqual({
      remittanceId: REMITTANCE,
      remittanceReference: 'PRL-2026-0001',
      lineId: lineId(1),
      lineStatus: 'PENDING',
      lineAmount: 100000,
      debtorName: 'Awa Traoré'
    });
    expect(result.summary).toEqual({ settle: 1, reject: 1, skip: 6, errors: 0 });
  });

  it('montant différent, date hors bornes, ligne rejetée, remise non déposée', async () => {
    line(3).status = 'REJECTED';
    parsed([
      record({ row: 2, amount: 99999 }),
      record({ row: 3, operationReference: 'PRL-2026-0001-002', date: '2026-10-25' }),
      record({ row: 4, operationReference: 'PRL-2026-0001-002', date: '2026-10-29' }),
      record({ row: 5, operationReference: 'PRL-2026-0001-003' }), // rejetée, règlement demandé
      record({ row: 6, operationReference: 'PRL-2026-0001-003', outcome: 'REJECTED' }), // déjà rejetée
      record({ row: 7, operationReference: 'PRL-2026-0001-002', outcome: 'REJECTED', amount: 5 })
    ]);
    const result = await preview();
    expect(result.records.map(entry => entry.skipReason)).toEqual([
      'AMOUNT_MISMATCH',
      'INVALID_DATE',
      'INVALID_DATE',
      'CONFLICT',
      'ALREADY_PROCESSED',
      'AMOUNT_MISMATCH'
    ]);

    harness.reset({ remittanceStatus: 'VALIDATED' });
    parsed([record()]);
    expect((await preview()).records[0]).toMatchObject({ action: 'SKIP', skipReason: 'REMITTANCE_NOT_SUBMITTED' });
  });

  it('le montant se compare au centime', async () => {
    line(1).amount = 100000.1;
    parsed([record({ amount: 100000.1 })]);
    expect((await preview()).records[0].action).toBe('SETTLE');
  });

  it('un enregistrement répété dans le fichier ne s’applique qu’une fois', async () => {
    parsed([
      record({ row: 2 }),
      record({ row: 3 }), // même règlement
      record({ row: 4, outcome: 'REJECTED' }), // rejet tardif du règlement du même fichier : permis
      record({ row: 5, operationReference: 'PRL-2026-0001-002', outcome: 'REJECTED' }),
      record({ row: 6, operationReference: 'PRL-2026-0001-002' }) // règlement d'une ligne rejetée plus haut
    ]);
    const result = await preview();
    expect(result.records.map(entry => [entry.action, entry.skipReason])).toEqual([
      ['SETTLE', null],
      ['SKIP', 'ALREADY_PROCESSED'],
      ['REJECT', null],
      ['REJECT', null],
      ['SKIP', 'CONFLICT']
    ]);
  });

  it('ne voit que l’agence et le périmètre de la route', async () => {
    parsed([record({ operationReference: 'PRL-2026-0001-002' })]);
    // L'autre agence ne possède que la ligne 1 de sa remise PRL-2026-0001.
    const other = await previewReturnFile(OTHER_TENANT, RENTAL, FILE, undefined);
    expect(other.records[0]).toMatchObject({ action: 'SKIP', skipReason: 'UNKNOWN_REFERENCE', match: null });
    // Un autre périmètre ne voit rien de la copropriété sur des remises de loyers.
    parsed([record()]);
    const syndic = await previewReturnFile(TENANT, SYNDIC, FILE, undefined);
    expect(syndic.records[0]).toMatchObject({ action: 'SKIP', skipReason: 'UNKNOWN_REFERENCE', match: null });
  });

  it('nom de fichier assaini, erreurs de lecture transmises, aucun écrit', async () => {
    parsed([record()], [{ row: 3, message: 'Date illisible.' }]);
    const result = await preview({
      buffer: FILE.buffer,
      originalname: `C:\\fakepath\\..\\dossier/${'x'.repeat(300)}${String.fromCharCode(7)}.csv`
    });
    expect(result.fileName).not.toMatch(/[\\/]/);
    expect(result.fileName).not.toContain(String.fromCharCode(7));
    expect(result.fileName.length).toBeLessThanOrEqual(200);
    expect(result.errors).toEqual([{ row: 3, message: 'Date illisible.' }]);
    expect(result.summary.errors).toBe(1);
    expect(result.format).toBe('GENERIC_CSV');
    expect(writes()).toBe(0);
    expect(state.imports).toHaveLength(0);
    expect(line(1).status).toBe('PENDING');
  });

  it('refuse l’absence de fichier, un fichier vide, trop gros ou d’un format inconnu', async () => {
    await expect(previewReturnFile(TENANT, RENTAL, undefined, undefined)).rejects.toBeInstanceOf(BadRequestError);
    await expect(preview({ buffer: Buffer.alloc(0) })).rejects.toBeInstanceOf(BadRequestError);
    await expect(preview({ buffer: Buffer.alloc(2 * 1024 * 1024 + 1, 1) })).rejects.toMatchObject({
      statusCode: 413
    });
    await expect(previewReturnFile(TENANT, RENTAL, FILE, 'MT940')).rejects.toMatchObject({ name: 'ZodError' });
    expect(mockParse).not.toHaveBeenCalled();
  });
});

describe('import d’un retour / application', () => {
  const twoRecords = () =>
    parsed([
      record({ row: 2 }),
      record({
        row: 3,
        operationReference: 'PRL-2026-0001-002',
        outcome: 'REJECTED',
        rejectionCode: 'AC04',
        rejectionReason: 'Compte clôturé'
      }),
      record({ row: 4, operationReference: 'PRL-2026-0009-001' })
    ]);

  it('applique chaque action dans sa transaction et trace l’import', async () => {
    twoRecords();
    const result = await apply();

    expect(result.results).toEqual([
      { row: 2, lineId: lineId(1), ok: true, error: null },
      { row: 3, lineId: lineId(2), ok: true, error: null }
    ]);
    expect(result.summary).toEqual({ settle: 1, reject: 1, skip: 1, errors: 0 });
    expect(line(1)).toMatchObject({
      status: 'SETTLED',
      returnSource: 'IMPORT',
      returnImportId: result.importId,
      returnRecordedByUserId: 'user-1'
    });
    expect(line(2)).toMatchObject({
      status: 'REJECTED',
      returnSource: 'IMPORT',
      returnImportId: result.importId,
      rejectionCode: 'AC04',
      rejectionReason: 'Compte clôturé'
    });

    expect(state.imports).toHaveLength(1);
    expect(state.imports[0]).toMatchObject({
      id: result.importId,
      tenantId: TENANT,
      scope: 'RENTAL_LEASE',
      format: 'GENERIC_CSV',
      fileName: 'retour-octobre.csv',
      fileDigest: expectedDigest(FILE.buffer),
      recordCount: 3,
      settledCount: 1,
      rejectedCount: 1,
      skippedCount: 1,
      errorCount: 0,
      importedByUserId: 'user-1'
    });

    const entry = mockAudit.record.mock.calls
      .map(call => call[1])
      .find(item => item.actionKey === AuditActionKey.DIRECT_DEBIT_RETURN_IMPORTED);
    // Compteurs seulement : ni nom de fichier, ni empreinte.
    expect(entry).toMatchObject({
      tenantId: TENANT,
      entityId: result.importId,
      payload: { format: 'GENERIC_CSV', recordCount: 3, settled: 1, rejected: 1, skipped: 1, errors: 0 }
    });
    expect(JSON.stringify(entry)).not.toContain('retour-octobre');
    expect(JSON.stringify(entry)).not.toContain(expectedDigest(FILE.buffer));
  });

  it('rejouer le même fichier ne change rien (ALREADY_PROCESSED)', async () => {
    twoRecords();
    await apply();
    mockCollector.settleTx.mockClear();
    mockCollector.reverseTx.mockClear();

    const replay = await apply();
    expect(replay.records.map(entry => entry.skipReason)).toEqual([
      'ALREADY_PROCESSED',
      'ALREADY_PROCESSED',
      'UNKNOWN_REFERENCE'
    ]);
    expect(replay.results).toEqual([]);
    expect(replay.summary).toMatchObject({ settle: 0, reject: 0, skip: 3 });
    expect(mockCollector.settleTx).not.toHaveBeenCalled();
    expect(state.imports).toHaveLength(2);
    expect(state.imports[1]).toMatchObject({ settledCount: 0, rejectedCount: 0, skippedCount: 3 });
    expect(line(1).returnImportId).toBe(state.imports[0].id);
  });

  it('l’échec d’une ligne est isolé, rapporté et compté', async () => {
    twoRecords();
    mockCollector.settleTx.mockRejectedValue(new Error('base injoignable'));
    const result = await apply();

    expect(result.results).toEqual([
      { row: 2, lineId: lineId(1), ok: false, error: 'Erreur inattendue : réessayez.' },
      { row: 3, lineId: lineId(2), ok: true, error: null }
    ]);
    expect(JSON.stringify(result)).not.toContain('base injoignable');
    expect(line(1).status).toBe('PENDING');
    expect(line(2).status).toBe('REJECTED');
    expect(state.imports[0]).toMatchObject({ settledCount: 0, rejectedCount: 1, errorCount: 1 });
  });

  it('les erreurs de lecture comptent dans l’import', async () => {
    parsed([record()], [{ row: 5, message: 'Montant illisible.' }]);
    const result = await apply();
    expect(result.errors).toHaveLength(1);
    expect(state.imports[0]).toMatchObject({ settledCount: 1, errorCount: 1 });
  });

  it('compteurs réels dans appliedSummary, et lineId + importId (rien de personnel) dans le journal d’un échec', async () => {
    twoRecords();
    mockCollector.settleTx.mockRejectedValue(new Error('base injoignable'));
    const result = await apply();
    expect(result.appliedSummary).toEqual({ settled: 0, rejected: 1, failed: 1 });
    expect(result.summary).toMatchObject({ settle: 1, reject: 1 });
    const warn = (logger.warn as jest.Mock).mock.calls.find(call => /non appliquée/.test(call[0]));
    expect(warn?.[1]).toMatchObject({ tenantId: TENANT, importId: result.importId, lineId: lineId(1) });
    expect(JSON.stringify(warn)).not.toMatch(/Awa|Traor|@example/);
  });

  it('un arrêt en cours de route laisse les compteurs des lignes déjà traitées', async () => {
    parsed([record({ row: 2 }), record({ row: 3, operationReference: 'PRL-2026-0001-002' })]);
    mockCollector.settleTx.mockImplementation(async (_tx: unknown, _ctx: unknown, l: any) => {
      if (l.id === lineId(2)) throw new Error('panne');
      return { rentalPaymentId: `pay-${l.id}` };
    });
    // Le journal lui-même tombe : la boucle s'interrompt après la première ligne appliquée.
    (logger.warn as jest.Mock).mockImplementationOnce(() => {
      throw new Error('journal indisponible');
    });
    await expect(apply()).rejects.toThrow('journal indisponible');
    expect(state.imports[0]).toMatchObject({ settledCount: 1, errorCount: 1 });
    expect(mockAudit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actionKey: AuditActionKey.DIRECT_DEBIT_RETURN_IMPORTED })
    );
  });

  it('refuse plus de 500 enregistrements à appliquer, avant toute écriture', async () => {
    const extra = Array.from({ length: 499 }, (_, index) => ({
      ...line(1),
      id: `66666666-6666-4666-8666-${String(index).padStart(12, '0')}`,
      lineNumber: 4 + index
    }));
    state.lines.push(...extra);
    const records = Array.from({ length: 502 }, (_, index) =>
      record({ row: index + 2, operationReference: `PRL-2026-0001-${String(index + 1).padStart(3, '0')}` })
    );
    parsed(records);
    await expect(apply()).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('502') });
    expect(state.imports).toHaveLength(0);
    expect(line(1).status).toBe('PENDING');

    // Pile 500 : accepté.
    parsed(records.slice(0, 500));
    const result = await apply();
    expect(result.appliedSummary).toEqual({ settled: 500, rejected: 0, failed: 0 });
  });

  it('au plus 50 remises distinctes par fichier (aperçu comme application)', async () => {
    const records = Array.from({ length: 51 }, (_, index) =>
      record({ row: index + 2, operationReference: `PRL-2026-${String(index + 1).padStart(4, '0')}-001` })
    );
    parsed(records);
    await expect(preview()).rejects.toBeInstanceOf(BadRequestError);
    await expect(apply()).rejects.toBeInstanceOf(BadRequestError);
    expect(state.imports).toHaveLength(0);

    parsed(records.slice(0, 50));
    await expect(preview()).resolves.toMatchObject({ summary: { skip: 49 } });
    // Une seule requête pour 50 couples (lots de 200).
    expect(db.directDebitRemittance.findMany).toHaveBeenCalledTimes(1);
  });

  it('rang de 3 à 6 chiffres dans la référence d’opération', async () => {
    state.lines.push({ ...line(1), id: lineId(8), lineNumber: 1234 });
    parsed([
      record({ operationReference: 'PRL-2026-0001-001234' }),
      record({ row: 3, operationReference: 'PRL-2026-0001-1' })
    ]);
    const result = await preview();
    expect(result.records[0].match?.lineId).toBe(lineId(8));
    expect(result.records[1].skipReason).toBe('UNKNOWN_REFERENCE');
  });

  it('une seule application à la fois par agence et périmètre : la seconde reçoit 409', async () => {
    parsed([record()]);
    let release: () => void = () => undefined;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    mockLock.mockImplementationOnce(async (_key, fn) => {
      await gate;
      return fn();
    });
    const first = apply();
    await expect(apply()).rejects.toMatchObject({ statusCode: 409 });
    expect(mockLock).toHaveBeenCalledTimes(1);
    expect(mockLock.mock.calls[0][0]).toBe(`direct-debit-return:${TENANT}:RENTAL_LEASE`);
    release();
    await expect(first).resolves.toMatchObject({ appliedSummary: { settled: 1, rejected: 0, failed: 0 } });
    // Le verrou local est relâché : une application suivante repart.
    parsed([record({ row: 5, operationReference: 'PRL-2026-0001-002' })]);
    await expect(apply()).resolves.toBeDefined();
  });

  it('verrou non obtenu à temps (autre instance) : 409 traduit', async () => {
    parsed([record()]);
    mockLock.mockRejectedValueOnce(
      Object.assign(new Error('Unable to start a transaction in the given time'), { code: 'P2028' })
    );
    await expect(apply()).rejects.toMatchObject({ statusCode: 409 });
    expect(state.imports).toHaveLength(0);
  });

  it('un fichier déjà appliqué dont tout est ALREADY_PROCESSED : 409 daté, sans nouvel import', async () => {
    parsed([record(), record({ row: 3, operationReference: 'PRL-2026-0001-002', outcome: 'REJECTED' })]);
    await apply();
    expect(state.imports).toHaveLength(1);

    // L'aperçu signale l'import précédent.
    const again = await preview();
    expect(again.alreadyImported).toEqual({
      importId: state.imports[0].id,
      importedAt: state.imports[0].createdAt.toISOString()
    });

    await expect(apply()).rejects.toMatchObject({
      statusCode: 409,
      message: 'Ce fichier a déjà été appliqué le 28/10/2026.'
    });
    expect(state.imports).toHaveLength(1);
  });

  it('autre fichier, autre agence ou autre périmètre : alreadyImported reste null', async () => {
    parsed([record()]);
    expect((await preview()).alreadyImported).toBeNull();
    await apply();
    const other = Buffer.from('autre contenu');
    expect((await preview({ buffer: other })).alreadyImported).toBeNull();
    expect((await previewReturnFile(OTHER_TENANT, RENTAL, FILE, undefined)).alreadyImported).toBeNull();
    expect((await previewReturnFile(TENANT, SYNDIC, FILE, undefined)).alreadyImported).toBeNull();
  });

  it('sans clé d’empreinte, rien n’est écrit', async () => {
    mockEnv.DIRECT_DEBIT_IBAN_KEY = undefined;
    twoRecords();
    await expect(apply()).rejects.toBeInstanceOf(BadRequestError);
    expect(state.imports).toHaveLength(0);
    expect(line(1).status).toBe('PENDING');
    expect(writes()).toBe(0);
  });

  it('refuse un fichier absent ou trop gros avant toute écriture', async () => {
    await expect(applyReturnFile(TENANT, RENTAL, undefined, undefined, 'user-1')).rejects.toBeInstanceOf(
      BadRequestError
    );
    await expect(apply({ buffer: Buffer.alloc(2 * 1024 * 1024 + 1, 1) })).rejects.toBeInstanceOf(AppError);
    expect(state.imports).toHaveLength(0);
  });

  it('la réponse ne contient ni IBAN ni adresse e-mail', async () => {
    twoRecords();
    const result = await apply();
    const text = JSON.stringify(result);
    expect(text).not.toMatch(/@example\.test|CI93|ddk1|ibanEncrypted/);
  });
});

describe('import d’un retour / historique', () => {
  it('liste les imports du périmètre avec leur auteur, page par page', async () => {
    state.imports = [
      {
        id: 'i-1',
        tenantId: TENANT,
        scope: 'RENTAL_LEASE',
        format: 'GENERIC_CSV',
        fileName: 'a.csv',
        recordCount: 4,
        settledCount: 2,
        rejectedCount: 1,
        skippedCount: 1,
        errorCount: 0,
        importedByUserId: 'user-1',
        createdAt: new Date('2026-10-20T10:00:00Z')
      },
      {
        id: 'i-2',
        tenantId: TENANT,
        scope: 'RENTAL_LEASE',
        format: 'GENERIC_CSV',
        fileName: 'b.csv',
        recordCount: 1,
        settledCount: 1,
        rejectedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        importedByUserId: null,
        createdAt: new Date('2026-10-25T10:00:00Z')
      },
      {
        id: 'i-3',
        tenantId: OTHER_TENANT,
        scope: 'RENTAL_LEASE',
        format: 'GENERIC_CSV',
        fileName: 'c.csv',
        recordCount: 1,
        settledCount: 1,
        rejectedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        importedByUserId: null,
        createdAt: new Date('2026-10-26T10:00:00Z')
      }
    ];
    const page = await listReturnImports(TENANT, RENTAL, { page: 1, pageSize: 1 });
    expect(page.total).toBe(2);
    expect(page.items).toEqual([
      {
        id: 'i-2',
        format: 'GENERIC_CSV',
        fileName: 'b.csv',
        recordCount: 1,
        settledCount: 1,
        rejectedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        importedBy: null,
        createdAt: '2026-10-25T10:00:00.000Z'
      }
    ]);
    const second = await listReturnImports(TENANT, RENTAL, { page: 2, pageSize: 1 });
    expect(second.items[0]).toMatchObject({ id: 'i-1', importedBy: { id: 'user-1', fullName: 'Gestionnaire Test' } });
    // Jamais l'e-mail de l'utilisateur.
    expect(JSON.stringify(second)).not.toContain('@');
  });
});
