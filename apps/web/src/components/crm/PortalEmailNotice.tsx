import React from 'react';
import { Typography } from 'antd';
import { t } from '../../i18n/t';

export interface PortalAccountEmailNotice {
  maskedEmail: string;
}

/**
 * Note sous l'e-mail d'une fiche contact : les avis partent à l'adresse du
 * compte portail du client lié quand elle diffère de celle de la fiche.
 * N'affiche rien sans `notice`. L'adresse arrive déjà masquée de l'API.
 */
export const PortalEmailNotice: React.FC<{ notice?: PortalAccountEmailNotice | null }> = ({ notice }) => {
  if (!notice) return null;
  return (
    <Typography.Text type="secondary" style={{ fontSize: 12 }} data-testid="portal-email-notice">
      {t("Les avis (prélèvement, rappels…) partent à l'adresse du compte portail :")}{' '}
      <bdi dir="ltr">{notice.maskedEmail}</bdi>.
    </Typography.Text>
  );
};

export default PortalEmailNotice;
