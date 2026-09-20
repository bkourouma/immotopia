import { CrmDealType } from '../types/crm-types';
import { t } from '../i18n/t';

/**
 * Get the French label for a deal type
 */
export function getDealTypeLabel(type: CrmDealType | string): string {
  const labels: Record<string, string> = {
    ACHAT: 'Achat',
    LOCATION: 'Location',
    VENTE: 'Vente',
    GESTION: t('Gestion de biens'),
    MANDAT: 'Mandat'
  };
  return labels[type] || type;
}
