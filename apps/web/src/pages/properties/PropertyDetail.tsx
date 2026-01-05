import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { Property, PropertyStatus, PropertyMedia, PropertyMediaType } from '../../types/property-types';
import { getProperty } from '../../services/property-service';
import apiClient from '../../utils/api-client';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/ui/button';
import {
  ArrowLeft,
  MapPin,
  Bed,
  Bath,
  Square,
  Building2,
  Loader2,
  Edit,
  ChevronLeft,
  ChevronRight,
  Play,
  Calendar,
} from 'lucide-react';
import { PropertyVisitScheduler } from '../../components/properties/PropertyVisitScheduler';

export const PropertyDetail: React.FC = () => {
  const { tenantId, id } = useParams<{ tenantId: string; id: string }>();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  const [property, setProperty] = useState<Property | null>(null);
  const [media, setMedia] = useState<PropertyMedia[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      // Load media
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
      // Sort by displayOrder and put primary first
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
      const apiBaseUrl = process.env.REACT_APP_API_URL || 'http://localhost:8001/api';
      const baseUrl = apiBaseUrl.replace('/api', '');
      return `${baseUrl}${item.fileUrl}`;
    }
    return '';
  };

  const nextImage = () => {
    const photos = media.filter(m => m.mediaType === PropertyMediaType.PHOTO);
    if (photos.length > 0) {
      setCurrentImageIndex((prev) => (prev + 1) % photos.length);
    }
  };

  const prevImage = () => {
    const photos = media.filter(m => m.mediaType === PropertyMediaType.PHOTO);
    if (photos.length > 0) {
      setCurrentImageIndex((prev) => (prev - 1 + photos.length) % photos.length);
    }
  };

  const formatPrice = (price?: number, currency?: string) => {
    if (!price) return 'Prix sur demande';
    const formatted = new Intl.NumberFormat('fr-FR').format(price);
    return `${formatted} ${currency || 'EUR'}`;
  };

  const getStatusLabel = (status?: PropertyStatus) => {
    const statusMap: Record<PropertyStatus, string> = {
      DRAFT: 'Brouillon',
      UNDER_REVIEW: 'En révision',
      AVAILABLE: 'Disponible',
      RESERVED: 'Réservé',
      UNDER_OFFER: 'Sous offre',
      RENTED: 'Loué',
      SOLD: 'Vendu',
      ARCHIVED: 'Archivé',
    };
    return status ? statusMap[status] : 'N/A';
  };

  const getStatusColor = (status?: PropertyStatus) => {
    const colorMap: Record<PropertyStatus, string> = {
      DRAFT: 'bg-gray-100 text-gray-800',
      UNDER_REVIEW: 'bg-yellow-100 text-yellow-800',
      AVAILABLE: 'bg-green-100 text-green-800',
      RESERVED: 'bg-blue-100 text-blue-800',
      UNDER_OFFER: 'bg-purple-100 text-purple-800',
      RENTED: 'bg-indigo-100 text-indigo-800',
      SOLD: 'bg-gray-100 text-gray-800',
      ARCHIVED: 'bg-red-100 text-red-800',
    };
    return status ? colorMap[status] : 'bg-gray-100 text-gray-800';
  };

  if (!effectiveTenantId) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-slate-600">Aucun tenant sélectionné</p>
        </div>
      </DashboardLayout>
    );
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !property) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-red-600 mb-4">{error || 'Propriété non trouvée'}</p>
          <Link to={`/tenant/${effectiveTenantId}/properties`}>
            <Button variant="outline">Retour à la liste</Button>
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to={`/tenant/${effectiveTenantId}/properties`}>
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Retour
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold text-slate-900">{property.title}</h1>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                    property.status
                  )}`}
                >
                  {getStatusLabel(property.status)}
                </span>
                {property.isPublished && (
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Publié
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-slate-600 flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                {property.address}
                {property.locationZone && `, ${property.locationZone}`}
              </p>
            </div>
          </div>
          <Link to={`/tenant/${effectiveTenantId}/properties/${id}/edit`}>
            <Button>
              <Edit className="h-4 w-4 mr-2" />
              Modifier
            </Button>
          </Link>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Images and Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Property Images Gallery */}
            <div className="bg-white rounded-lg shadow p-6">
              {(() => {
                const photos = media.filter(m => m.mediaType === PropertyMediaType.PHOTO);
                if (photos.length === 0) {
                  return (
                    <div className="h-96 bg-slate-200 flex items-center justify-center rounded-lg">
                      <Building2 className="h-24 w-24 text-slate-400" />
                    </div>
                  );
                }
                
                const currentPhoto = photos[currentImageIndex];
                return (
                  <div className="relative">
                    {/* Main Image */}
                    <div className="h-96 bg-slate-100 rounded-lg overflow-hidden relative">
                      <img
                        src={getMediaUrl(currentPhoto)}
                        alt={currentPhoto.fileName}
                        className="w-full h-full object-cover"
                      />
                      
                      {/* Navigation Arrows */}
                      {photos.length > 1 && (
                        <>
                          <button
                            onClick={prevImage}
                            className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-2 shadow-lg transition-colors"
                          >
                            <ChevronLeft className="h-6 w-6 text-gray-700" />
                          </button>
                          <button
                            onClick={nextImage}
                            className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-2 shadow-lg transition-colors"
                          >
                            <ChevronRight className="h-6 w-6 text-gray-700" />
                          </button>
                        </>
                      )}
                      
                      {/* Image Counter */}
                      <div className="absolute bottom-4 right-4 bg-black/60 text-white px-3 py-1 rounded-full text-sm">
                        {currentImageIndex + 1} / {photos.length}
                      </div>
                    </div>
                    
                    {/* Thumbnail Strip */}
                    {photos.length > 1 && (
                      <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
                        {photos.map((photo, index) => (
                          <button
                            key={photo.id}
                            onClick={() => setCurrentImageIndex(index)}
                            className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-colors ${
                              index === currentImageIndex ? 'border-blue-500' : 'border-transparent hover:border-gray-300'
                            }`}
                          >
                            <img
                              src={getMediaUrl(photo)}
                              alt={photo.fileName}
                              className="w-full h-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
            
            {/* Videos Section */}
            {media.filter(m => m.mediaType === PropertyMediaType.VIDEO).length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold text-slate-900 mb-4">Vidéos</h2>
                <div className="grid grid-cols-2 gap-4">
                  {media.filter(m => m.mediaType === PropertyMediaType.VIDEO).map((video) => (
                    <div key={video.id} className="relative aspect-video bg-slate-100 rounded-lg overflow-hidden">
                      <video
                        src={getMediaUrl(video)}
                        controls
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Description */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-slate-900 mb-4">Description</h2>
              <p className="text-gray-700 whitespace-pre-wrap">
                {property.description || 'Aucune description disponible'}
              </p>
            </div>

            {/* Characteristics */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-slate-900 mb-4">Caractéristiques</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {property.surfaceArea && (
                  <div className="flex items-center gap-2">
                    <Square className="h-5 w-5 text-gray-400" />
                    <div>
                      <div className="text-sm text-gray-600">Surface</div>
                      <div className="font-medium">{property.surfaceArea} m²</div>
                    </div>
                  </div>
                )}
                {property.rooms && (
                  <div className="flex items-center gap-2">
                    <Square className="h-5 w-5 text-gray-400" />
                    <div>
                      <div className="text-sm text-gray-600">Pièces</div>
                      <div className="font-medium">{property.rooms}</div>
                    </div>
                  </div>
                )}
                {property.bedrooms && (
                  <div className="flex items-center gap-2">
                    <Bed className="h-5 w-5 text-gray-400" />
                    <div>
                      <div className="text-sm text-gray-600">Chambres</div>
                      <div className="font-medium">{property.bedrooms}</div>
                    </div>
                  </div>
                )}
                {property.bathrooms && (
                  <div className="flex items-center gap-2">
                    <Bath className="h-5 w-5 text-gray-400" />
                    <div>
                      <div className="text-sm text-gray-600">Salles de bain</div>
                      <div className="font-medium">{property.bathrooms}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Sidebar */}
          <div className="space-y-6">
            {/* Price Card */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-3xl font-bold text-blue-600 mb-2">
                {formatPrice(property.price, property.currency)}
              </div>
              <div className="text-sm text-gray-600 mb-4">
                {property.transactionModes
                  .map((mode) =>
                    mode === 'SALE'
                      ? 'Vente'
                      : mode === 'RENTAL'
                      ? 'Location'
                      : 'Court terme'
                  )
                  .join(' • ')}
              </div>
              {property.fees && (
                <div className="text-sm text-gray-600 mb-4">
                  Frais: {formatPrice(property.fees, property.currency)}
                </div>
              )}
            </div>

            {/* Property Info */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold text-slate-900 mb-4">Informations</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Référence</span>
                  <span className="font-medium">{property.internalReference}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Type</span>
                  <span className="font-medium">{property.propertyType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Propriété de</span>
                  <span className="font-medium">
                    {property.owner
                      ? property.owner.fullName || property.owner.email
                      : property.ownershipType === 'TENANT'
                      ? 'Tenant'
                      : property.ownershipType === 'PUBLIC'
                      ? 'Publique'
                      : 'Client'}
                  </span>
                </div>
                {property.furnishingStatus && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Meublé</span>
                    <span className="font-medium">
                      {property.furnishingStatus === 'FURNISHED'
                        ? 'Oui'
                        : property.furnishingStatus === 'UNFURNISHED'
                        ? 'Non'
                        : 'Partiellement'}
                    </span>
                  </div>
                )}
                {property.availability && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Disponibilité</span>
                    <span className="font-medium">
                      {property.availability === 'AVAILABLE'
                        ? 'Disponible'
                        : property.availability === 'UNAVAILABLE'
                        ? 'Indisponible'
                        : 'Bientôt disponible'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Location */}
            {property.locationZone && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="font-semibold text-slate-900 mb-2 flex items-center">
                  <MapPin className="h-4 w-4 mr-2" />
                  Localisation
                </h3>
                <div className="text-sm text-gray-600">
                  <div className="font-medium mb-1">{property.address}</div>
                  <div>{property.locationZone}</div>
                  {property.latitude && property.longitude && (
                    <div className="mt-2 text-xs text-gray-500">
                      Coordonnées: {property.latitude.toFixed(6)}, {property.longitude.toFixed(6)}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Visit Scheduler */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold text-slate-900 mb-4 flex items-center">
                <Calendar className="h-4 w-4 mr-2" />
                Planifier une visite
              </h3>
              <PropertyVisitScheduler
                propertyId={id!}
                tenantId={effectiveTenantId!}
                onVisitScheduled={() => {
                  // Optionally reload property data or show success message
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

