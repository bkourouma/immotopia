import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, App, Button, Card, Descriptions, Form, Input, InputNumber, Progress, Select, Space, Spin, Table, Typography } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { getOwnEntitlements, type CapacityKeyCode, type TenantEntitlements } from '../../services/subscription-v2-service';
import {
  createExtensionRequest,
  listOwnExtensionRequests,
  type ExtensionRequest
} from '../../services/subscription-extras-service';
import { TenantInvoicesSection } from '../../components/subscription/TenantInvoicesSection';
import { StatusTag } from '../../components/primitives';
import { activeLocale } from '../../i18n/format';
import { t } from '../../i18n/t';

const { Title, Text, Paragraph } = Typography;

const CAPACITY_LABEL: Record<CapacityKeyCode, string> = {
  LOTS: t('Lots'),
  COPROPRIETES: t('Copropriétés'),
  CHANTIERS: t('Chantiers')
};

const PHASE_LABEL: Record<string, { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }> = {
  NONE: { label: t('Aucun abonnement'), tone: 'neutral' },
  TRIAL: { label: t('Essai'), tone: 'info' },
  ACTIVE: { label: t('Actif'), tone: 'success' },
  GRACE: { label: t('Grâce'), tone: 'warning' },
  READ_ONLY: { label: t('Lecture seule'), tone: 'danger' }
};

const MODULE_LABEL: Record<string, string> = {
  MODULE_AGENCY: t('Agence'),
  MODULE_SYNDIC: t('Syndic'),
  MODULE_PROMOTER: t('Promoteur')
};

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(activeLocale(), { year: 'numeric', month: 'long', day: 'numeric' });
}

function daysRemaining(value: string | null | undefined): number | null {
  if (!value) return null;
  const diff = new Date(value).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}

/** Offres d'extension proposées à la demande (codes du catalogue, PLAN-ABONNEMENTS.md §2). */
const EXTENSION_OPTIONS = [
  { value: 'EXT_LOTS_10', label: t('Bloc de 10 lots') },
  { value: 'EXT_COPRO', label: t('Copropriété supplémentaire') },
  { value: 'EXT_CHANTIER', label: t('Chantier supplémentaire') }
];

const REQUEST_STATUS_LABEL: Record<string, { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }> = {
  OPEN: { label: t('En attente'), tone: 'warning' },
  HANDLED: { label: t('Traitée'), tone: 'success' },
  DECLINED: { label: t('Refusée'), tone: 'neutral' }
};

interface RequestValues {
  catalogCode?: string;
  quantity?: number;
  message: string;
}

/**
 * `/tenant/:tenantId/settings/abonnement` — abonnement vu par l'agence.
 *
 * Formule et consommation en consultation (les modifications passent par le
 * super-admin) ; vague 3 : factures (PDF, paiement en ligne sur le compte
 * ImmoTopia, suivi du retour `?paiement=`) et demande d'extension envoyée à
 * ImmoTopia (`POST /api/tenants/:tenantId/subscription/extension-requests`,
 * notifiée par e-mail au super-admin et visible dans la fiche agence).
 * Toutes ces routes restent ouvertes à une agence en lecture seule.
 */
