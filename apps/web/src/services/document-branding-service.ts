import apiClient from '../utils/api-client';
import { t } from '../i18n/t';

/**
 * Identité des documents (lot S1, besoin 7) : agences mandantes, logo d'une
 * copropriété, signature et cachet de l'agence.
 *
 * Les images de mandant et de copropriété sont PRIVÉES (authentifiées) : leur
 * `logoUrl`/`signatureUrl`/`stampUrl` n'est jamais chargée dans un `<img
 * src=…>` direct, mais lue en blob via `apiClient` puis affichée avec
 * `URL.createObjectURL` (voir `components/documents/BrandingImageField.tsx`).
 * Seule exception : `logoUrl` de `getAgencyDocumentIdentity` reprend le logo
 * public déjà exposé par la fiche de l'agence.
 */

export const BRANDING_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const BRANDING_IMAGE_ACCEPTED_TYPES = ['image/png', 'image/jpeg'] as const;
/**
 * Même limite que `packages/api/src/lib/documents/branding-storage.ts`
 * (`BRANDING_IMAGE_MAX_SIDE`) : au-delà de 3000 px de côté, le serveur refuse
 * l'image (400 « Image trop grande : 3000 x 3000 pixels maximum. »). Non
 * vérifiée côté client (lire les dimensions demanderait de décoder l'image
 * avant l'envoi) — affichée seulement à titre d'information, le message du
 * serveur restant la source de vérité en cas de dépassement.
 */
export const BRANDING_IMAGE_MAX_SIDE_PX = 3000;

export type MandantImageKind = 'logo' | 'signature' | 'stamp';
export type AgencyImageKind = 'signature' | 'stamp';

