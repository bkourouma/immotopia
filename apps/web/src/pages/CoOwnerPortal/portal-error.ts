import { t } from '../../i18n/t';

/**
 * Message d'un refus du portail copropriétaire.
 *
 * Un 403 dit quelque chose d'utile au copropriétaire — accès révoqué, aucun
 * lot ouvert, agence suspendue — et le serveur l'a déjà formulé dans la
 * langue de l'écran (`Accept-Language`) : on le montre tel quel. Toute autre
 * erreur retombe sur le message de l'écran.
 */
export function portalErrorMessage(error: unknown, fallback: string): string {
  const response = (error as { response?: { status?: number; data?: { message?: string } } } | null)?.response;
  if (response?.status === 403) {
    return (
      response.data?.message || t("Votre accès au portail copropriétaire n'est pas ouvert. Contactez votre agence.")
    );
  }
  return fallback;
}

/**
 * Vrai si l'identifiant demandé n'a rien donné : 404 (l'objet n'existe pas, ou
 * n'est pas à ce copropriétaire — le serveur ne distingue pas) ou 400
 * (identifiant mal formé, par exemple modifié à la main dans l'adresse).
 */
export function isNotFound(error: unknown): boolean {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return status === 404 || status === 400;
}

/** Vrai pour un 429 (quota de téléchargement de PDF du portail dépassé). */
export function isTooManyRequests(error: unknown): boolean {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return status === 429;
}

/**
 * Message d'un refus (403/429) sur une route téléchargée en blob.
 *
 * `apiClient` demande `responseType: 'blob'` : le corps d'erreur JSON du
 * serveur (`{ success:false, message }`, posé par `rate-limit-middleware.ts`
 * et par les gardes de portail) arrive alors comme un `Blob`, pas comme un
 * objet déjà analysé — `error.response.data?.message` serait toujours
 * `undefined`. On relit ce blob comme du texte, puis on le décode en JSON.
 */
export async function blobErrorMessage(error: unknown, fallback: string): Promise<string> {
  const response = (error as { response?: { data?: unknown } } | null)?.response;
  const data = response?.data;
  if (data instanceof Blob) {
    try {
      const text = await data.text();
      const parsed = JSON.parse(text) as { message?: string };
      if (parsed.message) return parsed.message;
    } catch {
      // Corps non JSON (page d'erreur générique, par exemple) : on retombe sur `fallback`.
    }
  }
  const message = (data as { message?: string } | undefined)?.message;
  return message || fallback;
}
