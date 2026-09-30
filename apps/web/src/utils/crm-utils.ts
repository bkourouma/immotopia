import { CrmDealType } from '../types/crm-types';
import { dealTypeLabel } from './crm-labels';

/**
 * Libellé français d'un type d'affaire (délègue au module central
 * `crm-labels`).
 */
export function getDealTypeLabel(type: CrmDealType | string): string {
  return dealTypeLabel(type);
}
