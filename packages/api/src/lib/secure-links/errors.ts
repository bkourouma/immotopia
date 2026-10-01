import { NotFoundError } from '../../middleware/error-middleware';
import { t } from '../../i18n';

/**
 * Refus UNIFORME : jeton inconnu, expiré, révoqué, mauvaise portée, agence
 * suspendue, objet disparu ou corps malformé répondent exactement la même
 * erreur (même message, même statut) — aucun indice sur la cause.
 */
export function invalidSecureLinkError(): NotFoundError {
  return new NotFoundError(t('Lien invalide ou expiré.'));
}
