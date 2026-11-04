import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getAccountingMeta } from '../../../../services/accounting-exports-service';
import { STALE_TIME } from '../../../../lib/query-keys';
import { accountingQueryKey } from './accounting-query';

/** Journaux, années et bornes de dates disponibles : un référentiel, relu rarement. */
export function useAccountingMeta(tenantId: string | undefined) {
  return useQuery({
    queryKey: accountingQueryKey('meta', tenantId),
    queryFn: () => getAccountingMeta(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference,
    placeholderData: keepPreviousData
  });
}
