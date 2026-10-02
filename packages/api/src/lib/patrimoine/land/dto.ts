import type { Prisma } from '@prisma/client';
import { computeProgress, totalFeesAsNumber, type RegularizationProgress } from './fees';
import {
  CUSTOM_STEP_DOCUMENT_TYPE,
  getTrackDefinition,
  translateStepLabel,
  translateTrackLabel,
  translateTrackValidationNote
} from './tracks';
import { allowedStepTransitions, isOverdueAt, type LandStepStatusValue } from './transitions';

/** Lecture standard d'un dossier : bien résumé + étapes (avec leur pièce résumée). */
export const REGULARIZATION_INCLUDE = {
  property: { select: { id: true, internalReference: true, title: true } },
  steps: {
    orderBy: { sortOrder: 'asc' },
    include: { document: { select: { id: true, fileName: true, documentType: true } } }
  }
} satisfies Prisma.LandRegularizationInclude;

export type RegularizationRow = Prisma.LandRegularizationGetPayload<{ include: typeof REGULARIZATION_INCLUDE }>;
type StepRow = RegularizationRow['steps'][number];

export interface LandStepDto {
  id: string;
  stepKey: string;
  order: number;
  label: string;
  required: boolean;
  status: LandStepStatusValue;
  startedAt: string | null;
  completedAt: string | null;
  dueDate: string | null;
  costXof: number;
  notes: string | null;
  documentId: string | null;
  document: { id: string; fileName: string; documentType: string } | null;
  suggestedDocumentType: string;
  isOverdue: boolean;
  allowedTransitions: LandStepStatusValue[];
}

export interface LandRegularizationSummaryDto {
  id: string;
  propertyId: string;
  property: { id: string; internalReference: string; title: string };
  track: string;
  trackLabel: string;
  validationStatus: string;
  status: string;
  startDate: string;
  endedAt: string | null;
  notes: string | null;
  progress: RegularizationProgress;
  feesXof: number;
  nextDueDate: string | null;
  overdueSteps: number;
  currentStepLabel: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LandRegularizationDetailDto extends LandRegularizationSummaryDto {
  validationNote: string | null;
  steps: LandStepDto[];
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function isStepOverdue(step: StepRow, active: boolean, now: Date): boolean {
  const open = step.status === 'A_FAIRE' || step.status === 'EN_COURS';
  return active && open && isOverdueAt(step.dueDate, now);
}

function suggestedDocumentTypeOf(row: RegularizationRow, step: StepRow): string {
  if (row.track === 'PERSONNALISEE') return CUSTOM_STEP_DOCUMENT_TYPE;
  const definition = getTrackDefinition(row.track).steps.find(candidate => candidate.key === step.stepKey);
  return definition?.suggestedDocumentType ?? CUSTOM_STEP_DOCUMENT_TYPE;
}

function toStepDto(row: RegularizationRow, step: StepRow, now: Date): LandStepDto {
  const active = row.status === 'EN_COURS';
  const transitionSteps = row.steps.map(s => ({
    id: s.id,
    order: s.sortOrder,
    required: s.required,
    status: s.status as LandStepStatusValue
  }));
  return {
    id: step.id,
    stepKey: step.stepKey,
    order: step.sortOrder,
    label: translateStepLabel(step.stepKey, step.label),
    required: step.required,
    status: step.status as LandStepStatusValue,
    startedAt: iso(step.startedAt),
    completedAt: iso(step.completedAt),
    dueDate: iso(step.dueDate),
    costXof: Number(step.costXof),
    notes: step.notes,
    documentId: step.documentId,
    document: step.document ? { ...step.document } : null,
    suggestedDocumentType: suggestedDocumentTypeOf(row, step),
    isOverdue: isStepOverdue(step, active, now),
    allowedTransitions: allowedStepTransitions(transitionSteps, step.id, active)
  };
}

/** Étape courante : la première étape non terminée, par ordre. */
function currentStepLabel(row: RegularizationRow): string | null {
  if (row.status !== 'EN_COURS') return null;
  const current = row.steps.find(s => s.status !== 'TERMINEE');
  return current ? translateStepLabel(current.stepKey, current.label) : null;
}

/** Prochaine échéance : la plus proche parmi les étapes non terminées d'un dossier en cours. */
function nextDueDate(row: RegularizationRow): string | null {
  if (row.status !== 'EN_COURS') return null;
  const dates = row.steps
    .filter(s => s.status !== 'TERMINEE' && s.dueDate !== null)
    .map(s => (s.dueDate as Date).getTime());
  return dates.length > 0 ? new Date(Math.min(...dates)).toISOString() : null;
}

export function toSummaryDto(row: RegularizationRow, now: Date = new Date()): LandRegularizationSummaryDto {
  const active = row.status === 'EN_COURS';
  const track = getTrackDefinition(row.track);
  return {
    id: row.id,
    propertyId: row.propertyId,
    property: { ...row.property },
    track: row.track,
    trackLabel: translateTrackLabel(row.track),
    validationStatus: track.validationStatus,
    status: row.status,
    startDate: row.startDate.toISOString(),
    endedAt: iso(row.endedAt),
    notes: row.notes,
    progress: computeProgress(row.steps),
    feesXof: totalFeesAsNumber(row.steps),
    nextDueDate: nextDueDate(row),
    overdueSteps: row.steps.filter(s => isStepOverdue(s, active, now)).length,
    currentStepLabel: currentStepLabel(row),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export function toDetailDto(row: RegularizationRow, now: Date = new Date()): LandRegularizationDetailDto {
  return {
    ...toSummaryDto(row, now),
    validationNote: translateTrackValidationNote(row.track),
    steps: row.steps.map(step => toStepDto(row, step, now))
  };
}
