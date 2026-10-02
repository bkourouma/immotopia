// User type (matches backend UserPublic)
export interface User {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  globalRole: 'SUPER_ADMIN' | 'USER';
  emailVerified: boolean;
  isActive: boolean;
  /**
   * Langue choisie pour l'interface et les e-mails : 'fr', 'en' ou 'ar'.
   * `null` veut dire « jamais choisie » — c'est alors le navigateur qui
   * tranche, et rien n'est imposé a un utilisateur arabophone.
   */
  preferredLanguage: string | null;
  createdAt: string;
  updatedAt: string;
}

// Login credentials
export interface LoginCredentials {
  email: string;
  password: string;
}

// Registration data
export interface RegisterData {
  email: string;
  password: string;
  confirmPassword: string; // Contrôlé aussi côté API (registerSchema) : à envoyer
  fullName: string;
}

// Password reset data
export interface PasswordResetData {
  token: string;
  newPassword: string;
  confirmPassword: string;
}

// Forgot password data
export interface ForgotPasswordData {
  email: string;
}

// Tenant membership
export interface TenantMembership {
  id: string;
  tenantId: string;
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  status: string;
}

// Tenant client (for renters/owners)
export interface TenantClient {
  id: string;
  tenantId: string;
  clientType: 'OWNER' | 'RENTER' | 'BUYER' | 'CO_OWNER';
  /**
   * Absent dans les tout premiers appelants (le nom/slug n'était pas requis) ;
   * présent depuis le lot F, où le sélecteur d'agence doit afficher un nom.
   */
  tenant?: {
    id: string;
    name: string;
    slug: string;
  };
}

/**
 * Une agence sélectionnable dans `<TenantSwitcher>` : soit une agence où
 * l'utilisateur collabore (membre ACTIVE), soit une agence dont il est client
 * (propriétaire/locataire). Les deux ne se mélangent jamais dans une même
 * liste — le persona (collaborateur vs. portail) ne change pas en cours de
 * session, seule l'agence courante à l'intérieur du persona change.
 */
export interface AvailableTenant {
  id: string;
  name: string;
  slug: string;
}

// Auth context state
export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  tenantMembership: TenantMembership | null;
  tenantClient: TenantClient | null;
  isLoadingMembership: boolean;
  /** Les agences éligibles au sélecteur — vide ou à un élément : aucun sélecteur. */
  availableTenants: AvailableTenant[];
  /** `tenantMembership?.tenantId ?? tenantClient?.tenantId ?? null`. */
  activeTenantId: string | null;
}

// Auth context actions
export interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  refreshToken: () => Promise<void>;
  clearError: () => void;
  refreshMembership: () => Promise<void>;
  /**
   * Change l'agence courante parmi `availableTenants` : met à jour
   * `tenantMembership`/`tenantClient` depuis la liste déjà chargée (pas de
   * nouvel appel réseau) et mémorise le choix dans `localStorage`. N'appelle
   * ni `queryClient.clear()` ni la navigation — c'est `<TenantSwitcher>` qui
   * s'en charge, car `AuthContext` n'a pas connaissance de React Query.
   */
  switchTenant: (tenantId: string) => void;
}
