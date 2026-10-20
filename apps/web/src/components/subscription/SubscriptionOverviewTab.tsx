import React from 'react';
import { Alert, Card, Descriptions, Space, Typography } from 'antd';
import { PersonalTierCard } from '../personal-space/PersonalTierCard';
import { formatMoney, StatusTag } from '../primitives';
import { formatLongDate, moduleLabel, phaseInfo } from './subscription-account-labels';
import type { SubscriptionAccount } from './useSubscriptionAccount';
import { t } from '../../i18n/t';

const { Text } = Typography;

function daysRemaining(value: string | null | undefined): number | null {
  if (!value) return null;
  const diff = new Date(value).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}

interface Props {
  tenantId: string;
  account: SubscriptionAccount;
}

/** Onglet « Vue d'ensemble » : formule, solde, prochaine facture estimée, modules. */
export const SubscriptionOverviewTab: React.FC<Props> = ({ tenantId, account }) => {
  const { entitlements, overview, preview, overviewError } = account;
  if (!entitlements) return null;

  const info = phaseInfo(entitlements.phase);
  const trialDays = entitlements.phase === 'TRIAL' ? daysRemaining(entitlements.trialEndsAt) : null;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card title={t('Formule')}>
        <Descriptions column={{ xs: 1, sm: 2 }} size="small">
          <Descriptions.Item label={t('Statut')}>
            <StatusTag status={entitlements.phase} tone={info.tone} label={info.label} />
          </Descriptions.Item>
          <Descriptions.Item label={t('Cycle de facturation')}>
            {entitlements.billingCycle === 'ANNUAL' ? t('Annuel (11 mois facturés)') : t('Mensuel')}
          </Descriptions.Item>
          <Descriptions.Item label={t('Packs')}>
            {entitlements.packs.length > 0 ? entitlements.packs.join(', ') : t('Aucun')}
          </Descriptions.Item>
          <Descriptions.Item label={t('Période en cours')}>
            {formatLongDate(entitlements.currentPeriodStart)} — {formatLongDate(entitlements.currentPeriodEnd)}
          </Descriptions.Item>
          {entitlements.phase === 'TRIAL' && (
            <Descriptions.Item label={t("Jours d'essai restants")}>
              {trialDays !== null ? t('{{value}} jour(s)', { value: trialDays }) : '—'}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Card title={t('Compte')}>
        {overviewError && !overview ? (
          <Alert type="error" showIcon message={overviewError} />
        ) : (
          overview && (
            <Descriptions column={{ xs: 1, sm: 2 }} size="small">
              <Descriptions.Item label={t('Solde dû à ce jour (TTC)')}>
                <Text strong>{formatMoney(overview.balance.amountDue)}</Text>
              </Descriptions.Item>
              <Descriptions.Item label={t('Dont en retard (TTC)')}>
                <Text type={overview.balance.overdueAmount > 0 ? 'danger' : undefined}>
                  {formatMoney(overview.balance.overdueAmount)}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label={t('Prochaine échéance')}>
                {formatLongDate(overview.balance.nextDueAt)}
              </Descriptions.Item>
              <Descriptions.Item label={t('Prochaine facture estimée (TTC)')}>
                {preview ? formatMoney(preview.amountTotal) : '—'}
              </Descriptions.Item>
            </Descriptions>
          )
        )}
      </Card>

      <PersonalTierCard tenantId={tenantId} />

      <Card title={t('Modules')}>
        <Space wrap>
          {entitlements.modules.length > 0 ? (
            entitlements.modules.map(key => <StatusTag key={key} status="ACTIVE" label={moduleLabel(key)} />)
          ) : (
            <Text type="secondary">{t('Aucun module ouvert')}</Text>
          )}
        </Space>
      </Card>
    </Space>
  );
};
