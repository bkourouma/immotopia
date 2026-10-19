import React, { useEffect, useRef, useState } from 'react';
import {
  App,
  Alert,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Typography,
  Upload
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { DocumentVault } from '../../components/syndics/DocumentVault';
import { createSyndicDocument, listSyndicDocuments } from '../../services/syndic-service';
import { SyndicateDocument } from '../../types/syndic-types';
import { useMyMenuAccess } from '../../hooks/useMenuAccess';
import { useSyndicRouteContext } from './useSyndicRouteContext';
import { t } from '../../i18n/t';

const { Paragraph, Text, Title } = Typography;

/** Types dont le document est destiné aux copropriétaires : la case « Visible » est cochée d'office. */
const COOWNER_FACING_TYPES: ReadonlyArray<string> = ['REGULATION', 'GENERAL_MEETING_MINUTES'];

/** Options construites au rendu : `t()` doit être appelé après le chargement de la langue. */
function documentTypeOptions() {
  return [
    { label: t('Règlement de copropriété'), value: 'REGULATION' },
    { label: t("Procès-verbal d'AG"), value: 'GENERAL_MEETING_MINUTES' },
    { label: t('Diagnostic'), value: 'DIAGNOSTIC' },
    { label: t('Assurance'), value: 'INSURANCE' },
    { label: t('Budget'), value: 'BUDGET' },
    { label: t('Autre'), value: 'OTHER' }
  ];
}

export const SyndicDocuments: React.FC = () => {
  const { message } = App.useApp();

  const { tenantId: effectiveTenantId, syndicId } = useSyndicRouteContext();

  const [documents, setDocuments] = useState<SyndicateDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
  const [openCreate, setOpenCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [form] = Form.useForm();
  // « Visible des copropriétaires » suit le type choisi tant que l'utilisateur n'a pas touché la case.
  const [visibleToCoOwners, setVisibleToCoOwners] = useState(false);
  const visibilityTouched = useRef(false);
  const { permissions, ready: permissionsReady } = useMyMenuAccess(effectiveTenantId);
  const canEdit = permissionsReady && (permissions === null || permissions.has('SYNDIC_EDIT'));

  const resetCreateForm = () => {
    setOpenCreate(false);
    setSelectedFile(null);
    visibilityTouched.current = false;
    setVisibleToCoOwners(false);
  };

  useEffect(() => {
    if (!effectiveTenantId || !syndicId) {
      setLoading(false);
      setError(t('Paramètres documents manquants'));
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
      setError(err.response?.data?.error || t('Impossible de charger les documents'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDocument = async () => {
    if (!effectiveTenantId || !syndicId) return;
    const values = await form.validateFields();
    if (!selectedFile) {
      message.error(t('Veuillez selectionner un fichier'));
      return;
    }
    setSubmitting(true);
    try {
      await createSyndicDocument(effectiveTenantId, syndicId, {
        title: values.title,
        type: values.type,
        file: selectedFile,
        expiresAt: values.expiresAt ? values.expiresAt.toISOString() : undefined,
        visibleToCoOwners
      });
      message.success(t('Document ajoute'));
      form.resetFields();
      resetCreateForm();
      await loadDocuments();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Ajout du document impossible'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Space direction="vertical" size={4}>
          <div className="it-toolbar">
            <Title level={2} className="it-toolbar__title" style={{ margin: 0 }}>
              {t('Coffre documentaire')}
            </Title>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpenCreate(true)}>
              {t('Ajouter un document')}
            </Button>
          </div>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            {t('Consultez les documents de copropriété et surveillez les expirations.')}
          </Paragraph>
        </Space>

        {error ? <Alert type="error" message={error} showIcon /> : null}

        <Card>
          <Select
            showSearch
            optionFilterProp="label"
            allowClear
            placeholder={t('Filtrer par type')}
            style={{ minWidth: 260 }}
            value={typeFilter}
            onChange={value => setTypeFilter(value)}
            options={documentTypeOptions()}
          />
        </Card>

        {loading ? (
          <div style={{ minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spin size="large" />
          </div>
        ) : (
          <Card title={t('Documents')}>
            <DocumentVault
              documents={documents}
              tenantId={effectiveTenantId ?? ''}
              syndicId={syndicId ?? ''}
              canEdit={canEdit}
              onChanged={() => void loadDocuments()}
            />
          </Card>
        )}
      </Space>

      <Modal
        title={t('Ajouter un document')}
        open={openCreate}
        onCancel={resetCreateForm}
        onOk={() => void handleCreateDocument()}
        okText={t('Ajouter')}
        cancelText={t('Annuler')}
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label={t('Titre')}
            name="title"
            rules={[{ required: true, message: t('Le titre est obligatoire') }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label={t('Type')} name="type" rules={[{ required: true, message: t('Le type est obligatoire') }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={documentTypeOptions()}
              onChange={(value: string) => {
                if (!visibilityTouched.current) setVisibleToCoOwners(COOWNER_FACING_TYPES.includes(value));
              }}
            />
          </Form.Item>
          <Form.Item>
            <Checkbox
              checked={visibleToCoOwners}
              onChange={event => {
                visibilityTouched.current = true;
                setVisibleToCoOwners(event.target.checked);
              }}
            >
              {t('Visible des copropriétaires')}
            </Checkbox>
            <div>
              <Text type="secondary">
                {t('Les copropriétaires voient et téléchargent ce document depuis leur portail.')}
              </Text>
            </div>
          </Form.Item>
          <Form.Item label={t('Fichier')} required>
            <Upload
              maxCount={1}
              beforeUpload={file => {
                setSelectedFile(file);
                return false;
              }}
              onRemove={() => {
                setSelectedFile(null);
              }}
            >
              <Button>{t('Choisir un fichier')}</Button>
            </Upload>
          </Form.Item>
          <Form.Item label={t("Date d'expiration")} name="expiresAt">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};
