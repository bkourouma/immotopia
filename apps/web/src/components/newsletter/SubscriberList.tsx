import React from 'react';
import { Table, Tag, Button, Space, Typography } from 'antd';
import { DeleteOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import type { NewsletterSubscriber } from '../../services/newsletter.service';
import { t as translate } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
interface SubscriberListProps {
  subscribers: NewsletterSubscriber[];
  loading?: boolean;
  pagination: { total: number; page: number; limit: number; totalPages: number };
  onPageChange: (page: number, limit?: number) => void;
  onRemove: (sub: NewsletterSubscriber) => void;
  onImport: () => void;
  onExport: () => void;
  canEdit?: boolean;
}

const statusColors: Record<string, string> = {
  PENDING_CONFIRMATION: 'gold',
  ACTIVE: 'green',
  UNSUBSCRIBED: 'default'
};

const statusLabels: Record<string, string> = {
  PENDING_CONFIRMATION: translate('En attente'),
  ACTIVE: 'Actif',
  UNSUBSCRIBED: translate('Désabonné')
};

export function SubscriberList({
  subscribers,
  loading,
  pagination,
  onPageChange,
  onRemove,
  onImport,
  onExport,
  canEdit = true
}: SubscriberListProps) {
  const columns = [
    {
      title: translate('Email'),
      dataIndex: 'email',
      key: 'email',
      render: (v: string) => <Typography.Text copyable>{v}</Typography.Text>
    },
    {
      title: translate('Nom'),
      dataIndex: 'name',
      key: 'name',
      render: (v: string | null) => v || '—'
    },
    {
      title: translate('Statut'),
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => <Tag color={statusColors[s] ?? 'default'}>{statusLabels[s] ?? s}</Tag>
    },
    {
      title: translate('Inscrit le'),
      dataIndex: 'subscribedAt',
      key: 'subscribedAt',
      render: (v: string) => (v ? new Date(v).toLocaleDateString(activeLocale()) : '—')
    },
    ...(canEdit
      ? [
          {
            title: '',
            key: 'actions',
            render: (_: unknown, record: NewsletterSubscriber) => (
              <Button type="link" danger size="small" icon={<DeleteOutlined />} onClick={() => onRemove(record)}>
                {translate('Retirer')}
              </Button>
            )
          }
        ]
      : [])
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
        {canEdit && (
          <Button icon={<UploadOutlined />} onClick={onImport}>
            {translate('Importer CSV')}
          </Button>
        )}
        <Button icon={<DownloadOutlined />} onClick={onExport}>
          {translate('Exporter CSV')}
        </Button>
      </div>
      <Table
        scroll={{ x: 'max-content' }}
        loading={loading}
        columns={columns}
        dataSource={subscribers}
        rowKey="id"
        pagination={{
          current: pagination.page,
          pageSize: pagination.limit,
          total: pagination.total,
          showSizeChanger: true,
          showTotal: t => translate('Total: {{t}} abonnés', { t: t }),
          onChange: onPageChange
        }}
      />
    </div>
  );
}
