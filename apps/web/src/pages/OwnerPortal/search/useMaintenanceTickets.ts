import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ownerPortalService } from '../../../services/ownerPortalService';
import type { OwnerPortalPagination } from '../../../services/ownerPortalService';
import { useListSearch } from '../../../hooks/useListSearch';
import { STALE_TIME } from '../../../lib/query-keys';
import { collectAllPages } from '../../../utils/table-export/collect';
import { t } from '../../../i18n/t';
import { useOwnerPropertyOptions } from '../useOwnerPropertyOptions';

interface TicketsPage {
  tickets: unknown[];
  pagination?: OwnerPortalPagination;
}

/**
 * Liste des tickets de maintenance du portail propriétaire : recherche paginée
 * par le serveur (statut, priorité, catégorie, propriété), chargement et export.
 */
export function useMaintenanceTickets<TData extends TicketsPage>() {
  const { options: propertyOptions } = useOwnerPropertyOptions();

  // Liste paginée par le serveur ; l'API ne trie pas (`sort: false`).
  const search = useListSearch({
    apiNames: { sort: false },
    criteria: [
      { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Titre, propriété…') },
      {
        key: 'status',
        type: 'multiSelect',
        label: t('Statut'),
        primary: true,
        options: [
          { value: 'DECLARED', label: t('Déclaré') },
          { value: 'IN_PROGRESS', label: t('En cours') },
          { value: 'ASSIGNED', label: t('Assigné') },
          { value: 'RESOLVED', label: t('Résolu') },
          { value: 'CANCELED', label: t('Annulé') }
        ]
      },
      {
        key: 'priority',
        type: 'multiSelect',
        label: t('Priorité'),
        primary: true,
        options: [
          { value: 'LOW', label: t('Basse') },
          { value: 'MEDIUM', label: t('Moyenne') },
          { value: 'HIGH', label: t('Haute') },
          { value: 'URGENT', label: t('Urgente') }
        ]
      },
      {
        key: 'category',
        type: 'multiSelect',
        label: t('Catégorie'),
        options: [
          { value: 'PLUMBING', label: t('Plomberie') },
          { value: 'ELECTRICITY', label: t('Électricité') },
          { value: 'AC', label: t('Climatisation') },
          { value: 'OTHER', label: t('Autre') }
        ]
      },
      {
        key: 'propertyId',
        type: 'select',
        label: t('Propriété'),
        options: propertyOptions
      }
    ]
  });

  const {
    data,
    isPending,
    isFetching,
    error: queryError,
    refetch
  } = useQuery({
    queryKey: ['owner-portal', 'maintenance', search.apiParams],
    queryFn: async (): Promise<TData | null> => {
      const response = await ownerPortalService.getMaintenanceTickets(search.apiParams);
      return response.data?.success && response.data?.data ? (response.data.data as TData) : null;
    },
    staleTime: STALE_TIME.list,
    placeholderData: keepPreviousData
  });

  const loadError: string | null = queryError
    ? (queryError as any).response?.data?.message || t('Erreur lors du chargement des tickets')
    : null;
  const tickets = (data?.tickets ?? []) as TData['tickets'];
  const total = data?.pagination?.total ?? tickets.length;

  const exportAll = () =>
    collectAllPages<TData['tickets'][number]>(async (page, limit) => {
      const response = await ownerPortalService.getMaintenanceTickets({
        ...search.filterParams,
        page,
        limit
      });
      const result = response.data?.data as TData | undefined;
      return { items: result?.tickets ?? [], total: result?.pagination?.total ?? 0 };
    });

  return {
    search,
    data,
    tickets,
    total,
    isPending,
    loading: isFetching,
    loadError,
    loadTickets: () => refetch(),
    exportAll
  };
}
