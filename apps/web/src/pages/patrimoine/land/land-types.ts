/**
 * Types du lot B2 (spec 033) — régularisation foncière.
 *
 * Miroir du contrat HTTP : les noms de champs sont ceux de l'API. Le web ne
 * recalcule ni progression, ni retard, ni transitions : tout vient du serveur.
 */

export type LandTrackKey = 'CI_ACD' | 'PERSONNALISEE';
export type LandValidationStatus = 'A_VALIDER' | 'NON_APPLICABLE';
export type LandRegularizationStatus = 'EN_COURS' | 'TERMINEE' | 'ABANDONNEE';
export type LandStepStatus = 'A_FAIRE' | 'EN_COURS' | 'TERMINEE' | 'BLOQUEE';

export interface LandTrackStep {
  key: string;
  order: number;
  label: string;
  required: boolean;
  indicativeDurationDays: number | null;
  suggestedDocumentType: string;
}

export interface LandTrack {
  key: LandTrackKey;
  country: 'CI' | null;
  label: string;
  validationStatus: LandValidationStatus;
  validationNote: string | null;
  steps: LandTrackStep[];
}

export interface LandProgress {
  total: number;
  required: number;
  completed: number;
  completedRequired: number;
  percent: number;
}

export interface LandRegularizationSummary {
  id: string;
  propertyId: string;
  property: { id: string; internalReference: string | null; title: string };
  track: LandTrackKey;
  trackLabel: string;
  validationStatus: LandValidationStatus;
  status: LandRegularizationStatus;
  startDate: string | null;
  endedAt: string | null;
  notes: string | null;
  progress: LandProgress;
  feesXof: number;
  nextDueDate: string | null;
  overdueSteps: number;
  currentStepLabel: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LandStepDocument {
  id: string;
  fileName: string;
  documentType: string;
}

export interface LandStep {
  id: string;
  stepKey: string;
  order: number;
  label: string;
  required: boolean;
  status: LandStepStatus;
  startedAt: string | null;
  completedAt: string | null;
  dueDate: string | null;
  costXof: number;
  notes: string | null;
  documentId: string | null;
  document: LandStepDocument | null;
  suggestedDocumentType: string;
  isOverdue: boolean;
  allowedTransitions: LandStepStatus[];
}

export interface LandRegularizationDetail extends LandRegularizationSummary {
  validationNote: string | null;
  steps: LandStep[];
}

export interface LandCustomStepInput {
  label: string;
  required?: boolean;
  dueDate?: string;
}

export interface CreateLandRegularizationInput {
  propertyId: string;
  track: LandTrackKey;
  startDate?: string;
  notes?: string;
  steps?: LandCustomStepInput[];
}

export interface UpdateLandRegularizationInput {
  notes?: string;
  startDate?: string;
}

export interface UpdateLandStepInput {
  label?: string;
  required?: boolean;
  dueDate?: string | null;
  costXof?: number;
  notes?: string | null;
  documentId?: string | null;
}

export interface LandRegularizationFilters {
  propertyId?: string;
  status?: LandRegularizationStatus;
}
