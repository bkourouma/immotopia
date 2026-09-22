import React, { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { App, Input, Select, Row, Col, Slider, Button } from 'antd';
import { PlusOutlined, SearchOutlined, HomeOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listProperties, deleteProperty } from '../../services/property-service';
import type { Property } from '../../types/property-types';
import { useAuth } from '../../hooks/useAuth';
import { getAllCommunes, GeographicLocation } from '../../services/geographic-service';
import { PropertyNewsletterCampaignModal } from '../../components/newsletter/PropertyNewsletterCampaignModal';
import { fileUrl } from '../../config/api';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { useListParams } from '../../hooks/useListParams';
import { useBreakpoint } from '../../hooks/useBreakpoint';
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
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
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
};

/**
 * Types retirés du filtre, sans être retirés de `PROPERTY_TYPE_LABELS`.
 *
 * Le libellé doit rester : les cartes lisent la même table pour nommer le type
 * d'un bien, et l'en retirer afficherait « BOUTIQUE_COMMERCIAL » en clair sur
 * les fiches existantes. Seule l'offre du filtre se réduit.
 */
const TYPES_RETIRES: string[] = ['CHAMBRE_COLOCATION', 'BOUTIQUE_COMMERCIAL', 'LOT_PROGRAMME_NEUF'];

const TRANSACTION_MODE_LABELS: Record<string, string> = {
  SALE: 'Vente',
  RENTAL: 'Location',
  SHORT_TERM: t('Location courte durée')
};

/**
 * Les deux seuls statuts proposés au filtre.
 *
 * L'énumération en porte huit — brouillon, en révision, réservé, sous offre,
 * vendu, archivé — mais ce sont des états de cycle de vie, pas des questions
 * qu'on pose à un portefeuille locatif. Ils restent lisibles sur la fiche de
 * chaque bien, par `<StatusTag>` ; ils ne sont simplement plus offerts ici.
 */
const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Disponible',
  RENTED: t('Loué')
};

type Filters = {
  q: string;
  propertyType: string;
  transactionMode: string;
  status: string;
  city: string;
  minPrice: string;
  maxPrice: string;
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
  'minBedrooms',
  'maxBedrooms'
] as const;

/**
 * Borne haute du curseur des chambres, affichée « 10+ ».
 *
 * Au-delà, on ne filtre plus : aucun `maxBedrooms` ne part à l'API, sinon un
 * curseur poussé à fond exclurait justement les biens les plus grands.
 */
const CHAMBRES_MAX = 10;

/**
 * Les filtres avancés à valeur simple, hors curseurs.
 *
 * Seule la recherche plein texte reste hors du dépliant : c'est la porte
 * d'entrée de l'écran, elle doit être visible sans un clic préalable. Les
 * bornes de prix et de chambres sont comptées à part : chacune écrit deux
 * paramètres dans l'URL pour une seule question posée.
 */
const AVANCES_SIMPLES = [
  'propertyType',
  'transactionMode',
  'status',
  'city'
] as const satisfies readonly (keyof Filters)[];

/**
 * Paliers du curseur de prix.
 *
 * Le portefeuille va du loyer mensuel au prix de vente — 35 000 à 850 000 000
 * F CFA dans le jeu réel, quatre ordres de grandeur dans la même liste. Une
 * graduation linéaire écraserait toute la bande locative sur le premier pixel
 * de la piste : un curseur poussé d'un cran sauterait de zéro à quarante
 * millions, et aucun loyer ne serait atteignable.
 *
 * La barre porte donc l'indice du palier, pas le montant. Les paliers sont
 * resserrés là où les biens sont nombreux (50 000 à 1 M pour la location) et
 * s'espacent ensuite. Chacun est un montant rond, lisible sans conversion.
 */
const PALIERS_PRIX = [
  0, 50_000, 100_000, 150_000, 200_000, 300_000, 500_000, 750_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000,
  25_000_000, 50_000_000, 100_000_000, 200_000_000, 350_000_000, 500_000_000, 750_000_000, 1_000_000_000
];

