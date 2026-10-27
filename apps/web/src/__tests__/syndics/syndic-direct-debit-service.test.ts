import { describe, it, expect, vi, beforeEach } from 'vitest';

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();
const patch = vi.fn();

vi.mock('../../utils/api-client', () => ({
  default: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a),
    put: (...a: unknown[]) => put(...a),
    patch: (...a: unknown[]) => patch(...a)
  }
}));

import {
  activateSyndicMandate,
  cancelSyndicRemittance,
  checkSyndicIban,
  createSyndicMandate,
  createSyndicRemittance,
  downloadSyndicAuthorizationPdf,
  exportSyndicRemittance,
  getSyndicCreditor,
  getSyndicRemittance,
  listLotDebtors,
  listSyndicMandates,
  listSyndicRemittances,
  reactivateSyndicMandate,
  refreshSyndicRemittance,
  removeSyndicRemittanceLine,
  resendSyndicPrenotifications,
  revokeSyndicMandate,
  saveSyndicCreditor,
  submitSyndicRemittance,
  suspendSyndicMandate,
  updateSyndicMandate,
  uploadSyndicSignedScan,
  validateSyndicRemittance
} from '../../services/syndic-direct-debit-service';

/** Spec 042, P4, §9.4 : chemins français et corps des routes du syndicat. */
const BASE = '/tenants/agence-1/syndics/syn-1/prelevements';

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ data: { success: true, data: {} }, headers: {} });
  post.mockResolvedValue({ data: { success: true, data: {} }, headers: {} });
  put.mockResolvedValue({ data: { success: true, data: {} } });
  patch.mockResolvedValue({ data: { success: true, data: {} } });
});

