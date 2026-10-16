import React, { useState } from 'react';
import { App, Alert, Space, Typography } from 'antd';
import { CheckoutsTable } from '../../components/syndics/online-payment/CheckoutsTable';
import { GatewayConfigCard } from '../../components/syndics/online-payment/GatewayConfigCard';
import { PayoutsPanel } from '../../components/syndics/online-payment/PayoutsPanel';
import { ReviewDecisionModal } from '../../components/syndics/online-payment/ReviewDecisionModal';
import type { DecideSyndicCheckoutResult, SyndicOnlineCheckoutRow } from '../../services/syndic-online-payment-service';
import { formatMoney } from '../../components/primitives';
import { useMyMenuAccess } from '../../hooks/useMenuAccess';
import { useSyndicRouteContext } from './useSyndicRouteContext';
import { t } from '../../i18n/t';

const { Title, Paragraph } = Typography;

/**
 * Écran « Paiements en ligne » d'une copropriété (spec 042, lot M5) :
 * configuration du compte marchand, suivi des paiements (vérifier, trancher
 * un `REVIEW`) et reversements vers la banque.
 */
export const SyndicOnlinePayments: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId, syndicId } = useSyndicRouteContext();
  const [collectionBalance, setCollectionBalance] = useState<number | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [deciding, setDeciding] = useState<SyndicOnlineCheckoutRow | null>(null);
  // Mêmes droits que l'API : vérifier, trancher, reverser = SYNDIC_EDIT ; configurer = en plus TENANT_SETTINGS_EDIT.
  // `permissions === null` : aucune restriction (administrateur, super-admin, échec réseau).
  const { permissions, ready } = useMyMenuAccess(tenantId);
  const canEdit = ready && (permissions === null || permissions.has('SYNDIC_EDIT'));
  const canEditSettings = canEdit && (permissions === null || permissions.has('TENANT_SETTINGS_EDIT'));

  if (!tenantId || !syndicId) {
    return <Alert type="error" showIcon message={t('Paramètres copropriété manquants')} />;
  }

  const bump = () => setRefreshToken(value => value + 1);

  const handleDecided = (result: DecideSyndicCheckoutResult) => {
    setDeciding(null);
    if (result.checkout.status === 'SUCCESS') {
      const documents = result.payment?.documents.map(doc => doc.number).join(', ');
      message.success(
        result.payment
          ? t('Encaissement de {{amount}} enregistré{{documents}}', {
              amount: formatMoney(result.payment.amount),
              documents: documents ? ` (${documents})` : ''
            })
          : t('Suivi clos : l’encaissement était déjà enregistré')
      );
    } else {
      message.success(t('Paiement refusé. Le payeur n’a pas été remboursé.'));
    }
    bump();
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Space direction="vertical" size={4}>
        <Title level={2} style={{ margin: 0 }}>
          {t('Paiements en ligne')}
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          {t('Paiement mobile money des appels de charges : compte marchand, suivi, décisions et reversements.')}
        </Paragraph>
      </Space>

      <GatewayConfigCard
        tenantId={tenantId}
        syndicId={syndicId}
        refreshToken={refreshToken}
        canEditSettings={canEditSettings}
        onSettingsLoaded={settings => setCollectionBalance(settings.collectionAccount.balance)}
      />

      <CheckoutsTable
        tenantId={tenantId}
        syndicId={syndicId}
        refreshToken={refreshToken}
        onDecide={setDeciding}
        onChanged={bump}
        canEdit={canEdit}
      />

      <PayoutsPanel
        tenantId={tenantId}
        syndicId={syndicId}
        collectionBalance={collectionBalance}
        canEdit={canEdit}
        onRecorded={result => {
          setCollectionBalance(result.collectionBalanceAfter);
          bump();
        }}
      />

      <ReviewDecisionModal
        tenantId={tenantId}
        syndicId={syndicId}
        checkout={deciding}
        onClose={() => setDeciding(null)}
        onDecided={handleDecided}
      />
    </Space>
  );
};

export default SyndicOnlinePayments;
