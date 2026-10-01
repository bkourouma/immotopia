import React, { Suspense, lazy, useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  Card,
  Button,
  Space,
  Row,
  Col,
  Typography,
  Alert,
  Spin,
  Image,
  Carousel,
  Descriptions,
  Empty,
  Tabs,
  Badge
} from 'antd';
import type { DescriptionsProps, MenuProps, TabsProps } from 'antd';
import {
  EditOutlined,
  FileTextOutlined,
  HomeOutlined,
  EnvironmentOutlined,
  CalendarOutlined,
  PictureOutlined,
  PlayCircleOutlined,
  ToolOutlined,
  MailOutlined,
  BankOutlined,
  ProfileOutlined,
  ApartmentOutlined,
  FolderOpenOutlined,
  SolutionOutlined,
  SafetyCertificateOutlined,
  BookOutlined
} from '@ant-design/icons';
import { Property, PropertyMedia, PropertyMediaType } from '../../types/property-types';
import { getProperty } from '../../services/property-service';
import apiClient from '../../utils/api-client';
import { useAuth } from '../../hooks/useAuth';
import { useAgencyFeatures } from '../../hooks/useAgencyFeatures';
import { useOwnAssetsOnly } from '../../hooks/useMenuAccess';
import { PropertyVisitScheduler } from '../../components/properties/PropertyVisitScheduler';
import { PropertyMaintenanceTab } from '../../components/properties/PropertyMaintenanceTab';
import { PropertyApartments } from '../../components/properties/PropertyApartments';
import { PropertyNewsletterCampaignModal } from '../../components/newsletter/PropertyNewsletterCampaignModal';
import { PropertyPatrimoineTab } from '../../components/patrimoine/PropertyPatrimoineTab';
import { PropertyHoldingTaxSection } from '../../components/patrimoine/entities/PropertyHoldingTaxSection';
import { PropertyOwnershipCard } from '../../components/properties/PropertyOwnershipCard';
import { PropertySaleCard } from '../../components/properties/PropertySaleCard';
import { PropertyDocumentsTab } from '../../components/properties/PropertyDocumentsTab';
import { PropertyMandatesTab } from '../../components/properties/PropertyMandatesTab';
import { API_URL } from '../../config/api';

import { PageHeader, StatusTag } from '../../components/primitives';
import { t } from '../../i18n/t';
import { activeLocale } from '../../i18n/format';

const PropertyInsuranceTab = lazy(() =>
  import('../../components/insurance/PropertyInsuranceTab').then(m => ({ default: m.PropertyInsuranceTab }))
);
const PropertyMaintenanceLogTab = lazy(() =>
  import('../../components/insurance/PropertyMaintenanceLogTab').then(m => ({ default: m.PropertyMaintenanceLogTab }))
);
const { Text, Title } = Typography;

/**
 * Fiche d'un bien, en onglets.
 *
 * L'écran empilait auparavant huit cartes sur deux colonnes : galerie,
 * description, caractéristiques, lots, un `<Tabs>` interne pour maintenance et
 * patrimoine, puis prix, informations, localisation et planificateur de visite.
 * Tout était monté d'un coup et il fallait défiler sur plus de trois hauteurs
 * d'écran pour atteindre la maintenance — deux colonnes de longueurs très
 * inégales, dont la plus courte laissait un vide de plusieurs centaines de
 * pixels.
 *
 * Les onglets répondent à une question chacun :
 *
 *   - **Aperçu** — ce que le bien EST : description, caractéristiques,
 *     informations administratives, localisation ;
 *   - **Médias** — photos et vidéos, avec leur compte sur l'onglet ;
 *   - **Lots** — les appartements, pour un IMMEUBLE seulement ;
 *   - **Maintenance** et **Patrimoine** — les deux onglets qui existaient déjà,
 *     remontés au niveau de l'écran plutôt qu'enterrés dans une carte en bas
 *     de colonne ;
 *   - **Visites** — la planification.
 *
 * Deux propriétés valent d'être notées :
 *
 * **Le prix et les chiffres clés ne sont dans aucun onglet.** Ils identifient
 * le bien autant que son titre : les cacher derrière un onglet obligerait à
 * revenir sur « Aperçu » pour lire un prix pendant qu'on regarde les photos.
 * Ils tiennent dans un bandeau posé sous l'en-tête, toujours visible.
 *
 * **L'onglet courant est dans l'URL** (`?onglet=medias`). Un lien vers la
 * maintenance d'un bien est ainsi partageable, le retour arrière revient à
 * l'onglet quitté, et un rechargement ne ramène pas sur « Aperçu ».
 */

