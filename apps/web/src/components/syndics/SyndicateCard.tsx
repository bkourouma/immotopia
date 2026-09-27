import React from 'react';
import { BankOutlined, EnvironmentOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { Button, Card, Space, Tag, Tooltip, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { Syndicate } from '../../types/syndic-types';
import { t } from '../../i18n/t';

const { Paragraph, Text, Title } = Typography;

const statusConfig: Record<Syndicate['status'], { color: string; label: string }> = {
  ACTIVE: { color: 'green', label: t('Active') },
  IN_LIQUIDATION: { color: 'orange', label: t('En liquidation') },
  IN_DISPUTE: { color: 'red', label: t('En litige') }
};

interface SyndicateCardProps {
  syndicate: Syndicate;
  tenantId: string;
  onDelete?: (syndicId: string) => void;
  deleting?: boolean;
}

/**
 * `null` (au lieu de `boolean`) quand `_count` est absent de la reponse : on
 * ne sait alors pas si la copropriete est vide, et le bouton « Supprimer »
 * reste actif — le 409 du serveur (`deleteEmptySyndicateByTenant`, ecart
 * recette #8) tranchera a la place d'une desactivation hasardeuse.
 */
function isSyndicateEmpty(syndicate: Syndicate): boolean | null {
  const counts = syndicate._count;
  if (!counts) return null;
  const total =
    (counts.lots ?? 0) +
    (counts.chargeCalls ?? 0) +
    (counts.budgets ?? 0) +
    (counts.generalMeetings ?? 0) +
    (counts.documents ?? 0) +
    (counts.serviceContracts ?? 0) +
    (counts.incidents ?? 0);
  return total === 0;
}

export const SyndicateCard: React.FC<SyndicateCardProps> = ({ syndicate, tenantId, onDelete, deleting }) => {
  const status = statusConfig[syndicate.status];
  const lotCount = syndicate._count?.lots ?? syndicate.totalLots ?? syndicate.lots?.length ?? 0;
  const empty = isSyndicateEmpty(syndicate);
  const deleteDisabled = empty === false;

  const deleteButton = (
    <Button
      key="delete"
      type="link"
      danger
      loading={deleting}
      disabled={deleteDisabled}
      onClick={() => onDelete?.(syndicate.id)}
    >
      {t('Supprimer')}
    </Button>
  );

  return (
    <Card
      hoverable
      styles={{ body: { padding: 20 } }}
      actions={[
        <Link key="detail" to={`/tenant/${tenantId}/syndics/${syndicate.id}`}>
          {t('Voir la fiche')}
        </Link>,
        <Link key="lots" to={`/tenant/${tenantId}/syndics/${syndicate.id}/lots`}>
          {t('Voir les lots')}
        </Link>,
        deleteDisabled ? (
          <Tooltip
            key="delete"
            title={t('Cette copropriété a des lots ou d’autres données liées : elle ne peut pas être supprimée.')}
          >
            {deleteButton}
          </Tooltip>
        ) : (
          deleteButton
        )
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
              <Text type="secondary">{t('Copropriété')}</Text>
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
              {syndicate.totalBuildings} {t('bâtiment')}
              {syndicate.totalBuildings > 1 ? 's' : ''}
            </Text>
          </Space>
        </Space>

        {syndicate.cadastralReference ? (
          <Text type="secondary">
            {t('Réf. cadastrale:')} {syndicate.cadastralReference}
          </Text>
        ) : null}

        <Link to={`/tenant/${tenantId}/syndics/${syndicate.id}`}>
          <Button type="primary" block>
            {t('Ouvrir la copropriété')}
          </Button>
        </Link>
      </Space>
    </Card>
  );
};
