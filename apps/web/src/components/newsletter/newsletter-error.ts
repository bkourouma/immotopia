import { writeErrorMessage } from '../../utils/error-handler';
import { t } from '../../i18n/t';

/**
 * Message d'une action newsletter refusée ou en échec : le texte français de
 * l'API quand elle en donne un (« Ce template est utilisé par une campagne
 * planifiée. »), un texte clair pour un refus de droits, sinon `fallback`.
 * Jamais `error.message`, qui est le « Request failed with status code 400 »
 * d'Axios.
 */
export function newsletterErrorMessage(error: unknown, fallback: string = t('Une erreur est survenue.')): string {
  return writeErrorMessage(error, fallback, t("Vous n'avez pas les droits nécessaires pour cette action."));
}
