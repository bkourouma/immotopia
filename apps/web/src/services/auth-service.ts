import apiClient from '../utils/api-client';
import { RegisterData, LoginCredentials, PasswordResetData } from '../types/auth-types';

/**
 * Register a new user
 */
export async function register(data: RegisterData): Promise<void> {
  const response = await apiClient.post('/auth/register', {
    email: data.email,
    password: data.password,
    fullName: data.fullName
  });
  return response.data;
}

/**
 * Verify email with token
 */
export async function verifyEmail(token: string): Promise<void> {
  const response = await apiClient.get('/auth/verify-email', {
    params: { token }
  });
  return response.data;
}

/**
 * Resend verification email
 */
export async function resendVerification(email: string): Promise<void> {
  const response = await apiClient.post('/auth/resend-verification', {
    email
  });
  return response.data;
}

/**
 * Login user
 */
export async function login(credentials: LoginCredentials): Promise<any> {
  const response = await apiClient.post('/auth/login', credentials);
  return response.data;
}

/**
 * Refresh access token
 */
export async function refreshToken(): Promise<void> {
  const response = await apiClient.post('/auth/refresh');
  return response.data;
}

/**
 * Get current user
 */
export async function getMe(): Promise<any> {
  const response = await apiClient.get('/auth/me');
  return response.data;
}

/**
 * Logout user
 */
export async function logout(): Promise<void> {
  const response = await apiClient.post('/auth/logout');
  return response.data;
}

/**
 * Forgot password
 */
export async function forgotPassword(email: string): Promise<void> {
  const response = await apiClient.post('/auth/forgot-password', { email });
  return response.data;
}

/**
 * Reset password
 */
export async function resetPassword(data: PasswordResetData): Promise<void> {
  const response = await apiClient.post('/auth/reset-password', data);
  return response.data;
}

/** Fournisseurs de connexion externes que le serveur sait réellement honorer. */
export interface AuthProviders {
  google: boolean;
}

/**
 * Interroge le serveur sur ses fournisseurs externes.
 *
 * L'écran de connexion affichait le bouton « Se connecter avec Google » sans
 * jamais vérifier que le serveur avait des identifiants OAuth. Sans eux, le
 * clic menait à une page d'erreur JSON brute. On demande donc avant d'afficher.
 */
export async function getAuthProviders(): Promise<AuthProviders> {
  const response = await apiClient.get('/auth/providers');
  return { google: Boolean(response.data?.data?.google) };
}
