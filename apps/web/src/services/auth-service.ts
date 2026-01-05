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

