/**
 * Mode de règlement fournisseur et compte de trésorerie choisi.
 *
 * `SupplierPayment` n'a pas de colonne pour le compte de trésorerie, et le
 * schéma n'est pas modifiable dans ce lot. Le brouillon retient donc son choix
 * dans la colonne `method` (une chaîne libre), sous la forme
 * `MODE@<id du compte>` : il survit ainsi jusqu'à la validation, faite par une
 * autre personne dans une autre session. Sans compte choisi, la colonne garde le
 * mode seul, comme avant (BUG-2026-09-29-002).
 *
 * À remplacer par une vraie colonne `treasuryAccountId` (avec clé étrangère) le
 * jour où une migration sera possible ; ces deux fonctions sont alors les seuls
 * points à toucher.
 */

const METHOD_ACCOUNT_SEPARATOR = '@';

export function packPaymentMethod(method: string, treasuryAccountId: string | null | undefined): string {
  return treasuryAccountId ? `${method}${METHOD_ACCOUNT_SEPARATOR}${treasuryAccountId}` : method;
}

/** Inverse de `packPaymentMethod` : le mode, et le compte choisi s'il y en a un. */
export function unpackPaymentMethod(stored: string): { method: string; treasuryAccountId: string | null } {
  const at = stored.indexOf(METHOD_ACCOUNT_SEPARATOR);
  if (at < 0) return { method: stored, treasuryAccountId: null };
  return { method: stored.slice(0, at), treasuryAccountId: stored.slice(at + 1) || null };
}
