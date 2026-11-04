import { useMemo } from 'react';
import { useLocalListSearch } from '../../../utils/list-search';
import type { SearchCriterion } from '../../../utils/list-search';
import type { OwnerMovement, OwnerPayout, PayoutMethod } from '../../../services/owner-portal-account-service';
import { t } from '../../../i18n/t';

interface AccountLists {
  payouts: OwnerPayout[];
  movements: OwnerMovement[];
}

const libelleBien = (m: OwnerMovement) => m.propertyTitle ?? m.leaseNumber ?? undefined;

// Stables : déclarés HORS du hook (le filtrage local reste mémoïsé).
const TEXTE_VERSEMENTS = [(p: OwnerPayout) => p.number, (p: OwnerPayout) => p.reference];
const ACCESSEURS_VERSEMENTS = {
  mode: (p: OwnerPayout) => p.method,
  statut: (p: OwnerPayout) => p.status,
  date: (p: OwnerPayout) => p.paidAt
};
const TEXTE_MOUVEMENTS = [
  (m: OwnerMovement) => m.label,
  (m: OwnerMovement) => m.propertyTitle,
  (m: OwnerMovement) => m.leaseNumber
];
const ACCESSEURS_MOUVEMENTS = {
  type: (m: OwnerMovement) => m.type,
  bien: libelleBien,
  date: (m: OwnerMovement) => m.date
};

/**
 * Recherche locale des deux listes de « Mon compte » : reversements (préfixe
 * `vs`) et mouvements (préfixe `mv`). Les libellés de mode et de type viennent
 * de l'écran, qui en reste propriétaire.
 */
export function useAccountSearch(
  compte: AccountLists | undefined,
  methodLabels: Record<PayoutMethod, string>,
  movementTypeLabels: Record<OwnerMovement['type'], string>
) {
  const payoutCriteria: SearchCriterion[] = [
    { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Numéro, référence…') },
    {
      key: 'mode',
      type: 'multiSelect',
      label: t('Mode'),
      primary: true,
      options: (Object.keys(methodLabels) as PayoutMethod[]).map(value => ({ value, label: methodLabels[value] }))
    },
    {
      key: 'statut',
      type: 'select',
      label: t('Statut'),
      primary: true,
      options: [
        { value: 'VALIDATED', label: t('Validé') },
        { value: 'VOIDED', label: t('Annulé') }
      ]
    },
    { key: 'date', type: 'dateRange', label: t('Date') }
  ];
  const payouts = useLocalListSearch<OwnerPayout>(compte?.payouts, {
    paramPrefix: 'vs',
    criteria: payoutCriteria,
    text: TEXTE_VERSEMENTS,
    accessors: ACCESSEURS_VERSEMENTS
  });

  const movementsList = compte?.movements;
  const biens = useMemo(() => {
    const noms = new Set<string>();
    for (const m of movementsList ?? []) {
      const nom = libelleBien(m);
      if (nom) noms.add(nom);
    }
    return Array.from(noms).map(nom => ({ value: nom, label: nom }));
  }, [movementsList]);
  const movementCriteria: SearchCriterion[] = [
    { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Libellé, bien, bail…') },
    {
      key: 'type',
      type: 'multiSelect',
      label: t('Type'),
      primary: true,
      options: (Object.keys(movementTypeLabels) as OwnerMovement['type'][]).map(value => ({
        value,
        label: movementTypeLabels[value]
      }))
    },
    { key: 'bien', type: 'select', label: t('Bien'), primary: true, options: biens },
    { key: 'date', type: 'dateRange', label: t('Date') }
  ];
  const movements = useLocalListSearch<OwnerMovement>(movementsList, {
    paramPrefix: 'mv',
    criteria: movementCriteria,
    text: TEXTE_MOUVEMENTS,
    accessors: ACCESSEURS_MOUVEMENTS
  });

  return {
    payoutsSearch: {
      ...payouts,
      search: { ...payouts.searchProps, 'aria-label': t('Rechercher dans les reversements') }
    },
    movementsSearch: {
      ...movements,
      search: { ...movements.searchProps, 'aria-label': t('Rechercher dans les mouvements') }
    }
  };
}
