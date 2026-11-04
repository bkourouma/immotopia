import type { SearchCriterion, SearchOption } from '../../utils/list-search';
import { t } from '../../i18n/t';
import { localizedRecord } from '../../i18n/localized';

/**
 * Libellés et critères de recherche de la liste des biens.
 *
 * Les libellés vivent ici (et non dans `Properties.tsx`) pour que les critères
 * et les cartes lisent les mêmes tables sans import circulaire.
 */

export const PROPERTY_TYPE_LABELS: Record<string, string> = localizedRecord(() => ({
  APPARTEMENT: 'Appartement',
  MAISON_VILLA: t('Maison / Villa'),
  STUDIO: 'Studio',
  DUPLEX_TRIPLEX: t('Duplex / Triplex'),
  CHAMBRE_COLOCATION: t('Chambre / Colocation'),
  BUREAU: 'Bureau',
  BOUTIQUE_COMMERCIAL: t('Boutique / Commercial'),
  ENTREPOT_INDUSTRIEL: t('Entrepôt / Industriel'),
  TERRAIN: 'Terrain',
  IMMEUBLE: 'Immeuble',
  PARKING_BOX: t('Parking / Box'),
  LOT_PROGRAMME_NEUF: t('Lot programme neuf')
}));

/**
 * Types retirés du filtre, sans être retirés de `PROPERTY_TYPE_LABELS`.
 *
 * Le libellé doit rester : les cartes lisent la même table pour nommer le type
 * d'un bien, et l'en retirer afficherait « BOUTIQUE_COMMERCIAL » en clair sur
 * les fiches existantes. Seule l'offre du filtre se réduit.
 */
export const TYPES_RETIRES: string[] = ['CHAMBRE_COLOCATION', 'LOT_PROGRAMME_NEUF'];

export const TRANSACTION_MODE_LABELS: Record<string, string> = localizedRecord(() => ({
  SALE: 'Vente',
  RENTAL: 'Location',
  SHORT_TERM: t('Location courte durée')
}));

/**
 * Les deux seuls statuts proposés au filtre.
 *
 * L'énumération en porte huit — brouillon, en révision, réservé, sous offre,
 * vendu, archivé — mais ce sont des états de cycle de vie, pas des questions
 * qu'on pose à un portefeuille locatif. Ils restent lisibles sur la fiche de
 * chaque bien, par `<StatusTag>` ; ils ne sont simplement plus offerts ici.
 */
export const STATUS_LABELS: Record<string, string> = localizedRecord(() => ({
  AVAILABLE: 'Disponible',
  RENTED: t('Loué')
}));

/**
 * Critères de la liste des biens. À appeler dans le corps du composant (les
 * libellés passent par `t()`). Les clés d'URL historiques sont conservées :
 * q, propertyType, transactionMode, status, city, minPrice/maxPrice et
 * minBedrooms/maxBedrooms. L'API de la liste attend `q` (et non `search`).
 *
 * Il n'y a plus de « 10+ chambres » : sans borne haute saisie, aucun
 * `maxBedrooms` ne part à l'API, ce qui garde la même promesse.
 */
export function propertySearchCriteria(communeOptions: readonly SearchOption[]): SearchCriterion[] {
  const options = (labels: Record<string, string>, exclus: readonly string[] = []): SearchOption[] =>
    Object.entries(labels)
      .filter(([value]) => !exclus.includes(value))
      .map(([value, label]) => ({ value, label }));

  return [
    {
      key: 'q',
      type: 'text',
      api: 'q',
      label: t('Rechercher'),
      placeholder: t('Titre, adresse ou référence')
    },
    {
      key: 'propertyType',
      type: 'select',
      label: t('Type de bien'),
      placeholder: t('Tous les types'),
      primary: true,
      options: options(PROPERTY_TYPE_LABELS, TYPES_RETIRES)
    },
    {
      key: 'transactionMode',
      type: 'select',
      label: t('Transaction'),
      placeholder: t('Tous les modes'),
      primary: true,
      options: options(TRANSACTION_MODE_LABELS)
    },
    {
      key: 'status',
      type: 'select',
      label: t('Statut'),
      placeholder: t('Tous les statuts'),
      options: options(STATUS_LABELS)
    },
    {
      key: 'city',
      type: 'select',
      label: t('Commune'),
      placeholder: t('Toutes les communes'),
      options: communeOptions
    },
    {
      key: 'price',
      type: 'numberRange',
      label: t('Prix'),
      unit: 'FCFA',
      urlKeys: ['minPrice', 'maxPrice'],
      api: ['minPrice', 'maxPrice']
    },
    {
      key: 'bedrooms',
      type: 'numberRange',
      label: t('Chambres'),
      urlKeys: ['minBedrooms', 'maxBedrooms'],
      api: ['minBedrooms', 'maxBedrooms']
    }
  ];
}
