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
  /**
   * Permissions exigées dans l'agence de la route (celle de l'URL, sinon
   * l'agence courante) : TOUTES les clés listées. Indication d'interface — le
   * serveur reste l'autorité. Tant que les droits ne sont pas connus
   * (`user.memberships` absent, appartenance inconnue ou liste vide), on laisse passer et c'est le 403 serveur,
   * rendu par `<DataView errorCause>`, qui tranche.
   */
  requiredPermissions?: string | string[];
}

/**
 * ProtectedRoute component
 * Protects routes that require authentication
 * Redirects to login if not authenticated
 * Optionally checks for required role, tenant membership, or permissions
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredRole,
  requireTenant,
  requiredPermissions
}) => {
  const { isAuthenticated, isLoading, user, tenantMembership, isLoadingMembership, activeTenantId, hasPermission } =
    useAuth();
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

  // Permissions de l'agence (lues sur /auth/me). La garde est volontairement
  // TOLÉRANTE : elle ne refuse que si l'appartenance de l'agence est connue ET
  // que sa liste de permissions est NON vide ET ne contient pas les clés. Une
  // liste vide est indistinguable d'un échec de calcul côté API
  // (getActiveMembershipsWithPermissions renvoie [] dans ce cas), et une
  // appartenance inconnue n'est pas une preuve : on laisse passer, le 403
  // serveur affiché par DataView errorCause rend le refus. Le contrôle
  // strict (liste vide = rien) reste celui de hasPermission, pour masquer
  // des boutons.
  if (requiredPermissions && user?.memberships !== undefined) {
    const tenantId = params.tenantId ?? tenantMembership?.tenantId ?? activeTenantId;
    const known = user.memberships.find(m => m.tenantId === tenantId);
    if (known && known.permissions.length > 0 && !hasPermission?.(tenantId, requiredPermissions)) {
      return (
        <Suspense fallback={null}>
          <AccessDenied reason="role" />
        </Suspense>
      );
    }
  }

  return <>{children}</>;
};
