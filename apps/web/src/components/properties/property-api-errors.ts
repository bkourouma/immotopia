/**
 * Lecture d'un refus de l'API sur l'enregistrement ou la publication d'un bien.
 *
 * Le serveur répond `{ message, errors: [{ field, message }] }`. Le formulaire
 * lisait `response.data.error`, qui n'existe pas : l'écran n'affichait que
 * « Erreur lors de l'enregistrement », sans désigner le champ fautif
 * (BUG-2026-09-28-013).
 */
import { t } from '../../i18n/t';

export interface ApiFieldError {
  field: string;
  message: string;
}

interface ApiErrorBody {
  message?: string;
  /** Ancien format de certaines routes : le texte vient dans `error`. */
  error?: string;
  errors?: Array<{ field?: string; message?: string }>;
}

/** Libellés visibles des champs du formulaire, pour nommer le champ fautif. */
const FIELD_LABELS: Record<string, () => string> = {
  title: () => t('Titre du bien'),
  description: () => t('Description'),
  address: () => t('Adresse'),
  locationZone: () => t('Quartier/Zone (optionnel)'),
  latitude: () => t('Latitude'),
  longitude: () => t('Longitude'),
  ownerUserId: () => t('Propriétaire'),
  status: () => t('Statut'),
  availability: () => t('Disponibilité'),
  surfaceArea: () => t('Surface principale (m²)'),
  surfaceUseful: () => t('Surface utile (m²)'),
  surfaceTerrain: () => t('Surface terrain (m²)'),
  rooms: () => t('Nombre de pièces'),
  bedrooms: () => t('Chambres'),
  bathrooms: () => t('Salles de bain / WC'),
  furnishingStatus: () => t('Meublé')
};

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field]?.() ?? field;
}

/** Les erreurs par champ d'une réponse d'API (liste vide si elle n'en porte pas). */
export function apiFieldErrors(error: unknown): ApiFieldError[] {
  const body = (error as { response?: { data?: ApiErrorBody } })?.response?.data;
  if (!body || !Array.isArray(body.errors)) return [];
  return body.errors
    .filter(entry => entry && entry.field && entry.message)
    .map(entry => ({ field: String(entry.field), message: String(entry.message) }));
}

/** Code HTTP de la réponse de l'API, s'il y en a une. */
export function apiErrorStatus(error: unknown): number | undefined {
  const status = (error as { response?: { status?: unknown } })?.response?.status;
  return typeof status === 'number' ? status : undefined;
}

/** Vrai quand la requête n'a pas atteint le serveur (réseau coupé, délai dépassé). */
function isNetworkFailure(error: unknown): boolean {
  const e = error as { code?: string; message?: string; response?: unknown };
  if (e?.response) return false;
  return e?.code === 'ERR_NETWORK' || e?.code === 'ECONNABORTED' || e?.message === 'Network Error';
}

/**
 * Un message de serveur lisible par un agent immobilier, et non un code, une
 * trace ou un texte de bibliothèque (« Request failed with status code 500 »,
 * `VALIDATION_ERROR`, erreur Prisma…).
 */
function isReadableMessage(message: string): boolean {
  const text = message.trim();
  if (text.length < 4 || text.length > 300) return false;
  if (/^[A-Z0-9_.:-]+$/.test(text)) return false;
  return !/status code|prisma|stack|undefined|\bnull\b|ECONN|ETIMEDOUT|Unexpected token|Cannot read|\bat \S+\.(ts|js)/i.test(
    text
  );
}

/**
 * La phrase métier qui correspond à un échec de communication ou à un code
 * HTTP sans message exploitable. Renvoie `undefined` quand rien ne s'applique.
 */
function messageParStatut(error: unknown): string | undefined {
  if (isNetworkFailure(error)) {
    return t('Connexion impossible. Vérifiez votre réseau, puis réessayez.');
  }
  switch (apiErrorStatus(error)) {
    case 401:
      return t('Votre session a expiré. Reconnectez-vous, puis réessayez.');
    case 403:
      return t("Vous n'avez pas le droit d'effectuer cette action.");
    case 404:
      return t("Cet élément n'existe plus ou a été déplacé. Actualisez la page.");
    case 408:
    case 504:
      return t('Le serveur met trop de temps à répondre. Réessayez dans un instant.');
    case 413:
      return t('Ce fichier est trop volumineux pour être envoyé.');
    case 415:
      return t("Ce format de fichier n'est pas accepté.");
    case 429:
      return t('Trop de demandes en peu de temps. Patientez quelques secondes, puis réessayez.');
    case 500:
    case 502:
    case 503:
      return t('Le serveur a rencontré un problème. Réessayez dans un instant.');
    default:
      return undefined;
  }
}

/**
 * Texte d'erreur à afficher : un champ par ligne (« Meublé : … ») quand l'API
 * en désigne, sinon son message s'il est lisible, sinon une phrase adaptée au
 * code de réponse (réseau coupé, droit manquant, fichier trop lourd…), sinon le
 * repli fourni. Jamais de code technique brut comme message principal.
 */
export function apiErrorText(error: unknown, fallback: string): string {
  const fields = apiFieldErrors(error);
  if (fields.length > 0) {
    return fields.map(entry => `${fieldLabel(entry.field)} : ${entry.message}`).join('\n');
  }
  const body = (error as { response?: { data?: ApiErrorBody } })?.response?.data;
  if (typeof body?.message === 'string' && isReadableMessage(body.message)) return body.message;
  if (typeof body?.error === 'string' && isReadableMessage(body.error)) return body.error;
  return messageParStatut(error) ?? fallback;
}
