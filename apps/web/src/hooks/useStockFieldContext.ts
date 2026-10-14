import { useQuery } from '@tanstack/react-query';
import { queryKey, STALE_TIME } from '../lib/query-keys';
import { getStockFieldContext } from '../services/finance-stock-controle-service';

/** Entité de cache du contexte terrain : à invalider après les écritures qui le changent. */
export const STOCK_FIELD_CONTEXT_ENTITY = 'stock-field-context';

/**
 * Le contexte terrain du stock, chargé UNE fois et partagé par tous les écrans
 * du stock (ecrans §3.3) : lieux, chantiers, postes, articles, preneurs,
 * factures réceptionnables, motifs, réglages utiles et droits de l'appelant
 * (`abilities`). Il remplace les lectures qui exigeaient un droit financier
 * que le magasinier n'a pas.
 *
 * À invalider (préfixe `entityKeyPrefix(STOCK_FIELD_CONTEXT_ENTITY, tenantId)`)
 * après : création ou correction d'un preneur, réception, ouverture, clôture,
 * validation ou abandon d'un inventaire.
 *
 * Rend `{ data, meta }` dans `query.data` ; un `403` reste dans `query.error`
 * pour que l'écran affiche l'état « refus » (`FORBIDDEN`) ou
 * `<ModuleNotIncluded>` (`MODULE_NOT_INCLUDED`).
 */
export function useStockFieldContext(tenantId: string | undefined) {
  return useQuery({
    queryKey: queryKey(STOCK_FIELD_CONTEXT_ENTITY, tenantId),
    queryFn: () => getStockFieldContext(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });
}
