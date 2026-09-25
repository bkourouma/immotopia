import apiClient from '../utils/api-client';
import type { ModuleAccessLevel } from '../navigation/feature-access';

/**
 * Droits d'abonnement de l'agence, pour le menu (vague 2, lot A).
 *
 * Volontairement minimal — seuls les champs lus par la coquille — et séparé
 * de `subscription-v2-service.ts` (écrans d'abonnement) : lu par
 * `hooks/useMenuAccess.ts` dans la coquille, il ne doit pas entraîner les
 * types et appels du back-office avec lui.
 *
 * `GET /api/tenants/:tenantId/entitlements` (requireTenantAccess).
 */
export interface MenuEntitlements {
  moduleAccess: Partial<Record<string, ModuleAccessLevel>>;
  readOnly: boolean;
  phase: string;
  enforcement: 'off' | 'warn' | 'enforce';
}

export async function getMenuEntitlements(tenantId: string): Promise<MenuEntitlements> {
  const response = await apiClient.get<{ data?: MenuEntitlements } & Partial<MenuEntitlements>>(
    `/tenants/${tenantId}/entitlements`
  );
  const body = response.data;
  // Enveloppe `{ success, data }` des routes d'agence ; tolère un corps nu.
  return (body.data ?? body) as MenuEntitlements;
}
