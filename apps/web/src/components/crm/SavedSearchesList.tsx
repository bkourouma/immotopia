import React, { useState, useEffect } from 'react';
import { App, List, Button, Spin, Empty, Typography } from 'antd';
import { PlayCircleOutlined, DeleteOutlined } from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import contactSearchService, { type SavedSearchItem } from '../../services/contact-search.service';

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
      .catch(() => message.error('Impossible de charger les recherches'))
      .finally(() => setLoading(false));
  }, [tenantId]);

  const handleDelete = async (id: string) => {
    if (!tenantId) return;
    try {
      await contactSearchService.deleteSavedSearch(tenantId, id);
      setList(prev => prev.filter(s => s.id !== id));
      message.success('Recherche supprimée');
    } catch {
      message.error('Suppression impossible');
    }
  };

  if (loading) return <Spin />;
  if (list.length === 0) return <Empty description="Aucune recherche sauvegardée" />;

  return (
    <List
      itemLayout="horizontal"
      dataSource={list}
      renderItem={item => (
        <List.Item
          actions={[
            <Button type="link" key="use" icon={<PlayCircleOutlined />} onClick={() => onSelectSearch(item.id)}>
              Utiliser
            </Button>,
            <Button type="link" danger key="del" icon={<DeleteOutlined />} onClick={() => handleDelete(item.id)}>
              Supprimer
            </Button>
          ]}
        >
          <List.Item.Meta
            title={item.name}
            description={
              item.description || (
                <Typography.Text type="secondary">
                  Utilisée {item.useCount} fois
                  {item.lastUsedAt &&
                    ` · Dernière utilisation ${new Date(item.lastUsedAt).toLocaleDateString('fr-FR')}`}
                </Typography.Text>
              )
            }
          />
        </List.Item>
      )}
    />
  );
}
