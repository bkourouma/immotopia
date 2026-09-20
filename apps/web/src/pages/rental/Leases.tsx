import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { App, Button, Input, Select, Space, Dropdown } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, SearchOutlined, MoreOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listLeases, deleteLease, RentalLease, RentalLeaseStatus } from '../../services/rental-service';
import { PropertyTransactionMode } from '../../types/property-types';
import { useListParams } from '../../hooks/useListParams';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { nomDuBien, nomDeLaPersonne, optionsLocatairesDesBaux } from '../../lib/rental-labels';
import {
  PageHeader,
  StateBlock,
  StatusTag,
  MoneyValue,
  DataView,
  DataCard,
  FilterSheet,
  useConfirmAction
} from '../../components/primitives';
import { t } from '../../i18n/t';

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

type Filtres = { q: string; status: string; primaryRenterClientId: string };
const FILTER_KEYS = ['q', 'status', 'primaryRenterClientId'] as const;

const STATUTS = [
  { value: 'DRAFT', label: t('Brouillon') },
  { value: 'ACTIVE', label: t('Actif') },
  { value: 'SUSPENDED', label: t('Suspendu') },
  { value: 'ENDED', label: t('Terminé') },
  { value: 'CANCELED', label: t('Annulé') }
];

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

  const list = useListParams<Filtres>({ filterKeys: FILTER_KEYS, defaultPageSize: 20 });

  /**
   * Le champ de recherche garde son texte le temps de la frappe, et l'URL n'est
   * écrite qu'après 250 ms de silence. Écrire à chaque caractère empilerait une
   * entrée d'historique par lettre.
   */
  const [saisie, setSaisie] = useState(list.filters.q ?? '');

  useEffect(() => {
    setSaisie(list.filters.q ?? '');
  }, [list.filters.q]);

  useEffect(() => {
    const courant = list.filters.q ?? '';
    if (saisie === courant) return;
    const minuteur = setTimeout(() => list.setFilters({ q: saisie || undefined }), 250);
    return () => clearTimeout(minuteur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saisie]);

  const {
    data,
    isPending,
    isFetching,
    error: erreur,
    refetch
  } = useQuery({
    queryKey: queryKey('leases', tenantId, list.queryParams),
    queryFn: () =>
      listLeases(tenantId as string, {
        search: list.filters.q || undefined,
        status: (list.filters.status as RentalLeaseStatus) || undefined,
        primaryRenterClientId: list.filters.primaryRenterClientId || undefined,
        page: list.page,
        limit: list.pageSize
      }),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  /**
   * Locataires du portefeuille, pour le filtre.
   *
   * Requête distincte, volontairement : dériver les options de la liste
   * affichée les réduirait au fur et à mesure qu'on filtre, et on ne pourrait
   * plus passer d'un locataire à l'autre sans effacer le filtre d'abord.
   */
  const { data: tousLesBaux } = useQuery({
    queryKey: queryKey('leases', tenantId, { pour: 'filtre-locataire' }),
    queryFn: () => listLeases(tenantId as string, { limit: 500 }),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  const optionsLocataires = React.useMemo(() => optionsLocatairesDesBaux(tousLesBaux?.data), [tousLesBaux]);

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
        subtitle={total > 0 ? `${total} ${total > 1 ? 'baux' : 'bail'} en gestion` : t('Gestion locative')}
        primaryAction={{
          label: t('Nouveau bail'),
          icon: <PlusOutlined />,
          onClick: () => navigate(`/tenant/${tenantId}/rental/leases/new`)
        }}
      />

      <div style={{ marginBottom: 'var(--space-4)' }}>
        <Input
          allowClear
          prefix={<SearchOutlined aria-hidden="true" />}
          placeholder={t('Rechercher par numéro de bail')}
          aria-label={t('Rechercher un bail')}
          value={saisie}
          onChange={evenement => setSaisie(evenement.target.value)}
        />
      </div>

      <FilterSheet
        activeCount={[list.filters.status, list.filters.primaryRenterClientId].filter(Boolean).length}
        onClear={() => list.setFilters({ status: undefined, primaryRenterClientId: undefined })}
        title={t('Filtrer les baux')}
      >
        <div style={{ minWidth: 240 }}>
          <label htmlFor="filtre-locataire-bail">{t('Locataire')}</label>
          <Select
            id="filtre-locataire-bail"
            style={{ width: '100%' }}
            placeholder={t('Tous les locataires')}
            allowClear
            showSearch
            optionFilterProp="label"
            value={list.filters.primaryRenterClientId || undefined}
            onChange={valeur => list.setFilters({ primaryRenterClientId: valeur })}
            options={optionsLocataires}
          />
        </div>
        <div style={{ minWidth: 220 }}>
          <label htmlFor="filtre-statut-bail">{t('Statut')}</label>
          <Select
            showSearch
            optionFilterProp="label"
            id="filtre-statut-bail"
            style={{ width: '100%' }}
            placeholder={t('Tous les statuts')}
            allowClear
            value={list.filters.status || undefined}
            onChange={valeur => list.setFilters({ status: valeur })}
            options={STATUTS}
          />
        </div>
      </FilterSheet>

      <DataView<RentalLease>
        // Six colonnes depuis que le locataire a la sienne : elles ne tiennent
        // plus dans les ~690 px utiles au plancher du desktop.
        scrollX={1080}
        items={baux}
        total={total}
        page={list.page}
        pageSize={list.pageSize}
        onPageChange={(page, taille) => (taille !== list.pageSize ? list.setPageSize(taille) : list.setPage(page))}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={erreur ? t('Impossible de charger les baux.') : null}
        onRetry={() => refetch()}
        isFiltered={list.isFiltered}
        onClearFilters={list.clearFilters}
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
