import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button } from 'antd';
import { t } from '../../../i18n/t';

/** Code de l'extension qui ouvre l'option, pré-sélectionné dans la demande d'extension. */
export const LIVE_OPTION_EXTENSION_CODE = 'EXT_AG_EN_DIRECT';

/**
 * État « option non souscrite » de la console « En direct » : remplace la console quand l'agence
 * n'a pas l'option payante « AG en direct et visio » (ou quand l'API la refuse en 403
 * `OPTION_NOT_INCLUDED`). Mène à la demande d'extension de la page Abonnement.
 */
export const LiveOptionNotice: React.FC<{ tenantId: string }> = ({ tenantId }) => {
  const navigate = useNavigate();
  return (
    <Alert
      type="info"
      showIcon
      message={t('AG en direct et visio — option non souscrite')}
      description={t(
        "Cette option ajoute à l'assemblée la console de séance, les liens personnels des copropriétaires, le vote en ligne, la projection en salle et la visioconférence intégrée. L'assemblée classique (convocation, résolutions, votes saisis, pouvoirs, procès-verbal) reste utilisable."
      )}
      action={
        <Button
          type="primary"
          onClick={() => navigate(`/tenant/${tenantId}/settings/abonnement?offre=${LIVE_OPTION_EXTENSION_CODE}`)}
        >
          {t("Demander l'option")}
        </Button>
      }
    />
  );
};

export default LiveOptionNotice;
