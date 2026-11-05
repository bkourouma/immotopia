import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Pagination, Space, Typography } from 'antd';
import {
  listMyNotifications,
  markAllRead,
  markRead,
  type NotificationItem,
  type NotificationScope
} from '../../services/notifications-service';
import { ListSearch } from '../../components/primitives';
import { useListSearch } from '../../hooks/useListSearch';
import { NotificationList } from '../../components/notifications/NotificationList';
import { safeInternalLink } from '../../components/notifications/notification-labels';
import { useNotificationScope } from '../../components/notifications/useNotificationScope';
import { t } from '../../i18n/t';

const { Title } = Typography;

export interface NotificationsPageProps {
  /** Les portails fournissent leur scope ; par défaut, celui de l'agence du compte. */
  scope?: NotificationScope;
}

/** Centre de notifications : liste complète paginée, filtre « non lues », « tout marquer comme lu ». */
export const NotificationsPage: React.FC<NotificationsPageProps> = ({ scope: scopeProp }) => {
  const navigate = useNavigate();
  const agencyScope = useNotificationScope();
  const scope = scopeProp ?? agencyScope;
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Une réponse qui n'est pas la dernière demandée (filtre changé entre-temps) est ignorée.
  const latest = useRef(0);

  // Recherche multicritères (état dans l'URL) : titre ou message, non lues, période.
  const search = useListSearch({
    apiNames: { limit: 'pageSize', sort: false },
    criteria: [
      { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Titre ou message…'), api: 'q' },
      { key: 'unreadOnly', type: 'boolean', label: t('Non lues seulement'), primary: true },
      { key: 'period', type: 'dateRange', label: t('Période'), primary: true, api: ['from', 'to'] }
    ]
  });
  const paramsKey = JSON.stringify(search.apiParams);

  const load = useCallback(async () => {
    if (!scope) return;
    const request = ++latest.current;
    setLoading(true);
    setError(null);
    try {
      const result = await listMyNotifications(scope, JSON.parse(paramsKey));
      if (request !== latest.current) return;
      setItems(result.items);
      setTotal(result.total);
    } catch {
      if (request !== latest.current) return;
      setError(t('Les notifications ne se sont pas chargées.'));
    } finally {
      if (request === latest.current) setLoading(false);
    }
  }, [scope, paramsKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleMarkRead = async (item: NotificationItem) => {
    if (!scope) return;
    try {
      const { readAt } = await markRead(scope, item.id);
      setItems(previous => previous.map(entry => (entry.id === item.id ? { ...entry, readAt } : entry)));
    } catch {
      setError(t("La notification n'a pas pu être marquée comme lue."));
    }
  };

  const handleMarkAll = async () => {
    if (!scope) return;
    try {
      await markAllRead(scope);
      await load();
    } catch {
      setError(t("Les notifications n'ont pas pu être marquées comme lues."));
    }
  };

  const handleOpen = async (item: NotificationItem) => {
    if (item.readAt === null) await handleMarkRead(item);
    const target = safeInternalLink(item.link);
    if (target) navigate(target);
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Title level={2} style={{ margin: 0 }}>
        {t('Notifications')}
      </Title>
      <Card>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <ListSearch {...search.searchProps} resultCount={total} aria-label={t('Rechercher dans les notifications')} />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={() => void handleMarkAll()}>{t('Tout marquer comme lu')}</Button>
          </div>
          {error && <Alert type="error" showIcon message={error} />}
          <NotificationList
            items={items}
            loading={loading}
            emptyText={search.isFiltered ? t('Aucune notification ne correspond aux critères.') : undefined}
            onMarkRead={item => void handleMarkRead(item)}
            onOpen={item => void handleOpen(item)}
          />
          {total > search.pageSize && (
            <Pagination
              current={search.page}
              pageSize={search.pageSize}
              total={total}
              showSizeChanger={false}
              onChange={page => search.setPage(page)}
              style={{ textAlign: 'end' }}
            />
          )}
        </Space>
      </Card>
    </Space>
  );
};

export default NotificationsPage;
