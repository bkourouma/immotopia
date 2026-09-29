import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { API_URL } from '../config/api';
import i18next from '../i18n';
import { t } from '../i18n/t';
import { getStoredActiveTenantId } from './active-tenant';
import { parseSseStream } from './sse-parser';
import { TENANT_SUSPENDED_EVENT } from './tenant-events';

/**
 * Délai maximal d'une requête JSON (REFONTE_UI_UX.md §8.4).
 *
 * Sans `timeout`, axios attend indéfiniment. Sur un réseau mobile dégradé — le
 * cas normal pour un collaborateur en tournée — une requête perdue laissait
 * l'écran sur son squelette, sans erreur ni sortie possible. 20 s est large
 * pour une réponse lente et assez court pour qu'un échec soit dit.
 *
 * EXPORTÉE pour les tests ; ne pas la lire ailleurs comme « le » délai de
 * l'application, `FILE_DOWNLOAD_TIMEOUT_MS` s'applique aux téléchargements.
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;

/**
 * Délai maximal d'un téléchargement de fichier (`responseType: 'blob'`).
 *
 * Une quittance PDF avec des images de marque en pleine résolution (jusqu'à
 * 3000 x 3000 px chacune) peut prendre plusieurs secondes à générer côté
 * serveur avant le premier octet de réponse, et le transfert lui-même est
 * plus lourd qu'une réponse JSON. Sur le réseau dégradé d'un collaborateur ou
 * d'un copropriétaire en tournée, 20 s (le délai des requêtes JSON) coupait la
 * requête avant que le PDF n'ait fini d'être produit — l'anomalie « Téléchargement
 * impossible » sans erreur exploitable. 120 s laisse le temps à une génération
 * lente d'aboutir, sans attendre indéfiniment pour autant.
 */
export const FILE_DOWNLOAD_TIMEOUT_MS = 120_000;

/** Un téléchargement de fichier privé (quittance, reçu, relevé...), jamais rejoué à l'identique sur simple expiration. */
function isFileDownload(config: { responseType?: string } | undefined): boolean {
  return config?.responseType === 'blob';
}

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
  // Pas de délai fixe ici : posé ci-dessous selon le type de requête (voir
  // `DEFAULT_REQUEST_TIMEOUT_MS` / `FILE_DOWNLOAD_TIMEOUT_MS`), pour qu'un
  // téléchargement de fichier ait plus de temps qu'une requête JSON.
  withCredentials: true, // Important: Send cookies with requests
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor: Add auth token if available (for future use)
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Délai selon le type de requête, sauf si l'appelant en a explicitement
    // posé un (ex. un sondage court avec son propre `timeout`). Un
    // téléchargement de fichier (`responseType: 'blob'`) reçoit le délai
    // large : voir `FILE_DOWNLOAD_TIMEOUT_MS`.
    if (!config.timeout) {
      config.timeout = isFileDownload(config) ? FILE_DOWNLOAD_TIMEOUT_MS : DEFAULT_REQUEST_TIMEOUT_MS;
    }

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

    // Portail (locataire/propriétaire) : un client rattaché à plusieurs
    // agences dit laquelle. La clé n'existe en stockage que si
    // `<TenantSwitcher>` a servi au moins une fois (voir `active-tenant.ts`) —
    // un client d'une seule agence n'envoie donc jamais cet en-tête, ce que
    // l'API n'exige d'ailleurs que pour trancher une ambiguïté.
    if (config.url?.includes('/portal/')) {
      const activeTenantId = getStoredActiveTenantId();
      if (activeTenantId) {
        config.headers.set('X-Portal-Tenant-Id', activeTenantId);
      }
    }

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

/**
 * EXPORTÉE, et c'est le seul rafraîchissement que l'application doit appeler.
 *
 * `auth-service.refreshToken()` poste directement sur `/auth/refresh` et ne
 * partage rien : deux appels simultanés — le minuteur de quatorze minutes et
 * la reprise de session au démarrage, par exemple — présentent le même jeton,
 * le serveur en rote un à la première réponse, et la seconde ressemble alors
 * à un rejeu de jeton vole. Le serveur deconnecte, entierement.
 *
 * Passer par ici fait converger tous les appelants sur la même promesse.
 */
