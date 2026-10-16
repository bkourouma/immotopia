/** Les cibles `@db.Uuid` : un autre format n'est pas une erreur de base, c'est une cible inconnue (404). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}
