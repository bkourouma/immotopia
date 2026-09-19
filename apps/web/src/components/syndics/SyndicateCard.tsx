import React from 'react';
import { BankOutlined, EnvironmentOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { Button, Card, Space, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { Syndicate } from '../../types/syndic-types';

const { Paragraph, Text, Title } = Typography;

const statusConfig: Record<Syndicate['status'], { color: string; label: string }> = {
  ACTIVE: { color: 'green', label: 'Active' },
  IN_LIQUIDATION: { color: 'orange', label: 'En liquidation' },
  IN_DISPUTE: { color: 'red', label: 'En litige' }
};

interface SyndicateCardProps {
  syndicate: Syndicate;
  tenantId: string;
  onDelete?: (syndicId: string) => void;
  deleting?: boolean;
}

export const SyndicateCard: React.FC<SyndicateCardProps> = ({ syndicate, tenantId, onDelete, deleting }) => {
  const status = statusConfig[syndicate.status];
  const lotCount = syndicate._count?.lots ?? syndicate.totalLots ?? syndicate.lots?.length ?? 0;

  return (
    <Card
      hoverable
      styles={{ body: { padding: 20 } }}
      actions={[
        <Link key="detail" to={`/tenant/${tenantId}/syndics/${syndicate.id}`}>
          Voir la fiche
        </Link>,
        <Link key="lots" to={`/tenant/${tenantId}/syndics/${syndicate.id}/lots`}>
          Voir les lots
        </Link>,
        <Button key="delete" type="link" danger loading={deleting} onClick={() => onDelete?.(syndicate.id)}>
          Supprimer
        </Button>
      ]}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Space style={{ justifyContent: 'space-between', width: '100%' }} align="start" wrap>
          <Space>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
                color: '#1d4ed8'
              }}
            >
              <BankOutlined />
            </div>
            <div>
              <Title level={4} style={{ margin: 0 }}>
                {syndicate.name}
              </Title>
              <Text type="secondary">Copropriété</Text>
            </div>
          </Space>
          <Tag color={status.color}>{status.label}</Tag>
        </Space>

        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          <EnvironmentOutlined /> {syndicate.address}
        </Paragraph>

        <Space size="large">
          <Space size="small">
            <FolderOpenOutlined />
            <Text>{lotCount} lots</Text>
          </Space>
          <Space size="small">
            <BankOutlined />
            <Text>
              {syndicate.totalBuildings} bâtiment{syndicate.totalBuildings > 1 ? 's' : ''}
            </Text>
          </Space>
        </Space>

        {syndicate.cadastralReference ? (
          <Text type="secondary">Réf. cadastrale: {syndicate.cadastralReference}</Text>
        ) : null}

        <Link to={`/tenant/${tenantId}/syndics/${syndicate.id}`}>
          <Button type="primary" block>
            Ouvrir la copropriété
          </Button>
        </Link>
      </Space>
    </Card>
  );
};
