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
  const solde = Number(deposit.collected_amount) - Number(deposit.refunded_amount) - Number(deposit.forfeited_amount);
  // Arrondi au centime : `100,10 - 100` ne doit pas donner `0,0999999…`.
  return Math.round((solde + Number.EPSILON) * 100) / 100;
}
