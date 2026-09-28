import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Input, Space, Tag, Typography } from 'antd';
import { CheckCircleFilled, CopyOutlined, MailOutlined } from '@ant-design/icons';
import { t } from '../../i18n/t';
import { activeLocale } from '../../i18n/format';
import { feedback } from '../../lib/feedback';
import type { ProvisionTenantResult } from '../../services/tenant-service';

const { Title, Text } = Typography;

// Fonctions, pas des objets au niveau du module : `t()` ne réagit pas au
// changement de langue (i18n/t.ts) — un dictionnaire construit une fois à
// l'import resterait figé dans la langue du premier chargement.
function moduleLabel(key: string): string {
  switch (key) {
    case 'MODULE_AGENCY':
      return t('Agence');
    case 'MODULE_SYNDIC':
      return t('Syndic');
    case 'MODULE_PROMOTER':
      return t('Promoteur');
    case 'MODULE_PATRIMOINE':
      return t('Patrimoine');
    default:
      return key;
  }
}

/**
 * `planKey` est déprécié (docs/architecture/PLAN-ABONNEMENTS.md §1) : une
 * création par packs (vague 2) ne l'envoie plus, `null`. Le libellé retombe
 * alors sur les codes du catalogue (`result.subscription.items`), affichés
 * tels quels — ce ne sont pas des textes français à traduire.
 */
function planLabel(key: string | null): string | null {
  switch (key) {
    case 'BASIC':
      return t('Basic');
    case 'PRO':
      return t('Pro');
    case 'ELITE':
      return t('Elite');
    default:
      return key;
  }
}

function cycleLabel(key: string): string {
  switch (key) {
    case 'MONTHLY':
      return t('mensuel');
    case 'ANNUAL':
      return t('annuel');
    default:
      return key;
  }
}

export interface TenantCreatedResultProps {
  result: ProvisionTenantResult;
  onResend: () => Promise<void> | void;
  resending: boolean;
  onCreateAnother: () => void;
  /** Ferme le panneau — appelé aussi après « Ouvrir la fiche ». */
  onClose: () => void;
}

/**
 * `<TenantCreatedResult>` — écran de confirmation affiché dans
 * `<CreateTenantDrawer>` après une création réussie (lot F, plan §F3).
 *
 * Le lien d'invitation reste affiché et copiable même quand l'e-mail est
 * parti : un e-mail « envoyé » peut atterrir en spam ou sur la mauvaise
 * boîte, et le super-admin qui vient de créer l'agence est souvent le geste
 * le plus rapide pour le transmettre à la main.
 */
export const TenantCreatedResult: React.FC<TenantCreatedResultProps> = ({
  result,
  onResend,
  resending,
  onCreateAnother,
  onClose
}) => {
  const navigate = useNavigate();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.invitation.acceptUrl);
      feedback.success(t('Lien copié.'));
    } catch {
      feedback.error(t('Impossible de copier le lien — copiez-le manuellement.'));
    }
  };

  const handleOpenTenant = () => {
    onClose();
    navigate(`/admin/tenants/${result.tenant.id}`);
  };

  const trialDate = result.subscription.currentPeriodEnd
    ? new Date(result.subscription.currentPeriodEnd).toLocaleDateString(activeLocale())
    : null;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Alert
        type="success"
        showIcon
        icon={<CheckCircleFilled />}
        message={t('Agence créée')}
        description={t('{{name}} ({{slug}}) est prête à l’usage.', {
          name: result.tenant.name,
          slug: result.tenant.slug
        })}
      />

      <div>
        <Title level={5} style={{ marginTop: 0 }}>
          {t('Modules et offre')}
        </Title>
        <Space wrap>
          {result.modules.map(moduleKey => (
            <Tag key={moduleKey}>{moduleLabel(moduleKey)}</Tag>
          ))}
        </Space>
        <div style={{ marginTop: 8 }}>
          <Text type="secondary">
            {result.subscription.items && result.subscription.items.length > 0
              ? t('Packs {{packs}}, cycle {{cycle}}', {
                  packs: result.subscription.items.map(i => i.code).join(', '),
                  cycle: cycleLabel(result.subscription.billingCycle)
                })
              : t('Offre {{plan}}, cycle {{cycle}}', {
                  plan: planLabel(result.subscription.planKey) ?? t('non définie'),
                  cycle: cycleLabel(result.subscription.billingCycle)
                })}
            {trialDate ? ` — ${t("fin d'essai le {{date}}", { date: trialDate })}` : null}
          </Text>
        </div>
      </div>

      <div>
        <Title level={5} style={{ marginTop: 0 }}>
          {t('Administrateur')}
        </Title>
        <Text>
          {result.admin.fullName} — {result.admin.email}
        </Text>
        {result.admin.existingUser && (
          <div style={{ marginTop: 4 }}>
            <Tag color="blue">{t('Compte existant')}</Tag>
          </div>
        )}
      </div>

      <div>
        <Title level={5} style={{ marginTop: 0 }}>
          {t("Lien d'invitation")}
        </Title>
        <Space.Compact style={{ width: '100%' }}>
          <Input readOnly value={result.invitation.acceptUrl} />
          <Button icon={<CopyOutlined />} onClick={handleCopy}>
            {t('Copier')}
          </Button>
        </Space.Compact>

        {result.emailSent ? (
          <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
            {t("E-mail d'invitation envoyé.")}
          </Text>
        ) : (
          <Alert
            style={{ marginTop: 8 }}
            type="warning"
            showIcon
            message={t("L'e-mail n'a pas pu être envoyé — copiez le lien et transmettez-le vous-même.")}
          />
        )}

        <Button style={{ marginTop: 8 }} icon={<MailOutlined />} loading={resending} onClick={() => void onResend()}>
          {t("Renvoyer l'invitation")}
        </Button>
      </div>

      <Space wrap>
        <Button type="primary" onClick={handleOpenTenant}>
          {t('Ouvrir la fiche')}
        </Button>
        <Button onClick={onCreateAnother}>{t('Créer une autre agence')}</Button>
      </Space>
    </Space>
  );
};
