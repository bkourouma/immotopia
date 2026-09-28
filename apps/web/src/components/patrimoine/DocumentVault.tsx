import React, { useState } from 'react';
import { Button, Card, Popconfirm, Space, Table, Tag } from 'antd';
import type { PropertyDocument } from '../../types/property-types';
import { downloadPropertyDocumentFile } from '../../services/property-service';
import { feedback } from '../../lib/feedback';
import { saveBlob } from '../../utils/save-blob';
import { t } from '../../i18n/t';
import { activeLocale } from '../../i18n/format';
import { apiErrorMessage, documentTypeLabel } from './patrimoine-labels';

interface Props {
  documents: PropertyDocument[];
  /** Agence et bien : le fichier se télécharge par la route authentifiée. */
  tenantId: string;
  propertyId: string;
  /** Absent quand l'utilisateur ne peut pas modifier le bien : pas de bouton Supprimer. */
  onDelete?: (documentId: string) => void;
  deletingId?: string | null;
  /** Action d'en-tête (bouton « Ajouter »), absente en lecture seule. */
  extra?: React.ReactNode;
}

function expiryInfo(expiresAt?: string | null): { label: string; color: string } {
  if (!expiresAt) return { label: t('Sans expiration'), color: 'default' };
  const diffDays = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: t('Expiré'), color: 'red' };
  if (diffDays <= 30) return { label: t('Expire dans {{diffDays}}j', { diffDays }), color: 'orange' };
  return { label: t('Valide'), color: 'green' };
}

/**
 * Coffre-fort documentaire d'un bien.
 *
 * Les fichiers ne sont jamais servis en statique : « Télécharger » passe par
 * `GET .../documents/:documentId/file`, qui vérifie l'agence, le bien et la
 * permission `PROPERTIES_VIEW`.
 */
export const DocumentVault: React.FC<Props> = ({ documents, tenantId, propertyId, onDelete, deletingId, extra }) => {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const download = async (document: PropertyDocument) => {
    setDownloadingId(document.id);
    try {
      const { blob, filename } = await downloadPropertyDocumentFile(
        tenantId,
        propertyId,
        document.id,
        document.fileName || 'document'
      );
      saveBlob(blob, filename);
    } catch (error) {
      feedback.error(apiErrorMessage(error, t('Téléchargement impossible.')));
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <Card title={t('Coffre-fort documentaire')} extra={extra}>
      <Table
        scroll={{ x: 'max-content' }}
        rowKey="id"
        dataSource={documents}
        pagination={{ pageSize: 5 }}
        locale={{ emptyText: t('Aucun document pour ce bien.') }}
        columns={[
          { title: t('Nom du fichier'), dataIndex: 'fileName' },
          {
            title: t('Type'),
            dataIndex: 'documentType',
            render: (value: string) => <Tag>{documentTypeLabel(value)}</Tag>
          },
          {
            title: t('Expiration'),
            dataIndex: 'expirationDate',
            render: (value?: string | null) => {
              const info = expiryInfo(value);
              return (
                <Space>
                  {value ? new Date(value).toLocaleDateString(activeLocale()) : '—'}
                  <Tag color={info.color}>{info.label}</Tag>
                </Space>
              );
            }
          },
          {
            title: t('Ajouté le'),
            dataIndex: 'createdAt',
            render: (value?: string) => (value ? new Date(value).toLocaleDateString(activeLocale()) : '—')
          },
          {
            title: t('Actions'),
            key: 'actions',
            render: (_: unknown, record: PropertyDocument) => (
              <Space>
                <Button size="small" loading={downloadingId === record.id} onClick={() => download(record)}>
                  {t('Télécharger')}
                </Button>
                {onDelete ? (
                  <Popconfirm title={t('Supprimer ce document ?')} onConfirm={() => onDelete(record.id)}>
                    <Button danger size="small" loading={deletingId === record.id}>
                      {t('Supprimer')}
                    </Button>
                  </Popconfirm>
                ) : null}
              </Space>
            )
          }
        ]}
      />
    </Card>
  );
};
