import React from 'react';
import { Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { SyndicateDocument } from '../../types/syndic-types';
import { API_URL } from '../../config/api';

const { Link, Text } = Typography;

interface DocumentVaultProps {
  documents: SyndicateDocument[];
  loading?: boolean;
}

const DOCUMENT_TYPE_LABELS: Record<SyndicateDocument['type'], string> = {
  REGULATION: 'Reglement',
  GENERAL_MEETING_MINUTES: "Proces-verbal d'AG",
  DIAGNOSTIC: 'Diagnostic',
  INSURANCE: 'Assurance',
  BUDGET: 'Budget',
  OTHER: 'Autre'
};

export const DocumentVault: React.FC<DocumentVaultProps> = ({ documents, loading = false }) => {
  const getDocumentUrl = (fileUrl: string): string => {
    if (!fileUrl) return '#';
    if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
      return fileUrl;
    }

    const apiBaseUrl = API_URL;
    const serverBaseUrl = apiBaseUrl.replace('/api', '');
    const normalizedFileUrl = fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`;
    return `${serverBaseUrl}${normalizedFileUrl}`;
  };

  const columns: ColumnsType<SyndicateDocument> = [
    { title: 'Titre', dataIndex: 'title', key: 'title', render: (value: string) => <Text strong>{value}</Text> },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      render: (value: SyndicateDocument['type']) => <Tag>{DOCUMENT_TYPE_LABELS[value] ?? value}</Tag>
    },
    {
      title: 'Expiration',
      dataIndex: 'expiresAt',
      key: 'expiresAt',
      render: (value?: string | null) => {
        if (!value) return 'Sans expiration';
        const expired = dayjs(value).isBefore(dayjs(), 'day');
        return <Text type={expired ? 'danger' : undefined}>{dayjs(value).format('DD/MM/YYYY')}</Text>;
      }
    },
    {
      title: 'Document',
      key: 'fileUrl',
      render: (_: unknown, item: SyndicateDocument) => (
        <Link href={getDocumentUrl(item.fileUrl)} target="_blank" rel="noreferrer">
          Ouvrir
        </Link>
      )
    }
  ];

  return (
    <Table
      scroll={{ x: 'max-content' }}
      rowKey="id"
      dataSource={documents}
      columns={columns}
      loading={loading}
      pagination={{ pageSize: 8, hideOnSinglePage: true }}
      locale={{ emptyText: 'Aucun document disponible' }}
    />
  );
};
