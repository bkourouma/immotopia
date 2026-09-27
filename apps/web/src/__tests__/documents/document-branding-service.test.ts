import { describe, it, expect, vi, beforeEach } from 'vitest';
import apiClient from '../../utils/api-client';
import {
  createMandatingAgency,
  deleteMandatingAgency,
  fetchAgencyImageBlob,
  fetchMandantImageBlob,
  fetchSyndicateLogoBlob,
  getAgencyDocumentIdentity,
  listMandatingAgencies,
  removeAgencyImage,
  removeMandantImage,
  removeSyndicateLogo,
  updateMandatingAgency,
  uploadAgencyImage,
  uploadMandantImage,
  uploadSyndicateLogo,
  validateBrandingImageFile
} from '../../services/document-branding-service';

/**
 * Lot S1 (besoin 7) — contrat exact du service : chemins d'API, verbes,
 * `responseType: 'blob'` pour les images privées, `multipart/form-data` pour
 * les envois. Seul `apiClient` est simulé.
 */

vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}));

const mockApiClient = apiClient as any;

describe('document-branding-service — agences mandantes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('liste les agences mandantes du tenant', async () => {
    mockApiClient.get.mockResolvedValue({ data: { success: true, data: [{ id: 'a1' }] } });
    const result = await listMandatingAgencies('tenant-1');
    expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/tenant-1/syndic-mandating-agencies');
    expect(result).toEqual([{ id: 'a1' }]);
  });

  it('crée une agence mandante avec les champs du contrat', async () => {
    mockApiClient.post.mockResolvedValue({ data: { success: true, data: { id: 'a1', name: 'Agence Alpha' } } });
    await createMandatingAgency('tenant-1', { name: 'Agence Alpha' });
    expect(mockApiClient.post).toHaveBeenCalledWith('/tenants/tenant-1/syndic-mandating-agencies', {
      name: 'Agence Alpha'
    });
  });

  it('modifie une agence mandante par PATCH', async () => {
    mockApiClient.patch.mockResolvedValue({ data: { success: true, data: { id: 'a1', name: 'Agence Beta' } } });
    await updateMandatingAgency('tenant-1', 'a1', { name: 'Agence Beta' });
    expect(mockApiClient.patch).toHaveBeenCalledWith('/tenants/tenant-1/syndic-mandating-agencies/a1', {
      name: 'Agence Beta'
    });
  });

  it('supprime une agence mandante par DELETE', async () => {
    mockApiClient.delete.mockResolvedValue({ data: { success: true, data: { id: 'a1' } } });
    const result = await deleteMandatingAgency('tenant-1', 'a1');
    expect(mockApiClient.delete).toHaveBeenCalledWith('/tenants/tenant-1/syndic-mandating-agencies/a1');
    expect(result).toEqual({ id: 'a1' });
  });

  it('envoie une image de mandant en multipart/form-data', async () => {
    mockApiClient.put.mockResolvedValue({ data: { success: true, data: { id: 'a1' } } });
    const file = new File(['contenu'], 'logo.png', { type: 'image/png' });
    await uploadMandantImage('tenant-1', 'a1', 'logo', file);
    expect(mockApiClient.put).toHaveBeenCalledWith(
      '/tenants/tenant-1/syndic-mandating-agencies/a1/images/logo',
      expect.any(FormData),
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
  });

  it('retire une image de mandant par DELETE', async () => {
    mockApiClient.delete.mockResolvedValue({ data: { success: true, data: { id: 'a1' } } });
    await removeMandantImage('tenant-1', 'a1', 'signature');
    expect(mockApiClient.delete).toHaveBeenCalledWith(
      '/tenants/tenant-1/syndic-mandating-agencies/a1/images/signature'
    );
  });

  it('lit une image de mandant en blob (jamais un <img src> direct)', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    mockApiClient.get.mockResolvedValue({ data: blob });
    const result = await fetchMandantImageBlob('tenant-1', 'a1', 'stamp');
    expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/tenant-1/syndic-mandating-agencies/a1/images/stamp', {
      responseType: 'blob'
    });
    expect(result).toBe(blob);
  });
});

