import React, { useState } from 'react';
import { App, Card, Typography, Spin, Alert, Empty, List, Button, Space, Tag, Pagination } from 'antd';
import { FolderOutlined, DownloadOutlined, FileTextOutlined, CalendarOutlined, SyncOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ownerPortalService } from '../../services/ownerPortalService';
import type { OwnerPortalPagination } from '../../services/ownerPortalService';
import { ListSearch, StateBlock } from '../../components/primitives';
import { useListSearch } from '../../hooks/useListSearch';
import { STALE_TIME } from '../../lib/query-keys';
import { useOwnerPropertyOptions } from './useOwnerPropertyOptions';
import dayjs from 'dayjs';
import { t } from '../../i18n/t';
import { HelpSectionTitle } from '../../help';

const { Title, Text } = Typography;

interface RentalDocument {
  id: string;
  type: string;
  document_number: string | null;
  title: string | null;
  /** Route authentifiée du fichier (relative à l'API) ; jamais de chemin disque. */
  downloadPath: string | null;
  issued_at: string | null;
  status: string;
  lease?: {
    property?: {
      address: string;
    };
  };
}

interface DocumentsData {
  /** Page demandée au serveur. */
  documents: RentalDocument[];
  /** Regroupement de TOUS les documents filtrés (pas de la page) : non utilisé pour l'affichage. */
  groupedByType: Record<string, RentalDocument[]>;
  pagination?: OwnerPortalPagination;
}

const DOCUMENT_TYPES = [
  'LEASE_CONTRACT',
  'LEASE_ADDENDUM',
  'RENT_RECEIPT',
  'RENT_QUITTANCE',
  'DEPOSIT_RECEIPT',
  'STATEMENT',
  'OTHER'
];

