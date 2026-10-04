import {
  InspectionCondition,
  InspectionItem,
  InspectionItemKind,
  InspectionRoom
} from '../../../services/lease-inspections-service';
import { t } from '../../../i18n/t';

/**
 * Du meilleur au pire état : sert à la fois à l'affichage ordonné des boutons
 * et à détecter une dégradation entre l'entrée et la sortie (index plus grand
 * = état moins bon). « Manquant » vient en dernier mais n'est jamais une
 * dégradation : c'est un constat de présence, compté à part.
 */
export const CONDITION_ORDER: InspectionCondition[] = ['NEW', 'GOOD', 'FAIR', 'POOR', 'BROKEN', 'MISSING'];

/** Couleur de « Manquant », distincte du rouge de « HS » (CA-M2.4). */
export const MISSING_COLOR = '#722ed1';

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
    case 'MISSING':
      return MISSING_COLOR;
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
    case 'MISSING':
      return t('Manquant');
    default:
      return t('Non renseigné');
  }
}

/**
 * Vrai si l'état de sortie est strictement moins bon que celui d'entrée. Faux
 * dès que l'un des deux est « Manquant » : un manquant n'est pas un dégradé.
 */
export function isDegraded(
  entryCondition: InspectionCondition | null | undefined,
  exitCondition: InspectionCondition | null | undefined
): boolean {
  if (!entryCondition || !exitCondition) return false;
  if (entryCondition === 'MISSING' || exitCondition === 'MISSING') return false;
  return CONDITION_ORDER.indexOf(exitCondition) > CONDITION_ORDER.indexOf(entryCondition);
}

/** Vrai si l'objet manque à la sortie alors qu'il était là à l'entrée. */
export function isMissing(
  entryCondition: InspectionCondition | null | undefined,
  exitCondition: InspectionCondition | null | undefined
): boolean {
  return exitCondition === 'MISSING' && entryCondition !== 'MISSING';
}

/** Nature d'un élément ; un élément enregistré avant le volet meublés est du bâti. */
export function itemKind(item: Pick<InspectionItem, 'kind'>): InspectionItemKind {
  return item.kind === 'FURNITURE' ? 'FURNITURE' : 'FIXTURE';
}

/**
 * Élément évalué : état renseigné ; pour un mobilier non manquant, quantité
 * renseignée aussi. Même règle que la finalisation côté API (R5).
 */
export function isItemEvaluated(item: InspectionItem): boolean {
  if (!item.condition) return false;
  if (itemKind(item) === 'FURNITURE' && item.condition !== 'MISSING') {
    return item.quantity !== null && item.quantity !== undefined;
  }
  return true;
}

/** Ce qui manque à un élément non évalué, `null` s'il est évalué. */
export function unevaluatedReason(item: InspectionItem): 'CONDITION' | 'QUANTITY' | null {
  if (!item.condition) return 'CONDITION';
  return isItemEvaluated(item) ? null : 'QUANTITY';
}

/** Nombre d'éléments non évalués dans tout le document. */
export function countUnevaluated(rooms: InspectionRoom[]): number {
  return rooms.reduce((total, room) => total + room.items.filter(item => !isItemEvaluated(item)).length, 0);
}

/** Nombre total d'éléments dans le document. */
export function countItems(rooms: InspectionRoom[]): number {
  return rooms.reduce((total, room) => total + room.items.length, 0);
}

/** Écart d'un élément entre l'entrée et la sortie — même règle que la comparaison de l'API (R6). */
export interface ItemDifference {
  kind: InspectionItemKind;
  entryQuantity: number | null;
  exitQuantity: number | null;
  missing: boolean;
  degraded: boolean;
  quantityDecrease: number;
  /** Nombre d'objets manquants : tout l'élément s'il est manquant, sinon la baisse de quantité. */
  missingQuantity: number;
  /** Valeur de remplacement à l'unité, celle de l'entrée d'abord. */
  replacementValue: number | null;
}

export function compareItemPair(entryItem: InspectionItem, exitItem: InspectionItem): ItemDifference {
  const kind: InspectionItemKind = entryItem.kind ?? exitItem.kind ?? 'FIXTURE';
  const entryQuantity = kind === 'FURNITURE' ? (entryItem.quantity ?? null) : null;
  const exitQuantity =
    kind === 'FURNITURE' ? (exitItem.condition === 'MISSING' ? 0 : (exitItem.quantity ?? null)) : null;
  const missing = isMissing(entryItem.condition, exitItem.condition);
  const quantityDecrease =
    !missing && entryQuantity !== null && exitQuantity !== null ? Math.max(0, entryQuantity - exitQuantity) : 0;
  return {
    kind,
    entryQuantity,
    exitQuantity,
    missing,
    degraded: isDegraded(entryItem.condition, exitItem.condition),
    quantityDecrease,
    missingQuantity: missing ? (entryQuantity ?? 1) : quantityDecrease,
    replacementValue: entryItem.replacementValue ?? exitItem.replacementValue ?? null
  };
}
