import React from 'react';
import { Alert, Badge, Button, Empty, List, Skeleton, Space, Tag, Typography } from 'antd';
import { CheckOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import type { NotificationItem } from '../../services/notifications-service';
import { channelLabel, formatDateTime, statusColor, statusLabel } from './notification-labels';
import { t } from '../../i18n/t';

const { Text } = Typography;

export interface NotificationListProps {
  items: NotificationItem[];
  loading?: boolean;
  /** Marque une notification comme lue. */
  onMarkRead: (item: NotificationItem) => void;
  /** Ouvre la cible de la notification (son lien). Absent : pas de lien. */
  onOpen?: (item: NotificationItem) => void;
  /** Version resserrée pour le tiroir de la cloche. */
  compact?: boolean;
}

/**
 * Liste de notifications, partagée par le tiroir de la cloche et la page du
 * centre de notifications. Un canal en échec est montré en rouge avec son
 * motif : l'utilisateur doit voir qu'un message n'est pas parti.
 */
export const NotificationList: React.FC<NotificationListProps> = ({
  items,
  loading = false,
  onMarkRead,
  onOpen,
  compact = false
}) => {
  if (loading && items.length === 0) {
    return <Skeleton active paragraph={{ rows: compact ? 3 : 5 }} />;
  }
  if (items.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('Aucune notification')} />;
  }

  return (
    <List
      loading={loading}
      dataSource={items}
      renderItem={item => {
        const unread = item.readAt === null;
        const failed = item.deliveries.filter(delivery => delivery.status === 'FAILED');
        const hasFailure = failed.length > 0 || item.status === 'FAILED';
        const failureReason = item.failureReason ?? failed.find(delivery => delivery.failureReason)?.failureReason;
        return (
          <List.Item
            key={item.id}
            data-testid="notification-item"
            data-unread={unread ? 'true' : 'false'}
            style={{ paddingInline: 0, alignItems: 'flex-start' }}
            actions={
              unread
                ? [
                    <Button
                      key="read"
                      type="text"
                      size="small"
                      icon={<CheckOutlined />}
                      aria-label={t('Marquer comme lue')}
                      onClick={() => onMarkRead(item)}
                    >
                      {compact ? null : t('Marquer comme lue')}
                    </Button>
                  ]
                : undefined
            }
          >
            <List.Item.Meta
              avatar={unread ? <Badge status="processing" aria-label={t('Non lue')} /> : null}
              title={
                onOpen && item.link ? (
                  <Button type="link" style={{ padding: 0, height: 'auto' }} onClick={() => onOpen(item)}>
                    <Text strong={unread}>{item.title}</Text>
                  </Button>
                ) : (
                  <Text strong={unread}>{item.title}</Text>
                )
              }
              description={
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <Text type="secondary" style={{ whiteSpace: 'pre-line' }}>
                    {item.body}
                  </Text>
                  <Space size={[4, 4]} wrap>
                    <Text type="secondary" style={{ fontSize: 'var(--font-size-caption)' }}>
                      {formatDateTime(item.createdAt)}
                    </Text>
                    {item.deliveries.map(delivery => (
                      <Tag key={delivery.channel} color={statusColor(delivery.status)} style={{ marginInlineEnd: 0 }}>
                        {channelLabel(delivery.channel)} · {statusLabel(delivery.status)}
                      </Tag>
                    ))}
                  </Space>
                  {hasFailure && (
                    <Alert
                      type="error"
                      showIcon
                      icon={<ExclamationCircleOutlined />}
                      message={t('Un envoi a échoué')}
                      description={failureReason ?? undefined}
                    />
                  )}
                </Space>
              }
            />
          </List.Item>
        );
      }}
    />
  );
};