export interface MandatingAgency {
  id: string;
  name: string;
  legalName: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  rccm: string | null;
  taxId: string | null;
  hasLogo: boolean;
  hasSignature: boolean;
  hasStamp: boolean;
  logoUrl: string | null;
  signatureUrl: string | null;
  stampUrl: string | null;
  syndicateCount: number;
  syndicates?: Array<{ id: string; name: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMandatingAgencyRequest {
  name: string;
  legalName?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  rccm?: string | null;
  taxId?: string | null;
}

export type UpdateMandatingAgencyRequest = Partial<CreateMandatingAgencyRequest>;

export interface SyndicateLogo {
  id: string;
  hasLogo: boolean;
  logoUrl: string | null;
}

export interface AgencyDocumentIdentity {
  hasLogo: boolean;
  logoUrl: string | null;
  hasSignature: boolean;
  hasStamp: boolean;
  signatureUrl: string | null;
  stampUrl: string | null;
}

/**
 * Message d'erreur client, avant tout appel réseau : type et taille du
 * fichier, avec le même seuil que le serveur (`BRANDING_IMAGE_MAX_BYTES`,
 * 2 Mo). Renvoie `null` quand le fichier est acceptable.
 */
export function validateBrandingImageFile(file: File): string | null {
  if (!BRANDING_IMAGE_ACCEPTED_TYPES.includes(file.type as (typeof BRANDING_IMAGE_ACCEPTED_TYPES)[number])) {
    return t('Format non supporté (PNG ou JPEG uniquement)');
  }
  if (file.size > BRANDING_IMAGE_MAX_BYTES) {
    return t('Le fichier ne doit pas dépasser 2 Mo');
  }
  return null;
}

// ------------------------------------------------------------ agences mandantes

export async function listMandatingAgencies(tenantId: string): Promise<MandatingAgency[]> {
  const response = await apiClient.get<{ success: boolean; data: MandatingAgency[] }>(
    `/tenants/${tenantId}/syndic-mandating-agencies`
  );
  return response.data.data;
}

export async function getMandatingAgency(tenantId: string, agencyId: string): Promise<MandatingAgency> {
  const response = await apiClient.get<{ success: boolean; data: MandatingAgency }>(
    `/tenants/${tenantId}/syndic-mandating-agencies/${agencyId}`
  );
  return response.data.data;
}

export async function createMandatingAgency(
  tenantId: string,
  data: CreateMandatingAgencyRequest
): Promise<MandatingAgency> {
  const response = await apiClient.post<{ success: boolean; data: MandatingAgency }>(
    `/tenants/${tenantId}/syndic-mandating-agencies`,
    data
  );
  return response.data.data;
}

export async function updateMandatingAgency(
  tenantId: string,
  agencyId: string,
  data: UpdateMandatingAgencyRequest
): Promise<MandatingAgency> {
  const response = await apiClient.patch<{ success: boolean; data: MandatingAgency }>(
    `/tenants/${tenantId}/syndic-mandating-agencies/${agencyId}`,
    data
  );
  return response.data.data;
}

export async function deleteMandatingAgency(tenantId: string, agencyId: string): Promise<{ id: string }> {
  const response = await apiClient.delete<{ success: boolean; data: { id: string } }>(
    `/tenants/${tenantId}/syndic-mandating-agencies/${agencyId}`
  );
  return response.data.data;
}

export async function uploadMandantImage(
  tenantId: string,
  agencyId: string,
  kind: MandantImageKind,
  file: File
): Promise<MandatingAgency> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.put<{ success: boolean; data: MandatingAgency }>(
    `/tenants/${tenantId}/syndic-mandating-agencies/${agencyId}/images/${kind}`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return response.data.data;
}

export async function removeMandantImage(
  tenantId: string,
  agencyId: string,
  kind: MandantImageKind
): Promise<MandatingAgency> {
  const response = await apiClient.delete<{ success: boolean; data: MandatingAgency }>(
    `/tenants/${tenantId}/syndic-mandating-agencies/${agencyId}/images/${kind}`
  );
  return response.data.data;
}

/**
 * Charge l'image (logo, signature ou cachet) d'un mandant en blob, via
 * `apiClient` : elle est privée et n'est jamais servie en statique.
 */
export async function fetchMandantImageBlob(
  tenantId: string,
  agencyId: string,
  kind: MandantImageKind
): Promise<Blob> {
  const response = await apiClient.get(`/tenants/${tenantId}/syndic-mandating-agencies/${agencyId}/images/${kind}`, {
    responseType: 'blob'
  });
  return response.data;
}

// ------------------------------------------------------------ logo d'une copropriété

export async function uploadSyndicateLogo(tenantId: string, syndicId: string, file: File): Promise<SyndicateLogo> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.put<{ success: boolean; data: SyndicateLogo }>(
    `/tenants/${tenantId}/syndics/${syndicId}/logo`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return response.data.data;
}

export async function removeSyndicateLogo(tenantId: string, syndicId: string): Promise<SyndicateLogo> {
  const response = await apiClient.delete<{ success: boolean; data: SyndicateLogo }>(
    `/tenants/${tenantId}/syndics/${syndicId}/logo`
  );
  return response.data.data;
}

export async function fetchSyndicateLogoBlob(tenantId: string, syndicId: string): Promise<Blob> {
  const response = await apiClient.get(`/tenants/${tenantId}/syndics/${syndicId}/logo`, { responseType: 'blob' });
  return response.data;
}

// ------------------------------------------------------------ signature et cachet de l'agence

export async function getAgencyDocumentIdentity(tenantId: string): Promise<AgencyDocumentIdentity> {
  const response = await apiClient.get<{ success: boolean; data: AgencyDocumentIdentity }>(
    `/tenants/${tenantId}/document-identity`
  );
  return response.data.data;
}

export async function uploadAgencyImage(
  tenantId: string,
  kind: AgencyImageKind,
  file: File
): Promise<AgencyDocumentIdentity> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.put<{ success: boolean; data: AgencyDocumentIdentity }>(
    `/tenants/${tenantId}/document-identity/images/${kind}`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return response.data.data;
}

export async function removeAgencyImage(tenantId: string, kind: AgencyImageKind): Promise<AgencyDocumentIdentity> {
  const response = await apiClient.delete<{ success: boolean; data: AgencyDocumentIdentity }>(
    `/tenants/${tenantId}/document-identity/images/${kind}`
  );
  return response.data.data;
}

export async function fetchAgencyImageBlob(tenantId: string, kind: AgencyImageKind): Promise<Blob> {
  const response = await apiClient.get(`/tenants/${tenantId}/document-identity/images/${kind}`, {
    responseType: 'blob'
  });
  return response.data;
}