/** Dernier palier : au-delà, on ne borne plus — comme « 10+ » pour les chambres. */
const PRIX_INDEX_MAX = PALIERS_PRIX.length - 1;

/** Index du palier le plus proche d'un montant, pour poser la poignée. */
function indexPrix(montant: number): number {
  let proche = 0;
  for (let i = 1; i < PALIERS_PRIX.length; i += 1) {
    if (Math.abs(PALIERS_PRIX[i] - montant) < Math.abs(PALIERS_PRIX[proche] - montant)) proche = i;
  }
  return proche;
}

/** Un montant en clair et court : « 150 000 », « 2,5 M », « 1 Md ». */
function montantCompact(montant: number): string {
  if (montant >= 1_000_000_000)
    return `${(montant / 1_000_000_000).toLocaleString(activeLocale(), { maximumFractionDigits: 1 })} Md`;
  if (montant >= 1_000_000)
    return `${(montant / 1_000_000).toLocaleString(activeLocale(), { maximumFractionDigits: 1 })} M`;
  return montant.toLocaleString(activeLocale());
}

/** Ce que dit le curseur de prix, en toutes lettres à côté de lui. */
function libellePrix([min, max]: [number, number], sansBorneHaute: boolean): string {
  if (min === 0 && sansBorneHaute) return t('Tous les prix');
  if (sansBorneHaute) return t('à partir de {{value}}', { value: montantCompact(min) });
  if (min === 0) return t("jusqu'à {{value}}", { value: montantCompact(max) });
  return `${montantCompact(min)} à ${montantCompact(max)}`;
}

