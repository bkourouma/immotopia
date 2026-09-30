/**
 * Extensions vendables selon les packs détenus (`rules.requiresAnyOf` du
 * catalogue, `isExtensionAllowed` côté API). Une offre sans règle est vendable
 * à tous ; sinon il faut détenir au moins un des packs requis.
 */
export function isExtensionAllowed(
  requiresAnyOf: readonly string[] | undefined,
  heldPacks: readonly string[]
): boolean {
  return !requiresAnyOf || requiresAnyOf.length === 0 || requiresAnyOf.some(pack => heldPacks.includes(pack));
}

/**
 * Miroir de `requiresAnyOf` des quatre extensions de capacité, pour l'écran
 * de l'agence, qui n'a pas accès au catalogue d'administration.
 */
export const EXTENSION_REQUIRED_PACKS: Readonly<Record<string, readonly string[]>> = {
  EXT_LOTS_10: ['AGENCE', 'SYNDIC', 'PROMOTEUR', 'INTEGRE'],
  EXT_COPRO: ['SYNDIC', 'INTEGRE'],
  EXT_CHANTIER: ['PROMOTEUR', 'INTEGRE'],
  EXT_BIENS_10: ['PATRIMOINE_ESSENTIEL']
};
