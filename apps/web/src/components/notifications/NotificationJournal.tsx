import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, App as AntApp, Button, Card, Descriptions, Drawer, Space, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined, RedoOutlined } from '@ant-design/icons';
import { Table } from '../primitives';
import {
  listAdminNotifications,
  listNotificationRecipients,
  listPlatformNotifications,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_STATUSES,
  resendNotification,
  resendPlatformNotification,
  type AdminNotificationItem,
  type NotificationChannelKey,
  type NotificationStatusKey,
  type PlatformNotificationItem
} from '../../services/notifications-service';
import { getTenantAdmin, listTenants } from '../../services/tenant-service';
import { useListSearch } from '../../hooks/useListSearch';
import { channelLabel, formatDateTime, statusColor, statusLabel } from './notification-labels';
import { t } from '../../i18n/t';

const OPTIONS_LIMIT = 20;

export type NotificationJournalMode = { kind: 'agency'; tenantId: string } | { kind: 'platform' };

type JournalRow = AdminNotificationItem & Partial<Pick<PlatformNotificationItem, 'tenant'>>;

/** Un envoi est « rejouable » dès qu'un de ses canaux est en échec. */
function hasFailedDelivery(item: AdminNotificationItem): boolean {
  return item.status === 'FAILED' || item.deliveries.some(delivery => delivery.status === 'FAILED');
}

export interface NotificationJournalProps {
  mode: NotificationJournalMode;
}

/**
 * Journal des notifications : tableau filtrable (destinataire, canal, statut,
 * période, recherche), détail par canal avec motif d'échec et nombre de
 * tentatives, bouton « Renvoyer » sur les envois en échec. Sert le journal de
 * l'agence (`mode.kind === 'agency'`) et celui de la plateforme (toutes
 * agences, filtre et colonne « Agence »).
 */
