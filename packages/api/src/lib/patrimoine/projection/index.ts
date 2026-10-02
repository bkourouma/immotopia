export {
  CENTRAL_ASSUMPTIONS,
  DEFAULT_ASSUMPTIONS,
  GROWTH_MAX,
  GROWTH_MIN,
  INFLATION_MAX,
  INFLATION_MIN,
  MAX_HORIZON_YEARS,
  MAX_OPERATIONS,
  OPTIMISTIC_ASSUMPTIONS,
  PROJECTION_SCENARIO_KEYS,
  PRUDENT_ASSUMPTIONS,
  resolveAssumptions
} from './assumptions';
export type {
  AssetClassKey,
  ProjectionAssumptions,
  ProjectionScenarioKey,
  ResolveAssumptionsResult,
  ResolvedAssumptions
} from './assumptions';

export {
  advanceLoan,
  amortizeMonth,
  levelPayment,
  monthsUntil,
  paymentTooLow,
  remainingAtMonth
} from './loan-schedule';
export type { AmortizationState, LoanRuntime, MonthResult, ScheduledLoan } from './loan-schedule';

export { projectNetWorth } from './project';
export type {
  ProjectionAssetInput,
  ProjectionInput,
  ProjectionLoanInput,
  ProjectionPoint,
  ProjectionResult,
  ProjectionWarning
} from './project';

export { ProjectionOperationError, applyOperations, simulateProjection } from './simulate';
export type { SimulationDelta, SimulationOperation, SimulationOptions, SimulationResult } from './simulate';

export {
  SCENARIO_KEYS,
  projectionAssumptionsSchema,
  projectionRequestSchema,
  scenarioBodySchema,
  scenarioUpdateSchema,
  simulationOperationSchema
} from './schemas';
export type { ProjectionRequestBody, ScenarioBody, ScenarioUpdateBody } from './schemas';
