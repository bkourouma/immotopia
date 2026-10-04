import React from 'react';
import { Alert } from 'antd';
import { EyeInvisibleOutlined } from '@ant-design/icons';
import { t } from '../../../i18n/t';

export interface StockBlindBannerProps {
  /**
   * `count` : détail d'un inventaire en cours (ecrans §7.4) ;
   * `magasin` : geste « Compter » de l'écran Magasin (ecrans §6.6).
   */
  variant: 'count' | 'magasin';
}

/**
 * Bandeau du comptage à l'aveugle (spec A2). Rappelle que la quantité
 * attendue n'est affichée à personne pendant le comptage — pas même à un
 * administrateur — et qu'elle apparaîtra à la clôture du comptage.
 */
export const StockBlindBanner: React.FC<StockBlindBannerProps> = ({ variant }) => {
  const description =
    variant === 'magasin'
      ? t('Comptez ce que vous voyez : la quantité attendue n’est pas affichée, à personne.')
      : t(
          'Pendant le comptage, personne ne voit la quantité attendue ni l’écart, pas même un administrateur. Ils apparaîtront à la clôture du comptage.'
        );
  return (
    <Alert
      type="info"
      showIcon
      icon={<EyeInvisibleOutlined />}
      message={t('Comptage à l’aveugle')}
      description={description}
      role="status"
    />
  );
};

export default StockBlindBanner;
