/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Option payante « AG en direct » (SYNDIC_LIVE) hors garde d'agence :
 * - `isTenantOptionAvailable` (lib/subscription/option-access.ts) dans les trois modes ;
 * - routes publiques par jeton : sans l'option, la meme 404 uniforme qu'un lien invalide,
 *   avant toute lecture du participant ; avec l'option, la resolution du jeton se poursuit.
 */

const mockFindParticipant = jest.fn();
const mockGetEntitlements = jest.fn();
const mockVerifySecureLink = jest.fn();
let mockMode: 'off' | 'warn' | 'enforce' = 'enforce';
const loggerWarn = jest.fn();
const loggerError = jest.fn();

jest.mock('../../src/utils/logger', () => ({
  logger: {
    warn: (...a: any[]) => loggerWarn(...a),
    error: (...a: any[]) => loggerError(...a),
    info: jest.fn(),
    debug: jest.fn()
  }
}));
jest.mock('../../src/lib/subscription/enforcement', () => ({ getSubscriptionEnforcement: () => mockMode }));
jest.mock('../../src/services/subscription-v2-service', () => ({
  getEntitlements: (...a: any[]) => mockGetEntitlements(...a)
}));
jest.mock('../../src/utils/database', () => ({
  prisma: { gMParticipant: { findFirst: (...a: any[]) => mockFindParticipant(...a), updateMany: jest.fn() } }
}));
jest.mock('../../src/lib/secure-links', () => ({
  ...jest.requireActual('../../src/lib/secure-links/errors'),
  verifySecureLink: (...a: any[]) => mockVerifySecureLink(...a)
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));
jest.mock('../../src/services/livekit-service', () => ({ isVisioEnabled: () => false }));

import { isTenantOptionAvailable } from '../../src/lib/subscription/option-access';
import { getPublicLiveState } from '../../src/lib/syndics/meeting-live-public';

const TENANT = 'tenant-1';

function rights(features: string[], enforcement: 'off' | 'warn' | 'enforce' = mockMode) {
  return { tenantId: TENANT, features, enforcement };
}

beforeEach(() => {
  mockMode = 'enforce';
  mockFindParticipant.mockReset().mockResolvedValue(null);
  mockGetEntitlements.mockReset();
  mockVerifySecureLink.mockReset().mockResolvedValue({
    tenantId: TENANT,
    objectType: 'GM_PARTICIPANT',
    objectId: 'p1'
  });
  loggerWarn.mockClear();
  loggerError.mockClear();
});

describe('isTenantOptionAvailable', () => {
  it('enforce : vrai avec l option, faux sans', async () => {
    mockGetEntitlements.mockResolvedValue(rights(['CORE', 'SYNDIC', 'SYNDIC_LIVE']));
    expect(await isTenantOptionAvailable(TENANT, 'SYNDIC_LIVE')).toBe(true);
    mockGetEntitlements.mockResolvedValue(rights(['CORE', 'SYNDIC']));
    expect(await isTenantOptionAvailable(TENANT, 'SYNDIC_LIVE')).toBe(false);
  });

  it('warn : disponible, le refus qui aurait eu lieu est journalise', async () => {
    mockMode = 'warn';
    mockGetEntitlements.mockResolvedValue(rights(['CORE', 'SYNDIC']));
    expect(await isTenantOptionAvailable(TENANT, 'SYNDIC_LIVE')).toBe(true);
    expect(loggerWarn).toHaveBeenCalled();
  });

  it('off : disponible sans lire les droits', async () => {
    mockMode = 'off';
    expect(await isTenantOptionAvailable(TENANT, 'SYNDIC_LIVE')).toBe(true);
    expect(mockGetEntitlements).not.toHaveBeenCalled();
  });

  it('panne du calcul des droits : enforce refuse, warn laisse passer', async () => {
    mockGetEntitlements.mockRejectedValue(new Error('base indisponible'));
    expect(await isTenantOptionAvailable(TENANT, 'SYNDIC_LIVE')).toBe(false);
    mockMode = 'warn';
    expect(await isTenantOptionAvailable(TENANT, 'SYNDIC_LIVE')).toBe(true);
  });
});

describe('routes publiques de l AG en direct', () => {
  it('agence sans l option (enforce) : 404 uniforme « lien invalide », aucun participant lu', async () => {
    mockGetEntitlements.mockResolvedValue(rights(['CORE', 'SYNDIC']));
    await expect(getPublicLiveState('jeton')).rejects.toMatchObject({
      statusCode: 404,
      message: expect.stringContaining('Lien invalide')
    });
    expect(mockFindParticipant).not.toHaveBeenCalled();
  });

  it('agence avec l option : la resolution du jeton se poursuit (participant lu)', async () => {
    mockGetEntitlements.mockResolvedValue(rights(['CORE', 'SYNDIC', 'SYNDIC_LIVE']));
    await expect(getPublicLiveState('jeton')).rejects.toMatchObject({ statusCode: 404 });
    expect(mockFindParticipant).toHaveBeenCalledTimes(1);
  });

  it('warn : sans option mais laisse passer', async () => {
    mockMode = 'warn';
    mockGetEntitlements.mockResolvedValue(rights(['CORE', 'SYNDIC']));
    await expect(getPublicLiveState('jeton')).rejects.toMatchObject({ statusCode: 404 });
    expect(mockFindParticipant).toHaveBeenCalledTimes(1);
  });
});
