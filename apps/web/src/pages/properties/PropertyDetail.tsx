import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Button,
  Tag,
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
  Tabs
} from 'antd';
import {
  ArrowLeftOutlined,
  EditOutlined,
  FileTextOutlined,
  HomeOutlined,
  EnvironmentOutlined,
  CalendarOutlined,
  PlayCircleOutlined,
  ToolOutlined,
  MailOutlined,
  BankOutlined
} from '@ant-design/icons';
import { Property, PropertyStatus, PropertyMedia, PropertyMediaType } from '../../types/property-types';
import { getProperty } from '../../services/property-service';
import apiClient from '../../utils/api-client';
import { useAuth } from '../../hooks/useAuth';
import { PropertyVisitScheduler } from '../../components/properties/PropertyVisitScheduler';
import { PropertyMaintenanceTab } from '../../components/properties/PropertyMaintenanceTab';
import { PropertyApartments } from '../../components/properties/PropertyApartments';
import { PropertyNewsletterCampaignModal } from '../../components/newsletter/PropertyNewsletterCampaignModal';
import { PropertyPatrimoineTab } from '../../components/patrimoine/PropertyPatrimoineTab';
import { API_URL } from '../../config/api';

const { Title, Text } = Typography;

export const PropertyDetail: React.FC = () => {
  const { tenantId, id } = useParams<{ tenantId: string; id: string }>();
  const navigate = useNavigate();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  const [property, setProperty] = useState<Property | null>(null);
  const [media, setMedia] = useState<PropertyMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newsletterModalOpen, setNewsletterModalOpen] = useState(false);

  useEffect(() => {
    if (effectiveTenantId && id) {
      loadProperty();
    } else {
      setError('Paramètres manquants');
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
      setError(err.response?.data?.error || 'Erreur lors du chargement de la propriété');
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
    if (!price) return propertyType === 'IMMEUBLE' ? '' : 'Prix sur demande';
    const formatted = new Intl.NumberFormat('fr-FR').format(price);
    return `${formatted} ${currency || 'EUR'}`;
  };

  const getStatusTag = (status?: PropertyStatus) => {
    const statusConfig: Record<PropertyStatus, { color: string; text: string }> = {
      DRAFT: { color: 'default', text: 'Brouillon' },
      UNDER_REVIEW: { color: 'warning', text: 'En révision' },
      AVAILABLE: { color: 'success', text: 'Disponible' },
      RESERVED: { color: 'processing', text: 'Réservé' },
      UNDER_OFFER: { color: 'processing', text: 'Sous offre' },
      RENTED: { color: 'purple', text: 'Loué' },
      SOLD: { color: 'error', text: 'Vendu' },
      ARCHIVED: { color: 'default', text: 'Archivé' }
    };
    const config = status ? statusConfig[status] : { color: 'default', text: 'N/A' };
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  if (!effectiveTenantId) {
    return (
      <>
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <Text type="secondary">Aucun tenant sélectionné</Text>
        </div>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
          <Spin size="large" />
        </div>
      </>
    );
  }

  if (error || !property) {
    return (
      <>
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <Alert
            message="Erreur"
            description={error || 'Propriété non trouvée'}
            type="error"
            showIcon
            action={
              <Button onClick={() => navigate(`/tenant/${effectiveTenantId}/properties`)}>Retour à la liste</Button>
            }
          />
        </div>
      </>
    );
  }

  const photos = media.filter(m => m.mediaType === PropertyMediaType.PHOTO);
  const videos = media.filter(m => m.mediaType === PropertyMediaType.VIDEO);

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/tenant/${effectiveTenantId}/properties`)}>
              Retour
            </Button>
            <div>
              <Space>
                <Title level={2} style={{ margin: 0 }}>
                  {property.title}
                </Title>
                {getStatusTag(property.status)}
                {property.isPublished && <Tag color="blue">Publié</Tag>}
              </Space>
              <div style={{ marginTop: 8 }}>
                <Text type="secondary">
                  <EnvironmentOutlined /> {property.address}
                  {property.locationZone && `, ${property.locationZone}`}
                </Text>
              </div>
            </div>
          </Space>
          <Space>
            <Button icon={<MailOutlined />} onClick={() => setNewsletterModalOpen(true)}>
              Créer campagne newsletter
            </Button>
            <Button
              icon={<FileTextOutlined />}
              onClick={() => navigate(`/tenant/${effectiveTenantId}/rental/leases/new`, { state: { propertyId: id } })}
            >
              Générer un contrat de bail
            </Button>
            <Button
              type="primary"
              icon={<EditOutlined />}
              onClick={() => navigate(`/tenant/${effectiveTenantId}/properties/${id}/edit`)}
            >
              Modifier
            </Button>
          </Space>
        </div>

        {/* Main Content */}
        <Row gutter={[24, 24]}>
          {/* Left Column */}
          <Col xs={24} lg={16}>
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              {/* Property Images Gallery */}
              <Card>
                {photos.length === 0 ? (
                  <div
                    style={{
                      height: 400,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: '#f0f0f0'
                    }}
                  >
                    <Empty
                      image={<HomeOutlined style={{ fontSize: 64, color: '#bfbfbf' }} />}
                      description="Aucune photo disponible"
                    />
                  </div>
                ) : (
                  <Carousel autoplay>
                    {photos.map(photo => (
                      <div key={photo.id}>
                        <Image
                          src={getMediaUrl(photo)}
                          alt={photo.fileName}
                          style={{ width: '100%', height: 400, objectFit: 'cover' }}
                          preview={{
                            mask: 'Voir'
                          }}
                        />
                      </div>
                    ))}
                  </Carousel>
                )}
              </Card>

              {/* Videos Section */}
              {videos.length > 0 && (
                <Card
                  title={
                    <>
                      <PlayCircleOutlined /> Vidéos
                    </>
                  }
                >
                  <Row gutter={[16, 16]}>
                    {videos.map(video => (
                      <Col key={video.id} xs={24} sm={12}>
                        <video src={getMediaUrl(video)} controls style={{ width: '100%', borderRadius: 8 }} />
                      </Col>
                    ))}
                  </Row>
                </Card>
              )}

              {/* Description */}
              <Card title="Description">
                <Text style={{ whiteSpace: 'pre-wrap' }}>
                  {property.description || 'Aucune description disponible'}
                </Text>
              </Card>

              {/* Characteristics */}
              <Card title="Caractéristiques">
                <Row gutter={[16, 16]}>
                  {property.surfaceArea && (
                    <Col xs={12} sm={6}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 24, fontWeight: 'bold', color: '#1890ff' }}>{property.surfaceArea}</div>
                        <Text type="secondary">m²</Text>
                      </div>
                    </Col>
                  )}
                  {property.rooms && (
                    <Col xs={12} sm={6}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 24, fontWeight: 'bold', color: '#1890ff' }}>{property.rooms}</div>
                        <Text type="secondary">Pièces</Text>
                      </div>
                    </Col>
                  )}
                  {property.bedrooms && (
                    <Col xs={12} sm={6}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 24, fontWeight: 'bold', color: '#1890ff' }}>{property.bedrooms}</div>
                        <Text type="secondary">Chambres</Text>
                      </div>
                    </Col>
                  )}
                  {property.bathrooms && (
                    <Col xs={12} sm={6}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 24, fontWeight: 'bold', color: '#1890ff' }}>{property.bathrooms}</div>
                        <Text type="secondary">Salles de bain</Text>
                      </div>
                    </Col>
                  )}
                </Row>
              </Card>

              {/* Apartments Section - Only for IMMEUBLE type */}
              {property.propertyType === 'IMMEUBLE' && (
                <PropertyApartments propertyId={id!} tenantId={effectiveTenantId!} property={property} />
              )}

              {/* Maintenance History Tab */}
              <Card>
                <Tabs
                  defaultActiveKey="maintenance"
                  type="line"
                  items={[
                    {
                      key: 'maintenance',
                      label: (
                        <span>
                          <ToolOutlined />
                          Maintenance
                        </span>
                      ),
                      children: <PropertyMaintenanceTab propertyId={id!} tenantId={effectiveTenantId!} />
                    },
                    {
                      key: 'patrimoine',
                      label: (
                        <span>
                          <BankOutlined />
                          Patrimoine
                        </span>
                      ),
                      children: <PropertyPatrimoineTab propertyId={id!} tenantId={effectiveTenantId!} />
                    }
                  ]}
                />
              </Card>
            </Space>
          </Col>

          {/* Right Column - Sidebar */}
          <Col xs={24} lg={8}>
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              {/* Price Card */}
              <Card>
                <div style={{ fontSize: 32, fontWeight: 'bold', color: '#1890ff', marginBottom: 16 }}>
                  {formatPrice(property.price, property.currency, property.propertyType)}
                </div>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                  {property.transactionModes
                    .map(mode => (mode === 'SALE' ? 'Vente' : mode === 'RENTAL' ? 'Location' : 'Court terme'))
                    .join(' • ')}
                </Text>
                {property.fees && (
                  <Text type="secondary">
                    Frais: {formatPrice(property.fees, property.currency, property.propertyType)}
                  </Text>
                )}
              </Card>

              {/* Property Info */}
              <Card title="Informations">
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="Référence">{property.internalReference}</Descriptions.Item>
                  <Descriptions.Item label="Type">{property.propertyType}</Descriptions.Item>
                  <Descriptions.Item label="Propriété de">
                    {(() => {
                      // Priority 1: If owner is loaded and has name/email, display it
                      if (property.owner && (property.owner.fullName || property.owner.email)) {
                        return property.owner.fullName || property.owner.email;
                      }

                      // Priority 2: If ownershipType is TENANT
                      if (property.ownershipType === 'TENANT') {
                        // If ownerUserId exists, it means a specific owner was selected
                        if (property.ownerUserId) {
                          // Owner was selected but not loaded - show generic message
                          return property.owner?.email || 'Propriétaire sélectionné';
                        }
                        // No specific owner, show tenant name
                        const tenant = (property as any).tenant;
                        return tenant?.name || 'Agence';
                      }

                      // Priority 3: If ownershipType is PUBLIC
                      if (property.ownershipType === 'PUBLIC') {
                        if (property.ownerUserId) {
                          // Owner selected but not loaded
                          return property.owner?.email || property.owner?.fullName || 'Propriétaire privé';
                        }
                        return 'Publique';
                      }

                      // Priority 4: If ownershipType is CLIENT
                      if (property.ownershipType === 'CLIENT') {
                        if (property.ownerUserId) {
                          return property.owner?.fullName || property.owner?.email || 'Client';
                        }
                        return 'Client';
                      }

                      // Default fallback
                      return 'Agence';
                    })()}
                  </Descriptions.Item>
                  {property.furnishingStatus && (
                    <Descriptions.Item label="Meublé">
                      {property.furnishingStatus === 'FURNISHED'
                        ? 'Oui'
                        : property.furnishingStatus === 'UNFURNISHED'
                          ? 'Non'
                          : 'Partiellement'}
                    </Descriptions.Item>
                  )}
                  {property.availability && (
                    <Descriptions.Item label="Disponibilité">
                      {property.availability === 'AVAILABLE'
                        ? 'Disponible'
                        : property.availability === 'UNAVAILABLE'
                          ? 'Indisponible'
                          : 'Bientôt disponible'}
                    </Descriptions.Item>
                  )}
                </Descriptions>
              </Card>

              {/* Location */}
              {property.locationZone && (
                <Card
                  title={
                    <Space>
                      <EnvironmentOutlined />
                      Localisation
                    </Space>
                  }
                >
                  <Text strong style={{ display: 'block', marginBottom: 4 }}>
                    {property.address}
                  </Text>
                  <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                    {property.locationZone}
                  </Text>
                  {property.latitude && property.longitude && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Coordonnées: {property.latitude.toFixed(6)}, {property.longitude.toFixed(6)}
                    </Text>
                  )}
                </Card>
              )}

              {/* Visit Scheduler */}
              <Card
                title={
                  <Space>
                    <CalendarOutlined />
                    Planifier une visite
                  </Space>
                }
              >
                <PropertyVisitScheduler propertyId={id!} tenantId={effectiveTenantId!} onVisitScheduled={() => {}} />
              </Card>
            </Space>
          </Col>
        </Row>
      </Space>

      <PropertyNewsletterCampaignModal
        open={newsletterModalOpen}
        onClose={() => setNewsletterModalOpen(false)}
        tenantId={effectiveTenantId!}
        property={property}
        imageUrls={photos.map(p => getMediaUrl(p))}
        onSuccess={() => setNewsletterModalOpen(false)}
      />
    </>
  );
};
