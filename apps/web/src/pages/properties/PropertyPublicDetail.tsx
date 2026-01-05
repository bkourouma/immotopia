import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { Property } from '../../types/property-types';
import apiClient from '../../utils/api-client';
import { Button } from '../../components/ui/button';
import { ArrowLeft, MapPin, Bed, Bath, Square, Building2, Loader2 } from 'lucide-react';

export const PropertyPublicDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadProperty();
    }
  }, [id]);

  const loadProperty = async () => {
    if (!id) return;

    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get<{ success: boolean; data: Property }>(
        `/public/properties/${id}`
      );
      setProperty(response.data.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Propriété non trouvée ou non publiée');
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price?: number, currency?: string) => {
    if (!price) return 'Prix sur demande';
    const formatted = new Intl.NumberFormat('fr-FR').format(price);
    return `${formatted} ${currency || 'EUR'}`;
  };

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
          <Link to="/public/properties">
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
        <div className="flex items-center gap-4">
          <Link to="/public/properties">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Retour
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{property.title}</h1>
            <p className="mt-2 text-sm text-slate-600">{property.address}</p>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Images and Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Property Image */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="h-96 bg-slate-200 flex items-center justify-center rounded-lg">
                <Building2 className="h-24 w-24 text-slate-400" />
              </div>
            </div>

            {/* Description */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-slate-900 mb-4">Description</h2>
              <p className="text-gray-700 whitespace-pre-wrap">{property.description}</p>
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
                {property.transactionModes.map((mode) =>
                  mode === 'SALE' ? 'Vente' : mode === 'RENTAL' ? 'Location' : 'Court terme'
                ).join(' • ')}
              </div>
              <Button className="w-full">Contacter l'agence</Button>
            </div>

            {/* Location */}
            {property.locationZone && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="font-semibold text-slate-900 mb-2">Localisation</h3>
                <div className="flex items-start gap-2 text-sm text-gray-600">
                  <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <div>{property.address}</div>
                    <div className="mt-1">{property.locationZone}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Property Info */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold text-slate-900 mb-4">Informations</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Référence</span>
                  <span className="font-medium">{property.internalReference}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Type</span>
                  <span className="font-medium">{property.propertyType}</span>
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
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};





