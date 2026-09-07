import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Table,
  Card,
  Button,
  Select,
  Tag,
  Space,
  Row,
  Col,
  Typography,
  Alert,
  Spin,
  Empty,
  Modal,
  Form,
  Input,
  Upload,
  message,
  Popconfirm,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined,
  QuestionCircleOutlined,
  FileTextOutlined,
  UploadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  StarOutlined,
  StarFilled,
} from '@ant-design/icons';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import apiClient from '../../utils/api-client';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

interface DocumentTemplate {
  id: string;
  doc_type: string;
  name: string;
  status: string;
  is_default: boolean;
  original_filename: string;
  placeholders: string[];
  created_at: string;
}

const DOC_TYPES = [
  { value: 'LEASE_HABITATION', label: 'Bail Habitation' },
  { value: 'LEASE_COMMERCIAL', label: 'Bail Commercial' },
  { value: 'RENT_RECEIPT', label: 'Reçu de Loyer' },
  { value: 'RENT_STATEMENT', label: 'Relevé de Compte' }
];

// Constants for displaying placeholder syntax in JSX
const OPEN_BRACE = '{';
const CLOSE_BRACE = '}';

export function DocumentTemplates() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [filterDocType, setFilterDocType] = useState<string>('');
  const [form] = Form.useForm();

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const url = filterDocType
        ? `/tenants/${tenantId}/documents/templates?docType=${filterDocType}`
        : `/tenants/${tenantId}/documents/templates`;
      
      const response = await apiClient.get(url);
      const data = response.data;

      if (data.success) {
        setTemplates(data.data || []);
      } else {
        message.error(data.message || 'Erreur lors du chargement des templates');
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Erreur lors du chargement des templates');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [tenantId, filterDocType]);

  useEffect(() => {
    if (tenantId) {
      loadTemplates();
    }
  }, [tenantId, loadTemplates]);

  const handleUpload = async (values: any) => {
    if (!values.file || !Array.isArray(values.file) || values.file.length === 0) {
      message.error('Veuillez sélectionner un fichier');
      return;
    }

    const file = values.file[0];
    if (!file.originFileObj) {
      message.error('Erreur lors de la sélection du fichier');
      return;
    }

    try {
      setUploading(true);

      const formData = new FormData();
      formData.append('file', file.originFileObj);
      formData.append('docType', values.docType);
      formData.append('name', values.name);

      const response = await apiClient.post(
        `/tenants/${tenantId}/documents/templates/upload`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      const data = response.data;

      if (data.success) {
        message.success('Template ajouté avec succès');
        setShowUploadModal(false);
        form.resetFields();
        loadTemplates();
      } else {
        message.error(data.message || 'Erreur lors du téléchargement');
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Erreur lors du téléchargement');
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const handleSetDefault = async (templateId: string) => {
    try {
      const response = await apiClient.post(
        `/tenants/${tenantId}/documents/templates/${templateId}/set-default`
      );

      const data = response.data;
      if (data.success) {
        message.success('Template défini par défaut');
        loadTemplates();
      } else {
        message.error(data.message || 'Erreur lors de la définition du template par défaut');
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Erreur lors de la définition du template par défaut');
      console.error(err);
    }
  };

  const handleToggleStatus = async (templateId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      const response = await apiClient.patch(
        `/tenants/${tenantId}/documents/templates/${templateId}`,
        { status: newStatus }
      );

      const data = response.data;
      if (data.success) {
        message.success(`Template ${newStatus === 'ACTIVE' ? 'activé' : 'désactivé'}`);
        loadTemplates();
      } else {
        message.error(data.message || 'Erreur lors de la mise à jour');
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Erreur lors de la mise à jour');
      console.error(err);
    }
  };

  const handleDelete = async (templateId: string) => {
    try {
      const response = await apiClient.delete(
        `/tenants/${tenantId}/documents/templates/${templateId}`
      );

      const data = response.data;
      if (data.success) {
        message.success('Template supprimé avec succès');
        loadTemplates();
      } else {
        message.error(data.message || 'Erreur lors de la suppression');
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Erreur lors de la suppression');
      console.error(err);
    }
  };

  const columns: ColumnsType<DocumentTemplate> = [
    {
      title: 'Nom',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: DocumentTemplate) => (
        <Space direction="vertical" size="small">
          <Space>
            <Text strong>{text}</Text>
            {record.is_default && (
              <Tag icon={<StarFilled />} color="gold">
                Par défaut
              </Tag>
            )}
          </Space>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {record.original_filename}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'doc_type',
      key: 'doc_type',
      render: (docType: string) => {
        const docTypeLabel = DOC_TYPES.find((t) => t.value === docType)?.label || docType;
        return <Text>{docTypeLabel}</Text>;
      },
    },
    {
      title: 'Statut',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'ACTIVE' ? 'success' : 'default'}>
          {status === 'ACTIVE' ? (
            <Space>
              <CheckCircleOutlined />
              Actif
            </Space>
          ) : (
            <Space>
              <CloseCircleOutlined />
              Inactif
            </Space>
          )}
        </Tag>
      ),
    },
    {
      title: 'Placeholders',
      dataIndex: 'placeholders',
      key: 'placeholders',
      render: (placeholders: string[]) => (
        <Space wrap>
          {(placeholders || []).slice(0, 3).map((p) => (
            <Tag key={p}>{p}</Tag>
          ))}
          {(placeholders || []).length > 3 && (
            <Tag>+{(placeholders || []).length - 3}</Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: DocumentTemplate) => (
        <Space>
          {!record.is_default && (
            <Button
              type="link"
              icon={<StarOutlined />}
              onClick={() => handleSetDefault(record.id)}
            >
              Définir par défaut
            </Button>
          )}
          <Button
            type="link"
            onClick={() => handleToggleStatus(record.id, record.status)}
          >
            {record.status === 'ACTIVE' ? 'Désactiver' : 'Activer'}
          </Button>
          <Popconfirm
            title="Supprimer le template"
            description="Êtes-vous sûr de vouloir supprimer ce template ?"
            onConfirm={() => handleDelete(record.id)}
            okText="Oui"
            cancelText="Non"
            okButtonProps={{ danger: true }}
          >
            <Button
              type="link"
              danger
              icon={<DeleteOutlined />}
            >
              Supprimer
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <DashboardLayout>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={2}>Templates de Documents</Title>
            <Text type="secondary">Gérez vos templates de documents</Text>
          </Col>
          <Col>
            <Space>
              <Button
                icon={<QuestionCircleOutlined />}
                onClick={() => window.open('/docs/GUIDE_TENANT_MODELES_DOCUMENTS.md', '_blank', 'noopener,noreferrer')}
              >
                Guide d'utilisation
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setShowUploadModal(true)}
              >
                Ajouter un template
              </Button>
            </Space>
          </Col>
        </Row>

        {/* Help Section */}
        <Card>
          <Alert
            message={
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <Title level={5} style={{ margin: 0 }}>
                  Comment créer vos modèles de documents ?
                </Title>
                <Paragraph style={{ marginBottom: 8 }}>
                  Créez vos propres modèles de contrats de bail, reçus et relevés en utilisant des variables dans un document Word (.docx).
                </Paragraph>
                <Space direction="vertical" size="small">
                  <Text>
                    • Utilisez des variables comme{' '}
                    <Tag>{OPEN_BRACE}{OPEN_BRACE}AGENCE_NOM{CLOSE_BRACE}{CLOSE_BRACE}</Tag> ou{' '}
                    <Tag>{OPEN_BRACE}{OPEN_BRACE}BAIL_LOYER_MENSUEL{CLOSE_BRACE}{CLOSE_BRACE}</Tag>
                  </Text>
                  <Text>• Téléchargez votre fichier DOCX avec votre mise en page personnalisée</Text>
                  <Text>• Le système remplacera automatiquement les variables lors de la génération</Text>
                </Space>
                <Button
                  type="link"
                  onClick={() => window.open('/docs/GUIDE_TENANT_MODELES_DOCUMENTS.md', '_blank', 'noopener,noreferrer')}
                  style={{ padding: 0 }}
                >
                  Consulter le guide complet avec toutes les variables disponibles →
                </Button>
              </Space>
            }
            type="info"
            icon={<FileTextOutlined />}
            showIcon
          />
        </Card>

        {/* Filter */}
        <Card>
          <Space>
            <Text strong>Filtrer par type :</Text>
            <Select
              value={filterDocType || undefined}
              onChange={(value) => setFilterDocType(value || '')}
              placeholder="Tous les types"
              allowClear
              style={{ width: 200 }}
            >
              {DOC_TYPES.map((type) => (
                <Option key={type.value} value={type.value}>
                  {type.label}
                </Option>
              ))}
            </Select>
          </Space>
        </Card>

        {/* Table */}
        <Card>
          <Spin spinning={loading}>
            {templates.length === 0 && !loading ? (
              <Empty description="Aucun template trouvé" />
            ) : (
              <Table
                columns={columns}
                dataSource={templates.map((t) => ({ ...t, key: t.id }))}
                pagination={{
                  pageSize: 10,
                  showSizeChanger: true,
                  showTotal: (total) => `Total: ${total} templates`,
                }}
              />
            )}
          </Spin>
        </Card>

        {/* Upload Modal */}
        <Modal
          title="Ajouter un template"
          open={showUploadModal}
          onCancel={() => {
            setShowUploadModal(false);
            form.resetFields();
          }}
          footer={null}
          width={600}
        >
          <Form
            form={form}
            layout="vertical"
            onFinish={handleUpload}
            initialValues={{
              docType: 'LEASE_HABITATION',
            }}
          >
            <Form.Item
              label="Type de document"
              name="docType"
              rules={[{ required: true, message: 'Veuillez sélectionner un type de document' }]}
            >
              <Select>
                {DOC_TYPES.map((type) => (
                  <Option key={type.value} value={type.value}>
                    {type.label}
                  </Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              label="Nom du template"
              name="name"
              rules={[{ required: true, message: 'Veuillez saisir un nom pour le template' }]}
            >
              <Input placeholder="Ex: Bail Habitation Standard" />
            </Form.Item>

            <Form.Item
              label="Fichier DOCX"
              name="file"
              rules={[
                { required: true, message: 'Veuillez sélectionner un fichier DOCX' },
                {
                  validator: (_: any, fileList: any[]) => {
                    if (!fileList || fileList.length === 0) {
                      return Promise.reject(new Error('Veuillez sélectionner un fichier DOCX'));
                    }
                    const file = fileList[0];
                    if (file.originFileObj) {
                      const fileName = file.originFileObj.name.toLowerCase();
                      if (!fileName.endsWith('.docx')) {
                        return Promise.reject(new Error('Seuls les fichiers DOCX sont acceptés'));
                      }
                    }
                    return Promise.resolve();
                  },
                },
              ]}
              valuePropName="fileList"
              getValueFromEvent={(e) => {
                if (Array.isArray(e)) {
                  return e;
                }
                return e?.fileList;
              }}
            >
              <Upload
                accept=".docx"
                maxCount={1}
                beforeUpload={() => false}
              >
                <Button icon={<UploadOutlined />}>Sélectionner un fichier DOCX</Button>
              </Upload>
            </Form.Item>

            <Form.Item>
              <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                <Button
                  onClick={() => {
                    setShowUploadModal(false);
                    form.resetFields();
                  }}
                >
                  Annuler
                </Button>
                <Button type="primary" htmlType="submit" loading={uploading}>
                  {uploading ? 'Téléchargement...' : 'Télécharger'}
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Modal>
      </Space>
    </DashboardLayout>
  );
}


