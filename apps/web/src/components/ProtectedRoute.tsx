import React from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { AccessDenied } from './primitives/AccessDenied';
import { SkeletonDetail } from './primitives/Skeleton';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'SUPER_ADMIN' | 'USER';
  requireTenant?: boolean;
  requirePermission?: string;
}

/**
 * ProtectedRoute component
 * Protects routes that require authentication
 * Redirects to login if not authenticated
 * Optionally checks for required role, tenant membership, or permission
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredRole,
  requireTenant,
  requirePermission
}) => {
  const { isAuthenticated, isLoading, user, tenantMembership, isLoadingMembership } = useAuth();
  const location = useLocation();
  const params = useParams<{ tenantId?: string }>();

  // Squelette plutot que spinner plein ecran : une seule convention de
  // chargement (§5.6), et aucun saut de mise en page a l'arrivee du contenu.
  if (isLoading || isLoadingMembership) {
    return (
      <div style={{ padding: 'var(--page-padding)' }}>
        <SkeletonDetail aria-label="Verification de votre acces" />
      </div>
    );
  }

  // Redirect to login if not authenticated (pass redirect in URL for post-login navigation)
  if (!isAuthenticated) {
    const redirectPath = location.pathname + location.search;
    const to =
      redirectPath && redirectPath !== '/login' ? `/login?redirect=${encodeURIComponent(redirectPath)}` : '/login';
    return <Navigate to={to} replace />;
  }

  // Check role if required
  if (requiredRole && user?.globalRole !== requiredRole) {
    return <AccessDenied reason="role" currentRole={user?.globalRole} requiredRole={requiredRole} />;
  }

  // Check tenant membership if required
  if (requireTenant) {
    // Le SUPER_ADMIN n'a pas de tenantMembership par construction : il supervise
    // la plateforme, pas une agence. L'exclure de ce controle evite de le
    // verrouiller hors des routes /tenant/:tenantId/* qu'il doit pouvoir
    // inspecter. Le back-end filtre de toute facon par tenantId.
    const isPlatformAdmin = user?.globalRole === 'SUPER_ADMIN';

    if (!isPlatformAdmin) {
      if (params.tenantId) {
        if (!tenantMembership) {
          return <AccessDenied reason="no-tenant" />;
        }
        if (tenantMembership.tenantId !== params.tenantId) {
          return <AccessDenied reason="wrong-tenant" />;
        }
      } else if (!tenantMembership) {
        return <AccessDenied reason="no-tenant" />;
      }
    }
  }

  // Permission check would require an API call to check user permissions
  // For now, we'll skip this as it requires backend permission checking endpoint
  // TODO: Implement permission checking when backend endpoint is available

  return <>{children}</>;
};
