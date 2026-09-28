import { AxiosError } from 'axios';
import { t } from '../i18n/t';

/**
 * Message lisible pour l'échec d'un téléchargement de fichier
 * (`responseType: 'blob'`) : quittance, reçu, relevé de compte, impression
 * groupée, document du portail copropriétaire...
 *
 * Ces appels partageaient tous le même `catch { message.error(t('Téléchargement
 * impossible.')) }` : l'erreur n'était ni journalisée, ni qualifiée, et le
 * corps JSON d'une erreur serveur (« Document introuvable. », « Trop
 * d'impressions »...) n'était jamais lu — axios le renvoie comme un `Blob`
 * quand la requête demandait `responseType: 'blob'`, pas comme le JSON déjà
 * parsé que `error.response.data.message` donne sur une requête ordinaire.
 *
 * Usage : `catch (err) { message.error(await describeDownloadError(err)); }`
 */
export async function describeDownloadError(err: unknown): Promise<string> {
  logDownloadError(err);

  const body = await readDownloadErrorBody(err);
  const serverMessage = body?.message || body?.error;
  if (typeof serverMessage === 'string' && serverMessage.trim()) return serverMessage;

  const shape = errorShape(err);
  if (!shape) {
    return t('Téléchargement impossible.');
  }

  if (isTimeoutError(shape)) {
    return t('Le téléchargement a pris trop de temps. Vérifiez votre connexion puis réessayez.');
  }
  if (!shape.response) {
    // Requête annulée par l'appelant : pas une panne, rien à afficher comme une erreur.
    if (shape.code === 'ERR_CANCELED') return t('Téléchargement impossible.');
    return t('Connexion au serveur impossible. Vérifiez votre connexion puis réessayez.');
  }

  const status = shape.response.status;
  if (status === 404) return t('Document introuvable.');
  // Même texte que `utils/error-handler.ts` (`handleApiError`) : une seule
  // traduction pour « accès refusé », pas une variante par écran.
  if (status === 403) return t('Accès refusé. Permissions insuffisantes.');
  if (status !== undefined && status >= 500) {
    return t("Le serveur n'a pas pu produire le document. Réessayez dans un instant.");
  }

  return t('Téléchargement impossible.');
}

/**
 * Forme minimale d'une erreur axios (méthode, URL, code, réponse). Une vraie
 * `AxiosError` la porte ; un test qui rejette avec un objet simple
 * `{ response: { status, data } }` aussi — les deux sont acceptés plutôt que
 * de n'accepter qu'un `instanceof AxiosError` strict, plus fragile face à ces
 * deux origines légitimes.
 */
interface AxiosErrorShape {
  code?: string;
  config?: { method?: string; url?: string };
  response?: { status?: number; data?: unknown };
}

function errorShape(err: unknown): AxiosErrorShape | null {
  if (err instanceof AxiosError) return err;
  if (err && typeof err === 'object' && ('response' in err || 'code' in err)) {
    return err as AxiosErrorShape;
  }
  return null;
}

function isTimeoutError(shape: AxiosErrorShape): boolean {
  return shape.code === 'ECONNABORTED' || shape.code === 'ETIMEDOUT';
}

export interface DownloadErrorBody {
  message?: string;
  error?: string;
  code?: string;
  errors?: Array<{ field?: string; message?: string }>;
}

/**
 * Corps d'une réponse d'erreur : lu tel quel s'il est déjà un objet (un test
 * qui rejette avec `{ response: { data: { message } } }`, par exemple), ou
 * parsé depuis un `Blob` — ce que renvoie réellement axios en production pour
 * une requête `responseType: 'blob'`. `null` si absent, illisible, ou si
 * l'erreur ne ressemble à rien d'axios.
 *
 * EXPORTÉE : un écran qui distingue déjà des codes précis (ex.
 * `PrintReceiptsModal` avec `RATE_LIMITED`, `PRINT_IN_PROGRESS`, le champ
 * `pages` d'un 422) lit ce corps lui-même plutôt que de se contenter du
 * message générique de `describeDownloadError`.
 */
export async function readDownloadErrorBody(err: unknown): Promise<DownloadErrorBody | null> {
  const shape = errorShape(err);
  const data = shape?.response?.data as unknown;
  if (data === null || data === undefined) return null;

  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try {
      const text = await data.text();
      if (!text) return null;
      return (JSON.parse(text) as DownloadErrorBody) ?? null;
    } catch {
      // Le corps n'est pas du JSON (un vrai PDF partiel, par exemple) : rien à en tirer.
      return null;
    }
  }

  if (typeof data === 'object') return data as DownloadErrorBody;
  return null;
}

/**
 * Journal technique, sans donnée personnelle : méthode, URL relative (jamais
 * de paramètre de requête, qui peut porter un identifiant), code et statut.
 *
 * EXPORTÉE : un écran qui construit son propre message (au lieu d'appeler
 * `describeDownloadError`, ex. `PrintReceiptsModal` et ses codes 429/422
 * spécifiques) journalise quand même par ici, pour garder un seul format.
 */
export function logDownloadError(err: unknown): void {
  const shape = errorShape(err);
  if (shape) {
    console.error('[téléchargement]', {
      method: shape.config?.method,
      url: shape.config?.url,
      code: shape.code,
      status: shape.response?.status
    });
    return;
  }
  console.error('[téléchargement]', err instanceof Error ? err.message : 'erreur inconnue');
}
