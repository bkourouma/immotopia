import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getOwnEntitlements,
  type InvoicePreview,
  type TenantEntitlements
} from '../../services/subscription-v2-service';
import {
  getAccountInvoicePreview,
  getAccountOverview,
  type SubscriptionAccountOverview
} from '../../services/subscription-account-service';
import { ASSET_USAGE_QUERY_KEY } from '../../services/personal-space-service';
import { entityKeyPrefix } from '../../lib/query-keys';
import { ENTITLEMENTS_CHANGED_EVENT } from '../../utils/tenant-events';
import { apiErrorMessage } from './subscription-account-labels';
import { t } from '../../i18n/t';

export interface SubscriptionAccount {
  entitlements: TenantEntitlements | null;
  overview: SubscriptionAccountOverview | null;
  /** Prochaine facture estimée ; `null` si elle n'a pas pu être calculée. */
  preview: InvoicePreview | null;
  loading: boolean;
  /** Échec du chargement des droits (bloquant). */
  error: string | null;
  /** Échec du chargement de l'aperçu du compte (les onglets concernés l'affichent). */
  overviewError: string | null;
  /** Augmente à chaque rechargement : les onglets rechargent leurs propres données. */
  version: number;
  /** Relit droits, aperçu et facture estimée sans remettre la page en chargement. */
  refresh: () => Promise<void>;
  /**
   * À appeler après un ajout ou un retrait : relit tout, invalide les caches
   * (droits du menu, usage patrimoine) et prévient le menu.
   */
  refreshAfterChange: () => Promise<void>;
}

/** Données de la page « Abonnement et factures » : droits, aperçu du compte, facture estimée. */
export function useSubscriptionAccount(tenantId: string | undefined): SubscriptionAccount {
  const queryClient = useQueryClient();
  const [entitlements, setEntitlements] = useState<TenantEntitlements | null>(null);
  const [overview, setOverview] = useState<SubscriptionAccountOverview | null>(null);
  const [preview, setPreview] = useState<InvoicePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const load = useCallback(
    async (initial: boolean) => {
      if (!tenantId) return;
      if (initial) setLoading(true);
      setError(null);
      const [ent, ovw, prv] = await Promise.allSettled([
        getOwnEntitlements(tenantId),
        getAccountOverview(tenantId),
        getAccountInvoicePreview(tenantId)
      ]);
      if (ent.status === 'fulfilled') setEntitlements(ent.value);
      else setError(apiErrorMessage(ent.reason, t("Erreur lors du chargement de l'abonnement")));
      if (ovw.status === 'fulfilled') {
        setOverview(ovw.value);
        setOverviewError(null);
      } else {
        setOverviewError(apiErrorMessage(ovw.reason, t('Erreur lors du chargement du compte')));
      }
      setPreview(prv.status === 'fulfilled' ? prv.value : null);
      setVersion(v => v + 1);
      setLoading(false);
    },
    [tenantId]
  );

  useEffect(() => {
    load(true);
  }, [load]);

  const refresh = useCallback(() => load(false), [load]);

  const refreshAfterChange = useCallback(async () => {
    await load(false);
    // Le menu relit les droits (nouveau module) ; l'usage patrimoine a pu changer de plafond.
    queryClient.invalidateQueries({ queryKey: entityKeyPrefix('tenant-entitlements', tenantId) as unknown[] });
    queryClient.invalidateQueries({ queryKey: [ASSET_USAGE_QUERY_KEY] });
    window.dispatchEvent(new CustomEvent(ENTITLEMENTS_CHANGED_EVENT, { detail: { tenantId: tenantId ?? null } }));
  }, [load, queryClient, tenantId]);

  return { entitlements, overview, preview, loading, error, overviewError, version, refresh, refreshAfterChange };
}
