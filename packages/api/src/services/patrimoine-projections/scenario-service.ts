import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../utils/database';
import { BadRequestError, ConflictError, NotFoundError, ValidationError } from '../../middleware/error-middleware';
import {
  MAX_OPERATIONS,
  projectionAssumptionsSchema,
  projectionRequestSchema,
  simulationOperationSchema
} from '../../lib/patrimoine/projection';
import type {
  ProjectionAssumptions,
  ProjectionScenarioKey,
  ScenarioBody,
  ScenarioUpdateBody,
  SimulationOperation
} from '../../lib/patrimoine/projection';
import { PATRIMOINE_SCENARIO_AUDIT as AUDIT, auditScenario, changedFields } from './audit';
import { computeProjection } from './projection-service';
import type { ProjectionResponse } from './projection-service';

/**
 * Scénarios de projection enregistrés (lot 3, spec 025). TOUT `where` porte
 * `tenantId`, y compris `update` et `delete` ; le DTO n'expose ni
 * `schemaVersion` ni `createdByUserId` ; aucun résultat de calcul n'est stocké.
 * Un scénario n'est validé qu'en forme à l'écriture ; ses références (actifs,
 * dettes) sont revérifiées à l'exécution.
 */

/** Plafond de scénarios enregistrés par agence (déni de service). */
export const MAX_SCENARIOS_PER_TENANT = 100;

const NOT_FOUND_SCENARIO = 'Scénario introuvable.';
const DUPLICATE_NAME = 'Un scénario porte déjà ce nom.';

