import React, { createContext, useState, useEffect, useRef, ReactNode } from 'react';
import { login as loginApi, logout as logoutApi, getMe } from '../services/auth-service';
import { User, LoginCredentials, AuthContextType, TenantMembership, TenantClient, AvailableTenant } from '../types/auth-types';
import apiClient, { refreshSession } from '../utils/api-client';
import { getStoredActiveTenantId, setStoredActiveTenantId } from '../utils/active-tenant';
import { t } from '../i18n/t';

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
  const [availableTenants, setAvailableTenants] = useState<AvailableTenant[]>([]);

  /**
   * Copie brute de la dernière réponse `/tenants/my-memberships`, gardée pour
   * que `switchTenant` change d'agence sans nouvel appel réseau : c'est un
   * changement de sélection parmi des données déjà en main, pas une
   * resynchronisation.
   */
  const rawMembershipsRef = useRef<{ asMember: any[]; asClient: any[] }>({ asMember: [], asClient: [] });

  /**
   * Référence vers `utils/tenant-selection.ts` une fois chargé — posée par
   * `refreshMembership`, relue par `switchTenant` pour rester synchrone : pas
   * de second `import()` à attendre. `switchTenant` n'est jamais proposé à
   * l'utilisateur avant qu'un premier `refreshMembership` ait chargé ce
   * module — sans lui, `availableTenants` resterait vide et `<TenantSwitcher>`
   * ne rendrait rien.
   */
  const tenantSelectionRef = useRef<typeof import('../utils/tenant-selection') | null>(null);

  // Fetch tenant membership and client status
  const refreshMembership = async (): Promise<void> => {
    if (!user || user.globalRole === 'SUPER_ADMIN') {
      setTenantMembership(null);
      setTenantClient(null);
      setAvailableTenants([]);
      rawMembershipsRef.current = { asMember: [], asClient: [] };
      return;
    }

    setIsLoadingMembership(true);
    try {
      const response = await apiClient.get('/tenants/my-memberships');
      if (response.data.success && response.data.data) {
        const memberships = response.data.data;
        const asClient = Array.isArray(memberships.asClient) ? memberships.asClient : [];
        const asMember = Array.isArray(memberships.asMember) ? memberships.asMember : [];
        rawMembershipsRef.current = { asMember, asClient };

        // Agence mémorisée par un geste explicite du sélecteur (voir
        // `utils/active-tenant.ts`) : elle prime sur « la première active »,
        // tant qu'elle désigne encore une agence à laquelle l'utilisateur
        // appartient toujours.
        const storedTenantId = getStoredActiveTenantId();

        // La sélection (agence courante, liste du sélecteur) est un module à
        // part, chargé ici à la demande : elle ne sert qu'après cette réponse
        // réseau déjà attendue, elle n'a donc rien à faire dans le chunk
        // d'entrée (REFONTE_UI_UX.md §8.1) — voir `utils/tenant-selection.ts`.
        const tenantSelection = await import('../utils/tenant-selection');
        tenantSelectionRef.current = tenantSelection;
        const selection = tenantSelection.selectTenants(asMember, asClient, storedTenantId);
        setTenantClient(selection.tenantClient);
        setTenantMembership(selection.tenantMembership);
        setAvailableTenants(selection.availableTenants);
      } else {
        setTenantMembership(null);
        setTenantClient(null);
        setAvailableTenants([]);
        rawMembershipsRef.current = { asMember: [], asClient: [] };
      }
    } catch (error: any) {
      console.error('Error fetching membership:', error);
      setTenantMembership(null);
      setTenantClient(null);
      setAvailableTenants([]);
      rawMembershipsRef.current = { asMember: [], asClient: [] };
    } finally {
      setIsLoadingMembership(false);
    }
  };

  /**
   * Change l'agence courante parmi `availableTenants`, depuis les données
   * déjà chargées par `refreshMembership` — pas de nouvel appel réseau.
   * `<TenantSwitcher>` enchaîne avec `queryClient.clear()` et une navigation
   * vers le tableau de bord ; `AuthContext` n'a pas connaissance de React
   * Query et ne s'en charge pas.
   */
  const switchTenant = (tenantId: string): void => {
    const tenantSelection = tenantSelectionRef.current;
    if (!tenantSelection) return;
    const { asMember, asClient } = rawMembershipsRef.current;

    const membership = asMember.find((m: any) => m?.status === 'ACTIVE' && m?.tenant?.id === tenantId);
    if (membership) {
      setStoredActiveTenantId(tenantId);
      setTenantMembership(tenantSelection.buildTenantMembership(membership));
      return;
    }

    const client = asClient.find(
      (c: any) =>
        c?.tenant?.id === tenantId &&
        (c?.clientType === 'OWNER' || c?.clientType === 'RENTER' || c?.clientType === 'CO_OWNER')
    );
    if (client) {
      setStoredActiveTenantId(tenantId);
      setTenantClient(tenantSelection.buildTenantClient(client));
    }
  };

  // Check authentication on mount
  useEffect(() => {
    /**
     * UN 401 SUR `/auth/me` NE VEUT PAS DIRE « PAS CONNECTÉ ».
     *
     * Le cookie d'accès vit quinze minutes, celui de rafraîchissement sept
     * jours. Le minuteur qui renouvelle le premier toutes les quatorze
     * minutes meurt avec la page : qui ferme son onglet et revient une demi-
     * heure plus tard a donc un cookie d'accès périmé — le navigateur ne
     * l'envoie plus du tout — et un cookie de rafraîchissement parfaitement
     * valable.
     *
     * Toutes les autres requêtes s'en tirent : l'intercepteur d'`api-client`
     * rattrape leur 401, rafraîchit la session et les rejoue. `/auth/me` en
     * est exclue, et c'est délibéré — un visiteur anonyme sur l'écran de
     * connexion n'a rien à rafraîchir, et une boucle serait pire. Mais
     * l'exclusion valait aussi pour le cas d'à côté : la session vivait, et
     * l'écran renvoyait quand même vers la connexion. « Se souvenir de moi »
     * ne tenait pas quinze minutes.
     *
     * On tente donc UN rafraîchissement, une seule fois, avant de conclure.
     * S'il échoue, c'est qu'il n'y avait vraiment plus de session, et on
     * conclut comme avant. Le seul coût est une requête de plus pour le
     * visiteur anonyme, sur le seul écran de connexion.
     *
     * Le geste est posé ICI plutôt que dans l'intercepteur : y ouvrir
     * `/auth/me` exposerait toutes ses autres utilisations à une boucle,
     * alors que ce démarrage-ci sait qu'il ne s'exécute qu'une fois.
     *
     * Il passe par `refreshSession` d'`api-client`, et non par le service —
     * ce fichier ne doit plus jamais appeler `auth-service.refreshToken`.
     * Les jetons sont rotés côté serveur : deux rafraîchissements concurrents
     * présentent le même jeton, le premier le fait tourner, et le second
     * ressemble alors à un rejeu de jeton volé, que le serveur punit d'une
     * déconnexion complète. La trace réseau du 20 septembre 2026 a montré ce
     * second appel partir en 401, à côté du premier en 200.
     */
    const checkAuth = async () => {
      const lire = async (): Promise<void> => {
        const response = await getMe();
        if (response.success && response.user) {
          setUser(response.user);
          setIsAuthenticated(true);
          return;
        }
        setUser(null);
        setIsAuthenticated(false);
      };

      try {
        await lire();
      } catch (error: any) {
        const jetonExpire = error.response?.status === 401;

        // Une seule tentative, et elle ne peut pas boucler : `checkAuth` ne
        // s'exécute qu'au montage, et `/auth/refresh` est elle-même exclue
        // du rattrapage de l'intercepteur.
        if (jetonExpire) {
          try {
            await refreshSession();
            await lire();
            return;
          } catch {
            // Le rafraîchissement a échoué : il n'y avait pas de session à
            // reprendre. On retombe sur le comportement d'avant, qui est le
            // bon dans ce cas — et on ne journalise rien, c'est la situation
            // ordinaire d'un visiteur qui arrive sans être connecté.
          }
        } else {
          console.error('Auth check error:', error);
        }

        setUser(null);
        setIsAuthenticated(false);
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

    const interval = setInterval(
      async () => {
        try {
          await refreshSession();
        } catch (error: any) {
          // Only logout if refresh fails and we're still authenticated
          // Don't logout if it's just a 401 (already logged out)
          if (isAuthenticated && error.response?.status !== 401) {
            await logout();
          }
        }
      },
      14 * 60 * 1000
    ); // Refresh every 14 minutes (before 15 min expiry)

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
        throw new Error(response.message || t('Erreur de connexion'));
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || t('Erreur de connexion');
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
      await refreshSession();
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
    availableTenants,
    activeTenantId: tenantMembership?.tenantId ?? tenantClient?.tenantId ?? null,
    login,
    logout,
    register: async () => {
      throw new Error(t('Register should be handled separately'));
    },
    refreshToken: refresh,
    clearError,
    refreshMembership,
    switchTenant
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
