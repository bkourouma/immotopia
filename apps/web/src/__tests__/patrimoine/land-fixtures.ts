import type {
  LandRegularizationDetail,
  LandRegularizationSummary,
  LandStep
} from '../../pages/patrimoine/land/land-types';

export function etape(overrides: Partial<LandStep> = {}): LandStep {
  return {
    id: 'step-1',
    stepKey: 'attestation_villageoise',
    order: 1,
    label: 'Attestation villageoise',
    required: true,
    status: 'A_FAIRE',
    startedAt: null,
    completedAt: null,
    dueDate: null,
    costXof: 0,
    notes: null,
    documentId: null,
    document: null,
    suggestedDocumentType: 'OTHER',
    isOverdue: false,
    allowedTransitions: ['EN_COURS', 'BLOQUEE', 'TERMINEE'],
    ...overrides
  };
}

export function resume(overrides: Partial<LandRegularizationSummary> = {}): LandRegularizationSummary {
  return {
    id: 'reg-1',
    propertyId: 'bien-1',
    property: { id: 'bien-1', internalReference: 'TER-001', title: 'Terrain de Bingerville' },
    track: 'CI_ACD',
    trackLabel: "Côte d'Ivoire — attestation villageoise vers ACD",
    validationStatus: 'A_VALIDER',
    status: 'EN_COURS',
    startDate: '2026-03-01T00:00:00.000Z',
    endedAt: null,
    notes: null,
    progress: { total: 6, required: 6, completed: 2, completedRequired: 2, percent: 33 },
    feesXof: 1250000,
    nextDueDate: '2026-11-15T00:00:00.000Z',
    overdueSteps: 1,
    currentStepLabel: 'Bornage contradictoire',
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...overrides
  };
}

export function detail(overrides: Partial<LandRegularizationDetail> = {}): LandRegularizationDetail {
  return {
    ...resume(),
    validationNote: 'Filière à faire valider par un juriste local.',
    steps: [
      etape({ id: 'step-1', status: 'TERMINEE', allowedTransitions: ['EN_COURS'], costXof: 500000 }),
      etape({
        id: 'step-2',
        order: 2,
        stepKey: 'dossier_technique_geometre',
        label: 'Dossier technique du géomètre',
        status: 'EN_COURS',
        costXof: 750000,
        isOverdue: true,
        suggestedDocumentType: 'PLAN',
        allowedTransitions: ['TERMINEE', 'BLOQUEE', 'A_FAIRE']
      })
    ],
    ...overrides
  };
}

/** Dossier clos tel que l'API réelle le rend : plus aucune transition d'étape. */
export function detailClos(overrides: Partial<LandRegularizationDetail> = {}): LandRegularizationDetail {
  const base = detail();
  return {
    ...base,
    track: 'PERSONNALISEE',
    validationStatus: 'NON_APPLICABLE',
    validationNote: null,
    status: 'ABANDONNEE',
    steps: base.steps.map(step => ({ ...step, allowedTransitions: [] })),
    ...overrides
  };
}
