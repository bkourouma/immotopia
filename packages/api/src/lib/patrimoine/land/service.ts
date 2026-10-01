import { Prisma } from '@prisma/client';
import { prisma, type PrismaTransactionClient } from '../../../utils/database';
import { getPropertyForTenant } from '../../../utils/property-tenant-guard';
import { assertBelongsToTenant } from '../../../utils/tenant-ownership';
import { BadRequestError, ConflictError, NotFoundError } from '../../../middleware/error-middleware';
import { logAuditEvent } from '../../../services/audit-service';
import { AuditActionKey } from '../../../types/audit-types';
import {
  REGULARIZATION_INCLUDE,
  toDetailDto,
  toSummaryDto,
  type LandRegularizationDetailDto,
  type LandRegularizationSummaryDto,
  type RegularizationRow
} from './dto';
import { MAX_CUSTOM_STEPS } from './schemas';
import type {
  AddLandStepInput,
  ChangeLandRegularizationStatusInput,
  ChangeLandStepStatusInput,
  CreateLandRegularizationInput,
  ListLandRegularizationsQuery,
  UpdateLandRegularizationInput,
  UpdateLandStepInput
} from './schemas';
import { t } from '../../../i18n';
import { customStepKey, getTrackDefinition, listLocalizedTracks, type LocalizedLandTrack } from './tracks';
import { evaluateStepTransition, type LandStepStatusValue, type TransitionStep } from './transitions';

/**
 * Service de régularisation foncière (spec 033, lot B2).
 *
 * Isolation : chaque lecture de dossier filtre par `tenantId` ; un identifiant
 * d'une autre agence lève la MÊME `NotFoundError` qu'un objet inexistant. Les
 * écritures vérifient bien (`getPropertyForTenant`) et pièce
 * (`assertBelongsToTenant`, puis même bien) avant d'écrire.
 */

const ENTITY_REGULARIZATION = 'LandRegularization';
const ENTITY_STEP = 'LandRegularizationStep';

type Client = PrismaTransactionClient;

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === 'P2002');
}

/** Traduit la violation de l'index unique partiel (ou d'ordre d'étape) en 409. */
async function withConflictOnUnique<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isUniqueViolation(error)) throw new ConflictError('Ce bien a déjà un dossier de régularisation en cours.');
    throw error;
  }
}

// ---------------------------------------------------------------- lectures

export function listTracks(): LocalizedLandTrack[] {
  return listLocalizedTracks();
}

async function loadRegularization(client: Client, tenantId: string, id: string): Promise<RegularizationRow> {
  const row = await client.landRegularization.findFirst({
    where: { id, tenantId },
    include: REGULARIZATION_INCLUDE
  });
  if (!row) throw new NotFoundError('Dossier de régularisation introuvable.');
  return row;
}

/**
 * Verrou de ligne sur le dossier, pris AVANT de relire dossier et étapes : deux
 * requêtes concurrentes sur le même dossier se sérialisent, ce qui empêche de
 * valider une transition sur un état déjà périmé. Requête paramétrée.
 */
async function lockRegularization(client: Client, tenantId: string, id: string): Promise<void> {
  await client.$queryRaw`SELECT id FROM land_regularizations WHERE id = ${id} AND tenant_id = ${tenantId} FOR UPDATE`;
}

async function loadLocked(client: Client, tenantId: string, id: string): Promise<RegularizationRow> {
  await lockRegularization(client, tenantId, id);
  return loadRegularization(client, tenantId, id);
}

async function loadActiveLocked(client: Client, tenantId: string, id: string): Promise<RegularizationRow> {
  await lockRegularization(client, tenantId, id);
  return loadActiveRegularization(client, tenantId, id);
}

async function loadActiveRegularization(client: Client, tenantId: string, id: string): Promise<RegularizationRow> {
  const row = await loadRegularization(client, tenantId, id);
  if (row.status !== 'EN_COURS') {
    throw new ConflictError('Ce dossier n’est plus en cours : rouvrez-le avant de le modifier.');
  }
  return row;
}

function findStepOrThrow(row: RegularizationRow, stepId: string): RegularizationRow['steps'][number] {
  const step = row.steps.find(candidate => candidate.id === stepId);
  if (!step) throw new NotFoundError('Étape introuvable.');
  return step;
}

