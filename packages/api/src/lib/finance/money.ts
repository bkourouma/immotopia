/**
 * Primitives monetaires partagees par tous les modules financiers.
 *
 * Extrait de `lib/syndics/finance-utils.ts` (decision D1 du plan de mise en
 * oeuvre) : la copropriete et les futurs comptes de tiers (lot 1) arrondissent
 * les montants de la meme facon, et ce calcul ne doit exister qu'a un seul
 * endroit. `finance-utils.ts` re-exporte ces symboles pour que les imports
 * existants continuent de fonctionner sans modification.
 */

export const MONEY_PRECISION = 2;

export function roundMoney(value: number): number {
  return Number(value.toFixed(MONEY_PRECISION));
}

// ---------------------------------------------------------------------------
// Arrondi du franc CFA — lot 2, defaut n°4 du §6.1 bis
// ---------------------------------------------------------------------------

/**
 * Le franc CFA n'a pas de subdivision : la precision applicative est l'unite.
 *
 * `MONEY_PRECISION` reste a 2 parce que la colonne reste `Decimal(14,2)` : le
 * stockage ne change pas (decision D9 du plan). C'est l'arrondi *applicatif*
 * du chemin d'ecriture du lot 2 qui descend a l'unite, de sorte que la partie
 * decimale stockee par ce chemin vaille toujours `.00`.
 */
export const XOF_PRECISION = 0;

/**
 * Arrondi deterministe a l'unite, demie vers le haut.
 *
 * **Pourquoi ne pas passer par `toFixed`.** `roundMoney` fait
 * `Number(value.toFixed(2))`, et herite donc de la representation binaire du
 * flottant : `100.005` vaut en machine `100.00499999999999545...`, si bien que
 * l'arrondi part vers le bas sans que rien dans le code ne le dise. C'est le
 * defaut n°4, fige par `syndics.owner-accounts.ledger.test.ts` (« roundMoney
 * arrondit 100.005 a 100.00 »).
 *
 * A l'unite, le probleme disparait de lui-meme : une demie exacte (`100.5`,
 * `-0.5`) **est** representable en binaire, contrairement a un demi-centime.
 * `Math.round` devient alors totalement previsible — 100.5 donne 101, 100.4
 * donne 100 — et ne fait aucun detour par une chaine de caracteres.
 *
 * **Portee volontairement limitee au lot 2.** `roundMoney` n'est pas modifiee :
 * elle sert la copropriete et le lot 1, dont les montants au centime sont
 * figes par des dizaines de tests et surtout par des donnees deja en base.
 * Voir le rapport du lot 2 et `data-model.md#defaut-4`.
 */
export function roundMoneyXof(value: number): number {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return 0;
  }

  const rounded = Math.round(numeric);

  // `Math.round(-0.4)` vaut `-0`, qui n'est pas `0` au sens de `Object.is` —
  // donc pas au sens de `toBe` de Jest, ni d'une comparaison de soldes.
  return rounded === 0 ? 0 : rounded;
}

/**
 * Arrondit un POURCENTAGE, a deux decimales.
 *
 * ---------------------------------------------------------------------------
 * Pourquoi cette fonction existe, alors que `roundMoney` ferait le meme calcul
 * ---------------------------------------------------------------------------
 *
 * Parce qu'un pourcentage n'est pas un montant, et que confondre les deux
 * produit un chiffre faux qui a l'air juste.
 *
 * A l'integration du lot 3, j'ai uniformise l'arrondi du lot sur
 * `roundMoneyXof` — la bonne decision pour les montants, le franc CFA n'ayant
 * pas de subdivision. Le remplacement a aussi touche deux pourcentages :
 * la part d'un budget consommee, et l'ecart en pourcentage du tableau de
 * bord. « 83,33 % consomme » est devenu « 83 % », et c'est un test qui l'a
 * rattrape, pas une relecture.
 *
 * Une fonction nommee pour ce qu'elle arrondit empeche de refaire l'erreur :
 * on ne remplace pas `roundPercent` par `roundMoneyXof` sans s'en apercevoir.
 *
 * Deux decimales, parce qu'un pourcentage de budget se lit au centieme —
 * 83,33 % et 83 % ne disent pas la meme chose quand on approche d'un seuil.
 */
export function roundPercent(value: number): number {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return 0;
  }

  const rounded = Math.round(numeric * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}
