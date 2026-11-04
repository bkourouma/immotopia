import React, { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { App } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, HomeOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { listProperties, deleteProperty, updateStatus } from '../../services/property-service';
import { blocageSuppression } from './property-delete-error';
import type { Property } from '../../types/property-types';
import { useAuth } from '../../hooks/useAuth';
import { getAllCommunes, GeographicLocation } from '../../services/geographic-service';
import { PropertyNewsletterCampaignModal } from '../../components/newsletter/PropertyNewsletterCampaignModal';
import { fileUrl } from '../../config/api';
import { collectAllPages } from '../../utils/table-export/collect';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { useListSearch } from '../../hooks/useListSearch';
import { propertySearchCriteria, PROPERTY_TYPE_LABELS, TRANSACTION_MODE_LABELS } from './property-search-criteria';
import {
  PageHeader,
  StateBlock,
  StatusTag,
  DataView,
  DataCard,
  MoneyValue,
  statusLabel,
  useConfirmAction
} from '../../components/primitives';
import { t } from '../../i18n/t';

/**
 * Liste des biens — premier des six écrans hybrides du §9.7.
 *
 * L'écran cumulait quatre défauts nommés par la spécification, tous corrigés
 * ici :
 *
 * 1. **Dix filtres appliqués dans le navigateur** (`:153-206` de l'ancienne
 *    version) sur la page déjà reçue — vingt biens — pendant que le compteur
 *    venait du serveur. La liste et son compteur se contredisaient, et un bien
 *    pouvait exister sans jamais apparaître. Tout part désormais à l'API.
 * 2. **Une requête `/media` par carte affichée** (`:248-276`), soit jusqu'à
 *    vingt requêtes pour une page. Remplacée par `thumbnailUrl`, que le
 *    endpoint de liste résout en une requête groupée.
 * 3. **Quatre actions par carte en icône seule**, `type="link"` avec un `title`
 *    HTML natif : sans nom accessible, et trop serrées pour le doigt. Une seule
 *    action explicite subsiste, le reste passe derrière « ⋮ ».
 * 4. **Un `<Collapse>` de filtres dans le flux**, qui poussait la liste hors de
 *    l'écran sur mobile et ne disait rien, une fois replié, d'un filtre resté
 *    posé. `ListSearch` le remplace et compte les critères actifs.
 *
 * L'état vit dans l'URL : une recherche filtrée se partage par copier-coller,
 * et le retour depuis une fiche retrouve la page et les filtres.
 */

/**
 * Colonnes de l'export : la liste est en cartes, sans colonnes à elle. Texte pur,
 * prix et surface en nombres pour qu'Excel puisse les trier et les sommer.
 */
function colonnesExport(): ColumnsType<Property> {
  return [
    { title: t('Référence'), key: 'reference', exportValue: p => p.internalReference },
    { title: t('Titre'), key: 'titre', exportValue: p => p.title },
    { title: t('Type'), key: 'type', exportValue: p => PROPERTY_TYPE_LABELS[p.propertyType] || p.propertyType },
    {
      title: t('Transaction'),
      key: 'transaction',
      exportValue: p => p.transactionModes?.map(mode => TRANSACTION_MODE_LABELS[mode] || mode).join(', ') || ''
    },
    { title: t('Statut'), key: 'statut', exportValue: p => statusLabel(p.status) ?? p.status },
    { title: t('Adresse'), key: 'adresse', exportValue: p => p.address },
    { title: t('Zone'), key: 'zone', exportValue: p => p.locationZone },
    { title: t('Prix'), key: 'prix', exportValue: p => (p.propertyType === 'IMMEUBLE' ? null : p.price) },
    { title: t('Surface (m²)'), key: 'surface', exportValue: p => p.surfaceArea },
    { title: t('Pièces'), key: 'pieces', exportValue: p => p.rooms },
    { title: t('Chambres'), key: 'chambres', exportValue: p => p.bedrooms }
  ];
}

/** Ratio réservé : l'image ne doit pas décaler le texte en arrivant. */
const COVER_HEIGHT = 180;

function Cover({ property }: { property: Property }) {
  // Une image dont le chargement échoue doit retomber sur le substitut, pas
  // laisser un vide : la carte garderait sa hauteur réservée sans rien montrer,
  // ce qui ressemble à un défaut d'affichage plutôt qu'à un bien sans photo.
  const [enEchec, setEnEchec] = useState(false);
  const src = property.thumbnailUrl && !enEchec ? fileUrl(property.thumbnailUrl) : null;

  if (!src) {
    return (
      <div
        style={{
          height: COVER_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--surface-sunken)'
        }}
      >
        {/* Décoratif : le titre du bien porte déjà l'information. */}
        <HomeOutlined aria-hidden="true" style={{ fontSize: 40, color: 'var(--text-tertiary)' }} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      style={{ height: COVER_HEIGHT, width: '100%', objectFit: 'cover', display: 'block' }}
      onError={() => setEnEchec(true)}
    />
  );
}

export const Properties: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { tenantMembership } = useAuth();
  const queryClient = useQueryClient();
  const confirm = useConfirmAction();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  const [newsletterProperty, setNewsletterProperty] = useState<Property | null>(null);

  const { data: communes = [] } = useQuery({
    queryKey: queryKey('communes', null),
    queryFn: getAllCommunes,
    // Référentiel : les communes changent à l'échelle de l'année.
    staleTime: STALE_TIME.reference
  });

  const communeOptions = useMemo(
    () =>
      communes.map((commune: GeographicLocation) => ({
        // La valeur envoyée à l'API est le NOM, pas l'identifiant : le filtre
        // serveur cherche dans l'adresse et la zone de localisation, qui sont
        // du texte libre.
        value: commune.commune,
        label: `${commune.commune} — ${commune.region}`
      })),
    [communes]
  );

  // Recherche multicritères (guide docs/architecture/recherche-listes.md). Les clés d'URL
  // historiques sont conservées (q, propertyType, transactionMode, status, city,
  // minPrice/maxPrice, minBedrooms/maxBedrooms) : les liens existants restent valides.
  const search = useListSearch({
    ariaLabel: t('Rechercher un bien'),
    criteria: propertySearchCriteria(communeOptions)
  });

  const {
    data,
    isPending,
    isFetching,
    error: queryError,
    refetch
  } = useQuery({
    queryKey: queryKey('properties', effectiveTenantId, search.apiParams),
    queryFn: ({ signal }) => listProperties(effectiveTenantId as string, search.apiParams, { signal }),
    enabled: Boolean(effectiveTenantId),
    staleTime: STALE_TIME.list,
    placeholderData: keepPreviousData
  });

  const properties = data?.properties ?? [];
  const total = data?.pagination?.total ?? 0;

  const handleDelete = (property: Property) => {
    confirm({
      title: t('Supprimer « {{title}} » ?', { title: property.title }),
      description: t('Cette action est irréversible.'),
      okText: t('Supprimer'),
      danger: true,
      onConfirm: async () => {
        try {
          await deleteProperty(effectiveTenantId as string, property.id);
          message.success(t('Bien supprimé.'));
          // Invalidation par préfixe : toutes les pages et tous les jeux de
          // filtres de cette agence, sans avoir à les énumérer.
          await queryClient.invalidateQueries({ queryKey: ['properties', effectiveTenantId] });
        } catch (err: any) {
          const blocage = blocageSuppression(err);
          if (blocage) {
            // Refus métier : le message liste les blocages ; l'archivage est
            // l'alternative (le bien sort de la liste active et du quota LOTS).
            confirm({
              title: t('Suppression impossible'),
              description: blocage,
              okText: t('Archiver ce bien'),
              onConfirm: async () => {
                try {
                  await updateStatus(effectiveTenantId as string, property.id, 'ARCHIVED');
                  message.success(t('Bien archivé.'));
                  await queryClient.invalidateQueries({ queryKey: ['properties', effectiveTenantId] });
                } catch (archiveError: any) {
                  message.error(
                    archiveError?.response?.data?.message ||
                      archiveError?.response?.data?.error ||
                      t("L'archivage a échoué.")
                  );
                }
              }
            });
            return;
          }
          message.error(err?.response?.data?.error || t('La suppression a échoué.'));
        }
      }
    });
  };

  if (!effectiveTenantId) {
    return (
      <StateBlock
        variant="empty"
        title={t('Aucune agence sélectionnée')}
        description={t('Votre compte doit être rattaché à une agence pour consulter son portefeuille.')}
      />
    );
  }

  const detailPath = (id: string) => `/tenant/${effectiveTenantId}/properties/${id}`;

  return (
    <>
      <PageHeader
        title={t('Biens')}
        subtitle={
          total > 0
            ? total > 1
              ? t('{{count}} biens au portefeuille', { count: total })
              : t('{{count}} bien au portefeuille', { count: total })
            : undefined
        }
        primaryAction={{
          label: t('Ajouter un bien'),
          icon: <PlusOutlined />,
          onClick: () => navigate(`/tenant/${effectiveTenantId}/properties/new`)
        }}
      />

      <DataView<Property>
        layout="grid"
        // Export de TOUS les biens, avec les mêmes filtres que la liste affichée.
        export={{
          filename: t("Biens de l'agence"),
          columns: colonnesExport(),
          fetchAll: () =>
            collectAllPages<Property>(async (page, limit) => {
              const reponse = await listProperties(effectiveTenantId as string, {
                ...search.filterParams,
                page,
                limit
              });
              return { items: reponse.properties ?? [], total: reponse.pagination?.total ?? 0 };
            })
        }}
        items={properties}
        total={total}
        search={search.searchProps}
        {...search.dataViewProps}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={queryError ? t('Impossible de charger le portefeuille.') : null}
        errorCause={queryError}
        onRetry={() => refetch()}
        emptyDescription={t("Aucun bien n'est encore enregistré pour cette agence.")}
        emptyAction={{
          label: t('Ajouter un bien'),
          onClick: () => navigate(`/tenant/${effectiveTenantId}/properties/new`)
        }}
        rowKey={property => property.id}
        aria-label={t("Biens de l'agence")}
        renderCard={property => (
          <DataCard
            cover={<Cover property={property} />}
            title={property.title}
            aria-label={property.title}
            subtitle={[property.address, property.locationZone].filter(Boolean).join(' • ')}
            status={<StatusTag status={property.status} />}
            highlight={
              property.propertyType === 'IMMEUBLE' ? undefined : (
                // Sans `currency`, `MoneyValue` ecrit « FCFA ». Le lui passer
                // affichait la valeur STOCKEE en base — « CFA » —, qui n'est
                // pas la notation retenue partout ailleurs dans le produit.
                <MoneyValue value={property.price} />
              )
            }
            fields={[
              { label: t('Type'), value: PROPERTY_TYPE_LABELS[property.propertyType] || property.propertyType },
              {
                label: t('Transaction'),
                value: property.transactionModes?.map(mode => TRANSACTION_MODE_LABELS[mode] || mode).join(', ') || '—'
              },
              {
                label: t('Surface'),
                value:
                  [
                    property.rooms ? t('{{rooms}} pièces', { rooms: property.rooms }) : null,
                    property.bedrooms ? t('{{count}} ch.', { count: property.bedrooms }) : null,
                    property.surfaceArea ? `${property.surfaceArea} m²` : null
                  ]
                    .filter(Boolean)
                    .join(' • ') || '—'
              }
            ]}
            onOpen={() => navigate(detailPath(property.id))}
            primaryAction={{
              label: t('Modifier'),
              onClick: () => navigate(`${detailPath(property.id)}/edit`)
            }}
            secondaryActions={[
              { key: 'view', label: t('Voir la fiche'), onClick: () => navigate(detailPath(property.id)) },
              { key: 'newsletter', label: t('Diffuser en newsletter'), onClick: () => setNewsletterProperty(property) },
              { type: 'divider' },
              { key: 'delete', label: t('Supprimer'), danger: true, onClick: () => handleDelete(property) }
            ]}
          />
        )}
      />

      {newsletterProperty && (
        <PropertyNewsletterCampaignModal
          open
          onClose={() => setNewsletterProperty(null)}
          tenantId={effectiveTenantId}
          property={newsletterProperty}
          imageUrls={newsletterProperty.thumbnailUrl ? [fileUrl(newsletterProperty.thumbnailUrl)] : []}
        />
      )}
    </>
  );
};
