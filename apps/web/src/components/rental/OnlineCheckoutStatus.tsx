import React, { useState } from 'react';
import { App, Button, Space, Tag, Tooltip, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { OnlineCheckoutSummary, checkOnlinePaymentStatus } from '../../services/payment-gateway-service';
import { formatMoney } from '../primitives';
import { t } from '../../i18n/t';

const { Text } = Typography;

/** Couleur et libellé d'un statut de checkout — mêmes six valeurs que le contrat Lot 7. */
function statutInfo(status: OnlineCheckoutSummary['status']): { label: string; color: string } {
  switch (status) {
    case 'PENDING':
      return { label: t('En attente'), color: 'default' };
    case 'SUCCESS':
      return { label: t('Réussi'), color: 'success' };
    case 'FAILED':
      return { label: t('Échoué'), color: 'error' };
    case 'CANCELED':
      return { label: t('Annulé'), color: 'default' };
    case 'EXPIRED':
      return { label: t('Expiré'), color: 'default' };
    case 'REVIEW':
      return { label: t('En cours de vérification par l’agence'), color: 'warning' };
    default:
      return { label: status, color: 'default' };
  }
}

export interface OnlineCheckoutStatusProps {
  tenantId: string;
  paymentId: string;
  checkout: OnlineCheckoutSummary | null | undefined;
  onChecked?: (summary: OnlineCheckoutSummary) => void;
  /** Rendu compact (badge + bouton icône), pour une cellule de tableau. Détaillé par défaut. */
  compact?: boolean;
}

/**
 * Étiquette « En ligne » + statut du checkout, opérateur, frais, message
 * d'échec ou motif de revue, et bouton « Vérifier le statut » — Lot 7, contrat
 * §3.2 et §5. Partagé entre la liste des paiements et le détail d'un paiement,
 * pour que les deux écrans affichent exactement la même chose.
 */
export const OnlineCheckoutStatus: React.FC<OnlineCheckoutStatusProps> = ({
  tenantId,
  paymentId,
  checkout,
  onChecked,
  compact = false
}) => {
  const { message } = App.useApp();
  const [checking, setChecking] = useState(false);

  if (!checkout) return null;

  const { label, color } = statutInfo(checkout.status);
  const peutVerifier = checkout.status === 'PENDING' || checkout.status === 'REVIEW';

  const handleCheck = async () => {
    setChecking(true);
    try {
      const summary = await checkOnlinePaymentStatus(tenantId, paymentId);
      onChecked?.(summary);
      message.success(t('Statut vérifié'));
    } catch (e: any) {
      message.error(e?.response?.data?.message || t('Erreur lors de la vérification du statut'));
    } finally {
      setChecking(false);
    }
  };

  const bouton = peutVerifier ? (
    <Tooltip title={t('Vérifier le statut')}>
      <Button
        size="small"
        icon={<ReloadOutlined />}
        loading={checking}
        onClick={() => void handleCheck()}
        aria-label={t('Vérifier le statut')}
      >
        {compact ? null : t('Vérifier le statut')}
      </Button>
    </Tooltip>
  ) : null;

  if (compact) {
    return (
      <Space size="small" wrap>
        <Tag color="processing">{t('En ligne')}</Tag>
        <Tag color={color}>{label}</Tag>
        {bouton}
      </Space>
    );
  }

  return (
    <Space direction="vertical" size={4} style={{ width: '100%' }}>
      <Space wrap>
        <Tag color="processing">{t('En ligne')}</Tag>
        <Tag color={color}>{label}</Tag>
        {checkout.mode === 'SIMULATOR' ? <Tag>{t('Mode démonstration')}</Tag> : null}
        {bouton}
      </Space>
      {checkout.providerServiceName ? (
        <Text type="secondary">{t('Opérateur : {{value}}', { value: checkout.providerServiceName })}</Text>
      ) : null}
      {checkout.providerFees !== null && checkout.providerFees !== undefined ? (
        <Text type="secondary">{t('Frais : {{value}}', { value: formatMoney(checkout.providerFees) })}</Text>
      ) : null}
      {checkout.status === 'FAILED' && checkout.failureMessage ? (
        <Text type="danger">{checkout.failureMessage}</Text>
      ) : null}
      {checkout.status === 'REVIEW' && checkout.reviewReason ? (
        <Text type="warning">{checkout.reviewReason}</Text>
      ) : null}
    </Space>
  );
};

export default OnlineCheckoutStatus;
