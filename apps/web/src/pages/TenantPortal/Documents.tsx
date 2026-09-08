import React, { useState, useEffect } from 'react';
import { App, Card, Typography, Spin, Alert, Empty, List, Button, Space, Select, Tag, Divider } from 'antd';
import {
  FolderOutlined,
  DownloadOutlined,
  FileTextOutlined,
  FilterOutlined,
  CalendarOutlined
} from '@ant-design/icons';
import { tenantPortalService } from '../../services/tenantPortalService';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

interface RentalDocument {
  id: string;
  type: string;
  document_number: string | null;
  title: string | null;
  file_url: string | null;
  file_path: string | null;
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
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    loadDocuments();
  }, [typeFilter]);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      setError(null);
      const params: any = {};
      if (typeFilter) {
        params.type = typeFilter;
      }
      const response = await tenantPortalService.getDocuments(params);
      if (response.data?.success && response.data?.data) {
        setData(response.data.data);
      } else {
        setError('Erreur lors du chargement des documents');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des documents');
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

      message.success('Document téléchargé avec succès');
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Erreur lors du téléchargement');
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
      LEASE_CONTRACT: 'Contrat de bail',
      LEASE_ADDENDUM: 'Avenant',
      RENT_RECEIPT: 'Quittance de loyer',
      RENT_QUITTANCE: 'Quittance',
      DEPOSIT_RECEIPT: 'Reçu de dépôt',
      STATEMENT: 'Relevé',
      OTHER: 'Autre'
    };
    return labels[type] || type;
  };

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, { label: string; color: string }> = {
      DRAFT: { label: 'Brouillon', color: 'default' },
      FINAL: { label: 'Final', color: 'success' },
      VOID: { label: 'Annulé', color: 'error' }
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

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spin size="large" tip="Chargement des documents..." />
      </div>
    );
  }

  if (error) {
    return <Alert message="Erreur" description={error} type="error" showIcon />;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Page Header */}
      <div>
        <Title level={2}>Documents</Title>
        <Text type="secondary">Accédez et téléchargez vos documents de location</Text>
      </div>

      {/* Filter (T111) */}
      <Card>
        <Space size="middle" wrap>
          <Space>
            <FilterOutlined />
            <Text strong>Filtre :</Text>
          </Space>
          <Select
            placeholder="Type de document"
            allowClear
            style={{ width: 250 }}
            value={typeFilter}
            onChange={value => setTypeFilter(value)}
          >
            {allTypes.map(type => (
              <Select.Option key={type} value={type}>
                {getDocumentTypeLabel(type)}
              </Select.Option>
            ))}
          </Select>
          {typeFilter && <Button onClick={() => setTypeFilter(undefined)}>Réinitialiser</Button>}
        </Space>
      </Card>

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
                        disabled={!doc.file_path && !doc.file_url}
                      >
                        Télécharger
                      </Button>
                    ]}
                  >
                    <List.Item.Meta
                      avatar={<FileTextOutlined style={{ fontSize: 24 }} />}
                      title={
                        <Space>
                          <Text strong>{doc.title || doc.document_number || `Document ${doc.id.substring(0, 8)}`}</Text>
                          {getStatusTag(doc.status)}
                        </Space>
                      }
                      description={
                        <Space>
                          {doc.issued_at && (
                            <>
                              <CalendarOutlined />
                              <Text type="secondary">Émis le {formatDate(doc.issued_at)}</Text>
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
      ) : (
        <Card>
          <Empty description="Aucun document trouvé" />
        </Card>
      )}
    </Space>
  );
}
