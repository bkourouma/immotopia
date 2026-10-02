/**
 * La logique pure de fiabilité vit dans `lib/patrimoine/assets/stored-reliability`
 * (partagée avec le module Bien et la bascule de lot) ; ce fichier la réexporte
 * pour le service des actifs.
 */
export {
  computeStoredReliability,
  effectiveReliability,
  legalStatusOf
} from '../../lib/patrimoine/assets/stored-reliability';
export type { ReliabilityLine, ReliabilityView } from '../../lib/patrimoine/assets/stored-reliability';
