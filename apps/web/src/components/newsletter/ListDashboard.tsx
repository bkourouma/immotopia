import React from 'react';
import { Card, Row, Col, Statistic, Tag, Button, Space } from 'antd';
import { TeamOutlined, UserOutlined, MailOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { NewsletterList } from '../../services/newsletter.service';
import { ListSearch, PageHeader, StateBlock } from '../primitives';
import type { ListSearchBinding } from '../primitives';
import { t } from '../../i18n/t';
import { localizedRecord } from '../../i18n/localized';

interface ListDashboardProps {
  /** Listes affichées (déjà filtrées par la recherche). */
  lists: NewsletterList[];
  /** Nombre de listes avant filtrage : 0 = « aucune liste », sinon « aucun résultat ». */
  totalLists?: number;
  search?: ListSearchBinding;
  onClearSearch?: () => void;
  loading?: boolean;
  /** Message d'erreur de chargement des listes ; affiché avec « Réessayer » quand aucune liste n'est chargée. */
  error?: string | null;
  onRetry?: () => void;
  onSelectList: (list: NewsletterList) => void;
  onCreateList: () => void;
  onEditList: (list: NewsletterList) => void;
  onDeleteList: (list: NewsletterList) => void;
}

const typeLabels: Record<string, string> = localizedRecord(() => ({
  MANUAL: t('Manuelle'),
  FROM_OWNERS: t('Propriétaires'),
  FROM_RENTERS: t('Locataires'),
  FROM_CRM_CONTACTS: t('Contacts CRM')
}));

export function ListDashboard({
  lists,
  totalLists,
  search,
  onClearSearch,
  loading,
  error,
  onRetry,
  onSelectList,
  onCreateList,
  onEditList,
  onDeleteList
}: ListDashboardProps) {
  return (
    <div>
      <PageHeader
        title={t('Listes de diffusion')}
        helpId="communication.newsletter.listes.cartes"
        primaryAction={{ label: t('Nouvelle liste'), onClick: onCreateList, icon: <TeamOutlined /> }}
      />

      {error && lists.length === 0 && <StateBlock variant="error" title={error} onRetry={onRetry} />}

      {!error && loading && lists.length === 0 && <StateBlock variant="loading" />}

      {!error && !loading && (totalLists ?? lists.length) === 0 && (
        <StateBlock
          variant="empty"
          title={t('Aucune liste de diffusion')}
          description={t('Créez une liste pour regrouper les destinataires de vos newsletters.')}
          actions={[{ label: t('Créer une liste'), onClick: onCreateList, primary: true }]}
        />
      )}

      {search && (totalLists ?? lists.length) > 0 && (
        <div style={{ marginBottom: 16 }}>
          <ListSearch {...search} aria-label={t('Rechercher une liste de diffusion')} />
        </div>
      )}

      {search && lists.length === 0 && (totalLists ?? 0) > 0 && (
        <StateBlock
          variant="no-results"
          title={t('Aucun résultat pour ces critères')}
          actions={onClearSearch ? [{ label: t('Effacer les critères'), onClick: onClearSearch, primary: true }] : []}
        />
      )}

      <Row gutter={[16, 16]}>
        {lists.map(list => (
          <Col xs={24} sm={12} lg={8} xl={6} key={list.id}>
            <Card
              loading={loading}
              hoverable
              onClick={() => onSelectList(list)}
              style={{ cursor: 'pointer' }}
              actions={[
                <Button
                  type="link"
                  size="small"
                  style={{ minHeight: 44 }}
                  aria-label={t('Modifier la liste {{nom}}', { nom: list.name })}
                  icon={<EditOutlined />}
                  onClick={e => {
                    e.stopPropagation();
                    onEditList(list);
                  }}
                  key="edit"
                >
                  {t('Modifier')}
                </Button>,
                <Button
                  type="link"
                  size="small"
                  danger
                  style={{ minHeight: 44 }}
                  aria-label={t('Supprimer la liste {{nom}}', { nom: list.name })}
                  icon={<DeleteOutlined />}
                  onClick={e => {
                    e.stopPropagation();
                    onDeleteList(list);
                  }}
                  key="delete"
                >
                  {t('Supprimer')}
                </Button>
              ]}
            >
              <Card.Meta
                title={
                  <Space>
                    <MailOutlined />
                    {list.name}
                  </Space>
                }
                description={
                  <>
                    <Tag>{typeLabels[list.type] ?? list.type}</Tag>
                    {list.doubleOptIn && <Tag color="blue">{t('Double opt-in')}</Tag>}
                  </>
                }
              />
              <Row gutter={16} style={{ marginTop: 12 }}>
                <Col span={8}>
                  <Statistic title={t('Total')} value={list.totalCount ?? 0} prefix={<TeamOutlined />} />
                </Col>
                <Col span={8}>
                  <Statistic
                    title={t('Actifs')}
                    value={list.activeCount ?? 0}
                    valueStyle={{ color: '#52c41a' }}
                    prefix={<UserOutlined />}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title={t('Désabonnés')}
                    value={list.unsubscribedCount ?? 0}
                    valueStyle={{ color: '#999' }}
                  />
                </Col>
              </Row>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
