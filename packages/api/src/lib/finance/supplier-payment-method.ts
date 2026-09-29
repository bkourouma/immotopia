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

import { badRequest } from '../errors';

const METHOD_ACCOUNT_SEPARATOR = '@';

/** Modes de règlement acceptés (ceux que propose l'écran). */
export const SUPPLIER_PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CHECK', 'MOBILE_MONEY', 'CARD', 'OTHER'] as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Compose la valeur stockée. Le mode est validé (liste blanche, jamais de « @ ») :
 * une saisie libre malformée ne s'enregistre pas, elle brouillerait la relecture.
 */
export function packPaymentMethod(method: string, treasuryAccountId: string | null | undefined): string {
  if (!(SUPPLIER_PAYMENT_METHODS as readonly string[]).includes(method)) {
    throw badRequest('Mode de règlement invalide.');
  }
  return treasuryAccountId ? `${method}${METHOD_ACCOUNT_SEPARATOR}${treasuryAccountId}` : method;
}

/**
 * Inverse de `packPaymentMethod` : le mode, et le compte choisi s'il y en a un.
 * Tolérante : une valeur ancienne ou malformée ne lève jamais (la liste des
 * règlements d'un fournisseur doit rester lisible) ; un identifiant qui n'est
 * pas un UUID est ignoré.
 */
export function unpackPaymentMethod(stored: string): { method: string; treasuryAccountId: string | null } {
  const at = stored.indexOf(METHOD_ACCOUNT_SEPARATOR);
  if (at < 0) return { method: stored, treasuryAccountId: null };
  const candidate = stored.slice(at + 1);
  return {
    method: stored.slice(0, at),
    treasuryAccountId: UUID_PATTERN.test(candidate) ? candidate : null
  };
}
