/**
 * Contrôle des deux décimales d'un montant (colonnes `Decimal(12,2)` / `(14,2)`).
 *
 * Source unique : les schémas de validation l'importent au lieu de recopier une
 * tolérance. L'ancienne règle, `|v*100 - round(v*100)| < 1e-6`, refusait à tort
 * des montants valides proches du plafond (1234567890.12 : `v*100` porte une
 * erreur flottante supérieure à 1e-6) et laissait passer des écarts minuscules.
 * Ici, on compare le nombre à son arrondi à 2 décimales : exact, sans tolérance.
 */
export function auPlusDeuxDecimales(valeur: number): boolean {
  return Number.isFinite(valeur) && Number(valeur.toFixed(2)) === valeur;
}
