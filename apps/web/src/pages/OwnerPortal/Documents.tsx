import React, { useState, useEffect } from 'react';
import { App, Card, Typography, Spin, Alert, Empty, List, Button, Space, Select, Tag, Divider } from 'antd';
import {
  FolderOutlined,
  DownloadOutlined,
  FileTextOutlined,
  FilterOutlined,
  CalendarOutlined,
  SyncOutlined
} from '@ant-design/icons';
import { ownerPortalService } from '../../services/ownerPortalService';
import dayjs from 'dayjs';
import { t } from '../../i18n/t';

const { Title, Text } = Typography;
const { Option } = Select;

interface RentalDocument {
  id: string;
  type: string;
  document_number: string | null;
  title: string | null;
  file_url: string | null;
  file_path: string | null;
  issued_at: string | null;
  status: string;
  lease?: {
    property?: {
      address: string;
    };
  };
}

interface DocumentsData {
  documents: RentalDocument[];
  groupedByType: Record<string, RentalDocument[]>;
}

export default function Documents() {
  const { message } = App.useApp();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DocumentsData | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
  const [propertyFilter, setPropertyFilter] = useState<string | undefined>(undefined);
  const [properties, setProperties] = useState<Array<{ id: string; address: string }>>([]);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    loadProperties();
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [typeFilter, propertyFilter]);

  const loadProperties = async () => {
    try {
      const response = await ownerPortalService.getProperties();
      if (response.data?.success && response.data?.data?.properties) {
        setProperties(
          response.data.data.properties.map((p: any) => ({
            id: p.id,
            address: p.address
          }))
        );
      }
    } catch (err) {
      console.error('Error loading properties:', err);
    }
  };

  const loadDocuments = async () => {
    try {
      setLoading(true);
      setError(null);

      const params: any = {};
      if (typeFilter) params.documentType = typeFilter;
      if (propertyFilter) params.propertyId = propertyFilter;

      const response = await ownerPortalService.getDocuments(params);
      if (response.data?.success && response.data?.data) {
        setData(response.data.data);
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

  // Get all unique document types for filter
  const allTypes = data ? Array.from(new Set(data.documents.map(doc => doc.type))) : [];

  // Filter grouped documents by type filter
  const filteredGroupedByType = data
    ? Object.entries(data.groupedByType).filter(([type]) => (typeFilter ? type === typeFilter : true))
    : [];

  if (loading && !data) {
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
      <div className="it-toolbar">
        <div>
          <Title level={2}>{t('Documents')}</Title>
          <Text type="secondary">{t('Accès aux documents de location')}</Text>
        </div>
        <Button
          icon={<SyncOutlined />}
          onClick={loadDocuments}
          loading={loading}
          aria-label={t('Rafraîchir les documents')}
        >
          {t('Actualiser')}
        </Button>
      </div>

      {/* Filters (T137) */}
      <Card
        title={
          <Space>
            <FilterOutlined />
            <span>{t('Filtres')}</span>
          </Space>
        }
      >
        <div className="it-filters">
          <div className="it-filters__field">
            <Text strong>{t('Type')}</Text>
            <Select
              style={{ width: 200 }}
              placeholder={t('Tous les types')}
              allowClear
              value={typeFilter}
              onChange={value => setTypeFilter(value)}
            >
              {allTypes.map(type => (
                <Option key={type} value={type}>
                  {getDocumentTypeLabel(type)}
                </Option>
              ))}
            </Select>
          </div>
          <div className="it-filters__field">
            <Text strong>{t('Propriété')}</Text>
            <Select
              style={{ width: 200 }}
              placeholder={t('Toutes les propriétés')}
              allowClear
              value={propertyFilter}
              onChange={value => setPropertyFilter(value)}
            >
              {properties.map(prop => (
                <Option key={prop.id} value={prop.id}>
                  {prop.address}
                </Option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {/* Documents Grouped by Type (T136) */}
      {filteredGroupedByType.length > 0 ? (
        filteredGroupedByType.map(([type, documents]) => (
          <Card
            key={type}
            title={
              <Space>
                <FolderOutlined />
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
        ))
      ) : (
        <Card>
          <Empty description={t('Aucun document trouvé')} />
        </Card>
      )}
    </Space>
  );
}
