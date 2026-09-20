import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Card, Descriptions, Space, Table, Tag, Typography } from 'antd';
import { getOwnerStatementById } from '../../../services/patrimoine-service';
import type { OwnerStatement } from '../../../types/patrimoine-types';
import { useAuth } from '../../../hooks/useAuth';
import { t } from '../../../i18n/t';

import { activeLocale } from '../../../i18n/format';
const { Title } = Typography;

function statementStatusLabel(status: OwnerStatement['status']): string {
  if (status === 'DRAFT') return 'Brouillon';
  if (status === 'SENT') return t('Envoyé');
  if (status === 'PAID') return t('Payé');
  return status;
}

function statementItemTypeLabel(type: OwnerStatement['items'][number]['type']): string {
  if (type === 'RENT_COLLECTED') return t('Loyer collecté');
  if (type === 'EXPENSE_DEDUCTED') return t('Dépense déduite');
  if (type === 'MANAGEMENT_FEE') return t('Frais de gestion');
  if (type === 'ADVANCE') return 'Avance';
  if (type === 'OTHER') return 'Autre';
  return type;
}

function ownerLabel(statement: OwnerStatement): string {
  const fullName = `${statement.owner?.firstName || ''} ${statement.owner?.lastName || ''}`.trim();
  return fullName || statement.owner?.email || statement.ownerContactId;
}

function propertyLabel(item: OwnerStatement['items'][number]): string {
  return item.property?.title || item.property?.internalReference || item.propertyId;
}

export const OwnerStatementDetailPage: React.FC = () => {
  const { tenantId, id } = useParams<{ tenantId: string; id: string }>();
  const navigate = useNavigate();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statement, setStatement] = useState<OwnerStatement | null>(null);

  useEffect(() => {
    if (!effectiveTenantId || !id) return;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getOwnerStatementById(effectiveTenantId, id);
        setStatement(data);
      } catch (e: any) {
        setError(e?.response?.data?.error || t('Erreur de chargement du détail du relevé'));
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [effectiveTenantId, id]);

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Space>
          <Button onClick={() => navigate(`/tenant/${effectiveTenantId}/patrimoine/statements`)}>{t('Retour')}</Button>
          <Title level={3} style={{ margin: 0 }}>
            {t('Détail du relevé')}
          </Title>
        </Space>
        {error ? <Alert type="error" showIcon message={error} /> : null}
        <Card loading={loading}>
          {statement ? (
            <Descriptions bordered column={{ xs: 1, sm: 2 }}>
              <Descriptions.Item label={t('Référence')}>{statement.id}</Descriptions.Item>
              <Descriptions.Item label={t('Statut')}>
                <Tag>{statementStatusLabel(statement.status)}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('Période')}>{statement.period}</Descriptions.Item>
              <Descriptions.Item label={t('Propriétaire')}>{ownerLabel(statement)}</Descriptions.Item>
              <Descriptions.Item label={t('Total revenus')}>
                {Number(statement.totalRevenue).toLocaleString(activeLocale())}
              </Descriptions.Item>
              <Descriptions.Item label={t('Total charges')}>
                {Number(statement.totalExpenses).toLocaleString(activeLocale())}
              </Descriptions.Item>
              <Descriptions.Item label={t('Montant net')}>
                {Number(statement.netAmount).toLocaleString(activeLocale())} {statement.currency}
              </Descriptions.Item>
              <Descriptions.Item label={t('Envoyé le')}>
                {statement.sentAt ? new Date(statement.sentAt).toLocaleString(activeLocale()) : '-'}
              </Descriptions.Item>
            </Descriptions>
          ) : null}
        </Card>

        <Card title={t('Lignes du relevé')} loading={loading}>
          <Table
            scroll={{ x: 'max-content' }}
            rowKey="id"
            dataSource={statement?.items ?? []}
            pagination={false}
            columns={[
              {
                title: 'Bien',
                key: 'property',
                render: (_: unknown, record: OwnerStatement['items'][number]) => propertyLabel(record)
              },
              { title: t('Libellé'), dataIndex: 'label' },
              {
                title: 'Type',
                dataIndex: 'type',
                render: (value: OwnerStatement['items'][number]['type']) => <Tag>{statementItemTypeLabel(value)}</Tag>
              },
              {
                title: 'Montant',
                dataIndex: 'amount',
                render: (value: number) => Number(value).toLocaleString(activeLocale())
              }
            ]}
          />
        </Card>
      </Space>
    </>
  );
};
