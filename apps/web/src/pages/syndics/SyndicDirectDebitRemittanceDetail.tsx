import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Card, Descriptions, Space, Spin, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { getSyndicRemittance } from '../../services/syndic-direct-debit-service';
import { formatMoney } from '../../components/primitives';
import {
  apiErrorMessage,
  formatDay,
  RemittanceStatusTag
} from '../../components/rental/direct-debit/direct-debit-shared';
import { detailKey, STALE_TIME } from '../../lib/query-keys';
import { useSyndicRouteContext } from './useSyndicRouteContext';
import { t } from '../../i18n/t';

const { Title, Paragraph } = Typography;

/**
 * Détail d'une remise de copropriété. Page PROVISOIRE (spec 042, P4, première
 * partie) : seul l'en-tête est affiché ; l'écran complet des remises réutilisera
 * celui du locatif.
 */
export const SyndicDirectDebitRemittanceDetail: React.FC = () => {
  const { tenantId, syndicId } = useSyndicRouteContext();
  const { remittanceId } = useParams<{ remittanceId: string }>();

  const { data, isPending, error } = useQuery({
    queryKey: detailKey('syndic-direct-debit-remittances', tenantId, remittanceId ?? ''),
    queryFn: () => getSyndicRemittance(tenantId as string, syndicId as string, remittanceId as string),
    enabled: Boolean(tenantId && syndicId && remittanceId),
    staleTime: STALE_TIME.list
  });

  if (!tenantId || !syndicId || !remittanceId) {
    return <Alert type="error" showIcon message={t('Paramètres copropriété manquants')} />;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Link to={`/tenant/${tenantId}/syndics/${syndicId}/prelevements`}>{t('Retour aux prélèvements')}</Link>
      {error && (
        <Alert type="error" showIcon message={apiErrorMessage(error, t('Erreur lors du chargement de la remise'))} />
      )}
      {isPending ? (
        <Spin />
      ) : data ? (
        <Card>
          <Title level={3} style={{ marginTop: 0 }}>
            {data.reference}
          </Title>
          <Descriptions size="small" column={{ xs: 1, md: 2 }} bordered>
            <Descriptions.Item label={t('Statut')}>
              <RemittanceStatusTag status={data.status} />
            </Descriptions.Item>
            <Descriptions.Item label={t('Date de prélèvement')}>{formatDay(data.collectionDate)}</Descriptions.Item>
            <Descriptions.Item label={t('Total')}>{formatMoney(data.totalAmount)}</Descriptions.Item>
            <Descriptions.Item label={t('Lignes')}>{data.lineCount}</Descriptions.Item>
          </Descriptions>
          <Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>
            {t('Détail complet à venir')}
          </Paragraph>
        </Card>
      ) : null}
    </Space>
  );
};

export default SyndicDirectDebitRemittanceDetail;
