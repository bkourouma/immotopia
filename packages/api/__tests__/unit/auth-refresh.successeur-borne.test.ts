/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Contre-audit PR #205 (AUTH, moyen) : le « successeur » qui rend tolérable le
 * rejeu d'un jeton de rafraîchissement révoqué doit être créé AU MOMENT de la
 * révocation (rotation), pas n'importe quelle session ouverte ensuite. Sans
 * borne haute, une reconnexion quelques secondes après une réinitialisation de
 * mot de passe, une déconnexion ou une connexion Google faisait passer un jeton
 * volé pour un doublon d'onglet, et lui valait un accessToken de 15 minutes.
 *
 * Magasin en mémoire qui applique réellement les filtres `where` utilisés par
 * le service (dont `createdAt.gte/lte`) ; horloge simulée.
 */
import crypto from 'crypto';

type Row = {
  id: string;
  token: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  revoked: boolean;
  revokedAt: Date | null;
  deviceInfo: string | null;
};

const USER = {
  id: 'u1',
  email: 'a@b.test',
  isActive: true,
  emailVerified: true,
  globalRole: 'USER',
  passwordHash: 'hash',
  fullName: null,
  preferredLanguage: 'fr'
};

const rows: Row[] = [];
let seq = 0;

function matches(row: Row, where: Record<string, any>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    const value = (row as any)[key];
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if (cond.gt !== undefined && !(value > cond.gt)) return false;
      if (cond.gte !== undefined && !(value >= cond.gte)) return false;
      if (cond.lte !== undefined && !(value <= cond.lte)) return false;
      if (cond.lt !== undefined && !(value < cond.lt)) return false;
    } else if (value !== cond) {
      return false;
    }
  }
  return true;
}

const refreshToken = {
  findFirst: jest.fn(async ({ where }: any) => {
    const row = rows.find(r => matches(r, where));
    return row ? { ...row, user: { ...USER } } : null;
  }),
  updateMany: jest.fn(async ({ where, data }: any) => {
    const hit = rows.filter(r => matches(r, where));
    hit.forEach(r => Object.assign(r, data));
    return { count: hit.length };
  }),
  update: jest.fn(async ({ where, data }: any) => {
    const row = rows.find(r => r.id === where.id);
    if (row) Object.assign(row, data);
    return row;
  }),
  create: jest.fn(async ({ data }: any) => {
    const row: Row = {
      id: `rt${++seq}`,
      revoked: false,
      revokedAt: null,
      deviceInfo: null,
      ...data,
      // `@default(now())` quand la création ne fixe pas la date.
      createdAt: data.createdAt ?? new Date()
    };
    rows.push(row);
    return row;
  })
};

const mockPrisma: Record<string, any> = {
  refreshToken,
  user: {
    findUnique: jest.fn(async () => ({ ...USER })),
    update: jest.fn(async () => ({ ...USER }))
  },
  passwordResetToken: {
    findFirst: jest.fn(async () => ({ id: 'prt1', userId: 'u1', user: { id: 'u1', email: USER.email } })),
    update: jest.fn(async () => ({}))
  }
};
mockPrisma.$transaction = jest.fn(async (fn: any) => fn(mockPrisma));

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/audit-auth-events', () => ({ logAuthEvent: jest.fn(), recordAuthEvent: jest.fn() }));
jest.mock('../../src/services/email-service', () => ({ emailService: {}, isEmailDeliveryConfigured: () => true }));
jest.mock('../../src/services/login-throttle-service', () => ({
  isLoginLocked: () => false,
  recordLoginFailure: jest.fn(),
  clearLoginFailures: jest.fn(),
  clearEmailThrottle: jest.fn()
}));
jest.mock('../../src/utils/password-utils', () => ({
  hashPassword: jest.fn().mockResolvedValue('new-hash'),
  validatePasswordStrength: jest.fn().mockReturnValue({ isValid: true }),
  comparePassword: jest.fn().mockResolvedValue(true)
}));
let mockRefreshSeq = 0;
jest.mock('../../src/utils/jwt-utils', () => ({
  generateAccessToken: jest.fn().mockReturnValue('access'),
  generateRefreshToken: jest.fn(() => `refresh-${++mockRefreshSeq}`)
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() }
}));

import {
  issueGoogleSession,
  loginUser,
  logoutUser,
  refreshAccessToken,
  resetPassword
} from '../../src/services/auth-service';
import { UnauthorizedError } from '../../src/middleware/error-middleware';

const T0 = new Date('2026-11-10T09:00:00.000Z').getTime();
const at = (ms: number) => jest.setSystemTime(T0 + ms);
const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

async function login(): Promise<string> {
  const out = await loginUser({ email: USER.email, password: 'secret' } as any, { ip: '203.0.113.7' });
  return out.refreshToken;
}

beforeEach(() => {
  rows.length = 0;
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  at(0);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('toleratedRefresh : successeur borné à la rotation', () => {
  it('(a) rotation normale puis rejeu de l’ancien jeton dans le délai de grâce : toléré (accessToken seul)', async () => {
    const stolen = await login();
    at(60_000);
    const rotated = await refreshAccessToken(stolen);
    expect(rotated.refreshToken).toEqual(expect.any(String));
    // Révocation et successeur portent le même horodatage.
    const old = rows.find(r => r.token === hash(stolen))!;
    const successor = rows.find(r => r.token === hash(rotated.refreshToken as string))!;
    expect(old.revokedAt?.getTime()).toBe(successor.createdAt.getTime());

    at(63_000);
    await expect(refreshAccessToken(stolen)).resolves.toEqual({ accessToken: 'access', refreshToken: null });
  });

  it('(b) réinitialisation du mot de passe, nouvelle session à +8 s, rejeu de l’ancien jeton : 401', async () => {
    const stolen = await login();
    at(60_000);
    await resetPassword({ token: 'reset', newPassword: 'N3w-Passw0rd!', confirmPassword: 'N3w-Passw0rd!' } as any);
    at(68_000);
    await login();
    at(70_000);
    await expect(refreshAccessToken(stolen)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('(c) déconnexion, nouvelle connexion à +8 s, rejeu : 401', async () => {
    const stolen = await login();
    at(60_000);
    await logoutUser(stolen);
    at(68_000);
    await login();
    at(70_000);
    await expect(refreshAccessToken(stolen)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('(c) déconnexion, session Google (issueGoogleSession) à +8 s, rejeu : 401', async () => {
    const stolen = await login();
    at(60_000);
    await logoutUser(stolen);
    at(68_000);
    await issueGoogleSession({ id: USER.id, email: USER.email, globalRole: 'USER' as any });
    at(70_000);
    await expect(refreshAccessToken(stolen)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('la requête du successeur porte une borne basse ET haute autour de la révocation', async () => {
    const stolen = await login();
    at(60_000);
    await refreshAccessToken(stolen);
    at(61_000);
    refreshToken.findFirst.mockClear();
    await refreshAccessToken(stolen);
    const successorQuery = refreshToken.findFirst.mock.calls[1][0];
    expect(successorQuery.where.createdAt).toEqual({
      gte: new Date(T0 + 60_000 - 1_000),
      lte: new Date(T0 + 60_000 + 1_000)
    });
  });
});
