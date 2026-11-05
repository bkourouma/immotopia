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
import { describeDownloadError } from '../../utils/download-error';
import { useLocalListSearch } from '../../utils/list-search';
import type { SearchCriterion } from '../../utils/list-search';
import { saveBlob } from '../../utils/save-blob';
import { portalErrorMessage } from './portal-error';

const { Title, Text } = Typography;

// Champ libre : titre du document et copropriété. Constantes de module : filtrage mémoïsé.
const TEXTE_RECHERCHE = [(doc: CoOwnerDocument) => doc.title, (doc: CoOwnerDocument) => doc.syndicate];
const ACCESSEURS = { type: (doc: CoOwnerDocument) => doc.type };

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
    staleTime: 30_000,
    queryFn: () => listMyDocuments()
  });

  // Déclarés dans le corps : les libellés se retraduisent au changement de langue.
  const criteria: SearchCriterion[] = [
    { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Document, copropriété…') },
    {
      key: 'type',
      type: 'select',
      label: t('Type'),
      primary: true,
      options: [
        { value: 'REGULATION', label: documentTypeLabel('REGULATION') },
        { value: 'GENERAL_MEETING_MINUTES', label: documentTypeLabel('GENERAL_MEETING_MINUTES') }
      ]
    }
  ];
  const local = useLocalListSearch<CoOwnerDocument>(documents, {
    criteria,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS
  });

  const download = async (document: CoOwnerDocument) => {
    setDownloadingId(document.id);
    try {
      const { blob, filename } = await downloadCoOwnerDocument(document.id, document.title);
      saveBlob(blob, filename);
    } catch (err) {
      feedback.error(await describeDownloadError(err));
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
          {...local.dataViewProps}
          rowKey={doc => doc.id}
          aria-label={t('Documents de copropriété')}
          export={{ filename: t('Documents de copropriété'), fetchAll: local.exportAll }}
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
