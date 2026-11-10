import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createReceivingAccount,
  deleteReceivingAccount,
  fetchReceivingAccountQr,
  listReceivingAccounts,
  updateReceivingAccount,
  type ReceivingAccountInput
} from '../../services/receiving-account-service';
import { listMyReceivingAccounts } from '../../services/coowner-portal-service';
import { tenantPortalService } from '../../services/tenantPortalService';

/**
 * Services des comptes de réception (spec 048, lot Q), mock posé à la
 * frontière réseau : le vrai `toFormData` tourne et le corps envoyé est lu.
 */

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();
const del = vi.fn();

vi.mock('../../utils/api-client', () => ({
  default: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a),
    put: (...a: unknown[]) => put(...a),
    delete: (...a: unknown[]) => del(...a)
  }
}));

const agency = { kind: 'agency' as const, tenantId: 'tenant-1' };
const syndicate = { kind: 'syndicate' as const, tenantId: 'tenant-1', syndicId: 'syn-1' };

const INPUT: ReceivingAccountInput = {
  institution: 'Wave',
  scannableWith: null,
  alias: 'agence-soleil',
  holderName: 'Agence Soleil',
  instructions: null,
  isActive: true,
  sortOrder: 2
};

/** Corps multipart envoyé, en paires clé → valeur (le fichier reste un `File`). */
function sentForm(mock: ReturnType<typeof vi.fn>): Map<string, FormDataEntryValue> {
  const form = mock.mock.calls[0][1] as FormData;
  expect(form).toBeInstanceOf(FormData);
  return new Map(form.entries());
}

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ data: { success: true, data: [] } });
  post.mockResolvedValue({ data: { success: true, data: { id: 'a1' } } });
  put.mockResolvedValue({ data: { success: true, data: { id: 'a1' } } });
  del.mockResolvedValue({ data: { success: true } });
});

describe('receiving-account-service', () => {
  it('liste par la route de l’agence ou de la copropriété', async () => {
    await listReceivingAccounts(agency);
    await listReceivingAccounts(syndicate);
    expect(get).toHaveBeenNthCalledWith(1, '/tenants/tenant-1/settings/receiving-accounts');
    expect(get).toHaveBeenNthCalledWith(2, '/tenants/tenant-1/syndics/syn-1/receiving-accounts');
  });

  it('création : tous les champs, facultatifs vides en chaîne vide, sans removeQr ni version', async () => {
    const qr = new File(['png'], 'qr.png', { type: 'image/png' });
    await createReceivingAccount(agency, INPUT, { qrFile: qr });
    expect(post.mock.calls[0][0]).toBe('/tenants/tenant-1/settings/receiving-accounts');
    expect(post.mock.calls[0][2]).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } });
    const form = sentForm(post);
    expect(Object.fromEntries([...form].filter(([key]) => key !== 'qr'))).toEqual({
      institution: 'Wave',
      scannableWith: '',
      alias: 'agence-soleil',
      holderName: 'Agence Soleil',
      instructions: '',
      isActive: 'true',
      sortOrder: '2'
    });
    expect(form.get('qr')).toBeInstanceOf(File);
    expect((form.get('qr') as File).name).toBe('qr.png');
    expect(form.has('removeQr')).toBe(false);
    expect(form.has('expectedUpdatedAt')).toBe(false);
  });

  it('modification complète : removeQr en chaîne et expectedUpdatedAt envoyés', async () => {
    await updateReceivingAccount(syndicate, 'a1', INPUT, {
      removeQr: true,
      expectedUpdatedAt: '2026-11-01T10:00:00.000Z'
    });
    expect(put.mock.calls[0][0]).toBe('/tenants/tenant-1/syndics/syn-1/receiving-accounts/a1');
    const form = sentForm(put);
    expect(form.get('removeQr')).toBe('true');
    expect(form.get('expectedUpdatedAt')).toBe('2026-11-01T10:00:00.000Z');
    expect(form.get('alias')).toBe('agence-soleil');
    expect(form.has('qr')).toBe(false);
  });

  it('modification partielle : seuls isActive, removeQr=false et la version partent', async () => {
    await updateReceivingAccount(
      agency,
      'a1',
      { isActive: false },
      { removeQr: false, expectedUpdatedAt: '2026-11-01T10:00:00.000Z' }
    );
    expect(Object.fromEntries(sentForm(put))).toEqual({
      isActive: 'false',
      removeQr: 'false',
      expectedUpdatedAt: '2026-11-01T10:00:00.000Z'
    });
  });

  it('suppression par la route du compte', async () => {
    await deleteReceivingAccount(agency, 'a1');
    expect(del).toHaveBeenCalledWith('/tenants/tenant-1/settings/receiving-accounts/a1');
  });

  it('image du QR : préfixe /api retiré, réponse en blob', async () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    get.mockResolvedValueOnce({ data: blob });
    const result = await fetchReceivingAccountQr('/api/portal/tenant/receiving-accounts/a1/qr');
    expect(get).toHaveBeenCalledWith('/portal/tenant/receiving-accounts/a1/qr', { responseType: 'blob' });
    expect(result).toBe(blob);
  });

  it('image du QR : un chemin sans préfixe /api reste tel quel, « /apix » n’est pas tronqué', async () => {
    get.mockResolvedValue({ data: new Blob() });
    await fetchReceivingAccountQr('/tenants/tenant-1/settings/receiving-accounts/a1/qr');
    await fetchReceivingAccountQr('/apix/a1/qr');
    expect(get.mock.calls[0][0]).toBe('/tenants/tenant-1/settings/receiving-accounts/a1/qr');
    expect(get.mock.calls[1][0]).toBe('/apix/a1/qr');
  });

  it('portail copropriétaire : la copropriété de chaque compte est conservée', async () => {
    get.mockResolvedValueOnce({ data: { success: true, data: [{ id: 'a1', syndicateId: 'syn-1' }] } });
    const accounts = await listMyReceivingAccounts();
    expect(get.mock.calls[0][0]).toBe('/portal/copropriete/receiving-accounts');
    expect(accounts[0].syndicateId).toBe('syn-1');
  });

  it('portail locataire : échéances non soldées sans filtre d’écran', async () => {
    await tenantPortalService.getUnpaidInstallments(10);
    expect(get).toHaveBeenCalledWith('/portal/tenant/installments', {
      params: { status: 'DUE,OVERDUE,PARTIAL', page: 1, limit: 10 }
    });
  });
});
