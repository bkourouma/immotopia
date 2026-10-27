import { useEffect, useState } from 'react';
import { getSyndicGatewaySettings } from '../../../services/syndic-online-payment-service';

/**
 * La copropriété a-t-elle une configuration de paiement en ligne utilisable
 * (active et, en mode réel, munie de son identifiant et de sa clé) ?
 *
 * Lecture `SYNDIC_VIEW` (contrat §1.1). Le moindre échec (droit refusé, réseau,
 * copropriété sans configuration) vaut « non » : une action de paiement qui ne
 * pourrait pas aboutir n'est pas proposée. L'API reste l'autorité.
 */
export function useSyndicOnlinePaymentUsable(tenantId?: string | null, syndicId?: string | null): boolean {
  const [usable, setUsable] = useState(false);

  useEffect(() => {
    setUsable(false);
    if (!tenantId || !syndicId) return;
    let cancelled = false;

    getSyndicGatewaySettings(tenantId, syndicId)
      .then(settings => {
        if (!cancelled) setUsable(settings?.usable === true);
      })
      .catch(() => {
        if (!cancelled) setUsable(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tenantId, syndicId]);

  return usable;
}
