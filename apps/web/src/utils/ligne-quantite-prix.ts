/**
 * Quantité et prix unitaire sur une ligne de saisie — facture fournisseur,
 * bon de commande, budget de chantier, avenant.
 *
 * ---------------------------------------------------------------------------
 * La règle, en une phrase
 * ---------------------------------------------------------------------------
 *
 * **La quantité et le prix unitaire sont facultatifs. Quand les DEUX sont
 * renseignés, le montant devient leur produit et son champ passe en lecture
 * seule ; dès que l'un des deux est vide, le montant redevient saisissable et
 * se comporte exactement comme avant.**
 *
 * C'est la présentation la plus simple qui tienne le besoin : beaucoup de
 * dépenses n'ont pas de quantité — une prestation, un forfait de pose, une
 * régularisation — et devoir inventer « 1 × 250 000 » pour les saisir serait
 * une fausse précision que personne ne relirait. À l'inverse, « 2,5 tonnes à
 * 95 000 » se saisit une fois et ne se recalcule plus de tête.
 *
 * Aucun troisième mode, aucune case à cocher : l'état du champ « Montant »
 * suffit à dire lequel des deux chemins est actif, et il se lit d'un coup
 * d'œil.
 *
 * ---------------------------------------------------------------------------
 * Ce que ces deux champs ne sont pas
 * ---------------------------------------------------------------------------
 *
 * Ils ne sont **pas** la donnée de référence : le montant l'est, et c'est lui
 * que la comptabilité lit. La quantité et le prix unitaire sont une aide à la
 * saisie ET une information conservée — on veut pouvoir relire « 2,5 tonnes »
 * six mois plus tard — mais le serveur ne refait jamais la multiplication au
 * moment de la validation. Deux calculs du même chiffre finissent toujours
 * par différer d'un franc d'arrondi, et c'est alors le montant qui fait foi.
 */

/**
 * Le montant d'une ligne quand quantité et prix unitaire sont tous deux
 * renseignés, `null` sinon — auquel cas le montant reste à la main de qui
 * saisit.
 *
 * Le zéro est une valeur renseignée comme une autre : le test porte sur
 * `null`/`undefined`, jamais sur la véracité de la valeur, sans quoi un prix
 * unitaire nul (une ligne offerte) rebasculerait la ligne en saisie directe
 * sans que rien ne le dise.
 */
export function montantCalcule(
  quantity: number | null | undefined,
  unitPrice: number | null | undefined
): number | null {
  if (quantity === null || quantity === undefined) {
    return null;
  }
  if (unitPrice === null || unitPrice === undefined) {
    return null;
  }
  return quantity * unitPrice;
}

/**
 * `true` quand le champ « Montant » de la ligne doit passer en lecture seule,
 * c'est-à-dire exactement quand le produit se substitue à la saisie.
 */
export function montantVerrouille(quantity: number | null | undefined, unitPrice: number | null | undefined): boolean {
  return montantCalcule(quantity, unitPrice) !== null;
}
