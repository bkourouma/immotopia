import { GlobalRole, User } from '@prisma/client';

export type { User, GlobalRole };

// User without sensitive data
export interface UserPublic {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  globalRole: GlobalRole;
  emailVerified: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Registration request
export interface RegisterRequest {
  email: string;
  password: string;
  fullName?: string;
}

// Login request
export interface LoginRequest {
  email: string;
  password: string;
}

// JWT payload
export interface JWTPayload {
  userId: string;
  email: string;
  globalRole: GlobalRole;
  tenantId?: string; // Optional context
  iat?: number;
  exp?: number;
}

// Password reset request
export interface PasswordResetRequest {
  token: string;
  newPassword: string;
  confirmPassword?: string;
}

// Forgot password request
export interface ForgotPasswordRequest {
  email: string;
}

// Refresh token data
export interface RefreshTokenData {
  token: string;
  userId: string;
  expiresAt: Date;
  deviceInfo?: string;
}
