import { Tenant, TenantType, TenantModule, Subscription, Invoice } from '@prisma/client';

// Re-export Prisma types
export type { Tenant, TenantType, TenantModule, Subscription, Invoice };

// Tenant status enum
export enum TenantStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED'
}

// Extended Tenant with relationships
export interface TenantDetail extends Tenant {
  modules?: TenantModule[];
  subscription?: Subscription | null;
  invoices?: Invoice[];
  collaboratorCount?: number;
  activeCollaborators?: number;
  disabledCollaborators?: number;
  lastActivityAt?: Date | null;
}

// Create tenant request
export interface CreateTenantRequest {
  name: string;
  legalName?: string;
  type: TenantType;
  contactEmail: string;
  contactPhone?: string;
  country?: string;
  city?: string;
  address?: string;
  brandingPrimaryColor?: string;
  subdomain?: string;
  customDomain?: string;
  status?: TenantStatus;
}

// Update tenant request
export interface UpdateTenantRequest {
  name?: string;
  legalName?: string;
  status?: TenantStatus;
  contactEmail?: string;
  contactPhone?: string;
  country?: string;
  city?: string;
  address?: string;
  // `| null` (lot G3) : efface une valeur deja posee, comme la colonne Prisma
  // (`String?`) le permet deja.
  brandingPrimaryColor?: string | null;
  subdomain?: string;
  customDomain?: string;
  logoUrl?: string | null;
  website?: string;
}

// Tenant list filters
export interface TenantFilters {
  status?: TenantStatus;
  type?: TenantType;
  plan?: string;
  module?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// Tenant statistics
export interface TenantStats {
  collaboratorCount: number;
  activeCollaborators: number;
  disabledCollaborators: number;
  enabledModules: string[];
  subscription?: {
    /** Deprecie : nul pour une agence creee avec des packs. */
    plan: string | null;
    status: string;
    billingCycle: string;
  } | null;
  lastLoginAt: Date | null;
}

// Module update request
export interface UpdateTenantModulesRequest {
  modules: Array<{
    moduleKey: string;
    enabled: boolean;
  }>;
}

// --- Lot F : creation d'agence en un clic --------------------------------

/** Corps de POST /api/admin/tenants (voir docs/architecture/PLAN-MULTI-TENANT.md, lot F2). */
export interface ProvisionTenantRequest {
  name: string;
  adminFullName: string;
  adminEmail: string;
  /**
   * Packs et extensions souscrits (codes du catalogue, ex.
   * `[{ code: 'AGENCE' }, { code: 'EXT_LOTS_10', quantity: 3 }]`). Format
   * de reference depuis les abonnements par packs
   * (docs/architecture/PLAN-ABONNEMENTS.md). Absent : ancien format
   * `modules`/`planKey`, converti en packs.
   */
  items?: Array<{ code: string; quantity?: number }>;
  /** DEPRECIE : etiquette sans contenu, conservee si fournie. */
  planKey?: 'BASIC' | 'PRO' | 'ELITE';
  billingCycle?: 'MONTHLY' | 'ANNUAL';
  type?: TenantType;
  /** DEPRECIE : ancien format, converti en packs quand `items` est absent. */
  modules?: Array<'MODULE_AGENCY' | 'MODULE_SYNDIC' | 'MODULE_PROMOTER'>;
  legalName?: string;
  contactEmail?: string;
  contactPhone?: string;
  country?: string;
  city?: string;
  address?: string;
  website?: string;
  brandingPrimaryColor?: string;
}

/** Reponse de POST /api/admin/tenants. */
export interface ProvisionTenantResult {
  // `status` en `string` (pas l'enum local `TenantStatus` ci-dessus) : cette
  // valeur vient de `@prisma/client`, un enum TypeScript distinct meme quand
  // ses membres portent les memes noms — les deux ne s'assignent pas l'un a
  // l'autre sans cast, et cette interface n'est qu'un DTO JSON.
  tenant: { id: string; name: string; slug: string; type: TenantType; status: string };
  modules: string[];
  subscription: {
    /** Deprecie : nul quand l'agence est creee avec `items`. */
    planKey: string | null;
    billingCycle: string;
    status: string;
    currentPeriodEnd: string;
    trialEndsAt: string | null;
    /** Elements souscrits, prix mensuels HT figes (FCFA). */
    items: Array<{ code: string; kind: string; quantity: number; unitMonthlyPrice: number; unitSetupPrice: number }>;
  };
  admin: { userId: string; email: string; fullName: string; existingUser: boolean };
  invitation: { id: string; expiresAt: string; acceptUrl: string };
  emailSent: boolean;
}
