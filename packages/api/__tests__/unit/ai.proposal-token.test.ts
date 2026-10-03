/**
 * Lot D — jeton de proposition d'ImmoCopilot (lib/ai/proposal-token.ts).
 * Prisma est remplacé : la table d'usage unique et la réclamation AuditLog
 * sont observées sans base.
 */
import { createHmac, hkdfSync } from 'node:crypto';

const callOrder: string[] = [];
const mockPrisma: Record<string, unknown> & {
  auditLog: { findFirst: jest.Mock; create: jest.Mock };
} = {
  auditLog: {
    findFirst: jest.fn(),
    create: jest.fn()
  },
  // Transaction interactive : le client de transaction est le faux client lui-même.
  $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma)),
  $executeRaw: jest.fn(async (...args: unknown[]) => {
    callOrder.push(`lock:${String(args[1])}`);
    return 0;
  })
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

import { env } from '../../src/config/env';
import { COPILOT_MAX_PROPOSAL_TOKEN_CHARS, type GenerateRentalDocumentArgs } from '../../src/lib/ai/contracts';
import {
  peekProposalAction,
  ProposalError,
  redeemProposal,
  resetProposalUsageForTests,
  signCapabilityProposal,
  signProposal,
  verifyCapabilityProposal,
  verifyProposal
} from '../../src/lib/ai/proposal-token';

const USER = 'user-1';
const TENANT = 'tenant-a';
const ARGS: GenerateRentalDocumentArgs = {
  docType: 'RENT_RECEIPT',
  leaseId: '11111111-1111-4111-8111-111111111111',
  paymentId: '22222222-2222-4222-8222-222222222222',
  installmentId: '33333333-3333-4333-8333-333333333333'
};

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

/** Reproduit indépendamment la dérivation du plan (§3) pour forger un jeton. */
function forge(claims: Record<string, unknown>): string {
  const key = Buffer.from(hkdfSync('sha256', env.JWT_SECRET, 'immotopia/immocopilot', 'proposal-token/v1', 32));
  const payload = b64(claims);
  const signature = createHmac('sha256', key).update(`v1.${payload}`).digest('base64url');
  return `v1.${payload}.${signature}`;
}

function expectProposalError(fn: () => unknown, code: string, status: number): ProposalError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ProposalError);
    expect((error as ProposalError).code).toBe(code);
    expect((error as ProposalError).statusCode).toBe(status);
    return error as ProposalError;
  }
  throw new Error('ProposalError attendue');
}

