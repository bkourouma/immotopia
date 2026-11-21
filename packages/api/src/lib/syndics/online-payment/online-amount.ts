/**
 * Montant du paiement en ligne d'appels de charges : FRANCS ENTIERS (FCFA).
 *
 * Règle unique, partagée par le démarrage (`checkout-start`), le lien « Payer
 * cet appel » (`charge-call-link`) et le règlement (`checkout-settle`).
 */

/** Plus petit écart non nul toléré, en centimes : strictement moins d'un franc. */
const ONE_FRANC_CENTS = 100;

/**
 * Montant envoyé au fournisseur : le reste dû (en centimes) arrondi au franc
 * le plus proche. Un reste fractionnaire historique (1000,60) donne 1001.
 */
export function onlineAmountDue(outstandingCents: number): number {
  return Math.round(outstandingCents / ONE_FRANC_CENTS);
}

/**
 * Le reste dû (centimes) couvre-t-il le paiement `amountCents` ? Tolérance
 * STRICTEMENT inférieure à 1 franc : `reste + 99 >= montant`. Ainsi le montant
 * arrondi à la hausse envoyé pour un reste de 1000,60 (1001 francs) reste
 * accepté ; un reste réellement soldé (écart d'un franc ou plus) est refusé.
 * L'éventuel reliquat part en avance.
 */
export function outstandingCoversPayment(outstandingCents: number, amountCents: number): boolean {
  return outstandingCents + (ONE_FRANC_CENTS - 1) >= amountCents;
}
