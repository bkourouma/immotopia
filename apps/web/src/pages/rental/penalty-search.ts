import type { RentalPenalty } from '../../services/rental-service';
import type { SearchCriterion } from '../../utils/list-search';
import { t } from '../../i18n/t';

/**
 * Critères de recherche transmis à l'API. Les accesseurs ci-dessous restent
 * disponibles pour les autres usages de présentation et les anciens tests.
 */

function champ(penalite: RentalPenalty): string | null {
  return (penalite as { override_reason?: string | null }).override_reason || penalite.adjustment_reason || null;
}

/** Raison d'ajustement saisie (texte brut ou champ `reason` du JSON). */
export function penaltyReason(penalite: RentalPenalty): string {
  const brut = champ(penalite);
  if (!brut) return '';
  try {
    return String(JSON.parse(brut).reason || brut);
  } catch {
    return brut;
  }
}

/** Nom du justificatif joint, ou chaîne vide. */
export function penaltyJustificationName(penalite: RentalPenalty): string {
  const brut = champ(penalite);
  if (!brut) return '';
  try {
    return String(JSON.parse(brut).justification?.fileName || '');
  } catch {
    return '';
  }
}

function hasJustification(penalite: RentalPenalty): boolean {
  const brut = champ(penalite);
  if (!brut) return false;
  try {
    return Boolean(JSON.parse(brut).justification);
  } catch {
    return false;
  }
}

/** Montant réellement retenu (0 est une valeur : `??`, jamais `||`). */
export function penaltyRetainedAmount(penalite: RentalPenalty): number {
  return penalite.adjusted_amount ?? penalite.amount;
}

/** Ajustée à la main, ou montant retenu différent du calcul initial. */
export function isPenaltyAdjusted(penalite: RentalPenalty): boolean {
  if (penalite.adjusted_amount != null) return true;
  return penalite.calculated_amount != null && penalite.calculated_amount !== penaltyRetainedAmount(penalite);
}

// Accesseurs STABLES (constantes de module) : le filtrage reste mémoïsé.
export const PENALTY_TEXT = [
  (p: RentalPenalty) => penaltyReason(p),
  (p: RentalPenalty) => penaltyJustificationName(p),
  (p: RentalPenalty) => `${p.days_late} jour${p.days_late > 1 ? 's' : ''}`
];

export const PENALTY_ACCESSORS = {
  periode: (p: RentalPenalty) => p.calculated_at,
  montant: (p: RentalPenalty) => penaltyRetainedAmount(p),
  ajustee: (p: RentalPenalty) => isPenaltyAdjusted(p),
  justificatif: (p: RentalPenalty) => hasJustification(p)
};

/** Critères déclarés dans le corps du composant (libellés vivants). */
export function penaltyCriteria(): SearchCriterion[] {
  return [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('Raison, justificatif, jours de retard…'),
      api: 'search'
    },
    { key: 'periode', type: 'dateRange', label: t('Calculée le'), primary: true, api: ['from', 'to'] },
    {
      key: 'ajustee',
      type: 'boolean',
      label: t('Ajustée'),
      primary: true,
      tristate: true,
      trueLabel: t('Ajustée'),
      falseLabel: t('Non ajustée'),
      api: 'adjusted'
    },
    { key: 'montant', type: 'numberRange', label: t('Montant retenu'), unit: 'FCFA', api: ['minAmount', 'maxAmount'] },
    {
      key: 'justificatif',
      type: 'boolean',
      label: t('Justificatif'),
      tristate: true,
      trueLabel: t('Avec justificatif'),
      falseLabel: t('Sans justificatif'),
      api: 'hasJustification'
    }
  ];
}
