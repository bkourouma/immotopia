import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { login as loginApi, logout as logoutApi, getMe, refreshToken } from '../services/auth-service';
import { User, LoginCredentials, AuthContextType, TenantMembership, TenantClient } from '../types/auth-types';
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
  const [tenantClient, setTenantClient] = useState<TenantClient | null>(null);
  const [isLoadingMembership, setIsLoadingMembership] = useState(false);

  // Fetch tenant membership and client status
  const refreshMembership = async (): Promise<void> => {
    if (!user || user.globalRole === 'SUPER_ADMIN') {
      setTenantMembership(null);
      setTenantClient(null);
      return;
    }

    setIsLoadingMembership(true);
    try {
      const response = await apiClient.get('/tenants/my-memberships');
      if (response.data.success && response.data.data) {
        const memberships = response.data.data;
        const asClient = Array.isArray(memberships.asClient) ? memberships.asClient : [];
        const asMember = Array.isArray(memberships.asMember) ? memberships.asMember : [];

        // Tenant clients: prioritize OWNER/RENTER profiles for portal routing.
        const prioritizedClient =
          asClient.find((client: any) => client?.clientType === 'OWNER' || client?.clientType === 'RENTER') ||
          asClient[0];

        if (prioritizedClient?.tenant?.id && prioritizedClient?.clientType) {
          setTenantClient({
            id: prioritizedClient.id,
            tenantId: prioritizedClient.tenant.id,
            clientType: prioritizedClient.clientType as 'OWNER' | 'RENTER' | 'BUYER' | 'CO_OWNER',
          });
        } else {
          setTenantClient(null);
        }

        // Tenant collaborators: prefer ACTIVE membership first.
        const prioritizedMembership =
          asMember.find((membership: any) => membership?.status === 'ACTIVE') || asMember[0];

        if (prioritizedMembership?.tenant?.id) {
          setTenantMembership({
            id: prioritizedMembership.id,
            tenantId: prioritizedMembership.tenant.id,
            tenant: {
              id: prioritizedMembership.tenant.id,
              name: prioritizedMembership.tenant.name,
              slug: prioritizedMembership.tenant.slug || prioritizedMembership.tenant.id,
            },
            status: prioritizedMembership.status,
          });
        } else {
          setTenantMembership(null);
        }
      } else {
        setTenantMembership(null);
        setTenantClient(null);
      }
    } catch (error: any) {
      console.error('Error fetching membership:', error);
      setTenantMembership(null);
      setTenantClient(null);
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
      setTenantClient(null);
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
    tenantClient,
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
