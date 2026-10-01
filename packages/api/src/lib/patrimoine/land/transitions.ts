/**
 * Règles de transition des étapes d'une régularisation foncière (spec 033).
 *
 * Fonction pure, source unique : le service l'applique pour accepter ou
 * refuser un changement, et `allowedStepTransitions` s'en sert pour dire au
 * front quels boutons afficher — les deux ne peuvent donc pas diverger.
 */

import { t } from '../../../i18n';

export type LandStepStatusValue = 'A_FAIRE' | 'EN_COURS' | 'TERMINEE' | 'BLOQUEE';

/** Graphe des transitions autorisées, hors règles d'ordre. */
const TRANSITION_GRAPH: Readonly<Record<LandStepStatusValue, readonly LandStepStatusValue[]>> = {
  A_FAIRE: ['EN_COURS', 'BLOQUEE', 'TERMINEE'],
  EN_COURS: ['TERMINEE', 'BLOQUEE', 'A_FAIRE'],
  BLOQUEE: ['EN_COURS', 'A_FAIRE'],
  TERMINEE: ['EN_COURS']
};

export interface TransitionStep {
  id: string;
  order: number;
  required: boolean;
  status: LandStepStatusValue;
}

export type TransitionRefusal =
  | { ok: false; httpStatus: 400; code: 'SAME_STATUS' | 'REASON_REQUIRED'; message: string }
  | {
      ok: false;
      httpStatus: 409;
      code: 'NOT_ALLOWED' | 'PREVIOUS_REQUIRED_NOT_DONE' | 'LATER_STEP_DONE';
      message: string;
    };

export type TransitionVerdict = { ok: true; reopening: boolean } | TransitionRefusal;

function refuse400(code: 'SAME_STATUS' | 'REASON_REQUIRED', message: string): TransitionRefusal {
  return { ok: false, httpStatus: 400, code, message };
}

function refuse409(
  code: 'NOT_ALLOWED' | 'PREVIOUS_REQUIRED_NOT_DONE' | 'LATER_STEP_DONE',
  message: string
): TransitionRefusal {
  return { ok: false, httpStatus: 409, code, message };
}

function checkReopening(step: TransitionStep, steps: readonly TransitionStep[], reason?: string): TransitionVerdict {
  if (!reason || reason.trim().length === 0) {
    return refuse400('REASON_REQUIRED', t('Un motif est obligatoire pour rouvrir une étape terminée.'));
  }
  const laterDone = steps.some(other => other.order > step.order && other.status === 'TERMINEE');
  if (laterDone) {
    return refuse409(
      'LATER_STEP_DONE',
      t(
        'Impossible de rouvrir cette étape : une étape suivante est déjà terminée. Rouvrez d’abord les étapes suivantes.'
      )
    );
  }
  return { ok: true, reopening: true };
}

function checkCompletion(step: TransitionStep, steps: readonly TransitionStep[]): TransitionVerdict {
  const blocking = steps.some(other => other.order < step.order && other.required && other.status !== 'TERMINEE');
  if (blocking) {
    return refuse409(
      'PREVIOUS_REQUIRED_NOT_DONE',
      t('Impossible de terminer cette étape : une étape obligatoire précédente n’est pas terminée.')
    );
  }
  return { ok: true, reopening: false };
}

/**
 * Évalue le passage de `stepId` vers `target` au sein de la liste d'étapes du
 * dossier. Ordre des contrôles : même statut (400), graphe (409), réouverture
 * (motif 400, étape suivante terminée 409), puis achèvement hors ordre (409).
 */
export function evaluateStepTransition(
  steps: readonly TransitionStep[],
  stepId: string,
  target: LandStepStatusValue,
  reason?: string
): TransitionVerdict {
  const step = steps.find(candidate => candidate.id === stepId);
  if (!step) throw new Error(`Étape inconnue dans la liste : ${stepId}`);

  if (step.status === target) {
    return refuse400('SAME_STATUS', t("L'étape a déjà ce statut."));
  }
  if (!TRANSITION_GRAPH[step.status].includes(target)) {
    return refuse409('NOT_ALLOWED', t('Ce changement de statut n’est pas autorisé pour cette étape.'));
  }
  if (step.status === 'TERMINEE') return checkReopening(step, steps, reason);
  if (target === 'TERMINEE') return checkCompletion(step, steps);
  return { ok: true, reopening: false };
}

/**
 * Statuts réellement atteignables depuis l'état courant. Un dossier qui n'est
 * plus EN_COURS ne laisse aucune transition. Le motif n'est pas exigé ici : le
 * front le demande au moment de la réouverture.
 */
export function allowedStepTransitions(
  steps: readonly TransitionStep[],
  stepId: string,
  regularizationActive: boolean
): LandStepStatusValue[] {
  if (!regularizationActive) return [];
  const step = steps.find(candidate => candidate.id === stepId);
  if (!step) return [];
  return TRANSITION_GRAPH[step.status].filter(target => {
    const verdict = evaluateStepTransition(steps, stepId, target, 'motif');
    return verdict.ok;
  });
}

/** Début (00:00 UTC) du jour de `now`. */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Une échéance n'est dépassée qu'à partir du lendemain (UTC) : une étape due
 * aujourd'hui n'est pas en retard. Source unique, réutilisée par les alertes.
 */
export function isOverdueAt(dueDate: Date | null | undefined, now: Date): boolean {
  return Boolean(dueDate) && (dueDate as Date).getTime() < startOfUtcDay(now).getTime();
}
