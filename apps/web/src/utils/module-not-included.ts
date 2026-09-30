/**
 * Un appel d'API a-t-il été refusé parce que la fonction n'est pas comprise
 * dans l'abonnement (403 `MODULE_NOT_INCLUDED`) ?
 *
 * Un composant qui charge sa donnée s'en sert pour afficher l'état
 * `<ModuleNotIncluded>` au lieu d'un tableau « Aucune donnée » : un refus
 * n'est pas un vide.
 */
export function isModuleNotIncludedError(error: unknown): boolean {
  const response = (error as { response?: { status?: number; data?: { code?: unknown } } } | null)?.response;
  return response?.status === 403 && response.data?.code === 'MODULE_NOT_INCLUDED';
}