describe('proposal-token', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-29T10:00:00.000Z'));
    resetProposalUsageForTests();
    callOrder.length = 0;
    (mockPrisma.$transaction as jest.Mock).mockClear();
    (mockPrisma.$executeRaw as jest.Mock).mockClear();
    mockPrisma.auditLog.findFirst.mockReset().mockImplementation(async () => {
      callOrder.push('find');
      return null;
    });
    mockPrisma.auditLog.create.mockReset().mockImplementation(async () => {
      callOrder.push('create');
      return { id: 'audit-1' };
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('signature et vérification', () => {
    it('fait l’aller-retour et porte la durée de vie configurée', () => {
      const { token, claims } = signProposal({ userId: USER, tenantId: TENANT, args: ARGS });
      expect(token.split('.')).toHaveLength(3);
      expect(token.startsWith('v1.')).toBe(true);
      expect(claims.exp - claims.iat).toBe(env.AI_PROPOSAL_TTL_SECONDS);

      const verified = verifyProposal(token, { userId: USER, tenantId: TENANT });
      expect(verified).toEqual(claims);
      expect(verified.sub).toBe(USER);
      expect(verified.tid).toBe(TENANT);
      expect(verified.act).toBe('GENERATE_RENTAL_DOCUMENT');
      expect(verified.args).toEqual(ARGS);
    });

    it('accepte un jeton forgé avec la dérivation HKDF du plan (clé indépendante)', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = forge({
        v: 1,
        jti: 'jti-forge',
        sub: USER,
        tid: TENANT,
        act: 'GENERATE_RENTAL_DOCUMENT',
        args: ARGS,
        iat: now,
        exp: now + 60
      });
      expect(verifyProposal(token, { userId: USER, tenantId: TENANT }).jti).toBe('jti-forge');
    });

    it('émet un jti différent à chaque proposition', () => {
      const a = signProposal({ userId: USER, tenantId: TENANT, args: ARGS });
      const b = signProposal({ userId: USER, tenantId: TENANT, args: ARGS });
      expect(a.claims.jti).not.toBe(b.claims.jti);
    });

    it('rejette une charge utile modifiée (autre utilisateur glissé dans le jeton)', () => {
      const { token, claims } = signProposal({ userId: USER, tenantId: TENANT, args: ARGS });
      const [v, , signature] = token.split('.');
      const tampered = `${v}.${b64({ ...claims, sub: 'attacker' })}.${signature}`;
      const error = expectProposalError(
        () => verifyProposal(tampered, { userId: 'attacker', tenantId: TENANT }),
        'PROPOSAL_INVALID',
        400
      );
      expect(error.reason).toBe('BAD_SIGNATURE');
    });

    it('rejette des arguments modifiés (autre paiement)', () => {
      const { token, claims } = signProposal({ userId: USER, tenantId: TENANT, args: ARGS });
      const [v, , signature] = token.split('.');
      const other = { ...claims, args: { ...ARGS, paymentId: '99999999-9999-4999-8999-999999999999' } };
      expectProposalError(
        () => verifyProposal(`${v}.${b64(other)}.${signature}`, { userId: USER, tenantId: TENANT }),
        'PROPOSAL_INVALID',
        400
      );
    });

    it('rejette une signature modifiée', () => {
      const { token } = signProposal({ userId: USER, tenantId: TENANT, args: ARGS });
      const last = token[token.length - 2] === 'A' ? 'B' : 'A';
      const tampered = `${token.slice(0, -2)}${last}${token.slice(-1)}`;
      expectProposalError(() => verifyProposal(tampered, { userId: USER, tenantId: TENANT }), 'PROPOSAL_INVALID', 400);
    });

    it('rejette une signature de longueur différente sans lever d’erreur de timingSafeEqual', () => {
      const { token } = signProposal({ userId: USER, tenantId: TENANT, args: ARGS });
      const short = token.slice(0, -6);
      const long = `${token}AAAA`;
      for (const bad of [short, long]) {
        const error = expectProposalError(
          () => verifyProposal(bad, { userId: USER, tenantId: TENANT }),
          'PROPOSAL_INVALID',
          400
        );
        expect(error.reason).toBe('BAD_SIGNATURE');
      }
    });

    it.each([
      ['vide', ''],
      ['sans point', 'v1payloadsig'],
      ['deux segments', 'v1.abc'],
      ['quatre segments', 'v1.abc.def.ghi'],
      ['mauvaise version', 'v2.abc.def'],
      ['caractères hors base64url', 'v1.ab+c/.de=f'],
      ['segment vide', 'v1..abc'],
      ['trop long', `v1.${'a'.repeat(COPILOT_MAX_PROPOSAL_TOKEN_CHARS + 1)}.b`]
    ])('rejette un format invalide : %s', (_label, token) => {
      const error = expectProposalError(
        () => verifyProposal(token, { userId: USER, tenantId: TENANT }),
        'PROPOSAL_INVALID',
        400
      );
      expect(error.reason).toBe('MALFORMED');
    });

    it('rejette une valeur qui n’est pas une chaîne', () => {
      expectProposalError(
        () => verifyProposal(undefined as unknown as string, { userId: USER, tenantId: TENANT }),
        'PROPOSAL_INVALID',
        400
      );
    });

    it('rejette une action inconnue même correctement signée', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = forge({
        v: 1,
        jti: 'j',
        sub: USER,
        tid: TENANT,
        act: 'DELETE_EVERYTHING',
        args: ARGS,
        iat: now,
        exp: now + 60
      });
      const error = expectProposalError(
        () => verifyProposal(token, { userId: USER, tenantId: TENANT }),
        'PROPOSAL_INVALID',
        400
      );
      expect(error.reason).toBe('BAD_CLAIMS');
    });

    it('rejette des arguments avec une clé supplémentaire même correctement signés', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = forge({
        v: 1,
        jti: 'j',
        sub: USER,
        tid: TENANT,
        act: 'GENERATE_RENTAL_DOCUMENT',
        args: { ...ARGS, tenantId: 'autre' },
        iat: now,
        exp: now + 60
      });
      expectProposalError(() => verifyProposal(token, { userId: USER, tenantId: TENANT }), 'PROPOSAL_INVALID', 400);
    });

    it('rejette un jeton émis dans le futur au-delà de la tolérance d’horloge', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = forge({
        v: 1,
        jti: 'j',
        sub: USER,
        tid: TENANT,
        act: 'GENERATE_RENTAL_DOCUMENT',
        args: ARGS,
        iat: now + 3600,
        exp: now + 7200
      });
      expectProposalError(() => verifyProposal(token, { userId: USER, tenantId: TENANT }), 'PROPOSAL_INVALID', 400);
    });
  });

  describe('expiration', () => {
    it('reste valide juste avant l’expiration puis expire (faux timers)', () => {
      const { token } = signProposal({ userId: USER, tenantId: TENANT, args: ARGS });
      jest.advanceTimersByTime((env.AI_PROPOSAL_TTL_SECONDS - 1) * 1000);
      expect(() => verifyProposal(token, { userId: USER, tenantId: TENANT })).not.toThrow();

      jest.advanceTimersByTime(1000);
      const error = expectProposalError(
        () => verifyProposal(token, { userId: USER, tenantId: TENANT }),
        'PROPOSAL_EXPIRED',
        410
      );
      expect(error.reason).toBe('EXPIRED');
    });

    it('contrôle la signature avant l’expiration : un jeton forgé et périmé reste INVALID', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = `${forge({
        v: 1,
        jti: 'j',
        sub: USER,
        tid: TENANT,
        act: 'GENERATE_RENTAL_DOCUMENT',
        args: ARGS,
        iat: now - 600,
        exp: now - 300
      }).slice(0, -3)}AAA`;
      expectProposalError(() => verifyProposal(token, { userId: USER, tenantId: TENANT }), 'PROPOSAL_INVALID', 400);
    });
  });

  describe('utilisateur et agence', () => {
    it('refuse un autre utilisateur avec la même erreur qu’une signature fausse', () => {
      const { token } = signProposal({ userId: USER, tenantId: TENANT, args: ARGS });
      const wrongUser = expectProposalError(
        () => verifyProposal(token, { userId: 'user-2', tenantId: TENANT }),
        'PROPOSAL_INVALID',
        400
      );
      const badSignature = expectProposalError(
        () => verifyProposal(`${token.slice(0, -3)}AAA`, { userId: USER, tenantId: TENANT }),
        'PROPOSAL_INVALID',
        400
      );
      expect(wrongUser.reason).toBe('WRONG_USER');
      expect(wrongUser.message).toBe(badSignature.message);
    });

    it('refuse une autre agence avec le même code, le même message et le même statut', () => {
      const { token } = signProposal({ userId: USER, tenantId: TENANT, args: ARGS });
      const wrongTenant = expectProposalError(
        () => verifyProposal(token, { userId: USER, tenantId: 'tenant-b' }),
        'PROPOSAL_INVALID',
        400
      );
      const wrongUser = expectProposalError(
        () => verifyProposal(token, { userId: 'user-2', tenantId: TENANT }),
        'PROPOSAL_INVALID',
        400
      );
      expect(wrongTenant.reason).toBe('WRONG_TENANT');
      expect(wrongTenant.message).toBe(wrongUser.message);
    });
  });

  describe('usage unique', () => {
    it('réclame le jeton une fois puis refuse le rejeu avec 409', async () => {
      const { claims } = signProposal({ userId: USER, tenantId: TENANT, args: ARGS });
      await redeemProposal(claims);

      expect(mockPrisma.auditLog.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT, actionKey: 'AI_PROPOSAL_REDEEMED', entityId: claims.jti }
        })
      );
      expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
      const data = mockPrisma.auditLog.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        actorUserId: USER,
        tenantId: TENANT,
        actionKey: 'AI_PROPOSAL_REDEEMED',
        entityId: claims.jti
      });

      await expect(redeemProposal(claims)).rejects.toMatchObject({
        code: 'PROPOSAL_ALREADY_USED',
        statusCode: 409
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it('lit puis écrit la ligne AuditLog dans une transaction, sous un verrou consultatif propre au jeton', async () => {
      const { claims } = signProposal({ userId: USER, tenantId: TENANT, args: ARGS });
      await redeemProposal(claims);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(callOrder).toEqual([`lock:ai-proposal:${TENANT}:${claims.jti}`, 'find', 'create']);
      const sql = String(((mockPrisma.$executeRaw as jest.Mock).mock.calls[0][0] as string[]).join('?'));
      expect(sql).toContain('pg_advisory_xact_lock(hashtextextended(');
    });

    it('un jeton déjà réclamé en base ne réécrit rien (le verrou est pris avant la lecture)', async () => {
      const { claims } = signProposal({ userId: USER, tenantId: TENANT, args: ARGS });
      mockPrisma.auditLog.findFirst.mockImplementationOnce(async () => {
        callOrder.push('find');
        return { id: 'deja-la' };
      });
      await expect(redeemProposal(claims)).rejects.toMatchObject({ code: 'PROPOSAL_ALREADY_USED' });
      expect(callOrder).toEqual([`lock:ai-proposal:${TENANT}:${claims.jti}`, 'find']);
    });

    it('un double clic simultané ne réclame le jeton qu’une fois', async () => {
      const { claims } = signProposal({ userId: USER, tenantId: TENANT, args: ARGS });
      const results = await Promise.allSettled([redeemProposal(claims), redeemProposal(claims)]);
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
      expect(rejected.reason).toMatchObject({ code: 'PROPOSAL_ALREADY_USED', statusCode: 409 });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it('refuse un jeton déjà réclamé dans l’AuditLog (redémarrage : table mémoire vide)', async () => {
      const { claims } = signProposal({ userId: USER, tenantId: TENANT, args: ARGS });
      mockPrisma.auditLog.findFirst.mockResolvedValueOnce({ id: 'deja-la' });
      await expect(redeemProposal(claims)).rejects.toMatchObject({ code: 'PROPOSAL_ALREADY_USED', statusCode: 409 });
      expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('libère la réservation si la base tombe, pour permettre un nouvel essai', async () => {
      const { claims } = signProposal({ userId: USER, tenantId: TENANT, args: ARGS });
      mockPrisma.auditLog.create.mockRejectedValueOnce(new Error('base indisponible'));
      await expect(redeemProposal(claims)).rejects.toThrow('base indisponible');
      await expect(redeemProposal(claims)).resolves.toBeUndefined();
    });
  });
});

describe('proposal-token — action EXECUTE_CAPABILITY (plan d’écriture, étape 4)', () => {
  const args = {
    capabilityId: 'PATCH /api/tenants/:tenantId/crm/contacts/:contactId',
    pathParams: { contactId: 'c-1' },
    query: {},
    body: { city: 'Bouaké' },
    planHash: 'a'.repeat(64)
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-29T10:00:00.000Z'));
    resetProposalUsageForTests();
    mockPrisma.auditLog.findFirst.mockReset().mockResolvedValue(null);
    mockPrisma.auditLog.create.mockReset().mockResolvedValue({ id: 'audit-1' });
  });
  afterEach(() => jest.useRealTimers());

  it('signe un jeton de la même forme, lié à sub et tid, valable AI_WRITE_PLAN_TTL_SECONDS (900 s, plancher 300 s)', () => {
    const { token, claims } = signCapabilityProposal({ userId: USER, tenantId: TENANT, args });
    expect(token).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(claims).toMatchObject({ v: 1, sub: USER, tid: TENANT, act: 'EXECUTE_CAPABILITY' });
    expect(claims.exp - claims.iat).toBe(env.AI_WRITE_PLAN_TTL_SECONDS);
    expect(env.AI_WRITE_PLAN_TTL_SECONDS).toBeGreaterThanOrEqual(300);
    expect(verifyCapabilityProposal(token, { userId: USER, tenantId: TENANT })).toEqual(claims);
  });

  it('les deux actions ne se confondent pas : chaque vérificateur refuse le jeton de l’autre (BAD_CLAIMS)', () => {
    const capability = signCapabilityProposal({ userId: USER, tenantId: TENANT, args }).token;
    const rental = signProposal({ userId: USER, tenantId: TENANT, args: ARGS }).token;
    expect(() => verifyProposal(capability, { userId: USER, tenantId: TENANT })).toThrow(ProposalError);
    expect(() => verifyCapabilityProposal(rental, { userId: USER, tenantId: TENANT })).toThrow(ProposalError);
    try {
      verifyProposal(capability, { userId: USER, tenantId: TENANT });
    } catch (error) {
      expect((error as ProposalError).code).toBe('PROPOSAL_INVALID');
      expect((error as ProposalError).reason).toBe('BAD_CLAIMS');
    }
  });

  it('expiré, mauvais utilisateur, mauvaise agence : mêmes codes que pour une quittance', () => {
    const { token } = signCapabilityProposal({ userId: USER, tenantId: TENANT, args });
    expect(() => verifyCapabilityProposal(token, { userId: 'autre', tenantId: TENANT })).toThrow(
      expect.objectContaining({ code: 'PROPOSAL_INVALID', reason: 'WRONG_USER' })
    );
    expect(() => verifyCapabilityProposal(token, { userId: USER, tenantId: 'tenant-b' })).toThrow(
      expect.objectContaining({ code: 'PROPOSAL_INVALID', reason: 'WRONG_TENANT' })
    );
    jest.setSystemTime(new Date('2026-09-29T10:00:00.000Z').getTime() + (env.AI_WRITE_PLAN_TTL_SECONDS + 1) * 1000);
    expect(() => verifyCapabilityProposal(token, { userId: USER, tenantId: TENANT })).toThrow(
      expect.objectContaining({ code: 'PROPOSAL_EXPIRED' })
    );
  });

  it('refuse un identifiant DELETE ou hors agence dès la lecture des claims, même signé', () => {
    for (const capabilityId of [
      'DELETE /api/tenants/:tenantId/crm/contacts/:contactId',
      'GET /api/tenants/:tenantId/crm/contacts',
      'POST /api/auth/login',
      'PATCH /api/admin/x'
    ]) {
      const { token } = signCapabilityProposal({ userId: USER, tenantId: TENANT, args: { ...args, capabilityId } });
      expect(() => verifyCapabilityProposal(token, { userId: USER, tenantId: TENANT })).toThrow(
        expect.objectContaining({ code: 'PROPOSAL_INVALID', reason: 'BAD_CLAIMS' })
      );
    }
  });

  it('usage unique : réclamation sous verrou, audit sans le corps', async () => {
    const { claims } = signCapabilityProposal({ userId: USER, tenantId: TENANT, args });
    await redeemProposal(claims);
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.payload).toEqual({
      act: 'EXECUTE_CAPABILITY',
      capabilityId: args.capabilityId,
      planHash: args.planHash
    });
    await expect(redeemProposal(claims)).rejects.toMatchObject({ code: 'PROPOSAL_ALREADY_USED' });
  });

  it('taille : jusqu’à COPILOT_MAX_PROPOSAL_TOKEN_CHARS, au-delà MALFORMED', () => {
    const big = { ...args, body: { note: 'n'.repeat(7000) } };
    const { token } = signCapabilityProposal({ userId: USER, tenantId: TENANT, args: big });
    expect(token.length).toBeGreaterThan(4096);
    expect(token.length).toBeLessThanOrEqual(COPILOT_MAX_PROPOSAL_TOKEN_CHARS);
    expect(() => verifyCapabilityProposal(token, { userId: USER, tenantId: TENANT })).not.toThrow();
  });

  it('peekProposalAction : lit l’action sans faire confiance, null si illisible', () => {
    expect(peekProposalAction(signCapabilityProposal({ userId: USER, tenantId: TENANT, args }).token)).toBe(
      'EXECUTE_CAPABILITY'
    );
    expect(peekProposalAction(signProposal({ userId: USER, tenantId: TENANT, args: ARGS }).token)).toBe(
      'GENERATE_RENTAL_DOCUMENT'
    );
    for (const bad of ['', 'x', 'v1..', 'v1.@@@.sig', `v1.${b64({ act: 'DELETE_EVERYTHING' })}.sig`]) {
      expect(peekProposalAction(bad)).toBeNull();
    }
  });
});
