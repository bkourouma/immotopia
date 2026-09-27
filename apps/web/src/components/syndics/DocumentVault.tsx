import React, { useState } from 'react';
import { Button, Table, Tag, Typography } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { SyndicateDocument } from '../../types/syndic-types';
import { downloadSyndicDocument } from '../../services/syndic-service';
import { feedback } from '../../lib/feedback';
import { saveBlob } from '../../utils/save-blob';
import { t } from '../../i18n/t';

const { Link, Text } = Typography;

interface DocumentVaultProps {
  documents: SyndicateDocument[];
  /** Agence et copropriété : le fichier se télécharge par la route de gestion. */
  tenantId: string;
  syndicId: string;
  loading?: boolean;
}

function isExternalUrl(fileUrl: string | null | undefined): fileUrl is string {
  return Boolean(fileUrl && /^https?:\/\//i.test(fileUrl));
}

const DOCUMENT_TYPE_LABELS: Record<SyndicateDocument['type'], string> = {
  REGULATION: 'Reglement',
  GENERAL_MEETING_MINUTES: t("Proces-verbal d'AG"),
  DIAGNOSTIC: 'Diagnostic',
  INSURANCE: 'Assurance',
  BUDGET: 'Budget',
  OTHER: 'Autre'
};

/**
 * Coffre documentaire d'une copropriété.
 *
 * Un fichier déposé ne s'ouvre plus par un lien direct vers
 * `/uploads/syndics/...` : le service statique le refuse (document privé,
 * AGENTS.md). « Télécharger » passe par la route authentifiée
 * `GET .../documents/:documentId/fichier`, qui vérifie l'agence. Un lien
 * externe saisi par le gestionnaire s'ouvre tel quel.
 */
export const DocumentVault: React.FC<DocumentVaultProps> = ({ documents, tenantId, syndicId, loading = false }) => {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const download = async (document: SyndicateDocument) => {
    setDownloadingId(document.id);
    try {
      const { blob, filename } = await downloadSyndicDocument(tenantId, syndicId, document.id, document.title);
      saveBlob(blob, filename);
    } catch {
      feedback.error(t('Téléchargement impossible.'));
    } finally {
      setDownloadingId(null);
    }
  };

  const columns: ColumnsType<SyndicateDocument> = [
    { title: t('Titre'), dataIndex: 'title', key: 'title', render: (value: string) => <Text strong>{value}</Text> },
    {
      title: t('Type'),
      dataIndex: 'type',
      key: 'type',
      render: (value: SyndicateDocument['type']) => <Tag>{DOCUMENT_TYPE_LABELS[value] ?? value}</Tag>
    },
    {
      title: t('Expiration'),
      dataIndex: 'expiresAt',
      key: 'expiresAt',
      render: (value?: string | null) => {
        if (!value) return t('Sans expiration');
        const expired = dayjs(value).isBefore(dayjs(), 'day');
        return <Text type={expired ? 'danger' : undefined}>{dayjs(value).format('DD/MM/YYYY')}</Text>;
      }
    },
    {
      title: t('Document'),
      key: 'fileUrl',
      render: (_: unknown, item: SyndicateDocument) =>
        isExternalUrl(item.fileUrl) ? (
          <Link href={item.fileUrl} target="_blank" rel="noopener noreferrer">
            {t('Ouvrir')}
          </Link>
        ) : (
          <Button
            size="small"
            icon={<DownloadOutlined />}
            loading={downloadingId === item.id}
            onClick={() => void download(item)}
          >
            {t('Télécharger')}
          </Button>
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
