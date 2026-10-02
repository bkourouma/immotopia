import React from 'react';
import { Alert } from 'antd';
import { t } from '../../../i18n/t';

function normalize(text: string): string {
  return text
    .trim()
    .replace(/[.\s]+$/u, '')
    .toLowerCase();
}

/**
 * Bandeau « filière à faire valider par un juriste local ». La note de
 * validation de l'API n'est ajoutée que si elle apporte autre chose que le
 * titre : le même texte ne s'affiche jamais deux fois.
 */
export const LandValidationAlert: React.FC<{ note?: string | null; style?: React.CSSProperties }> = ({
  note,
  style
}) => {
  const title = t('À valider par un juriste local');
  const description = note && normalize(note) !== normalize(title) ? note : undefined;
  return <Alert type="warning" showIcon style={style} title={title} description={description} />;
};
