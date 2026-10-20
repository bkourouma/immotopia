import type { User } from '../types/auth-types';

/**
 * Droits de l'utilisateur dans une agence, lus sur `user.memberships` (réponse
 * de `GET /auth/me`). Indication d'interface seulement : le serveur reste la
 * seule autorité, et son 403 est rendu par `<DataView errorCause>`.
 *
 * Règles : le super-admin passe toujours ; sans utilisateur, sans
 * appartenance à `tenantId` ou avec une liste de permissions vide, rien n'est
 * accordé (une liste vide n'ouvre JAMAIS rien) ; une liste de clés exige
 * TOUTES les clés.
 */
export function userHasPermission(
  user: Pick<User, 'globalRole' | 'memberships'> | null | undefined,
  tenantId: string | null | undefined,
  permission: string | string[]
): boolean {
  if (!user) return false;
  if (user.globalRole === 'SUPER_ADMIN') return true;
  if (!tenantId) return false;
  const granted = user.memberships?.find(m => m.tenantId === tenantId)?.permissions;
  if (!granted || granted.length === 0) return false;
  const required = Array.isArray(permission) ? permission : [permission];
  return required.length > 0 && required.every(key => granted.includes(key));
}
