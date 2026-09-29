import React from 'react';
import { Alert, Button, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ASSET_USAGE_QUERY_KEY, getAssetUsage, type AssetUsage } from '../../services/personal-space-service';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { formatMoney } from '../primitives';
import { t } from '../../i18n/t';

const { Text } = Typography;

/** Chemin de l'écran d'abonnement de l'espace (montée de palier). */
export const subscriptionPath = (tenantId: string) => `/tenant/${tenantId}/settings/abonnement`;

export function useAssetUsage(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: queryKey(ASSET_USAGE_QUERY_KEY, tenantId),
    queryFn: () => getAssetUsage(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list,
    // Un échec du bandeau ne doit jamais gêner l'écran qui le porte.
    retry: false
  });
}

/** Message d'invitation, selon qu'il reste de la place ou non. */
export const UpgradeInvitation: React.FC<{ tenantId: string; usage: AssetUsage }> = ({ tenantId, usage }) => (
  <>
    {usage.canAdd
      ? t('Passez au palier payant pour suivre jusqu’à {{limit}} actifs.', {
          limit: usage.upgrade?.limit ?? ''
        })
      : t('Vous avez atteint la limite du palier gratuit : passez au palier payant pour ajouter d’autres actifs.')}{' '}
    <Link to={subscriptionPath(tenantId)}>{t('Passer au palier payant')}</Link>
    {usage.upgrade && (
      <Text type="secondary">
        {' · '}
        {t('{{prix}} par mois (tarif provisoire)', {
          prix: formatMoney(usage.upgrade.priceMonthly, { currency: usage.upgrade.currency })
        })}
      </Text>
    )}
  </>
);

/**
 * Bandeau « X actifs sur 10 » des écrans du patrimoine (lot 4C).
 *
 * - `FREE` : visible, avec l'invitation à passer au palier payant (lien vers
 *   l'écran d'abonnement) ; en alerte quand la limite est atteinte.
 * - `PAID` : une ligne discrète.
 * - `AGENCY` (ou erreur, ou chargement) : rien.
 */
export const AssetUsageBanner: React.FC<{ tenantId: string }> = ({ tenantId }) => {
  const { data: usage } = useAssetUsage(tenantId);
  if (!usage || usage.plan === 'AGENCY' || usage.limit === null) return null;

  const count = t('{{used}} actifs sur {{limit}}', { used: usage.used, limit: usage.limit });

  if (usage.plan === 'PAID') {
    return (
      <Text
        type="secondary"
        role="status"
        data-testid="asset-usage-banner"
        style={{ display: 'block', marginBottom: 'var(--space-3)' }}
      >
        {count}
      </Text>
    );
  }

  return (
    <Alert
      data-testid="asset-usage-banner"
      role="status"
      type={usage.canAdd ? 'info' : 'warning'}
      showIcon
      style={{ marginBottom: 'var(--space-4)' }}
      title={count}
      description={<UpgradeInvitation tenantId={tenantId} usage={usage} />}
    />
  );
};

/** Bouton vers l'écran d'abonnement, pour les messages d'erreur. */
export const UpgradeLinkButton: React.FC<{ tenantId: string }> = ({ tenantId }) => (
  <Link to={subscriptionPath(tenantId)}>
    <Button type="primary" size="small">
      {t('Passer au palier payant')}
    </Button>
  </Link>
);
