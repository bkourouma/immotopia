import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Card, Descriptions, Form, Modal, Select, Space, Spin } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import {
  AdminSubscription,
  SubscriptionBillingCycle,
  SubscriptionPlanKey,
  SubscriptionStatus,
  cancelAdminSubscription,
  createAdminSubscription,
  getAdminSubscription,
  updateAdminSubscription
} from '../../../services/admin-subscription-service';
import { StatusTag } from '../../primitives';
import { useConfirmAction } from '../../primitives';
import { activeLocale } from '../../../i18n/format';
import { t } from '../../../i18n/t';

/**
 * Onglet Abonnement de la fiche agence (lot G1).
 *
 * L'API ne connaît pas de statut « SUSPENDED » côté agence distinct de celui
 * de l'abonnement : ici, résilier programme `cancelAt` (POST .../cancel) et
 * réactiver repose sur le PATCH générique (`status: 'ACTIVE', cancelAt: null`),
 * que l'API accepte déjà.
 */

const PLAN_OPTIONS: Array<{ value: SubscriptionPlanKey; label: string }> = [
  { value: 'BASIC', label: t('Basic') },
  { value: 'PRO', label: t('Pro') },
  { value: 'ELITE', label: t('Elite') }
];

const CYCLE_OPTIONS: Array<{ value: SubscriptionBillingCycle; label: string }> = [
  { value: 'MONTHLY', label: t('Mensuel') },
  { value: 'ANNUAL', label: t('Annuel') }
];

const STATUS_OPTIONS: Array<{ value: SubscriptionStatus; label: string }> = [
  { value: 'TRIALING', label: t('Essai') },
  { value: 'ACTIVE', label: t('Actif') },
  { value: 'PAST_DUE', label: t('Impayé') },
  { value: 'CANCELED', label: t('Résilié') },
  { value: 'SUSPENDED', label: t('Suspendu') }
];

/** `StatusTag` ne connaît pas encore TRIALING/PAST_DUE : on force son étiquette pour ces deux-là. */
function SubscriptionStatusTag({ status }: { status: SubscriptionStatus }) {
  if (status === 'TRIALING') return <StatusTag status={status} tone="info" label={t('Essai')} />;
  if (status === 'PAST_DUE') return <StatusTag status={status} tone="danger" label={t('Impayé')} />;
  return <StatusTag status={status} />;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(activeLocale(), { year: 'numeric', month: 'long', day: 'numeric' });
}

interface EditValues {
  planKey: SubscriptionPlanKey;
  billingCycle: SubscriptionBillingCycle;
  status: SubscriptionStatus;
}

