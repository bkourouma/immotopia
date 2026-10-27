import { useMyMenuAccess } from '../../../hooks/useMenuAccess';

/** Permissions du prélèvement des charges (spec 042, P4, §9.1). */
export const SYNDIC_DIRECT_DEBIT_VIEW = 'SYNDIC_DIRECT_DEBIT_VIEW';
export const SYNDIC_DIRECT_DEBIT_MANAGE = 'SYNDIC_DIRECT_DEBIT_MANAGE';

/**
 * Droits de la personne sur les prélèvements de copropriété. `permissions`
 * nul (administrateur d'agence, super-admin, échec de lecture) : pas de
 * filtrage. Tant que les droits ne sont pas lus, rien d'écrit n'est proposé ;
 * l'API reste juge dans tous les cas.
 */
export function useSyndicDirectDebitRights(tenantId: string | null | undefined): {
  ready: boolean;
  canView: boolean;
  canManage: boolean;
} {
  const { permissions, ready } = useMyMenuAccess(tenantId);
  const has = (key: string) => permissions === null || permissions.has(key);
  const canManage = ready && has(SYNDIC_DIRECT_DEBIT_MANAGE);
  return { ready, canManage, canView: ready && (canManage || has(SYNDIC_DIRECT_DEBIT_VIEW)) };
}
