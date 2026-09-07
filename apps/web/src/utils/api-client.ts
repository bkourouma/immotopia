import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8001/api';

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

// Response interceptor: Handle token refresh on 401
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // If error is 401 and we haven't retried yet
    if (error.response?.status === 401 && !originalRequest._retry) {
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
        // Attempt to refresh token
        await apiClient.post('/auth/refresh');

        // Retry original request
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Refresh failed, only redirect if not already on login page
        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;

