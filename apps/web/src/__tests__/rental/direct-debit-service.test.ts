import { describe, it, expect, vi, beforeEach } from 'vitest';

const get = vi.fn();
const post = vi.fn();
const patch = vi.fn();

vi.mock('../../utils/api-client', () => ({
  default: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a),
    patch: (...a: unknown[]) => patch(...a)
  }
}));

import {
  activateMandate,
  checkIban,
  createMandate,
  downloadAuthorizationPdf,
  listMandates,
  revokeMandate,
  uploadSignedScan
} from '../../services/direct-debit-service';

const BASE = '/tenants/agence-1/rental/direct-debit';

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ data: { success: true, data: {} }, headers: {} });
  post.mockResolvedValue({ data: { success: true, data: {} } });
});

describe('direct-debit-service', () => {
  it("poste l'IBAN à contrôler vers /iban-check", async () => {
    await checkIban('agence-1', 'CI93X');
    expect(post).toHaveBeenCalledWith(`${BASE}/iban-check`, { iban: 'CI93X' });
  });

  it('retire les filtres vides de la liste des mandats', async () => {
    await listMandates('agence-1', { leaseId: 'l-1', search: '', status: undefined, page: 2 });
    expect(get).toHaveBeenCalledWith(`${BASE}/mandates`, { params: { leaseId: 'l-1', page: 2 } });
  });

  it('crée un mandat, active et révoque aux routes du contrat', async () => {
    await createMandate('agence-1', {
      creditorId: 'c',
      leaseId: 'l',
      debtorClientId: 'd',
      iban: 'CI93X',
      holderName: 'A'
    });
    expect(post).toHaveBeenCalledWith(`${BASE}/mandates`, expect.objectContaining({ iban: 'CI93X' }));

    await activateMandate('agence-1', 'm-1', '2026-10-01');
    expect(post).toHaveBeenCalledWith(`${BASE}/mandates/m-1/activate`, { signedAt: '2026-10-01' });

    await revokeMandate('agence-1', 'm-1', 'Départ du locataire');
    expect(post).toHaveBeenCalledWith(`${BASE}/mandates/m-1/revoke`, { reason: 'Départ du locataire' });
  });

  it('envoie le scan en multipart sous le champ « file »', async () => {
    const file = new File(['%PDF'], 'scan.pdf', { type: 'application/pdf' });
    await uploadSignedScan('agence-1', 'm-1', file);
    const [url, body] = post.mock.calls[0];
    expect(url).toBe(`${BASE}/mandates/m-1/signed-scan`);
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('file')).toBe(file);
  });

  it("télécharge l'autorisation en blob avec le nom du Content-Disposition", async () => {
    const blob = new Blob(['%PDF']);
    get.mockResolvedValue({
      data: blob,
      headers: { 'content-disposition': 'attachment; filename="MDT-2026-0001.pdf"' }
    });
    const result = await downloadAuthorizationPdf('agence-1', 'm-1', 'fallback.pdf');
    expect(get).toHaveBeenCalledWith(`${BASE}/mandates/m-1/authorization-pdf`, { responseType: 'blob' });
    expect(result.filename).toBe('MDT-2026-0001.pdf');
    expect(result.blob).toBe(blob);
  });
});
