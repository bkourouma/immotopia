import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  App,
  Alert,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Typography
} from 'antd';
import { ArrowLeftOutlined, PlusOutlined } from '@ant-design/icons';
import { ContractList } from '../../components/syndics/ContractList';
import { createContract, listProvidersContracts } from '../../services/syndic-service';
import { SyndicProvidersPayload } from '../../types/syndic-types';
import { useSyndicRouteContext } from './useSyndicRouteContext';

const { Paragraph, Title } = Typography;

export const SyndicProviders: React.FC = () => {
  const { message } = App.useApp();

  const { tenantId: effectiveTenantId, syndicId } = useSyndicRouteContext();
  const navigate = useNavigate();

  const [payload, setPayload] = useState<SyndicProvidersPayload>({
    providers: [],
    contracts: [],
    commonAssets: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openCreateContract, setOpenCreateContract] = useState(false);
  const [submittingContract, setSubmittingContract] = useState(false);
  const [contractForm] = Form.useForm();

  useEffect(() => {
    if (!effectiveTenantId || !syndicId) {
      setLoading(false);
      setError('Paramètres prestataires manquants');
      return;
    }
    void loadData();
  }, [effectiveTenantId, syndicId]);

  const loadData = async () => {
    if (!effectiveTenantId || !syndicId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listProvidersContracts(effectiveTenantId, syndicId);
      setPayload(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Impossible de charger les prestataires');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateContract = async () => {
    if (!effectiveTenantId || !syndicId) return;
    const values = await contractForm.validateFields();
    setSubmittingContract(true);
    try {
      await createContract(effectiveTenantId, syndicId, {
        providerId: values.providerId,
        nature: values.nature,
        startDate: values.startDate.toISOString(),
        endDate: values.endDate ? values.endDate.toISOString() : undefined,
        annualAmount: values.annualAmount ?? undefined,
        currency: values.currency || 'XOF',
        renewalAlertDays: values.renewalAlertDays ?? 30
      });
      message.success('Contrat créé avec succès');
      setOpenCreateContract(false);
      contractForm.resetFields();
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Création du contrat impossible');
    } finally {
      setSubmittingContract(false);
    }
  };

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Space direction="vertical" size={4}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(`/tenant/${effectiveTenantId}/syndics/${syndicId}`)}
          >
            Retour à la fiche syndic
          </Button>
          <div className="it-toolbar">
            <Title level={2} className="it-toolbar__title" style={{ margin: 0 }}>
              Prestataires et contrats
            </Title>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpenCreateContract(true)}>
              Nouveau contrat
            </Button>
          </div>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            Contrats actifs, prestataires relies et actifs des parties communes.
          </Paragraph>
        </Space>

        {error ? <Alert type="error" message={error} showIcon /> : null}

        {loading ? (
          <div style={{ minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spin size="large" />
          </div>
        ) : (
          <>
            <Card title={`Prestataires (${payload.providers.length})`}>
              <div>{payload.providers.map(provider => provider.name).join(' | ') || 'Aucun prestataire'}</div>
            </Card>
            <Card title="Contrats de maintenance">
              <ContractList contracts={payload.contracts} />
            </Card>
            <Card title={`Actifs communs (${payload.commonAssets.length})`}>
              <div>{payload.commonAssets.map(asset => asset.name).join(' | ') || 'Aucun actif commun'}</div>
            </Card>
          </>
        )}
      </Space>

      <Modal
        title="Nouveau contrat de maintenance"
        open={openCreateContract}
        onCancel={() => setOpenCreateContract(false)}
        onOk={() => void handleCreateContract()}
        okText="Créer"
        cancelText="Annuler"
        confirmLoading={submittingContract}
      >
        <Form
          form={contractForm}
          layout="vertical"
          initialValues={{
            currency: 'XOF',
            renewalAlertDays: 30
          }}
        >
          <Form.Item
            label="Prestataire"
            name="providerId"
            rules={[{ required: true, message: 'Le prestataire est obligatoire' }]}
          >
            <Select
              options={payload.providers.map(provider => ({ value: provider.id, label: provider.name }))}
              placeholder="Selectionner un prestataire"
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item
            label="Nature du contrat"
            name="nature"
            rules={[{ required: true, message: 'La nature est obligatoire' }]}
          >
            <Input placeholder="Ex: Nettoyage parties communes" />
          </Form.Item>
          <Form.Item
            label="Date de debut"
            name="startDate"
            rules={[{ required: true, message: 'La date de debut est obligatoire' }]}
          >
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item label="Date de fin" name="endDate">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item label="Montant annuel" name="annualAmount">
            <InputNumber style={{ width: '100%' }} min={0} precision={2} />
          </Form.Item>
          <Form.Item label="Devise" name="currency">
            <Input />
          </Form.Item>
          <Form.Item label="Alerte renouvellement (jours)" name="renewalAlertDays">
            <InputNumber style={{ width: '100%' }} min={0} precision={0} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};
