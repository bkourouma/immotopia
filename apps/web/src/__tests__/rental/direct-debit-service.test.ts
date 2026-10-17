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
  cancelRemittance,
  cancelRemittanceLine,
  createRemittance,
  exportRemittance,
  getRemittance,
  listRemittances,
  refreshRemittance,
  resendPrenotifications,
  submitRemittance,
  validateRemittance,
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

  describe('remises (P2)', () => {
    it('liste les remises en retirant les filtres vides', async () => {
      await listRemittances('agence-1', { creditorId: 'c-1', status: undefined, page: 2, pageSize: 20 });
      expect(get).toHaveBeenCalledWith(`${BASE}/remittances`, { params: { creditorId: 'c-1', page: 2, pageSize: 20 } });
    });

    it('crée, lit et actualise une remise aux routes du contrat', async () => {
      await createRemittance('agence-1', { creditorId: 'c-1', collectionDate: '2026-11-05', notes: 'N' });
      expect(post).toHaveBeenCalledWith(`${BASE}/remittances`, {
        creditorId: 'c-1',
        collectionDate: '2026-11-05',
        notes: 'N'
      });

      await getRemittance('agence-1', 'r-1');
      expect(get).toHaveBeenCalledWith(`${BASE}/remittances/r-1`);

      await refreshRemittance('agence-1', 'r-1');
      expect(post).toHaveBeenCalledWith(`${BASE}/remittances/r-1/refresh`);
    });

    it('valide, renvoie les prénotifications, marque déposée et annule', async () => {
      await validateRemittance('agence-1', 'r-1');
      expect(post).toHaveBeenCalledWith(`${BASE}/remittances/r-1/validate`);

      await resendPrenotifications('agence-1', 'r-1');
      expect(post).toHaveBeenCalledWith(`${BASE}/remittances/r-1/prenotifications`);

      await submitRemittance('agence-1', 'r-1');
      expect(post).toHaveBeenCalledWith(`${BASE}/remittances/r-1/submit`);

      await cancelRemittance('agence-1', 'r-1', 'Doublon');
      expect(post).toHaveBeenCalledWith(`${BASE}/remittances/r-1/cancel`, { reason: 'Doublon' });
    });

    it('retire une ligne avec ou sans motif', async () => {
      await cancelRemittanceLine('agence-1', 'r-1', 'l-1', 'Parti');
      expect(post).toHaveBeenLastCalledWith(`${BASE}/remittances/r-1/lines/l-1/cancel`, { reason: 'Parti' });

      await cancelRemittanceLine('agence-1', 'r-1', 'l-1');
      expect(post).toHaveBeenLastCalledWith(`${BASE}/remittances/r-1/lines/l-1/cancel`, {});
    });

    it('produit le fichier par POST en blob avec le nom du Content-Disposition', async () => {
      const blob = new Blob(['csv']);
      post.mockResolvedValue({
        data: blob,
        headers: { 'content-disposition': 'attachment; filename="PRL-2026-0001.csv"' }
      });
      const result = await exportRemittance('agence-1', 'r-1', 'fallback.csv');
      expect(post).toHaveBeenCalledWith(`${BASE}/remittances/r-1/export`, undefined, { responseType: 'blob' });
      expect(result.filename).toBe('PRL-2026-0001.csv');
      expect(result.blob).toBe(blob);
    });

    it("relit le message JSON d'une erreur reçue en blob", async () => {
      const error = {
        response: { status: 409, data: new Blob([JSON.stringify({ message: 'Mandat révoqué : MDT-2026-0001' })]) }
      };
      post.mockRejectedValue(error);
      await expect(exportRemittance('agence-1', 'r-1', 'f.csv')).rejects.toBe(error);
      expect(error.response.data).toEqual({ message: 'Mandat révoqué : MDT-2026-0001' });
    });
  });
});