describe('syndic-direct-debit-service', () => {
  it('lit le créancier (null quand il n’existe pas) et le remplace par PUT', async () => {
    get.mockResolvedValueOnce({ data: { success: true, data: null } });
    expect(await getSyndicCreditor('agence-1', 'syn-1')).toBeNull();
    expect(get).toHaveBeenCalledWith(`${BASE}/creancier`);

    await saveSyndicCreditor('agence-1', 'syn-1', { label: 'Compte du syndicat', collectionDay: 5, isActive: true });
    expect(put).toHaveBeenCalledWith(`${BASE}/creancier`, {
      label: 'Compte du syndicat',
      collectionDay: 5,
      isActive: true
    });
  });

  it('contrôle l’IBAN et liste les débiteurs d’un lot', async () => {
    await checkSyndicIban('agence-1', 'syn-1', 'CI93X');
    expect(post).toHaveBeenCalledWith(`${BASE}/controle-iban`, { iban: 'CI93X' });

    await listLotDebtors('agence-1', 'syn-1', 'lot-1');
    expect(get).toHaveBeenCalledWith(`${BASE}/lots/lot-1/debiteurs`);
  });

  it('retire les filtres vides de la liste des mandats', async () => {
    await listSyndicMandates('agence-1', 'syn-1', { lotId: 'lot-1', search: '', status: undefined, page: 2 });
    expect(get).toHaveBeenCalledWith(`${BASE}/mandats`, { params: { lotId: 'lot-1', page: 2 } });
  });

  it('crée un mandat avec le lot et le contact débiteur', async () => {
    const input = { lotId: 'lot-1', debtorContactId: 'c-1', iban: 'CI93X', holderName: 'Awa' };
    await createSyndicMandate('agence-1', 'syn-1', input);
    expect(post).toHaveBeenCalledWith(`${BASE}/mandats`, input);
  });

  it('modifie, active, suspend, réactive et révoque aux routes du contrat', async () => {
    await updateSyndicMandate('agence-1', 'syn-1', 'm-1', { maxAmount: null });
    expect(patch).toHaveBeenCalledWith(`${BASE}/mandats/m-1`, { maxAmount: null });

    await activateSyndicMandate('agence-1', 'syn-1', 'm-1', '2026-10-10');
    expect(post).toHaveBeenLastCalledWith(`${BASE}/mandats/m-1/activer`, { signedAt: '2026-10-10' });
    await activateSyndicMandate('agence-1', 'syn-1', 'm-1');
    expect(post).toHaveBeenLastCalledWith(`${BASE}/mandats/m-1/activer`, {});

    await suspendSyndicMandate('agence-1', 'syn-1', 'm-1', 'Litige');
    expect(post).toHaveBeenLastCalledWith(`${BASE}/mandats/m-1/suspendre`, { reason: 'Litige' });

    await reactivateSyndicMandate('agence-1', 'syn-1', 'm-1');
    expect(post).toHaveBeenLastCalledWith(`${BASE}/mandats/m-1/reactiver`);

    await revokeSyndicMandate('agence-1', 'syn-1', 'm-1', 'Départ');
    expect(post).toHaveBeenLastCalledWith(`${BASE}/mandats/m-1/revoquer`, { reason: 'Départ' });
    await revokeSyndicMandate('agence-1', 'syn-1', 'm-1', 'Départ', '2026-10-12');
    expect(post).toHaveBeenLastCalledWith(`${BASE}/mandats/m-1/revoquer`, {
      reason: 'Départ',
      revokedAt: '2026-10-12'
    });
  });

  it('télécharge l’autorisation en blob et dépose le scan en multipart', async () => {
    get.mockResolvedValueOnce({
      data: new Blob(['pdf']),
      headers: { 'content-disposition': 'attachment; filename="autorisation-MDT-2026-0001.pdf"' }
    });
    const result = await downloadSyndicAuthorizationPdf('agence-1', 'syn-1', 'm-1', 'x.pdf');
    expect(get).toHaveBeenCalledWith(`${BASE}/mandats/m-1/autorisation-pdf`, { responseType: 'blob' });
    expect(result.filename).toBe('autorisation-MDT-2026-0001.pdf');

    const file = new File(['x'], 'scan.pdf', { type: 'application/pdf' });
    await uploadSyndicSignedScan('agence-1', 'syn-1', 'm-1', file);
    const [url, body, config] = post.mock.calls[post.mock.calls.length - 1];
    expect(url).toBe(`${BASE}/mandats/m-1/scan-signe`);
    expect((body as FormData).get('file')).toBe(file);
    expect(config).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } });
  });

  it('liste et prépare les remises sans créancier dans le corps', async () => {
    await listSyndicRemittances('agence-1', 'syn-1', { status: 'DRAFT', page: 1, pageSize: 20 });
    expect(get).toHaveBeenCalledWith(`${BASE}/remises`, { params: { status: 'DRAFT', page: 1, pageSize: 20 } });

    await createSyndicRemittance('agence-1', 'syn-1', { collectionDate: '2026-11-05', notes: 'N' });
    expect(post).toHaveBeenLastCalledWith(`${BASE}/remises`, { collectionDate: '2026-11-05', notes: 'N' });

    await getSyndicRemittance('agence-1', 'syn-1', 'r-1');
    expect(get).toHaveBeenLastCalledWith(`${BASE}/remises/r-1`);
  });

  it('couvre les actions de remise : actualiser, retirer, valider, avis, fichier, déposer, annuler', async () => {
    await refreshSyndicRemittance('agence-1', 'syn-1', 'r-1');
    expect(post).toHaveBeenLastCalledWith(`${BASE}/remises/r-1/actualiser`);

    await removeSyndicRemittanceLine('agence-1', 'syn-1', 'r-1', 'l-1', 'Doublon');
    expect(post).toHaveBeenLastCalledWith(`${BASE}/remises/r-1/lignes/l-1/retirer`, { reason: 'Doublon' });

    await validateSyndicRemittance('agence-1', 'syn-1', 'r-1');
    expect(post).toHaveBeenLastCalledWith(`${BASE}/remises/r-1/valider`);

    await resendSyndicPrenotifications('agence-1', 'syn-1', 'r-1');
    expect(post).toHaveBeenLastCalledWith(`${BASE}/remises/r-1/avis`);

    await exportSyndicRemittance('agence-1', 'syn-1', 'r-1', 'remise.csv');
    expect(post).toHaveBeenLastCalledWith(`${BASE}/remises/r-1/fichier`, undefined, { responseType: 'blob' });

    await submitSyndicRemittance('agence-1', 'syn-1', 'r-1');
    expect(post).toHaveBeenLastCalledWith(`${BASE}/remises/r-1/deposer`);

    await cancelSyndicRemittance('agence-1', 'syn-1', 'r-1', 'Erreur');
    expect(post).toHaveBeenLastCalledWith(`${BASE}/remises/r-1/annuler`, { reason: 'Erreur' });
  });
});
