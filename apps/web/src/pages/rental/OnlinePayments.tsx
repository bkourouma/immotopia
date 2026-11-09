import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { App, Alert, Badge, Space, Tabs, Typography } from 'antd';
import { RentalOnlineCheckoutsTable } from '../../components/rental/online-payment/CheckoutsTable';
import { RentalReviewDecisionModal } from '../../components/rental/online-payment/ReviewDecisionModal';
import { CollectionAccountPanel } from '../../components/rental/online-payment/CollectionAccountPanel';
import {
  getRentalOnlinePaymentAvailability,
  getRentalOnlinePaymentsSummary
} from '../../services/rental-online-payment-service';
import type {
  RentalOnlinePaymentRowDto,
  RentalOnlineUnavailableReason,
  ResolveOnlinePaymentResultDto
} from '../../types/rental-online-payment';
import { formatMoney } from '../../components/primitives';
import { useMyMenuAccess } from '../../hooks/useMenuAccess';
import { t } from '../../i18n/t';

const { Title, Paragraph } = Typography;

const TABS = ['suivi', 'collecte'] as const;
type TabKey = (typeof TABS)[number];

function unavailableText(reason: RentalOnlineUnavailableReason | null): string {
  switch (reason) {
    case 'NOT_CONFIGURED':
      return t('Le paiement en ligne n’est pas configuré pour votre agence.');
    case 'INACTIVE':
      return t('Le paiement en ligne est désactivé pour votre agence.');
    case 'SIMULATOR_FORBIDDEN':
      return t('Le mode simulateur n’est pas autorisé : le paiement en ligne est indisponible.');
    case 'SUBSCRIPTION':
      return t('Votre abonnement n’inclut pas le paiement en ligne.');
    default:
      return t('Le paiement en ligne n’est pas disponible pour votre agence.');
  }
}

/** Écran « Paiements en ligne » du locatif : suivi des tentatives et compte de collecte. */
export const OnlinePayments: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId } = useParams<{ tenantId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('tab');
  const tab: TabKey = (TABS as readonly string[]).includes(raw ?? '') ? (raw as TabKey) : 'suivi';
  const setTab = (next: TabKey) =>
    setSearchParams(
      previous => {
        const params = new URLSearchParams(previous);
        if (next === 'suivi') params.delete('tab');
        else params.set('tab', next);
        return params;
      },
      { replace: true }
    );

  const [refreshToken, setRefreshToken] = useState(0);
  const [deciding, setDeciding] = useState<RentalOnlinePaymentRowDto | null>(null);
  const [unavailable, setUnavailable] = useState<RentalOnlineUnavailableReason | 'UNKNOWN' | null>(null);
  const [reviewPending, setReviewPending] = useState(0);

  const { permissions, ready } = useMyMenuAccess(tenantId);
  const canAllocate = ready && (permissions === null || permissions.has('RENTAL_PAYMENTS_ALLOCATE'));

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    getRentalOnlinePaymentAvailability(tenantId)
      .then(result => {
        if (!cancelled) setUnavailable(result.usable ? null : (result.unavailableReason ?? 'UNKNOWN'));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    getRentalOnlinePaymentsSummary(tenantId)
      .then(result => {
        if (!cancelled) setReviewPending(result.reviewPending);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [tenantId, refreshToken]);

  if (!tenantId) {
    return <Alert type="error" showIcon message={t('Paramètres agence manquants')} />;
  }

  const bump = () => setRefreshToken(value => value + 1);

  const handleDecided = (result: ResolveOnlinePaymentResultDto) => {
    setDeciding(null);
    if (result.checkout.status === 'SUCCESS') {
      message.success(
        result.payment
          ? t('Encaissement de {{amount}} enregistré', { amount: formatMoney(result.payment.amount) })
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
          {t(
            'Loyers payés en ligne par les locataires : suivi, décision sur les cas à vérifier et compte de collecte.'
          )}
        </Paragraph>
      </Space>

      {unavailable ? (
        <Alert type="warning" showIcon message={unavailableText(unavailable === 'UNKNOWN' ? null : unavailable)} />
      ) : null}

      <Tabs
        activeKey={tab}
        onChange={key => setTab(key as TabKey)}
        destroyOnHidden
        items={[
          {
            key: 'suivi',
            label: (
              <Space size={8}>
                {t('Suivi des paiements en ligne')}
                {reviewPending > 0 ? <Badge count={reviewPending} title={t('À vérifier')} /> : null}
              </Space>
            ),
            children: (
              <>
                <RentalOnlineCheckoutsTable
                  tenantId={tenantId}
                  refreshToken={refreshToken}
                  onDecide={setDeciding}
                  onChanged={bump}
                  canDecide={canAllocate}
                />
                <RentalReviewDecisionModal
                  tenantId={tenantId}
                  checkout={deciding}
                  onClose={() => setDeciding(null)}
                  onDecided={handleDecided}
                />
              </>
            )
          },
          {
            key: 'collecte',
            label: t('Compte de collecte'),
            children: (
              <CollectionAccountPanel
                tenantId={tenantId}
                refreshToken={refreshToken}
                canReverse={canAllocate}
                onRecorded={bump}
              />
            )
          }
        ]}
      />
    </Space>
  );
};

export default OnlinePayments;
