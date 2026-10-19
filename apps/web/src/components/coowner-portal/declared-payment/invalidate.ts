import type { QueryClient } from '@tanstack/react-query';

/**
 * Requêtes du portail qui changent quand une déclaration est créée ou annulée :
 * appels (marque « déclaré, en vérification »), déclarations, compte du lot,
 * lots (soldes), paiements et suivi mensuel. Les reçus, documents, assemblées,
 * fiche du syndic et disponibilités ne bougent pas : on ne les recharge pas.
 */
const DECLARATION_DEPENDENT_KEYS = [
  'charge-calls',
  'declarations',
  'lot-account',
  'lots',
  'payments',
  'monthly-tracking'
];

export function invalidateAfterDeclaration(queryClient: QueryClient): void {
  for (const key of DECLARATION_DEPENDENT_KEYS) {
    void queryClient.invalidateQueries({ queryKey: ['coowner-portal', key] });
  }
}
