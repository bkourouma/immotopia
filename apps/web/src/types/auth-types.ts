// User type (matches backend UserPublic)
export interface User {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  globalRole: 'SUPER_ADMIN' | 'USER';
  emailVerified: boolean;
  isActive: boolean;
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

// Auth context state
export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  tenantMembership: TenantMembership | null;
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

