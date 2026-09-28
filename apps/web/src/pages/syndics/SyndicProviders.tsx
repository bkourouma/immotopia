import React, { useEffect, useState } from 'react';
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
  Tabs,
  Typography
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { ContractList } from '../../components/syndics/ContractList';
import { ProviderInvoicesTab } from '../../components/syndics/ProviderInvoicesTab';
import { ProviderList, ProviderWithContracts } from '../../components/syndics/ProviderList';
import { useConfirmAction } from '../../components/primitives';
import {
  createContract,
  createProvider,
  deleteProvider,
  listProvidersContracts,
  updateProvider
} from '../../services/syndic-service';
import { ServiceProvider, SyndicProvidersPayload } from '../../types/syndic-types';
import { useSyndicRouteContext } from './useSyndicRouteContext';
import { t } from '../../i18n/t';

const { Paragraph, Title, Link: TypographyLink } = Typography;

interface ProviderFormValues {
  name: string;
  specialty?: string;
  email?: string;
  phone?: string;
}

export const SyndicProviders: React.FC = () => {
  const { message } = App.useApp();
  const confirmAction = useConfirmAction();

  const { tenantId: effectiveTenantId, syndicId } = useSyndicRouteContext();

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

  const [openProviderModal, setOpenProviderModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ServiceProvider | null>(null);
  const [submittingProvider, setSubmittingProvider] = useState(false);
  const [deletingProviderId, setDeletingProviderId] = useState<string | null>(null);
  const [providerForm] = Form.useForm<ProviderFormValues>();

  useEffect(() => {
    if (!effectiveTenantId || !syndicId) {
      setLoading(false);
      setError(t('Paramètres prestataires manquants'));
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
      setError(err.response?.data?.error || t('Impossible de charger les prestataires'));
    } finally {
      setLoading(false);
    }
  };

  const openCreateProviderModal = () => {
    setEditingProvider(null);
    providerForm.resetFields();
    setOpenProviderModal(true);
  };

  const openEditProviderModal = (provider: ServiceProvider) => {
    setEditingProvider(provider);
    providerForm.setFieldsValue({
      name: provider.name,
      specialty: provider.specialty ?? undefined,
      email: provider.email ?? undefined,
      phone: provider.phone ?? undefined
    });
    setOpenProviderModal(true);
  };

  const closeProviderModal = () => {
    setOpenProviderModal(false);
    setEditingProvider(null);
    providerForm.resetFields();
  };

  const handleSubmitProvider = async () => {
    if (!effectiveTenantId || !syndicId) return;
    const values = await providerForm.validateFields();
    setSubmittingProvider(true);
    try {
      let provider: ServiceProvider;
      if (editingProvider) {
        provider = await updateProvider(effectiveTenantId, syndicId, editingProvider.id, {
          name: values.name,
          specialty: values.specialty || null,
          email: values.email || null,
          phone: values.phone || null
        });
        message.success(t('Prestataire mis à jour'));
      } else {
        provider = await createProvider(effectiveTenantId, syndicId, {
          name: values.name,
          specialty: values.specialty || undefined,
          email: values.email || undefined,
          phone: values.phone || undefined
        });
        message.success(t('Prestataire créé'));
      }
      closeProviderModal();
      await loadData();
      // Depuis la creation d'un contrat, le prestataire cree a la volee est
      // directement selectionne dans le formulaire de contrat ouvert.
      if (!editingProvider && openCreateContract) {
        contractForm.setFieldsValue({ providerId: provider.id });
      }
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Enregistrement du prestataire impossible'));
    } finally {
      setSubmittingProvider(false);
    }
  };

  const handleDeleteProvider = (provider: ServiceProvider) => {
    if (!effectiveTenantId || !syndicId) return;

    confirmAction({
      title: t('Supprimer ce prestataire ?'),
      description: t('Cette action est définitive. Impossible si le prestataire a des contrats ou des incidents liés.'),
      okText: t('Supprimer'),
      danger: true,
      cancelText: t('Annuler'),
      onConfirm: async () => {
        setDeletingProviderId(provider.id);
        try {
          await deleteProvider(effectiveTenantId, syndicId, provider.id);
          message.success(t('Prestataire supprimé'));
          await loadData();
        } catch (err: any) {
          message.error(err.response?.data?.error || t('Suppression du prestataire impossible'));
        } finally {
          setDeletingProviderId(null);
        }
      }
    });
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
      message.success(t('Contrat créé avec succès'));
      setOpenCreateContract(false);
      contractForm.resetFields();
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Création du contrat impossible'));
    } finally {
      setSubmittingContract(false);
    }
  };

  const renderProviderActions = (provider: ProviderWithContracts) => (
    <Space>
      <Button size="small" onClick={() => openEditProviderModal(provider)}>
        {t('Modifier')}
      </Button>
      <Button
        size="small"
        danger
        loading={deletingProviderId === provider.id}
        onClick={() => handleDeleteProvider(provider)}
      >
        {t('Supprimer')}
      </Button>
    </Space>
  );

  const providersPanel = (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Space direction="vertical" size={4}>
        <div className="it-toolbar">
          <Title level={2} className="it-toolbar__title" style={{ margin: 0 }}>
            {t('Prestataires et contrats')}
          </Title>
          <Space>
            <Button icon={<PlusOutlined />} onClick={openCreateProviderModal}>
              {t('Nouveau prestataire')}
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpenCreateContract(true)}>
              {t('Nouveau contrat')}
            </Button>
          </Space>
        </div>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          {t('Contrats actifs, prestataires relies et actifs des parties communes.')}
        </Paragraph>
      </Space>

      {error ? <Alert type="error" message={error} showIcon /> : null}

      {loading ? (
        <div style={{ minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spin size="large" />
        </div>
      ) : (
        <>
          <Card title={t('Prestataires ({{length}})', { length: payload.providers.length })}>
            <ProviderList
              providers={payload.providers as ProviderWithContracts[]}
              renderActions={renderProviderActions}
            />
          </Card>
          <Card title={t('Contrats de maintenance')}>
            <ContractList
              contracts={payload.contracts}
              tenantId={effectiveTenantId ?? undefined}
              syndicId={syndicId ?? undefined}
            />
          </Card>
          <Card title={t('Actifs communs ({{length}})', { length: payload.commonAssets.length })}>
            <div>{payload.commonAssets.map(asset => asset.name).join(' | ') || t('Aucun actif commun')}</div>
          </Card>
        </>
      )}
    </Space>
  );

  return (
    <>
      <Tabs
        items={[
          { key: 'prestataires', label: t('Prestataires'), children: providersPanel },
          {
            key: 'factures',
            label: t('Factures'),
            children:
              effectiveTenantId && syndicId ? (
                <ProviderInvoicesTab
                  tenantId={effectiveTenantId}
                  syndicId={syndicId}
                  providers={payload.providers}
                  contracts={payload.contracts}
                />
              ) : null
          }
        ]}
      />

      <Modal
        title={t('Nouveau contrat de maintenance')}
        open={openCreateContract}
        onCancel={() => setOpenCreateContract(false)}
        onOk={() => void handleCreateContract()}
        okText={t('Créer')}
        cancelText={t('Annuler')}
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
            label={t('Prestataire')}
            name="providerId"
            rules={[{ required: true, message: t('Le prestataire est obligatoire') }]}
            extra={
              <TypographyLink onClick={openCreateProviderModal}>
                {t('Pas de prestataire ? Créer un prestataire')}
              </TypographyLink>
            }
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={payload.providers.map(provider => ({ value: provider.id, label: provider.name }))}
              placeholder={t('Selectionner un prestataire')}
            />
          </Form.Item>
          <Form.Item
            label={t('Nature du contrat')}
            name="nature"
            rules={[{ required: true, message: t('La nature est obligatoire') }]}
          >
            <Input placeholder={t('Ex: Nettoyage parties communes')} />
          </Form.Item>
          <Form.Item
            label={t('Date de debut')}
            name="startDate"
            rules={[{ required: true, message: t('La date de debut est obligatoire') }]}
          >
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item label={t('Date de fin')} name="endDate">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item label={t('Montant annuel')} name="annualAmount">
            <InputNumber style={{ width: '100%' }} min={0} precision={2} />
          </Form.Item>
          <Form.Item label={t('Devise')} name="currency">
            <Input />
          </Form.Item>
          <Form.Item label={t('Alerte renouvellement (jours)')} name="renewalAlertDays">
            <InputNumber style={{ width: '100%' }} min={0} precision={0} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingProvider ? t('Modifier le prestataire') : t('Nouveau prestataire')}
        open={openProviderModal}
        onCancel={closeProviderModal}
        onOk={() => void handleSubmitProvider()}
        okText={editingProvider ? t('Enregistrer') : t('Créer')}
        cancelText={t('Annuler')}
        confirmLoading={submittingProvider}
      >
        <Form form={providerForm} layout="vertical">
          <Form.Item
            label={t('Nom')}
            name="name"
            rules={[{ required: true, message: t('Le nom du prestataire est obligatoire') }]}
          >
            <Input placeholder={t('Ex: Ascenseurs Pro')} />
          </Form.Item>
          <Form.Item label={t('Spécialité')} name="specialty">
            <Input placeholder={t('Ex: Ascenseur, nettoyage, sécurité...')} />
          </Form.Item>
          <Form.Item
            label={t('Email')}
            name="email"
            rules={[{ type: 'email', message: t("L'email doit être valide") }]}
          >
            <Input placeholder="contact@prestataire.test" />
          </Form.Item>
          <Form.Item label={t('Téléphone')} name="phone">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};
