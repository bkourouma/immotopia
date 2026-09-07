import React from 'react';
import { Button, Card, Popconfirm, Space, Table, Tag } from 'antd';
import type { PatrimonyDocument } from '../../types/patrimoine-types';

interface Props {
  documents: PatrimonyDocument[];
  onDelete?: (documentId: string) => void;
  deletingId?: string | null;
}

function getDocumentUrl(fileUrl?: string | null): string {
  if (!fileUrl) return '#';
  if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
    return fileUrl;
  }
  const apiBaseUrl = process.env.REACT_APP_API_URL || 'http://localhost:8001/api';
  const serverBaseUrl = apiBaseUrl.replace('/api', '');
  const normalizedFileUrl = fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`;
  return `${serverBaseUrl}${normalizedFileUrl}`;
}

function documentTypeLabel(type: PatrimonyDocument['type']): string {
  if (type === 'TITLE_DEED') return 'Titre de propriété';
  if (type === 'NOTARIAL_DEED') return 'Acte notarié';
  if (type === 'TAX_DOCUMENT') return 'Document fiscal';
  if (type === 'INSURANCE') return 'Assurance';
  if (type === 'TECHNICAL_DIAGNOSIS') return 'Diagnostic technique';
  if (type === 'FLOOR_PLAN') return 'Plan';
  if (type === 'BUILDING_PERMIT') return 'Permis de construire';
  if (type === 'OTHER') return 'Autre';
  return type;
}

function expiryInfo(expiresAt?: string | null): { label: string; color: string } {
  if (!expiresAt) return { label: 'Sans expiration', color: 'default' };
  const now = new Date();
  const expiryDate = new Date(expiresAt);
  const diffDays = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: 'Expire', color: 'red' };
  if (diffDays <= 30) return { label: `Expire dans ${diffDays}j`, color: 'orange' };
  return { label: 'Valide', color: 'green' };
}

export const DocumentVault: React.FC<Props> = ({ documents, onDelete, deletingId }) => {
  return (
    <Card title="Coffre-fort documentaire">
      <Table
        rowKey="id"
        dataSource={documents}
        pagination={{ pageSize: 5 }}
        columns={[
          { title: 'Titre', dataIndex: 'title' },
          { title: 'Type', dataIndex: 'type', render: (value: PatrimonyDocument['type']) => <Tag>{documentTypeLabel(value)}</Tag> },
          {
            title: 'Expiration',
            dataIndex: 'expiresAt',
            render: (value?: string | null) => {
              const info = expiryInfo(value);
              return (
                <Space>
                  {value ? new Date(value).toLocaleDateString('fr-FR') : '-'}
                  <Tag color={info.color}>{info.label}</Tag>
                </Space>
              );
            }
          },
          {
            title: 'Fichier',
            dataIndex: 'fileUrl',
            render: (value: string) => (
              <a href={getDocumentUrl(value)} target="_blank" rel="noreferrer">
                Ouvrir
              </a>
            )
          },
          {
            title: 'Actions',
            key: 'actions',
            render: (_: unknown, record: PatrimonyDocument) =>
              onDelete ? (
                <Popconfirm title="Supprimer ce document ?" onConfirm={() => onDelete(record.id)}>
                  <Button danger size="small" loading={deletingId === record.id}>
                    Supprimer
                  </Button>
                </Popconfirm>
              ) : null
          }
        ]}
      />
    </Card>
  );
};
