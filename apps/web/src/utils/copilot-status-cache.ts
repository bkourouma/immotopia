/**
 * Partage la lecture de `GET /ai/status` entre les composants montés ensemble
 * (coquille, bouton flottant, page de l'assistant) : une seule requête par
 * agence, réutilisée pendant un court instant. Module volontairement sans
 * dépendance, pour que les tests puissent le réinitialiser sans charger le réseau.
 */

/** Durée de réutilisation d'une réponse : assez longue pour une rafale, assez courte pour suivre un réglage. */
export const COPILOT_STATUS_TTL_MS = 5000;

interface Entry<T> {
  promise: Promise<T>;
  /** Date d'expiration ; `Infinity` tant que la requête est en cours. */
  expiresAt: number;
}

const entries = new Map<string, Entry<unknown>>();

/**
 * Renvoie la promesse en cours ou récente de l'agence, sinon lance `fetcher`.
 * Une demande pour une autre agence écarte les entrées des autres : le cache ne
 * garde jamais l'état d'une agence quittée.
 */
export function sharedCopilotStatus<T>(
  tenantId: string,
  fetcher: () => Promise<T>,
  now: number = Date.now()
): Promise<T> {
  for (const key of entries.keys()) if (key !== tenantId) entries.delete(key);
  const hit = entries.get(tenantId) as Entry<T> | undefined;
  if (hit && hit.expiresAt > now) return hit.promise;

  const entry: Entry<T> = { promise: undefined as unknown as Promise<T>, expiresAt: Number.POSITIVE_INFINITY };
  entry.promise = fetcher().then(
    value => {
      entry.expiresAt = Date.now() + COPILOT_STATUS_TTL_MS;
      return value;
    },
    error => {
      // Un échec n'est jamais réutilisé : le prochain montage réessaie.
      if (entries.get(tenantId) === entry) entries.delete(tenantId);
      throw error;
    }
  );
  entries.set(tenantId, entry as Entry<unknown>);
  return entry.promise;
}

/** Vide le cache (tests, déconnexion). */
export function resetCopilotStatusCache(): void {
  entries.clear();
}
