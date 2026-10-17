import { entityKeyPrefix, queryKey } from '../../../lib/query-keys';

/** Clés de cache des écrans « Prélèvements » d'une copropriété (spec 042, P4). */
export const SYNDIC_DD_KEYS = {
  creditor: (tenantId: string, syndicId: string) => queryKey('syndic-direct-debit-creditor', tenantId, { syndicId }),
  creditorPrefix: (tenantId: string) => entityKeyPrefix('syndic-direct-debit-creditor', tenantId),
  lots: (tenantId: string, syndicId: string) => queryKey('syndic-direct-debit-lots', tenantId, { syndicId }),
  debtors: (tenantId: string, syndicId: string, lotId: string) =>
    queryKey('syndic-direct-debit-debtors', tenantId, { syndicId, lotId }),
  mandates: (tenantId: string, syndicId: string, filters: Record<string, unknown>) =>
    queryKey('syndic-direct-debit-mandates', tenantId, { syndicId, ...filters }),
  mandatesPrefix: (tenantId: string) => entityKeyPrefix('syndic-direct-debit-mandates', tenantId),
  remittances: (tenantId: string, syndicId: string, filters: Record<string, unknown>) =>
    queryKey('syndic-direct-debit-remittances', tenantId, { syndicId, ...filters }),
  remittancesPrefix: (tenantId: string) => entityKeyPrefix('syndic-direct-debit-remittances', tenantId)
};
