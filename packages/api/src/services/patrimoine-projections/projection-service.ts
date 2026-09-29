import { ValidationError } from '../../middleware/error-middleware';
import {
  PROJECTION_SCENARIO_KEYS,
  ProjectionOperationError,
  projectNetWorth,
  resolveAssumptions,
  simulateProjection
} from '../../lib/patrimoine/projection';
import type {
  ProjectionAssumptions,
  ProjectionRequestBody,
  ProjectionResult,
  ProjectionScenarioKey,
  ResolvedAssumptions,
  SimulationDelta,
  SimulationOperation
} from '../../lib/patrimoine/projection';
import { loadProjectionInput } from './load-input';

/**
 * Projection et simulation (lot 3, spec 025). AUCUNE écriture, aucun audit :
 * le patrimoine est lu, copié en mémoire par le domaine et jamais modifié.
 * Contrat : `specs/025-patrimoine-projections-simulations/contracts/api.md`.
 */

export interface ProjectionRequest {
  horizonYears: number;
  baseScenario: ProjectionScenarioKey;
  assumptions?: Partial<ProjectionAssumptions>;
  operations?: SimulationOperation[];
  compareScenarios?: boolean;
}

export interface ProjectionResponse {
  assumptionsUsed: ResolvedAssumptions;
  base: ProjectionResult;
  simulated?: ProjectionResult;
  delta?: SimulationDelta[];
  byScenario?: Record<ProjectionScenarioKey, ProjectionResult>;
}

export interface ProjectionOptions {
  /** Vrai (exécution d'un scénario enregistré) : une référence disparue devient un avertissement. */
  lenientReferences?: boolean;
}

/** `operations.<index>.<champ>` ; une erreur qui vise la liste entière garde le champ `operations`. */
function operationField(error: ProjectionOperationError): string {
  return error.field === 'operations' ? 'operations' : `operations.${error.index}.${error.field}`;
}

function toValidationError(error: ProjectionOperationError): ValidationError {
  return new ValidationError('Les opérations de la simulation sont invalides.', [
    { field: operationField(error), message: error.message }
  ]);
}

function assetIdsOf(operations: SimulationOperation[]): Set<string> {
  return new Set(operations.flatMap(op => (op.type === 'SELL_ASSET' ? [op.assetId] : [])));
}

function withStartWarning(result: ProjectionResult, sharePercent: number): ProjectionResult {
  if (sharePercent > 0) result.warnings.push({ code: 'LOW_RELIABILITY_START', sharePercent });
  return result;
}

export async function computeProjection(
  tenantId: string,
  request: ProjectionRequest,
  options: ProjectionOptions = {}
): Promise<ProjectionResponse> {
  const operations = request.operations ?? [];
  const { input, lowReliabilityShare } = await loadProjectionInput(tenantId, assetIdsOf(operations));
  const { assumptions } = resolveAssumptions(request.baseScenario, request.assumptions);
  const { horizonYears } = request;

  const response: ProjectionResponse = {
    assumptionsUsed: assumptions,
    base: projectNetWorth(input, assumptions, horizonYears)
  };
  if (operations.length > 0) {
    try {
      const simulation = simulateProjection(input, assumptions, horizonYears, operations, {
        lenientReferences: options.lenientReferences === true
      });
      response.simulated = withStartWarning(simulation.simulated, lowReliabilityShare);
      response.delta = simulation.delta;
    } catch (error) {
      if (error instanceof ProjectionOperationError) throw toValidationError(error);
      throw error;
    }
  }
  if (request.compareScenarios === true) {
    const byScenario = {} as Record<ProjectionScenarioKey, ProjectionResult>;
    for (const key of PROJECTION_SCENARIO_KEYS) {
      const resolved = resolveAssumptions(key, request.assumptions).assumptions;
      byScenario[key] = withStartWarning(projectNetWorth(input, resolved, horizonYears), lowReliabilityShare);
    }
    response.byScenario = byScenario;
  }
  withStartWarning(response.base, lowReliabilityShare);
  return response;
}

/** Corps validé par `projectionRequestSchema` (`.strict()`). */
export function runProjection(tenantId: string, body: ProjectionRequestBody): Promise<ProjectionResponse> {
  return computeProjection(tenantId, body);
}
