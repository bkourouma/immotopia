/**
 * Un appel d'API a-t-il été refusé parce que l'option payante « AG en direct et visio »
 * n'est pas comprise dans l'abonnement (403 `OPTION_NOT_INCLUDED`) ?
 *
 * Distinct de `MODULE_NOT_INCLUDED` : l'écran concerné (console « En direct » d'une AG) affiche
 * alors son état « option non souscrite » au lieu d'un « Accès refusé » générique.
 */
export function isOptionNotIncludedError(error: unknown): boolean {
  const response = (error as { response?: { status?: number; data?: { code?: unknown } } } | null)?.response;
  return response?.status === 403 && response.data?.code === 'OPTION_NOT_INCLUDED';
}
