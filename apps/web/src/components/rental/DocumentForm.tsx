import React, { useState, useEffect } from 'react';
import {
  Form,
  Input,
  Select,
  Button,
  Row,
  Col,
  Alert,
  Space,
  message,
} from 'antd';
import {
  GenerateDocumentRequest,
  RentalDocumentType,
} from '../../services/rental-service';
import apiClient from '../../utils/api-client';

const { TextArea } = Input;

interface DocumentTemplate {
  id: string;
  name: string;
  doc_type: string;
  status: string;
  is_default: boolean;
}

interface DocumentFormProps {
  tenantId: string;
  leaseId?: string;
  installmentId?: string;
  paymentId?: string;
  onSubmit: (data: GenerateDocumentRequest) => Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
}

export const DocumentForm: React.FC<DocumentFormProps> = ({
  tenantId,
  leaseId,
  installmentId,
  paymentId,
  onSubmit,
  onCancel,
  loading = false,
}) => {
  const [form] = Form.useForm();
  const documentType = Form.useWatch('type', form) || RentalDocumentType.LEASE_CONTRACT;
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Map RentalDocumentType to DocumentType
  const getDocTypeForTemplate = (type: RentalDocumentType): string => {
    const map: Record<RentalDocumentType, string> = {
      LEASE_CONTRACT: 'LEASE_HABITATION',
      LEASE_ADDENDUM: 'LEASE_HABITATION',
      RENT_RECEIPT: 'RENT_RECEIPT',
      RENT_QUITTANCE: 'RENT_RECEIPT',
      DEPOSIT_RECEIPT: 'RENT_RECEIPT',
      STATEMENT: 'RENT_STATEMENT',
      OTHER: 'RENT_RECEIPT'
    };
    return map[type] || 'RENT_RECEIPT';
  };

  // Load templates when document type changes
  useEffect(() => {
    if (tenantId && documentType) {
      loadTemplates();
    }
  }, [tenantId, documentType]);

  const loadTemplates = async () => {
    try {
      setLoadingTemplates(true);
      const docType = getDocTypeForTemplate(documentType);
      const response = await apiClient.get(
        `/tenants/${tenantId}/documents/templates?docType=${docType}&status=ACTIVE`
      );
      
      if (response.data.success) {
        const availableTemplates = response.data.data || [];
        setTemplates(availableTemplates);
        
        // Auto-select default template if available
        const defaultTemplate = availableTemplates.find((t: DocumentTemplate) => t.is_default);
        if (defaultTemplate) {
          form.setFieldsValue({ templateId: defaultTemplate.id });
        }
      }
    } catch (err) {
      console.error('Error loading templates', err);
      setTemplates([]);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleSubmit = async (values: any) => {
    setIsSubmitting(true);
    try {
      const submitData: GenerateDocumentRequest & { templateId?: string } = {
        type: values.type,
        leaseId: leaseId || undefined,
        installmentId: installmentId || undefined,
        paymentId: paymentId || undefined,
        title: values.title || undefined,
        description: values.description || undefined,
        templateId: values.templateId || undefined,
      };

      await onSubmit(submitData);
    } catch (error: any) {
      if (error.response?.data?.message) {
        const errorMsg = error.response.data.message;
        setErrors({ submit: errorMsg });
        message.error(errorMsg);
      } else {
        const errorMsg = 'Une erreur est survenue lors de la génération du document';
        setErrors({ submit: errorMsg });
        message.error(errorMsg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleSubmit}
      initialValues={{
        type: RentalDocumentType.LEASE_CONTRACT,
      }}
    >
      {errors.submit && (
        <Alert
          message="Erreur"
          description={errors.submit}
          type="error"
          showIcon
          closable
          style={{ marginBottom: 24 }}
        />
      )}

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item
            label="Type de document"
            name="type"
            required
            rules={[{ required: true, message: 'Le type de document est requis' }]}
          >
            <Select>
              <Select.Option value={RentalDocumentType.LEASE_CONTRACT}>Contrat de bail</Select.Option>
              <Select.Option value={RentalDocumentType.LEASE_ADDENDUM}>Avenant</Select.Option>
              <Select.Option value={RentalDocumentType.RENT_RECEIPT}>Reçu de loyer</Select.Option>
              <Select.Option value={RentalDocumentType.RENT_QUITTANCE}>Quittance de loyer</Select.Option>
              <Select.Option value={RentalDocumentType.DEPOSIT_RECEIPT}>Reçu de dépôt</Select.Option>
              <Select.Option value={RentalDocumentType.STATEMENT}>Relevé</Select.Option>
              <Select.Option value={RentalDocumentType.OTHER}>Autre</Select.Option>
            </Select>
          </Form.Item>
        </Col>

        <Col xs={24} md={12}>
          <Form.Item
            label="Titre (optionnel)"
            name="title"
          >
            <Input placeholder="Titre du document" />
          </Form.Item>
        </Col>

        <Col xs={24} md={12}>
          <Form.Item
            label="Template (optionnel)"
            name="templateId"
            help={templates.length === 0 && !loadingTemplates && 'Aucun template actif pour ce type de document. Le template par défaut sera utilisé.'}
          >
            <Select
              placeholder={loadingTemplates ? 'Chargement...' : templates.length === 0 ? 'Aucun template disponible' : 'Sélectionner un template'}
              disabled={loadingTemplates || templates.length === 0}
              loading={loadingTemplates}
            >
              {templates.map((template) => (
                <Select.Option key={template.id} value={template.id}>
                  {template.name} {template.is_default && '(Par défaut)'}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Col>

        <Col xs={24}>
          <Form.Item
            label="Description (optionnel)"
            name="description"
          >
            <TextArea
              rows={3}
              placeholder="Description du document"
            />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item>
        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          {onCancel && (
            <Button onClick={onCancel} disabled={isSubmitting || loading}>
              Annuler
            </Button>
          )}
          <Button type="primary" htmlType="submit" loading={isSubmitting || loading}>
            Générer le document
          </Button>
        </Space>
      </Form.Item>
    </Form>
  );
};





