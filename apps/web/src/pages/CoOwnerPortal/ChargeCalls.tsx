import React from 'react';
import { Button, Card, Col, Row, Space, Typography } from 'antd';
import { SyncOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { MoneyValue, SkeletonList, StateBlock } from '../../components/primitives';
import { t } from '../../i18n/t';
import { listMyChargeCalls } from '../../services/coowner-portal-service';
import { ChargeCallsTable } from './ChargeCallsTable';
import { portalErrorMessage } from './portal-error';

const { Title, Text } = Typography;

/**
 * « Mes appels de charges » — tous les appels des lots du copropriétaire.
 * Le statut « En retard » est dérivé par le serveur (échéance passée, appel
 * non soldé). Lecture seule, sans paiement en ligne.
 */
export default function CoOwnerChargeCalls() {
  const {
    data: calls,
    isPending,
    isFetching,
    error,
    refetch
  } = useQuery({
    queryKey: ['coowner-portal', 'charge-calls', 'all'],
    queryFn: () => listMyChargeCalls()
  });

  if (isPending) return <SkeletonList rows={4} />;

  if (error || !calls) {
    return (
      <StateBlock
        variant="error"
        description={portalErrorMessage(error, t('Impossible de charger les appels de charges.'))}
        actions={[{ label: t('Réessayer'), onClick: () => void refetch(), primary: true }]}
      />
    );
  }

  const outstanding = calls.reduce((sum, call) => sum + call.outstanding, 0);
  const overdue = calls.filter(call => call.status === 'OVERDUE');
  const overdueAmount = overdue.reduce((sum, call) => sum + call.outstanding, 0);

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div className="it-toolbar">
        <div>
          <Title level={2}>{t('Mes appels de charges')}</Title>
          <Text type="secondary">{t('Montant appelé, déjà payé et reste à payer pour chacun de vos lots.')}</Text>
        </div>
        <Button icon={<SyncOutlined />} onClick={() => void refetch()} loading={isFetching}>
          {t('Actualiser')}
        </Button>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12}>
          <Card>
            <Text type="secondary">{t('Reste à payer')}</Text>
            <div style={{ marginTop: 4 }}>
              <MoneyValue value={outstanding} />
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card>
            <Text type="secondary">{t('Dont en retard')}</Text>
            <div style={{ marginTop: 4 }}>
              <MoneyValue value={overdueAmount} />{' '}
              <Text type="secondary">({t('{{count}} appel(s)', { count: overdue.length })})</Text>
            </div>
          </Card>
        </Col>
      </Row>

      <Card>
        <ChargeCallsTable calls={calls} />
      </Card>

      <Text type="secondary">
        {t(
          "Pour régler un appel de charges, rapprochez-vous de votre agence : le paiement en ligne n'est pas proposé."
        )}
      </Text>
    </Space>
  );
}