export async function listRegularizations(
  tenantId: string,
  query: ListLandRegularizationsQuery
): Promise<LandRegularizationSummaryDto[]> {
  if (query.propertyId) await getPropertyForTenant(query.propertyId, tenantId);
  const rows = await prisma.landRegularization.findMany({
    where: {
      tenantId,
      ...(query.propertyId ? { propertyId: query.propertyId } : {}),
      ...(query.status ? { status: query.status } : {})
    },
    include: REGULARIZATION_INCLUDE,
    orderBy: { createdAt: 'desc' }
  });
  const now = new Date();
  return rows.map(row => toSummaryDto(row, now));
}

export async function getRegularization(tenantId: string, id: string): Promise<LandRegularizationDetailDto> {
  return toDetailDto(await loadRegularization(prisma, tenantId, id));
}

// ---------------------------------------------------------------- création

async function assertNoActiveRegularization(client: Client, tenantId: string, propertyId: string): Promise<void> {
  const active = await client.landRegularization.findFirst({
    where: { tenantId, propertyId, status: 'EN_COURS' },
    select: { id: true }
  });
  if (active) throw new ConflictError('Ce bien a déjà un dossier de régularisation en cours.');
}

function buildInitialSteps(tenantId: string, regularizationId: string, input: CreateLandRegularizationInput) {
  if (input.track === 'CI_ACD') {
    return getTrackDefinition('CI_ACD').steps.map(definition => ({
      tenantId,
      regularizationId,
      stepKey: definition.key,
      sortOrder: definition.order,
      label: definition.label,
      required: definition.required
    }));
  }
  return (input.steps ?? []).map((custom, index) => ({
    tenantId,
    regularizationId,
    stepKey: customStepKey(index + 1),
    sortOrder: index + 1,
    label: custom.label,
    required: custom.required ?? true,
    dueDate: custom.dueDate ?? null
  }));
}

export async function createRegularization(
  tenantId: string,
  actorUserId: string | null,
  input: CreateLandRegularizationInput
): Promise<LandRegularizationDetailDto> {
  await getPropertyForTenant(input.propertyId, tenantId);

  const id = await withConflictOnUnique(() =>
    prisma.$transaction(async tx => {
      await assertNoActiveRegularization(tx, tenantId, input.propertyId);
      const created = await tx.landRegularization.create({
        data: {
          tenantId,
          propertyId: input.propertyId,
          track: input.track,
          startDate: input.startDate ?? new Date(),
          notes: input.notes ?? null,
          createdByUserId: actorUserId
        },
        select: { id: true }
      });
      await tx.landRegularizationStep.createMany({ data: buildInitialSteps(tenantId, created.id, input) });
      return created.id;
    })
  );

  logAuditEvent({
    tenantId,
    actorUserId,
    actionKey: AuditActionKey.LAND_REGULARIZATION_CREATED,
    entityType: ENTITY_REGULARIZATION,
    entityId: id,
    payload: { propertyId: input.propertyId, track: input.track }
  });
  return getRegularization(tenantId, id);
}

// ------------------------------------------------------------ dossier : maj

export async function updateRegularization(
  tenantId: string,
  id: string,
  patch: UpdateLandRegularizationInput
): Promise<LandRegularizationDetailDto> {
  await prisma.$transaction(async tx => {
    await loadActiveLocked(tx, tenantId, id);
    await tx.landRegularization.update({
      where: { id, tenantId },
      data: { notes: patch.notes, startDate: patch.startDate }
    });
  });
  return getRegularization(tenantId, id);
}

type TargetStatus = ChangeLandRegularizationStatusInput['status'];

function assertRegularizationTransition(row: RegularizationRow, target: TargetStatus, reason?: string): void {
  if (row.status === target) throw new BadRequestError('Le dossier a déjà ce statut.');
  if (target === 'EN_COURS') {
    if (!reason) throw new BadRequestError('Un motif est obligatoire pour rouvrir un dossier.');
    return;
  }
  if (row.status !== 'EN_COURS') {
    throw new ConflictError('Seul un dossier en cours peut être terminé ou abandonné.');
  }
  if (target === 'TERMINEE') {
    const pending = row.steps.some(step => step.required && step.status !== 'TERMINEE');
    if (pending) throw new ConflictError('Toutes les étapes obligatoires doivent être terminées.');
  }
}

