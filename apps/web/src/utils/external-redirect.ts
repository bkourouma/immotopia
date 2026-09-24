/**
 * Quitte l'application pour une page externe — la page de paiement hébergée
 * de PaySecureHub (Lot 7), par exemple.
 *
 * Isolé dans son propre module pour que les tests puissent le remplacer par
 * `vi.mock` : jsdom déclare `window.location.assign` non configurable, donc
 * impossible à espionner directement.
 */
export function redirectToExternalUrl(url: string): void {
  window.location.assign(url);
}
