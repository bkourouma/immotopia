import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Card, Descriptions, Space, Table, Tag, Typography } from 'antd';
import { getOwnerStatementById } from '../../../services/patrimoine-service';
import type { OwnerStatement } from '../../../types/patrimoine-types';
import { useAuth } from '../../../hooks/useAuth';

const { Title } = Typography;

function statementStatusLabel(status: OwnerStatement['status']): string {
  if (status === 'DRAFT') return 'Brouillon';
  if (status === 'SENT') return 'Envoyé';
  if (status === 'PAID') return 'Payé';
  return status;
}

function statementItemTypeLabel(type: OwnerStatement['items'][number]['type']): string {
  if (type === 'RENT_COLLECTED') return 'Loyer collecté';
  if (type === 'EXPENSE_DEDUCTED') return 'Dépense déduite';
  if (type === 'MANAGEMENT_FEE') return 'Frais de gestion';
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
        setError(e?.response?.data?.error || 'Erreur de chargement du détail du relevé');
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
          <Button onClick={() => navigate(`/tenant/${effectiveTenantId}/patrimoine/statements`)}>Retour</Button>
          <Title level={3} style={{ margin: 0 }}>
            Détail du relevé
          </Title>
        </Space>
        {error ? <Alert type="error" showIcon message={error} /> : null}
        <Card loading={loading}>
          {statement ? (
            <Descriptions bordered column={2}>
              <Descriptions.Item label="Référence">{statement.id}</Descriptions.Item>
              <Descriptions.Item label="Statut">
                <Tag>{statementStatusLabel(statement.status)}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Période">{statement.period}</Descriptions.Item>
              <Descriptions.Item label="Propriétaire">{ownerLabel(statement)}</Descriptions.Item>
              <Descriptions.Item label="Total revenus">
                {Number(statement.totalRevenue).toLocaleString('fr-FR')}
              </Descriptions.Item>
              <Descriptions.Item label="Total charges">
                {Number(statement.totalExpenses).toLocaleString('fr-FR')}
              </Descriptions.Item>
              <Descriptions.Item label="Montant net">
                {Number(statement.netAmount).toLocaleString('fr-FR')} {statement.currency}
              </Descriptions.Item>
              <Descriptions.Item label="Envoyé le">
                {statement.sentAt ? new Date(statement.sentAt).toLocaleString('fr-FR') : '-'}
              </Descriptions.Item>
            </Descriptions>
          ) : null}
        </Card>

        <Card title="Lignes du relevé" loading={loading}>
          <Table
            rowKey="id"
            dataSource={statement?.items ?? []}
            pagination={false}
            columns={[
              {
                title: 'Bien',
                key: 'property',
                render: (_: unknown, record: OwnerStatement['items'][number]) => propertyLabel(record)
              },
              { title: 'Libellé', dataIndex: 'label' },
              {
                title: 'Type',
                dataIndex: 'type',
                render: (value: OwnerStatement['items'][number]['type']) => <Tag>{statementItemTypeLabel(value)}</Tag>
              },
              {
                title: 'Montant',
                dataIndex: 'amount',
                render: (value: number) => Number(value).toLocaleString('fr-FR')
              }
            ]}
          />
        </Card>
      </Space>
    </>
  );
};
