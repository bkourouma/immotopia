import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useListSearch } from '../../../hooks/useListSearch';
import { queryKey, STALE_TIME } from '../../../lib/query-keys';
import { statementStatusLabel } from '../../../components/patrimoine/owner-statement-helpers';
import { getContact, listContacts } from '../../../services/crm-service';
import { listOwnerStatementsPage } from '../../../services/patrimoine-service';
import type { OwnerStatement } from '../../../types/patrimoine-types';
import type { DateRangeValue, SearchOption } from '../../../utils/list-search';
import { collectAllPages } from '../../../utils/table-export/collect';
import { t } from '../../../i18n/t';

const NO_STATEMENTS: OwnerStatement[] = [];

/** Libellé d'un propriétaire : le même dans la liste d'options et dans la puce. */
function ownerLabel(owner: { id: string; firstName?: string; lastName?: string; email?: string }): string {
  return `${owner.firstName ?? ''} ${owner.lastName ?? ''}`.trim() || owner.email || owner.id;
}

/**
 * Historique des relevés de gérance : recherche multicritères portée par
 * l'URL, liste paginée par le serveur (20 par page, sans tri serveur) et
 * export aligné sur les critères.
 *
 * `legacyUnpaidCount` vient du serveur : toute l'agence, hors critères et hors
 * pagination (relevés de l'ancien calcul qui ne sont pas payés).
 */
export function useOwnerStatementsList(tenantId: string | undefined) {
  const search = useListSearch({
    apiNames: { sort: false },
    criteria: [
      {
        key: 'q',
        type: 'text',
        label: t('Rechercher'),
        placeholder: t('Propriétaire, période, bien…')
      },
      {
        key: 'status',
        type: 'multiSelect',
        label: t('Statut'),
        primary: true,
        options: (['DRAFT', 'SENT', 'PAID'] as const).map(value => ({ value, label: statementStatusLabel(value) }))
      },
      {
        // Clés d'URL : periodFrom / periodTo (aaaa-mm-jj) ; l'API attend des mois (AAAA-MM).
        key: 'period',
        type: 'dateRange',
        label: t('Période'),
        primary: true,
        api: value => {
          const range = value as DateRangeValue;
          return {
            ...(range.from ? { periodFrom: range.from.slice(0, 7) } : {}),
            ...(range.to ? { periodTo: range.to.slice(0, 7) } : {})
          };
        }
      },
      {
        key: 'ownerContactId',
        type: 'select',
        label: t('Propriétaire'),
        loadOptions: async term => {
          const { contacts } = await listContacts(tenantId as string, { search: term || undefined, limit: 20 });
          // Limite connue : l'API des contacts n'a pas de filtre de rôle. On ne garde donc, en
          // local, que les propriétaires actifs parmi les 20 contacts reçus : un propriétaire
          // absent de ces 20 n'apparaît qu'en précisant la recherche.
          const owners: SearchOption[] = contacts
            .filter(contact => (contact.roles || []).some(role => role.active && role.role === 'PROPRIETAIRE'))
            .map(contact => ({ value: contact.id, label: ownerLabel(contact) }));
          if (owners.length > 0) return owners;
          // Aucun propriétaire : option inerte qui invite à affiner. Le type SearchOption n'a pas
          // de texte d'état vide ; `disabled` est transmis tel quel au sélecteur (besoin lot 0).
          const hint: SearchOption & { disabled: true } = {
            value: '',
            label: t('Aucun propriétaire parmi les contacts trouvés : précisez le nom.'),
            disabled: true
          };
          return [hint];
        },
        resolveLabel: async id => {
          const { data } = await getContact(tenantId as string, id);
          return ownerLabel(data);
        }
      },
      {
        key: 'legacy',
        type: 'boolean',
        label: t('Ancien calcul'),
        // Case à cocher : la fonction n'est appelée que pour la valeur active (vrai).
        api: () => ({ legacy: 'true' })
      }
    ]
  });

  const { data, isFetching, isPending, error, refetch } = useQuery({
    queryKey: queryKey('owner-statements', tenantId, search.apiParams),
    // L'API refuse une taille de page > 100 : un lien modifié à la main ne doit pas casser l'écran.
    queryFn: () =>
      listOwnerStatementsPage(tenantId as string, {
        ...search.apiParams,
        limit: Math.min(Number(search.apiParams.limit) || 20, 100)
      }),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list,
    placeholderData: keepPreviousData
  });

  const statements = useMemo(() => data?.items ?? NO_STATEMENTS, [data]);

  /** Export de TOUS les relevés qui correspondent aux critères, pas seulement la page. */
  const exportFetchAll = () =>
    collectAllPages<OwnerStatement>(async (page, limit) => {
      const result = await listOwnerStatementsPage(tenantId as string, { ...search.filterParams, page, limit });
      return { items: result.items, total: result.total };
    });

  return {
    search,
    statements,
    total: data?.total ?? 0,
    legacyUnpaidCount: data?.legacyUnpaidCount ?? 0,
    isFetching,
    isPending,
    error,
    refetch,
    exportFetchAll
  };
}