export function refreshSession(): Promise<void> {
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

/**
 * Rend lisible le refus d'une requête, avant que l'écran ne l'affiche.
 *
 * Les écrans montrent tous `error.response.data.message` dans leur
 * notification d'échec. Sur une erreur de validation, le serveur y met une
 * phrase générique — « The data supplied is invalid. » — et range le vrai
 * motif dans `errors[]`, que personne ne lit. L'utilisateur voit donc passer
 * un message qui ne dit rien, et croit volontiers que son geste a abouti.
 *
 * C'est ce qui s'est joué le 20 septembre 2026 sur l'annulation d'un bon de
 * commande : le champ `reason` manquait, le serveur répondait
 * `errors: [{ field: 'reason', message: 'Required' }]`, et l'écran affichait
 * la phrase creuse. Le bon restait émis et continuait d'engager son chantier.
 *
 * Réécrire le message ici profite à **tous** les écrans d'un coup, sans
 * toucher à leurs dizaines de blocs de capture. On n'efface jamais le détail
 * du serveur : on le remonte à la place de la phrase qui le cachait.
 */
function detaillerErreurDeValidation(error: AxiosError): void {
  const corps = error.response?.data as
    { message?: string; errors?: Array<{ field?: string; message?: string }> } | undefined;

  if (!corps || !Array.isArray(corps.errors) || corps.errors.length === 0) {
    return;
  }

  const details = corps.errors
    .map(detail => [detail.field, detail.message].filter(Boolean).join(' : '))
    .filter(Boolean);

  if (details.length > 0) {
    corps.message = `${corps.message ?? t('Requête refusée')} (${details.join(' ; ')})`;
  }
}

// Response interceptor: Handle token refresh on 401
apiClient.interceptors.response.use(
  response => {
    return response;
  },
  async (error: AxiosError) => {
    detaillerErreurDeValidation(error);
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

/** Délai dépassé : `ECONNABORTED` (axios), parfois `ETIMEDOUT` selon l'adaptateur. */
function isTimeoutError(error: AxiosError): boolean {
  return error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
}

function isRetriable(error: AxiosError): boolean {
  const method = error.config?.method?.toLowerCase();
  if (method !== 'get') return false;

  // Requête annulée par l'appelant (AbortController) : ce n'est pas une panne,
  // c'est une décision. La rejouer irait contre l'intention.
  if (axios.isCancel(error) || error.code === 'ERR_CANCELED') return false;

  // Téléchargement de fichier qui a expiré : le rejouer retélécharge le même
  // gros fichier et ne fait que repousser l'échec de 120 s de plus — jusqu'à
  // trois fois avec les tentatives normales. Un délai dépassé sur un
  // téléchargement n'est donc JAMAIS rejoué automatiquement ; l'appelant
  // affiche l'erreur (voir `download-error.ts`) et laisse la main à
  // l'utilisateur pour réessayer.
  if (isFileDownload(error.config) && isTimeoutError(error)) return false;

  // Pas de réponse : réseau coupé ou délai dépassé (hors téléchargement, cas
  // écarté ci-dessus).
  if (!error.response) return true;

  return error.response.status >= 500;
}

/**
 * Nombre de rejeux autorisés pour cette requête : 2 pour une requête JSON, 1
 * seul pour un téléchargement de fichier. Un fichier déjà volumineux
 * (quittance avec images de marque) coûte cher à retélécharger ; une coupure
 * réseau franche (pas une expiration, écartée par `isRetriable`) mérite un
 * second essai, pas deux.
 */
function maxRetries(config: RetriableConfig): number {
  return isFileDownload(config) ? 1 : RETRY_DELAYS_MS.length;
}

apiClient.interceptors.response.use(
  response => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;

    if (!config || !isRetriable(error)) {
      return Promise.reject(error);
    }

    const attempt = config._retryCount ?? 0;
    if (attempt >= maxRetries(config)) {
      return Promise.reject(error);
    }

    config._retryCount = attempt + 1;
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    return apiClient(config);
  }
);

// Agence suspendue : toute route d'agence ou de portail renvoie alors 403
// avec `code: 'TENANT_SUSPENDED'`. On le transforme en évènement DOM plutôt
// que de le traiter ici — cet intercepteur ne sait rien afficher, et
// plusieurs écrans (agence, portails) ont besoin du même signal.
//
// La déduction de l'agence (`deduireTenantIdSuspendu`) vit dans un module à
// part, chargé ici à la demande : un 403 `TENANT_SUSPENDED` est une réponse
// d'erreur rare, elle n'a donc rien à faire dans le chunk d'entrée
// (REFONTE_UI_UX.md §8.1). L'intercepteur reste `async` : axios attend la
// promesse qu'il renvoie avant de considérer la requête réglée, l'évènement
// part donc bien avant que l'appelant ne voie le rejet.
apiClient.interceptors.response.use(
  response => response,
  async (error: AxiosError) => {
    const body = error.response?.data as { code?: string } | undefined;
    if (error.response?.status === 403 && body?.code === 'TENANT_SUSPENDED' && typeof window !== 'undefined') {
      const { deduireTenantIdSuspendu } = await import('./tenant-suspended-detection');
      const tenantId = deduireTenantIdSuspendu(error.config as InternalAxiosRequestConfig | undefined);
      window.dispatchEvent(new CustomEvent(TENANT_SUSPENDED_EVENT, { detail: { tenantId } }));
    }
    return Promise.reject(error);
  }
);

/** Erreur levée par `postEventStream` avant l'ouverture du flux. */
export interface EventStreamError {
  status: number;
  code: string;
  message: string;
}

export interface EventStreamOptions {
  signal?: AbortSignal;
  onEvent(e: { event: string; data: string }): void;
}

/**
 * POST dont la réponse est un flux `text/event-stream` (ImmoCopilot).
 *
 * axios ne sait pas lire un corps en flux dans le navigateur : on passe par
 * `fetch`, en reprenant à la main les trois mécanismes de cette instance —
 * cookies (`credentials: 'include'`), langue de l'interface, et
 * rafraîchissement de session sur 401 (un seul, via `refreshSession`, puis une
 * seule nouvelle tentative). Un 403 `TENANT_SUSPENDED` déclenche le même
 * évènement DOM que l'intercepteur axios.
 *
 * Lève `{ status, code, message }` si la réponse n'est pas un succès. Les
 * erreurs survenues après l'ouverture du flux arrivent, elles, en évènement
 * `error` (voir `sse-parser.ts`).
 */
export async function postEventStream(path: string, body: unknown, opts: EventStreamOptions): Promise<void> {
  const send = () =>
    fetch(`${API_URL}${path}`, {
      method: 'POST',
      credentials: 'include',
      signal: opts.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'Accept-Language': i18next.resolvedLanguage ?? i18next.language
      },
      body: JSON.stringify(body)
    });

  let response = await send();

  if (response.status === 401) {
    try {
      await refreshSession();
    } catch {
      redirectToLogin();
      throw { status: 401, code: 'UNAUTHORIZED', message: t('Session expirée') } satisfies EventStreamError;
    }
    response = await send();
  }

  if (!response.ok) {
    let data: { code?: string; message?: string } | undefined;
    try {
      data = (await response.json()) as { code?: string; message?: string };
    } catch {
      data = undefined;
    }
    if (response.status === 403 && data?.code === 'TENANT_SUSPENDED' && typeof window !== 'undefined') {
      const { deduireTenantIdSuspendu } = await import('./tenant-suspended-detection');
      const tenantId = deduireTenantIdSuspendu({ url: path } as InternalAxiosRequestConfig);
      window.dispatchEvent(new CustomEvent(TENANT_SUSPENDED_EVENT, { detail: { tenantId } }));
    }
    throw {
      status: response.status,
      code: data?.code ?? 'HTTP_ERROR',
      message: data?.message ?? t('Requête refusée')
    } satisfies EventStreamError;
  }

  if (!response.body) {
    throw { status: response.status, code: 'NO_STREAM', message: t('Requête refusée') } satisfies EventStreamError;
  }

  await parseSseStream(response.body, opts.onEvent);
}

export default apiClient;
