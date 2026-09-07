import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { PropertySearchFilters } from '../../components/properties/PropertySearchFilters';
import { PropertySearchResults } from '../../components/properties/PropertySearchResults';
import { searchProperties, Property } from '../../services/property-service';
import { useAuth } from '../../hooks/useAuth';
import { PropertySearchRequest } from '../../types/property-types';
import { Button } from '../../components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const PropertySearch: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [currentFilters, setCurrentFilters] = useState<any>({});

  const handleSearch = async (filters: any) => {
    if (!effectiveTenantId) return;

    setLoading(true);
    setCurrentFilters(filters);
    try {
      const searchRequest: PropertySearchRequest = {
        ...filters,
        page: 1,
        limit: 20,
      };

      const response = await searchProperties(effectiveTenantId, searchRequest);
      setProperties(response.properties);
      setPagination(response.pagination);
    } catch (error: any) {
      console.error('Error searching properties:', error);
      alert(error.response?.data?.error || 'Erreur lors de la recherche');
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = async (newPage: number) => {
    if (!effectiveTenantId) return;

    setLoading(true);
    try {
      const searchRequest: PropertySearchRequest = {
        ...currentFilters,
        page: newPage,
        limit: 20,
      };

      const response = await searchProperties(effectiveTenantId, searchRequest);
      setProperties(response.properties);
      setPagination(response.pagination);
    } catch (error: any) {
      console.error('Error loading page:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setProperties([]);
    setPagination({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    });
    setCurrentFilters({});
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
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Recherche de propriétés</h1>
          <p className="mt-2 text-sm text-slate-600">
            Trouvez la propriété idéale selon vos critères
          </p>
        </div>

        {/* Search Filters */}
        <PropertySearchFilters
          onSearch={handleSearch}
          onReset={handleReset}
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
          tenantId={effectiveTenantId}
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





