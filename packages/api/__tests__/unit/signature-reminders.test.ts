/**
 * Rappels automatiques avant expiration (spec 044, SG-R11) : choix du seuil, une
 * seule fois par seuil, séquentiel, pas de relance sur place, jeton posé
 * seulement après un envoi réussi, réservation perdue = rien envoyé.
 */
type Row = Record<string, any>;

const DAY = 86_400_000;
const db: { requests: Row[]; events: Row[]; claimOk: boolean } = { requests: [], events: [], claimOk: true };

const prismaMock: Row = {
  signatureRequest: {
    findMany: jest.fn(async () => db.requests),
    updateMany: jest.fn(async () => ({ count: db.claimOk ? 1 : 0 }))
  },
  signatureEvent: { findMany: jest.fn(async () => db.events) },
  $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prismaMock))
};
jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));
jest.mock('../../src/config/env', () => ({ env: { SIGNATURE_REMINDER_DAYS_BEFORE: [3, 1] } }));
jest.mock('../../src/services/audit-service', () => ({
  recordAuditEvent: jest.fn(async () => undefined)
}));

const appendSignatureEventStandalone = jest.fn(async (input: Row) => {
  db.events.push({ requestId: input.requestId, payload: input.payload });
});
jest.mock('../../src/lib/signature/events', () => ({
  appendSignatureEventStandalone: (input: Row) => appendSignatureEventStandalone(input)
}));
const inviteSigner = jest.fn();
const commitSignerToken = jest.fn(async (..._args: unknown[]) => true);
jest.mock('../../src/lib/signature/notify', () => ({
  agencyNameOf: jest.fn(async () => 'Agence'),
  inviteSigner: (...a: unknown[]) => inviteSigner(...a),
  prepareSignerToken: jest.fn(() => ({ token: 't'.repeat(32), tokenHash: 'h'.repeat(64), tokenExpiresAt: new Date() })),
  commitSignerToken: (...a: unknown[]) => commitSignerToken(...a)
}));

import { env } from '../../src/config/env';
import { recordAuditEvent } from '../../src/services/audit-service';
import { applicableThreshold, sendDueSignatureReminders } from '../../src/lib/signature/reminders';

const now = new Date('2026-10-16T10:00:00Z');
const signer = (id: string, status = 'PENDING', channel = 'EMAIL') => ({
  id,
  fullName: id,
  channel,
  contact: `${id}@exemple.ci`,
  contactId: null,
  status
});
const request = (days: number, signers: Row[], extra: Row = {}) => ({
  id: 'r1',
  tenantId: 't1',
  title: 'Bail',
  language: 'fr',
  providerId: 'internal',
  sequential: false,
  expiresAt: new Date(now.getTime() + days * DAY),
  signers,
  ...extra
});

beforeEach(() => {
  jest.clearAllMocks();
  db.requests = [];
  db.events = [];
  db.claimOk = true;
  (env as Row).SIGNATURE_REMINDER_DAYS_BEFORE = [3, 1];
  inviteSigner.mockResolvedValue('SENT');
  commitSignerToken.mockResolvedValue(true);
});

describe('applicableThreshold', () => {
  const at = (days: number) => applicableThreshold([3, 1], new Date(now.getTime() + days * DAY), now);
  it('retient le plus petit seuil atteint', () => {
    expect(at(5)).toBeNull();
    expect(at(3)).toBe(3);
    expect(at(2)).toBe(3);
    expect(at(1)).toBe(1);
    expect(at(0.5)).toBe(1);
    expect(at(0)).toBeNull();
    expect(at(-1)).toBeNull();
  });
});

