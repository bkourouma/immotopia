import { t } from '../i18n/t';

/**
 * Statuts d'un paiement locatif et changements de statut permis à la main.
 *
 * Miroir de `TRANSITIONS_STATUT` (`packages/api/src/services/rental-payment-service.ts`) :
 * l'API refuse tout autre changement par un 409. L'écran ne propose donc que ce
 * qu'elle accepte, au lieu de laisser choisir un statut voué au refus.
 *
 * - un paiement attendu devient réussi, échoué ou annulé ;
 * - un paiement encaissé ne revient jamais « en attente » (annulé ou rejeté ;
 *   pas de remboursement à la main, aucun flux de remboursement n'existe) ;
 * - un paiement annulé ou échoué se réactive en « Réussi » (correction d'une
 *   annulation faite par erreur) ;
 * - un remboursement est définitif.
 */
export type StatutPaiement = 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELED' | 'REFUNDED' | 'PARTIALLY_REFUNDED';

const TRANSITIONS: Record<StatutPaiement, readonly StatutPaiement[]> = {
  PENDING: ['SUCCESS', 'FAILED', 'CANCELED'],
  SUCCESS: ['CANCELED', 'FAILED'],
  FAILED: ['SUCCESS'],
  CANCELED: ['SUCCESS'],
  PARTIALLY_REFUNDED: ['REFUNDED', 'CANCELED'],
  REFUNDED: []
};

/** Statuts vers lesquels on peut faire passer un paiement (liste vide : statut définitif ou inconnu). */
export function statutsAtteignables(statut: string): StatutPaiement[] {
  return [...(TRANSITIONS[statut as StatutPaiement] ?? [])];
}

/** Libellé d'un statut, évalué au rendu pour suivre la langue affichée. */
export function libelleStatutPaiement(statut: string): string {
  switch (statut) {
    case 'PENDING':
      return t('En attente');
    case 'SUCCESS':
      return t('Réussi');
    case 'FAILED':
      return t('Échoué');
    case 'CANCELED':
      return t('Annulé');
    case 'REFUNDED':
      return t('Remboursé');
    case 'PARTIALLY_REFUNDED':
      return t('Partiellement remboursé');
    default:
      return statut;
  }
}