export async function changeRegularizationStatus(
  tenantId: string,
  actorUserId: string | null,
  id: string,
  input: ChangeLandRegularizationStatusInput
): Promise<LandRegularizationDetailDto> {
  const reason = input.reason || undefined;
  const from = await withConflictOnUnique(() =>
    prisma.$transaction(async tx => {
      const row = await loadLocked(tx, tenantId, id);
      assertRegularizationTransition(row, input.status, reason);
      if (input.status === 'EN_COURS') await assertNoActiveRegularization(tx, tenantId, row.propertyId);
      await tx.landRegularization.update({
        where: { id, tenantId },
        data: { status: input.status, endedAt: input.status === 'EN_COURS' ? null : new Date() }
      });
      return row.status;
    })
  );

  logAuditEvent({
    tenantId,
    actorUserId,
    actionKey: AuditActionKey.LAND_REGULARIZATION_STATUS_CHANGED,
    entityType: ENTITY_REGULARIZATION,
    entityId: id,
    payload: { from, to: input.status, reason: reason ?? null, reopened: input.status === 'EN_COURS' }
  });
  return getRegularization(tenantId, id);
}

// ------------------------------------------------------ étapes : ajout/suppr.

export async function addStep(
  tenantId: string,
  actorUserId: string | null,
  regularizationId: string,
  input: AddLandStepInput
): Promise<LandRegularizationDetailDto> {
  const stepId = await withConflictOnUnique(() =>
    prisma.$transaction(async tx => {
      const row = await loadLocked(tx, tenantId, regularizationId);
      if (row.track !== 'PERSONNALISEE') {
        throw new BadRequestError('On ne peut ajouter une étape que sur une filière personnalisée.');
      }
      if (row.status !== 'EN_COURS')
        throw new ConflictError('Ce dossier n’est plus en cours : rouvrez-le avant de le modifier.');
      if (row.steps.length >= MAX_CUSTOM_STEPS) {
        throw new BadRequestError(t('Un dossier ne peut pas dépasser {{max}} étapes.', { max: MAX_CUSTOM_STEPS }));
      }
      const nextOrder = row.steps.reduce((max, step) => Math.max(max, step.sortOrder), 0) + 1;
      const created = await tx.landRegularizationStep.create({
        data: {
          tenantId,
          regularizationId,
          stepKey: customStepKey(nextOrder),
          sortOrder: nextOrder,
          label: input.label,
          required: input.required ?? true,
          dueDate: input.dueDate ?? null
        },
        select: { id: true }
      });
      return created.id;
    })
  );

  logAuditEvent({
    tenantId,
    actorUserId,
    actionKey: AuditActionKey.LAND_STEP_UPDATED,
    entityType: ENTITY_STEP,
    entityId: stepId,
    payload: { regularizationId, added: true }
  });
  return getRegularization(tenantId, regularizationId);
}

export async function deleteStep(
  tenantId: string,
  actorUserId: string | null,
  regularizationId: string,
  stepId: string
): Promise<LandRegularizationDetailDto> {
  await prisma.$transaction(async tx => {
    const row = await loadActiveLocked(tx, tenantId, regularizationId);
    const step = findStepOrThrow(row, stepId);
    if (row.track !== 'PERSONNALISEE') {
      throw new BadRequestError('On ne peut supprimer une étape que sur une filière personnalisée.');
    }
    const hasCost = Number(step.costXof) !== 0;
    if (step.status !== 'A_FAIRE' || hasCost || step.documentId) {
      throw new ConflictError('Seule une étape à faire, sans frais ni pièce, peut être supprimée.');
    }
    if (row.steps.length <= 1) throw new ConflictError('Un dossier doit conserver au moins une étape.');
    await tx.landRegularizationStep.delete({ where: { id: stepId, tenantId } });
  });

  logAuditEvent({
    tenantId,
    actorUserId,
    actionKey: AuditActionKey.LAND_STEP_UPDATED,
    entityType: ENTITY_STEP,
    entityId: stepId,
    payload: { regularizationId, deleted: true }
  });
  return getRegularization(tenantId, regularizationId);
}

// ---------------------------------------------------------- étapes : maj

/** Une pièce doit appartenir à l'agence ET au bien du dossier ; sinon la même 404. */
async function assertDocumentUsable(
  client: Client,
  tenantId: string,
  propertyId: string,
  documentId: string
): Promise<void> {
  await assertBelongsToTenant(client, 'propertyDocument', documentId, tenantId, { message: 'Document introuvable.' });
  const sameProperty = await client.propertyDocument.findFirst({
    where: { id: documentId, tenantId, propertyId },
    select: { id: true }
  });
  if (!sameProperty) throw new NotFoundError('Document introuvable.');
}

