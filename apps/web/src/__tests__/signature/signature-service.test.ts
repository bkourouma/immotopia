import { describe, it, expect, vi, beforeEach } from 'vitest';

const get = vi.fn();
const post = vi.fn();
vi.mock('../../utils/api-client', () => ({
  default: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) }
}));
vi.mock('../../config/api', () => ({ API_URL: 'http://api.test/api' }));

import {
  createSignatureRequest,
  fetchPublicSignature,
  listSignatureRequests,
  publicSignatureFileUrl,
  reissueInPersonToken,
  remindSignatureRequest,
  requestPublicOtp,
  submitPublicSignature
} from '../../services/signature-service';

beforeEach(() => vi.clearAllMocks());

describe('signature-service', () => {
  it('place le jeton dans le chemin et rien d’autre dans l’URL du PDF', () => {
    expect(publicSignatureFileUrl('abc')).toBe('http://api.test/api/public/signatures/abc/file');
  });

  it('lit une réponse publique enveloppée ou nue', async () => {
    get.mockResolvedValueOnce({ status: 200, data: { success: true, data: { consentText: 'x' } } });
    expect(await fetchPublicSignature('t')).toEqual({ status: 'ok', data: { consentText: 'x' } });
    get.mockResolvedValueOnce({ status: 200, data: { consentText: 'y' } });
    expect(await fetchPublicSignature('t')).toEqual({ status: 'ok', data: { consentText: 'y' } });
  });

  it('classe les échecs publics sans détailler', async () => {
    get.mockResolvedValueOnce({ status: 404, data: {} });
    expect(await fetchPublicSignature('t')).toMatchObject({ status: 'invalid', httpStatus: 404 });
    post.mockResolvedValueOnce({ status: 429, data: {} });
    expect(await requestPublicOtp('t')).toMatchObject({ status: 'rate_limited', httpStatus: 429 });
    post.mockResolvedValueOnce({ status: 500, data: {} });
    expect(await submitPublicSignature('t', { consent: true, signature: { mode: 'TYPED', value: 'A' } })).toMatchObject(
      {
        status: 'unavailable'
      }
    );
    post.mockRejectedValueOnce(new Error('réseau'));
    expect(await requestPublicOtp('t')).toMatchObject({ status: 'unavailable' });
  });

  it('crée et liste côté agence', async () => {
    post.mockResolvedValueOnce({ data: { success: true, data: { id: 's1' } } });
    expect(await createSignatureRequest({ kind: 'LEASE_CONTRACT', targetId: 'b1', signers: [] })).toEqual({ id: 's1' });
    get.mockResolvedValueOnce({ data: { data: [{ id: 's1' }] } });
    expect(await listSignatureRequests({ targetId: 'b1' })).toEqual([{ id: 's1' }]);
  });

  it('lit code, détails et délai d’une erreur publique', async () => {
    post.mockResolvedValueOnce({
      status: 400,
      data: { success: false, code: 'SIGNATURE_OTP_INVALID', details: { attemptsRemaining: 2 } }
    });
    const bad = await submitPublicSignature('t', { consent: true, signature: { mode: 'TYPED', value: 'A' } });
    expect(bad).toMatchObject({ status: 'invalid', code: 'SIGNATURE_OTP_INVALID', details: { attemptsRemaining: 2 } });
    post.mockResolvedValueOnce({
      status: 429,
      data: { error: { code: 'RATE_LIMITED', details: { retryAfterSeconds: 30 } } }
    });
    expect(await requestPublicOtp('t')).toMatchObject({
      status: 'rate_limited',
      code: 'RATE_LIMITED',
      retryAfterSeconds: 30
    });
    post.mockResolvedValueOnce({ status: 409, data: {} });
    expect(await requestPublicOtp('t')).toMatchObject({ status: 'conflict' });
  });

  it('réémet le jeton sur place et lit le bilan de relance', async () => {
    post.mockResolvedValueOnce({ data: { data: { inPersonUrlToken: 'tok' } } });
    expect(await reissueInPersonToken('r 1', 's/2')).toEqual({ inPersonUrlToken: 'tok' });
    expect(post.mock.calls[0][0]).toBe('/signatures/r%201/signers/s%2F2/in-person-token');
    post.mockResolvedValueOnce({ data: { data: { reminded: 2, failed: ['x'] } } });
    expect(await remindSignatureRequest('r1')).toEqual({ reminded: 2, failed: 1 });
  });
});