const TYPE_LABELS: Record<string, string> = {
  APPARTEMENT: 'Appartement',
  MAISON_VILLA: t('Maison / Villa'),
  STUDIO: 'Studio',
  DUPLEX_TRIPLEX: t('Duplex / Triplex'),
  CHAMBRE_COLOCATION: t('Chambre en colocation'),
  BUREAU: 'Bureau',
  BOUTIQUE_COMMERCIAL: t('Boutique / Local commercial'),
  ENTREPOT_INDUSTRIEL: t('Entrepôt / Local industriel'),
  TERRAIN: 'Terrain',
  IMMEUBLE: 'Immeuble',
  PARKING_BOX: t('Parking / Box'),
  LOT_PROGRAMME_NEUF: t('Lot de programme neuf')
};

const TRANSACTION_LABELS: Record<string, string> = {
  SALE: 'Vente',
  RENTAL: 'Location',
  SHORT_TERM: t('Court terme')
};

const FURNISHING_LABELS: Record<string, string> = {
  FURNISHED: t('Meublé'),
  UNFURNISHED: t('Non meublé'),
  PARTIALLY_FURNISHED: t('Partiellement meublé')
};

const AVAILABILITY_LABELS: Record<string, string> = {
  AVAILABLE: 'Disponible',
  UNAVAILABLE: 'Indisponible',
  SOON_AVAILABLE: t('Bientôt disponible')
};

/**
 * Qui possède le bien.
 *
 * Quatre cas dans l'ordre de priorité, inchangés : le propriétaire chargé fait
 * toujours foi, puis le type de détention décide de ce qu'on affiche à défaut.
 * La logique était une fonction anonyme de quarante lignes au milieu du JSX ;
 * elle est nommée ici, à comportement identique.
 */
function proprietaireAffiche(property: Property): string {
  if (property.owner && (property.owner.fullName || property.owner.email)) {
    return property.owner.fullName || property.owner.email;
  }

  if (property.ownershipType === 'TENANT') {
    if (property.ownerUserId) return property.owner?.email || t('Propriétaire sélectionné');
    const tenant = (property as unknown as { tenant?: { name?: string } }).tenant;
    return tenant?.name || 'Agence';
  }

  if (property.ownershipType === 'PUBLIC') {
    if (property.ownerUserId) return property.owner?.email || property.owner?.fullName || t('Propriétaire privé');
    return 'Publique';
  }

  if (property.ownershipType === 'CLIENT') {
    if (property.ownerUserId) return property.owner?.fullName || property.owner?.email || 'Client';
    return 'Client';
  }

  return 'Agence';
}

/**
 * Le vrai propriétaire, quand il n'est écrit que dans la description.
 *
 * 80 des 91 biens de la base portent, en fin de description, une phrase de la
 * forme « Propriétaire : Arsène Djédjé (contact CRM 2fb9a016-…). » — écrite par
 * l'import, pas par l'interface. Deux conséquences, toutes deux visibles à
 * l'écran :
 *
 *   - un UUID s'affiche tel quel dans le corps de la description, où il ne veut
 *     rien dire pour personne ;
 *   - `ownerUserId` ne pointe PAS cette personne. Sur les 80 biens concernés il
 *     désigne le même compte collaborateur — celui qui a fait l'import — si
 *     bien que la ligne « Propriété de » affichait un propriétaire faux avec
 *     aplomb, contredit deux paragraphes plus haut par la description.
 *
 * On lit donc la phrase plutôt que de l'ignorer : le nom alimente « Propriété
 * de » et renvoie vers la fiche du contact, et la phrase sort du corps de la
 * description, qui retrouve son propos. C'est un CONTOURNEMENT : `Property`
 * n'a aucun lien vers `CrmContact`, la correction durable est un champ dédié
 * plus une reprise des données.
 */
