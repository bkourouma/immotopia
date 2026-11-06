import { t } from '../../../i18n/t';

/**
 * Message d'une erreur d'API pour les écrans de relevés. Un refus (403) affiche
 * le texte traduit renvoyé par l'API — `message`, jamais le libellé technique
 * `error` (« Forbidden ») — ou, à défaut, une phrase claire.
 */
export function statementApiErrorMessage(error: unknown, fallback: string): string {
  const err = error as { response?: { status?: number; data?: { message?: string; error?: string } } };
  const data = err?.response?.data;
  if (err?.response?.status === 403) {
    return data?.message || t("Vous n'avez pas accès aux relevés de gérance.");
  }
  return data?.message || data?.error || fallback;
}
