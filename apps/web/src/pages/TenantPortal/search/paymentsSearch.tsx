import { useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Empty } from 'antd';
import { useListSearch } from '../../../hooks/useListSearch';
import { useLocalListSearch } from '../../../utils/list-search';
import type { SearchCriterion } from '../../../utils/list-search';
import type { ThirdPartyMovementLine } from '../../../types/finance-types';
import { natureLabel, NATURE_LABELS } from '../../finance/Releve';
import { t } from '../../../i18n/t';

/**
 * Recherche des trois onglets du portail locataire « Paiements » : échéances (`ech`),
 * historique (`his`) et relevé (`rel`). Le code de l'écran n'a plus qu'à appeler ces hooks.
 */

export const ONGLETS_PAIEMENTS = ['echeances', 'historique', 'releve'] as const;
export type OngletPaiements = (typeof ONGLETS_PAIEMENTS)[number];

/** Onglet lu dans l'adresse (`?tab=`) ; une valeur inconnue retombe sur les échéances. */
export function lireOnglet(valeur: string | null): OngletPaiements {
  return (ONGLETS_PAIEMENTS as readonly string[]).includes(valeur ?? '') ? (valeur as OngletPaiements) : 'echeances';
}

/**
 * Onglet actif (`?tab=`). `ongletRef` est lu par les rechargements asynchrones (retour
 * d'onglet, après paiement) : ils ne rechargent que la liste affichée.
 */
export function useOngletPaiements(): {
  ongletActif: OngletPaiements;
  ongletRef: MutableRefObject<OngletPaiements>;
  changerOnglet: (cle: string) => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const ongletActif = lireOnglet(searchParams.get('tab'));
  const ongletRef = useRef<OngletPaiements>(ongletActif);
  ongletRef.current = ongletActif;
  const changerOnglet = (cle: string) => {
    setSearchParams(
      precedent => {
        const suivant = new URLSearchParams(precedent);
        suivant.set('tab', lireOnglet(cle));
        return suivant;
      },
      { replace: true }
    );
  };
  return { ongletActif, ongletRef, changerOnglet };
}

/**
 * Une barre de recherche par onglet, chacune avec son préfixe d'adresse : les états ne
 * s'écrasent pas. Les API du portail ne trient pas (`sort: false`). Le nom accessible est
 * distinct par barre (plusieurs zones de recherche sur le même écran).
 */
export function useEcheancesSearch() {
  const search = useListSearch({
    paramPrefix: 'ech',
    apiNames: { sort: false },
    criteria: [
      { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Période, libellé…') },
      {
        key: 'status',
        type: 'multiSelect',
        label: t('Statut'),
        primary: true,
        options: [
          { value: 'PAID', label: t('Payé') },
          { value: 'DUE', label: t('Dû') },
          { value: 'OVERDUE', label: t('En retard') },
          { value: 'PARTIAL', label: t('Partiel') },
          { value: 'DRAFT', label: t('Brouillon') }
        ]
      },
      {
        key: 'due',
        type: 'dateRange',
        label: t("Date d'échéance"),
        primary: true,
        api: ['startDate', 'endDate']
      }
    ]
  });
  const barre = useMemo(
    () => ({ ...search.searchProps, 'aria-label': t('Rechercher dans les échéances') }),
    [search.searchProps]
  );
  // Sous critère, la Table affiche seule son bloc « Aucun résultat ».
  const locale = search.isFiltered ? undefined : { emptyText: <Empty description={t('Aucune échéance trouvée')} /> };
  return { ...search, barre, locale };
}

export function useHistoriqueSearch() {
  const search = useListSearch({
    paramPrefix: 'his',
    apiNames: { sort: false },
    criteria: [
      { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Référence, notes…') },
      {
        key: 'method',
        type: 'multiSelect',
        label: t('Méthode de paiement'),
        primary: true,
        options: [
          { value: 'CASH', label: t('Espèces') },
          { value: 'BANK_TRANSFER', label: t('Virement bancaire') },
          { value: 'MOBILE_MONEY', label: t('Mobile Money') },
          { value: 'DIRECT_DEBIT', label: t('Prélèvement bancaire') },
          { value: 'CHECK', label: t('Chèque') },
          { value: 'CARD', label: t('Carte bancaire') },
          { value: 'OTHER', label: t('Autre') }
        ]
      },
      { key: 'date', type: 'dateRange', label: t('Date'), primary: true, api: ['startDate', 'endDate'] }
    ]
  });
  const barre = useMemo(
    () => ({ ...search.searchProps, 'aria-label': t("Rechercher dans l'historique des paiements") }),
    [search.searchProps]
  );
  const locale = search.isFiltered ? undefined : { emptyText: <Empty description={t('Aucun paiement trouvé')} /> };
  return { ...search, barre, locale };
}

/** Mouvements du relevé : accesseurs stables (hors du composant) pour garder le filtrage mémoïsé. */
const TEXTE_RELEVE = [(m: ThirdPartyMovementLine) => m.label, (m: ThirdPartyMovementLine) => natureLabel(m.type)];
const ACCESSEURS_RELEVE = {
  nature: (m: ThirdPartyMovementLine) => m.type,
  date: (m: ThirdPartyMovementLine) => m.movementDate
};
const AUCUN_MOUVEMENT: ThirdPartyMovementLine[] = [];

/**
 * Relevé reçu en entier : recherche locale, état dans l'adresse (préfixe `rel`).
 * `tableProps` s'étale sur la `Table` (données de la page, pagination, barre, export).
 */
export function useReleveSearch(mouvements: ThirdPartyMovementLine[] | undefined) {
  const criteres: SearchCriterion[] = [
    { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Libellé, nature…') },
    {
      key: 'nature',
      type: 'multiSelect',
      label: t('Nature'),
      primary: true,
      options: (Object.keys(NATURE_LABELS) as ThirdPartyMovementLine['type'][]).map(type => ({
        value: type,
        label: natureLabel(type)
      }))
    },
    { key: 'date', type: 'dateRange', label: t('Date'), primary: true }
  ];
  const local = useLocalListSearch<ThirdPartyMovementLine>(mouvements ?? AUCUN_MOUVEMENT, {
    paramPrefix: 'rel',
    criteria: criteres,
    text: TEXTE_RELEVE,
    accessors: ACCESSEURS_RELEVE
  });
  const barre = useMemo(
    () => ({ ...local.searchProps, 'aria-label': t('Rechercher dans le relevé') }),
    [local.searchProps]
  );
  return { ...local, tableProps: { ...local.tableProps, search: barre, exportFetchAll: local.exportAll } };
}
