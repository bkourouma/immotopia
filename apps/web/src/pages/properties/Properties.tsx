import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  App,
  Card,
  Input,
  Select,
  Button,
  Tag,
  Space,
  Row,
  Col,
  Typography,
  Alert,
  Empty,
  Spin,
  Collapse,
  Badge,
  Grid,
  Pagination,
  Popconfirm
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  FilterOutlined,
  EyeOutlined,
  EditOutlined,
  HomeOutlined,
  CloseOutlined,
  DeleteOutlined,
  MailOutlined
} from '@ant-design/icons';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { listProperties, Property, deleteProperty } from '../../services/property-service';
import { PropertyMedia, PropertyMediaType } from '../../types/property-types';
import apiClient from '../../utils/api-client';
import { useAuth } from '../../hooks/useAuth';
import { GeographicLocation, getAllCommunes } from '../../services/geographic-service';
import { CommuneSearchableSelect } from '../../components/ui/commune-searchable-select';
import { PropertyNewsletterCampaignModal } from '../../components/newsletter/PropertyNewsletterCampaignModal';
import { API_URL } from '../../config/api';

const { Title, Text } = Typography;
const { Panel } = Collapse;
const { useBreakpoint } = Grid;

export const Properties: React.FC = () => {
  const { message } = App.useApp();

  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const screens = useBreakpoint();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  });
  const [propertyImages, setPropertyImages] = useState<Record<string, string>>({});
  const [communes, setCommunes] = useState<GeographicLocation[]>([]);
  const [filters, setFilters] = useState({
    propertyType: '',
    transactionMode: '',
    status: '',
    city: '',
    minPrice: '',
    maxPrice: '',
    minSurface: '',
    maxSurface: '',
    minRooms: '',
    maxRooms: '',
    minBedrooms: '',
    maxBedrooms: ''
  });
  const [activeFiltersCount, setActiveFiltersCount] = useState(0);
  const [newsletterModalProperty, setNewsletterModalProperty] = useState<Property | null>(null);

  const propertyTypeLabels: Record<string, string> = {
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

  const transactionModeLabels: Record<string, string> = {
    SALE: 'Vente',
    RENTAL: 'Location',
    SHORT_TERM: 'Location courte durée'
  };

  const statusLabels: Record<string, string> = {
    DRAFT: 'Brouillon',
    UNDER_REVIEW: 'En révision',
    AVAILABLE: 'Disponible',
    RESERVED: 'Réservé',
    UNDER_OFFER: 'Sous offre',
    RENTED: 'Loué',
    SOLD: 'Vendu',
    ARCHIVED: 'Archivé'
  };

  useEffect(() => {
    const count = Object.values(filters).filter(v => v !== '').length;
    setActiveFiltersCount(count + (searchTerm ? 1 : 0));
  }, [filters, searchTerm]);

  useEffect(() => {
    if (effectiveTenantId) {
      loadProperties();
    }
  }, [effectiveTenantId, pagination.page]);

  useEffect(() => {
    const loadCommunes = async () => {
      try {
        const communesList = await getAllCommunes();
        setCommunes(communesList);
      } catch (err) {
        console.error('Error loading communes:', err);
      }
    };
    loadCommunes();
  }, []);

  const loadProperties = async () => {
    if (!effectiveTenantId) return;

    setLoading(true);
    setError(null);
    try {
      const response = await listProperties(effectiveTenantId, {
        page: pagination.page,
        limit: pagination.limit,
        propertyType: filters.propertyType || undefined,
        transactionMode: filters.transactionMode || undefined,
        status: filters.status || undefined
      });

      let filteredProperties = response.properties;

      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filteredProperties = filteredProperties.filter(
          p =>
            p.title?.toLowerCase().includes(term) ||
            p.address?.toLowerCase().includes(term) ||
            p.internalReference?.toLowerCase().includes(term)
        );
      }

      if (filters.city) {
        const selectedCommune = communes.find(c => c.communeId === filters.city);
        if (selectedCommune) {
          const communeName = selectedCommune.commune.toLowerCase();
          const regionName = selectedCommune.region.toLowerCase();
          filteredProperties = filteredProperties.filter(p => {
            const addressLower = p.address?.toLowerCase() || '';
            const locationZoneLower = p.locationZone?.toLowerCase() || '';
            return (
              addressLower.includes(communeName) ||
              locationZoneLower.includes(communeName) ||
              addressLower.includes(regionName) ||
              locationZoneLower.includes(regionName)
            );
          });
        }
      }

      if (filters.minPrice) {
        filteredProperties = filteredProperties.filter(p => (p.price || 0) >= Number(filters.minPrice));
      }
      if (filters.maxPrice) {
        filteredProperties = filteredProperties.filter(p => (p.price || 0) <= Number(filters.maxPrice));
      }

      if (filters.minSurface) {
        filteredProperties = filteredProperties.filter(p => (p.surfaceArea || 0) >= Number(filters.minSurface));
      }
      if (filters.maxSurface) {
        filteredProperties = filteredProperties.filter(p => (p.surfaceArea || 0) <= Number(filters.maxSurface));
      }

      if (filters.minRooms) {
        filteredProperties = filteredProperties.filter(p => (p.rooms || 0) >= Number(filters.minRooms));
      }
      if (filters.maxRooms) {
        filteredProperties = filteredProperties.filter(p => (p.rooms || 0) <= Number(filters.maxRooms));
      }

      if (filters.minBedrooms) {
        filteredProperties = filteredProperties.filter(p => (p.bedrooms || 0) >= Number(filters.minBedrooms));
      }
      if (filters.maxBedrooms) {
        filteredProperties = filteredProperties.filter(p => (p.bedrooms || 0) <= Number(filters.maxBedrooms));
      }

      setProperties(filteredProperties);
      setPagination(response.pagination);
      loadPropertyImages(filteredProperties);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur lors du chargement des propriétés');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setPagination(prev => ({ ...prev, page: 1 }));
    loadProperties();
  };

  const clearFilters = () => {
    setSearchTerm('');
    setFilters({
      propertyType: '',
      transactionMode: '',
      status: '',
      city: '',
      minPrice: '',
      maxPrice: '',
      minSurface: '',
      maxSurface: '',
      minRooms: '',
      maxRooms: '',
      minBedrooms: '',
      maxBedrooms: ''
    });
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  useEffect(() => {
    if (activeFiltersCount === 0 && effectiveTenantId) {
      loadProperties();
    }
  }, [activeFiltersCount]);

  const loadPropertyImages = async (props: Property[]) => {
    if (!effectiveTenantId) return;

    const imageMap: Record<string, string> = {};
    const apiBaseUrl = API_URL;
    const mediaBaseUrl = apiBaseUrl.replace('/api', '');

    await Promise.all(
      props.map(async property => {
        try {
          const response = await apiClient.get<{ success: boolean; data: PropertyMedia[] }>(
            `/tenants/${effectiveTenantId}/properties/${property.id}/media`
          );
          const photos = response.data.data.filter(m => m.mediaType === PropertyMediaType.PHOTO);
          const primaryPhoto = photos.find(p => p.isPrimary) || photos[0];
          if (primaryPhoto) {
            const filePath = primaryPhoto.fileUrl || primaryPhoto.filePath;
            imageMap[property.id] = filePath.startsWith('http')
              ? filePath
              : `${mediaBaseUrl}${filePath.startsWith('/') ? '' : '/'}${filePath}`;
          }
        } catch (err) {
          // Ignore errors
        }
      })
    );

    setPropertyImages(imageMap);
  };

  const formatPrice = (price?: number, currency?: string, propertyType?: string) => {
    if (!price) return propertyType === 'IMMEUBLE' ? '' : 'Prix sur demande';
    const formatted = new Intl.NumberFormat('fr-FR').format(price);
    return `${formatted} ${currency || 'EUR'}`;
  };

  const handleDeleteProperty = async (propertyId: string) => {
    if (!effectiveTenantId) return;

    try {
      await deleteProperty(effectiveTenantId, propertyId);
      message.success('Propriété supprimée avec succès');
      // Reload properties after deletion
      loadProperties();
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Erreur lors de la suppression';
      message.error(errorMessage);
    }
  };

  /** Commune depuis typeSpecificData */
  const getCommune = (p: Property) => {
    const ts =
      p.typeSpecificData && typeof p.typeSpecificData === 'object' ? (p.typeSpecificData as Record<string, any>) : {};
    return ts.commune?.trim() || '';
  };

  /** Adresse et quartier sur une seule ligne (pour affichage carte) */
  const getAddressAndQuartierLine = (p: Property) => {
    const parts: string[] = [];
    if (p.address?.trim()) parts.push(p.address.trim());
    if (p.locationZone?.trim()) parts.push(p.locationZone.trim());
    return parts.join(' • ');
  };

  const getStatusTag = (status: string, isPublished: boolean) => {
    const statusConfig: Record<string, { color: string; text: string }> = {
      DRAFT: { color: 'default', text: 'Brouillon' },
      UNDER_REVIEW: { color: 'warning', text: 'En révision' },
      AVAILABLE: { color: 'success', text: 'Disponible' },
      RESERVED: { color: 'processing', text: 'Réservé' },
      UNDER_OFFER: { color: 'processing', text: 'Sous offre' },
      RENTED: { color: 'purple', text: 'Loué' },
      SOLD: { color: 'error', text: 'Vendu' },
      ARCHIVED: { color: 'default', text: 'Archivé' }
    };
    const config = statusConfig[status] || statusConfig.DRAFT;
    return (
      <Space size="small">
        <Tag color={config.color}>{config.text}</Tag>
        {isPublished && <Tag color="blue">Publié</Tag>}
      </Space>
    );
  };

  if (!effectiveTenantId) {
    return (
      <DashboardLayout>
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <Text type="secondary">Aucun tenant sélectionné</Text>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Page Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Title level={2} style={{ margin: 0 }}>
              Propriétés
            </Title>
            <Text type="secondary">Gérez toutes vos propriétés immobilières</Text>
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate(`/tenant/${effectiveTenantId}/properties/new`)}
          >
            Ajouter une propriété
          </Button>
        </div>

        {/* Search and Filters */}
        <Card>
          <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
            <Input
              placeholder="Rechercher par titre, adresse, référence..."
              prefix={<SearchOutlined />}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onPressEnter={handleSearch}
              style={{ flex: 1 }}
            />
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
              Rechercher
            </Button>
          </Space.Compact>

          <Collapse
            ghost
            expandIcon={({ isActive }) => (
              <Badge count={activeFiltersCount} offset={[10, 0]}>
                <Button icon={isActive ? <CloseOutlined /> : <FilterOutlined />} iconPosition="end">
                  Filtres avancés
                </Button>
              </Badge>
            )}
          >
            <Panel header="" key="filters">
              <div style={{ marginTop: 16 }}>
                {activeFiltersCount > 0 && (
                  <div style={{ marginBottom: 16, textAlign: 'right' }}>
                    <Button type="link" icon={<CloseOutlined />} onClick={clearFilters}>
                      Effacer les filtres
                    </Button>
                  </div>
                )}
                <Row gutter={[16, 16]}>
                  <Col xs={24} sm={12} md={8} lg={6}>
                    <Text strong>Type de bien</Text>
                    <Select
                      style={{ width: '100%', marginTop: 8 }}
                      placeholder="Tous les types"
                      value={filters.propertyType || undefined}
                      onChange={value => setFilters(prev => ({ ...prev, propertyType: value || '' }))}
                      allowClear
                    >
                      {Object.entries(propertyTypeLabels).map(([value, label]) => (
                        <Select.Option key={value} value={value}>
                          {label}
                        </Select.Option>
                      ))}
                    </Select>
                  </Col>
                  <Col xs={24} sm={12} md={8} lg={6}>
                    <Text strong>Mode de transaction</Text>
                    <Select
                      style={{ width: '100%', marginTop: 8 }}
                      placeholder="Tous les modes"
                      value={filters.transactionMode || undefined}
                      onChange={value => setFilters(prev => ({ ...prev, transactionMode: value || '' }))}
                      allowClear
                    >
                      {Object.entries(transactionModeLabels).map(([value, label]) => (
                        <Select.Option key={value} value={value}>
                          {label}
                        </Select.Option>
                      ))}
                    </Select>
                  </Col>
                  <Col xs={24} sm={12} md={8} lg={6}>
                    <Text strong>Statut</Text>
                    <Select
                      style={{ width: '100%', marginTop: 8 }}
                      placeholder="Tous les statuts"
                      value={filters.status || undefined}
                      onChange={value => setFilters(prev => ({ ...prev, status: value || '' }))}
                      allowClear
                    >
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <Select.Option key={value} value={value}>
                          {label}
                        </Select.Option>
                      ))}
                    </Select>
                  </Col>
                  <Col xs={24} sm={12} md={8} lg={6}>
                    <Text strong>Ville</Text>
                    <div style={{ marginTop: 8 }}>
                      <CommuneSearchableSelect
                        value={filters.city}
                        onChange={communeId => setFilters(prev => ({ ...prev, city: communeId }))}
                        placeholder="Rechercher une ville..."
                      />
                    </div>
                  </Col>
                  <Col xs={24} sm={12} md={8} lg={6}>
                    <Text strong>Prix minimum (FCFA)</Text>
                    <Input
                      type="number"
                      placeholder="0"
                      value={filters.minPrice}
                      onChange={e => setFilters(prev => ({ ...prev, minPrice: e.target.value }))}
                      style={{ marginTop: 8 }}
                    />
                  </Col>
                  <Col xs={24} sm={12} md={8} lg={6}>
                    <Text strong>Prix maximum (FCFA)</Text>
                    <Input
                      type="number"
                      placeholder="Illimité"
                      value={filters.maxPrice}
                      onChange={e => setFilters(prev => ({ ...prev, maxPrice: e.target.value }))}
                      style={{ marginTop: 8 }}
                    />
                  </Col>
                  <Col xs={24} sm={12} md={8} lg={6}>
                    <Text strong>Surface min (m²)</Text>
                    <Input
                      type="number"
                      placeholder="0"
                      value={filters.minSurface}
                      onChange={e => setFilters(prev => ({ ...prev, minSurface: e.target.value }))}
                      style={{ marginTop: 8 }}
                    />
                  </Col>
                  <Col xs={24} sm={12} md={8} lg={6}>
                    <Text strong>Surface max (m²)</Text>
                    <Input
                      type="number"
                      placeholder="Illimité"
                      value={filters.maxSurface}
                      onChange={e => setFilters(prev => ({ ...prev, maxSurface: e.target.value }))}
                      style={{ marginTop: 8 }}
                    />
                  </Col>
                  <Col xs={24} sm={12} md={8} lg={6}>
                    <Text strong>Pièces min</Text>
                    <Input
                      type="number"
                      placeholder="0"
                      min={0}
                      value={filters.minRooms}
                      onChange={e => setFilters(prev => ({ ...prev, minRooms: e.target.value }))}
                      style={{ marginTop: 8 }}
                    />
                  </Col>
                  <Col xs={24} sm={12} md={8} lg={6}>
                    <Text strong>Pièces max</Text>
                    <Input
                      type="number"
                      placeholder="Illimité"
                      min={0}
                      value={filters.maxRooms}
                      onChange={e => setFilters(prev => ({ ...prev, maxRooms: e.target.value }))}
                      style={{ marginTop: 8 }}
                    />
                  </Col>
                  <Col xs={24} sm={12} md={8} lg={6}>
                    <Text strong>Chambres min</Text>
                    <Input
                      type="number"
                      placeholder="0"
                      min={0}
                      value={filters.minBedrooms}
                      onChange={e => setFilters(prev => ({ ...prev, minBedrooms: e.target.value }))}
                      style={{ marginTop: 8 }}
                    />
                  </Col>
                  <Col xs={24} sm={12} md={8} lg={6}>
                    <Text strong>Chambres max</Text>
                    <Input
                      type="number"
                      placeholder="Illimité"
                      min={0}
                      value={filters.maxBedrooms}
                      onChange={e => setFilters(prev => ({ ...prev, maxBedrooms: e.target.value }))}
                      style={{ marginTop: 8 }}
                    />
                  </Col>
                </Row>
                <div style={{ marginTop: 16, textAlign: 'right' }}>
                  <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
                    Appliquer les filtres
                  </Button>
                </div>
              </div>
            </Panel>
          </Collapse>
        </Card>

        {/* Error State */}
        {error && (
          <Alert message="Erreur" description={error} type="error" showIcon closable onClose={() => setError(null)} />
        )}

        {/* Loading State */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <Spin size="large" />
          </div>
        ) : (
          <>
            {/* Properties Grid */}
            {properties.length === 0 ? (
              <Card>
                <Empty
                  image={<HomeOutlined style={{ fontSize: 64, color: '#bfbfbf' }} />}
                  description={
                    <Space direction="vertical" size="small">
                      <Text strong>Aucune propriété</Text>
                      <Text type="secondary">Commencez par créer votre première propriété</Text>
                    </Space>
                  }
                >
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => navigate(`/tenant/${effectiveTenantId}/properties/new`)}
                  >
                    Ajouter une propriété
                  </Button>
                </Empty>
              </Card>
            ) : (
              <>
                <Row gutter={[16, 16]}>
                  {properties.map(property => {
                    const commune = getCommune(property);
                    const addressQuartierLine = getAddressAndQuartierLine(property);
                    return (
                      <Col key={property.id} xs={24} sm={12} lg={8}>
                        <Card
                          hoverable
                          cover={
                            propertyImages[property.id] ? (
                              <img
                                alt={property.title}
                                src={propertyImages[property.id]}
                                style={{ height: 200, objectFit: 'cover' }}
                                onError={e => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            ) : (
                              <div
                                style={{
                                  height: 200,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  backgroundColor: '#f0f0f0'
                                }}
                              >
                                <HomeOutlined style={{ fontSize: 48, color: '#bfbfbf' }} />
                              </div>
                            )
                          }
                          actions={[
                            <Button
                              key="view"
                              type="link"
                              icon={<EyeOutlined />}
                              onClick={() => navigate(`/tenant/${effectiveTenantId}/properties/${property.id}`)}
                              title="Voir"
                            />,
                            <Button
                              key="edit"
                              type="link"
                              icon={<EditOutlined />}
                              onClick={() => navigate(`/tenant/${effectiveTenantId}/properties/${property.id}/edit`)}
                              title="Modifier"
                            />,
                            <Button
                              key="newsletter"
                              type="link"
                              icon={<MailOutlined />}
                              onClick={e => {
                                e.stopPropagation();
                                setNewsletterModalProperty(property);
                              }}
                              title="Newsletter"
                            />,
                            <Popconfirm
                              key="delete"
                              title="Supprimer la propriété"
                              description={`Êtes-vous sûr de vouloir supprimer "${property.title}" ? Cette action est irréversible.`}
                              onConfirm={() => handleDeleteProperty(property.id)}
                              okText="Supprimer"
                              cancelText="Annuler"
                              okButtonProps={{ danger: true }}
                            >
                              <Button type="link" danger icon={<DeleteOutlined />} title="Supprimer" />
                            </Popconfirm>
                          ]}
                        >
                          <Card.Meta
                            title={
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'flex-start',
                                  marginBottom: 8
                                }}
                              >
                                <Text strong ellipsis style={{ flex: 1, marginRight: 8 }}>
                                  {property.title}
                                </Text>
                                {getStatusTag(property.status, property.isPublished)}
                              </div>
                            }
                            description={
                              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                                <div>
                                  <Text type="secondary">
                                    {propertyTypeLabels[property.propertyType] || property.propertyType}
                                  </Text>
                                  {property.containerParent?.title && (
                                    <Text type="secondary"> ({property.containerParent.title})</Text>
                                  )}
                                  {property.propertyType === 'IMMEUBLE' &&
                                    (() => {
                                      const total =
                                        (property as Property & { _count?: { containerChildren: number } })._count
                                          ?.containerChildren ?? 0;
                                      const rented =
                                        (property as Property & { containerChildrenRentedCount?: number })
                                          .containerChildrenRentedCount ?? 0;
                                      const available =
                                        (property as Property & { containerChildrenAvailableCount?: number })
                                          .containerChildrenAvailableCount ?? total;
                                      if (total === 0) return null;
                                      return (
                                        <Text type="secondary">
                                          {' '}
                                          • {total} appartement{total > 1 ? 's' : ''}
                                          {typeof rented === 'number' && typeof available === 'number' && (
                                            <>
                                              {' '}
                                              • {available} disponible{available > 1 ? 's' : ''} • {rented} loué
                                              {rented > 1 ? 's' : ''}
                                            </>
                                          )}
                                        </Text>
                                      );
                                    })()}
                                </div>
                                {commune || (property.transactionModes && property.transactionModes.length > 0) ? (
                                  <div>
                                    <Text type="secondary">
                                      {property.transactionModes && property.transactionModes.length > 0
                                        ? property.transactionModes
                                            .map((mode: string) => transactionModeLabels[mode] || mode)
                                            .join(', ')
                                        : ''}
                                      {property.transactionModes?.length && commune ? ' • ' : ''}
                                      {commune || ''}
                                    </Text>
                                  </div>
                                ) : null}
                                {addressQuartierLine ? (
                                  <div>
                                    <Text type="secondary" ellipsis style={{ display: 'block' }}>
                                      {addressQuartierLine}
                                    </Text>
                                  </div>
                                ) : null}
                                <div>
                                  {property.rooms && <Text type="secondary">{property.rooms} pièces</Text>}
                                  {property.bedrooms && <Text type="secondary"> • {property.bedrooms} chambres</Text>}
                                  {property.surfaceArea && <Text type="secondary"> • {property.surfaceArea} m²</Text>}
                                </div>
                                <Text strong style={{ fontSize: 18, color: '#1890ff' }}>
                                  {formatPrice(property.price, property.currency, property.propertyType)}
                                </Text>
                              </Space>
                            }
                          />
                        </Card>
                      </Col>
                    );
                  })}
                </Row>

                {/* Pagination */}
                {pagination.totalPages > 1 && (
                  <div style={{ textAlign: 'center', marginTop: 24 }}>
                    <Pagination
                      current={pagination.page}
                      total={pagination.total}
                      pageSize={pagination.limit}
                      showSizeChanger
                      showTotal={total => `Total: ${total} propriétés`}
                      onChange={(page, pageSize) => {
                        setPagination(prev => ({ ...prev, page, limit: pageSize }));
                      }}
                    />
                  </div>
                )}
              </>
            )}
          </>
        )}
      </Space>

      <PropertyNewsletterCampaignModal
        open={!!newsletterModalProperty}
        onClose={() => setNewsletterModalProperty(null)}
        tenantId={effectiveTenantId}
        property={newsletterModalProperty!}
        imageUrls={
          newsletterModalProperty && propertyImages[newsletterModalProperty.id]
            ? [propertyImages[newsletterModalProperty.id]]
            : []
        }
      />
    </DashboardLayout>
  );
};
