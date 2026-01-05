import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { login as loginApi, logout as logoutApi, getMe, refreshToken } from '../services/auth-service';
import { User, LoginCredentials, AuthContextType, TenantMembership } from '../types/auth-types';
import apiClient from '../utils/api-client';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tenantMembership, setTenantMembership] = useState<TenantMembership | null>(null);
  const [isLoadingMembership, setIsLoadingMembership] = useState(false);

  // Fetch tenant membership
  const refreshMembership = async (): Promise<void> => {
    if (!user || user.globalRole === 'SUPER_ADMIN') {
      setTenantMembership(null);
      return;
    }

    setIsLoadingMembership(true);
    try {
      const response = await apiClient.get('/tenants/my-memberships');
      if (response.data.success && response.data.data) {
        const memberships = response.data.data;
        // For tenant users, get the first member membership
        if (memberships.asMember && memberships.asMember.length > 0) {
          const membership = memberships.asMember[0];
          setTenantMembership({
            id: membership.id,
            tenantId: membership.tenant.id,
            tenant: {
              id: membership.tenant.id,
              name: membership.tenant.name,
              slug: membership.tenant.slug || membership.tenant.id,
            },
            status: membership.status,
          });
        } else {
          setTenantMembership(null);
        }
      } else {
        setTenantMembership(null);
      }
    } catch (error: any) {
      console.error('Error fetching membership:', error);
      setTenantMembership(null);
    } finally {
      setIsLoadingMembership(false);
    }
  };

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await getMe();
        if (response.success && response.user) {
          setUser(response.user);
          setIsAuthenticated(true);
        } else {
          setUser(null);
          setIsAuthenticated(false);
        }
      } catch (error: any) {
        // Silently handle 401 errors - user is just not authenticated
        if (error.response?.status === 401) {
          setUser(null);
          setIsAuthenticated(false);
        } else {
          // Only log non-401 errors
          console.error('Auth check error:', error);
          setUser(null);
          setIsAuthenticated(false);
        }
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  // Fetch membership when user changes
  useEffect(() => {
    if (user && isAuthenticated) {
      refreshMembership();
    } else {
      setTenantMembership(null);
    }
  }, [user, isAuthenticated]);

  // Auto-refresh token before expiry
  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(async () => {
      try {
        await refreshToken();
      } catch (error: any) {
        // Only logout if refresh fails and we're still authenticated
        // Don't logout if it's just a 401 (already logged out)
        if (isAuthenticated && error.response?.status !== 401) {
          await logout();
        }
      }
    }, 14 * 60 * 1000); // Refresh every 14 minutes (before 15 min expiry)

    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const login = async (credentials: LoginCredentials): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await loginApi(credentials);
      if (response.success && response.user) {
        setUser(response.user);
        setIsAuthenticated(true);
      } else {
        throw new Error(response.message || 'Erreur de connexion');
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Erreur de connexion';
      setError(errorMessage);
      setUser(null);
      setIsAuthenticated(false);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      await logoutApi();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      setIsAuthenticated(false);
      setIsLoading(false);
      window.location.href = '/login';
    }
  };

  const refresh = async (): Promise<void> => {
    try {
      await refreshToken();
    } catch (error: any) {
      // Only logout if we're actually authenticated
      // Don't logout on 401 if we're already logged out
      if (isAuthenticated && error.response?.status !== 401) {
        await logout();
      }
      throw error;
    }
  };

  const clearError = (): void => {
    setError(null);
  };

  const value: AuthContextType = {
    user,
    isAuthenticated,
    isLoading,
    error,
    tenantMembership,
    isLoadingMembership,
    login,
    logout,
    register: async () => {
      throw new Error('Register should be handled separately');
    },
    refreshToken: refresh,
    clearError,
    refreshMembership,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = React.useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;

