import { useMemo, useRef } from 'react';
import { useLocalListSearch } from '../../../utils/list-search';
import { t } from '../../../i18n/t';

/** Ce que la recherche lit dans un mouvement du dépôt de garantie. */
interface MouvementRecherche {
  type: string;
  note: string | null;
  createdAt: string;
  payment: { method: string } | null;
  installment: { period: string } | null;
}

/**
 * Mouvements du dépôt reçus en entier : recherche locale, pagination locale de 20.
 * `libelleMethode` donne le libellé d'un moyen de paiement (lu à chaque appel, pour suivre
 * la langue) ; il est lu par référence pour garder des accesseurs stables, donc un filtrage
 * mémoïsé. `tableProps` s'étale sur la `Table` (page, pagination, barre, export complet).
 */
export function useDepositSearch<T extends MouvementRecherche>(
  mouvements: T[] | undefined,
  libelleMethode: (methode: string) => string
) {
  const libelleRef = useRef(libelleMethode);
  libelleRef.current = libelleMethode;

  const { text, accessors } = useMemo(
    () => ({
      text: [
        (m: T) => m.note,
        (m: T) => (m.payment ? libelleRef.current(m.payment.method) : ''),
        (m: T) => m.installment?.period
      ],
      accessors: {
        type: (m: T) => m.type,
        date: (m: T) => m.createdAt
      }
    }),
    []
  );

  const local = useLocalListSearch<T>(mouvements, {
    criteria: [
      { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Note, paiement, échéance…') },
      {
        key: 'type',
        type: 'multiSelect',
        label: t('Type'),
        primary: true,
        options: [
          { value: 'COLLECT', label: t('Collecte') },
          { value: 'HOLD', label: t('Mise en retenue') },
          { value: 'RELEASE', label: t('Libération') },
          { value: 'REFUND', label: t('Remboursement') },
          { value: 'FORFEIT', label: t('Confiscation') },
          { value: 'ADJUSTMENT', label: t('Ajustement') }
        ]
      },
      { key: 'date', type: 'dateRange', label: t('Date'), primary: true }
    ],
    text,
    accessors
  });
  return { ...local, tableProps: { ...local.tableProps, exportFetchAll: local.exportAll } };
}
