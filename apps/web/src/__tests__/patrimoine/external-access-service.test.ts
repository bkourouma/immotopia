import { describe, it, expect, vi, beforeEach } from 'vitest';
import apiClient from '../../utils/api-client';
import {
  createExternalAccessGrant,
  downloadPublicExternalAccessDocument,
  fetchPublicExternalAccessView,
  getExternalAccessGrant,
  getExternalAccessScopeOptions,
  listExternalAccessGrants,
  listExternalAccessLog,
  listExternalAccessPropertyDocuments,
  revokeExternalAccessGrant,
  sendExternalAccessLink,
  updateExternalAccessGrant
} from '../../services/external-access-service';

/** Le mock se pose à la frontière réseau ; le vrai service tourne par-dessus. */
vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }
}));

const mocked = apiClient as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
};

const BASE = '/tenants/agence-1/patrimoine/external-access';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('external-access-service — agence', () => {
  it('liste les accès et déballe items', async () => {
    mocked.get.mockResolvedValueOnce({ data: { success: true, data: { items: [{ id: 'g1' }] } } });
    await expect(listExternalAccessGrants('agence-1')).resolves.toEqual([{ id: 'g1' }]);
    expect(mocked.get).toHaveBeenCalledWith(BASE);
  });

  it('lit les options de périmètre', async () => {
    mocked.get.mockResolvedValueOnce({ data: { success: true, data: { sections: ['LOANS'] } } });
    await expect(getExternalAccessScopeOptions('agence-1')).resolves.toEqual({ sections: ['LOANS'] });
    expect(mocked.get).toHaveBeenCalledWith(`${BASE}/scope-options`);
  });

  it('liste les documents d’un bien', async () => {
    mocked.get.mockResolvedValueOnce({ data: { success: true, data: { items: [{ id: 'd1' }] } } });
    await expect(listExternalAccessPropertyDocuments('agence-1', 'p1')).resolves.toEqual([{ id: 'd1' }]);
    expect(mocked.get).toHaveBeenCalledWith(`${BASE}/property-documents/p1`);
  });

  it('crée un accès et renvoie grant, link et email', async () => {
    const data = {
      grant: { id: 'g1' },
      link: { id: 'l1', url: 'https://x/acces-partage#jeton', expiresAt: 'z' },
      email: { sent: true }
    };
    mocked.post.mockResolvedValueOnce({ data: { success: true, data } });
    const input = {
      type: 'NOTARY' as const,
      recipientName: 'Maître Koné',
      recipientEmail: 'kone@etude.test',
      propertyIds: ['p1'],
      entityIds: [],
      documentIds: []
    };
    await expect(createExternalAccessGrant('agence-1', input)).resolves.toEqual(data);
    expect(mocked.post).toHaveBeenCalledWith(BASE, input);
  });

  it('lit, modifie, révoque et renvoie un lien', async () => {
    mocked.get.mockResolvedValueOnce({ data: { success: true, data: { id: 'g1' } } });
    await getExternalAccessGrant('agence-1', 'g1');
    expect(mocked.get).toHaveBeenCalledWith(`${BASE}/g1`);

    mocked.patch.mockResolvedValueOnce({ data: { success: true, data: { id: 'g1' } } });
    await updateExternalAccessGrant('agence-1', 'g1', { sections: ['LOANS'], expiresAt: null });
    expect(mocked.patch).toHaveBeenCalledWith(`${BASE}/g1`, { sections: ['LOANS'], expiresAt: null });

    mocked.post.mockResolvedValueOnce({ data: { success: true, data: { id: 'g1' } } });
    await revokeExternalAccessGrant('agence-1', 'g1');
    expect(mocked.post).toHaveBeenLastCalledWith(`${BASE}/g1/revoke`, {});

    const sent = { link: { id: 'l2', url: 'u', expiresAt: 'z' }, email: { sent: false } };
    mocked.post.mockResolvedValueOnce({ data: { success: true, data: sent } });
    await expect(
      sendExternalAccessLink('agence-1', 'g1', { linkTtlDays: 3, revokePreviousLinks: true })
    ).resolves.toEqual(sent);
    expect(mocked.post).toHaveBeenLastCalledWith(`${BASE}/g1/send-link`, { linkTtlDays: 3, revokePreviousLinks: true });
  });

  it('lit le journal avec une limite', async () => {
    mocked.get.mockResolvedValueOnce({ data: { success: true, data: { items: [{ id: 'a1' }] } } });
    await expect(listExternalAccessLog('agence-1', 'g1', 50)).resolves.toEqual([{ id: 'a1' }]);
    expect(mocked.get).toHaveBeenCalledWith(`${BASE}/g1/access-log?limit=50`);
  });
});

