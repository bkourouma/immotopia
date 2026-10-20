import { useAuth } from './useAuth';

/**
 * Droits de l'utilisateur dans l'agence `tenantId` (par défaut l'agence
 * courante). `ready` vaut faux tant que la session charge : ne rien conclure
 * (ne pas masquer ni refuser) avant.
 */
export function usePermissions(tenantId?: string | null): {
  ready: boolean;
  can: (permission: string | string[]) => boolean;
} {
  const { isLoading, isAuthenticated, activeTenantId, hasPermission } = useAuth();
  const id = tenantId ?? activeTenantId;
  return {
    ready: !isLoading && isAuthenticated,
    can: permission => hasPermission?.(id, permission) ?? false
  };
}
