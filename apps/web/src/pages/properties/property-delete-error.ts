/**
 * Refus de suppression d'un bien (409 métier : bail actif, mandat, tickets…).
 * Renvoie le message du serveur, déjà traduit et listant les blocages, ou
 * `null` quand l'erreur est autre chose (réseau, droits, 5xx).
 */
export function blocageSuppression(error: unknown): string | null {
  const response = (error as { response?: { status?: number; data?: { message?: unknown; error?: unknown } } })
    ?.response;
  if (response?.status !== 409) return null;
  const message = response.data?.message ?? response.data?.error;
  return typeof message === 'string' && message ? message : null;
}
