import type {
  ExternalAccessEmailResult,
  ExternalAccessSection,
  ExternalAccessStatus,
  ExternalAccessType
} from '../../../types/external-access';
import { t } from '../../../i18n/t';

/**
 * Libellés métier des accès partagés (spec 034). Des fonctions, et non des
 * constantes de module : `t()` se lit au rendu, dans la langue affichée.
 */

export const EXTERNAL_ACCESS_TYPES: readonly ExternalAccessType[] = ['NOTARY', 'ACCOUNTANT', 'BANKER'];

export function accessTypeLabel(type: string): string {
  if (type === 'NOTARY') return t('Notaire');
  if (type === 'ACCOUNTANT') return t('Expert-comptable');
  if (type === 'BANKER') return t('Banquier');
  return type;
}

export function accessSectionLabel(section: string): string {
  switch (section) {
    case 'VALUATIONS':
      return t('Valorisations');
    case 'YIELD_RATIOS':
      return t('Rendement et ratios');
    case 'LOANS':
      return t('Emprunts');
    case 'EXPENSES':
      return t('Dépenses');
    case 'RENTS':
      return t('Baux et loyers');
    case 'DOCUMENTS':
      return t('Documents partageables');
    case 'TITLES_OWNERSHIP':
      return t('Titres et propriété');
    default:
      return section;
  }
}

/** Une phrase d'aide par rubrique, pour que l'agence sache ce qu'elle ouvre. */
export function accessSectionHelp(section: ExternalAccessSection): string {
  switch (section) {
    case 'VALUATIONS':
      return t('Valeur estimée, historique des estimations et plus-value latente.');
    case 'YIELD_RATIOS':
      return t('Rendement brut, net et net-net du bien.');
    case 'LOANS':
      return t('Prêts en cours : capital restant dû, taux et mensualités.');
    case 'EXPENSES':
      return t('Dépenses des 12 derniers mois, par catégorie (sans détail libre).');
    case 'RENTS':
      return t('Baux, loyers et charges (sans identité des locataires).');
    case 'DOCUMENTS':
      return t('Seuls les documents que vous aurez cochés à l’étape suivante.');
    case 'TITLES_OWNERSHIP':
      return t('Nature de la propriété, entités détentrices et quotes-parts.');
    default:
      return '';
  }
}

export function accessStatusLabel(status: ExternalAccessStatus): string {
  if (status === 'ACTIVE') return t('Actif');
  if (status === 'EXPIRING') return t('Expire bientôt');
  if (status === 'EXPIRED') return t('Expiré');
  return t('Révoqué');
}

export function accessStatusColor(status: ExternalAccessStatus): string {
  if (status === 'ACTIVE') return 'green';
  if (status === 'EXPIRING') return 'orange';
  if (status === 'EXPIRED') return 'default';
  return 'red';
}

export function accessLogActionLabel(action: string): string {
  switch (action) {
    case 'VIEWED':
      return t('Consultation');
    case 'DOCUMENT_DOWNLOADED':
      return t('Document téléchargé');
    case 'LINK_SENT':
      return t('Lien envoyé');
    case 'CREATED':
      return t('Accès créé');
    case 'UPDATED':
      return t('Accès modifié');
    case 'REVOKED':
      return t('Accès révoqué');
    default:
      return action;
  }
}

/** Raison d'un envoi d'e-mail non parti, en phrase lisible. */
export function emailOutcomeMessage(email: ExternalAccessEmailResult, recipientName: string): string {
  if (email.sent) return t('Un e-mail contenant le lien a été envoyé à {{name}}.', { name: recipientName });
  if (email.reason === 'NOT_REQUESTED') return t('Aucun e-mail n’a été demandé : transmettez le lien vous-même.');
  if (email.reason === 'EVENT_DISABLED') {
    return t('L’envoi de ce message est désactivé pour votre agence : transmettez le lien vous-même.');
  }
  if (email.reason === 'SEND_FAILED') return t('L’e-mail n’a pas pu être envoyé : transmettez le lien vous-même.');
  return t('Aucun e-mail n’a été envoyé : transmettez le lien vous-même.');
}
