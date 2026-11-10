/**
 * AUDIT B5 : configurePassport lit les identifiants Google via l'objet `env`
 * (config/env.ts), plus via process.env. Le test mute l'objet `env` mocké :
 * muter process.env n'aurait plus aucun effet.
 */
const mockEnv: Record<string, string | undefined> = {};
const mockUse = jest.fn();
const mockStrategy = jest.fn();
const mockLogger = { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() };

jest.mock('../../src/config/env', () => ({ env: mockEnv }));
jest.mock('../../src/utils/database', () => ({ prisma: {} }));
jest.mock('../../src/utils/logger', () => ({ logger: mockLogger }));
jest.mock('../../src/services/audit-auth-events', () => ({ logAuthEvent: jest.fn(), recordAuthEvent: jest.fn() }));
jest.mock('passport', () => ({
  __esModule: true,
  default: { use: (...a: unknown[]) => mockUse(...a), serializeUser: jest.fn(), deserializeUser: jest.fn() }
}));
jest.mock('passport-google-oauth20', () => ({
  Strategy: function Strategy(this: unknown, ...a: unknown[]) {
    mockStrategy(...a);
  }
}));

import { configurePassport, isGoogleOAuthEnabled } from '../../src/config/passport';

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockEnv)) delete mockEnv[k];
  mockEnv.BACKEND_URL = 'https://api.example.com/';
  // Même si process.env porte des identifiants, seul `env` compte.
  process.env.GOOGLE_CLIENT_ID = 'from-process-env';
  process.env.GOOGLE_CLIENT_SECRET = 'from-process-env';
});

afterAll(() => {
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
});

describe('configurePassport : identifiants Google lus dans env', () => {
  it('reste désactivé quand env ne porte pas les identifiants (même si process.env les porte)', () => {
    configurePassport();
    expect(mockUse).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('reste désactivé quand les identifiants ne sont que des espaces', () => {
    mockEnv.GOOGLE_CLIENT_ID = '   ';
    mockEnv.GOOGLE_CLIENT_SECRET = 'secret';
    configurePassport();
    expect(mockUse).not.toHaveBeenCalled();
  });

  it('active la stratégie avec les valeurs de env et déduit le rappel de BACKEND_URL', () => {
    mockEnv.GOOGLE_CLIENT_ID = ' id ';
    mockEnv.GOOGLE_CLIENT_SECRET = ' secret ';
    configurePassport();
    expect(mockUse).toHaveBeenCalledTimes(1);
    expect(mockStrategy.mock.calls[0][0]).toMatchObject({
      clientID: 'id',
      clientSecret: 'secret',
      callbackURL: 'https://api.example.com/api/auth/google/callback'
    });
    expect(isGoogleOAuthEnabled()).toBe(true);
  });

  it('GOOGLE_CALLBACK_URL de env l emporte sur la déduction', () => {
    mockEnv.GOOGLE_CLIENT_ID = 'id';
    mockEnv.GOOGLE_CLIENT_SECRET = 'secret';
    mockEnv.GOOGLE_CALLBACK_URL = 'https://app.example.com/cb';
    configurePassport();
    expect(mockStrategy.mock.calls[0][0].callbackURL).toBe('https://app.example.com/cb');
  });
});
