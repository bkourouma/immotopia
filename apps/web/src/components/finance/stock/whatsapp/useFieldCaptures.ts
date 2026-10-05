import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { queryKey } from '../../../../lib/query-keys';
import { listStockCountFieldCaptures } from '../../../../services/finance-stock-whatsapp-service';
import type { CountCaptureLine, CountFieldCaptures } from '../../../../types/finance-stock-whatsapp-types';
import { apiErrorOf } from './whatsapp-labels';

/** Entité de cache des captures d'un inventaire. */
export const STOCK_COUNT_FIELD_CAPTURES_ENTITY = 'stock-count-field-captures';

/**
 * Le visualiseur de preuve s'ouvre par `?capture=<captureId>` (ecrans §4),
 * sur l'écran Comptages terrain comme sur l'Inventaire. Ouvrir ou fermer ne
 * touche aucun autre paramètre de l'adresse.
 */
export function useCaptureDrawerParam(): {
  captureId: string | null;
  openCapture: (captureId: string) => void;
  closeCapture: () => void;
} {
  const [params, setParams] = useSearchParams();
  const captureId = params.get('capture');

  const openCapture = useCallback(
    (id: string) => {
      setParams(
        prev => {
          const next = new URLSearchParams(prev);
          next.set('capture', id);
          return next;
        },
        { replace: false }
      );
    },
    [setParams]
  );

  const closeCapture = useCallback(() => {
    setParams(
      prev => {
        const next = new URLSearchParams(prev);
        next.delete('capture');
        return next;
      },
      { replace: true }
    );
  }, [setParams]);

  return { captureId: captureId && captureId.trim() ? captureId : null, openCapture, closeCapture };
}

/**
 * Captures d'un inventaire (ecrans §6) : source et capture de chaque ligne,
 * jamais d'attendu. Une requête par détail, `staleTime` court. Un `403` ou un
 * `404` n'est pas une erreur pour l'écran : il reste celui du lot 040
 * (`data` vaut alors `null`, sans nouvel essai).
 */
export function useCountFieldCaptures(
  tenantId: string | undefined,
  countId: string | null | undefined
): {
  captures: CountFieldCaptures | null;
  lineByItemId: Map<string, CountCaptureLine>;
  isLoading: boolean;
} {
  const query = useQuery({
    queryKey: queryKey(STOCK_COUNT_FIELD_CAPTURES_ENTITY, tenantId, { countId: countId ?? undefined }),
    queryFn: async (): Promise<CountFieldCaptures | null> => {
      try {
        return await listStockCountFieldCaptures(tenantId as string, countId as string);
      } catch (error) {
        const { status } = apiErrorOf(error);
        if (status === 403 || status === 404) return null;
        throw error;
      }
    },
    enabled: Boolean(tenantId && countId),
    staleTime: 10_000,
    retry: false
  });

  const captures = query.data ?? null;
  const lineByItemId = useMemo(() => {
    const map = new Map<string, CountCaptureLine>();
    for (const line of captures?.lines ?? []) map.set(line.itemId, line);
    return map;
  }, [captures]);

  return { captures, lineByItemId, isLoading: query.isLoading };
}
