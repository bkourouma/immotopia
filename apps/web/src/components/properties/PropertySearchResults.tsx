import React from 'react';
import { Link } from 'react-router-dom';
import { Building2, MapPin, Bed, Bath, Square, Eye } from 'lucide-react';
import { Property } from '../../types/property-types';
import { Button } from '../ui/button';

interface PropertySearchResultsProps {
  properties: Property[];
  tenantId: string;
  loading?: boolean;
  onPropertyClick?: (property: Property) => void;
}

export const PropertySearchResults: React.FC<PropertySearchResultsProps> = ({
  properties,
  tenantId,
  loading = false,
  onPropertyClick,
}) => {
  const formatPrice = (price?: number, currency?: string) => {
    if (!price) return 'Prix sur demande';
    const formatted = new Intl.NumberFormat('fr-FR').format(price);
    return `${formatted} ${currency || 'EUR'}`;
  };

  const getStatusBadge = (status: string, isPublished: boolean) => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      DRAFT: { label: 'Brouillon', className: 'bg-gray-100 text-gray-800' },
      UNDER_REVIEW: { label: 'En révision', className: 'bg-yellow-100 text-yellow-800' },
      AVAILABLE: { label: 'Disponible', className: 'bg-green-100 text-green-800' },
      RESERVED: { label: 'Réservé', className: 'bg-orange-100 text-orange-800' },
      UNDER_OFFER: { label: 'Sous offre', className: 'bg-blue-100 text-blue-800' },
      RENTED: { label: 'Loué', className: 'bg-purple-100 text-purple-800' },
      SOLD: { label: 'Vendu', className: 'bg-red-100 text-red-800' },
      ARCHIVED: { label: 'Archivé', className: 'bg-gray-100 text-gray-800' },
    };

    const config = statusConfig[status] || statusConfig.DRAFT;
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${config.className}`}>
        {config.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Recherche en cours...</p>
      </div>
    );
  }

  if (properties.length === 0) {
    return (
      <div className="text-center py-12">
        <Building2 className="h-16 w-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Aucun résultat trouvé
        </h3>
        <p className="text-gray-600">
          Essayez de modifier vos critères de recherche
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {properties.map((property) => (
        <div
          key={property.id}
          className="bg-white rounded-lg shadow overflow-hidden hover:shadow-lg transition-shadow"
        >
          {/* Property Image */}
          <div className="h-48 bg-slate-200 flex items-center justify-center relative">
            <Building2 className="h-16 w-16 text-slate-400" />
            {property.isPublished && (
              <div className="absolute top-2 right-2 bg-blue-600 text-white text-xs px-2 py-1 rounded">
                Publié
              </div>
            )}
          </div>

          {/* Property Details */}
          <div className="p-5">
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-lg font-semibold text-slate-900 line-clamp-1 flex-1">
                {property.title}
              </h3>
              {getStatusBadge(property.status, property.isPublished)}
            </div>

            <div className="flex items-center gap-1 text-sm text-gray-600 mb-3">
              <MapPin className="h-4 w-4" />
              <span className="line-clamp-1">{property.address}</span>
            </div>

            {/* Property Features */}
            <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-4">
              {property.rooms && (
                <div className="flex items-center gap-1">
                  <Square className="h-4 w-4" />
                  <span>{property.rooms} pièces</span>
                </div>
              )}
              {property.bedrooms && (
                <div className="flex items-center gap-1">
                  <Bed className="h-4 w-4" />
                  <span>{property.bedrooms} chambres</span>
                </div>
              )}
              {property.bathrooms && (
                <div className="flex items-center gap-1">
                  <Bath className="h-4 w-4" />
                  <span>{property.bathrooms} sdb</span>
                </div>
              )}
              {property.surfaceArea && (
                <div className="flex items-center gap-1">
                  <Square className="h-4 w-4" />
                  <span>{property.surfaceArea} m²</span>
                </div>
              )}
            </div>

            {/* Price */}
            <div className="mb-4">
              <span className="text-2xl font-bold text-blue-600">
                {formatPrice(property.price, property.currency)}
              </span>
            </div>

            {/* Actions */}
            <Link
              to={`/tenant/${tenantId}/properties/${property.id}`}
              className="block w-full"
              onClick={() => onPropertyClick && onPropertyClick(property)}
            >
              <Button variant="outline" className="w-full">
                <Eye className="h-4 w-4 mr-2" />
                Voir les détails
              </Button>
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
};





