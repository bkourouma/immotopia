import { useLocalListSearch } from '../../../utils/list-search';
import type { SearchCriterion } from '../../../utils/list-search';
import { t } from '../../../i18n/t';

interface PropertyRow {
  title: string;
  address: string;
}

// Stable : déclaré HORS du hook (le filtrage local reste mémoïsé).
const TEXTE_RECHERCHE = [(property: PropertyRow) => property.title, (property: PropertyRow) => property.address];

/** Recherche locale de la liste « Vos biens » du patrimoine : texte (bien, adresse). */
export function usePatrimoineSearch<T extends PropertyRow>(properties: T[] | undefined) {
  const criteria: SearchCriterion[] = [
    { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Bien, adresse…') }
  ];
  return useLocalListSearch<T>(properties, {
    criteria,
    text: TEXTE_RECHERCHE
  });
}
