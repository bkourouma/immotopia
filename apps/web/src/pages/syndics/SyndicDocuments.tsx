import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, DatePicker, Form, Input, Modal, Select, Space, Spin, Typography, Upload, message } from 'antd';
import { ArrowLeftOutlined, PlusOutlined } from '@ant-design/icons';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { DocumentVault } from '../../components/syndics/DocumentVault';
import { createSyndicDocument, listSyndicDocuments } from '../../services/syndic-service';
import { SyndicateDocument } from '../../types/syndic-types';
import { useSyndicRouteContext } from './useSyndicRouteContext';

const { Paragraph, Title } = Typography;

export const SyndicDocuments: React.FC = () => {
  const { tenantId: effectiveTenantId, syndicId } = useSyndicRouteContext();
  const navigate = useNavigate();

  const [documents, setDocuments] = useState<SyndicateDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
  const [openCreate, setOpenCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    if (!effectiveTenantId || !syndicId) {
      setLoading(false);
      setError('Paramètres documents manquants');
      return;
    }
    void loadDocuments();
  }, [effectiveTenantId, syndicId, typeFilter]);

  const loadDocuments = async () => {
    if (!effectiveTenantId || !syndicId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listSyndicDocuments(effectiveTenantId, syndicId, { type: typeFilter });
      setDocuments(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Impossible de charger les documents');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDocument = async () => {
    if (!effectiveTenantId || !syndicId) return;
    const values = await form.validateFields();
    if (!selectedFile) {
      message.error('Veuillez selectionner un fichier');
      return;
    }
    setSubmitting(true);
    try {
      await createSyndicDocument(effectiveTenantId, syndicId, {
        title: values.title,
        type: values.type,
        file: selectedFile,
        expiresAt: values.expiresAt ? values.expiresAt.toISOString() : undefined
      });
      message.success('Document ajoute');
      setOpenCreate(false);
      form.resetFields();
      setSelectedFile(null);
      await loadDocuments();
    } catch (err: any) {
      message.error(err.response?.data?.error || "Ajout du document impossible");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Space direction="vertical" size={4}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/tenant/${effectiveTenantId}/syndics/${syndicId}`)}>
            Retour à la fiche syndic
          </Button>
          <Space align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
            <Title level={2} style={{ margin: 0 }}>
              Coffre documentaire
            </Title>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpenCreate(true)}>
              Ajouter un document
            </Button>
          </Space>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            Consultez les documents de copropriété et surveillez les expirations.
          </Paragraph>
        </Space>

        {error ? <Alert type="error" message={error} showIcon /> : null}

        <Card>
          <Select
            allowClear
            placeholder="Filtrer par type"
            style={{ minWidth: 260 }}
            value={typeFilter}
            onChange={(value) => setTypeFilter(value)}
            options={[
              { label: 'Reglement', value: 'REGULATION' },
              { label: 'Proces-verbal AG', value: 'GENERAL_MEETING_MINUTES' },
              { label: 'Diagnostic', value: 'DIAGNOSTIC' },
              { label: 'Assurance', value: 'INSURANCE' },
              { label: 'Budget', value: 'BUDGET' },
              { label: 'Autre', value: 'OTHER' }
            ]}
          />
        </Card>

        {loading ? (
          <div style={{ minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spin size="large" />
          </div>
        ) : (
          <Card title="Documents">
            <DocumentVault documents={documents} />
          </Card>
        )}
      </Space>

      <Modal
        title="Ajouter un document"
        open={openCreate}
        onCancel={() => {
          setOpenCreate(false);
          setSelectedFile(null);
        }}
        onOk={() => void handleCreateDocument()}
        okText="Ajouter"
        cancelText="Annuler"
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical">
          <Form.Item label="Titre" name="title" rules={[{ required: true, message: 'Le titre est obligatoire' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Type" name="type" rules={[{ required: true, message: 'Le type est obligatoire' }]}>
            <Select
              options={[
                { label: 'Reglement', value: 'REGULATION' },
                { label: 'Proces-verbal AG', value: 'GENERAL_MEETING_MINUTES' },
                { label: 'Diagnostic', value: 'DIAGNOSTIC' },
                { label: 'Assurance', value: 'INSURANCE' },
                { label: 'Budget', value: 'BUDGET' },
                { label: 'Autre', value: 'OTHER' }
              ]}
            />
          </Form.Item>
          <Form.Item label="Fichier" required>
            <Upload
              maxCount={1}
              beforeUpload={(file) => {
                setSelectedFile(file);
                return false;
              }}
              onRemove={() => {
                setSelectedFile(null);
              }}
            >
              <Button>Choisir un fichier</Button>
            </Upload>
          </Form.Item>
          <Form.Item label="Date d'expiration" name="expiresAt">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
        </Form>
      </Modal>
    </DashboardLayout>
  );
};

