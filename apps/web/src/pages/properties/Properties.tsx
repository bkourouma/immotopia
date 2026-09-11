import React, { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { App, Input, Select, Row, Col } from 'antd';
import { PlusOutlined, SearchOutlined, HomeOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listProperties, deleteProperty } from '../../services/property-service';
import type { Property } from '../../types/property-types';
import { useAuth } from '../../hooks/useAuth';
import { getAllCommunes, GeographicLocation } from '../../services/geographic-service';
import { PropertyNewsletterCampaignModal } from '../../components/newsletter/PropertyNewsletterCampaignModal';
import { fileUrl } from '../../config/api';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { useListParams } from '../../hooks/useListParams';
import {
  PageHeader,
  StateBlock,
  StatusTag,
  DataView,
  DataCard,
  FilterSheet,
  MoneyValue,
  useConfirmAction
} from '../../components/primitives';

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
 *    posé. `<FilterSheet>` le remplace et compte les filtres actifs.
 *
 * L'état vit dans l'URL : une recherche filtrée se partage par copier-coller,
 * et le retour depuis une fiche retrouve la page et les filtres.
 */

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  APPARTEMENT: 'Appartement',
  MAISON_VILLA: 'Maison / Villa',
  STUDIO: 'Studio',
  DUPLEX_TRIPLEX: 'Duplex / Triplex',
  CHAMBRE_COLOCATION: 'Chambre / Colocation',
  BUREAU: 'Bureau',
  BOUTIQUE_COMMERCIAL: 'Boutique / Commercial',
  ENTREPOT_INDUSTRIEL: 'Entrepôt / Industriel',
  TERRAIN: 'Terrain',
  IMMEUBLE: 'Immeuble',
  PARKING_BOX: 'Parking / Box',
  LOT_PROGRAMME_NEUF: 'Lot programme neuf'
};

const TRANSACTION_MODE_LABELS: Record<string, string> = {
  SALE: 'Vente',
  RENTAL: 'Location',
  SHORT_TERM: 'Location courte durée'
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  UNDER_REVIEW: 'En révision',
  AVAILABLE: 'Disponible',
  RESERVED: 'Réservé',
  UNDER_OFFER: 'Sous offre',
  RENTED: 'Loué',
  SOLD: 'Vendu',
  ARCHIVED: 'Archivé'
};

type Filters = {
  q: string;
  propertyType: string;
  transactionMode: string;
  status: string;
  city: string;
  minPrice: string;
  maxPrice: string;
  minSurface: string;
  maxSurface: string;
  minRooms: string;
  maxRooms: string;
  minBedrooms: string;
  maxBedrooms: string;
};

const FILTER_KEYS = [
  'q',
  'propertyType',
  'transactionMode',
  'status',
  'city',
  'minPrice',
  'maxPrice',
  'minSurface',
  'maxSurface',
  'minRooms',
  'maxRooms',
  'minBedrooms',
  'maxBedrooms'
] as const;

/** Ratio réservé : l'image ne doit pas décaler le texte en arrivant. */
const COVER_HEIGHT = 180;

