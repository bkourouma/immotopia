/**
 * Ordre d'affichage des lots : numérique (« VILLA 2 » avant « VILLA 10 »).
 * Le tri SQL (`orderBy: { lotNumber }`) est alphabétique et mélange « VILLA 1 »,
 * « VILLA 10 », « VILLA 100 » : trier en mémoire avec cette fonction les listes
 * affichées. Ne pas l'appliquer aux calculs de répartition (l'ordre y décide de
 * l'attribution des centimes d'arrondi).
 */
export function compareLotNumbers<T extends { lotNumber: string; id: string }>(a: T, b: T): number {
  return a.lotNumber.localeCompare(b.lotNumber, 'fr', { numeric: true }) || a.id.localeCompare(b.id);
}