export const TenantSubscriptionSettings: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [entitlements, setEntitlements] = useState<TenantEntitlements | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { message } = App.useApp();
  const [requests, setRequests] = useState<ExtensionRequest[]>([]);
  const [sending, setSending] = useState(false);
  const [requestForm] = Form.useForm<RequestValues>();

  const loadEntitlements = useCallback(
    (fresh = false) => {
      if (!tenantId) return Promise.resolve();
      if (!fresh) setLoading(true);
      setError(null);
      return getOwnEntitlements(tenantId)
        .then(setEntitlements)
        .catch((err: any) => setError(err.response?.data?.message || t("Erreur lors du chargement de l'abonnement")))
        .finally(() => setLoading(false));
    },
    [tenantId]
  );

  useEffect(() => {
    loadEntitlements();
    if (tenantId) listOwnExtensionRequests(tenantId).then(setRequests).catch(() => setRequests([]));
  }, [tenantId, loadEntitlements]);

  const handleRequestExtension = async (values: RequestValues) => {
    if (!tenantId) return;
    setSending(true);
    try {
      const created = await createExtensionRequest(tenantId, {
        catalogCode: values.catalogCode ?? null,
        quantity: values.catalogCode ? values.quantity ?? 1 : null,
        message: values.message
      });
      setRequests(previous => [created, ...previous]);
      requestForm.resetFields();
      message.success(t("Demande envoyée à l'équipe ImmoTopia"));
    } catch (err: any) {
      message.error(err.response?.data?.message || t("Erreur lors de l'envoi de la demande"));
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-8) 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return <Alert type="error" showIcon message={error} />;
  }

  if (!entitlements || entitlements.phase === 'NONE') {
    return (
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Title level={2} style={{ margin: 0 }}>
          {t('Abonnement')}
        </Title>
        <Alert type="info" showIcon message={t("Cette agence n'a pas encore d'abonnement.")} />
      </Space>
    );
  }

  const phaseInfo = PHASE_LABEL[entitlements.phase] ?? PHASE_LABEL.NONE;
  const trialDays = entitlements.phase === 'TRIAL' ? daysRemaining(entitlements.trialEndsAt) : null;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Title level={2} style={{ margin: 0 }}>
          {t('Abonnement')}
        </Title>
        <Text type="secondary">{t('Les modifications de la formule passent par l’équipe ImmoTopia.')}</Text>
      </div>

      {entitlements.manualReadOnlyReason ? (
        <Alert
          type="error"
          showIcon
          message={t('Compte en lecture seule')}
          description={t('Décidée par ImmoTopia. Motif : {{value}}', { value: entitlements.manualReadOnlyReason })}
        />
      ) : (
        entitlements.readOnly && (
          <Alert
            type="warning"
            showIcon
            message={t('Compte en lecture seule')}
            description={t('Réglez la facture en attente ci-dessous pour retrouver l’accès complet.')}
          />
        )
      )}

      <Card title={t('Formule')}>
        <Descriptions column={{ xs: 1, sm: 2 }} size="small">
          <Descriptions.Item label={t('Statut')}>
            <StatusTag status={entitlements.phase} tone={phaseInfo.tone} label={phaseInfo.label} />
          </Descriptions.Item>
          <Descriptions.Item label={t('Cycle de facturation')}>
            {entitlements.billingCycle === 'ANNUAL' ? t('Annuel (11 mois facturés)') : t('Mensuel')}
          </Descriptions.Item>
          <Descriptions.Item label={t('Packs')}>
            {entitlements.packs.length > 0 ? entitlements.packs.join(', ') : t('Aucun')}
          </Descriptions.Item>
          <Descriptions.Item label={t('Période en cours')}>
            {formatDate(entitlements.currentPeriodStart)} — {formatDate(entitlements.currentPeriodEnd)}
          </Descriptions.Item>
          {entitlements.phase === 'TRIAL' && (
            <Descriptions.Item label={t("Jours d'essai restants")}>
              {trialDays !== null ? t('{{value}} jour(s)', { value: trialDays }) : '—'}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Card title={t('Consommation')}>
        <Space size="large" wrap style={{ width: '100%' }}>
          {(Object.keys(entitlements.capacities) as CapacityKeyCode[]).map(key => {
            const capacity = entitlements.capacities[key];
            const percent =
              capacity.limit > 0 ? Math.min(100, Math.round((capacity.used / capacity.limit) * 100)) : capacity.used > 0 ? 100 : 0;
            return (
              <div key={key} style={{ width: 220 }}>
                <Text strong>{CAPACITY_LABEL[key]}</Text>
                <Progress
                  percent={percent}
                  status={percent >= 100 ? 'exception' : 'normal'}
                  strokeColor={percent >= 100 ? 'var(--color-error-text)' : percent >= 80 ? 'var(--color-warning-text)' : 'var(--color-success-text)'}
                  format={() => `${capacity.used} / ${capacity.limit}`}
                />
              </div>
            );
          })}
        </Space>
      </Card>

      <Card title={t('Modules')}>
        <Space wrap>
          {entitlements.modules.length > 0 ? (
            entitlements.modules.map(key => <StatusTag key={key} status="ACTIVE" label={MODULE_LABEL[key] ?? key} />)
          ) : (
            <Text type="secondary">{t('Aucun module ouvert')}</Text>
          )}
        </Space>
      </Card>

      {tenantId && <TenantInvoicesSection tenantId={tenantId} onPaid={() => loadEntitlements(true)} />}

      <Card title={t('Demander une extension')}>
        <Paragraph type="secondary">
          {t("Besoin de plus de lots, de copropriétés ou de chantiers ? Envoyez une demande à l'équipe ImmoTopia.")}
        </Paragraph>
        <Form form={requestForm} layout="vertical" onFinish={handleRequestExtension} style={{ maxWidth: 560 }}>
          <Form.Item label={t('Offre souhaitée')} name="catalogCode">
            <Select allowClear placeholder={t('Autre demande')} options={EXTENSION_OPTIONS} />
          </Form.Item>
          <Form.Item label={t('Quantité')} name="quantity">
            <InputNumber<number> min={1} max={1000} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label={t('Votre demande')}
            name="message"
            rules={[{ required: true, min: 3, message: t('Décrivez votre demande.') }]}
          >
            <Input.TextArea rows={3} maxLength={2000} />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={sending}>
            {t('Envoyer la demande')}
          </Button>
        </Form>
        {requests.length > 0 && (
          <Table<ExtensionRequest>
            style={{ marginBlockStart: 'var(--space-4)' }}
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={requests}
            aria-label={t('Mes demandes')}
            columns={[
              { title: t('Date'), dataIndex: 'createdAt', key: 'createdAt', render: (v: string) => formatDate(v) },
              { title: t('Demande'), dataIndex: 'message', key: 'message' },
              {
                title: t('Statut'),
                dataIndex: 'status',
                key: 'status',
                render: (status: string) => {
                  const info = REQUEST_STATUS_LABEL[status];
                  return <StatusTag status={status} tone={info?.tone} label={info?.label} />;
                }
              }
            ]}
          />
        )}
      </Card>
    </Space>
  );
};