export const NotificationJournal: React.FC<NotificationJournalProps> = ({ mode }) => {
  const { message } = AntApp.useApp();
  const isPlatform = mode.kind === 'platform';
  const tenantId = mode.kind === 'agency' ? mode.tenantId : null;

  const [rows, setRows] = useState<JournalRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<JournalRow | null>(null);
  const [resending, setResending] = useState<string | null>(null);
  const latest = useRef(0);

  // Les fonctions de chargement des options sont figées au premier rendu : l'agence est lue par une ref.
  const tenantIdRef = useRef(tenantId);
  tenantIdRef.current = tenantId;

  // Recherche multicritères (état dans l'URL). Destinataire (agence) ou agence
  // (plateforme), canal et statut en ligne ; la période sous « Plus de critères ».
  const search = useListSearch({
    apiNames: { limit: 'pageSize', sort: false },
    criteria: [
      {
        key: 'q',
        type: 'text',
        label: t('Rechercher'),
        placeholder: t('Destinataire, titre, message…'),
        api: 'q'
      },
      isPlatform
        ? {
            key: 'tenantId',
            type: 'select' as const,
            label: t('Agence'),
            primary: true,
            loadOptions: async (term: string) => {
              const response = await listTenants({ search: term.trim() || undefined, limit: OPTIONS_LIMIT });
              return response.data.tenants.map(tenant => ({ value: tenant.id, label: tenant.name }));
            },
            resolveLabel: async (id: string) => (await getTenantAdmin(id)).data?.name
          }
        : {
            key: 'recipientUserId',
            type: 'select' as const,
            label: t('Destinataire'),
            primary: true,
            loadOptions: async (term: string) => {
              const found = await listNotificationRecipients(tenantIdRef.current ?? '', term.trim() || undefined);
              return found
                .slice(0, OPTIONS_LIMIT)
                .map(recipient => ({ value: recipient.userId, label: recipient.label }));
            },
            // Le libellé d'un destinataire venu de l'URL est retrouvé par une recherche sur son nom.
            resolveLabel: async (id: string) => {
              const found = await listNotificationRecipients(tenantIdRef.current ?? '');
              return found.find(recipient => recipient.userId === id)?.label;
            }
          },
      {
        key: 'channel',
        type: 'select',
        label: t('Canal'),
        primary: true,
        options: NOTIFICATION_CHANNELS.map(value => ({ value, label: channelLabel(value) }))
      },
      {
        key: 'status',
        type: 'select',
        label: t('Statut'),
        primary: true,
        options: NOTIFICATION_STATUSES.map(value => ({ value, label: statusLabel(value) }))
      },
      { key: 'period', type: 'dateRange', label: t('Période'), api: ['from', 'to'] }
    ]
  });

  const paramsKey = JSON.stringify(search.apiParams);

  const load = useCallback(async () => {
    const request = ++latest.current;
    setLoading(true);
    setError(null);
    try {
      const params = JSON.parse(paramsKey);
      const result = tenantId
        ? await listAdminNotifications(tenantId, params)
        : await listPlatformNotifications(params);
      if (request !== latest.current) return;
      setRows(result.items as JournalRow[]);
      setTotal(result.total);
    } catch {
      if (request !== latest.current) return;
      setError(t("Le journal des notifications ne s'est pas chargé."));
    } finally {
      if (request === latest.current) setLoading(false);
    }
  }, [tenantId, paramsKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleResend = async (row: JournalRow) => {
    setResending(row.id);
    try {
      const updated = (
        tenantId ? await resendNotification(tenantId, row.id) : await resendPlatformNotification(row.id)
      ) as JournalRow;
      const merged: JournalRow = { ...row, ...updated };
      setRows(previous => previous.map(entry => (entry.id === row.id ? merged : entry)));
      setSelected(previous => (previous && previous.id === row.id ? merged : previous));
      if (hasFailedDelivery(merged)) {
        message.warning(t('Le renvoi a de nouveau échoué : voir le motif dans le détail.'));
      } else {
        message.success(t('Notification renvoyée.'));
      }
    } catch {
      message.error(t("Le renvoi n'a pas pu être lancé."));
    } finally {
      setResending(null);
    }
  };

  const resendButton = (row: JournalRow) =>
    hasFailedDelivery(row) ? (
      <Button
        size="small"
        icon={<RedoOutlined />}
        loading={resending === row.id}
        onClick={event => {
          event.stopPropagation();
          void handleResend(row);
        }}
      >
        {t('Renvoyer')}
      </Button>
    ) : null;

  const columns: ColumnsType<JournalRow> = [
    { title: t('Date'), key: 'createdAt', width: 150, render: (_, row) => formatDateTime(row.createdAt) },
    ...(isPlatform
      ? [{ title: t('Agence'), key: 'tenant', width: 160, render: (_: unknown, row: JournalRow) => row.tenant?.name }]
      : []),
    { title: t('Destinataire'), key: 'recipient', width: 180, render: (_, row) => row.recipient.label },
    { title: t('Notification'), key: 'title', render: (_, row) => row.title },
    {
      title: t('Canaux'),
      key: 'channels',
      width: 260,
      render: (_, row) => (
        <Space size={[4, 4]} wrap>
          {row.deliveries.map(delivery => (
            <Tag key={delivery.channel} color={statusColor(delivery.status)} style={{ marginInlineEnd: 0 }}>
              {channelLabel(delivery.channel)} · {statusLabel(delivery.status)}
            </Tag>
          ))}
        </Space>
      )
    },
    {
      title: t('Statut'),
      key: 'status',
      width: 110,
      render: (_, row) => <Tag color={statusColor(row.status)}>{statusLabel(row.status)}</Tag>
    },
    {
      title: '',
      key: 'actions',
      width: 120,
      align: 'end',
      render: (_, row) => resendButton(row)
    }
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>
          {t('Actualiser')}
        </Button>
      </div>

      {error && <Alert type="error" showIcon message={error} />}

      <Table<JournalRow>
        aria-label={t('Journal des notifications')}
        search={search.searchProps}
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={loading}
        exportable={false}
        scroll={{ x: 'max-content' }}
        onRow={row => ({ onClick: () => setSelected(row), style: { cursor: 'pointer' } })}
        pagination={search.tablePagination(total)}
      />

      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        width={520}
        title={selected?.title ?? t('Détail')}
        extra={selected ? resendButton(selected) : null}
      >
        {selected && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label={t('Destinataire')}>{selected.recipient.label}</Descriptions.Item>
              {selected.tenant && <Descriptions.Item label={t('Agence')}>{selected.tenant.name}</Descriptions.Item>}
              {selected.sender && (
                <Descriptions.Item label={t('Déclenchée par')}>{selected.sender.label}</Descriptions.Item>
              )}
              <Descriptions.Item label={t('Date')}>{formatDateTime(selected.createdAt)}</Descriptions.Item>
              <Descriptions.Item label={t('Message')}>
                <span style={{ whiteSpace: 'pre-line' }}>{selected.body}</span>
              </Descriptions.Item>
            </Descriptions>
            {selected.deliveries.map(delivery => (
              <Card
                key={delivery.channel}
                size="small"
                title={channelLabel(delivery.channel)}
                extra={<Tag color={statusColor(delivery.status)}>{statusLabel(delivery.status)}</Tag>}
              >
                <Descriptions column={1} size="small">
                  {delivery.target && <Descriptions.Item label={t('Cible')}>{delivery.target}</Descriptions.Item>}
                  <Descriptions.Item label={t('Tentatives')}>{delivery.attempts}</Descriptions.Item>
                  <Descriptions.Item label={t('Dernière tentative')}>
                    {formatDateTime(delivery.lastAttemptAt)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('Envoyée le')}>{formatDateTime(delivery.sentAt)}</Descriptions.Item>
                </Descriptions>
                {delivery.status === 'FAILED' && (
                  <Alert
                    type="error"
                    showIcon
                    message={t("Échec de l'envoi")}
                    description={delivery.failureReason ?? t('Motif non communiqué.')}
                  />
                )}
              </Card>
            ))}
          </Space>
        )}
      </Drawer>
    </Space>
  );
};