function buildStepUpdateData(patch: UpdateLandStepInput): Prisma.LandRegularizationStepUncheckedUpdateInput {
  const data: Prisma.LandRegularizationStepUncheckedUpdateInput = {};
  if (patch.label !== undefined) data.label = patch.label;
  if (patch.required !== undefined) data.required = patch.required;
  if (patch.dueDate !== undefined) data.dueDate = patch.dueDate;
  if (patch.notes !== undefined) data.notes = patch.notes;
  if (patch.documentId !== undefined) data.documentId = patch.documentId;
  if (patch.costXof !== undefined) data.costXof = new Prisma.Decimal(patch.costXof).toDecimalPlaces(2);
  return data;
}

function assertRequiredChangeAllowed(
  row: RegularizationRow,
  step: RegularizationRow['steps'][number],
  patch: UpdateLandStepInput
): void {
  if (patch.required !== true || step.required) return;
  const laterDone = row.steps.some(other => other.sortOrder > step.sortOrder && other.status === 'TERMINEE');
  if (laterDone) {
    throw new ConflictError('Impossible de rendre cette étape obligatoire : une étape suivante est déjà terminée.');
  }
}

export async function updateStep(
  tenantId: string,
  actorUserId: string | null,
  regularizationId: string,
  stepId: string,
  patch: UpdateLandStepInput
): Promise<LandRegularizationDetailDto> {
  await prisma.$transaction(async tx => {
    const row = await loadActiveLocked(tx, tenantId, regularizationId);
    const step = findStepOrThrow(row, stepId);
    if ((patch.label !== undefined || patch.required !== undefined) && row.track !== 'PERSONNALISEE') {
      throw new BadRequestError(
        'Le libellé et le caractère obligatoire ne sont modifiables que sur une étape personnalisée.'
      );
    }
    assertRequiredChangeAllowed(row, step, patch);
    if (patch.documentId) await assertDocumentUsable(tx, tenantId, row.propertyId, patch.documentId);
    await tx.landRegularizationStep.update({ where: { id: stepId, tenantId }, data: buildStepUpdateData(patch) });
  });

  logAuditEvent({
    tenantId,
    actorUserId,
    actionKey: AuditActionKey.LAND_STEP_UPDATED,
    entityType: ENTITY_STEP,
    entityId: stepId,
    payload: { regularizationId, fields: Object.keys(patch) }
  });
  return getRegularization(tenantId, regularizationId);
}

function buildStatusTimestamps(
  step: { startedAt: Date | null },
  target: LandStepStatusValue,
  now: Date
): Prisma.LandRegularizationStepUncheckedUpdateInput {
  const data: Prisma.LandRegularizationStepUncheckedUpdateInput = { status: target };
  if ((target === 'EN_COURS' || target === 'TERMINEE') && !step.startedAt) data.startedAt = now;
  if (target === 'TERMINEE') data.completedAt = now;
  return data;
}

function toTransitionSteps(row: RegularizationRow): TransitionStep[] {
  return row.steps.map(step => ({
    id: step.id,
    order: step.sortOrder,
    required: step.required,
    status: step.status as LandStepStatusValue
  }));
}

export async function changeStepStatus(
  tenantId: string,
  actorUserId: string | null,
  regularizationId: string,
  stepId: string,
  input: ChangeLandStepStatusInput
): Promise<LandRegularizationDetailDto> {
  const reason = input.reason || undefined;
  const { from, reopened } = await prisma.$transaction(async tx => {
    const row = await loadActiveLocked(tx, tenantId, regularizationId);
    const step = findStepOrThrow(row, stepId);
    const verdict = evaluateStepTransition(toTransitionSteps(row), stepId, input.status, reason);
    if (!verdict.ok) {
      throw verdict.httpStatus === 400 ? new BadRequestError(verdict.message) : new ConflictError(verdict.message);
    }
    const data = buildStatusTimestamps(step, input.status, new Date());
    if (verdict.reopening) data.completedAt = null;
    await tx.landRegularizationStep.update({ where: { id: stepId, tenantId }, data });
    return { from: step.status, reopened: verdict.reopening };
  });

  logAuditEvent({
    tenantId,
    actorUserId,
    actionKey: AuditActionKey.LAND_STEP_STATUS_CHANGED,
    entityType: ENTITY_STEP,
    entityId: stepId,
    payload: { regularizationId, from, to: input.status, reason: reason ?? null, reopened }
  });
  return getRegularization(tenantId, regularizationId);
}
