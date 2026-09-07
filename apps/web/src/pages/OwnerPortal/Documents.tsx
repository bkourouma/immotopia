import React, { useState, useEffect } from 'react';
import {
  Card,
  Typography,
  Spin,
  Alert,
  Empty,
  List,
  Button,
  Space,
  Select,
  Tag,
  Divider,
  message
} from 'antd';
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
        setProperties(response.data.data.properties.map((p: any) => ({
          id: p.id,
          address: p.address
        })));
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
      setError(err.response?.data?.message || 'Erreur lors du chargement des documents');
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
  const allTypes = data
    ? Array.from(new Set(data.documents.map((doc) => doc.type)))
    : [];

  // Filter grouped documents by type filter
  const filteredGroupedByType = data
    ? Object.entries(data.groupedByType).filter(([type]) =>
        typeFilter ? type === typeFilter : true
      )
    : [];

  if (loading && !data) {
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={2}>Documents</Title>
          <Text type="secondary">Accès aux documents de location</Text>
        </div>
        <Button
          icon={<SyncOutlined />}
          onClick={loadDocuments}
          loading={loading}
          aria-label="Rafraîchir les documents"
        >
          Actualiser
        </Button>
      </div>

      {/* Filters (T137) */}
      <Card
        title={
          <Space>
            <FilterOutlined />
            <span>Filtres</span>
          </Space>
        }
      >
        <Space wrap>
          <Space>
            <Text strong>Type:</Text>
            <Select
              style={{ width: 200 }}
              placeholder="Tous les types"
              allowClear
              value={typeFilter}
              onChange={(value) => setTypeFilter(value)}
            >
              {allTypes.map(type => (
                <Option key={type} value={type}>{getDocumentTypeLabel(type)}</Option>
              ))}
            </Select>
          </Space>
          <Space>
            <Text strong>Propriété:</Text>
            <Select
              style={{ width: 200 }}
              placeholder="Toutes les propriétés"
              allowClear
              value={propertyFilter}
              onChange={(value) => setPropertyFilter(value)}
            >
              {properties.map(prop => (
                <Option key={prop.id} value={prop.id}>{prop.address}</Option>
              ))}
            </Select>
          </Space>
        </Space>
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
              renderItem={(doc) => (
                <List.Item
                  actions={[
                    <Button
                      key="download"
                      type="link"
                      icon={<DownloadOutlined />}
                      onClick={() => handleDownload(doc.id)}
                      loading={downloading === doc.id}
                    >
                      Télécharger
                    </Button>
                  ]}
                >
                  <List.Item.Meta
                    avatar={<FileTextOutlined style={{ fontSize: 24, color: '#1890ff' }} />}
                    title={
                      <Space>
                        <Text strong>{doc.title || doc.document_number || `Document ${doc.id.substring(0, 8)}`}</Text>
                        {getStatusTag(doc.status)}
                      </Space>
                    }
                    description={
                      <Space direction="vertical" size="small">
                        {doc.lease?.property && (
                          <Text type="secondary">
                            Propriété: {doc.lease.property.address}
                          </Text>
                        )}
                        {doc.issued_at && (
                          <Space>
                            <CalendarOutlined />
                            <Text type="secondary">
                              Émis le {formatDate(doc.issued_at)}
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
          <Empty description="Aucun document trouvé" />
        </Card>
      )}
    </Space>
  );
}
