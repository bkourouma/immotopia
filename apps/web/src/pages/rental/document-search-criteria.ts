import type { SearchCriterion, SearchOption } from '../../utils/list-search';
import type { DocumentFilters } from '../../services/rental-service';
import { t } from '../../i18n/t';

/** Paramètres de recherche ajoutés à la liste des documents (non encore typés dans le service). */
export type DocumentSearchParams = DocumentFilters & { search?: string; from?: string; to?: string };

/**
 * Critères de la liste des documents de location (mode serveur).
 * `q` → `search` (numéro de document, titre, numéro de bail) ;
 * `emis` → `from` / `to` (date d'émission) ; `type` et `status` : un seul choix
 * (l'API n'accepte qu'une valeur).
 */
export function documentCriteria(typeOptions: SearchOption[], statusOptions: SearchOption[]): SearchCriterion[] {
  return [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('Numéro, titre, bail…')
    },
    { key: 'type', type: 'select', label: t('Type'), primary: true, options: typeOptions },
    { key: 'status', type: 'select', label: t('Statut'), primary: true, options: statusOptions },
    { key: 'emis', type: 'dateRange', label: t('Émis le'), api: ['from', 'to'] }
  ];
}
