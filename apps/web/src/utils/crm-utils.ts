import { CrmDealType } from '../types/crm-types';

/**
 * Get the French label for a deal type
 */
export function getDealTypeLabel(type: CrmDealType | string): string {
  const labels: Record<string, string> = {
    ACHAT: 'Achat',
    LOCATION: 'Location',
    VENTE: 'Vente',
    GESTION: 'Gestion de biens',
    MANDAT: 'Mandat',
  };
  return labels[type] || type;
}


