/**
 * Regularisation fonciere (spec 033, lot B2) : catalogue des filieres, regles
 * de transition et calcul des frais. Fonctions pures, aucun mock necessaire.
 */
import {
  LAND_TRACKS,
  getTrackDefinition,
  listLocalizedTracks,
  translateStepLabel
} from '../../src/lib/patrimoine/land/tracks';
import { runWithLanguage } from '../../src/i18n';
import {
  allowedStepTransitions,
  evaluateStepTransition,
  isOverdueAt,
  startOfUtcDay,
  type LandStepStatusValue,
  type TransitionStep
} from '../../src/lib/patrimoine/land/transitions';
import { computeProgress, totalFees, totalFeesAsNumber } from '../../src/lib/patrimoine/land/fees';
import { classifyTenantRoute } from '../../src/lib/subscription/route-features';

function steps(...statuses: Array<[LandStepStatusValue, boolean?]>): TransitionStep[] {
  return statuses.map(([status, required], index) => ({
    id: `s${index + 1}`,
    order: index + 1,
    required: required ?? true,
    status
  }));
}

describe('filiere CI_ACD', () => {
  const track = getTrackDefinition('CI_ACD');

  it('compte 6 etapes obligatoires, ordonnees de 1 a 6, sans duree inventee', () => {
    expect(track.steps.map(s => s.order)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(track.steps.every(s => s.required)).toBe(true);
    expect(track.steps.every(s => s.indicativeDurationDays === null)).toBe(true);
    expect(track.country).toBe('CI');
    expect(track.validationStatus).toBe('A_VALIDER');
  });

  it('porte les cles, libelles et types de piece du contrat', () => {
    expect(track.steps.map(s => [s.key, s.label, s.suggestedDocumentType])).toEqual([
      ['attestation_villageoise', 'Attestation villageoise', 'OTHER'],
      ['dossier_technique_geometre', 'Dossier technique du géomètre', 'PLAN'],
      ['bornage_contradictoire', 'Bornage contradictoire', 'PLAN'],
      ['demande_acd', "Demande d'ACD au ministère", 'OTHER'],
      ['acd', 'Arrêté de concession définitive (ACD)', 'LAND_CONCESSION'],
      ['titre_foncier', 'Titre foncier', 'TITLE_DEED']
    ]);
  });

  it('la filiere personnalisee n a aucune etape predefinie et n est pas a valider', () => {
    const custom = LAND_TRACKS.find(t => t.key === 'PERSONNALISEE');
    expect(custom?.steps).toHaveLength(0);
    expect(custom?.validationStatus).toBe('NON_APPLICABLE');
    expect(custom?.country).toBeNull();
  });

  it('le catalogue localise (francais par defaut) reprend les libelles et la note de validation', () => {
    const [ci, custom] = listLocalizedTracks();
    expect(ci.steps[0].label).toBe('Attestation villageoise');
    expect(ci.validationNote).toMatch(/juriste local/);
    expect(custom.validationNote).toBeNull();
  });

  it('une etape personnalisee garde le texte saisi, quelle que soit la langue', () => {
    runWithLanguage('ar', () => {
      expect(translateStepLabel('custom_1', 'Visite du terrain')).toBe('Visite du terrain');
    });
  });
});

describe('transitions d etape', () => {
  it('refuse le meme statut (400)', () => {
    const verdict = evaluateStepTransition(steps(['A_FAIRE']), 's1', 'A_FAIRE');
    expect(verdict).toMatchObject({ ok: false, httpStatus: 400, code: 'SAME_STATUS' });
  });

  it('suit le graphe : A_FAIRE, EN_COURS et BLOQUEE', () => {
    const list = steps(['A_FAIRE']);
    expect(evaluateStepTransition(list, 's1', 'EN_COURS').ok).toBe(true);
    expect(evaluateStepTransition(list, 's1', 'BLOQUEE').ok).toBe(true);
    expect(evaluateStepTransition(steps(['BLOQUEE']), 's1', 'TERMINEE')).toMatchObject({
      ok: false,
      httpStatus: 409,
      code: 'NOT_ALLOWED'
    });
    expect(evaluateStepTransition(steps(['BLOQUEE']), 's1', 'A_FAIRE').ok).toBe(true);
  });

  it('refuse de terminer hors ordre quand une etape obligatoire precedente n est pas terminee', () => {
    const verdict = evaluateStepTransition(steps(['A_FAIRE'], ['A_FAIRE']), 's2', 'TERMINEE');
    expect(verdict).toMatchObject({ ok: false, httpStatus: 409, code: 'PREVIOUS_REQUIRED_NOT_DONE' });
  });

  it('ignore une etape precedente optionnelle', () => {
    const verdict = evaluateStepTransition(steps(['A_FAIRE', false], ['A_FAIRE']), 's2', 'TERMINEE');
    expect(verdict.ok).toBe(true);
  });

  it('accepte de terminer quand les obligatoires precedentes sont terminees', () => {
    expect(evaluateStepTransition(steps(['TERMINEE'], ['A_FAIRE']), 's2', 'TERMINEE').ok).toBe(true);
  });

  it('exige un motif pour rouvrir une etape terminee (400)', () => {
    const list = steps(['TERMINEE']);
    expect(evaluateStepTransition(list, 's1', 'EN_COURS')).toMatchObject({
      ok: false,
      httpStatus: 400,
      code: 'REASON_REQUIRED'
    });
    expect(evaluateStepTransition(list, 's1', 'EN_COURS', '   ')).toMatchObject({ code: 'REASON_REQUIRED' });
    expect(evaluateStepTransition(list, 's1', 'EN_COURS', 'Erreur de saisie')).toEqual({ ok: true, reopening: true });
  });

  it('refuse la reouverture quand une etape suivante est terminee (409)', () => {
    const verdict = evaluateStepTransition(steps(['TERMINEE'], ['TERMINEE']), 's1', 'EN_COURS', 'motif');
    expect(verdict).toMatchObject({ ok: false, httpStatus: 409, code: 'LATER_STEP_DONE' });
  });

  it('une etape terminee ne retourne qu a EN_COURS', () => {
    expect(evaluateStepTransition(steps(['TERMINEE']), 's1', 'A_FAIRE', 'motif')).toMatchObject({
      ok: false,
      code: 'NOT_ALLOWED'
    });
  });

  it('allowedStepTransitions reflete les regles d ordre et le statut du dossier', () => {
    const list = steps(['A_FAIRE'], ['A_FAIRE']);
    expect(allowedStepTransitions(list, 's1', true)).toEqual(['EN_COURS', 'BLOQUEE', 'TERMINEE']);
    expect(allowedStepTransitions(list, 's2', true)).toEqual(['EN_COURS', 'BLOQUEE']);
    expect(allowedStepTransitions(list, 's1', false)).toEqual([]);
    expect(allowedStepTransitions(steps(['TERMINEE'], ['TERMINEE']), 's1', true)).toEqual([]);
    expect(allowedStepTransitions(steps(['TERMINEE'], ['A_FAIRE']), 's1', true)).toEqual(['EN_COURS']);
  });
});

describe('frais et progression', () => {
  it('additionne en Decimal sans derive flottante', () => {
    const total = totalFees([{ costXof: '0.1' }, { costXof: '0.2' }, { costXof: 0 }, { costXof: null }]);
    expect(total.toString()).toBe('0.3');
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(totalFeesAsNumber([{ costXof: 0.1 }, { costXof: 0.2 }])).toBe(0.3);
  });

  it('arrondit au centime et compte 0 pour les etapes sans cout', () => {
    expect(totalFeesAsNumber([{ costXof: '10.005' }, { costXof: '5.004' }])).toBe(15.01);
    expect(totalFeesAsNumber([])).toBe(0);
    expect(totalFeesAsNumber([{ costXof: undefined }])).toBe(0);
  });

  it('calcule la progression : percent = terminees / total arrondi', () => {
    const progress = computeProgress([
      { required: true, status: 'TERMINEE' },
      { required: true, status: 'EN_COURS' },
      { required: false, status: 'TERMINEE' }
    ]);
    expect(progress).toEqual({ total: 3, required: 2, completed: 2, completedRequired: 1, percent: 67 });
    expect(computeProgress([]).percent).toBe(0);
  });
});

describe('abonnement : les routes foncieres sont couvertes par le prefixe /patrimoine', () => {
  it('chaque chemin de regularisation releve de la fonctionnalite PATRIMOINE', () => {
    const paths = [
      '/patrimoine/land-tracks',
      '/patrimoine/land-regularizations',
      '/patrimoine/land-regularizations/:regularizationId',
      '/patrimoine/land-regularizations/:regularizationId/status',
      '/patrimoine/land-regularizations/:regularizationId/steps',
      '/patrimoine/land-regularizations/:regularizationId/steps/:stepId',
      '/patrimoine/land-regularizations/:regularizationId/steps/:stepId/status'
    ];
    for (const path of paths) {
      expect([path, classifyTenantRoute(path)]).toEqual([path, 'PATRIMOINE']);
    }
  });
});

describe('echeance : bord du jour UTC', () => {
  const now = new Date('2026-10-01T15:30:00.000Z');

  it('startOfUtcDay rend minuit UTC du jour courant', () => {
    expect(startOfUtcDay(now).toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('une echeance aujourd hui (a minuit comme dans la journee) n est pas en retard', () => {
    expect(isOverdueAt(new Date('2026-10-01T00:00:00.000Z'), now)).toBe(false);
    expect(isOverdueAt(new Date('2026-10-01T10:00:00.000Z'), now)).toBe(false);
    expect(isOverdueAt(new Date('2026-10-02T00:00:00.000Z'), now)).toBe(false);
  });

  it('une echeance de la veille est en retard ; sans echeance, jamais', () => {
    expect(isOverdueAt(new Date('2026-09-30T23:59:59.000Z'), now)).toBe(true);
    expect(isOverdueAt(new Date('2026-09-30T00:00:00.000Z'), now)).toBe(true);
    expect(isOverdueAt(null, now)).toBe(false);
    expect(isOverdueAt(undefined, now)).toBe(false);
  });
});
