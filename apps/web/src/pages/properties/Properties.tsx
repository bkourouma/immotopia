import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { Building2, Plus, Search, Edit, Eye, Loader2, ChevronDown, ChevronUp, X, Filter } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { listProperties, Property } from '../../services/property-service';
import { PropertyMedia, PropertyMediaType, PropertyType, PropertyTransactionMode, PropertyStatus } from '../../types/property-types';
import apiClient from '../../utils/api-client';
import { useAuth } from '../../hooks/useAuth';
import { GeographicLocation, getAllCommunes } from '../../services/geographic-service';
import { CommuneSearchableSelect } from '../../components/ui/commune-searchable-select';

export const Properties: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
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
    totalPages: 0,
  });
  const [propertyImages, setPropertyImages] = useState<Record<string, string>>({});
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
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
    maxBedrooms: '',
  });
  const [activeFiltersCount, setActiveFiltersCount] = useState(0);

  // Property type labels
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
    LOT_PROGRAMME_NEUF: 'Lot programme neuf',
  };

  const transactionModeLabels: Record<string, string> = {
    SALE: 'Vente',
    RENTAL: 'Location',
    SHORT_TERM: 'Location courte durée',
  };

  const statusLabels: Record<string, string> = {
    DRAFT: 'Brouillon',
    UNDER_REVIEW: 'En révision',
    AVAILABLE: 'Disponible',
    RESERVED: 'Réservé',
    UNDER_OFFER: 'Sous offre',
    RENTED: 'Loué',
    SOLD: 'Vendu',
    ARCHIVED: 'Archivé',
  };

  // Count active filters
  useEffect(() => {
    const count = Object.values(filters).filter(v => v !== '').length;
    setActiveFiltersCount(count + (searchTerm ? 1 : 0));
  }, [filters, searchTerm]);

  useEffect(() => {
    if (effectiveTenantId) {
      loadProperties();
    }
  }, [effectiveTenantId, pagination.page]);

  // Load communes on mount for filtering
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
        status: filters.status || undefined,
      });
      
      // Apply client-side filtering for fields not supported by API
      let filteredProperties = response.properties;
      
      // Text search
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filteredProperties = filteredProperties.filter(p => 
          p.title?.toLowerCase().includes(term) ||
          p.address?.toLowerCase().includes(term) ||
          p.internalReference?.toLowerCase().includes(term)
        );
      }
      
      // City filter (by commune name)
      if (filters.city) {
        // Find the selected commune to get its name
        const selectedCommune = communes.find(c => c.communeId === filters.city);
        if (selectedCommune) {
          const communeName = selectedCommune.commune.toLowerCase();
          const regionName = selectedCommune.region.toLowerCase();
          filteredProperties = filteredProperties.filter(p => {
            const addressLower = p.address?.toLowerCase() || '';
            const locationZoneLower = p.locationZone?.toLowerCase() || '';
            return addressLower.includes(communeName) || 
                   locationZoneLower.includes(communeName) ||
                   addressLower.includes(regionName) ||
                   locationZoneLower.includes(regionName);
          });
        }
      }
      
      // Price filters
      if (filters.minPrice) {
        filteredProperties = filteredProperties.filter(p => (p.price || 0) >= Number(filters.minPrice));
      }
      if (filters.maxPrice) {
        filteredProperties = filteredProperties.filter(p => (p.price || 0) <= Number(filters.maxPrice));
      }
      
      // Surface filters
      if (filters.minSurface) {
        filteredProperties = filteredProperties.filter(p => (p.surfaceArea || 0) >= Number(filters.minSurface));
      }
      if (filters.maxSurface) {
        filteredProperties = filteredProperties.filter(p => (p.surfaceArea || 0) <= Number(filters.maxSurface));
      }
      
      // Rooms filters
      if (filters.minRooms) {
        filteredProperties = filteredProperties.filter(p => (p.rooms || 0) >= Number(filters.minRooms));
      }
      if (filters.maxRooms) {
        filteredProperties = filteredProperties.filter(p => (p.rooms || 0) <= Number(filters.maxRooms));
      }
      
      // Bedrooms filters
      if (filters.minBedrooms) {
        filteredProperties = filteredProperties.filter(p => (p.bedrooms || 0) >= Number(filters.minBedrooms));
      }
      if (filters.maxBedrooms) {
        filteredProperties = filteredProperties.filter(p => (p.bedrooms || 0) <= Number(filters.maxBedrooms));
      }
      
      setProperties(filteredProperties);
      setPagination(response.pagination);
      
      // Load primary images for each property
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
      maxBedrooms: '',
    });
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  // Reload when filters are cleared
  useEffect(() => {
    if (activeFiltersCount === 0 && effectiveTenantId) {
      loadProperties();
    }
  }, [activeFiltersCount]);

  const loadPropertyImages = async (props: Property[]) => {
    if (!effectiveTenantId) return;
    
    const imageMap: Record<string, string> = {};
    const apiBaseUrl = process.env.REACT_APP_API_URL || 'http://localhost:8001/api';
    const mediaBaseUrl = apiBaseUrl.replace('/api', '');
    
    await Promise.all(
      props.map(async (property) => {
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
          // Ignore errors for individual property images
        }
      })
    );
    
    setPropertyImages(imageMap);
  };

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
      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${config.className}`}>
        {config.label}
        {isPublished && (
          <span className="ml-2 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800">
            Publié
          </span>
        )}
      </span>
    );
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Propriétés</h1>
            <p className="mt-2 text-sm text-slate-600">
              Gérez toutes vos propriétés immobilières
            </p>
          </div>
          <Link to={`/tenant/${effectiveTenantId}/properties/new`}>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Ajouter une propriété
            </Button>
          </Link>
        </div>

        {/* Search and Filters */}
        <div className="bg-white rounded-lg shadow p-6">
          {/* Main search bar */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                type="search"
                placeholder="Rechercher par titre, adresse, référence..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <Button onClick={handleSearch}>
              <Search className="h-4 w-4 mr-2" />
              Rechercher
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setShowAdvancedSearch(!showAdvancedSearch)}
              className="relative"
            >
              <Filter className="h-4 w-4 mr-2" />
              Filtres avancés
              {showAdvancedSearch ? (
                <ChevronUp className="h-4 w-4 ml-2" />
              ) : (
                <ChevronDown className="h-4 w-4 ml-2" />
              )}
              {activeFiltersCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-blue-600 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  {activeFiltersCount}
                </span>
              )}
            </Button>
          </div>

          {/* Advanced search panel */}
          {showAdvancedSearch && (
            <div className="mt-6 pt-6 border-t border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-slate-700">Filtres avancés</h3>
                {activeFiltersCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="text-slate-500 hover:text-slate-700">
                    <X className="h-4 w-4 mr-1" />
                    Effacer les filtres
                  </Button>
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Property Type */}
                <div className="space-y-2">
                  <label className="text-sm text-slate-600 block">Type de bien</label>
                  <select
                    value={filters.propertyType}
                    onChange={(e) => setFilters(prev => ({ ...prev, propertyType: e.target.value }))}
                    className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Tous les types</option>
                    {Object.entries(propertyTypeLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>

                {/* Transaction Mode */}
                <div className="space-y-2">
                  <label className="text-sm text-slate-600 block">Mode de transaction</label>
                  <select
                    value={filters.transactionMode}
                    onChange={(e) => setFilters(prev => ({ ...prev, transactionMode: e.target.value }))}
                    className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Tous les modes</option>
                    {Object.entries(transactionModeLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>

                {/* Status */}
                <div className="space-y-2">
                  <label className="text-sm text-slate-600 block">Statut</label>
                  <select
                    value={filters.status}
                    onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Tous les statuts</option>
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>

                {/* City */}
                <div className="space-y-2">
                  <label className="text-sm text-slate-600 block">Ville</label>
                  <CommuneSearchableSelect
                    value={filters.city}
                    onChange={(communeId) => setFilters(prev => ({ ...prev, city: communeId }))}
                    placeholder="Rechercher une ville..."
                  />
                </div>

                {/* Price Range */}
                <div className="space-y-2">
                  <label className="text-sm text-slate-600 block">Prix minimum (FCFA)</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={filters.minPrice}
                    onChange={(e) => setFilters(prev => ({ ...prev, minPrice: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-slate-600 block">Prix maximum (FCFA)</label>
                  <Input
                    type="number"
                    placeholder="Illimité"
                    value={filters.maxPrice}
                    onChange={(e) => setFilters(prev => ({ ...prev, maxPrice: e.target.value }))}
                  />
                </div>

                {/* Surface Range */}
                <div className="space-y-2">
                  <label className="text-sm text-slate-600 block">Surface min (m²)</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={filters.minSurface}
                    onChange={(e) => setFilters(prev => ({ ...prev, minSurface: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-slate-600 block">Surface max (m²)</label>
                  <Input
                    type="number"
                    placeholder="Illimité"
                    value={filters.maxSurface}
                    onChange={(e) => setFilters(prev => ({ ...prev, maxSurface: e.target.value }))}
                  />
                </div>

                {/* Rooms Range */}
                <div className="space-y-2">
                  <label className="text-sm text-slate-600 block">Pièces min</label>
                  <Input
                    type="number"
                    placeholder="0"
                    min="0"
                    value={filters.minRooms}
                    onChange={(e) => setFilters(prev => ({ ...prev, minRooms: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-slate-600 block">Pièces max</label>
                  <Input
                    type="number"
                    placeholder="Illimité"
                    min="0"
                    value={filters.maxRooms}
                    onChange={(e) => setFilters(prev => ({ ...prev, maxRooms: e.target.value }))}
                  />
                </div>

                {/* Bedrooms Range */}
                <div className="space-y-2">
                  <label className="text-sm text-slate-600 block">Chambres min</label>
                  <Input
                    type="number"
                    placeholder="0"
                    min="0"
                    value={filters.minBedrooms}
                    onChange={(e) => setFilters(prev => ({ ...prev, minBedrooms: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-slate-600 block">Chambres max</label>
                  <Input
                    type="number"
                    placeholder="Illimité"
                    min="0"
                    value={filters.maxBedrooms}
                    onChange={(e) => setFilters(prev => ({ ...prev, maxBedrooms: e.target.value }))}
                  />
                </div>
              </div>

              {/* Apply filters button */}
              <div className="mt-6 flex justify-end">
                <Button onClick={handleSearch}>
                  <Search className="h-4 w-4 mr-2" />
                  Appliquer les filtres
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <>
            {/* Properties Grid */}
            {properties.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-12 text-center">
                <Building2 className="h-16 w-16 text-slate-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  Aucune propriété
                </h3>
                <p className="text-slate-600 mb-4">
                  Commencez par créer votre première propriété
                </p>
                <Link to={`/tenant/${effectiveTenantId}/properties/new`}>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Ajouter une propriété
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {properties.map((property) => (
                  <div
                    key={property.id}
                    className="bg-white rounded-lg shadow overflow-hidden hover:shadow-lg transition-shadow"
                  >
                    {propertyImages[property.id] ? (
                      <img 
                        src={propertyImages[property.id]} 
                        alt={property.title}
                        className="h-48 w-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    <div className={`h-48 bg-slate-200 flex items-center justify-center ${propertyImages[property.id] ? 'hidden' : ''}`}>
                      <Building2 className="h-16 w-16 text-slate-400" />
                    </div>
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="text-lg font-semibold text-slate-900 line-clamp-1">
                          {property.title}
                        </h3>
                        {getStatusBadge(property.status, property.isPublished)}
                      </div>
                      <p className="text-sm text-slate-600 mb-2 line-clamp-2">
                        {property.address}
                      </p>
                      <div className="text-sm text-slate-600 mb-4">
                        {property.rooms && `${property.rooms} pièces`}
                        {property.bedrooms && ` • ${property.bedrooms} chambres`}
                        {property.surfaceArea && ` • ${property.surfaceArea} m²`}
                      </div>
                      <div className="mb-4">
                        <span className="text-2xl font-bold text-blue-600">
                          {formatPrice(property.price, property.currency)}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Link
                          to={`/tenant/${effectiveTenantId}/properties/${property.id}`}
                          className="flex-1 text-center rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-200 transition-colors"
                        >
                          <Eye className="h-4 w-4 inline mr-2" />
                          Voir
                        </Link>
                        <Link
                          to={`/tenant/${effectiveTenantId}/properties/${property.id}/edit`}
                          className="flex-1 text-center rounded-md bg-blue-100 px-4 py-2 text-sm font-medium text-blue-900 hover:bg-blue-200 transition-colors"
                        >
                          <Edit className="h-4 w-4 inline mr-2" />
                          Modifier
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between bg-white rounded-lg shadow p-4">
                <div className="text-sm text-slate-600">
                  Page {pagination.page} sur {pagination.totalPages} ({pagination.total} propriétés)
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
                    disabled={pagination.page === 1}
                  >
                    Précédent
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
                    disabled={pagination.page === pagination.totalPages}
                  >
                    Suivant
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
};





