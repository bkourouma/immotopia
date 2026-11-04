import { useLocalListSearch } from '../../../utils/list-search';
import type { SearchCriterion } from '../../../utils/list-search';
import { t } from '../../../i18n/t';

interface DepositRow {
  propertyAddress: string;
  tenantName: string;
  status: string;
}

// Stables : déclarés HORS du hook (le filtrage local reste mémoïsé).
const TEXTE_RECHERCHE = [(deposit: DepositRow) => deposit.propertyAddress, (deposit: DepositRow) => deposit.tenantName];
const ACCESSEURS = { status: (deposit: DepositRow) => deposit.status };

/** Recherche locale des dépôts de garantie : texte (bien, locataire) et statut. */
export function useDepositsSearch<T extends DepositRow>(deposits: T[] | undefined) {
  const criteria: SearchCriterion[] = [
    { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Bien, locataire…') },
    {
      key: 'status',
      type: 'multiSelect',
      label: t('Statut'),
      primary: true,
      options: [
        { value: 'PENDING', label: t('En attente') },
        { value: 'COLLECTED', label: t('Collecté') },
        { value: 'HELD', label: t('En retenue') },
        { value: 'REFUNDED', label: t('Remboursé') },
        { value: 'FORFEITED', label: t('Confisqué') }
      ]
    }
  ];

  return useLocalListSearch<T>(deposits, {
    criteria,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS
  });
}
