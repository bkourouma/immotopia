/**
 * Clés et durées de fraîcheur du cache (REFONTE_UI_UX.md §8.4).
 *
 * La convention de clé est `[entité, tenantId, filtres]`. Les trois segments
 * comptent, et le deuxième en particulier :
 *
 * - **`entité`** sépare les caches. Deux écrans qui lisent la même entité avec
 *   les mêmes filtres partagent la même entrée, donc la même requête : c'est ce
 *   qui dédoublonne les appels concurrents.
 * - **`tenantId`** est dans la clé, jamais implicite. Un collaborateur peut
 *   changer d'agence sans rechargement ; sans ce segment, la liste de la
 *   première agence resterait servie depuis le cache à la seconde.
 * - **`filtres`** rend chaque combinaison distincte. Revenir à un filtre déjà
 *   consulté sert la donnée immédiatement, puis la revalide en arrière-plan.
 */

/**
 * Durées de fraîcheur, en millisecondes.
 *
 * `staleTime` ne dit pas « garder », il dit « ne pas redemander ». Une donnée
 * fraîche est servie sans requête ; passé ce délai, elle est toujours affichée
 * mais revalidée en arrière-plan. L'écran ne repasse jamais par son squelette
 * pour une donnée qu'il possède déjà.
 */
export const STALE_TIME = {
  /**
   * Listes et détails : 30 s. Assez pour absorber un aller-retour vers un
   * détail et le retour à la liste sans nouvelle requête, assez court pour
   * qu'un encaissement saisi par un collègue apparaisse vite.
   */
  list: 30_000,
  /**
   * Référentiels : 5 min. Prestataires, communes, types de bien, rôles — ils
   * changent à l'échelle du mois, et `components/maintenance/VendorSelect.tsx`
   * les rechargeait à chaque montage.
   */
  reference: 5 * 60_000
} as const;

/** Segment de filtres : les clés sont sérialisées, l'ordre des champs compte. */
type Filters = Record<string, unknown> | undefined;

/**
 * Normalise le segment de filtres.
 *
 * React Query compare les clés par valeur, mais champ à champ dans l'ordre de
 * l'objet : `{status, page}` et `{page, status}` produiraient deux entrées de
 * cache pour la même requête. Les clés sont donc triées, et les valeurs vides
 * retirées — `{status: undefined}` doit être la même chose que `{}`, sinon
 * effacer un filtre ne ramènerait pas à l'entrée déjà chargée.
 */
export function normalizeFilters(filters: Filters): Record<string, unknown> | null {
  if (!filters) return null;
  const entries = Object.entries(filters)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b));
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

/**
 * Construit une clé de requête.
 *
 * @param entity   Nom de l'entité, au pluriel : `properties`, `leases`.
 * @param tenantId Agence concernée. `null` pour ce qui n'en dépend pas.
 * @param filters  Filtres, pagination et tri. Normalisés.
 */
export function queryKey(entity: string, tenantId?: string | null, filters?: Filters): readonly unknown[] {
  return [entity, tenantId ?? null, normalizeFilters(filters)] as const;
}

/**
 * Clé de détail : `[entité, tenantId, 'detail', id]`.
 *
 * Le segment `'detail'` évite qu'un identifiant se confonde avec un jeu de
 * filtres, et permet d'invalider toutes les listes d'une entité sans toucher
 * aux détails déjà chargés — et inversement.
 */
export function detailKey(entity: string, tenantId: string | null | undefined, id: string): readonly unknown[] {
  return [entity, tenantId ?? null, 'detail', id] as const;
}

/**
 * Préfixe d'invalidation : tout ce qui concerne une entité dans une agence.
 *
 * À utiliser après une mutation. React Query invalide par préfixe, donc cette
 * clé couvre listes et détails sans avoir à énumérer les combinaisons de
 * filtres — c'est précisément ce qu'on ne peut pas faire à la main.
 */
export function entityKeyPrefix(entity: string, tenantId?: string | null): readonly unknown[] {
  return [entity, tenantId ?? null] as const;
}
