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
import { isUuid } from './load-input';
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

/** Références (actifs, dettes) d'opérations : `assetId`/`loanId` avec leur position dans la liste. */
interface OperationReference {
  index: number;
  field: 'assetId' | 'loanId';
  id: string;
}

const SYNTHETIC_LOAN = /^sim-loan-(\d+)$/;

function operationReferences(operations: SimulationOperation[]): OperationReference[] {
  return operations.flatMap((op, index): OperationReference[] => {
    if (op.type === 'SELL_ASSET') return [{ index, field: 'assetId', id: op.assetId }];
    if (op.type === 'PREPAY_LOAN') return [{ index, field: 'loanId', id: op.loanId }];
    return [];
  });
}

/** Identifiants d'actifs de l'agence parmi `ids` (UUID valides seulement) : une requête, `tenantId` posé. */
async function assetIdsOwned(tenantId: string, ids: string[]): Promise<Set<string>> {
  const valid = [...new Set(ids.filter(isUuid))];
  if (valid.length === 0) return new Set();
  const rows = await prisma.asset.findMany({ where: { tenantId, id: { in: valid } }, select: { id: true } });
  return new Set(rows.map(row => row.id));
}

/** Identifiants de dettes de l'agence parmi `ids` (UUID valides seulement). */
async function loanIdsOwned(tenantId: string, ids: string[]): Promise<Set<string>> {
  const valid = [...new Set(ids.filter(isUuid))];
  if (valid.length === 0) return new Set();
  const rows = await prisma.propertyLoan.findMany({ where: { tenantId, id: { in: valid } }, select: { id: true } });
  return new Set(rows.map(row => row.id));
}

/**
 * À l'enregistrement, chaque actif et chaque dette cités appartiennent à l'agence.
 * Un identifiant d'une autre agence donne la même erreur qu'un identifiant
 * inexistant. `sim-loan-<i>` (dette synthétique) est valide si l'opération `i`
 * de la même liste est un `TAKE_LOAN`.
 */
async function assertReferencesBelongToTenant(tenantId: string, operations: SimulationOperation[]): Promise<void> {
  const references = operationReferences(operations);
  if (references.length === 0) return;
  const [assets, loans] = await Promise.all([
    assetIdsOwned(
      tenantId,
      references.filter(ref => ref.field === 'assetId').map(ref => ref.id)
    ),
    loanIdsOwned(
      tenantId,
      references.filter(ref => ref.field === 'loanId').map(ref => ref.id)
    )
  ]);
  const errors = references.flatMap(ref => {
    if (ref.field === 'assetId') return assets.has(ref.id) ? [] : [{ ref, message: 'Actif introuvable' }];
    const synthetic = SYNTHETIC_LOAN.exec(ref.id);
    if (synthetic && operations[Number(synthetic[1])]?.type === 'TAKE_LOAN') return [];
    return loans.has(ref.id) ? [] : [{ ref, message: 'Dette introuvable' }];
  });
  if (errors.length > 0) {
    throw new ValidationError(
      'Les opérations de la simulation sont invalides.',
      errors.map(({ ref, message }) => ({ field: `operations.${ref.index}.${ref.field}`, message }))
    );
  }
}

/**
 * Plafond vérifié sous verrou consultatif (par agence) : sans lui, des créations
 * concurrentes lisent toutes le même `count` et dépassent le plafond.
 */
async function createRowUnderCap(tenantId: string, data: Prisma.PatrimonyScenarioUncheckedCreateInput) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`;
    const count = await tx.patrimonyScenario.count({ where: { tenantId } });
    if (count >= MAX_SCENARIOS_PER_TENANT) {
      throw new ConflictError(
        `Limite atteinte : une agence ne peut pas enregistrer plus de ${MAX_SCENARIOS_PER_TENANT} scénarios. ` +
          'Supprimez des scénarios avant d’en créer un nouveau.'
      );
    }
    return tx.patrimonyScenario.create({ data, select: SCENARIO_SELECT });
  });
}

export async function createScenario(
  tenantId: string,
  input: ScenarioBody,
  actorUserId?: string
): Promise<ScenarioDto> {
  await assertReferencesBelongToTenant(tenantId, input.operations ?? []);
  let row: ScenarioRow;
  try {
    row = await createRowUnderCap(tenantId, {
      tenantId,
      name: input.name,
      horizonYears: input.horizonYears,
      baseScenario: input.baseScenario,
      assumptions: (input.assumptions ?? {}) as Prisma.InputJsonValue,
      operations: (input.operations ?? []) as Prisma.InputJsonValue,
      createdByUserId: actorUserId ?? null
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

function yearIssues(error: z.ZodError): { field: string; message: string }[] {
  return error.errors.map(issue => ({ field: issue.path.join('.'), message: issue.message }));
}

/**
 * Années et horizon doivent rester cohérents après la modification : un nouvel
 * horizon sans nouvelles opérations est confronté aux opérations enregistrées ;
 * de nouvelles opérations sans horizon sont confrontées à l'horizon ENREGISTRÉ.
 * (Si les deux sont fournis, le schéma du corps les a déjà croisés.)
 */
function assertYearsFitHorizon(row: ScenarioRow, input: ScenarioUpdateBody): void {
  const horizonGiven = input.horizonYears !== undefined;
  const operationsGiven = input.operations !== undefined;
  if (horizonGiven === operationsGiven) return;
  const parsed = projectionRequestSchema.safeParse({
    horizonYears: input.horizonYears ?? row.horizonYears,
    baseScenario: row.baseScenario,
    operations: input.operations ?? readOperations(row.operations)
  });
  if (parsed.success) return;
  throw new ValidationError(
    horizonGiven
      ? 'Les opérations enregistrées dépassent le nouvel horizon.'
      : "Les opérations dépassent l'horizon enregistré du scénario.",
    yearIssues(parsed.error)
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
  assertYearsFitHorizon(existing, input);
  if (input.operations !== undefined) await assertReferencesBelongToTenant(tenantId, input.operations);
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
