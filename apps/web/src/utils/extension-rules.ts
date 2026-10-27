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
