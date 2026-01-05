import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Search, X, Filter } from 'lucide-react';
import {
  PropertyType,
  PropertyTransactionMode,
  PropertyStatus,
  PropertyOwnershipType,
} from '../../types/property-types';

interface PropertySearchFiltersProps {
  onSearch: (filters: any) => void;
  onReset?: () => void;
  initialFilters?: any;
}

const propertyTypeLabels: Record<PropertyType, string> = {
  [PropertyType.APPARTEMENT]: 'Appartement',
  [PropertyType.MAISON_VILLA]: 'Maison/Villa',
  [PropertyType.STUDIO]: 'Studio',
  [PropertyType.DUPLEX_TRIPLEX]: 'Duplex/Triplex',
  [PropertyType.CHAMBRE_COLOCATION]: 'Chambre (Colocation)',
  [PropertyType.BUREAU]: 'Bureau',
  [PropertyType.BOUTIQUE_COMMERCIAL]: 'Boutique/Commercial',
  [PropertyType.ENTREPOT_INDUSTRIEL]: 'Entrepôt/Industriel',
  [PropertyType.TERRAIN]: 'Terrain',
  [PropertyType.IMMEUBLE]: 'Immeuble',
  [PropertyType.PARKING_BOX]: 'Parking/Box',
  [PropertyType.LOT_PROGRAMME_NEUF]: 'Lot (Programme neuf)',
};

export const PropertySearchFilters: React.FC<PropertySearchFiltersProps> = ({
  onSearch,
  onReset,
  initialFilters = {},
}) => {
  const [filters, setFilters] = useState({
    propertyType: initialFilters.propertyType || '',
    locationZone: initialFilters.locationZone || '',
    priceMin: initialFilters.priceMin || '',
    priceMax: initialFilters.priceMax || '',
    surfaceAreaMin: initialFilters.surfaceAreaMin || '',
    surfaceAreaMax: initialFilters.surfaceAreaMax || '',
    rooms: initialFilters.rooms || '',
    bedrooms: initialFilters.bedrooms || '',
    transactionMode: initialFilters.transactionMode || '',
    status: initialFilters.status || PropertyStatus.AVAILABLE,
    ownershipType: initialFilters.ownershipType || '',
  });

  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleChange = (field: string, value: any) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const searchFilters: any = {};

    if (filters.propertyType) searchFilters.propertyType = filters.propertyType;
    if (filters.locationZone) searchFilters.locationZone = filters.locationZone;
    if (filters.priceMin) searchFilters.priceMin = parseFloat(filters.priceMin);
    if (filters.priceMax) searchFilters.priceMax = parseFloat(filters.priceMax);
    if (filters.surfaceAreaMin) searchFilters.surfaceAreaMin = parseFloat(filters.surfaceAreaMin);
    if (filters.surfaceAreaMax) searchFilters.surfaceAreaMax = parseFloat(filters.surfaceAreaMax);
    if (filters.rooms) searchFilters.rooms = parseInt(filters.rooms, 10);
    if (filters.bedrooms) searchFilters.bedrooms = parseInt(filters.bedrooms, 10);
    if (filters.transactionMode) searchFilters.transactionMode = filters.transactionMode;
    if (filters.status) searchFilters.status = filters.status;
    if (filters.ownershipType) searchFilters.ownershipType = filters.ownershipType;

    onSearch(searchFilters);
  };

  const handleReset = () => {
    setFilters({
      propertyType: '',
      locationZone: '',
      priceMin: '',
      priceMax: '',
      surfaceAreaMin: '',
      surfaceAreaMax: '',
      rooms: '',
      bedrooms: '',
      transactionMode: '',
      status: PropertyStatus.AVAILABLE,
      ownershipType: '',
    });
    if (onReset) {
      onReset();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-white rounded-lg shadow p-6">
        {/* Basic Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Type de propriété
            </label>
            <select
              value={filters.propertyType}
              onChange={(e) => handleChange('propertyType', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            >
              <option value="">Tous les types</option>
              {Object.entries(propertyTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Zone/Quartier
            </label>
            <Input
              type="text"
              value={filters.locationZone}
              onChange={(e) => handleChange('locationZone', e.target.value)}
              placeholder="Ex: Cocody, Abidjan..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mode de transaction
            </label>
            <select
              value={filters.transactionMode}
              onChange={(e) => handleChange('transactionMode', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            >
              <option value="">Tous</option>
              <option value={PropertyTransactionMode.SALE}>Vente</option>
              <option value={PropertyTransactionMode.RENTAL}>Location</option>
              <option value={PropertyTransactionMode.SHORT_TERM}>Court terme</option>
            </select>
          </div>
        </div>

        {/* Advanced Filters Toggle */}
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
          >
            <Filter className="h-4 w-4" />
            {showAdvanced ? 'Masquer les filtres avancés' : 'Afficher les filtres avancés'}
          </button>
        </div>

        {/* Advanced Filters */}
        {showAdvanced && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Prix min (FCFA)
              </label>
              <Input
                type="number"
                value={filters.priceMin}
                onChange={(e) => handleChange('priceMin', e.target.value)}
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Prix max (FCFA)
              </label>
              <Input
                type="number"
                value={filters.priceMax}
                onChange={(e) => handleChange('priceMax', e.target.value)}
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Surface min (m²)
              </label>
              <Input
                type="number"
                value={filters.surfaceAreaMin}
                onChange={(e) => handleChange('surfaceAreaMin', e.target.value)}
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Surface max (m²)
              </label>
              <Input
                type="number"
                value={filters.surfaceAreaMax}
                onChange={(e) => handleChange('surfaceAreaMax', e.target.value)}
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre de pièces min
              </label>
              <Input
                type="number"
                value={filters.rooms}
                onChange={(e) => handleChange('rooms', e.target.value)}
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre de chambres min
              </label>
              <Input
                type="number"
                value={filters.bedrooms}
                onChange={(e) => handleChange('bedrooms', e.target.value)}
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Statut
              </label>
              <select
                value={filters.status}
                onChange={(e) => handleChange('status', e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2"
              >
                <option value={PropertyStatus.AVAILABLE}>Disponible</option>
                <option value={PropertyStatus.RESERVED}>Réservé</option>
                <option value={PropertyStatus.UNDER_OFFER}>Sous offre</option>
                <option value="">Tous les statuts</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type de propriété
              </label>
              <select
                value={filters.ownershipType}
                onChange={(e) => handleChange('ownershipType', e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2"
              >
                <option value="">Tous</option>
                <option value={PropertyOwnershipType.TENANT}>Propriété agence</option>
                <option value={PropertyOwnershipType.PUBLIC}>Propriété privée</option>
                <option value={PropertyOwnershipType.CLIENT}>Mandat de gestion</option>
              </select>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-4 border-t mt-4">
          <Button type="submit" className="flex-1">
            <Search className="h-4 w-4 mr-2" />
            Rechercher
          </Button>
          <Button type="button" variant="outline" onClick={handleReset}>
            <X className="h-4 w-4 mr-2" />
            Réinitialiser
          </Button>
        </div>
      </div>
    </form>
  );
};





