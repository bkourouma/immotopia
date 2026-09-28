import React from 'react';
import { Alert } from 'antd';
import { t } from '../../../i18n/t';

/**
 * Avertissement affiché sur tout écran d'estimation fiscale (lot P4).
 *
 * Texte imposé par le contrat : « Estimation indicative, à valider par un
 * conseil fiscal. », complété du rappel que les paramètres eux-mêmes sont à
 * valider — c'est le frontend qui porte ce texte, il ne vient pas de l'API.
 */
export const TaxDisclaimer: React.FC = () => (
  <Alert
    type="warning"
    showIcon
    message={t('Estimation indicative, à valider par un conseil fiscal.')}
    description={t(
      'Les paramètres fiscaux utilisés sont issus des textes en vigueur mais restent à valider avant tout usage contractuel.'
    )}
    style={{ marginBottom: 'var(--space-4)' }}
  />
);
