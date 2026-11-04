import React, { useState, useEffect } from 'react';
import { App, Card, Typography, Spin, Alert, Empty, List, Button, Space, Tag, Divider } from 'antd';
import { FolderOutlined, DownloadOutlined, FileTextOutlined, CalendarOutlined } from '@ant-design/icons';
import { tenantPortalService } from '../../services/tenantPortalService';
import { ListSearch } from '../../components/primitives';
import { DocumentsSansResultat, useDocumentsSearch } from './search/documentsSearch';
import dayjs from 'dayjs';
import { t } from '../../i18n/t';

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
}

interface DocumentsData {
  documents: RentalDocument[];
  groupedByType: Record<string, RentalDocument[]>;
}

export default function TenantDocuments() {
  const { message } = App.useApp();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DocumentsData | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      setError(null);
      // Liste reçue en entier (bornée) : la recherche se fait côté client.
      const response = await tenantPortalService.getDocuments();
      if (response.data?.success && response.data?.data) {
        setData(response.data.data);
      } else {
        setError(t('Erreur lors du chargement des documents'));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('Erreur lors du chargement des documents'));
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (documentId: string) => {
    try {
      setDownloading(documentId);
      const response = await tenantPortalService.downloadDocument(documentId);

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
          fileName = fileNameMatch[1];
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

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, { label: string; color: string }> = {
      DRAFT: { label: t('Brouillon'), color: 'default' },
      FINAL: { label: t('Final'), color: 'success' },
      VOID: { label: t('Annulé'), color: 'error' }
    };
    const config = statusMap[status] || { label: status, color: 'default' };
    return <Tag color={config.color}>{config.label}</Tag>;
  };

  // Recherche locale par nom, numéro et type (voir `search/documentsSearch`).
  const { local, filteredGroupedByType } = useDocumentsSearch(data?.documents, getDocumentTypeLabel);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spin size="large" tip={t('Chargement des documents...')} />
      </div>
    );
  }

  if (error) {
    return <Alert message={t('Erreur')} description={error} type="error" showIcon />;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Page Header */}
      <div>
        <Title level={2}>{t('Documents')}</Title>
        <Text type="secondary">{t('Accédez et téléchargez vos documents de location')}</Text>
      </div>

      {/* Recherche (T111) : seulement s'il y a des documents à chercher. */}
      {(data?.documents.length ?? 0) > 0 ? <ListSearch {...local.searchProps} /> : null}

      {/* Documents Grouped by Type (T110) */}
      {filteredGroupedByType.length > 0 ? (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {filteredGroupedByType.map(([type, documents]) => (
            <Card
              key={type}
              title={
                <Space>
                  <FileTextOutlined />
                  <span>{getDocumentTypeLabel(type)}</span>
                  <Tag>{documents.length}</Tag>
                </Space>
              }
            >
              <List
                dataSource={documents}
                renderItem={doc => (
                  <List.Item
                    actions={[
                      <Button
                        key="download"
                        type="link"
                        icon={<DownloadOutlined />}
                        onClick={() => handleDownload(doc.id)}
                        loading={downloading === doc.id}
                        disabled={!doc.downloadPath}
                      >
                        {t('Télécharger')}
                      </Button>
                    ]}
                  >
                    <List.Item.Meta
                      avatar={<FileTextOutlined style={{ fontSize: 24 }} />}
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
                        <Space>
                          {doc.issued_at && (
                            <>
                              <CalendarOutlined />
                              <Text type="secondary">
                                {t('Émis le')} {formatDate(doc.issued_at)}
                              </Text>
                            </>
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
      ) : local.isFiltered ? (
        <DocumentsSansResultat onClear={local.clear} />
      ) : (
        <Card>
          <Empty description={t('Aucun document trouvé')} />
        </Card>
      )}
    </Space>
  );
}