describe('document-branding-service — logo de copropriété', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('envoie le logo de la copropriété', async () => {
    mockApiClient.put.mockResolvedValue({ data: { success: true, data: { id: 'syn-1', hasLogo: true } } });
    const file = new File(['contenu'], 'logo.png', { type: 'image/png' });
    await uploadSyndicateLogo('tenant-1', 'syn-1', file);
    expect(mockApiClient.put).toHaveBeenCalledWith(
      '/tenants/tenant-1/syndics/syn-1/logo',
      expect.any(FormData),
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
  });

  it('retire le logo de la copropriété', async () => {
    mockApiClient.delete.mockResolvedValue({ data: { success: true, data: { id: 'syn-1', hasLogo: false } } });
    await removeSyndicateLogo('tenant-1', 'syn-1');
    expect(mockApiClient.delete).toHaveBeenCalledWith('/tenants/tenant-1/syndics/syn-1/logo');
  });

  it('lit le logo de la copropriété en blob', async () => {
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    mockApiClient.get.mockResolvedValue({ data: blob });
    const result = await fetchSyndicateLogoBlob('tenant-1', 'syn-1');
    expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/tenant-1/syndics/syn-1/logo', { responseType: 'blob' });
    expect(result).toBe(blob);
  });
});

describe('document-branding-service — signature et cachet de l’agence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lit l’identité documentaire de l’agence', async () => {
    mockApiClient.get.mockResolvedValue({ data: { success: true, data: { hasLogo: true, logoUrl: '/x.png' } } });
    const result = await getAgencyDocumentIdentity('tenant-1');
    expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/tenant-1/document-identity');
    expect(result.hasLogo).toBe(true);
  });

  it('envoie la signature de l’agence', async () => {
    mockApiClient.put.mockResolvedValue({ data: { success: true, data: { hasSignature: true } } });
    const file = new File(['contenu'], 'signature.png', { type: 'image/png' });
    await uploadAgencyImage('tenant-1', 'signature', file);
    expect(mockApiClient.put).toHaveBeenCalledWith(
      '/tenants/tenant-1/document-identity/images/signature',
      expect.any(FormData),
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
  });

  it('retire le cachet de l’agence', async () => {
    mockApiClient.delete.mockResolvedValue({ data: { success: true, data: { hasStamp: false } } });
    await removeAgencyImage('tenant-1', 'stamp');
    expect(mockApiClient.delete).toHaveBeenCalledWith('/tenants/tenant-1/document-identity/images/stamp');
  });

  it('lit le cachet de l’agence en blob', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    mockApiClient.get.mockResolvedValue({ data: blob });
    const result = await fetchAgencyImageBlob('tenant-1', 'stamp');
    expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/tenant-1/document-identity/images/stamp', {
      responseType: 'blob'
    });
    expect(result).toBe(blob);
  });
});

describe('document-branding-service — validation cliente', () => {
  it('accepte un PNG de moins de 2 Mo', () => {
    const file = new File([new Uint8Array(1024)], 'logo.png', { type: 'image/png' });
    expect(validateBrandingImageFile(file)).toBeNull();
  });

  it('refuse un format non PNG/JPEG', () => {
    const file = new File(['x'], 'logo.webp', { type: 'image/webp' });
    expect(validateBrandingImageFile(file)).toBe('Format non supporté (PNG ou JPEG uniquement)');
  });

  it('refuse un fichier de plus de 2 Mo', () => {
    const file = new File([new Uint8Array(3 * 1024 * 1024)], 'logo.png', { type: 'image/png' });
    expect(validateBrandingImageFile(file)).toBe('Le fichier ne doit pas dépasser 2 Mo');
  });
});
