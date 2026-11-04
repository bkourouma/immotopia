import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { App, Button, Space, Dropdown } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, MoreOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { listLeases, deleteLease, RentalLease, LeaseFilters } from '../../services/rental-service';
import { PropertyTransactionMode } from '../../types/property-types';
import { useListSearch } from '../../hooks/useListSearch';
import { propertyCriterion, renterCriterion } from './rental-search-criteria';
import { collectAllPages } from '../../utils/table-export/collect';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { nomDuBien, nomDeLaPersonne } from '../../lib/rental-labels';
import {
  PageHeader,
  StateBlock,
  StatusTag,
  MoneyValue,
  DataView,
  DataCard,
  useConfirmAction
} from '../../components/primitives';
import { t } from '../../i18n/t';
import { localizedList } from '../../i18n/localized';

import { activeLocale } from '../../i18n/format';
/**
 * Baux — l'entrée du module de gestion locative (REFONTE_UI_UX.md §5.1).
 *
 * Quatre défauts nommés par la spécification, tous corrigés :
 *
 * **Deux déclencheurs pour une seule recherche.** Le champ appelait `onChange`
 * — qui relançait l'effet — ET `onSearch` sur validation, qui relançait la même
 * requête. Taper puis appuyer sur Entrée, le geste naturel, faisait deux
 * allers-retours. Un seul déclencheur demeure, avec 250 ms de silence (§8.4).
 *
 * **Huit colonnes derrière `scroll={{ x: 'max-content' }}`.** Cinq désormais :
 * le bien et le locataire tiennent dans la même colonne, puisqu'ils se lisent
 * ensemble, et les dates de début et de fin forment une période.
 *
 * **La pagination vivait dans une `Card` séparée**, sous le tableau, alors que
 * les trois autres écrans du module l'intègrent. `<DataView>` la rend, à la
 * même place partout.
 *
 * **Trois actions en icône seule.** Une action nommée et un menu « ⋮ ».
 *
 * `handleStatusChange`, défini et jamais appelé, est retiré — le troisième de
 * ce lot.
 */

const STATUTS = localizedList(() => [
  { value: 'DRAFT', label: t('Brouillon') },
  { value: 'ACTIVE', label: t('Actif') },
  { value: 'SUSPENDED', label: t('Suspendu') },
  { value: 'ENDED', label: t('Terminé') },
  { value: 'CANCELED', label: t('Annulé') }
]);

function dateCourte(iso?: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(activeLocale());
}

/**
 * Montant de référence du bail.
 *
 * Un bien uniquement en vente n'a pas de loyer : c'est son prix qui fait foi.
 * La règle existait déjà et elle est juste ; elle est simplement nommée.
 */
function montantDeReference(bail: RentalLease): { montant: number; devise: string } {
  const modes = bail.property?.transactionModes ?? [];
  const venteSeule =
    modes.includes(PropertyTransactionMode.SALE) &&
    !modes.includes(PropertyTransactionMode.RENTAL) &&
    !modes.includes(PropertyTransactionMode.SHORT_TERM);

  return {
    montant: venteSeule ? (bail.property?.price ?? 0) : bail.rent_amount,
    devise: bail.property?.currency || bail.currency
  };
}