const SCENARIO_SELECT = {
  id: true,
  name: true,
  horizonYears: true,
  baseScenario: true,
  assumptions: true,
  operations: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.PatrimonyScenarioSelect;

type ScenarioRow = Prisma.PatrimonyScenarioGetPayload<{ select: typeof SCENARIO_SELECT }>;

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

// ---------------------------------------------------------------- Lecture tolérante du JSON stocké

const operationsListSchema = z.array(simulationOperationSchema).max(MAX_OPERATIONS);

/** Hypothèses lisibles ; un JSON corrompu en base donne `{}` plutôt qu'une erreur. */
function readAssumptions(raw: unknown): Partial<ProjectionAssumptions> {
  const parsed = projectionAssumptionsSchema.safeParse(raw);
  return parsed.success ? (parsed.data as Partial<ProjectionAssumptions>) : {};
}

/** Opérations lisibles, une à une ; les éléments illisibles sont écartés. */
function readOperations(raw: unknown): SimulationOperation[] {
  if (!Array.isArray(raw)) return [];
  const whole = operationsListSchema.safeParse(raw);
  if (whole.success) return whole.data as SimulationOperation[];
  return raw.slice(0, MAX_OPERATIONS).flatMap(item => {
    const parsed = simulationOperationSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  }) as SimulationOperation[];
}

function toDto(row: ScenarioRow): ScenarioDto {
  return {
    id: row.id,
    name: row.name,
    horizonYears: row.horizonYears,
    baseScenario: row.baseScenario,
    assumptions: readAssumptions(row.assumptions),
    operations: readOperations(row.operations),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function isPrismaCode(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

async function findScenarioOrThrow(tenantId: string, scenarioId: string): Promise<ScenarioRow> {
  const row = await prisma.patrimonyScenario.findFirst({
    where: { id: scenarioId, tenantId },
    select: SCENARIO_SELECT
  });
  if (!row) throw new NotFoundError(NOT_FOUND_SCENARIO);
  return row;
}

/** Erreur 422 explicite pour un scénario enregistré devenu illisible ou incohérent. */
function invalidScenario(issues: z.ZodIssue[]): ValidationError {
  const errors = issues.map(issue => ({
    field: issue.path.length > 0 ? issue.path.join('.') : 'scenario',
    message: issue.message
  }));
  return new ValidationError('Le scénario enregistré est invalide : corrigez-le ou recréez-le.', errors);
}

// ---------------------------------------------------------------- Lecture

export async function listScenarios(tenantId: string): Promise<ScenarioDto[]> {
  const rows = await prisma.patrimonyScenario.findMany({
    where: { tenantId },
    select: SCENARIO_SELECT,
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    take: MAX_SCENARIOS_PER_TENANT
  });
  return rows.map(toDto);
}

export async function getScenario(tenantId: string, scenarioId: string): Promise<ScenarioDto> {
  return toDto(await findScenarioOrThrow(tenantId, scenarioId));
}

// ---------------------------------------------------------------- Écriture

export async function createScenario(
  tenantId: string,
  input: ScenarioBody,
  actorUserId?: string
): Promise<ScenarioDto> {
  const count = await prisma.patrimonyScenario.count({ where: { tenantId } });
  if (count >= MAX_SCENARIOS_PER_TENANT) {
    throw new ConflictError(
      `Limite atteinte : une agence ne peut pas enregistrer plus de ${MAX_SCENARIOS_PER_TENANT} scénarios. ` +
        'Supprimez des scénarios avant d’en créer un nouveau.'
    );
  }
  let row: ScenarioRow;
  try {
    row = await prisma.patrimonyScenario.create({
      data: {
        tenantId,
        name: input.name,
        horizonYears: input.horizonYears,
        baseScenario: input.baseScenario,
        assumptions: (input.assumptions ?? {}) as Prisma.InputJsonValue,
        operations: (input.operations ?? []) as Prisma.InputJsonValue,
        createdByUserId: actorUserId ?? null
      },
      select: SCENARIO_SELECT
    });
  } catch (error) {
    if (isPrismaCode(error, 'P2002')) throw new ConflictError(DUPLICATE_NAME);
    throw error;
  }
  auditScenario({
    tenantId,
    actorUserId,
    action: AUDIT.SCENARIO_CREATED,
    scenarioId: row.id,
    payload: { baseScenario: row.baseScenario }
  });
  return toDto(row);
}

/**
 * Un nouvel horizon sans nouvelles opérations doit rester compatible avec les
 * années des opérations déjà enregistrées.
 */
function assertHorizonFitsStoredOperations(row: ScenarioRow, input: ScenarioUpdateBody): void {
  if (input.horizonYears === undefined || input.operations !== undefined) return;
  const parsed = projectionRequestSchema.safeParse({
    horizonYears: input.horizonYears,
    baseScenario: row.baseScenario,
    operations: readOperations(row.operations)
  });
  if (!parsed.success)
    throw new ValidationError(
      'Les opérations enregistrées dépassent le nouvel horizon.',
      parsed.error.errors.map(issue => ({ field: issue.path.join('.'), message: issue.message }))
    );
}

export async function updateScenario(
  tenantId: string,
  scenarioId: string,
  input: ScenarioUpdateBody,
  actorUserId?: string
): Promise<ScenarioDto> {
  const fields = changedFields(input);
  if (fields.length === 0) throw new BadRequestError('Aucun champ à modifier.');
  const existing = await findScenarioOrThrow(tenantId, scenarioId);
  assertHorizonFitsStoredOperations(existing, input);
  let row: ScenarioRow;
  try {
    row = await prisma.patrimonyScenario.update({
      where: { id: scenarioId, tenantId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.horizonYears !== undefined ? { horizonYears: input.horizonYears } : {}),
        ...(input.baseScenario !== undefined ? { baseScenario: input.baseScenario } : {}),
        ...(input.assumptions !== undefined ? { assumptions: input.assumptions as Prisma.InputJsonValue } : {}),
        ...(input.operations !== undefined ? { operations: input.operations as Prisma.InputJsonValue } : {})
      },
      select: SCENARIO_SELECT
    });
  } catch (error) {
    if (isPrismaCode(error, 'P2002')) throw new ConflictError(DUPLICATE_NAME);
    if (isPrismaCode(error, 'P2025')) throw new NotFoundError(NOT_FOUND_SCENARIO);
    throw error;
  }
  auditScenario({
    tenantId,
    actorUserId,
    action: AUDIT.SCENARIO_UPDATED,
    scenarioId,
    payload: { changedFields: fields }
  });
  return toDto(row);
}

export async function deleteScenario(tenantId: string, scenarioId: string, actorUserId?: string): Promise<void> {
  await findScenarioOrThrow(tenantId, scenarioId);
  try {
    await prisma.patrimonyScenario.delete({ where: { id: scenarioId, tenantId } });
  } catch (error) {
    if (isPrismaCode(error, 'P2025')) throw new NotFoundError(NOT_FOUND_SCENARIO);
    throw error;
  }
  auditScenario({ tenantId, actorUserId, action: AUDIT.SCENARIO_DELETED, scenarioId });
}

// ---------------------------------------------------------------- Exécution

/** Recharge le patrimoine actuel ; une référence disparue devient `OPERATION_NOT_APPLICABLE`. */
export async function runScenario(
  tenantId: string,
  scenarioId: string,
  options: { compareScenarios?: boolean } = {}
): Promise<ProjectionResponse> {
  const row = await findScenarioOrThrow(tenantId, scenarioId);
  const parsed = projectionRequestSchema.safeParse({
    horizonYears: row.horizonYears,
    baseScenario: row.baseScenario,
    assumptions: row.assumptions,
    operations: row.operations,
    compareScenarios: options.compareScenarios
  });
  if (!parsed.success) throw invalidScenario(parsed.error.errors);
  return computeProjection(tenantId, parsed.data, { lenientReferences: true });
}
