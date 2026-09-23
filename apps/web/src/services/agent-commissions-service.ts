import apiClient from '../utils/api-client';

/**
 * Frontière réseau de l'état des commissions des agents — lot 2 de la gestion
 * locative.
 *
 * Contrat : `lot2-contrat-api.md` (scratchpad de l'atelier), section 5.
 * L'API n'est pas encore disponible : ce service est le point d'insertion des
 * mocks du test (`__tests__/finance/agent-commissions.test.tsx`), qui déclare
 * un `vi.mock` sur ce module plutôt que sur `apiClient` lui-même.
 */

type ApiResponse<T> = { success: boolean; data: T };

/** Un encaissement à l'origine d'honoraires, pour le détail déplié d'un agent. */
export interface AgentCommissionDetailLine {
  id: string;
  /** Date de l'encaissement — c'est elle qui fige le taux appliqué, pas la saisie. */
  collectedAt: string;
  leaseId: string;
  leaseNumber: string;
  propertyTitle: string;
  collectedAmount: number;
  feeAmount: number;
  /** Part de l'agent sur ces honoraires, déjà calculée. */
  shareAmount: number;
}

/** Les honoraires d'un agent sur la période, et leur détail. */
export interface AgentCommissionLine {
  /** `null` : honoraires générés par des baux sans gestionnaire désigné. */
  agentUserId: string | null;
  /** « Sans gestionnaire » quand `agentUserId` est `null`. */
  agentName: string;
  /** Part actuelle du collaborateur, pour information : elle peut avoir changé depuis le calcul des lignes. */
  sharePercent: number | null;
  feeCount: number;
  feesAmount: number;
  shareAmount: number;
  lines: AgentCommissionDetailLine[];
}

export interface AgentCommissionsTotals {
  feesAmount: number;
  vatAmount: number;
  shareAmount: number;
  unassignedFeesAmount: number;
}

export interface AgentCommissionsReport {
  period: string;
  totals: AgentCommissionsTotals;
  agents: AgentCommissionLine[];
}

/**
 * État des commissions des agents pour une période `YYYY-MM`.
 *
 * Les honoraires sont figés à l'encaissement (contrat, section 5) : ce que
 * cet appel renvoie pour un mois passé ne bouge plus, même si un taux ou une
 * part change ensuite.
 */
export async function getAgentCommissions(tenantId: string, period: string): Promise<AgentCommissionsReport> {
  const response = await apiClient.get<ApiResponse<AgentCommissionsReport>>(
    `/tenants/${tenantId}/finance/agent-commissions?period=${encodeURIComponent(period)}`
  );
  return response.data.data;
}
