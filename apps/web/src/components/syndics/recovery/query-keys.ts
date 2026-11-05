/** Clés React Query de l'écran Recouvrement (le tableau de bord des retards vient de `financeKeys.overdue`). */
export const recoveryKeys = {
  reminders: (tenantId: string, syndicId: string) => ['syndic-recovery', tenantId, syndicId, 'reminders'] as const,
  penalties: (tenantId: string, syndicId: string) => ['syndic-recovery', tenantId, syndicId, 'penalties'] as const,
  schedules: (tenantId: string, syndicId: string) => ['syndic-recovery', tenantId, syndicId, 'schedules'] as const
};
