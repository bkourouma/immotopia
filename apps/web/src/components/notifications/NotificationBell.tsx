import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Badge, Button, Drawer, Space, Switch, Typography } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { useVisiblePolling } from '../../hooks/useVisiblePolling';
import {
  getUnreadCount,
  listMyNotifications,
  markAllRead,
  markRead,
  type NotificationItem,
  type NotificationScope
} from '../../services/notifications-service';
import { NotificationList } from './NotificationList';
import { safeInternalLink } from './notification-labels';
import { t } from '../../i18n/t';

/** Délai entre deux lectures du compteur (suspendu quand l'onglet est masqué). */
export const NOTIFICATION_POLL_MS = 30_000;
const DRAWER_PAGE_SIZE = 20;

export interface NotificationBellProps {
  scope: NotificationScope;
  /** Adresse de la page complète du centre de notifications. */
  allHref?: string;
}

/**
 * Cloche de l'en-tête : pastille de non-lus et tiroir des dernières
 * notifications. Le compteur est relu toutes les 30 s tant que l'onglet est
 * visible ; une erreur réseau garde la dernière valeur connue.
 */
export const NotificationBell: React.FC<NotificationBellProps> = ({ scope, allHref = '/notifications' }) => {
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const { refresh } = useVisiblePolling(
    async () => {
      try {
        setCount(await getUnreadCount(scope));
      } catch {
        // Dernière valeur conservée : une cloche qui clignote sur une panne passagère n'aide personne.
      }
    },
    { intervalMs: NOTIFICATION_POLL_MS, resetKey: scope.kind === 'agency' ? scope.tenantId : scope.portal }
  );

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const page = await listMyNotifications(scope, { unreadOnly, page: 1, pageSize: DRAWER_PAGE_SIZE });
      setItems(page.items);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [scope, unreadOnly]);

  useEffect(() => {
    if (open) void loadItems();
  }, [open, loadItems]);

  const handleMarkRead = async (item: NotificationItem) => {
    try {
      const { readAt } = await markRead(scope, item.id);
      setItems(previous => previous.map(entry => (entry.id === item.id ? { ...entry, readAt } : entry)));
      setCount(previous => Math.max(0, previous - (item.readAt === null ? 1 : 0)));
    } catch {
      setError(true);
    }
  };

  const handleMarkAll = async () => {
    try {
      await markAllRead(scope);
      setCount(0);
      await loadItems();
      refresh();
    } catch {
      setError(true);
    }
  };

  const handleOpenItem = async (item: NotificationItem) => {
    if (item.readAt === null) await handleMarkRead(item);
    const target = safeInternalLink(item.link);
    if (target) {
      setOpen(false);
      navigate(target);
    }
  };

  return (
    <>
      <Badge count={count} size="small" overflowCount={99} offset={[-4, 4]}>
        <Button
          type="text"
          aria-label={count > 0 ? t('Notifications ({{count}} non lues)', { count }) : t('Notifications')}
          icon={<BellOutlined style={{ fontSize: 20 }} />}
          // 44 px : plancher tactile.
          style={{ minWidth: 44, height: 44 }}
          onClick={() => setOpen(true)}
        />
      </Badge>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={t('Notifications')}
        width={400}
        extra={
          <Button
            size="small"
            onClick={() => {
              setOpen(false);
              navigate(allHref);
            }}
          >
            {t('Tout voir')}
          </Button>
        }
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space style={{ justifyContent: 'space-between', width: '100%' }} wrap>
            <Space size="small">
              <Switch size="small" checked={unreadOnly} onChange={setUnreadOnly} aria-label={t('Non lues seulement')} />
              <Typography.Text>{t('Non lues seulement')}</Typography.Text>
            </Space>
            <Button size="small" disabled={count === 0} onClick={() => void handleMarkAll()}>
              {t('Tout marquer comme lu')}
            </Button>
          </Space>
          {error && <Alert type="error" showIcon message={t('Les notifications ne se sont pas chargées.')} />}
          <NotificationList
            compact
            items={items}
            loading={loading}
            onMarkRead={item => void handleMarkRead(item)}
            onOpen={item => void handleOpenItem(item)}
          />
        </Space>
      </Drawer>
    </>
  );
};
