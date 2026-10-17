/**
 * Retour banque : constat de règlement, de rejet et de toute la remise
 * (spec 042, P3, data-model §8.3 et §8.4).
 *
 * Prisma est remplacé par la base en mémoire de `__tests__/helpers/direct-debit-return-db`
 * (filtres d'agence, `updateMany` conditionnel, restauration de l'état si la
 * transaction échoue). L'encaisseur est simulé : le test vérifie ce que le
 * service lui demande, `direct-debit.collector-rental.test.ts` ce qu'il écrit.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockAudit = { record: jest.fn() };
const mockMail = { send: jest.fn(), config: jest.fn() };
const mockAfterCommit = jest.fn();
const mockCollector = {
  scope: 'RENTAL_LEASE',
  keepsActiveKeyOnSettle: true,
  settleTx: jest.fn(),
  reverseTx: jest.fn(),
  applyRejectFeeTx: jest.fn()
};

jest.mock('../../src/utils/database', () => ({ prisma: require('../helpers/direct-debit-return-db').harness.db }));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({
  recordAuditEvent: (...args: unknown[]) => mockAudit.record(...args),
  logAuditEvent: jest.fn()
}));
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendDirectDebitRejected: (...args: unknown[]) => mockMail.send(...args) }
}));
jest.mock('../../src/services/email-notification-config-service', () => ({
  getEmailNotificationConfig: (...args: unknown[]) => mockMail.config(...args)
}));
jest.mock('../../src/lib/direct-debit/collectors', () => ({ getCollector: () => mockCollector }));
jest.mock('../../src/lib/direct-debit/remittance-dto', () => ({
  ...jest.requireActual('../../src/lib/direct-debit/remittance-dto'),
  loadRemittanceDto: jest.fn(async (_db: unknown, _tenantId: string, id: string) => ({
    id,
    reference: 'PRL-2026-0001'
  }))
}));

import { BadRequestError, ConflictError, NotFoundError } from '../../src/middleware/error-middleware';
import { logger } from '../../src/utils/logger';
import {
  rejectRemittanceLine,
  settleAllRemittanceLines,
  settleRemittanceLine
} from '../../src/lib/direct-debit/returns';
import { AuditActionKey } from '../../src/types/audit-types';
import {
  MANDATE_A,
  NOW,
  OTHER_REMITTANCE,
  OTHER_TENANT,
  REMITTANCE,
  TENANT,
  harness,
  lineId
} from '../helpers/direct-debit-return-db';

const { state } = harness;
const RENTAL = { scope: 'RENTAL_LEASE' } as const;
const SYNDIC = { scope: 'SYNDIC_LOT', syndicateId: 'synd-1' } as const;

const line = (n: number) => state.lines.find(row => row.id === lineId(n)) as Record<string, any>;
const mandate = (id: string) => state.mandates.find(row => row.id === id) as Record<string, any>;
const remittance = () => state.remittances.find(row => row.id === REMITTANCE) as Record<string, any>;
const auditKeys = () => mockAudit.record.mock.calls.map(call => call[1].actionKey);
const auditOf = (key: string) =>
  mockAudit.record.mock.calls.map(call => call[1]).find(entry => entry.actionKey === key);

const settle = (n = 1, settledAt = '2026-10-27') =>
  settleRemittanceLine(TENANT, RENTAL, REMITTANCE, lineId(n), { settledAt }, 'user-1');
const reject = (n = 1, input: Record<string, any> = {}) =>
  rejectRemittanceLine(
    TENANT,
    RENTAL,
    REMITTANCE,
    lineId(n),
    { rejectedAt: '2026-10-27', code: 'AC04', reason: 'Compte clôturé', ...input },
    'user-1'
  );

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
  mockCollector.keepsActiveKeyOnSettle = true;
  mockCollector.settleTx.mockImplementation(async (_tx: unknown, _ctx: unknown, l: any) => ({
    rentalPaymentId: `pay-${l.id}`,
    afterCommit: mockAfterCommit
  }));
  mockCollector.reverseTx.mockResolvedValue({});
  mockCollector.applyRejectFeeTx.mockImplementation(async (_tx: unknown, _ctx: unknown, _l: unknown, fee: number) => ({
    appliedAmount: fee
  }));
  mockAfterCommit.mockResolvedValue(undefined);
  mockAudit.record.mockResolvedValue(undefined);
  mockMail.config.mockResolvedValue({ enabled: true, subjectOverride: null, bodyHtmlOverride: null });
  mockMail.send.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

/** Ni IBAN, ni adresse e-mail complète, ni texte chiffré dans ce qui est écrit au journal. */
function expectCleanAudit() {
  const text = JSON.stringify(mockAudit.record.mock.calls.map(call => call[1]));
  expect(text).not.toMatch(/@example\.test/);
  expect(text).not.toMatch(/CI93|ddk1|ibanEncrypted/i);
}

