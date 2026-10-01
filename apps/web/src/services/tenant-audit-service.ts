import apiClient from '../utils/api-client';

/**
 * Journal d'activité d'une agence — `GET /api/tenants/:tenantId/audit`
 * (spec 023, phase 2). Pagination par curseur : pas de total, pas de numéro de
 * page, seulement `nextCursor` tant qu'il reste des lignes.
 */

export type TenantAuditCategory = 'AUTH' | 'DATA' | 'ADMIN' | 'SECURITY' | 'BILLING' | 'EXPORT' | 'AI' | 'SYSTEM';
export type TenantAuditOutcome = 'SUCCESS' | 'FAILURE' | 'DENIED';
export type TenantAuditActorType = 'USER' | 'SUPER_ADMIN' | 'PORTAL' | 'SYSTEM' | 'AI';

export const TENANT_AUDIT_CATEGORIES: TenantAuditCategory[] = [
  'AUTH',
  'DATA',
  'ADMIN',
  'SECURITY',
  'BILLING',
  'EXPORT',
  'AI',
  'SYSTEM'
];

export const TENANT_AUDIT_OUTCOMES: TenantAuditOutcome[] = ['SUCCESS', 'FAILURE', 'DENIED'];

export interface TenantAuditLog {
  id: string;
  /** Date ISO de l'événement. */
  createdAt: string;
  /** Clé d'action, ex. `PROPERTY_CREATED`. */
  action: string;
  category: TenantAuditCategory;
  outcome: TenantAuditOutcome;
  actorType: TenantAuditActorType;
  /** Absent quand l'acteur est le support (SUPER_ADMIN) ou le système. */
  user?: { id: string; email: string; fullName: string | null };
  /** E-mail ou nom de l'acteur au moment de l'action (absent pour SUPER_ADMIN). */
  actorLabel?: string;
  resourceType: string;
  resourceId: string;
  resourceLabel?: string;
  details?: Record<string, unknown>;
  changes?: Record<string, { before?: unknown; after?: unknown } | unknown>;
  /** Absents pour le support : l'API ne les envoie pas. */
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

/** Filtres acceptés par l'API. Toute autre clé est rejetée en 400. */
export interface TenantAuditFilters {
  category?: TenantAuditCategory;
  outcome?: TenantAuditOutcome;
  actionKey?: string;
  entityType?: string;
  entityId?: string;
  /** `YYYY-MM-DD`, borne incluse. */
  startDate?: string;
  /** `YYYY-MM-DD`, borne incluse. */
  endDate?: string;
  /** Curseur opaque renvoyé par `nextCursor`. */
  cursor?: string;
  /** 1 à 100 (50 par défaut côté API). */
  limit?: number;
}

export interface TenantAuditPage {
  logs: TenantAuditLog[];
  nextCursor: string | null;
}

interface TenantAuditResponse {
  success: boolean;
  data: TenantAuditPage;
}

/** Ne garde que les valeurs définies et non vides : l'API refuse un paramètre inconnu et n'a que faire d'une chaîne vide. */
function definedParams(filters: TenantAuditFilters): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    params[key] = value as string | number;
  }
  return params;
}

export async function getTenantAuditLogs(
  tenantId: string,
  filters: TenantAuditFilters = {}
): Promise<TenantAuditResponse> {
  const response = await apiClient.get<TenantAuditResponse>(`/tenants/${tenantId}/audit`, {
    params: definedParams(filters)
  });
  return response.data;
}