/** Ce que dit le curseur, en toutes lettres à côté de lui. */
function libelleChambres([min, max]: [number, number]): string {
  if (min === 0 && max >= CHAMBRES_MAX) return 'Toutes';
  if (min === max) return `${min} chambre${min > 1 ? 's' : ''}`;
  const borneHaute = max >= CHAMBRES_MAX ? `${CHAMBRES_MAX}+` : String(max);
  return t('{{min}} à {{borneHaute}} chambres', { min: min, borneHaute: borneHaute });
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

  /**
   * Le curseur des chambres, lu depuis l'URL puis glissé localement.
   *
   * Même exception que le champ de recherche, et pour la même raison : écrire
   * dans l'URL à chaque cran parcouru empilerait une entrée d'historique par
   * pixel. L'URL est écrite au relâchement, et relue ici dès qu'elle change —
   * retour arrière et « Effacer les filtres » compris.
   */
  const chambresPosees = useMemo<[number, number]>(
    () => [
      Number(list.filters.minBedrooms) || 0,
      list.filters.maxBedrooms ? Number(list.filters.maxBedrooms) : CHAMBRES_MAX
    ],
    [list.filters.minBedrooms, list.filters.maxBedrooms]
  );
  const [chambresGlissees, setChambresGlissees] = useState<[number, number]>(chambresPosees);

  useEffect(() => {
    setChambresGlissees(chambresPosees);
  }, [chambresPosees]);

  const chambresFiltrees = chambresPosees[0] > 0 || chambresPosees[1] < CHAMBRES_MAX;

  /**
   * Le curseur de prix, sur le même modèle — sauf qu'il porte des indices de
   * palier et non des montants, `PALIERS_PRIX` expliquant pourquoi.
   */
  const prixPoses = useMemo<[number, number]>(
    () => [Number(list.filters.minPrice) || 0, Number(list.filters.maxPrice) || 0],
    [list.filters.minPrice, list.filters.maxPrice]
  );
  const prixSansBorneHaute = !list.filters.maxPrice;
  const prixIndexPoses = useMemo<[number, number]>(
    () => [indexPrix(prixPoses[0]), prixSansBorneHaute ? PRIX_INDEX_MAX : indexPrix(prixPoses[1])],
    [prixPoses, prixSansBorneHaute]
  );
  const [prixGlisses, setPrixGlisses] = useState<[number, number]>(prixIndexPoses);
  const [prixEnCoursDeGlissement, setPrixEnCoursDeGlissement] = useState(false);

  useEffect(() => {
    setPrixGlisses(prixIndexPoses);
  }, [prixIndexPoses]);

  /**
   * Ce que le libellé affiche : le palier sous la poignée pendant le
   * glissement, le montant qui filtre vraiment au repos.
   *
   * La nuance n'est pas cosmétique. Une URL écrite à la main peut porter un
   * montant qui ne tombe sur aucun palier — `minPrice=175000`. La poignée se
   * pose alors sur le palier le plus proche, mais afficher ce palier
   * reviendrait à annoncer un filtre qui n'est pas celui qui s'applique.
   */
  const prixLus: [number, number] = prixEnCoursDeGlissement
    ? [PALIERS_PRIX[prixGlisses[0]], PALIERS_PRIX[prixGlisses[1]]]
    : prixPoses;
  const prixLuSansBorneHaute = prixEnCoursDeGlissement ? prixGlisses[1] === PRIX_INDEX_MAX : prixSansBorneHaute;

  const prixFiltre = Boolean(list.filters.minPrice || list.filters.maxPrice);

  /**
   * Nombre de filtres avancés posés.
   *
   * Chaque curseur compte pour un, pas pour deux : il écrit bien deux
   * paramètres dans l'URL — `minPrice`/`maxPrice`, `minBedrooms`/`maxBedrooms`
   * — mais c'est une seule question posée à l'utilisateur, et un compteur qui
   * dirait « 2 » pour une poignée déplacée l'enverrait chercher un second
   * filtre inexistant.
   */
  const nbFiltresAvances =
    AVANCES_SIMPLES.filter(cle => list.filters[cle]).length + (prixFiltre ? 1 : 0) + (chambresFiltrees ? 1 : 0);

  /**
   * Un filtre posé ne reste jamais caché derrière un repli.
   *
   * C'est le défaut nommé au point 4 ci-dessus, que `<FilterSheet>` corrige
   * pour le panneau entier ; le replier à l'intérieur le réintroduirait. La
   * section s'ouvre donc d'elle-même quand l'URL porte un filtre, et le
   * déclencheur en affiche le compte quand elle est fermée.
   *
   * Sous 992 px, elle est ouverte d'emblée : `<FilterSheet>` y est déjà une
   * feuille qu'on a délibérément ouverte pour filtrer, et n'y trouver qu'un
   * bouton « Filtres avancés » coûterait une tape pour ne rien montrer.
   */
  const { isDesktop } = useBreakpoint();
  const [avancesOuverts, setAvancesOuverts] = useState(!isDesktop || nbFiltresAvances > 0);

  useEffect(() => {
    if (!isDesktop || nbFiltresAvances > 0) setAvancesOuverts(true);
  }, [isDesktop, nbFiltresAvances]);

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
        subtitle={total > 0 ? `${total} bien${total > 1 ? 's' : ''} au portefeuille` : undefined}
        primaryAction={{
          label: t('Ajouter un bien'),
          icon: <PlusOutlined />,
          onClick: () => navigate(`/tenant/${effectiveTenantId}/properties/new`)
        }}
      />

      <div style={{ marginBottom: 'var(--space-4)' }}>
        <Input
          allowClear
          prefix={<SearchOutlined aria-hidden="true" />}
          placeholder={t('Rechercher par titre, adresse ou référence')}
          aria-label={t('Rechercher un bien')}
          value={draftQuery}
          onChange={event => setDraftQuery(event.target.value)}
        />
      </div>

      <FilterSheet
        activeCount={Object.keys(list.filters).length}
        onClear={list.clearFilters}
        title={t('Filtrer les biens')}
      >
        <Row gutter={[12, 12]} style={{ width: '100%' }}>
          {/* Filtres avancés — tout sauf la recherche plein texte.
              La rangée déroulait huit contrôles en permanence, dont six champs
              numériques (surface, pièces, chambres, chacun en min et en max)
              qui demandaient deux saisies au clavier pour exprimer « trois
              chambres ». La surface disparaît, les pièces aussi : elles
              disaient la même chose que les chambres au bruit près, et doubler
              la question ne double pas la précision. Le reste passe derrière
              ce dépliant, et les chambres derrière une seule poignée à deux
              bouts qui montre les bornes disponibles au lieu de les faire
              deviner. */}
          <Col span={24}>
            <Button
              type="link"
              size="small"
              style={{ paddingInline: 0 }}
              aria-expanded={avancesOuverts}
              aria-controls="filtres-avances"
              icon={avancesOuverts ? <UpOutlined /> : <DownOutlined />}
              onClick={() => setAvancesOuverts(ouvert => !ouvert)}
            >
              {nbFiltresAvances > 0
                ? t('Filtres avancés ({{nbFiltresAvances}})', { nbFiltresAvances: nbFiltresAvances })
                : t('Filtres avancés')}
            </Button>
          </Col>
        </Row>

        <Row
          gutter={[12, 12]}
          id="filtres-avances"
          style={{ width: '100%', display: avancesOuverts ? undefined : 'none' }}
        >
          <Col xs={24} md={8} lg={6}>
            <label htmlFor="filtre-type">{t('Type de bien')}</label>
            <Select
              showSearch
              optionFilterProp="label"
              id="filtre-type"
              style={{ width: '100%' }}
              placeholder={t('Tous les types')}
              allowClear
              value={list.filters.propertyType || undefined}
              onChange={value => list.setFilters({ propertyType: value })}
              options={Object.entries(PROPERTY_TYPE_LABELS)
                .filter(([value]) => !TYPES_RETIRES.includes(value))
                .map(([value, label]) => ({ value, label }))}
            />
          </Col>
          <Col xs={24} md={8} lg={6}>
            <label htmlFor="filtre-transaction">{t('Transaction')}</label>
            <Select
              showSearch
              optionFilterProp="label"
              id="filtre-transaction"
              style={{ width: '100%' }}
              placeholder={t('Tous les modes')}
              allowClear
              value={list.filters.transactionMode || undefined}
              onChange={value => list.setFilters({ transactionMode: value })}
              options={Object.entries(TRANSACTION_MODE_LABELS).map(([value, label]) => ({ value, label }))}
            />
          </Col>
          <Col xs={24} md={8} lg={6}>
            <label htmlFor="filtre-statut">{t('Statut')}</label>
            <Select
              showSearch
              optionFilterProp="label"
              id="filtre-statut"
              style={{ width: '100%' }}
              placeholder={t('Tous les statuts')}
              allowClear
              value={list.filters.status || undefined}
              onChange={value => list.setFilters({ status: value })}
              options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
            />
          </Col>
          <Col xs={24} md={8} lg={6}>
            <label htmlFor="filtre-commune">{t('Commune')}</label>
            <Select
              id="filtre-commune"
              style={{ width: '100%' }}
              placeholder={t('Toutes les communes')}
              allowClear
              showSearch
              optionFilterProp="label"
              value={list.filters.city || undefined}
              onChange={value => list.setFilters({ city: value })}
              options={communeOptions}
            />
          </Col>

          <Col xs={24} md={12} lg={8}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
              <span>{t('Prix (F CFA)')}</span>
              <span style={{ color: 'var(--text-secondary)' }}>{libellePrix(prixLus, prixLuSansBorneHaute)}</span>
            </div>
            <Slider
              range
              min={0}
              max={PRIX_INDEX_MAX}
              step={1}
              value={prixGlisses}
              marks={{
                0: '0',
                [PALIERS_PRIX.indexOf(1_000_000)]: '1 M',
                [PALIERS_PRIX.indexOf(100_000_000)]: '100 M',
                [PRIX_INDEX_MAX]: '1 Md+'
              }}
              tooltip={{
                formatter: indice =>
                  indice === PRIX_INDEX_MAX ? t('Sans limite') : montantCompact(PALIERS_PRIX[indice ?? 0])
              }}
              ariaLabelForHandle={[t('Prix minimum'), t('Prix maximum')]}
              // Les poignées portent un indice de palier ; un lecteur d'écran
              // annoncerait « 8 sur 19 » sans ce formateur.
              ariaValueTextFormatterForHandle={indice =>
                indice === PRIX_INDEX_MAX ? t('Sans limite') : `${montantCompact(PALIERS_PRIX[indice])} francs CFA`
              }
              onChange={valeur => {
                setPrixEnCoursDeGlissement(true);
                setPrixGlisses(valeur as [number, number]);
              }}
              onChangeComplete={valeur => {
                const [min, max] = valeur as [number, number];
                setPrixEnCoursDeGlissement(false);
                list.setFilters({
                  minPrice: min > 0 ? String(PALIERS_PRIX[min]) : undefined,
                  // Poussé à fond, le curseur ne borne plus rien : envoyer le
                  // dernier palier écarterait les biens au-dessus d'un
                  // milliard, que « 1 Md+ » promet justement d'inclure.
                  maxPrice: max < PRIX_INDEX_MAX ? String(PALIERS_PRIX[max]) : undefined
                });
              }}
            />
          </Col>

          <Col xs={24} md={12} lg={8}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
              <span>{t('Chambres')}</span>
              <span style={{ color: 'var(--text-secondary)' }}>{libelleChambres(chambresGlissees)}</span>
            </div>
            <Slider
              range
              min={0}
              max={CHAMBRES_MAX}
              step={1}
              value={chambresGlissees}
              marks={{ 0: '0', 5: '5', [CHAMBRES_MAX]: `${CHAMBRES_MAX}+` }}
              tooltip={{ formatter: valeur => (valeur === CHAMBRES_MAX ? `${CHAMBRES_MAX}+` : String(valeur)) }}
              // Les deux poignées portent leur propre nom : « curseur » seul ne
              // dit pas à un lecteur d'écran laquelle des deux bornes il
              // déplace.
              ariaLabelForHandle={[t('Nombre de chambres minimum'), t('Nombre de chambres maximum')]}
              onChange={valeur => setChambresGlissees(valeur as [number, number])}
              onChangeComplete={valeur => {
                const [min, max] = valeur as [number, number];
                list.setFilters({
                  minBedrooms: min > 0 ? String(min) : undefined,
                  // Poussé à fond, le curseur ne borne plus rien : envoyer
                  // `maxBedrooms=10` écarterait les biens de onze chambres, que
                  // « 10+ » promet justement d'inclure.
                  maxBedrooms: max < CHAMBRES_MAX ? String(max) : undefined
                });
              }}
            />
          </Col>
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
        error={queryError ? t('Impossible de charger le portefeuille.') : null}
        onRetry={() => refetch()}
        isFiltered={list.isFiltered}
        onClearFilters={list.clearFilters}
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
              { label: 'Type', value: PROPERTY_TYPE_LABELS[property.propertyType] || property.propertyType },
              {
                label: 'Transaction',
                value: property.transactionModes?.map(mode => TRANSACTION_MODE_LABELS[mode] || mode).join(', ') || '—'
              },
              {
                label: 'Surface',
                value:
                  [
                    property.rooms ? t('{{rooms}} pièces', { rooms: property.rooms }) : null,
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
              { key: 'view', label: t('Voir la fiche'), onClick: () => navigate(detailPath(property.id)) },
              { key: 'newsletter', label: t('Diffuser en newsletter'), onClick: () => setNewsletterProperty(property) },
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
