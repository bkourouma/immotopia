import { InspectionCondition } from '../../../services/lease-inspections-service';
import { t } from '../../../i18n/t';

/**
 * Du meilleur au pire état : sert à la fois à l'affichage ordonné des boutons
 * et à détecter une dégradation entre l'entrée et la sortie (index plus grand
 * = état moins bon).
 */
export const CONDITION_ORDER: InspectionCondition[] = ['NEW', 'GOOD', 'FAIR', 'POOR', 'BROKEN'];

/**
 * Couleur associée à chaque état, du vert au rouge. Fonction et non constante
 * de module : comme les couleurs ne sont pas traduites, elles pourraient être
 * statiques, mais on garde la même forme que `conditionLabel` pour que les deux
 * évoluent ensemble.
 */
export function conditionColor(condition: InspectionCondition): string {
  switch (condition) {
    case 'NEW':
      return '#389e0d';
    case 'GOOD':
      return '#73d13d';
    case 'FAIR':
      return '#faad14';
    case 'POOR':
      return '#fa8c16';
    case 'BROKEN':
      return '#f5222d';
    default:
      return '#d9d9d9';
  }
}

/**
 * Libellé de l'état, calculé à chaque appel et non mémorisé au niveau du
 * module : `t()` doit lire la langue courante, qui peut changer sans recharger
 * la page (voir `apps/web/src/i18n/t.ts`).
 */
export function conditionLabel(condition: InspectionCondition | null | undefined): string {
  switch (condition) {
    case 'NEW':
      return t('Neuf');
    case 'GOOD':
      return t('Bon');
    case 'FAIR':
      return t('Usagé');
    case 'POOR':
      return t('Mauvais');
    case 'BROKEN':
      return t('HS');
    default:
      return t('Non renseigné');
  }
}

/** Vrai si l'état de sortie est strictement moins bon que celui d'entrée. */
export function isDegraded(
  entryCondition: InspectionCondition | null | undefined,
  exitCondition: InspectionCondition | null | undefined
): boolean {
  if (!entryCondition || !exitCondition) return false;
  return CONDITION_ORDER.indexOf(exitCondition) > CONDITION_ORDER.indexOf(entryCondition);
}
