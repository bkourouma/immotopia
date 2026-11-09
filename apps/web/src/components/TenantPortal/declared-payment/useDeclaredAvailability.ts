import { useQuery } from '@tanstack/react-query';
import { getDeclaredPaymentAvailability } from '../../../services/tenant-portal-declared-payment-service';

/** Clé partagée : le formulaire, la page et l'invalidation lisent la même disponibilité. */
export const DECLARED_AVAILABILITY_KEY = ['tenant-portal', 'declared-availability'] as const;

/**
 * Disponibilité du paiement déclaré pour l'agence du locataire. Une erreur
 * (route absente, 403) laisse `data` vide : l'écran retombe sur « indisponible »
 * sans rien casser.
 */
export function useDeclaredAvailability(enabled = true) {
  return useQuery({
    queryKey: DECLARED_AVAILABILITY_KEY,
    queryFn: () => getDeclaredPaymentAvailability(),
    enabled,
    staleTime: 60_000,
    retry: false
  });
}
