/**
 * Constantes partagées entre le gabarit téléchargeable (`gabarits.ts`) et
 * l'aperçu de l'import (page patrimoine) : la ligne d'exemple du gabarit est
 * marquée, et l'import l'écarte d'office — une ligne d'exemple oubliée dans le
 * fichier ne doit JAMAIS créer un bien fictif.
 */

/** Préfixe de la ligne d'exemple, écrit dans sa première cellule renseignée. */
export const MARQUEUR_EXEMPLE = '[EXEMPLE]';

/** Vrai si une cellule du fichier porte le marqueur de la ligne d'exemple. */
export function estLigneExemple(cellules: string[]): boolean {
  return cellules.some(cellule => cellule.trim().toUpperCase().startsWith(MARQUEUR_EXEMPLE));
}
