import type { QueryClient } from '@tanstack/react-query';

/**
 * Requêtes React Query du portail locataire qui changent quand une déclaration
 * est créée ou annulée : « Mes déclarations ». Les échéances et l'historique de
 * la page Paiements ne sont pas dans React Query : la page les recharge via ses
 * `loadInstallments` / `loadPaymentHistory` (callback `onSuccess` du formulaire).
 */
export const MY_DECLARATIONS_KEY = ['tenant-portal', 'declarations'] as const;

export function invalidateAfterDeclaration(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: MY_DECLARATIONS_KEY });
}
