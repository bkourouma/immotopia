import React, { useState, useEffect } from 'react';
import { App, List, Button, Spin, Empty, Typography } from 'antd';
import { PlayCircleOutlined, DeleteOutlined } from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import contactSearchService, { type SavedSearchItem } from '../../services/contact-search.service';
import { t } from '../../i18n/t';
import { ListSearch } from '../primitives/ListSearch';
import { useLocalListSearch } from '../../utils/list-search';
import type { SearchCriterion } from '../../utils/list-search';

import { activeLocale } from '../../i18n/format';
// Stables (hors du composant) : le filtrage local reste mémoïsé.
const TEXTE_RECHERCHE = [(item: SavedSearchItem) => item.name, (item: SavedSearchItem) => item.description];

/** Au-delà de ce nombre de recherches, la barre de recherche s'affiche au-dessus de la liste. */
const SEUIL_BARRE = 10;

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

  // Liste reçue en entier (recherches de l'utilisateur et de l'équipe) : filtrée et paginée en local.
  // Préfixe d'URL : la modale se superpose à la page de recherche avancée, qui a ses propres clés.
  const criteria: SearchCriterion[] = [
    { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Nom ou description…') }
  ];
  const local = useLocalListSearch<SavedSearchItem>(list, {
    criteria,
    text: TEXTE_RECHERCHE,
    paramPrefix: 'saved',
    defaultPageSize: SEUIL_BARRE
  });

  if (loading) return <Spin />;
  if (list.length === 0) return <Empty description={t('Aucune recherche sauvegardée')} />;

  return (
    <>
      {list.length > SEUIL_BARRE || local.isFiltered ? (
        <ListSearch {...local.searchProps} aria-label={t('Rechercher une recherche sauvegardée')} />
      ) : null}
      {local.total === 0 ? (
        <Empty description={t('Aucun résultat')}>
          <Button onClick={local.clear}>{t('Effacer les critères')}</Button>
        </Empty>
      ) : (
        <List
          itemLayout="horizontal"
          dataSource={local.pageItems}
          pagination={{
            current: local.page,
            pageSize: local.pageSize,
            total: local.total,
            onChange: p => local.setPage(p),
            hideOnSinglePage: true,
            size: 'small'
          }}
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
      )}
    </>
  );
}
