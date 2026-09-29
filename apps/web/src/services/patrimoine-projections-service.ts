import apiClient from '../utils/api-client';
import type { AssetClass } from './patrimoine-assets-service';

/**
 * Service des projections et simulations du patrimoine (lot 3) — une fonction
 * par route de `specs/025-patrimoine-projections-simulations/contracts/api.md`,
 * sous `/tenants/:tenantId/patrimoine`. Réseau uniquement via `utils/api-client`.
 * Aucune de ces routes n'écrit sur les données réelles, sauf les scénarios
 * enregistrés (création, mise à jour, suppression).
 */

export type ProjectionScenarioKey = 'PRUDENT' | 'CENTRAL' | 'OPTIMISTIC';

export interface ProjectionAssumptions {
  /** Croissance annuelle nominale en % (−50..100), par classe. */
  growthPercentByClass: Partial<Record<AssetClass, number>>;
  /** Inflation annuelle en % (0..100). */
  inflationPercent: number;
}

export type SimulationOperation =
  | { type: 'SELL_ASSET'; year: number; assetId: string; salePrice?: number; feesPercent?: number }
  | { type: 'BUY_ASSET'; year: number; assetClass: AssetClass; name: string; price: number; growthPercent?: number }
  | { type: 'TAKE_LOAN'; year: number; amount: number; annualRatePercent: number; termYears: number }
  | { type: 'PREPAY_LOAN'; year: number; loanId: string; amount: number }
  | { type: 'MONTHLY_SAVING'; fromYear: number; toYear?: number; amount: number };

export interface ProjectionPoint {
  year: number;
  assets: number;
  debts: number;
  netWorth: number;
  /** Valeur nette en pouvoir d'achat d'aujourd'hui. */
  realNetWorth: number;
  byClass: { assetClass: AssetClass; value: number }[];
}

export type ProjectionWarning =
  | { code: 'ASSET_WITHOUT_VALUE'; assetId: string }
  | { code: 'LOAN_PAYMENT_TOO_LOW'; loanId: string }
  | { code: 'LOAN_MATURED_WITH_BALANCE'; loanId?: string }
  | { code: 'NEGATIVE_CASH'; year: number }
  | { code: 'LOW_RELIABILITY_START'; sharePercent: number }
  | {
      code: 'OPERATION_NOT_APPLICABLE';
      index: number;
      reason: 'ASSET_NOT_FOUND' | 'ASSET_NOT_ACTIVE' | 'LOAN_NOT_FOUND';
    };

export interface ProjectionResult {
  points: ProjectionPoint[];
  warnings: ProjectionWarning[];
}

export interface ProjectionResponse {
  assumptionsUsed: ProjectionAssumptions;
  base: ProjectionResult;
  simulated?: ProjectionResult;
  delta?: { year: number; netWorth: number }[];
  byScenario?: Record<ProjectionScenarioKey, ProjectionResult>;
}

export interface ProjectionRequest {
  horizonYears: number;
  baseScenario: ProjectionScenarioKey;
  assumptions?: Partial<ProjectionAssumptions>;
  operations?: SimulationOperation[];
  compareScenarios?: boolean;
}

export interface ScenarioDto {
  id: string;
  name: string;
  horizonYears: number;
  baseScenario: ProjectionScenarioKey;
  assumptions: Partial<ProjectionAssumptions>;
  operations: SimulationOperation[];
  createdAt: string;
  updatedAt: string;
}

/** Réglages d'un scénario (tout sauf son nom). */
export interface ScenarioSettings {
  horizonYears: number;
  baseScenario: ProjectionScenarioKey;
  assumptions?: Partial<ProjectionAssumptions>;
  operations?: SimulationOperation[];
}

/** Corps de création d'un scénario ; la mise à jour accepte les mêmes champs, facultatifs. */
export interface ScenarioInput extends ScenarioSettings {
  name: string;
}

type Envelope<T> = { data: T };

function base(tenantId: string): string {
  return `/tenants/${tenantId}/patrimoine`;
}

export async function runProjection(tenantId: string, body: ProjectionRequest): Promise<ProjectionResponse> {
  const response = await apiClient.post<Envelope<ProjectionResponse>>(`${base(tenantId)}/projections`, body);
  return response.data.data;
}

export async function listScenarios(tenantId: string): Promise<ScenarioDto[]> {
  const response = await apiClient.get<Envelope<ScenarioDto[]>>(`${base(tenantId)}/scenarios`);
  return response.data.data;
}

export async function createScenario(tenantId: string, payload: ScenarioInput): Promise<ScenarioDto> {
  const response = await apiClient.post<Envelope<ScenarioDto>>(`${base(tenantId)}/scenarios`, payload);
  return response.data.data;
}

export async function getScenario(tenantId: string, scenarioId: string): Promise<ScenarioDto> {
  const response = await apiClient.get<Envelope<ScenarioDto>>(`${base(tenantId)}/scenarios/${scenarioId}`);
  return response.data.data;
}

export async function updateScenario(
  tenantId: string,
  scenarioId: string,
  payload: Partial<ScenarioInput>
): Promise<ScenarioDto> {
  const response = await apiClient.patch<Envelope<ScenarioDto>>(`${base(tenantId)}/scenarios/${scenarioId}`, payload);
  return response.data.data;
}

export async function deleteScenario(tenantId: string, scenarioId: string): Promise<void> {
  await apiClient.delete(`${base(tenantId)}/scenarios/${scenarioId}`);
}

export async function runScenario(
  tenantId: string,
  scenarioId: string,
  options?: { compareScenarios?: boolean }
): Promise<ProjectionResponse> {
  const response = await apiClient.post<Envelope<ProjectionResponse>>(
    `${base(tenantId)}/scenarios/${scenarioId}/run`,
    options?.compareScenarios ? { compareScenarios: true } : {}
  );
  return response.data.data;
}
