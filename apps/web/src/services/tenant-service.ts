import apiClient from '../utils/api-client';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  legalName?: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
  contactEmail?: string;
  contactPhone?: string;
  country?: string;
  city?: string;
  address?: string;
  brandingPrimaryColor?: string;
  subdomain?: string;
  customDomain?: string;
  website?: string;
  lastActivityAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TenantFilters {
  status?: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
  type?: string;
  plan?: string;
  module?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface TenantStats {
  totalProperties: number;
  totalClients: number;
  totalCollaborators: number;
  activeModules: number;
  lastActivity: string;
}

/** Offre d'abonnement proposée à la création d'une agence. */
export type TenantPlanKey = 'BASIC' | 'PRO' | 'ELITE';
export type TenantBillingCycle = 'MONTHLY' | 'ANNUAL';
export type TenantModuleKey = 'MODULE_AGENCY' | 'MODULE_SYNDIC' | 'MODULE_PROMOTER' | 'MODULE_PATRIMOINE';

/**
 * Élément souscrit à la création (abonnements par packs, vague 2) : code du
 * catalogue (`AGENCE`, `SYNDIC`, `PROMOTEUR`, `INTEGRE`, `EXT_LOTS_10`,
 * `EXT_COPRO`, `EXT_CHANTIER`, `SETUP_<PACK>`) et quantité (1 par défaut côté API).
 */
export interface ProvisionTenantItem {
  code: string;
  quantity?: number;
}

/** Corps de `POST /api/admin/tenants` — création d'agence en un clic (lot F, puis packs en vague 2). */
export interface ProvisionTenantPayload {
  name: string;
  adminFullName: string;
  adminEmail: string;
  /**
   * Format de référence (docs/architecture/PLAN-ABONNEMENTS.md §9) : packs et
   * extensions du catalogue. Prioritaire sur `planKey`/`modules` quand fourni.
   */
  items?: ProvisionTenantItem[];
  planKey?: TenantPlanKey;
  billingCycle?: TenantBillingCycle;
  type?: 'AGENCY' | 'OPERATOR';
  modules?: TenantModuleKey[];
  legalName?: string;
  contactEmail?: string;
  contactPhone?: string;
  country?: string;
  city?: string;
  address?: string;
  website?: string;
  /** Couleur `#RRGGBB`. */
  brandingPrimaryColor?: string;
}

export interface ProvisionTenantResult {
  tenant: {
    id: string;
    name: string;
    slug: string;
    type: string;
    status: string;
  };
  modules: string[];
  subscription: {
    planKey: string | null;
    billingCycle: string;
    status: string;
    currentPeriodEnd: string;
    /** Fin de l'essai d'un mois (D8), nul hors essai. */
    trialEndsAt?: string | null;
    /** Packs et extensions effectivement souscrits (vague 2). */
    items?: ProvisionTenantItem[];
  };
  admin: {
    userId: string;
    email: string;
    fullName: string;
    /** `true` si l'e-mail correspondait déjà à un compte (rattaché à cette agence en plus des autres). */
    existingUser: boolean;
  };
  invitation: {
    id: string;
    expiresAt: string;
    acceptUrl: string;
  };
  emailSent: boolean;
  /** Rejeu : l'agence existait déjà, l'invitation n'a pas été régénérée (`acceptUrl` vide). */
  alreadyExisted?: boolean;
}

export interface ProvisionTenantResponse {
  success: boolean;
  data: ProvisionTenantResult;
  message?: string;
  errors?: Array<{ field?: string; message?: string }>;
}

export interface ResendInvitationResult {
  acceptUrl?: string;
  emailSent?: boolean;
}

export interface ResendInvitationResponse {
  success: boolean;
  data: ResendInvitationResult;
  message?: string;
}

export interface UpdateTenantRequest {
  name?: string;
  legalName?: string;
  contactEmail?: string;
  contactPhone?: string;
  country?: string;
  city?: string;
  address?: string;
  brandingPrimaryColor?: string;
  subdomain?: string;
  customDomain?: string;
  website?: string;
  status?: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
}

export interface TenantListResponse {
  success: boolean;
  data: {
    tenants: Tenant[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

export interface TenantResponse {
  success: boolean;
  data: Tenant;
}

export interface TenantStatsResponse {
  success: boolean;
  data: TenantStats;
}

// List all tenants (admin only)
export async function listTenants(filters?: TenantFilters): Promise<TenantListResponse> {
  const response = await apiClient.get('/admin/tenants', { params: filters });
  return response.data;
}

// Get tenant by ID (public endpoint, no admin required)
export async function getTenant(tenantId: string): Promise<TenantResponse> {
  const response = await apiClient.get(`/tenants/${tenantId}`);
  return response.data;
}

// Get tenant by ID (admin only)
export async function getTenantAdmin(tenantId: string): Promise<TenantResponse> {
  const response = await apiClient.get(`/admin/tenants/${tenantId}`);
  return response.data;
}

/**
 * Crée une agence prête à l'emploi en une seule opération : agence active,
 * modules, abonnement, socle comptable et administrateur invité (lot F,
 * `POST /api/admin/tenants`).
 *
 * `idempotencyKey` doit être générée UNE FOIS par ouverture du formulaire de
 * création (pas à chaque envoi) : un double clic pendant que la première
 * requête est en vol renvoie alors le même résultat au lieu de créer une
 * seconde agence.
 */
export async function provisionTenant(
  payload: ProvisionTenantPayload,
  idempotencyKey: string
): Promise<ProvisionTenantResponse> {
  const response = await apiClient.post('/admin/tenants', payload, {
    headers: { 'Idempotency-Key': idempotencyKey }
  });
  return response.data;
}

/** Renvoie l'invitation de l'administrateur d'une agence tout juste créée. */
export async function resendInvitation(tenantId: string, invitationId: string): Promise<ResendInvitationResponse> {
  const response = await apiClient.post(`/tenants/${tenantId}/users/invitations/${invitationId}/resend`);
  return response.data;
}

// Update tenant (admin only)
export async function updateTenant(tenantId: string, data: UpdateTenantRequest): Promise<TenantResponse> {
  const response = await apiClient.patch(`/admin/tenants/${tenantId}`, data);
  return response.data;
}

// Update tenant (self - for tenant members)
export async function updateTenantSelf(
  tenantId: string,
  data: Omit<UpdateTenantRequest, 'status' | 'subdomain' | 'customDomain'>
): Promise<TenantResponse> {
  const response = await apiClient.patch(`/tenants/${tenantId}`, data);
  return response.data;
}

// Suspend tenant (admin only)
export async function suspendTenant(tenantId: string): Promise<TenantResponse> {
  const response = await apiClient.post(`/admin/tenants/${tenantId}/suspend`);
  return response.data;
}

// Activate tenant (admin only)
export async function activateTenant(tenantId: string): Promise<TenantResponse> {
  const response = await apiClient.post(`/admin/tenants/${tenantId}/activate`);
  return response.data;
}

// Get tenant statistics
export async function getTenantStats(tenantId: string): Promise<TenantStatsResponse> {
  const response = await apiClient.get(`/admin/tenants/${tenantId}/stats`);
  return response.data;
}

// Client types
export interface TenantClient {
  id: string;
  userId: string;
  tenantId: string;
  clientType: 'OWNER' | 'RENTER' | 'BUYER' | 'CO_OWNER';
  details?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    avatarUrl?: string;
  };
}

export interface TenantClientsResponse {
  success: boolean;
  data: TenantClient[];
}

// Get all clients for a tenant
export async function getTenantClients(tenantId: string): Promise<TenantClientsResponse> {
  const response = await apiClient.get(`/tenants/${tenantId}/clients`);
  return response.data;
}
