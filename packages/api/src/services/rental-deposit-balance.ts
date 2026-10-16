/**
 * Solde actuel d'un dépôt de garantie : collecté - remboursé - confisqué.
 *
 * Même définition que `current_balance` de l'écran agence
 * (`rental-deposit-controller.ts`) : les portails locataire et propriétaire
 * affichent ce solde comme « montant détenu ». `held_amount` ne compte que les
 * retenues (mouvements HOLD) et vaut 0 pour un dépôt simplement collecté.
 */
export function depositCurrentBalance(deposit: {
  collected_amount: unknown;
  refunded_amount: unknown;
  forfeited_amount: unknown;
}): number {
  return Number(deposit.collected_amount) - Number(deposit.refunded_amount) - Number(deposit.forfeited_amount);
}