function Cover({ property }: { property: Property }) {
  const src = property.thumbnailUrl ? fileUrl(property.thumbnailUrl) : null;

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
      onError={event => {
        event.currentTarget.style.visibility = 'hidden';
      }}
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

  const list = useListParams<Filters>({ filterKeys: FILTER_KEYS, defaultPageSize: 20 });
  const [newsletterProperty, setNewsletterProperty] = useState<Property | null>(null);

  /**
   * Le champ de recherche a son propre état, le temps de la frappe.
   *
   * C'est la seule exception à « l'URL est la source unique », et elle est
   * délibérée : écrire dans l'URL à chaque caractère empilerait une entrée
   * d'historique par lettre, et le retour arrière deviendrait inutilisable.
   * L'URL est écrite après 250 ms de silence (§8.4).
   */
  const [draftQuery, setDraftQuery] = useState(list.filters.q ?? '');

  useEffect(() => {
    setDraftQuery(list.filters.q ?? '');
  }, [list.filters.q]);

  useEffect(() => {
    const current = list.filters.q ?? '';
    if (draftQuery === current) return;
    const timer = setTimeout(() => list.setFilters({ q: draftQuery || undefined }), 250);
    return () => clearTimeout(timer);
    // `list` change à chaque rendu ; seul le texte doit relancer le minuteur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftQuery]);

  const { data: communes = [] } = useQuery({
    queryKey: queryKey('communes', null),
    queryFn: getAllCommunes,
    // Référentiel : les communes changent à l'échelle de l'année.
    staleTime: STALE_TIME.reference
  });

  const {
    data,
    isPending,
    isFetching,
    error: queryError,
    refetch
  } = useQuery({
    queryKey: queryKey('properties', effectiveTenantId, list.queryParams),
    queryFn: ({ signal }) => listProperties(effectiveTenantId as string, list.queryParams, { signal }),
    enabled: Boolean(effectiveTenantId),
    staleTime: STALE_TIME.list
  });

  const properties = data?.properties ?? [];
  const total = data?.pagination?.total ?? 0;

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

  const handleDelete = (property: Property) => {
    confirm({
      title: `Supprimer « ${property.title} » ?`,
      description: 'Cette action est irréversible.',
      okText: 'Supprimer',
      danger: true,
      onConfirm: async () => {
        try {
          await deleteProperty(effectiveTenantId as string, property.id);
          message.success('Bien supprimé.');
          // Invalidation par préfixe : toutes les pages et tous les jeux de
          // filtres de cette agence, sans avoir à les énumérer.
          await queryClient.invalidateQueries({ queryKey: ['properties', effectiveTenantId] });
        } catch (err: any) {
          message.error(err?.response?.data?.error || 'La suppression a échoué.');
        }
      }
    });
  };

  if (!effectiveTenantId) {
    return (
      <StateBlock
        variant="empty"
        title="Aucune agence sélectionnée"
        description="Votre compte doit être rattaché à une agence pour consulter son portefeuille."
      />
    );
  }

  const detailPath = (id: string) => `/tenant/${effectiveTenantId}/properties/${id}`;

  return (
    <>
      <PageHeader
        title="Biens"
        subtitle={total > 0 ? `${total} bien${total > 1 ? 's' : ''} au portefeuille` : undefined}
        primaryAction={{
          label: 'Ajouter un bien',
          icon: <PlusOutlined />,
          onClick: () => navigate(`/tenant/${effectiveTenantId}/properties/new`)
        }}
      />

      <div style={{ marginBottom: 'var(--space-4)' }}>
        <Input
          allowClear
          prefix={<SearchOutlined aria-hidden="true" />}
          placeholder="Rechercher par titre, adresse ou référence"
          aria-label="Rechercher un bien"
          value={draftQuery}
          onChange={event => setDraftQuery(event.target.value)}
        />
      </div>

      <FilterSheet activeCount={Object.keys(list.filters).length} onClear={list.clearFilters} title="Filtrer les biens">
        <Row gutter={[12, 12]} style={{ width: '100%' }}>
          <Col xs={24} md={8} lg={6}>
            <label htmlFor="filtre-type">Type de bien</label>
            <Select
              id="filtre-type"
              style={{ width: '100%' }}
              placeholder="Tous les types"
              allowClear
              value={list.filters.propertyType || undefined}
              onChange={value => list.setFilters({ propertyType: value })}
              options={Object.entries(PROPERTY_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
            />
          </Col>
          <Col xs={24} md={8} lg={6}>
            <label htmlFor="filtre-transaction">Transaction</label>
            <Select
              id="filtre-transaction"
              style={{ width: '100%' }}
              placeholder="Tous les modes"
              allowClear
              value={list.filters.transactionMode || undefined}
              onChange={value => list.setFilters({ transactionMode: value })}
              options={Object.entries(TRANSACTION_MODE_LABELS).map(([value, label]) => ({ value, label }))}
            />
          </Col>
          <Col xs={24} md={8} lg={6}>
            <label htmlFor="filtre-statut">Statut</label>
            <Select
              id="filtre-statut"
              style={{ width: '100%' }}
              placeholder="Tous les statuts"
              allowClear
              value={list.filters.status || undefined}
              onChange={value => list.setFilters({ status: value })}
              options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
            />
          </Col>
          <Col xs={24} md={8} lg={6}>
            <label htmlFor="filtre-commune">Commune</label>
            <Select
              id="filtre-commune"
              style={{ width: '100%' }}
              placeholder="Toutes les communes"
              allowClear
              showSearch
              optionFilterProp="label"
              value={list.filters.city || undefined}
              onChange={value => list.setFilters({ city: value })}
              options={communeOptions}
            />
          </Col>

          {(
            [
              ['minPrice', 'Prix minimum', '0'],
              ['maxPrice', 'Prix maximum', 'Illimité'],
              ['minSurface', 'Surface min (m²)', '0'],
              ['maxSurface', 'Surface max (m²)', 'Illimité'],
              ['minRooms', 'Pièces min', '0'],
              ['maxRooms', 'Pièces max', 'Illimité'],
              ['minBedrooms', 'Chambres min', '0'],
              ['maxBedrooms', 'Chambres max', 'Illimité']
            ] as const
          ).map(([key, label, placeholder]) => (
            <Col xs={12} md={8} lg={6} key={key}>
              <label htmlFor={`filtre-${key}`}>{label}</label>
              <Input
                id={`filtre-${key}`}
                type="number"
                inputMode="numeric"
                placeholder={placeholder}
                value={list.filters[key] ?? ''}
                onChange={event => list.setFilters({ [key]: event.target.value || undefined } as Partial<Filters>)}
              />
            </Col>
          ))}
        </Row>
      </FilterSheet>

      <DataView<Property>
        layout="grid"
        items={properties}
        total={total}
        page={list.page}
        pageSize={list.pageSize}
        onPageChange={(page, size) => {
          if (size !== list.pageSize) list.setPageSize(size);
          else list.setPage(page);
        }}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={queryError ? 'Impossible de charger le portefeuille.' : null}
        onRetry={() => refetch()}
        isFiltered={list.isFiltered}
        onClearFilters={list.clearFilters}
        emptyDescription="Aucun bien n'est encore enregistré pour cette agence."
        emptyAction={{
          label: 'Ajouter un bien',
          onClick: () => navigate(`/tenant/${effectiveTenantId}/properties/new`)
        }}
        rowKey={property => property.id}
        aria-label="Biens de l'agence"
        renderCard={property => (
          <DataCard
            cover={<Cover property={property} />}
            title={property.title}
            aria-label={property.title}
            subtitle={[property.address, property.locationZone].filter(Boolean).join(' • ')}
            status={<StatusTag status={property.status} />}
            highlight={
              property.propertyType === 'IMMEUBLE' ? undefined : (
                <MoneyValue value={property.price} currency={property.currency} />
              )
            }
            fields={[
              { label: 'Type', value: PROPERTY_TYPE_LABELS[property.propertyType] || property.propertyType },
              {
                label: 'Transaction',
                value: property.transactionModes?.map(mode => TRANSACTION_MODE_LABELS[mode] || mode).join(', ') || '—'
              },
              {
                label: 'Surface',
                value:
                  [
                    property.rooms ? `${property.rooms} pièces` : null,
                    property.bedrooms ? `${property.bedrooms} ch.` : null,
                    property.surfaceArea ? `${property.surfaceArea} m²` : null
                  ]
                    .filter(Boolean)
                    .join(' • ') || '—'
              }
            ]}
            onOpen={() => navigate(detailPath(property.id))}
            primaryAction={{
              label: 'Modifier',
              onClick: () => navigate(`${detailPath(property.id)}/edit`)
            }}
            secondaryActions={[
              { key: 'view', label: 'Voir la fiche', onClick: () => navigate(detailPath(property.id)) },
              { key: 'newsletter', label: 'Diffuser en newsletter', onClick: () => setNewsletterProperty(property) },
              { type: 'divider' },
              { key: 'delete', label: 'Supprimer', danger: true, onClick: () => handleDelete(property) }
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
