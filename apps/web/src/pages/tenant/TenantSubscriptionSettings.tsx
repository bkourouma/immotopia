import React, { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Alert, Space, Spin, Tabs, Typography } from 'antd';
import { AccountStatementTab } from '../../components/subscription/AccountStatementTab';
import { SubscriptionInvoicesTab } from '../../components/subscription/SubscriptionInvoicesTab';
import { SubscriptionOverviewTab } from '../../components/subscription/SubscriptionOverviewTab';
import { SubscriptionPacksTab } from '../../components/subscription/SubscriptionPacksTab';
import { SubscriptionUsageTab } from '../../components/subscription/SubscriptionUsageTab';
import { useSubscriptionAccount } from '../../components/subscription/useSubscriptionAccount';
import { t } from '../../i18n/t';

const { Title, Text } = Typography;

type TabKey = 'vue-ensemble' | 'packs' | 'consommation' | 'factures' | 'releve';
const TAB_KEYS: TabKey[] = ['vue-ensemble', 'packs', 'consommation', 'factures', 'releve'];

/**
 * `/tenant/:tenantId/settings/abonnement` — « Abonnement et factures » (spec 045).
 *
 * Cinq onglets (`?onglet=`) : vue d'ensemble, packs et extensions (ajout et
 * retrait en libre-service), consommation, factures (existant, PDF et paiement
 * en ligne) et relevé de compte. La page reste mince : un composant par onglet
 * sous `components/subscription/`. Les routes `/subscription/*` restent
 * ouvertes à une agence en lecture seule ; les refus d'ajout et de retrait sont
 * faits par l'API (`canManage` et `manageBlockedReason`).
 */
export const TenantSubscriptionSettings: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const account = useSubscriptionAccount(tenantId);
  const { entitlements, overview, loading, error } = account;

  const isParticulier = overview?.isParticulier ?? false;
  const requested = searchParams.get('onglet');
  // Retour de paiement (`?paiement=`) : on arrive sur les factures, qui suivent le règlement.
  const defaultTab: TabKey = searchParams.get('paiement') ? 'factures' : 'vue-ensemble';
  let activeKey: TabKey = TAB_KEYS.includes(requested as TabKey) ? (requested as TabKey) : defaultTab;
  if (activeKey === 'packs' && isParticulier) activeKey = 'vue-ensemble';

  const selectTab = (key: string) => {
    setSearchParams(
      previous => {
        const next = new URLSearchParams(previous);
        next.set('onglet', key);
        return next;
      },
      { replace: true }
    );
  };

  const items = useMemo(() => {
    if (!tenantId) return [];
    const tabs = [
      {
        key: 'vue-ensemble',
        label: t("Vue d'ensemble"),
        forceRender: true,
        children: <SubscriptionOverviewTab tenantId={tenantId} account={account} />
      },
      {
        key: 'packs',
        label: t('Packs et extensions'),
        hidden: isParticulier,
        children: <SubscriptionPacksTab tenantId={tenantId} account={account} />
      },
      {
        key: 'consommation',
        label: t('Consommation'),
        children: <SubscriptionUsageTab account={account} onAddExtension={() => selectTab('packs')} />
      },
      {
        key: 'factures',
        label: t('Factures'),
        forceRender: true,
        children: (
          <SubscriptionInvoicesTab
            tenantId={tenantId}
            account={account}
            onPaid={() => void account.refreshAfterChange()}
          />
        )
      },
      {
        key: 'releve',
        label: t('Relevé de compte'),
        children: <AccountStatementTab tenantId={tenantId} version={account.version} />
      }
    ];
    return tabs.filter(tab => !tab.hidden);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, account, isParticulier]);

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
          {t('Abonnement et factures')}
        </Title>
        <Alert type="info" showIcon message={t("Cette agence n'a pas encore d'abonnement.")} />
      </Space>
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Title level={2} style={{ margin: 0 }}>
          {t('Abonnement et factures')}
        </Title>
        <Text type="secondary">
          {t('Ajoutez ou retirez des packs et extensions, suivez votre consommation, vos factures et votre solde.')}
        </Text>
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

      <Tabs activeKey={activeKey} onChange={selectTab} items={items} />
    </Space>
  );
};
