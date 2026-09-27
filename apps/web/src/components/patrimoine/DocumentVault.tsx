import React, { useState } from 'react';
import { Button, Card, Popconfirm, Space, Table, Tag } from 'antd';
import type { PatrimonyDocument } from '../../types/patrimoine-types';
import { downloadPropertyDocumentFile } from '../../services/property-service';
import { feedback } from '../../lib/feedback';
import { saveBlob } from '../../utils/save-blob';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
interface Props {
  documents: PatrimonyDocument[];
  /** Agence et bien : un fichier déposé se télécharge par la route authentifiée. */
  tenantId: string;
  propertyId: string;
  onDelete?: (documentId: string) => void;
  deletingId?: string | null;
}

/**
 * Un lien externe saisi à la main s'ouvre tel quel. Un fichier déposé
 * (`/uploads/properties/<bien>/documents/...`) n'est plus servi en statique :
 * il se télécharge par `GET .../documents/:documentId/file`, qui vérifie
 * l'agence, le bien et la permission `PROPERTIES_VIEW`.
 */
function isExternalUrl(fileUrl?: string | null): fileUrl is string {
  return Boolean(fileUrl && /^https?:\/\//i.test(fileUrl));
}

function documentTypeLabel(type: PatrimonyDocument['type']): string {
  if (type === 'TITLE_DEED') return t('Titre de propriété');
  if (type === 'NOTARIAL_DEED') return t('Acte notarié');
  if (type === 'TAX_DOCUMENT') return t('Document fiscal');
  if (type === 'INSURANCE') return 'Assurance';
  if (type === 'TECHNICAL_DIAGNOSIS') return t('Diagnostic technique');
  if (type === 'FLOOR_PLAN') return 'Plan';
  if (type === 'BUILDING_PERMIT') return t('Permis de construire');
  if (type === 'OTHER') return 'Autre';
  return type;
}

function expiryInfo(expiresAt?: string | null): { label: string; color: string } {
  if (!expiresAt) return { label: t('Sans expiration'), color: 'default' };
  const now = new Date();
  const expiryDate = new Date(expiresAt);
  const diffDays = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: t('Expire'), color: 'red' };
  if (diffDays <= 30) return { label: t('Expire dans {{diffDays}}j', { diffDays: diffDays }), color: 'orange' };
  return { label: t('Valide'), color: 'green' };
}

export const DocumentVault: React.FC<Props> = ({ documents, tenantId, propertyId, onDelete, deletingId }) => {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const download = async (document: PatrimonyDocument) => {
    setDownloadingId(document.id);
    try {
      const { blob, filename } = await downloadPropertyDocumentFile(tenantId, propertyId, document.id, document.title);
      saveBlob(blob, filename);
    } catch {
      feedback.error(t('Téléchargement impossible.'));
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <Card title={t('Coffre-fort documentaire')}>
      <Table
        scroll={{ x: 'max-content' }}
        rowKey="id"
        dataSource={documents}
        pagination={{ pageSize: 5 }}
        columns={[
          { title: 'Titre', dataIndex: 'title' },
          {
            title: 'Type',
            dataIndex: 'type',
            render: (value: PatrimonyDocument['type']) => <Tag>{documentTypeLabel(value)}</Tag>
          },
          {
            title: 'Expiration',
            dataIndex: 'expiresAt',
            render: (value?: string | null) => {
              const info = expiryInfo(value);
              return (
                <Space>
                  {value ? new Date(value).toLocaleDateString(activeLocale()) : '-'}
                  <Tag color={info.color}>{info.label}</Tag>
                </Space>
              );
            }
          },
          {
            title: 'Fichier',
            dataIndex: 'fileUrl',
            render: (value: string | null | undefined, record: PatrimonyDocument) =>
              isExternalUrl(value) ? (
                <a href={value} target="_blank" rel="noopener noreferrer">
                  {t('Ouvrir')}
                </a>
              ) : value ? (
                <Button type="link" size="small" loading={downloadingId === record.id} onClick={() => download(record)}>
                  {t('Ouvrir')}
                </Button>
              ) : (
                '-'
              )
          },
          {
            title: 'Actions',
            key: 'actions',
            render: (_: unknown, record: PatrimonyDocument) =>
              onDelete ? (
                <Popconfirm title={t('Supprimer ce document ?')} onConfirm={() => onDelete(record.id)}>
                  <Button danger size="small" loading={deletingId === record.id}>
                    {t('Supprimer')}
                  </Button>
                </Popconfirm>
              ) : null
          }
        ]}
      />
    </Card>
  );
};
