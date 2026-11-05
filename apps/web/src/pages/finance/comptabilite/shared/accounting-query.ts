import dayjs from 'dayjs';
import { queryKey } from '../../../../lib/query-keys';
import { dateFormat } from '../../../../i18n/format';

/**
 * Clés de requête et utilitaires communs aux sous-pages de la comptabilité de
 * l'agence (`pages/finance/comptabilite/`).
 *
 * Toute requête comptable passe par `accountingQueryKey` : le préfixe commun
 * permet de toutes les relire d'un coup (bandeau de synchronisation, bouton
 * « Actualiser les écritures ») sans énumérer les combinaisons de filtres.
 */

/** Préfixe de l'entité de toutes les requêtes comptables (`accounting:<nom>`). */
export const ACCOUNTING_QUERY_PREFIX = 'accounting';

/** Taille de page des tableaux comptables (plafond du journal côté API : 100). */
export const ACCOUNTING_PAGE_SIZE = 50;

/** `accountingQueryKey('journal', tenantId, { from, to, page })` → `['accounting:journal', tenantId, {...}]`. */
export function accountingQueryKey(
  name: string,
  tenantId: string | null | undefined,
  params?: Record<string, unknown>
): readonly unknown[] {
  return queryKey(`${ACCOUNTING_QUERY_PREFIX}:${name}`, tenantId, params);
}

/** Vrai pour une clé de requête comptable de cette agence. */
export function isAccountingQuery(key: readonly unknown[], tenantId: string | null | undefined): boolean {
  const entity = key[0];
  return (
    typeof entity === 'string' && entity.startsWith(`${ACCOUNTING_QUERY_PREFIX}:`) && key[1] === (tenantId ?? null)
  );
}

/** Date ISO (`YYYY-MM-DD`) au format court de la langue affichée. */
export function dateCourte(iso: string): string {
  return dayjs(iso).format(dateFormat('short'));
}
