/**
 * Échappement des jokers de LIKE / ILIKE pour une saisie de l'utilisateur.
 *
 * Pourquoi : Prisma 5 transmet tels quels à PostgreSQL les filtres
 * `contains`, `startsWith` et `endsWith` (traduits en `LIKE` / `ILIKE`). Un
 * `%` ou un `_` tapé dans une recherche y joue donc le joker : « 100% » trouve
 * tout ce qui contient « 100 », « lot_7 » trouve « lotA7 ». On échappe `\`
 * d'abord, puis `%` et `_`, par `\`, caractère d'échappement par défaut du
 * LIKE de PostgreSQL : le texte saisi est alors cherché littéralement.
 *
 * À appliquer à toute valeur de `contains` / `startsWith` / `endsWith` venant
 * d'une saisie (recherche, référence, adresse…), jamais à un préfixe calculé
 * par le code. Sert aussi aux motifs du SQL brut
 * (`lib/accounting-exports/queries/sql.ts`).
 *
 * Le jour où Prisma échappera lui-même ces caractères, retirer les appels à
 * `escapeLike` devant ses filtres : sinon double échappement (« 100% »
 * chercherait « 100\% »).
 */

/** Échappe `\`, `%` et `_` : le texte saisi est cherché tel quel dans un LIKE / ILIKE. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, match => '\\' + match);
}
