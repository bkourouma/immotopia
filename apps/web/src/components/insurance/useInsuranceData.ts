import { useCallback, useEffect, useState } from 'react';
import { listInsuranceClaims, listInsurancePolicies } from '../../services/insurance-service';
import type { InsuranceClaimDto, InsurancePolicyDto } from '../../types/insurance-types';
import { apiErrorMessage } from '../patrimoine/patrimoine-labels';
import { t } from '../../i18n/t';

/**
 * Polices et sinistres d'un bien. Après une erreur de rechargement, les
 * données déjà chargées restent disponibles (`loaded`) : l'écran affiche
 * l'erreur sans masquer le reste.
 */
export function useInsuranceData(tenantId: string, propertyId: string) {
  const [policies, setPolicies] = useState<InsurancePolicyDto[]>([]);
  const [claims, setClaims] = useState<InsuranceClaimDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [policyList, claimList] = await Promise.all([
        listInsurancePolicies(tenantId, { propertyId }),
        listInsuranceClaims(tenantId, { propertyId })
      ]);
      setPolicies(policyList);
      setClaims(claimList);
      setLoaded(true);
      setError(null);
    } catch (e) {
      setError(apiErrorMessage(e, t('Impossible de charger les assurances.')));
    } finally {
      setLoading(false);
    }
  }, [tenantId, propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { policies, claims, loading, loaded, error, load };
}