export const Leases: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirmAction = useConfirmAction();

  const search = useListSearch({
    // Pas de tri serveur sur cette liste : le paramètre `sort` n'est pas envoyé.
    apiNames: { sort: false },
    criteria: [
      { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('N° de bail, bien, locataire…'), api: 'search' },
      { key: 'status', type: 'select', label: t('Statut'), primary: true, options: STATUTS },
      renterCriterion(tenantId, { api: 'primaryRenterClientId', primary: true }),
      propertyCriterion(tenantId, { api: 'propertyId' })
    ]
  });

  const {
    data,
    isPending,
    isFetching,
    error: erreur,
    refetch
  } = useQuery({
    queryKey: queryKey('leases', tenantId, search.apiParams),
    queryFn: () => listLeases(tenantId as string, search.apiParams as LeaseFilters),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list,
    placeholderData: keepPreviousData
  });

  const baux = data?.data ?? [];
  const total = data?.pagination?.total ?? 0;

  const handleDelete = (bail: RentalLease) => {
    if (!tenantId) return;
    confirmAction({
      title: t('Supprimer le bail {{lease_number}} ?', { lease_number: bail.lease_number }),
      description: t('{{value}} · {{value2}}. Cette action est irréversible.', {
        value: nomDuBien(bail.property),
        value2: nomDeLaPersonne(bail.primaryRenter?.user)
      }),
      okText: t('Supprimer'),
      danger: true,
      onConfirm: async () => {
        try {
          await deleteLease(tenantId, bail.id);
          await queryClient.invalidateQueries({ queryKey: ['leases', tenantId] });
          message.success(t('Bail supprimé.'));
        } catch (err: any) {
          message.error(err?.response?.data?.message || t('La suppression a échoué.'));
        }
      }
    });
  };

  if (!tenantId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  const cheminDetail = (id: string) => `/tenant/${tenantId}/rental/leases/${id}`;

  const actionsSecondaires = (bail: RentalLease) => [
    { key: 'edit', label: t('Modifier le bail'), onClick: () => navigate(`${cheminDetail(bail.id)}/edit`) },
    { type: 'divider' as const },
    { key: 'del', label: t('Supprimer'), danger: true, onClick: () => handleDelete(bail) }
  ];

  const colonnes: ColumnsType<RentalLease> = [
    {
      title: t('Bail'),
      key: 'bail',
      width: 260,
      // Le rendu empile deux lignes sans séparateur : on l'écrit en une.
      exportValue: bail => `${bail.lease_number} — ${nomDuBien(bail.property)}`,
      render: (_, bail) => (
        <>
          <div style={{ fontWeight: 600 }}>{bail.lease_number}</div>
          {/* Le bien sous son numéro. Le locataire a sa propre colonne : on
              filtre dessus, il doit se lire seul. */}
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            {nomDuBien(bail.property)}
          </div>
        </>
      )
    },
    {
      title: t('Locataire'),
      key: 'locataire',
      width: 170,
      render: (_, bail) => nomDeLaPersonne(bail.primaryRenter?.user)
    },
    {
      title: t('Période'),
      key: 'periode',
      render: (_, bail) => `${dateCourte(bail.start_date)} → ${dateCourte(bail.end_date)}`
    },
    {
      title: t('Montant'),
      key: 'montant',
      align: 'end',
      // Nombre pur : Excel peut le sommer ; la devise vit dans la liste.
      exportValue: bail => montantDeReference(bail).montant,
      render: (_, bail) => {
        const { montant, devise } = montantDeReference(bail);
        return <MoneyValue value={montant} currency={devise} />;
      }
    },
    { title: t('Statut'), key: 'statut', render: (_, bail) => <StatusTag status={bail.status} /> },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, bail) => (
        <Space>
          <Button type="link" onClick={() => navigate(cheminDetail(bail.id))}>
            {t('Voir')}
          </Button>
          {/* Le même menu qu'en carte. Sans lui, modifier et supprimer
              n'existeraient plus du tout au-dessus de 992 px. */}
          <Dropdown menu={{ items: actionsSecondaires(bail) }} trigger={['click']} placement="bottomRight">
            <Button
              icon={<MoreOutlined />}
              aria-label={t('Autres actions pour le bail {{lease_number}}', { lease_number: bail.lease_number })}
            />
          </Dropdown>
        </Space>
      )
    }
  ];

  return (
    <>
      <PageHeader
        title={t('Baux')}
        subtitle={
          total > 0
            ? total > 1
              ? t('{{count}} baux en gestion', { count: total })
              : t('{{count}} bail en gestion', { count: total })
            : t('Gestion locative')
        }
        primaryAction={{
          label: t('Nouveau bail'),
          icon: <PlusOutlined />,
          onClick: () => navigate(`/tenant/${tenantId}/rental/leases/new`)
        }}
      />

      <DataView<RentalLease>
        // Export de TOUS les baux, avec les mêmes filtres que la liste affichée.
        export={{
          filename: t('Baux'),
          fetchAll: () =>
            collectAllPages<RentalLease>(async (page, limit) => {
              const reponse = await listLeases(tenantId, { ...search.filterParams, page, limit } as LeaseFilters);
              return { items: reponse.data ?? [], total: reponse.pagination?.total ?? 0 };
            })
        }}
        // Six colonnes depuis que le locataire a la sienne : elles ne tiennent
        // plus dans les ~690 px utiles au plancher du desktop.
        scrollX={1080}
        items={baux}
        total={total}
        search={search.searchProps}
        {...search.dataViewProps}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={erreur ? t('Impossible de charger les baux.') : null}
        errorCause={erreur}
        onRetry={() => refetch()}
        emptyDescription={t("Aucun bail n'est encore enregistré pour cette agence.")}
        emptyAction={{
          label: t('Créer un bail'),
          onClick: () => navigate(`/tenant/${tenantId}/rental/leases/new`)
        }}
        columns={colonnes}
        rowKey={bail => bail.id}
        aria-label={t("Baux de l'agence")}
        renderCard={bail => {
          const { montant, devise } = montantDeReference(bail);
          return (
            <DataCard
              title={bail.lease_number}
              aria-label={t('Bail {{lease_number}}, {{value}}', {
                lease_number: bail.lease_number,
                value: nomDuBien(bail.property)
              })}
              subtitle={`${nomDuBien(bail.property)} · ${nomDeLaPersonne(bail.primaryRenter?.user)}`}
              status={<StatusTag status={bail.status} />}
              highlight={<MoneyValue value={montant} currency={devise} />}
              fields={[{ label: t('Période'), value: `${dateCourte(bail.start_date)} → ${dateCourte(bail.end_date)}` }]}
              onOpen={() => navigate(cheminDetail(bail.id))}
              secondaryActions={actionsSecondaires(bail)}
            />
          );
        }}
      />
    </>
  );
};
