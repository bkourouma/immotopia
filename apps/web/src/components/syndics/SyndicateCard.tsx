import React from 'react';
import { BankOutlined, DeleteOutlined, EnvironmentOutlined, FolderOpenOutlined } from '@ant-design/icons';
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
      danger
      aria-label={t('Supprimer')}
      loading={deleting}
      disabled={deleteDisabled}
      onClick={() => onDelete?.(syndicate.id)}
    >
      {deleting ? null : <DeleteOutlined />}
    </Button>
  );

  return (
    <Card
      hoverable
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      styles={{ body: { padding: 20, flex: 1, display: 'flex', flexDirection: 'column' } }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, minWidth: 0 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
                color: '#1d4ed8',
                flexShrink: 0
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
          </div>
          <Tag color={status.color} style={{ marginInlineEnd: 0, flexShrink: 0 }}>
            {status.label}
          </Tag>
        </div>

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

        <Text type="secondary">
          {t('Mandant:')} {syndicate.mandatingAgency?.name || t('Identité de l’agence')}
        </Text>

        <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
          <Link to={`/tenant/${tenantId}/syndics/${syndicate.id}`} style={{ flex: 1 }}>
            <Button type="primary" block>
              {t('Ouvrir la copropriété')}
            </Button>
          </Link>
          {deleteDisabled ? (
            <Tooltip
              title={t('Cette copropriété a des lots ou d’autres données liées : elle ne peut pas être supprimée.')}
            >
              <span>{deleteButton}</span>
            </Tooltip>
          ) : (
            deleteButton
          )}
        </div>
      </div>
    </Card>
  );
};
