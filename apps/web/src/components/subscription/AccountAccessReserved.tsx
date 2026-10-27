import React from 'react';
import { StateBlock } from '../primitives';
import { t } from '../../i18n/t';

/**
 * État « Accès réservé » des écrans « Mon compte » (Abonnement, Facturation) pour une
 * personne sans `TENANT_SETTINGS_VIEW` : l'API répondrait 403 sur chaque appel, et un
 * tableau « Aucune facture » serait trompeur.
 */
export const AccountAccessReserved: React.FC = () => (
  <StateBlock
    variant="forbidden"
    title={t('Accès réservé')}
    description={t(
      'Cette page est réservée aux personnes autorisées à consulter les paramètres de l’agence. Contactez l’administrateur de votre agence.'
    )}
  />
);
