import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { API_URL } from '../config/api';

// Create Axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Important: Send cookies with requests
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor: Add auth token if available (for future use)
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Cookies are automatically sent with withCredentials: true
    // No need to manually add tokens here
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

/**
 * In-flight refresh, shared by every 401 that arrives while it runs.
 *
 * Without this, N concurrent requests failing with 401 fire N POST
 * /auth/refresh. Now that refresh tokens are rotated server-side, the first
 * response invalidates the token the others are still presenting, which the
 * backend treats as token reuse and logs the user out entirely.
 */
let refreshPromise: Promise<void> | null = null;

function refreshSession(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = apiClient
      .post('/auth/refresh')
      .then(() => undefined)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/** Send the user to login, preserving where they were headed. */
function redirectToLogin(): void {
  if (window.location.pathname.includes('/login')) {
    return;
  }
  const redirect = `${window.location.pathname}${window.location.search}`;
  window.location.href = `/login?redirect=${encodeURIComponent(redirect)}`;
}

// Response interceptor: Handle token refresh on 401
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // If error is 401 and we haven't retried yet
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;

      // Don't retry these endpoints - they should fail gracefully
      const skipRefreshEndpoints = ['/auth/refresh', '/auth/me', '/auth/login', '/auth/register'];
      const shouldSkipRefresh = skipRefreshEndpoints.some(endpoint =>
        originalRequest.url?.includes(endpoint)
      );

      if (shouldSkipRefresh) {
        // Just reject the error without redirecting
        return Promise.reject(error);
      }

      try {
        await refreshSession();
        return apiClient(originalRequest);
      } catch (refreshError) {
        redirectToLogin();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
