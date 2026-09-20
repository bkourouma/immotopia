import React, { Suspense, lazy } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { t } from '../i18n/t';
// `AccessDenied` est `lazy` : c'est un ecran rare, et il tire `Result` et
// `Empty` d'Ant Design. ProtectedRoute etant sur le chemin critique de TOUTES
// les routes, l'importer statiquement mettait 53 Ko d'AntD dans le chunk
// d'entree pour un ecran que la plupart des sessions ne voient jamais.
const AccessDenied = lazy(() => import('./primitives/AccessDenied').then(m => ({ default: m.AccessDenied })));

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

  // Placeholder sans dependance AntD : ce rendu precede la coquille, donc il
  // ne peut pas s'appuyer sur `<SkeletonDetail>` sans tirer Card, Tabs et
  // Skeleton — 75 Ko — dans le chunk d'entree. Trois barres tokenisees
  // suffisent, et evitent le saut de mise en page d'un spinner centre.
  if (isLoading || isLoadingMembership) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label={t('Verification de votre acces')}
        aria-busy="true"
        style={{ padding: 'var(--page-padding)', display: 'grid', gap: 'var(--space-4)' }}
      >
        {['40%', '100%', '70%'].map(width => (
          <div
            key={width}
            style={{
              width,
              height: 'var(--control-h-md)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--surface-sunken)'
            }}
          />
        ))}
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
    return (
      <Suspense fallback={null}>
        <AccessDenied reason="role" currentRole={user?.globalRole} requiredRole={requiredRole} />
      </Suspense>
    );
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
          return (
            <Suspense fallback={null}>
              <AccessDenied reason="no-tenant" />
            </Suspense>
          );
        }
        if (tenantMembership.tenantId !== params.tenantId) {
          return (
            <Suspense fallback={null}>
              <AccessDenied reason="wrong-tenant" />
            </Suspense>
          );
        }
      } else if (!tenantMembership) {
        return (
          <Suspense fallback={null}>
            <AccessDenied reason="no-tenant" />
          </Suspense>
        );
      }
    }
  }

  // Permission check would require an API call to check user permissions
  // For now, we'll skip this as it requires backend permission checking endpoint
  // TODO: Implement permission checking when backend endpoint is available

  return <>{children}</>;
};
