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
  confirmPassword?: string; // Frontend validation only
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
}

// Auth context actions
export interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  refreshToken: () => Promise<void>;
  clearError: () => void;
  refreshMembership: () => Promise<void>;
}
