import React from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

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
  requirePermission,
}) => {
  const { isAuthenticated, isLoading, user, tenantMembership, isLoadingMembership } = useAuth();
  const location = useLocation();
  const params = useParams<{ tenantId?: string }>();

  // Show loading state while checking authentication
  if (isLoading || isLoadingMembership) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Chargement...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check role if required
  if (requiredRole && user?.globalRole !== requiredRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">Accès refusé</h2>
          <p className="mt-2 text-gray-600">
            Vous n'avez pas les permissions nécessaires pour accéder à cette page.
          </p>
        </div>
      </div>
    );
  }

  // Check tenant membership if required
  if (requireTenant) {
    // If route has tenantId param, verify it matches user's membership
    if (params.tenantId) {
      if (!tenantMembership || tenantMembership.tenantId !== params.tenantId) {
        return (
          <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900">Accès refusé</h2>
              <p className="mt-2 text-gray-600">
                Vous n'avez pas accès à ce tenant.
              </p>
            </div>
          </div>
        );
      }
    } else if (!tenantMembership) {
      // If no tenantId in route but tenant membership is required
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900">Accès refusé</h2>
            <p className="mt-2 text-gray-600">
              Vous devez être membre d'un tenant pour accéder à cette page.
            </p>
          </div>
        </div>
      );
    }
  }

  // Permission check would require an API call to check user permissions
  // For now, we'll skip this as it requires backend permission checking endpoint
  // TODO: Implement permission checking when backend endpoint is available

  return <>{children}</>;
};

