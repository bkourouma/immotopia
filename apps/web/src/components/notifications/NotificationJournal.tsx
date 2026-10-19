import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App as AntApp, Button, Card, DatePicker, Descriptions, Drawer, Input, Select, Space, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined, RedoOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { Table } from '../primitives';
import {
  listAdminNotifications,
  listNotificationRecipients,
  listPlatformNotifications,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_STATUSES,
  resendNotification,
  resendPlatformNotification,
  type AdminNotificationFilters,
  type AdminNotificationItem,
  type NotificationChannelKey,
  type NotificationRecipientOption,
  type NotificationStatusKey,
  type PlatformNotificationItem
} from '../../services/notifications-service';
import { listTenants, type Tenant } from '../../services/tenant-service';
import { channelLabel, formatDateTime, statusColor, statusLabel } from './notification-labels';
import { t } from '../../i18n/t';

const { RangePicker } = DatePicker;
const PAGE_SIZE = 20;

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

  const [recipientUserId, setRecipientUserId] = useState<string | undefined>();
  const [channel, setChannel] = useState<NotificationChannelKey | undefined>();
  const [status, setStatus] = useState<NotificationStatusKey | undefined>();
  const [range, setRange] = useState<[string, string] | null>(null);
  const [query, setQuery] = useState('');
  const [tenantFilter, setTenantFilter] = useState<string | undefined>();
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<JournalRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<JournalRow | null>(null);
  const [resending, setResending] = useState<string | null>(null);

  const [recipients, setRecipients] = useState<NotificationRecipientOption[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const latest = useRef(0);

  const filters = useMemo<AdminNotificationFilters & { tenantId?: string }>(
    () => ({
      recipientUserId,
      channel,
      status,
      q: query.trim() || undefined,
      from: range?.[0],
      to: range?.[1],
      tenantId: tenantFilter,
      page,
      pageSize: PAGE_SIZE
    }),
    [recipientUserId, channel, status, query, range, tenantFilter, page]
  );

  const load = useCallback(async () => {
    const request = ++latest.current;
    setLoading(true);
    setError(null);
    try {
      const result = tenantId
        ? await listAdminNotifications(tenantId, filters)
        : await listPlatformNotifications(filters);
      if (request !== latest.current) return;
      setRows(result.items as JournalRow[]);
      setTotal(result.total);
    } catch {
      if (request !== latest.current) return;
      setError(t("Le journal des notifications ne s'est pas chargé."));
    } finally {
      if (request === latest.current) setLoading(false);
    }
  }, [tenantId, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const searchRecipients = useCallback(
    async (q?: string) => {
      if (!tenantId) return;
      try {
        setRecipients(await listNotificationRecipients(tenantId, q));
      } catch {
        setRecipients([]);
      }
    },
    [tenantId]
  );

  const searchTenants = useCallback(async (search?: string) => {
    try {
      const response = await listTenants({ search, limit: 50 });
      setTenants(response.data.tenants);
    } catch {
      setTenants([]);
    }
  }, []);

  useEffect(() => {
    if (isPlatform) void searchTenants();
    else void searchRecipients();
  }, [isPlatform, searchRecipients, searchTenants]);

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
      <Card>
        <Space wrap size="middle" style={{ width: '100%' }}>
          {isPlatform ? (
            <Select
              showSearch
              allowClear
              filterOption={false}
              placeholder={t('Agence')}
              aria-label={t('Agence')}
              style={{ minWidth: 200 }}
              value={tenantFilter}
              onSearch={value => void searchTenants(value)}
              onChange={value => {
                setTenantFilter(value);
                setPage(1);
              }}
              options={tenants.map(tenant => ({ value: tenant.id, label: tenant.name }))}
            />
          ) : (
            <Select
              showSearch
              allowClear
              filterOption={false}
              placeholder={t('Destinataire')}
              aria-label={t('Destinataire')}
              style={{ minWidth: 200 }}
              value={recipientUserId}
              onSearch={value => void searchRecipients(value)}
              onChange={value => {
                setRecipientUserId(value);
                setPage(1);
              }}
              options={recipients.map(recipient => ({ value: recipient.userId, label: recipient.label }))}
            />
          )}
          <Select
            allowClear
            placeholder={t('Canal')}
            aria-label={t('Canal')}
            style={{ minWidth: 160 }}
            value={channel}
            onChange={value => {
              setChannel(value);
              setPage(1);
            }}
            options={NOTIFICATION_CHANNELS.map(value => ({ value, label: channelLabel(value) }))}
          />
          <Select
            allowClear
            placeholder={t('Statut')}
            aria-label={t('Statut')}
            style={{ minWidth: 150 }}
            value={status}
            onChange={value => {
              setStatus(value);
              setPage(1);
            }}
            options={NOTIFICATION_STATUSES.map(value => ({ value, label: statusLabel(value) }))}
          />
          <RangePicker
            value={range ? [dayjs(range[0]), dayjs(range[1])] : null}
            onChange={values => {
              setRange(
                values?.[0] && values[1] ? [values[0].format('YYYY-MM-DD'), values[1].format('YYYY-MM-DD')] : null
              );
              setPage(1);
            }}
          />
          <Input.Search
            allowClear
            placeholder={t('Rechercher')}
            aria-label={t('Rechercher')}
            style={{ width: 220 }}
            onSearch={value => {
              setQuery(value);
              setPage(1);
            }}
          />
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>
            {t('Actualiser')}
          </Button>
        </Space>
      </Card>

      {error && <Alert type="error" showIcon message={error} />}

      <Table<JournalRow>
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={loading}
        exportable={false}
        scroll={{ x: 'max-content' }}
        onRow={row => ({ onClick: () => setSelected(row), style: { cursor: 'pointer' } })}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showSizeChanger: false,
          onChange: setPage
        }}
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