export default function Documents() {
  const { message } = App.useApp();
  const { options: propertyOptions } = useOwnerPropertyOptions();

  const [downloading, setDownloading] = useState<string | null>(null);

  const getDocumentTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      LEASE_CONTRACT: t('Contrat de bail'),
      LEASE_ADDENDUM: 'Avenant',
      RENT_RECEIPT: t('Quittance de loyer'),
      RENT_QUITTANCE: 'Quittance',
      DEPOSIT_RECEIPT: t('Reçu de dépôt'),
      STATEMENT: t('Relevé'),
      OTHER: 'Autre'
    };
    return labels[type] || type;
  };

  // Liste paginée par le serveur ; l'API ne trie pas (`sort: false`).
  const search = useListSearch({
    apiNames: { sort: false },
    criteria: [
      { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Titre, numéro du document…') },
      {
        key: 'documentType',
        type: 'multiSelect',
        label: t('Type'),
        primary: true,
        options: DOCUMENT_TYPES.map(type => ({ value: type, label: getDocumentTypeLabel(type) }))
      },
      {
        key: 'propertyId',
        type: 'select',
        label: t('Propriété'),
        primary: true,
        options: propertyOptions
      }
    ]
  });

  const {
    data,
    isPending,
    isFetching,
    error: queryError,
    refetch
  } = useQuery({
    queryKey: ['owner-portal', 'documents', search.apiParams],
    queryFn: async (): Promise<DocumentsData | null> => {
      const response = await ownerPortalService.getDocuments(search.apiParams);
      return response.data?.success && response.data?.data ? (response.data.data as DocumentsData) : null;
    },
    staleTime: STALE_TIME.list,
    placeholderData: keepPreviousData
  });

  const error: string | null = queryError
    ? (queryError as any).response?.data?.message || t('Erreur lors du chargement des documents')
    : null;
  const documents = React.useMemo(() => data?.documents ?? [], [data]);
  const total = data?.pagination?.total ?? documents.length;

  // Regroupement par type de la page reçue (présentation seulement : aucun filtrage côté client).
  const groupedPage = React.useMemo(() => {
    const groups = new Map<string, RentalDocument[]>();
    for (const doc of documents) {
      const group = groups.get(doc.type);
      if (group) group.push(doc);
      else groups.set(doc.type, [doc]);
    }
    return Array.from(groups.entries());
  }, [documents]);

  const handleDownload = async (documentId: string) => {
    try {
      setDownloading(documentId);
      const response = await ownerPortalService.downloadDocument(documentId);

      // Create blob from response
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;

      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers['content-disposition'];
      let fileName = `document-${documentId}.pdf`;
      if (contentDisposition) {
        const fileNameMatch = contentDisposition.match(/filename="(.+)"/);
        if (fileNameMatch) {
          fileName = decodeURIComponent(fileNameMatch[1]);
        }
      }

      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      message.success(t('Document téléchargé avec succès'));
    } catch (err: any) {
      message.error(err.response?.data?.message || t('Erreur lors du téléchargement'));
    } finally {
      setDownloading(null);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return dayjs(dateString).format('DD/MM/YYYY');
  };

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, { label: string; color: string }> = {
      DRAFT: { label: t('Brouillon'), color: 'default' },
      FINAL: { label: t('Final'), color: 'success' },
      VOID: { label: t('Annulé'), color: 'error' }
    };
    const config = statusMap[status] || { label: status, color: 'default' };
    return <Tag color={config.color}>{config.label}</Tag>;
  };

  if (isPending && !data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spin size="large" tip={t('Chargement des documents...')} />
      </div>
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Page Header */}
      <div className="it-toolbar">
        <div>
          <Title level={2}>{t('Documents')}</Title>
          <Text type="secondary">{t('Accès aux documents de location')}</Text>
        </div>
        <Button
          icon={<SyncOutlined />}
          onClick={() => refetch()}
          loading={isFetching}
          aria-label={t('Rafraîchir les documents')}
        >
          {t('Actualiser')}
        </Button>
      </div>

      {/* Recherche multicritères (T137) : le type et le bien sont filtrés par le serveur */}
      <div>
        <ListSearch {...search.searchProps} resultCount={error ? undefined : total} />
      </div>

      {error && <Alert message={t('Erreur')} description={error} type="error" showIcon />}

      {/* Documents Grouped by Type (T136) */}
      <Spin spinning={isFetching && !isPending}>
        {groupedPage.length > 0 ? (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            {groupedPage.map(([type, group]) => (
              <Card
                key={type}
                title={
                  <Space>
                    <FolderOutlined />
                    <HelpSectionTitle
                      title={getDocumentTypeLabel(type)}
                      helpId="portails.proprietaire.documents.liste"
                    />
                    <Tag>{group.length}</Tag>
                  </Space>
                }
              >
                <List
                  dataSource={group}
                  renderItem={doc => (
                    <List.Item
                      actions={[
                        <Button
                          key="download"
                          type="link"
                          icon={<DownloadOutlined />}
                          onClick={() => handleDownload(doc.id)}
                          loading={downloading === doc.id}
                        >
                          {t('Télécharger')}
                        </Button>
                      ]}
                    >
                      <List.Item.Meta
                        avatar={<FileTextOutlined style={{ fontSize: 24, color: '#1890ff' }} />}
                        title={
                          <Space>
                            <Text strong>
                              {doc.title ||
                                doc.document_number ||
                                t('Document {{value}}', { value: doc.id.substring(0, 8) })}
                            </Text>
                            {getStatusTag(doc.status)}
                          </Space>
                        }
                        description={
                          <Space direction="vertical" size="small">
                            {doc.lease?.property && (
                              <Text type="secondary">
                                {t('Propriété:')} {doc.lease.property.address}
                              </Text>
                            )}
                            {doc.issued_at && (
                              <Space>
                                <CalendarOutlined />
                                <Text type="secondary">
                                  {t('Émis le')} {formatDate(doc.issued_at)}
                                </Text>
                              </Space>
                            )}
                          </Space>
                        }
                      />
                    </List.Item>
                  )}
                />
              </Card>
            ))}
          </Space>
        ) : (
          <Card>
            {search.isFiltered ? (
              <StateBlock
                variant="no-results"
                actions={[{ label: t('Effacer les critères'), onClick: search.clear, primary: true }]}
              />
            ) : (
              <Empty description={t('Aucun document trouvé')} />
            )}
          </Card>
        )}
      </Spin>

      {(total > search.pageSize || search.page > 1) && (
        <Pagination
          align="end"
          current={search.page}
          pageSize={search.pageSize}
          total={total}
          showSizeChanger
          onChange={search.dataViewProps.onPageChange}
        />
      )}
    </Space>
  );
}
