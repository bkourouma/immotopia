/** Clés React Query de l'écran Finances copropriété (une famille par onglet). */
export const financeKeys = {
  summary: (tenantId: string, syndicId: string) => ['syndic-finances', tenantId, syndicId, 'summary'] as const,
  charges: (tenantId: string, syndicId: string, params: Record<string, string | number>) =>
    ['syndic-finances', tenantId, syndicId, 'charge-calls', params] as const,
  allCharges: (tenantId: string, syndicId: string) =>
    ['syndic-finances', tenantId, syndicId, 'all-charge-calls'] as const,
  payments: (tenantId: string, syndicId: string, params: object) =>
    ['syndic-finances', tenantId, syndicId, 'payments', params] as const,
  reminderCounts: (tenantId: string, syndicId: string) =>
    ['syndic-finances', tenantId, syndicId, 'reminder-counts'] as const,
  /** Tableau de bord des retards : partagé avec l'écran Recouvrement. */
  overdue: (tenantId: string, syndicId: string) => ['syndic-overdue', tenantId, syndicId] as const
};
