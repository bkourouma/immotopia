import React from 'react';
import { Alert, Space, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { getSyndicCreditor } from '../../services/syndic-direct-debit-service';
import { SyndicCreditorCard } from '../../components/syndics/direct-debit/SyndicCreditorCard';
import { SyndicMandatesCard } from '../../components/syndics/direct-debit/SyndicMandatesCard';
import { SyndicRemittancesCard } from '../../components/syndics/direct-debit/SyndicRemittancesCard';
import { SYNDIC_DD_KEYS } from '../../components/syndics/direct-debit/keys';
import { apiErrorMessage } from '../../components/rental/direct-debit/direct-debit-shared';
import { STALE_TIME } from '../../lib/query-keys';
import { useSyndicRouteContext } from './useSyndicRouteContext';
import { t } from '../../i18n/t';

const { Title, Paragraph } = Typography;

/**
 * Onglet « Prélèvements » de Syndic › Finances (spec 042, P4, §9.6) : le
 * compte de prélèvement du syndicat, les mandats par lot et les remises.
 */
export const SyndicDirectDebit: React.FC = () => {
  const { tenantId, syndicId } = useSyndicRouteContext();

  const {
    data: creditor,
    isPending,
    error
  } = useQuery({
    queryKey: SYNDIC_DD_KEYS.creditor(tenantId ?? '', syndicId ?? ''),
    queryFn: () => getSyndicCreditor(tenantId as string, syndicId as string),
    enabled: Boolean(tenantId && syndicId),
    staleTime: STALE_TIME.list
  });

  if (!tenantId || !syndicId) {
    return <Alert type="error" showIcon message={t('Paramètres copropriété manquants')} />;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Space direction="vertical" size={4}>
        <Title level={2} style={{ margin: 0 }}>
          {t('Prélèvements')}
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          {t(
            'Prélèvement bancaire des appels de charges : compte du syndicat, mandats des copropriétaires et remises.'
          )}
        </Paragraph>
      </Space>

      <SyndicCreditorCard
        tenantId={tenantId}
        syndicId={syndicId}
        creditor={creditor}
        loading={isPending}
        error={error ? apiErrorMessage(error, t('Erreur lors du chargement du compte de prélèvement')) : null}
      />
      <SyndicMandatesCard tenantId={tenantId} syndicId={syndicId} creditor={creditor} />
      <SyndicRemittancesCard tenantId={tenantId} syndicId={syndicId} creditor={creditor} />
    </Space>
  );
};

export default SyndicDirectDebit;
