import type { PropertyDocumentType } from '@prisma/client';
import { t } from '../../../i18n';

/**
 * Catalogue versionné des filières de régularisation foncière (spec 033, lot B2).
 *
 * Constantes de code, pas de table : une filière évolue avec la loi et doit
 * rester relisible en revue. Aucune durée n'est inventée
 * (`indicativeDurationDays` est absent partout) et aucune valeur juridique
 * n'est présentée comme certaine : la filière CI_ACD est `A_VALIDER` par un
 * juriste local.
 *
 * Les libellés stockés ci-dessous sont les textes FRANÇAIS (clé de traduction,
 * et valeur écrite dans `LandRegularizationStep.label`). La traduction se fait
 * à la lecture, par `t()` appelé au moment de la requête — jamais à l'import,
 * sinon la langue de la requête serait figée au démarrage du processus.
 */

export type LandTrackKeyValue = 'CI_ACD' | 'PERSONNALISEE';
export type LandTrackValidationStatus = 'A_VALIDER' | 'NON_APPLICABLE';

export interface LandTrackStepDefinition {
  key: string;
  order: number;
  /** Texte français : clé de traduction et valeur stockée en base. */
  label: string;
  required: boolean;
  indicativeDurationDays: number | null;
  suggestedDocumentType: PropertyDocumentType;
}

export interface LandTrackDefinition {
  key: LandTrackKeyValue;
  country: 'CI' | null;
  validationStatus: LandTrackValidationStatus;
  steps: readonly LandTrackStepDefinition[];
}

function step(
  order: number,
  key: string,
  label: string,
  suggestedDocumentType: PropertyDocumentType
): LandTrackStepDefinition {
  return { key, order, label, required: true, indicativeDurationDays: null, suggestedDocumentType };
}

export const LAND_TRACKS: readonly LandTrackDefinition[] = [
  {
    key: 'CI_ACD',
    country: 'CI',
    validationStatus: 'A_VALIDER',
    steps: [
      step(1, 'attestation_villageoise', 'Attestation villageoise', 'OTHER'),
      step(2, 'dossier_technique_geometre', 'Dossier technique du géomètre', 'PLAN'),
      step(3, 'bornage_contradictoire', 'Bornage contradictoire', 'PLAN'),
      step(4, 'demande_acd', "Demande d'ACD au ministère", 'OTHER'),
      step(5, 'acd', 'Arrêté de concession définitive (ACD)', 'LAND_CONCESSION'),
      step(6, 'titre_foncier', 'Titre foncier', 'TITLE_DEED')
    ]
  },
  { key: 'PERSONNALISEE', country: null, validationStatus: 'NON_APPLICABLE', steps: [] }
];

/** Type de pièce suggéré pour une étape personnalisée. */
export const CUSTOM_STEP_DOCUMENT_TYPE: PropertyDocumentType = 'OTHER';

export function getTrackDefinition(key: LandTrackKeyValue): LandTrackDefinition {
  const track = LAND_TRACKS.find(candidate => candidate.key === key);
  if (!track) throw new Error(`Filière foncière inconnue : ${key}`);
  return track;
}

/** Clé d'étape d'une étape personnalisée : `custom_<n>` (n = rang, à partir de 1). */
export function customStepKey(order: number): string {
  return `custom_${order}`;
}

/**
 * Traducteurs du texte du catalogue, indexés par clé d'étape. Chaque `t()` est
 * un littéral (visible de `npm run i18n:extract`) et n'est évalué qu'à l'appel.
 */
const STEP_LABEL_TRANSLATORS: Readonly<Record<string, () => string>> = {
  attestation_villageoise: () => t('Attestation villageoise'),
  dossier_technique_geometre: () => t('Dossier technique du géomètre'),
  bornage_contradictoire: () => t('Bornage contradictoire'),
  demande_acd: () => t("Demande d'ACD au ministère"),
  acd: () => t('Arrêté de concession définitive (ACD)'),
  titre_foncier: () => t('Titre foncier')
};

/**
 * Libellé d'une étape dans la langue de la requête. Une étape du catalogue est
 * traduite ; une étape personnalisée (`custom_<n>`) garde le texte saisi.
 */
export function translateStepLabel(stepKey: string, storedLabel: string): string {
  const translate = STEP_LABEL_TRANSLATORS[stepKey];
  return translate ? translate() : storedLabel;
}

export function translateTrackLabel(key: LandTrackKeyValue): string {
  return key === 'CI_ACD' ? t("Côte d'Ivoire — de l'attestation villageoise au titre foncier") : t('Personnalisée');
}

export function translateTrackValidationNote(key: LandTrackKeyValue): string | null {
  return key === 'CI_ACD' ? t('Filière à faire valider par un juriste local.') : null;
}

export interface LocalizedLandTrack {
  key: LandTrackKeyValue;
  country: 'CI' | null;
  label: string;
  validationStatus: LandTrackValidationStatus;
  validationNote: string | null;
  steps: Array<{
    key: string;
    order: number;
    label: string;
    required: boolean;
    indicativeDurationDays: number | null;
    suggestedDocumentType: PropertyDocumentType;
  }>;
}

/** Catalogue prêt à servir, traduit dans la langue de la requête en cours. */
export function listLocalizedTracks(): LocalizedLandTrack[] {
  return LAND_TRACKS.map(track => ({
    key: track.key,
    country: track.country,
    label: translateTrackLabel(track.key),
    validationStatus: track.validationStatus,
    validationNote: translateTrackValidationNote(track.key),
    steps: track.steps.map(definition => ({
      key: definition.key,
      order: definition.order,
      label: translateStepLabel(definition.key, definition.label),
      required: definition.required,
      indicativeDurationDays: definition.indicativeDurationDays,
      suggestedDocumentType: definition.suggestedDocumentType
    }))
  }));
}
