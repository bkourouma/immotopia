import React, { useState, useEffect } from 'react';
import { App, List, Button, Spin, Empty, Typography } from 'antd';
import { PlayCircleOutlined, DeleteOutlined } from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import contactSearchService, { type SavedSearchItem } from '../../services/contact-search.service';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
interface SavedSearchesListProps {
  onSelectSearch: (searchId: string) => void;
  onClose?: () => void;
}

export function SavedSearchesList({ onSelectSearch, onClose }: SavedSearchesListProps) {
  const { message } = App.useApp();

  const { tenantId } = useParams<{ tenantId: string }>();
  const [list, setList] = useState<SavedSearchItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    contactSearchService
      .getSavedSearches(tenantId)
      .then(setList)
      .catch(() => message.error(t('Impossible de charger les recherches')))
      .finally(() => setLoading(false));
  }, [tenantId, message]);

  const handleDelete = async (id: string) => {
    if (!tenantId) return;
    try {
      await contactSearchService.deleteSavedSearch(tenantId, id);
      setList(prev => prev.filter(s => s.id !== id));
      message.success(t('Recherche supprimée'));
    } catch {
      message.error(t('Suppression impossible'));
    }
  };

  if (loading) return <Spin />;
  if (list.length === 0) return <Empty description={t('Aucune recherche sauvegardée')} />;

  return (
    <List
      itemLayout="horizontal"
      dataSource={list}
      renderItem={item => (
        <List.Item
          actions={[
            <Button type="link" key="use" icon={<PlayCircleOutlined />} onClick={() => onSelectSearch(item.id)}>
              {t('Utiliser')}
            </Button>,
            <Button type="link" danger key="del" icon={<DeleteOutlined />} onClick={() => handleDelete(item.id)}>
              {t('Supprimer')}
            </Button>
          ]}
        >
          <List.Item.Meta
            title={item.name}
            description={
              item.description || (
                <Typography.Text type="secondary">
                  {t('Utilisée')} {item.useCount} fois
                  {item.lastUsedAt &&
                    t('· Dernière utilisation {{value}}', {
                      value: new Date(item.lastUsedAt).toLocaleDateString(activeLocale())
                    })}
                </Typography.Text>
              )
            }
          />
        </List.Item>
      )}
    />
  );
}