const MOTIF_PROPRIETAIRE = /\n*\s*Propriétaire\s*:\s*(.+?)\s*\(contact CRM\s+([0-9a-fA-F-]{36})\)\s*\.?\s*$/;

function proprietaireDecrit(description?: string): { nom: string; contactId: string } | null {
  if (!description) return null;
  const trouve = description.match(MOTIF_PROPRIETAIRE);
  return trouve ? { nom: trouve[1].trim(), contactId: trouve[2] } : null;
}

/** La description sans la phrase technique de fin. */
function descriptionUtile(description?: string): string {
  if (!description) return '';
  return description.replace(MOTIF_PROPRIETAIRE, '').trim();
}

/** Un chiffre clé du bandeau de synthèse. */
const ChiffreCle: React.FC<{ valeur: React.ReactNode; libelle: string }> = ({ valeur, libelle }) => (
  <div>
    <div
      style={{
        fontSize: 'var(--font-size-h3)',
        fontWeight: 'var(--font-weight-semibold)' as unknown as number,
        color: 'var(--text-primary)',
        lineHeight: 1.2
      }}
    >
      {valeur}
    </div>
    <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
      {libelle}
    </Text>
  </div>
);

export const PropertyDetail: React.FC = () => {
  const { tenantId, id } = useParams<{ tenantId: string; id: string }>();
  const navigate = useNavigate();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;
  // Une fonctionnalité non souscrite n'est ni appelée (403) ni proposée.
  const { has: possede } = useAgencyFeatures(effectiveTenantId);
  // Pack « détenu en propre » : pas d'indivision avec un tiers (l'API la refuse).
  const ownAssetsOnly = useOwnAssetsOnly(effectiveTenantId, true);
  const [searchParams, setSearchParams] = useSearchParams();

  const [property, setProperty] = useState<Property | null>(null);
  const [media, setMedia] = useState<PropertyMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newsletterModalOpen, setNewsletterModalOpen] = useState(false);

  useEffect(() => {
    if (effectiveTenantId && id) {
      loadProperty();
    } else {
      setError(t('Paramètres manquants'));
      setLoading(false);
    }
  }, [effectiveTenantId, id]);

  const loadProperty = async () => {
    if (!effectiveTenantId || !id) return;

    setLoading(true);
    setError(null);
    try {
      const data = await getProperty(effectiveTenantId, id);
      setProperty(data);
      await loadMedia();
    } catch (err: any) {
      setError(err.response?.data?.error || t('Erreur lors du chargement de la propriété'));
    } finally {
      setLoading(false);
    }
  };

  const loadMedia = async () => {
    if (!effectiveTenantId || !id) return;
    try {
      const response = await apiClient.get<{ success: boolean; data: PropertyMedia[] }>(
        `/tenants/${effectiveTenantId}/properties/${id}/media`
      );
      const allMedia = response.data.data || [];
      const sortedMedia = allMedia.sort((a, b) => {
        if (a.isPrimary) return -1;
        if (b.isPrimary) return 1;
        return a.displayOrder - b.displayOrder;
      });
      setMedia(sortedMedia);
    } catch (err) {
      console.error('Error loading media:', err);
    }
  };

  const getMediaUrl = (item: PropertyMedia) => {
    if (item.fileUrl) {
      if (item.fileUrl.startsWith('http')) {
        return item.fileUrl;
      }
      const apiBaseUrl = API_URL;
      const baseUrl = apiBaseUrl.replace('/api', '');
      return `${baseUrl}${item.fileUrl}`;
    }
    return '';
  };

  const formatPrice = (price?: number, currency?: string, propertyType?: string) => {
    if (!price) return propertyType === 'IMMEUBLE' ? '' : t('Prix sur demande');
    const formatted = new Intl.NumberFormat(activeLocale()).format(price);
    return `${formatted} ${currency || 'EUR'}`;
  };

  if (!effectiveTenantId) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0' }}>
        <Text type="secondary">{t('Aucune agence sélectionnée')}</Text>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error || !property) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0' }}>
        <Alert
          message={t('Erreur')}
          description={error || t('Propriété non trouvée')}
          type="error"
          showIcon
          action={
            <Button onClick={() => navigate(`/tenant/${effectiveTenantId}/properties`)}>
              {t('Retour à la liste')}
            </Button>
          }
        />
      </div>
    );
  }

  const photos = media.filter(m => m.mediaType === PropertyMediaType.PHOTO);
  const videos = media.filter(m => m.mediaType === PropertyMediaType.VIDEO);
  const estImmeuble = property.propertyType === 'IMMEUBLE';
  const contactProprietaire = proprietaireDecrit(property.description);

  /* ------------------------------------------------------------------ */
  /* Onglet « Aperçu »                                                   */
  /* ------------------------------------------------------------------ */

  /**
   * Caractéristiques physiques. Les champs vides sont RETIRÉS, pas rendus avec
   * un tiret : une fiche de terrain n'a ni chambre ni salle de bain, et vingt
   * lignes « — » enterreraient les trois qui portent l'information.
   */
  const caracteristiques: DescriptionsProps['items'] = [
    property.surfaceArea ? { key: 'surface', label: t('Surface'), children: `${property.surfaceArea} m²` } : null,
    property.surfaceUseful
      ? { key: 'surfaceUseful', label: t('Surface utile'), children: `${property.surfaceUseful} m²` }
      : null,
    property.surfaceTerrain
      ? { key: 'surfaceTerrain', label: t('Surface du terrain'), children: `${property.surfaceTerrain} m²` }
      : null,
    property.rooms ? { key: 'rooms', label: t('Pièces'), children: property.rooms } : null,
    property.bedrooms ? { key: 'bedrooms', label: t('Chambres'), children: property.bedrooms } : null,
    property.bathrooms ? { key: 'bathrooms', label: t('Salles de bain'), children: property.bathrooms } : null,
    property.furnishingStatus
      ? {
          key: 'furnishing',
          label: t('Ameublement'),
          children: FURNISHING_LABELS[property.furnishingStatus] || property.furnishingStatus
        }
      : null
  ].filter(Boolean) as DescriptionsProps['items'];

  const informations: DescriptionsProps['items'] = [
    { key: 'reference', label: t('Référence'), children: property.internalReference || '—' },
    {
      key: 'type',
      label: t('Type de bien'),
      children: TYPE_LABELS[property.propertyType] || property.propertyType
    },
    {
      key: 'owner',
      label: t('Propriété de'),
      // Le contact nommé par la description l'emporte sur `ownerUserId` : c'est
      // la seule des deux sources qui désigne le vrai propriétaire du bien.
      children: contactProprietaire ? (
        <Link to={`/tenant/${effectiveTenantId}/crm/contacts/${contactProprietaire.contactId}`}>
          {contactProprietaire.nom}
        </Link>
      ) : (
        proprietaireAffiche(property)
      )
    },
    {
      key: 'transaction',
      label: t('Mise en marché'),
      children: property.transactionModes.map(mode => TRANSACTION_LABELS[mode] || mode).join(' • ') || '—'
    },
    {
      key: 'availability',
      label: t('Disponibilité'),
      children: AVAILABILITY_LABELS[property.availability] || property.availability
    }
    // Ni « Publication », ni « Créé le », ni « Dernière modification ». La
    // première est déjà portée par l'étiquette « Publié » de l'en-tête, visible
    // depuis n'importe quel onglet ; les deux autres sont des métadonnées de
    // base de données, pas des informations sur le bien. La carte ne garde que
    // ce qui le décrit.
  ];

  const localisation: DescriptionsProps['items'] = [
    { key: 'address', label: t('Adresse'), children: property.address || '—' },
    property.locationZone ? { key: 'zone', label: t('Zone'), children: property.locationZone } : null,
    property.latitude && property.longitude
      ? {
          key: 'gps',
          label: t('Coordonnées'),
          children: `${property.latitude.toFixed(6)}, ${property.longitude.toFixed(6)}`
        }
      : null
  ].filter(Boolean) as DescriptionsProps['items'];

  /** Deux colonnes à partir du palier md, une seule en dessous (§5.1). */
  const colonnes = { xs: 1, md: 2 };

  const ongletApercu = (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card title={t('Description')}>
        <Text style={{ whiteSpace: 'pre-wrap' }}>
          {descriptionUtile(property.description) || t('Aucune description disponible')}
        </Text>
      </Card>

      {caracteristiques && caracteristiques.length > 0 && (
        <Card title={t('Caractéristiques')}>
          <Descriptions column={colonnes} size="small" bordered items={caracteristiques} />
        </Card>
      )}

      <Card title={t('Informations')}>
        <Descriptions column={colonnes} size="small" bordered items={informations} />
      </Card>

      {!ownAssetsOnly && <PropertyOwnershipCard tenantId={effectiveTenantId} propertyId={id!} />}

      {possede('SALES') && <PropertySaleCard tenantId={effectiveTenantId} propertyId={id!} />}

      <Card
        title={
          <Space>
            <EnvironmentOutlined aria-hidden="true" />
            {t('Localisation')}
          </Space>
        }
      >
        <Descriptions column={colonnes} size="small" bordered items={localisation} />
      </Card>
    </Space>
  );

  /* ------------------------------------------------------------------ */
  /* Onglet « Médias »                                                   */
  /* ------------------------------------------------------------------ */

  const ongletMedias = (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card
        title={
          <Space>
            <PictureOutlined aria-hidden="true" />
            {t('Photos')}
          </Space>
        }
      >
        {photos.length === 0 ? (
          <Empty
            image={<HomeOutlined style={{ fontSize: 64, color: 'var(--icon-muted)' }} />}
            description={t('Aucune photo pour ce bien')}
          />
        ) : (
          <Carousel autoplay>
            {photos.map(photo => (
              <div key={photo.id}>
                <Image
                  src={getMediaUrl(photo)}
                  alt={photo.fileName}
                  style={{ width: '100%', height: 400, objectFit: 'cover' }}
                  preview={{ mask: 'Voir' }}
                />
              </div>
            ))}
          </Carousel>
        )}
      </Card>

      <Card
        title={
          <Space>
            <PlayCircleOutlined aria-hidden="true" />
            {t('Vidéos')}
          </Space>
        }
      >
        {videos.length === 0 ? (
          <Empty description={t('Aucune vidéo pour ce bien')} />
        ) : (
          <Row gutter={[16, 16]}>
            {videos.map(video => (
              <Col key={video.id} xs={24} sm={12}>
                <video src={getMediaUrl(video)} controls style={{ width: '100%', borderRadius: 'var(--radius-lg)' }} />
              </Col>
            ))}
          </Row>
        )}
      </Card>
    </Space>
  );

  /* ------------------------------------------------------------------ */
  /* Assemblage                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * Le libellé porte l'icône ET le texte : une icône seule n'a pas de nom
   * accessible. Le compte des médias est un `<Badge>` plutôt qu'un « (3) »
   * dans le texte, pour ne pas le faire lire comme une partie du nom.
   */
  const onglets: TabsProps['items'] = [
    {
      key: 'apercu',
      label: (
        <Space size="small">
          <ProfileOutlined aria-hidden="true" />
          {t('Aperçu')}
        </Space>
      ),
      children: ongletApercu
    },
    {
      key: 'medias',
      label: (
        <Space size="small">
          <PictureOutlined aria-hidden="true" />
          {t('Médias')}
          {media.length > 0 && <Badge count={media.length} color="var(--color-primary)" />}
        </Space>
      ),
      children: ongletMedias
    },
    estImmeuble
      ? {
          key: 'lots',
          label: (
            <Space size="small">
              <ApartmentOutlined aria-hidden="true" />
              {t('Lots')}
            </Space>
          ),
          children: <PropertyApartments propertyId={id!} tenantId={effectiveTenantId} property={property} />
        }
      : null,
    {
      key: 'maintenance',
      label: (
        <Space size="small">
          <ToolOutlined aria-hidden="true" />
          {t('Maintenance')}
        </Space>
      ),
      children: <PropertyMaintenanceTab propertyId={id!} tenantId={effectiveTenantId} />
    },
    // Documents du bien (titre foncier, diagnostics…) : socle, tous les packs.
    {
      key: 'documents',
      label: (
        <Space size="small">
          <FolderOpenOutlined aria-hidden="true" />
          {t('Documents')}
        </Space>
      ),
      children: <PropertyDocumentsTab tenantId={effectiveTenantId} propertyId={id!} />
    },
    // Mandat de gestion : bien de client, hors compte « détenu en propre ».
    (property.ownershipType === 'CLIENT' || property.ownershipType === 'TENANT') && !ownAssetsOnly
      ? {
          key: 'mandat',
          label: (
            <Space size="small">
              <SolutionOutlined aria-hidden="true" />
              {t('Mandat de gestion')}
            </Space>
          ),
          children: (
            <PropertyMandatesTab
              tenantId={effectiveTenantId}
              propertyId={id!}
              ownerName={proprietaireAffiche(property)}
              ownershipType={property.ownershipType}
              onOwnershipChanged={() => void loadProperty()}
            />
          )
        }
      : null,
    possede('PATRIMOINE')
      ? {
          key: 'patrimoine',
          label: (
            <Space size="small">
              <BankOutlined aria-hidden="true" />
              {t('Patrimoine')}
            </Space>
          ),
          children: (
            <>
              <PropertyPatrimoineTab propertyId={id!} tenantId={effectiveTenantId} />
              <PropertyHoldingTaxSection tenantId={effectiveTenantId} propertyId={id!} />
            </>
          )
        }
      : null,
    possede('PATRIMOINE')
      ? {
          key: 'assurances',
          label: (
            <Space size="small">
              <SafetyCertificateOutlined aria-hidden="true" />
              {t('Assurances et sinistres')}
            </Space>
          ),
          children: (
            <Suspense fallback={<Spin />}>
              <PropertyInsuranceTab propertyId={id!} tenantId={effectiveTenantId} />
            </Suspense>
          )
        }
      : null,
    possede('PATRIMOINE')
      ? {
          key: 'carnet',
          label: (
            <Space size="small">
              <BookOutlined aria-hidden="true" />
              {t("Carnet d'entretien")}
            </Space>
          ),
          children: (
            <Suspense fallback={<Spin />}>
              <PropertyMaintenanceLogTab propertyId={id!} tenantId={effectiveTenantId} />
            </Suspense>
          )
        }
      : null,
    possede('CRM')
      ? {
          key: 'visites',
          label: (
            <Space size="small">
              <CalendarOutlined aria-hidden="true" />
              {t('Visites')}
            </Space>
          ),
          children: (
            <Card title={t('Planifier une visite')}>
              <PropertyVisitScheduler propertyId={id!} tenantId={effectiveTenantId} onVisitScheduled={() => {}} />
            </Card>
          )
        }
      : null
  ].filter(Boolean) as TabsProps['items'];

  /**
   * Onglet demandé par l'URL, validé contre la liste réelle : `?onglet=lots`
   * sur une villa, ou un onglet renommé dans un lien ancien, retombe sur
   * « Aperçu » au lieu de rendre un écran vide.
   */
  const ongletDemande = searchParams.get('onglet');
  const ongletActif = onglets?.some(item => item?.key === ongletDemande) ? ongletDemande! : 'apercu';

  const prix = formatPrice(property.price, property.currency, property.propertyType);

  return (
    <>
      {/*
        En-tête unique (REFONTE_UI_UX.md §3.6, et le contre-exemple P2 qui
        citait nommément cet écran).

        L'ancien en-tête posait le titre dans un `<Space>` — donc dans un
        élément de flex qui ne se comprime pas — face a trois boutons de meme
        poids alignés sans repli ni point de rupture. Les boutons gardaient
        leur largeur, le titre prenait ce qui restait : sur un écran large, il
        se repliait mot par mot dans une colonne de quelques caractères.

        `<PageHeader>` inverse le rapport. Le titre prend la place, UNE action
        primaire reste visible, les deux autres passent derrière « … », et le
        retour à la liste est porté par le fil d'Ariane plutôt que par un
        bouton posé devant le titre.
      */}
      <PageHeader
        title={property.title}
        breadcrumbs={[
          { label: t('Biens'), to: `/tenant/${effectiveTenantId}/properties` },
          { label: property.internalReference || property.title }
        ]}
        subtitle={
          <Space size="small" wrap>
            <StatusTag status={property.status} />
            {property.isPublished && <StatusTag status="PUBLISHED" />}
            <span>
              <EnvironmentOutlined aria-hidden="true" /> {property.address}
              {property.locationZone && `, ${property.locationZone}`}
            </span>
          </Space>
        }
        primaryAction={{
          label: t('Modifier'),
          icon: <EditOutlined />,
          onClick: () => navigate(`/tenant/${effectiveTenantId}/properties/${id}/edit`)
        }}
        secondaryActions={
          [
            possede('RENTAL') && {
              key: 'bail',
              label: t('Générer un contrat de bail'),
              icon: <FileTextOutlined />,
              onClick: () => navigate(`/tenant/${effectiveTenantId}/rental/leases/new`, { state: { propertyId: id } })
            },
            possede('CRM') && {
              key: 'newsletter',
              label: t('Créer une campagne newsletter'),
              icon: <MailOutlined />,
              onClick: () => setNewsletterModalOpen(true)
            }
          ].filter(Boolean) as MenuProps['items']
        }
      />

      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Bandeau de synthèse : hors onglets, parce qu'il identifie le bien. */}
        <Card>
          <Row gutter={[24, 16]} align="middle">
            <Col xs={24} md={estImmeuble && !prix ? 24 : 10}>
              {prix && (
                <Title level={2} style={{ margin: 0, color: 'var(--color-primary)' }}>
                  {prix}
                </Title>
              )}
              <Text type="secondary">
                {property.transactionModes.map(mode => TRANSACTION_LABELS[mode] || mode).join(' • ')}
                {property.fees
                  ? t('· Frais : {{value}}', {
                      value: formatPrice(property.fees, property.currency, property.propertyType)
                    })
                  : ''}
              </Text>
            </Col>
            <Col xs={24} md={estImmeuble && !prix ? 24 : 14}>
              <Space size="large" wrap>
                {property.surfaceArea && <ChiffreCle valeur={`${property.surfaceArea} m²`} libelle="Surface" />}
                {property.rooms && <ChiffreCle valeur={property.rooms} libelle={t('Pièces')} />}
                {property.bedrooms && <ChiffreCle valeur={property.bedrooms} libelle="Chambres" />}
                {property.bathrooms && <ChiffreCle valeur={property.bathrooms} libelle={t('Salles de bain')} />}
                {estImmeuble && property._count?.containerChildren ? (
                  <ChiffreCle valeur={property._count.containerChildren} libelle="Lots" />
                ) : null}
              </Space>
            </Col>
          </Row>
        </Card>

        <Tabs
          activeKey={ongletActif}
          items={onglets}
          // `replace` : parcourir les onglets ne doit pas remplir l'historique,
          // sinon le retour arrière rejoue les onglets un à un au lieu de
          // ramener à la liste des biens.
          onChange={key =>
            setSearchParams(
              previous => {
                const suivant = new URLSearchParams(previous);
                suivant.set('onglet', key);
                return suivant;
              },
              { replace: true }
            )
          }
        />
      </Space>

      <PropertyNewsletterCampaignModal
        open={newsletterModalOpen}
        onClose={() => setNewsletterModalOpen(false)}
        tenantId={effectiveTenantId}
        property={property}
        imageUrls={photos.map(p => getMediaUrl(p))}
        onSuccess={() => setNewsletterModalOpen(false)}
      />
    </>
  );
};
