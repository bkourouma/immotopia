import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Table,
  Button,
  Tag,
  Space,
  Typography,
  Empty,
  Alert,
  Select,
  message,
  Modal,
  Row,
  Col,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined,
  FileTextOutlined,
  EyeOutlined,
  DownloadOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import {
  listDocuments,
  generateDocument,
  updateDocumentStatus,
  regenerateDocument,
  RentalDocument,
  RentalDocumentType,
  RentalDocumentStatus,
  DocumentFilters,
  GenerateDocumentRequest,
} from '../../services/rental-service';
import { DocumentForm } from '../../components/rental/DocumentForm';

const { Text, Title } = Typography;

interface DocumentsProps {
  leaseId?: string;
}

export const Documents: React.FC<DocumentsProps> = ({ leaseId: propLeaseId }) => {
  const { tenantId, leaseId: paramLeaseId } = useParams<{ tenantId: string; leaseId?: string }>();
  const leaseId = propLeaseId || paramLeaseId;
  const [documents, setDocuments] = useState<RentalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState<DocumentFilters>({
    leaseId: leaseId,
    page: 1,
    limit: 50,
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });

  useEffect(() => {
    if (tenantId) {
      loadDocuments();
    }
  }, [tenantId, filters, leaseId]);

  const loadDocuments = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await listDocuments(tenantId, {
        ...filters,
        leaseId: leaseId || filters.leaseId,
      });
      if (response.success) {
        setDocuments(response.data);
        setPagination(response.pagination);
      } else {
        setError('Erreur lors du chargement des documents');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des documents');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async (data: GenerateDocumentRequest) => {
    if (!tenantId) return;
    try {
      await generateDocument(tenantId, data);
      setShowForm(false);
      await loadDocuments();
    } catch (err: any) {
      throw err;
    }
  };

  const handleRegenerate = async (documentId: string) => {
    if (!tenantId) return;
    Modal.confirm({
      title: 'Régénérer le document',
      content: 'Voulez-vous régénérer ce document avec les données mises à jour ?',
      onOk: async () => {
        try {
          await regenerateDocument(tenantId, documentId);
          await loadDocuments();
          message.success('Document régénéré avec succès !');
        } catch (err: any) {
          message.error(err.response?.data?.message || 'Erreur lors de la régénération du document');
        }
      },
    });
  };

  const handleStatusChange = async (documentId: string, newStatus: RentalDocumentStatus) => {
    if (!tenantId) return;
    try {
      await updateDocumentStatus(tenantId, documentId, newStatus);
      await loadDocuments();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la mise à jour du statut');
    }
  };

  const getStatusTag = (status: RentalDocumentStatus) => {
    const statusMap: Record<RentalDocumentStatus, { label: string; color: string }> = {
      DRAFT: { label: 'Brouillon', color: 'default' },
      FINAL: { label: 'Final', color: 'success' },
      VOID: { label: 'Annulé', color: 'error' },
    };
    const config = statusMap[status] || { label: status, color: 'default' };
    return <Tag color={config.color}>{config.label}</Tag>;
  };

  const getTypeLabel = (type: RentalDocumentType) => {
    const typeMap: Record<RentalDocumentType, string> = {
      LEASE_CONTRACT: 'Contrat de bail',
      LEASE_ADDENDUM: 'Avenant',
      RENT_RECEIPT: 'Reçu de loyer',
      RENT_QUITTANCE: 'Quittance de loyer',
      DEPOSIT_RECEIPT: 'Reçu de dépôt',
      STATEMENT: 'Relevé',
      OTHER: 'Autre',
    };
    return typeMap[type] || type;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR');
  };

  // If used as standalone page (not in tab)
  const isStandalone = !propLeaseId;

  const content = (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row gutter={[16, 16]} justify="space-between" align="middle">
          <Col xs={24} sm={24} md={12} lg={14}>
            <Title level={2} style={{ margin: 0 }}>Documents</Title>
            <Text type="secondary">
              {leaseId ? 'Documents du bail' : 'Gérez les documents de location'}
            </Text>
          </Col>
          <Col xs={24} sm={24} md={12} lg={10}>
            <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setShowForm(true)}
              >
                Générer un document
              </Button>
            </div>
          </Col>
        </Row>

        {error && (
          <Alert
            message="Erreur"
            description={error}
            type="error"
            showIcon
            closable
            onClose={() => setError(null)}
          />
        )}

        {showForm && (
          <div className="bg-white rounded-lg shadow p-6">
            <DocumentForm
              tenantId={tenantId!}
              leaseId={leaseId}
              onSubmit={handleGenerate}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

        <Space>
          <Select
            value={filters.type || 'all'}
            onChange={(value) =>
              setFilters({
                ...filters,
                type: value === 'all' ? undefined : (value as RentalDocumentType),
                page: 1,
              })
            }
            style={{ width: 180 }}
          >
            <Select.Option value="all">Tous les types</Select.Option>
            <Select.Option value={RentalDocumentType.LEASE_CONTRACT}>Contrat de bail</Select.Option>
            <Select.Option value={RentalDocumentType.LEASE_ADDENDUM}>Avenant</Select.Option>
            <Select.Option value={RentalDocumentType.RENT_RECEIPT}>Reçu de loyer</Select.Option>
            <Select.Option value={RentalDocumentType.RENT_QUITTANCE}>Quittance de loyer</Select.Option>
            <Select.Option value={RentalDocumentType.DEPOSIT_RECEIPT}>Reçu de dépôt</Select.Option>
            <Select.Option value={RentalDocumentType.STATEMENT}>Relevé</Select.Option>
            <Select.Option value={RentalDocumentType.OTHER}>Autre</Select.Option>
          </Select>
          <Select
            value={filters.status || 'all'}
            onChange={(value) =>
              setFilters({
                ...filters,
                status: value === 'all' ? undefined : (value as RentalDocumentStatus),
                page: 1,
              })
            }
            style={{ width: 180 }}
          >
            <Select.Option value="all">Tous les statuts</Select.Option>
            <Select.Option value={RentalDocumentStatus.DRAFT}>Brouillon</Select.Option>
            <Select.Option value={RentalDocumentStatus.FINAL}>Final</Select.Option>
            <Select.Option value={RentalDocumentStatus.VOID}>Annulé</Select.Option>
          </Select>
        </Space>

        {documents.length === 0 && !loading ? (
          <Empty description="Aucun document trouvé" />
        ) : (
          <Table
            dataSource={documents}
            loading={loading}
            rowKey="id"
            scroll={{ x: 'max-content' }}
            columns={[
              {
                title: 'Numéro',
                key: 'document_number',
                render: (_, record) => <Text strong>{record.document_number}</Text>,
              },
              {
                title: 'Type',
                key: 'type',
                render: (_, record) => getTypeLabel(record.type),
              },
              {
                title: 'Titre',
                key: 'title',
                render: (_, record) => record.title || '-',
              },
              {
                title: "Date d'émission",
                key: 'issued_at',
                render: (_, record) => formatDate(record.issued_at),
              },
              {
                title: 'Statut',
                key: 'status',
                render: (_, record) => getStatusTag(record.status),
              },
              {
                title: 'Actions',
                key: 'actions',
                render: (_, record) => (
                  <Space>
                    <Button
                      type="text"
                      icon={<ReloadOutlined />}
                      onClick={() => handleRegenerate(record.id)}
                      title="Régénérer le document avec les données mises à jour"
                    />
                    <Button
                      type="text"
                      icon={<DownloadOutlined />}
                      onClick={async () => {
                        try {
                          const apiBaseUrl = process.env.REACT_APP_API_URL || 'http://localhost:8001/api';
                          const downloadUrl = `${apiBaseUrl}/tenants/${tenantId}/documents/${record.id}/download`;
                          
                          const response = await fetch(downloadUrl, {
                            method: 'GET',
                            credentials: 'include',
                          });
                          
                          if (!response.ok) {
                            const errorText = await response.text();
                            throw new Error(`Failed to download document: ${response.status} ${response.statusText}`);
                          }
                          
                          const blob = await response.blob();
                          const url = window.URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `${record.document_number || 'document'}.docx`;
                          document.body.appendChild(a);
                          a.click();
                          window.URL.revokeObjectURL(url);
                          document.body.removeChild(a);
                          message.success('Téléchargement réussi');
                        } catch (error) {
                          message.error(`Erreur lors du téléchargement: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
                        }
                      }}
                      title="Télécharger le document"
                    />
                  </Space>
                ),
              },
            ]}
            pagination={
              pagination.totalPages > 1
                ? {
                    current: pagination.page,
                    pageSize: pagination.limit,
                    total: pagination.total,
                    showSizeChanger: true,
                    showTotal: (total) => `Total ${total} documents`,
                    onChange: (page, pageSize) => {
                      setFilters((prev) => ({ ...prev, page, limit: pageSize }));
                    },
                  }
                : false
            }
          />
        )}
      </Space>
    </>
  );

  if (isStandalone) {
    return <DashboardLayout>{content}</DashboardLayout>;
  }

  return content;
};

