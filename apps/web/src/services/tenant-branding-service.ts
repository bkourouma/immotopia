import apiClient from '../utils/api-client';
import type { Tenant, TenantResponse } from './tenant-service';

/**
 * Champs d'identité visuelle et de contact d'une agence : logo, couleur de
 * marque, site web, e-mail de contact.
 *
 * `services/tenant-service.ts` (hors territoire) expose déjà `updateTenant` /
 * `updateTenantSelf`, mais son type `UpdateTenantRequest` ne déclare pas
 * `logoUrl` — l'API l'accepte pourtant (`PATCH /admin/tenants/:id` et
 * `PATCH /tenants/:id`, contrat de l'agent en charge du sélecteur d'agence).
 * Ce service fournit donc ses propres fonctions typées plutôt que de modifier
 * ce fichier.
 */

/** `Tenant` tel que renvoyé par l'API, avec le champ logo que son type n'expose pas encore. */
export type TenantWithBranding = Tenant & { logoUrl?: string | null };

export interface TenantBrandingFields {
  logoUrl?: string | null;
  brandingPrimaryColor?: string | null;
  website?: string;
  contactEmail?: string;
}

/** Payload complet accepté par `PATCH /admin/tenants/:id` et `PATCH /tenants/:id`. */
export type TenantUpdatePayload = TenantBrandingFields & {
  name?: string;
  legalName?: string;
  contactPhone?: string;
  country?: string;
  city?: string;
  address?: string;
  subdomain?: string;
  customDomain?: string;
  status?: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
};

/** Met à jour une agence (super-admin) : tous les champs, y compris logo et couleur. */
export async function updateTenantBrandingAdmin(
  tenantId: string,
  data: TenantUpdatePayload
): Promise<TenantResponse> {
  const response = await apiClient.patch(`/admin/tenants/${tenantId}`, data);
  return response.data;
}

/** Met à jour sa propre agence (membre de l'agence) : sans `status`. */
export async function updateTenantBrandingSelf(
  tenantId: string,
  data: Omit<TenantUpdatePayload, 'status' | 'subdomain' | 'customDomain'>
): Promise<TenantResponse> {
  const response = await apiClient.patch(`/tenants/${tenantId}`, data);
  return response.data;
}

export interface UploadTenantLogoResponse {
  success: boolean;
  data: { logoUrl: string };
}

/**
 * Envoie le logo d'une agence. `POST /tenants/:tenantId/logo`, multipart,
 * champ `logo`, png/jpeg/webp, 2 Mo max.
 */
export async function uploadTenantLogo(tenantId: string, file: File): Promise<UploadTenantLogoResponse> {
  const formData = new FormData();
  formData.append('logo', file);
  const response = await apiClient.post(`/tenants/${tenantId}/logo`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data;
}