describe('retour banque / constat de règlement', () => {
  it('règle la ligne : encaissement lié, statut, traçabilité, compteur remis à 0, audit', async () => {
    mandate(MANDATE_A).consecutiveRejects = 1;
    const result = await settle();

    expect(result).toEqual({ id: REMITTANCE, reference: 'PRL-2026-0001' });
    expect(line(1)).toMatchObject({
      status: 'SETTLED',
      settledAt: new Date('2026-10-27T00:00:00Z'),
      returnSource: 'MANUAL',
      returnImportId: null,
      returnRecordedAt: NOW,
      returnRecordedByUserId: 'user-1',
      rentalPaymentId: `pay-${lineId(1)}`,
      // Le loyer est payé : l'échéance reste occupée.
      activeKey: 'inst-1'
    });
    expect(mandate(MANDATE_A).consecutiveRejects).toBe(0);

    const [, ctx, collectorLine, settledAt] = mockCollector.settleTx.mock.calls[0];
    expect(ctx).toEqual({ tenantId: TENANT, actorUserId: 'user-1', now: NOW });
    expect(collectorLine).toMatchObject({
      id: lineId(1),
      tenantId: TENANT,
      reference: 'PRL-2026-0001-001',
      amount: 100000,
      scope: 'RENTAL_LEASE',
      leaseId: 'lease-1',
      installmentId: 'inst-1',
      treasuryAccountId: 'treasury-1'
    });
    expect(settledAt).toEqual(new Date('2026-10-27T00:00:00Z'));

    const entry = auditOf(AuditActionKey.DIRECT_DEBIT_LINE_SETTLED);
    expect(entry).toMatchObject({
      tenantId: TENANT,
      actorUserId: 'user-1',
      entityId: lineId(1),
      payload: {
        reference: 'PRL-2026-0001-001',
        amount: 100000,
        settledAt: '2026-10-27',
        source: 'MANUAL',
        paymentId: `pay-${lineId(1)}`
      }
    });
    expectCleanAudit();
  });

  it('une remise EXPORTED passe d’abord à SUBMITTED, avec son audit', async () => {
    harness.reset({ remittanceStatus: 'EXPORTED' });
    await settle();
    expect(remittance()).toMatchObject({ status: 'SUBMITTED', submittedAt: NOW, submittedByUserId: 'user-1' });
    expect(auditKeys()).toEqual([
      AuditActionKey.DIRECT_DEBIT_REMITTANCE_SUBMITTED,
      AuditActionKey.DIRECT_DEBIT_LINE_SETTLED
    ]);
  });

  it('un encaisseur qui ne garde pas la clé la libère', async () => {
    mockCollector.keepsActiveKeyOnSettle = false;
    await settle();
    expect(line(1).activeKey).toBeNull();
  });

  it('la quittance est produite après le commit, et son échec ne fait pas échouer le constat', async () => {
    mockAfterCommit.mockRejectedValue(new Error('modèle DOCX absent'));
    await expect(settle()).resolves.toBeDefined();
    expect(mockAfterCommit).toHaveBeenCalledTimes(1);
    expect(line(1).status).toBe('SETTLED');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ tenantId: TENANT, errorName: 'Error' })
    );
  });

  it('refuse une date avant le prélèvement ou dans le futur, sans rien écrire', async () => {
    await expect(settle(1, '2026-10-25')).rejects.toBeInstanceOf(BadRequestError);
    await expect(settle(1, '2026-10-29')).rejects.toBeInstanceOf(BadRequestError);
    await expect(settle(1, '27/10/2026')).rejects.toBeInstanceOf(BadRequestError);
    expect(line(1).status).toBe('PENDING');
    expect(mockCollector.settleTx).not.toHaveBeenCalled();
    // Les bornes sont incluses.
    await expect(settle(1, '2026-10-26')).resolves.toBeDefined();
    await expect(settle(2, '2026-10-28')).resolves.toBeDefined();
  });

  it('un double constat est refusé (409) et ne crée pas un deuxième encaissement', async () => {
    await settle();
    await expect(settle()).rejects.toBeInstanceOf(ConflictError);
    expect(mockCollector.settleTx).toHaveBeenCalledTimes(1);
  });

  it('une ligne réservée entre la lecture et l’écriture donne 409 (mise à jour conditionnelle)', async () => {
    const original = harness.db.directDebitRemittanceLine.updateMany.getMockImplementation();
    harness.db.directDebitRemittanceLine.updateMany.mockImplementationOnce(async () => ({ count: 0 }));
    await expect(settle()).rejects.toBeInstanceOf(ConflictError);
    expect(mockCollector.settleTx).not.toHaveBeenCalled();
    harness.db.directDebitRemittanceLine.updateMany.mockImplementation(original);
  });

  it('une panne de l’encaisseur annule tout : la ligne reste PENDING', async () => {
    mockCollector.settleTx.mockRejectedValue(new ConflictError('Encaissement impossible'));
    await expect(settle()).rejects.toBeInstanceOf(ConflictError);
    expect(line(1)).toMatchObject({ status: 'PENDING', settledAt: null, rentalPaymentId: null });
    expect(mockAudit.record).not.toHaveBeenCalled();
  });

  it('ligne, remise ou périmètre d’une autre agence : 404 identique à « inexistant »', async () => {
    const attempts = [
      // Ligne d'une autre agence, par l'identifiant de sa propre remise.
      settleRemittanceLine(TENANT, RENTAL, OTHER_REMITTANCE, lineId(9), { settledAt: '2026-10-27' }, 'user-1'),
      // Ligne de l'agence, remise d'une autre agence.
      settleRemittanceLine(TENANT, RENTAL, OTHER_REMITTANCE, lineId(1), { settledAt: '2026-10-27' }, 'user-1'),
      // Ligne d'une autre agence dans la remise de l'agence.
      settleRemittanceLine(TENANT, RENTAL, REMITTANCE, lineId(9), { settledAt: '2026-10-27' }, 'user-1'),
      // Autre périmètre (copropriété).
      settleRemittanceLine(TENANT, SYNDIC, REMITTANCE, lineId(1), { settledAt: '2026-10-27' }, 'user-1'),
      // Agence étrangère aux données.
      settleRemittanceLine(OTHER_TENANT, RENTAL, REMITTANCE, lineId(1), { settledAt: '2026-10-27' }, 'user-1'),
      // Identifiants inconnus.
      settleRemittanceLine(TENANT, RENTAL, REMITTANCE, lineId(8), { settledAt: '2026-10-27' }, 'user-1')
    ];
    const outcomes = await Promise.allSettled(attempts);
    for (const outcome of outcomes) {
      expect(outcome.status).toBe('rejected');
      expect((outcome as PromiseRejectedResult).reason).toBeInstanceOf(NotFoundError);
    }
    expect(state.lines.every(row => row.status === 'PENDING')).toBe(true);
    expect(mockCollector.settleTx).not.toHaveBeenCalled();
  });

  it('refuse une remise qui n’est ni exportée ni déposée', async () => {
    for (const status of ['DRAFT', 'VALIDATED', 'CANCELED']) {
      harness.reset({ remittanceStatus: status });
      await expect(settle()).rejects.toBeInstanceOf(ConflictError);
    }
    expect(mockCollector.settleTx).not.toHaveBeenCalled();
  });

  it('refuse une ligne annulée ou déjà rejetée', async () => {
    line(1).status = 'CANCELED';
    line(2).status = 'REJECTED';
    await expect(settle(1)).rejects.toBeInstanceOf(ConflictError);
    await expect(settle(2)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('retour banque / constat de rejet', () => {
  it('rejette une ligne PENDING : libère l’échéance, compte le rejet, audit, e-mail masqué', async () => {
    const result = await reject();

    expect(result).toEqual({ id: REMITTANCE, reference: 'PRL-2026-0001' });
    expect(line(1)).toMatchObject({
      status: 'REJECTED',
      rejectedAt: new Date('2026-10-27T00:00:00Z'),
      rejectionCode: 'AC04',
      rejectionReason: 'Compte clôturé',
      activeKey: null,
      returnSource: 'MANUAL',
      returnRecordedAt: NOW,
      returnRecordedByUserId: 'user-1',
      rejectFeeAmount: 0
    });
    expect(mandate(MANDATE_A).consecutiveRejects).toBe(1);
    expect(mandate(MANDATE_A).status).toBe('ACTIVE');
    expect(mockCollector.reverseTx).not.toHaveBeenCalled();
    expect(mockCollector.applyRejectFeeTx).not.toHaveBeenCalled();

    expect(auditOf(AuditActionKey.DIRECT_DEBIT_LINE_REJECTED)).toMatchObject({
      entityId: lineId(1),
      payload: expect.objectContaining({
        reference: 'PRL-2026-0001-001',
        code: 'AC04',
        reason: 'Compte clôturé',
        wasSettled: false,
        rejectFee: 0,
        mandateSuspended: false,
        source: 'MANUAL'
      })
    });
    expectCleanAudit();

    // E-mail au compte portail du débiteur, après la transaction : IBAN masqué, rien d'autre de sensible.
    expect(mockMail.send).toHaveBeenCalledTimes(1);
    const [to, vars, options] = mockMail.send.mock.calls[0];
    expect(to).toBe('awa.traore@example.test');
    expect(vars).toMatchObject({
      debtorName: 'Awa Traoré',
      agencyName: 'Agence Test',
      mandateReference: 'MDT-2026-0001',
      reason: 'Compte clôturé',
      rejectFee: '',
      suspensionNotice: ''
    });
    expect(vars.ibanMasked).toMatch(/0589$/);
    expect(JSON.stringify(vars)).not.toMatch(/CI93|ddk1/);
    expect(options).toMatchObject({ tenantId: TENANT });
  });

  it('refacture les frais de rejet configurés et le dit au débiteur', async () => {
    harness.reset({ creditor: { rejectFeeAmount: 2500 } });
    await reject();
    expect(mockCollector.applyRejectFeeTx).toHaveBeenCalledTimes(1);
    expect(mockCollector.applyRejectFeeTx.mock.calls[0][3]).toBe(2500);
    expect(line(1).rejectFeeAmount).toBe(2500);
    expect(auditOf(AuditActionKey.DIRECT_DEBIT_LINE_REJECTED).payload.rejectFee).toBe(2500);
    expect(mockMail.send.mock.calls[0][1].rejectFee).toContain('2');
    expect(mockMail.send.mock.calls[0][1].rejectFee).toContain('FCFA');
  });

  it('un encaisseur qui ne refacture rien laisse les frais à 0', async () => {
    harness.reset({ creditor: { rejectFeeAmount: 2500 } });
    mockCollector.applyRejectFeeTx.mockResolvedValue({ appliedAmount: 0 });
    await reject();
    expect(line(1).rejectFeeAmount).toBe(0);
    expect(mockMail.send.mock.calls[0][1].rejectFee).toBe('');
  });

  it('rejet tardif d’une ligne réglée : contre-passation, puis rejet', async () => {
    await settle();
    mockCollector.reverseTx.mockResolvedValue({ afterCommit: mockAfterCommit });
    mockAfterCommit.mockClear();
    await reject();

    expect(mockCollector.reverseTx).toHaveBeenCalledTimes(1);
    expect(mockCollector.reverseTx.mock.calls[0][2]).toMatchObject({
      id: lineId(1),
      rentalPaymentId: `pay-${lineId(1)}`
    });
    expect(mockAfterCommit).toHaveBeenCalledTimes(1);
    expect(line(1)).toMatchObject({ status: 'REJECTED', activeKey: null });
    expect(auditOf(AuditActionKey.DIRECT_DEBIT_LINE_REJECTED).payload.wasSettled).toBe(true);
  });

  it('un encaisseur qui ne sait pas contre-passer lève 409 et rien n’est écrit', async () => {
    await settle();
    mockCollector.reverseTx.mockRejectedValue(new ConflictError('Contre-passation impossible'));
    mockAudit.record.mockClear();
    mockMail.send.mockClear();
    await expect(reject()).rejects.toBeInstanceOf(ConflictError);
    expect(line(1)).toMatchObject({ status: 'SETTLED', rejectedAt: null });
    expect(mandate(MANDATE_A).consecutiveRejects).toBe(0);
    expect(mockAudit.record).not.toHaveBeenCalled();
    expect(mockMail.send).not.toHaveBeenCalled();
  });

  it('suspend le mandat au seuil de rejets consécutifs, avec audit et mention dans l’e-mail', async () => {
    mandate(MANDATE_A).consecutiveRejects = 1;
    await reject();
    expect(mandate(MANDATE_A)).toMatchObject({
      status: 'SUSPENDED',
      suspendedAt: NOW,
      consecutiveRejects: 2
    });
    expect(mandate(MANDATE_A).suspensionReason).toBe('Suspendu automatiquement après 2 rejets consécutifs.');
    expect(auditKeys()).toEqual([
      AuditActionKey.DIRECT_DEBIT_MANDATE_AUTO_SUSPENDED,
      AuditActionKey.DIRECT_DEBIT_LINE_REJECTED
    ]);
    expect(auditOf(AuditActionKey.DIRECT_DEBIT_LINE_REJECTED).payload.mandateSuspended).toBe(true);
    expect(mockMail.send.mock.calls[0][1].suspensionNotice).toContain('2');
    expectCleanAudit();
  });

  it('ne suspend pas un mandat déjà suspendu ni sous le seuil', async () => {
    mandate(MANDATE_A).status = 'SUSPENDED';
    mandate(MANDATE_A).consecutiveRejects = 5;
    await reject();
    expect(auditKeys()).not.toContain(AuditActionKey.DIRECT_DEBIT_MANDATE_AUTO_SUSPENDED);
    expect(mandate(MANDATE_A).suspendedAt).toBeUndefined();
  });

  it('une remise EXPORTED passe à SUBMITTED au premier rejet', async () => {
    harness.reset({ remittanceStatus: 'EXPORTED' });
    await reject();
    expect(remittance().status).toBe('SUBMITTED');
    expect(auditKeys()).toContain(AuditActionKey.DIRECT_DEBIT_REMITTANCE_SUBMITTED);
  });

  it('refuse une ligne déjà rejetée ou annulée, et une date hors bornes', async () => {
    line(1).status = 'REJECTED';
    line(2).status = 'CANCELED';
    await expect(reject(1)).rejects.toBeInstanceOf(ConflictError);
    await expect(reject(2)).rejects.toBeInstanceOf(ConflictError);
    await expect(reject(3, { rejectedAt: '2026-10-01' })).rejects.toBeInstanceOf(BadRequestError);
    await expect(reject(3, { rejectedAt: '2026-11-30' })).rejects.toBeInstanceOf(BadRequestError);
    expect(line(3).status).toBe('PENDING');
  });

  it('ligne d’une autre agence ou d’un autre périmètre : 404', async () => {
    await expect(
      rejectRemittanceLine(
        TENANT,
        RENTAL,
        OTHER_REMITTANCE,
        lineId(9),
        { rejectedAt: '2026-10-27', code: 'AC04' },
        null
      )
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      rejectRemittanceLine(TENANT, SYNDIC, REMITTANCE, lineId(1), { rejectedAt: '2026-10-27', code: 'AC04' }, null)
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('le motif seul ou le code seul suffisent ; les chaînes vides deviennent nulles', async () => {
    await reject(1, { code: '  ', reason: 'Provision insuffisante' });
    expect(line(1)).toMatchObject({ rejectionCode: null, rejectionReason: 'Provision insuffisante' });
    await reject(2, { code: 'MD01', reason: undefined });
    expect(line(2)).toMatchObject({ rejectionCode: 'MD01', rejectionReason: null });
    // Sans motif, l'e-mail annonce le code.
    expect(mockMail.send.mock.calls[1][1].reason).toBe('MD01');
  });

  describe('notification du débiteur', () => {
    it('adresse de la fiche contact quand le débiteur n’a pas de compte', async () => {
      await reject(2);
      expect(mockMail.send.mock.calls[0][0]).toBe('koffi.yao@example.test');
    });

    it('rien n’est envoyé si la notification est désactivée ou sans adresse', async () => {
      mockMail.config.mockResolvedValue({ enabled: false, subjectOverride: null, bodyHtmlOverride: null });
      await reject(1);
      expect(mockMail.send).not.toHaveBeenCalled();
      mockMail.config.mockResolvedValue({ enabled: true, subjectOverride: null, bodyHtmlOverride: null });
      state.contacts = [];
      await reject(2);
      expect(mockMail.send).not.toHaveBeenCalled();
    });

    it('un échec d’envoi est isolé et ne journalise ni l’adresse ni le message', async () => {
      mockMail.send.mockRejectedValue(new Error('550 awa.traore@example.test refusé'));
      await expect(reject()).resolves.toBeDefined();
      expect(line(1).status).toBe('REJECTED');
      const logged = JSON.stringify((logger.warn as jest.Mock).mock.calls);
      expect(logged).not.toContain('example.test');
      expect(logged).toContain('Error');
    });
  });
});

describe('retour banque / constat de toute la remise', () => {
  it('règle les lignes PENDING, une transaction chacune, et isole les échecs', async () => {
    line(3).status = 'SETTLED';
    mockCollector.settleTx.mockImplementation(async (_tx: unknown, _ctx: unknown, l: any) => {
      if (l.id === lineId(2)) throw new ConflictError('Échéance déjà soldée');
      return { rentalPaymentId: `pay-${l.id}` };
    });

    const result = await settleAllRemittanceLines(TENANT, RENTAL, REMITTANCE, { settledAt: '2026-10-27' }, 'user-1');

    expect(result.settled).toBe(1);
    expect(result.failed).toEqual([
      { lineId: lineId(2), reference: 'PRL-2026-0001-002', error: 'Échéance déjà soldée' }
    ]);
    expect(result.remittance).toEqual({ id: REMITTANCE, reference: 'PRL-2026-0001' });
    expect(line(1).status).toBe('SETTLED');
    expect(line(2)).toMatchObject({ status: 'PENDING', rentalPaymentId: null });
    expect(harness.db.$transaction).toHaveBeenCalledTimes(2);
  });

  it('une panne technique ne divulgue pas son message', async () => {
    harness.state.failOnLine = lineId(1);
    const result = await settleAllRemittanceLines(TENANT, RENTAL, REMITTANCE, { settledAt: '2026-10-27' }, null);
    expect(result.settled).toBe(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].error).not.toContain('panne simulée');
  });

  it('une date invalide ou une remise inconnue est UNE erreur, pas N échecs', async () => {
    await expect(
      settleAllRemittanceLines(TENANT, RENTAL, REMITTANCE, { settledAt: '2026-12-31' }, 'user-1')
    ).rejects.toBeInstanceOf(BadRequestError);
    await expect(
      settleAllRemittanceLines(TENANT, RENTAL, OTHER_REMITTANCE, { settledAt: '2026-10-27' }, 'user-1')
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      settleAllRemittanceLines(TENANT, SYNDIC, REMITTANCE, { settledAt: '2026-10-27' }, 'user-1')
    ).rejects.toBeInstanceOf(NotFoundError);
    harness.reset({ remittanceStatus: 'VALIDATED' });
    await expect(
      settleAllRemittanceLines(TENANT, RENTAL, REMITTANCE, { settledAt: '2026-10-27' }, 'user-1')
    ).rejects.toBeInstanceOf(ConflictError);
    expect(mockCollector.settleTx).not.toHaveBeenCalled();
  });
});
