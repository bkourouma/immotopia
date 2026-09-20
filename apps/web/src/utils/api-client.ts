import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { API_URL } from '../config/api';
import i18next from '../i18n';

/**
 * Délai maximal d'une requête (REFONTE_UI_UX.md §8.4).
 *
 * Sans `timeout`, axios attend indéfiniment. Sur un réseau mobile dégradé — le
 * cas normal pour un collaborateur en tournée — une requête perdue laissait
 * l'écran sur son squelette, sans erreur ni sortie possible. 20 s est large
 * pour une réponse lente et assez court pour qu'un échec soit dit.
 */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Nouvelles tentatives : 2, avec attente croissante.
 *
 * Une coupure réseau de quelques secondes ne doit pas devenir une erreur
 * affichée. 1 s puis 3 s couvre un changement de cellule ou une reprise de
 * connexion, sans marteler une API déjà en difficulté.
 */
const RETRY_DELAYS_MS = [1_000, 3_000];

// Create Axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: REQUEST_TIMEOUT_MS,
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

    // Langue de l'interface, a chaque appel.
    //
    // C'est ce qui permet au serveur de renvoyer ses messages d'erreur dans la
    // bonne langue sans relire la preference en base a chaque requete : le
    // navigateur connait deja le choix de l'utilisateur, il le dit.
    //
    // Pose ici plutot que dans `headers` a la creation de l'instance : cette
    // valeur-la serait figee a la langue du premier rendu, et ne suivrait pas
    // un changement de langue en cours de session.
    config.headers.set('Accept-Language', i18next.resolvedLanguage ?? i18next.language);
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
  response => {
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // If error is 401 and we haven't retried yet
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;

      // Don't retry these endpoints - they should fail gracefully
      const skipRefreshEndpoints = ['/auth/refresh', '/auth/me', '/auth/login', '/auth/register'];
      const shouldSkipRefresh = skipRefreshEndpoints.some(endpoint => originalRequest.url?.includes(endpoint));

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

/**
 * Nouvelle tentative sur les seules lectures (REFONTE_UI_UX.md §8.4).
 *
 * La règle tient en une phrase : **on rejoue ce qui ne change rien**. Un `GET`
 * peut être répété sans conséquence ; un `POST` d'encaissement, non. Rejouer
 * une mutation dont la réponse s'est perdue crée un doublon de paiement — le
 * risque R6 du §11.1, classé critique. Le rejeu sûr des mutations viendra du
 * Lot 5, avec la file hors-ligne et sa clé d'idempotence.
 *
 * Ne sont rejouées que les pannes qui peuvent disparaître d'elles-mêmes :
 * absence de réponse (réseau coupé, délai dépassé) et erreurs serveur 5xx. Un
 * 4xx est une réponse, pas une panne : la rejouer à l'identique donnerait le
 * même résultat en trois fois plus de temps.
 *
 * Cet intercepteur est enregistré APRÈS celui du 401 : le rafraîchissement de
 * session garde la main sur les requêtes authentifiées, et un 401 n'arrive
 * jamais ici sous forme de panne réseau.
 */
interface RetriableConfig extends InternalAxiosRequestConfig {
  _retryCount?: number;
}

function isRetriable(error: AxiosError): boolean {
  const method = error.config?.method?.toLowerCase();
  if (method !== 'get') return false;

  // Requête annulée par l'appelant (AbortController) : ce n'est pas une panne,
  // c'est une décision. La rejouer irait contre l'intention.
  if (axios.isCancel(error) || error.code === 'ERR_CANCELED') return false;

  // Pas de réponse : réseau coupé ou délai dépassé.
  if (!error.response) return true;

  return error.response.status >= 500;
}

apiClient.interceptors.response.use(
  response => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;

    if (!config || !isRetriable(error)) {
      return Promise.reject(error);
    }

    const attempt = config._retryCount ?? 0;
    if (attempt >= RETRY_DELAYS_MS.length) {
      return Promise.reject(error);
    }

    config._retryCount = attempt + 1;
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    return apiClient(config);
  }
);

export default apiClient;
