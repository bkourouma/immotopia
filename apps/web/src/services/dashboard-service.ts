import apiClient from '../utils/api-client';

/**
 * Agrégats du tableau de bord d'accueil.
 *
 * Miroir exact de `packages/api/src/services/dashboard-service.ts`. Deux
 * conventions structurent ce contrat, et l'écran s'y appuie partout :
 *
 * - **Une section `null` = module hors de portée**, pas « aucune donnée ».
 *   L'écran rend alors un tiret ; un zéro mentirait.
 * - **Chaque point de donnée porte son `href`.** Le front ne recompose aucune
 *   URL : une tranche de camembert, une barre ou une ligne de la file de
 *   travail sait où elle mène.
 */

export interface DashboardBucket {
  /** Code de l'énumération métier. Le libellé français est posé à l'affichage. */
  key: string;
  count: number;
  amount?: number;
  href?: string;
}

export interface DashboardSeriesPoint {
  month: string;
  encaisse: number;
  attendu: number;
}

export type DashboardTaskKind = 'OVERDUE_INSTALLMENT' | 'PENDING_DECLARATION' | 'URGENT_TICKET';

export interface DashboardTask {
  id: string;
  kind: DashboardTaskKind;
  title: string;
  description: string;
  amount: number | null;
  currency: string | null;
  occurredAt: string;
  severity: 'danger' | 'warning' | 'info';
  href: string;
}

export type DashboardActivityType = 'PROPERTY_CREATED' | 'CONTACT_CREATED' | 'PAYMENT_SUCCEEDED';

export interface DashboardActivity {
  id: string;
  type: DashboardActivityType;
  title: string;
  description: string;
  occurredAt: string;
  href?: string;
}

export interface TenantDashboard {
  properties: {
    total: number;
    published: number;
    occupancyRate: number | null;
    byStatus: DashboardBucket[];
    byType: DashboardBucket[];
  } | null;
  clients: { total: number; byStatus: DashboardBucket[] } | null;
  monthlyRevenue: {
    amount: number;
    previousAmount: number;
    expected: number;
    currency: string;
    periodStart: string;
    periodEnd: string;
  } | null;
  transactions: { total: number; deals: number | null; leases: number | null } | null;
  revenueSeries: DashboardSeriesPoint[] | null;
  rental: {
    activeLeases: number | null;
    leasesByStatus: DashboardBucket[] | null;
    installmentsByStatus: DashboardBucket[] | null;
    paymentsByMethod: DashboardBucket[] | null;
    overdue: { count: number; amount: number } | null;
    dueThisWeek: { count: number; amount: number } | null;
    pendingDeclarations: number | null;
  } | null;
  pipeline: DashboardBucket[] | null;
  maintenance: { open: number; byStatus: DashboardBucket[]; byPriority: DashboardBucket[] } | null;
  syndic: {
    syndicates: number;
    lots: number;
    chargeCallsByStatus: DashboardBucket[];
    recoveryRate: number | null;
  } | null;
  patrimoine: { workProgramsByStatus: DashboardBucket[]; plannedCost: number } | null;
  workQueue: DashboardTask[];
  recentActivity: DashboardActivity[];
}

export interface TenantDashboardResponse {
  success: boolean;
  data: TenantDashboard;
}

export async function getTenantDashboard(tenantId: string): Promise<TenantDashboardResponse> {
  const response = await apiClient.get(`/tenants/${tenantId}/dashboard`);
  return response.data;
}
