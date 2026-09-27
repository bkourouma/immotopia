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

/** Vrai si l'erreur est un 404 : l'objet n'existe pas, ou n'est pas à ce copropriétaire. */
export function isNotFound(error: unknown): boolean {
  return (error as { response?: { status?: number } } | null)?.response?.status === 404;
}