export const SubscriptionTab: React.FC<{ tenantId: string; tenantName?: string }> = ({ tenantId, tenantName }) => {
  const { message } = App.useApp();
  const confirmAction = useConfirmAction();
  const [subscription, setSubscription] = useState<AdminSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm<EditValues>();
  const [createForm] = Form.useForm<{ planKey: SubscriptionPlanKey; billingCycle: SubscriptionBillingCycle }>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAdminSubscription(tenantId);
      setSubscription(data);
      if (data) {
        form.setFieldsValue({ planKey: data.planKey, billingCycle: data.billingCycle, status: data.status });
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || t("Erreur lors du chargement de l'abonnement"));
    } finally {
      setLoading(false);
    }
  }, [tenantId, form, message]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (values: EditValues) => {
    setSaving(true);
    try {
      const updated = await updateAdminSubscription(tenantId, values);
      setSubscription(updated);
      message.success(t('Abonnement mis à jour'));
    } catch (err: any) {
      message.error(err.response?.data?.message || t("Erreur lors de la mise à jour de l'abonnement"));
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async (values: { planKey: SubscriptionPlanKey; billingCycle: SubscriptionBillingCycle }) => {
    setCreating(true);
    try {
      const created = await createAdminSubscription(tenantId, values);
      setSubscription(created);
      setCreateOpen(false);
      createForm.resetFields();
      message.success(t('Abonnement créé'));
    } catch (err: any) {
      message.error(err.response?.data?.message || t("Erreur lors de la création de l'abonnement"));
    } finally {
      setCreating(false);
    }
  };

  const handleCancel = () => {
    confirmAction({
      title: t("Résilier l'abonnement de « {{value}} » ?", { value: tenantName ?? tenantId }),
      description: t("L'agence perd l'accès aux fonctionnalités payantes à la fin de la période en cours."),
      okText: t('Résilier'),
      danger: true,
      onConfirm: async () => {
        try {
          const updated = await cancelAdminSubscription(tenantId);
          setSubscription(updated);
          form.setFieldsValue({ planKey: updated.planKey, billingCycle: updated.billingCycle, status: updated.status });
          message.success(t('Abonnement résilié'));
        } catch (err: any) {
          message.error(err.response?.data?.message || t("Erreur lors de la résiliation de l'abonnement"));
        }
      }
    });
  };

  const handleReactivate = () => {
    confirmAction({
      title: t("Réactiver l'abonnement de « {{value}} » ?", { value: tenantName ?? tenantId }),
      okText: t('Réactiver'),
      onConfirm: async () => {
        try {
          const updated = await updateAdminSubscription(tenantId, { status: 'ACTIVE', cancelAt: null });
          setSubscription(updated);
          form.setFieldsValue({ planKey: updated.planKey, billingCycle: updated.billingCycle, status: updated.status });
          message.success(t('Abonnement réactivé'));
        } catch (err: any) {
          message.error(err.response?.data?.message || t("Erreur lors de la réactivation de l'abonnement"));
        }
      }
    });
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--space-8) 0' }}>
        <Spin />
      </div>
    );
  }

  if (!subscription) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--space-8) 0' }}>
        <p>{t('Cette agence n’a pas encore d’abonnement.')}</p>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          {t('Créer un abonnement')}
        </Button>
        <Modal
          title={t('Créer un abonnement')}
          open={createOpen}
          onCancel={() => setCreateOpen(false)}
          onOk={() => createForm.submit()}
          confirmLoading={creating}
          okText={t("Créer l'abonnement")}
          cancelText={t('Annuler')}
        >
          <Form form={createForm} layout="vertical" onFinish={handleCreate} initialValues={{ planKey: 'PRO', billingCycle: 'MONTHLY' }}>
            <Form.Item label={t('Offre')} name="planKey" rules={[{ required: true }]}>
              <Select options={PLAN_OPTIONS} />
            </Form.Item>
            <Form.Item label={t('Cycle de facturation')} name="billingCycle" rules={[{ required: true }]}>
              <Select options={CYCLE_OPTIONS} />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    );
  }

  const canReactivate = subscription.status === 'CANCELED' || Boolean(subscription.cancelAt);

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card title={t('Abonnement actuel')}>
        <Descriptions column={{ xs: 1, sm: 2 }} size="small">
          <Descriptions.Item label={t('Offre')}>
            {PLAN_OPTIONS.find(o => o.value === subscription.planKey)?.label ?? subscription.planKey}
          </Descriptions.Item>
          <Descriptions.Item label={t('Cycle de facturation')}>
            {CYCLE_OPTIONS.find(o => o.value === subscription.billingCycle)?.label ?? subscription.billingCycle}
          </Descriptions.Item>
          <Descriptions.Item label={t('Statut')}>
            <SubscriptionStatusTag status={subscription.status} />
          </Descriptions.Item>
          <Descriptions.Item label={t('Début de la période en cours')}>
            {formatDateTime(subscription.currentPeriodStart)}
          </Descriptions.Item>
          <Descriptions.Item label={t('Fin de la période en cours')}>
            {formatDateTime(subscription.currentPeriodEnd)}
          </Descriptions.Item>
          {subscription.cancelAt && (
            <Descriptions.Item label={t('Résiliation programmée')}>{formatDateTime(subscription.cancelAt)}</Descriptions.Item>
          )}
          {subscription.canceledAt && (
            <Descriptions.Item label={t('Résilié le')}>{formatDateTime(subscription.canceledAt)}</Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Card title={t("Modifier l'abonnement")}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item label={t('Offre')} name="planKey" rules={[{ required: true }]}>
            <Select options={PLAN_OPTIONS} />
          </Form.Item>
          <Form.Item label={t('Cycle de facturation')} name="billingCycle" rules={[{ required: true }]}>
            <Select options={CYCLE_OPTIONS} />
          </Form.Item>
          <Form.Item label={t('Statut')} name="status" rules={[{ required: true }]}>
            <Select options={STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={saving}>
              {t('Enregistrer les modifications')}
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Space>
        {canReactivate ? (
          <Button onClick={handleReactivate}>{t('Réactiver')}</Button>
        ) : (
          <Button danger onClick={handleCancel}>
            {t('Résilier')}
          </Button>
        )}
      </Space>
    </Space>
  );
};
