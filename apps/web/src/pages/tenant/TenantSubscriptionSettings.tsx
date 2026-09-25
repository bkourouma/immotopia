import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Button, Card, Descriptions, Progress, Space, Spin, Typography } from 'antd';
import { MailOutlined } from '@ant-design/icons';
import {
  getOwnEntitlements,
  type CapacityKeyCode,
  type TenantEntitlements
} from '../../services/subscription-v2-service';
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

/**
 * `/tenant/:tenantId/settings/abonnement` — abonnement de l'agence vu par
 * elle-même (vague 2, lot C). ÉCRAN EN LECTURE SEULE : aucune écriture,
 * conformément à la consigne (« réservée à TENANT_ADMIN, en lecture seule »).
 *
 * Le contrôle d'accès par rôle (TENANT_ADMIN) reste à poser au niveau du menu
 * — `hooks/useMenuAccess.ts` et `navigation/*` appartiennent au lot A
 * (COHABITATION du plan) — cette page lit `GET /api/tenants/:tenantId
 * /entitlements`, déjà protégée par `requireTenantAccess` côté API.
 *
 * « Demander une extension » : aucune route API dédiée n'existe dans la
 * vague 1 (docs/architecture/PLAN-ABONNEMENTS.md §9 ne liste rien de tel).
 * Le bouton ouvre un e-mail pré-rempli plutôt que d'inventer un appel API.
 * Une route `POST /api/tenants/:tenantId/subscription/extension-requests`
 * (ou équivalent) manque pour faire ça proprement — signalé au rendu.
 */
export const TenantSubscriptionSettings: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [entitlements, setEntitlements] = useState<TenantEntitlements | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    getOwnEntitlements(tenantId)
      .then(setEntitlements)
      .catch((err: any) => setError(err.response?.data?.message || t("Erreur lors du chargement de l'abonnement")))
      .finally(() => setLoading(false));
  }, [tenantId]);

  const handleRequestExtension = () => {
    const subject = encodeURIComponent(t("Demande d'extension d'abonnement"));
    const body = encodeURIComponent(
      t('Agence : {{tenant}}\nPacks actuels : {{packs}}\n\nDécrivez ici l’extension souhaitée (lots, copropriétés, chantiers…).', {
        tenant: tenantId ?? '',
        packs: entitlements?.packs.join(', ') || t('aucun')
      })
    );
    window.location.href = `mailto:support@immotopia.app?subject=${subject}&body=${body}`;
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
        <Text type="secondary">{t('Consultation seule : les modifications passent par le support ImmoTopia.')}</Text>
      </div>

      {entitlements.readOnly && (
        <Alert
          type="warning"
          showIcon
          message={t('Compte en lecture seule')}
          description={entitlements.readOnlyReason ?? undefined}
        />
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

      <Card>
        <Paragraph type="secondary">
          {t("Besoin de plus de lots, de copropriétés ou de chantiers ? Envoyez une demande à l'équipe ImmoTopia.")}
        </Paragraph>
        <Button type="primary" icon={<MailOutlined />} onClick={handleRequestExtension}>
          {t('Demander une extension')}
        </Button>
      </Card>
    </Space>
  );
};
