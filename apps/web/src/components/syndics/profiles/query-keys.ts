/** Clés React Query de l'écran « Profils lot et incidents » (une famille par onglet, plus les référentiels). */
export const profileKeys = {
  owners: (tenantId: string, syndicId: string) => ['syndic-profiles', tenantId, syndicId, 'owners'] as const,
  tenants: (tenantId: string, syndicId: string) => ['syndic-profiles', tenantId, syndicId, 'tenants'] as const,
  incidents: (tenantId: string, syndicId: string) => ['syndic-profiles', tenantId, syndicId, 'incidents'] as const,
  /** Référentiels des libellés de lot (lots et biens) : chargés une fois pour tous les onglets. */
  lots: (tenantId: string, syndicId: string) => ['syndic-profiles', tenantId, syndicId, 'lots'] as const,
  properties: (tenantId: string) => ['syndic-profiles', tenantId, 'properties'] as const,
  providers: (tenantId: string, syndicId: string) => ['syndic-profiles', tenantId, syndicId, 'providers'] as const
};