describe('external-access-service — public', () => {
  it('poste le jeton en corps, sans cookie, hors de l’URL', async () => {
    mocked.post.mockResolvedValueOnce({ status: 200, data: { success: true, data: { agencyName: 'Agence' } } });
    const result = await fetchPublicExternalAccessView('jeton-secret');
    expect(result).toEqual({ status: 'ok', view: { agencyName: 'Agence' } });
    const [url, body, config] = mocked.post.mock.calls[0];
    expect(url).toBe('/public/external-access/patrimoine');
    expect(url).not.toContain('jeton-secret');
    expect(body).toEqual({ token: 'jeton-secret' });
    expect(config).toMatchObject({ withCredentials: false });
    // Un 401/404 ne doit pas rejeter (l'api-client redirigerait vers la connexion).
    expect(config.validateStatus(404)).toBe(true);
    expect(config.validateStatus(401)).toBe(true);
    expect(config.headers?.Authorization).toBeUndefined();
  });

  it.each([
    [404, 'invalid'],
    [400, 'invalid'],
    [401, 'invalid'],
    [429, 'rate_limited'],
    [503, 'unavailable']
  ])('traduit le statut %i en %s', async (status, expected) => {
    mocked.post.mockResolvedValueOnce({ status, data: { success: false } });
    await expect(fetchPublicExternalAccessView('j')).resolves.toEqual({ status: expected });
  });

  it('signale une panne réseau comme indisponible', async () => {
    mocked.post.mockRejectedValueOnce(new Error('network'));
    await expect(fetchPublicExternalAccessView('j')).resolves.toEqual({ status: 'unavailable' });
  });

  it('télécharge un document en POST corps vers un blob', async () => {
    const blob = new Blob(['pdf']);
    mocked.post.mockResolvedValueOnce({
      status: 200,
      data: blob,
      headers: { 'content-disposition': 'attachment; filename="acte%20vente.pdf"' }
    });
    const result = await downloadPublicExternalAccessDocument('jeton-secret', 'ref-1');
    expect(result).toEqual({ status: 'ok', blob, fileName: 'acte vente.pdf' });
    const [url, body, config] = mocked.post.mock.calls[0];
    expect(url).toBe('/public/external-access/documents/download');
    expect(url).not.toContain('jeton-secret');
    expect(url).not.toContain('ref-1');
    expect(body).toEqual({ token: 'jeton-secret', documentRef: 'ref-1' });
    expect(config).toMatchObject({ withCredentials: false, responseType: 'blob' });
    expect(config.validateStatus(404)).toBe(true);
  });

  it('un téléchargement refusé donne invalid, une panne unavailable', async () => {
    mocked.post.mockResolvedValueOnce({ status: 404, data: new Blob(['{}']) });
    await expect(downloadPublicExternalAccessDocument('j', 'r')).resolves.toEqual({ status: 'invalid' });
    mocked.post.mockRejectedValueOnce(new Error('network'));
    await expect(downloadPublicExternalAccessDocument('j', 'r')).resolves.toEqual({ status: 'unavailable' });
  });
});
