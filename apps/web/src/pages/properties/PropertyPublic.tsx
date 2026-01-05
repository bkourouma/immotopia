import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { PropertySearchResults } from '../../components/properties/PropertySearchResults';
import { PropertySearchFilters } from '../../components/properties/PropertySearchFilters';
import { Property } from '../../types/property-types';
import apiClient from '../../utils/api-client';
import { Button } from '../../components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const PropertyPublic: React.FC = () => {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [currentFilters, setCurrentFilters] = useState<any>({});

  useEffect(() => {
    loadPublishedProperties();
  }, [pagination.page]);

  const loadPublishedProperties = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (currentFilters.propertyType) params.append('propertyType', currentFilters.propertyType);
      if (currentFilters.locationZone) params.append('locationZone', currentFilters.locationZone);
      if (currentFilters.priceMin) params.append('priceMin', currentFilters.priceMin);
      if (currentFilters.priceMax) params.append('priceMax', currentFilters.priceMax);
      if (currentFilters.surfaceAreaMin) params.append('surfaceAreaMin', currentFilters.surfaceAreaMin);
      if (currentFilters.surfaceAreaMax) params.append('surfaceAreaMax', currentFilters.surfaceAreaMax);
      if (currentFilters.rooms) params.append('rooms', currentFilters.rooms);
      if (currentFilters.transactionMode) params.append('transactionMode', currentFilters.transactionMode);
      params.append('page', pagination.page.toString());
      params.append('limit', pagination.limit.toString());

      const response = await apiClient.get<{
        success: boolean;
        data: Property[];
        pagination: any;
      }>(`/public/properties?${params.toString()}`);

      setProperties(response.data.data);
      setPagination(response.data.pagination);
    } catch (error) {
      console.error('Error loading published properties:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (filters: any) => {
    setCurrentFilters(filters);
    setPagination((prev) => ({ ...prev, page: 1 }));
    // Reload will happen via useEffect when page changes
  };

  const handlePageChange = (newPage: number) => {
    setPagination((prev) => ({ ...prev, page: newPage }));
  };

  // Reload when filters change
  useEffect(() => {
    if (Object.keys(currentFilters).length > 0) {
      loadPublishedProperties();
    }
  }, [currentFilters]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Portail Public</h1>
          <p className="mt-2 text-sm text-slate-600">
            Découvrez nos propriétés disponibles
          </p>
        </div>

        {/* Search Filters */}
        <PropertySearchFilters
          onSearch={handleSearch}
          onReset={() => {
            setCurrentFilters({});
            setPagination((prev) => ({ ...prev, page: 1 }));
          }}
          initialFilters={currentFilters}
        />

        {/* Results Count */}
        {pagination.total > 0 && (
          <div className="text-sm text-gray-600">
            {pagination.total} propriété{pagination.total > 1 ? 's' : ''} trouvée
            {pagination.total > 1 ? 's' : ''}
          </div>
        )}

        {/* Search Results */}
        <PropertySearchResults
          properties={properties}
          tenantId="" // Public portal doesn't need tenantId
          loading={loading}
        />

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between bg-white rounded-lg shadow p-4">
            <div className="text-sm text-slate-600">
              Page {pagination.page} sur {pagination.totalPages}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page === 1 || loading}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Précédent
              </Button>
              <Button
                variant="outline"
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page === pagination.totalPages || loading}
              >
                Suivant
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};