describe('sendDueSignatureReminders', () => {
  it('relance au seuil 3 à 2 jours, trace REMINDER_AUTO et un audit système', async () => {
    db.requests = [request(2, [signer('a'), signer('b', 'SIGNED')])];
    const result = await sendDueSignatureReminders(now);
    expect(result).toEqual({ requests: 1, reminded: 1, failed: 0 });
    expect(inviteSigner.mock.calls[0][0]).toMatchObject({ reminder: true, signer: { id: 'a' } });
    expect(commitSignerToken).toHaveBeenCalledTimes(1);
    expect(appendSignatureEventStandalone).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'REMINDER_AUTO', payload: { threshold: 3, reminded: 1, failed: 0 } })
    );
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorType: 'SYSTEM', actionKey: 'SIGNATURE_REMINDER_AUTO' })
    );
  });

  it('applique le seuil 1 à 0,5 jour, même si le seuil 3 a été manqué (une seule relance)', async () => {
    db.requests = [request(0.5, [signer('a')])];
    await sendDueSignatureReminders(now);
    expect(inviteSigner).toHaveBeenCalledTimes(1);
    expect(db.events.map(e => e.payload.threshold)).toEqual([1]);
  });

  it('ne relance qu’une fois par seuil (idempotent au second passage)', async () => {
    db.requests = [request(2, [signer('a')])];
    await sendDueSignatureReminders(now);
    const second = await sendDueSignatureReminders(new Date(now.getTime() + 3600_000 * 2));
    expect(second).toEqual({ requests: 0, reminded: 0, failed: 0 });
    expect(inviteSigner).toHaveBeenCalledTimes(1);
    // Le seuil 1 reste à jouer plus tard.
    db.requests = [request(1.9, [signer('a')])];
    await sendDueSignatureReminders(new Date(now.getTime() + DAY));
    expect(inviteSigner).toHaveBeenCalledTimes(2);
  });

  it('séquentiel : seulement le premier signataire non signé', async () => {
    db.requests = [request(2, [signer('s0', 'SIGNED'), signer('s1'), signer('s2')], { sequential: true })];
    const result = await sendDueSignatureReminders(now);
    expect(result.reminded).toBe(1);
    expect(inviteSigner).toHaveBeenCalledTimes(1);
    expect(inviteSigner.mock.calls[0][0].signer.id).toBe('s1');
  });

  it('ne cible jamais un signataire OPENED (ni le suivant s’il est le signataire courant)', async () => {
    db.requests = [request(2, [signer('o', 'OPENED'), signer('p')])];
    await sendDueSignatureReminders(now);
    expect(inviteSigner).toHaveBeenCalledTimes(1);
    expect(inviteSigner.mock.calls[0][0].signer.id).toBe('p');
    jest.clearAllMocks();
    db.events = [];
    db.requests = [request(2, [signer('o', 'OPENED'), signer('p')], { sequential: true })];
    expect(await sendDueSignatureReminders(now)).toEqual({ requests: 0, reminded: 0, failed: 0 });
    expect(inviteSigner).not.toHaveBeenCalled();
  });

  it('ne concerne que les demandes du fournisseur interne ou log (recherche et réservation)', async () => {
    db.requests = [request(2, [signer('a')])];
    await sendDueSignatureReminders(now);
    expect(prismaMock.signatureRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ providerId: { in: ['internal', 'log'] } })
      })
    );
    expect(prismaMock.signatureRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ providerId: { in: ['internal', 'log'] } })
      })
    );
  });

  it('jamais de relance sur place, et rien de tracé si personne à relancer', async () => {
    db.requests = [request(2, [signer('p', 'PENDING', 'IN_PERSON')])];
    const result = await sendDueSignatureReminders(now);
    expect(result).toEqual({ requests: 0, reminded: 0, failed: 0 });
    expect(inviteSigner).not.toHaveBeenCalled();
    expect(prismaMock.signatureRequest.updateMany).not.toHaveBeenCalled();
    expect(appendSignatureEventStandalone).not.toHaveBeenCalled();
  });

  it('ne pose pas le nouveau jeton après un échec d’envoi', async () => {
    db.requests = [request(2, [signer('a'), signer('b')])];
    inviteSigner.mockResolvedValueOnce('FAILED').mockResolvedValueOnce('SENT');
    const result = await sendDueSignatureReminders(now);
    expect(result).toEqual({ requests: 1, reminded: 1, failed: 1 });
    expect(commitSignerToken).toHaveBeenCalledTimes(1);
    expect(commitSignerToken.mock.calls[0][1]).toBe('b');
    expect(db.events[0].payload).toEqual({ threshold: 3, reminded: 1, failed: 1 });
  });

  it('réservation perdue : rien n’est envoyé ni tracé', async () => {
    db.requests = [request(2, [signer('a')])];
    db.claimOk = false;
    const result = await sendDueSignatureReminders(now);
    expect(result).toEqual({ requests: 0, reminded: 0, failed: 0 });
    expect(inviteSigner).not.toHaveBeenCalled();
    expect(appendSignatureEventStandalone).not.toHaveBeenCalled();
    expect(prismaMock.signatureRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ OR: expect.arrayContaining([{ lastReminderAt: null }]) })
      })
    );
  });

  it('ne fait rien quand les rappels sont désactivés', async () => {
    (env as Row).SIGNATURE_REMINDER_DAYS_BEFORE = [];
    db.requests = [request(2, [signer('a')])];
    expect(await sendDueSignatureReminders(now)).toEqual({ requests: 0, reminded: 0, failed: 0 });
    expect(prismaMock.signatureRequest.findMany).not.toHaveBeenCalled();
  });
});
