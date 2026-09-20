import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { App, Alert, Button, Col, Empty, Form, Input, Modal, Row, Space, Spin, Typography } from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { SyndicateCard } from '../../components/syndics/SyndicateCard';
import { useAuth } from '../../hooks/useAuth';
import { createSyndicate, deleteSyndicate, listSyndicates } from '../../services/syndic-service';
import { CreateSyndicateRequest, Syndicate } from '../../types/syndic-types';
import { useConfirmAction } from '../../components/primitives';
import { t } from '../../i18n/t';

const { Paragraph, Title } = Typography;

export const SyndicsList: React.FC = () => {
  const { message } = App.useApp();
  const confirmAction = useConfirmAction();

  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  const [items, setItems] = useState<Syndicate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingSyndicId, setDeletingSyndicId] = useState<string | null>(null);
  const [form] = Form.useForm<CreateSyndicateRequest>();

  useEffect(() => {
    if (!effectiveTenantId) {
      setLoading(false);
      setError(t('Tenant introuvable'));
      return;
    }
    void loadSyndicates();
  }, [effectiveTenantId]);

  useEffect(() => {
    const section = searchParams.get('openSyndicSection');
    if (!section || loading || !effectiveTenantId || items.length === 0) {
      return;
    }

    const sectionToSuffix: Record<string, string> = {
      detail: '',
      lots: '/lots',
      charges: '/charges',
      assemblees: '/assemblees',
      prestataires: '/prestataires',
      documents: '/documents',
      finances: '/finances',
      recouvrement: '/recouvrement',
      comptabilite: '/comptabilite',
      budgets: '/budgets',
      'profils-incidents': '/profils-incidents'
    };

    const suffix = sectionToSuffix[section];
    if (suffix === undefined) {
      return;
    }

    navigate(`/tenant/${effectiveTenantId}/syndics/${items[0].id}${suffix}`, { replace: true });
  }, [effectiveTenantId, items, loading, navigate, searchParams]);

  const loadSyndicates = async () => {
    if (!effectiveTenantId) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await listSyndicates(effectiveTenantId);
      setItems(data);
    } catch (err: any) {
      setError(err.response?.data?.error || t('Erreur lors du chargement des copropriétés'));
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    const visibleItems = items.filter(item => item.status !== 'IN_LIQUIDATION');
    if (!query) {
      return visibleItems;
    }

    return visibleItems.filter(item =>
      [item.name, item.address, item.cadastralReference || ''].some(value => value.toLowerCase().includes(query))
    );
  }, [items, search]);

  const handleCreate = async () => {
    if (!effectiveTenantId) {
      return;
    }

    const values = await form.validateFields();

    setSubmitting(true);
    try {
      const created = await createSyndicate(effectiveTenantId, values);
      message.success(t('Copropriété créée'));
      setOpen(false);
      form.resetFields();
      navigate(`/tenant/${effectiveTenantId}/syndics/${created.id}/lots?openImport=true`);
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Création impossible'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (syndicId: string) => {
    if (!effectiveTenantId) {
      return;
    }

    confirmAction({
      title: t('Supprimer cette copropriété ?'),
      description: t('Cette action supprime définitivement la copropriété et ses données liées.'),
      okText: t('Supprimer'),
      danger: true,
      cancelText: t('Annuler'),
      onConfirm: async () => {
        setDeletingSyndicId(syndicId);
        try {
          await deleteSyndicate(effectiveTenantId, syndicId);
          message.success(t('Copropriété supprimée'));
          await loadSyndicates();
        } catch (err: any) {
          message.error(err.response?.data?.error || t('Suppression impossible'));
        } finally {
          setDeletingSyndicId(null);
        }
      }
    });
  };

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <Title level={2} style={{ marginBottom: 8 }}>
              {t('Copropriétés')}
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {t("Gérez vos syndics, leurs adresses, leur statut et l'accès aux lots.")}
            </Paragraph>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
            {t('Nouvelle copropriété')}
          </Button>
        </div>

        <Input
          allowClear
          size="large"
          prefix={<SearchOutlined />}
          placeholder={t('Rechercher par nom, adresse ou référence cadastrale')}
          value={search}
          onChange={event => setSearch(event.target.value)}
        />

        {error ? <Alert type="error" message={error} showIcon /> : null}

        {loading ? (
          <div style={{ minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spin size="large" />
          </div>
        ) : filteredItems.length === 0 ? (
          <Empty description={t('Aucune copropriété trouvée')} />
        ) : (
          <Row gutter={[16, 16]}>
            {filteredItems.map(item => (
              <Col key={item.id} xs={24} md={12} xl={8}>
                <SyndicateCard
                  syndicate={item}
                  tenantId={effectiveTenantId || ''}
                  onDelete={handleDelete}
                  deleting={deletingSyndicId === item.id}
                />
              </Col>
            ))}
          </Row>
        )}
      </Space>

      <Modal
        title={t('Créer une copropriété')}
        open={open}
        onCancel={() => {
          setOpen(false);
          form.resetFields();
        }}
        onOk={() => void handleCreate()}
        okText={t('Créer')}
        cancelText={t('Annuler')}
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical" initialValues={{ propertyId: undefined }}>
          <Form.Item label={t('Nom')} name="name" rules={[{ required: true, message: t('Le nom est obligatoire') }]}>
            <Input />
          </Form.Item>
          <Form.Item
            label={t('Adresse')}
            name="address"
            rules={[{ required: true, message: t("L'adresse est obligatoire") }]}
          >
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label={t('Référence cadastrale')} name="cadastralReference">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};
