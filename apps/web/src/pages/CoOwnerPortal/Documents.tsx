import React, { useState } from 'react';
import { Button, Card, Space, Typography } from 'antd';
import { DownloadOutlined, LinkOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { DataCard, DataView, SkeletonList, StateBlock } from '../../components/primitives';
import { feedback } from '../../lib/feedback';
import { t } from '../../i18n/t';
import { downloadCoOwnerDocument, listMyDocuments, type CoOwnerDocument } from '../../services/coowner-portal-service';
import { documentTypeLabel } from './labels';
import { saveBlob } from '../../utils/save-blob';
import { portalErrorMessage } from './portal-error';

const { Title, Text } = Typography;

/**
 * Documents de copropriété : le règlement et les procès-verbaux d'assemblée
 * générale des copropriétés où le copropriétaire a un lot. Les autres types
 * (diagnostics, assurances, budgets...) restent réservés à la gestion — voir
 * `listCoOwnerDocuments` côté API.
 */
export default function CoOwnerDocuments() {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const {
    data: documents,
    isPending,
    error,
    refetch
  } = useQuery({
    queryKey: ['coowner-portal', 'documents'],
    queryFn: () => listMyDocuments()
  });

  const download = async (document: CoOwnerDocument) => {
    setDownloadingId(document.id);
    try {
      const { blob, filename } = await downloadCoOwnerDocument(document.id, document.title);
      saveBlob(blob, filename);
    } catch {
      feedback.error(t('Téléchargement impossible.'));
    } finally {
      setDownloadingId(null);
    }
  };

  const action = (document: CoOwnerDocument) => {
    if (document.downloadable) {
      return (
        <Button
          icon={<DownloadOutlined />}
          loading={downloadingId === document.id}
          onClick={() => void download(document)}
        >
          {t('Télécharger')}
        </Button>
      );
    }
    if (document.externalUrl) {
      return (
        <Button icon={<LinkOutlined />} href={document.externalUrl} target="_blank" rel="noopener noreferrer">
          {t('Ouvrir')}
        </Button>
      );
    }
    return <Text type="secondary">{t('Indisponible')}</Text>;
  };

  if (isPending) return <SkeletonList rows={3} />;

  if (error || !documents) {
    return (
      <StateBlock
        variant="error"
        description={portalErrorMessage(error, t('Impossible de charger les documents.'))}
        actions={[{ label: t('Réessayer'), onClick: () => void refetch(), primary: true }]}
      />
    );
  }

  const columns: ColumnsType<CoOwnerDocument> = [
    { title: t('Document'), dataIndex: 'title', key: 'title' },
    { title: t('Type'), key: 'type', render: (_, doc) => documentTypeLabel(doc.type) },
    { title: t('Copropriété'), key: 'syndicate', render: (_, doc) => doc.syndicate ?? '—' },
    { title: t('Ajouté le'), key: 'createdAt', render: (_, doc) => dayjs(doc.createdAt).format('DD/MM/YYYY') },
    { title: t('Action'), key: 'action', align: 'end', render: (_, doc) => action(doc) }
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Title level={2}>{t('Documents de copropriété')}</Title>
        <Text type="secondary">{t("Règlement de copropriété et procès-verbaux d'assemblée générale.")}</Text>
      </div>
      <Card>
        <DataView<CoOwnerDocument>
          paginated={false}
          items={documents}
          total={documents.length}
          page={1}
          pageSize={documents.length || 20}
          onPageChange={() => {}}
          rowKey={doc => doc.id}
          aria-label={t('Documents de copropriété')}
          emptyDescription={t("Aucun document n'est encore disponible.")}
          columns={columns}
          renderCard={doc => (
            <DataCard
              title={doc.title}
              subtitle={`${documentTypeLabel(doc.type)}${doc.syndicate ? ` · ${doc.syndicate}` : ''}`}
              fields={[{ label: t('Ajouté le'), value: dayjs(doc.createdAt).format('DD/MM/YYYY') }]}
              highlight={action(doc)}
            />
          )}
        />
      </Card>
    </Space>
  );
}
