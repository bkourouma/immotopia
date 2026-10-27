import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Space, Typography } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { getOwnEntitlements, type TenantEntitlements } from '../../services/subscription-v2-service';
import { TenantInvoicesSection } from '../../components/subscription/TenantInvoicesSection';
import { AccountAccessReserved } from '../../components/subscription/AccountAccessReserved';
import { useMenuEntryAccess } from '../../hooks/useMenuAccess';
import { ASSET_USAGE_QUERY_KEY } from '../../services/personal-space-service';
import { t } from '../../i18n/t';

const { Title, Text } = Typography;

/**
 * `/tenant/:tenantId/settings/facturation` — factures de la plateforme vues par
 * l'agence (menu « Mon compte › Facturation ») : liste, PDF, paiement en ligne
 * et suivi du retour `?paiement=<codePaiement>`. Les routes `/subscription/*`
 * restent ouvertes à une agence en lecture seule : c'est ici qu'elle règle la
 * facture qui la bloque.
 */
export const TenantBillingSettings: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const queryClient = useQueryClient();
  // Mêmes droits que l'API (TENANT_SETTINGS_VIEW) : sans eux, aucun appel et un état « Accès réservé ».
  const access = useMenuEntryAccess(tenantId, 'mon-compte-facturation');
  const canView = access.ready && access.allowed;
  const [entitlements, setEntitlements] = useState<TenantEntitlements | null>(null);

  const loadEntitlements = useCallback(() => {
    if (!tenantId || !canView) return Promise.resolve();
    // Les factures se paient même quand les droits ne se lisent pas : l'alerte est facultative.
    return getOwnEntitlements(tenantId)
      .then(setEntitlements)
      .catch(() => setEntitlements(null));
  }, [tenantId, canView]);

  useEffect(() => {
    loadEntitlements();
  }, [loadEntitlements]);

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Title level={2} style={{ margin: 0 }}>
          {t('Facturation')}
        </Title>
        <Text type="secondary">{t('Vos factures ImmoTopia : consultation, PDF et paiement en ligne.')}</Text>
      </div>

      {access.ready && !access.allowed && <AccountAccessReserved />}

      {entitlements?.manualReadOnlyReason ? (
        <Alert
          type="error"
          showIcon
          message={t('Compte en lecture seule')}
          description={t('Décidée par ImmoTopia. Motif : {{value}}', { value: entitlements.manualReadOnlyReason })}
        />
      ) : (
        entitlements?.readOnly && (
          <Alert
            type="warning"
            showIcon
            message={t('Compte en lecture seule')}
            description={t('Réglez la facture en attente ci-dessous pour retrouver l’accès complet.')}
          />
        )
      )}

      {tenantId && canView && (
        <TenantInvoicesSection
          tenantId={tenantId}
          onPaid={() => {
            loadEntitlements();
            // Montée de palier confirmée : l'usage et le plafond ont changé.
            queryClient.invalidateQueries({ queryKey: [ASSET_USAGE_QUERY_KEY] });
          }}
        />
      )}
    </Space>
  );
};
