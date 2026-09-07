import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { DealForm } from '../../components/crm/DealForm';
import { ActivityForm } from '../../components/crm/ActivityForm';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  listDeals,
  createDeal,
  updateDeal,
  createActivity,
  CrmDeal,
  CrmDealDetail,
  CreateCrmDealRequest,
  UpdateCrmDealRequest,
  CreateCrmActivityRequest,
  DealFilters,
} from '../../services/crm-service';
import { CrmDealStage } from '../../types/crm-types';
import { Briefcase, Plus, Search, Edit, Eye, LayoutGrid, Activity, Calendar, X, Download, FileSpreadsheet } from 'lucide-react';
import { DealKanban } from '../../components/crm/DealKanban';
import { AdvancedFilters, AdvancedFilters as AdvancedFiltersType } from '../../components/crm/AdvancedFilters';
import { exportToCSV, exportToExcel } from '../../utils/export-utils';

export const Deals: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [deals, setDeals] = useState<CrmDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingDeal, setEditingDeal] = useState<CrmDeal | null>(null);
  const [filters, setFilters] = useState<DealFilters>({
    page: 1,
    limit: 20,
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('kanban');
  const [showFilters, setShowFilters] = useState(false);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [selectedDealForActivity, setSelectedDealForActivity] = useState<CrmDeal | null>(null);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFiltersType>({});

  useEffect(() => {
    if (tenantId) {
      loadDeals();
    }
  }, [tenantId, filters, viewMode, advancedFilters]);

  const loadDeals = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      // For kanban view, load all deals (no pagination)
      const filtersToUse = viewMode === 'kanban' 
        ? { ...filters, limit: 1000, page: 1 }
        : filters;
      
      const response = await listDeals(tenantId, {
        ...filtersToUse,
        budgetMin: advancedFilters.budgetMin,
        budgetMax: advancedFilters.budgetMax,
        startDate: advancedFilters.startDate,
        endDate: advancedFilters.endDate,
        assignedTo: advancedFilters.assignedTo,
      });
      if (response.success) {
        setDeals(response.deals);
        setPagination(response.pagination);
      } else {
        setError('Erreur lors du chargement des affaires');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des affaires');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // Client-side filtering will be applied in the filtered deals
    loadDeals();
  };

  // Filter deals client-side based on search term
  const filteredDeals = React.useMemo(() => {
    if (!searchTerm.trim()) {
      return deals;
    }
    
    const searchLower = searchTerm.toLowerCase();
    return deals.filter((deal) => {
      const dealDetail = deal as CrmDealDetail;
      const contact = dealDetail.contact;
      
      // Search in contact name
      if (contact) {
        const fullName = `${contact.firstName} ${contact.lastName}`.toLowerCase();
        if (fullName.includes(searchLower)) return true;
        if (contact.email?.toLowerCase().includes(searchLower)) return true;
      }
      
      // Search in location
      if (deal.locationZone?.toLowerCase().includes(searchLower)) return true;
      
      // Search in deal type
      if (deal.type.toLowerCase().includes(searchLower)) return true;
      
      return false;
    });
  }, [deals, searchTerm]);

  const handleTypeFilter = (type: 'ACHAT' | 'LOCATION' | '') => {
    setFilters({ ...filters, page: 1, type: type || undefined });
  };

  const handleStageFilter = (stage: string) => {
    setFilters({ ...filters, page: 1, stage: (stage || undefined) as CrmDealStage | undefined });
  };

  const handleCreate = async (data: CreateCrmDealRequest | UpdateCrmDealRequest) => {
    if (!tenantId) return;
    try {
      await createDeal(tenantId, data as CreateCrmDealRequest);
      setShowForm(false);
      await loadDeals();
    } catch (err: any) {
      throw err;
    }
  };

  const handleUpdate = async (data: CreateCrmDealRequest | UpdateCrmDealRequest) => {
    if (!tenantId || !editingDeal) return;
    try {
      await updateDeal(tenantId, editingDeal.id, data as UpdateCrmDealRequest);
      setEditingDeal(null);
      await loadDeals();
    } catch (err: any) {
      throw err;
    }
  };

  const handleAddActivity = (deal: CrmDeal) => {
    setSelectedDealForActivity(deal);
    setShowActivityForm(true);
  };

  const handleCreateActivity = async (data: CreateCrmActivityRequest) => {
    if (!tenantId) return;
    try {
      await createActivity(tenantId, data);
      setShowActivityForm(false);
      setSelectedDealForActivity(null);
      // Optionally reload deals or show success message
    } catch (err: any) {
      throw err;
    }
  };


  const getStageLabel = (stage: string): string => {
    const labels: Record<string, string> = {
      NEW: 'Nouveau',
      QUALIFIED: 'Qualifié',
      APPOINTMENT: 'Rendez-vous',
      VISIT: 'Visite',
      NEGOTIATION: 'Négociation',
      WON: 'Gagné',
      LOST: 'Perdu',
    };
    return labels[stage] || stage;
  };

  const getStageBadge = (stage: string) => {
    const styles: Record<string, string> = {
      NEW: 'bg-gray-100 text-gray-800',
      QUALIFIED: 'bg-blue-100 text-blue-800',
      APPOINTMENT: 'bg-yellow-100 text-yellow-800',
      VISIT: 'bg-orange-100 text-orange-800',
      NEGOTIATION: 'bg-purple-100 text-purple-800',
      WON: 'bg-green-100 text-green-800',
      LOST: 'bg-red-100 text-red-800',
    };
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
          styles[stage] || styles.NEW
        }`}
      >
        {getStageLabel(stage)}
      </span>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-3 w-full">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Affaires</h1>
            <p className="text-gray-600 mt-0.5 text-sm">Gérez votre pipeline de ventes</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                const exportData = filteredDeals.map(deal => {
                  const dealDetail = deal as CrmDealDetail;
                  const contact = dealDetail.contact;
                  return {
                    'Type': deal.type,
                    'Contact': contact ? `${contact.firstName} ${contact.lastName}` : `Contact ID: ${deal.contactId}`,
                    'Email': contact?.email || '',
                    'Téléphone': contact?.phone || '',
                    'Stade': getStageLabel(deal.stage),
                    'Budget min': deal.budgetMin ? deal.budgetMin.toLocaleString() + ' FCFA' : '',
                    'Budget max': deal.budgetMax ? deal.budgetMax.toLocaleString() + ' FCFA' : '',
                    'Localisation': deal.locationZone || '',
                    'Date de création': new Date(deal.createdAt).toLocaleDateString('fr-FR'),
                  };
                });
                exportToCSV(exportData, 'affaires');
              }}
            >
              <Download className="h-3 w-3 mr-1" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                const exportData = filteredDeals.map(deal => {
                  const dealDetail = deal as CrmDealDetail;
                  const contact = dealDetail.contact;
                  return {
                    'Type': deal.type,
                    'Contact': contact ? `${contact.firstName} ${contact.lastName}` : `Contact ID: ${deal.contactId}`,
                    'Email': contact?.email || '',
                    'Téléphone': contact?.phone || '',
                    'Stade': getStageLabel(deal.stage),
                    'Budget min': deal.budgetMin ? deal.budgetMin.toLocaleString() + ' FCFA' : '',
                    'Budget max': deal.budgetMax ? deal.budgetMax.toLocaleString() + ' FCFA' : '',
                    'Localisation': deal.locationZone || '',
                    'Date de création': new Date(deal.createdAt).toLocaleDateString('fr-FR'),
                  };
                });
                exportToExcel(exportData, 'affaires', 'Affaires');
              }}
            >
              <FileSpreadsheet className="h-3 w-3 mr-1" />
              Excel
            </Button>
            <Button onClick={() => setShowForm(true)} size="sm" className="h-8 text-xs">
              <Plus className="h-3 w-3 mr-1" />
              Nouvelle affaire
            </Button>
          </div>
        </div>

        {showForm && (
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold mb-3">Créer une nouvelle affaire</h2>
            <DealForm tenantId={tenantId!} onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
          </div>
        )}

        {editingDeal && (
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold mb-3">Modifier l'affaire</h2>
            <DealForm tenantId={tenantId!} deal={editingDeal} onSubmit={handleUpdate} onCancel={() => setEditingDeal(null)} />
          </div>
        )}

        {showActivityForm && selectedDealForActivity && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Ajouter une activité à l'affaire</h2>
            <ActivityForm
              tenantId={tenantId!}
              contactId={selectedDealForActivity.contactId}
              dealId={selectedDealForActivity.id}
              onSubmit={handleCreateActivity}
              onCancel={() => {
                setShowActivityForm(false);
                setSelectedDealForActivity(null);
              }}
            />
          </div>
        )}


        {/* Search and Filters Bar */}
        <div className="bg-white rounded-lg shadow p-3 mb-3">
          <div className="flex gap-2 items-center mb-2">
            {/* Search Input */}
            <form onSubmit={handleSearch} className="flex-1">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Rechercher par nom, email, localisation..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 pr-8 h-8 text-xs"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </form>
            
            {/* Results Count */}
            {searchTerm && (
              <span className="text-xs text-gray-500 whitespace-nowrap">
                {filteredDeals.length} résultat{filteredDeals.length !== 1 ? 's' : ''}
              </span>
            )}
            
            {/* Filter Toggle */}
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-8"
              onClick={() => setShowFilters(!showFilters)}
            >
              Filtres
            </Button>
            
            {/* View Toggle */}
            <div className="flex gap-1 border-l pl-2 ml-2">
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="sm"
                className="text-xs h-8"
                onClick={() => setViewMode('list')}
              >
                Liste
              </Button>
              <Button
                variant={viewMode === 'kanban' ? 'default' : 'outline'}
                size="sm"
                className="text-xs h-8"
                onClick={() => setViewMode('kanban')}
              >
                <LayoutGrid className="h-3 w-3 mr-1" />
                Pipeline
              </Button>
            </div>
          </div>
          
          {/* Filters Panel */}
          {showFilters && (
            <div className="border-t pt-2 mt-2 space-y-2">
              <div className="flex gap-2 flex-wrap">
                <span className="text-xs font-medium text-gray-700 self-center">Type:</span>
                <Button
                  variant={!filters.type ? 'default' : 'outline'}
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => handleTypeFilter('')}
                >
                  Tous
                </Button>
                <Button
                  variant={filters.type === 'ACHAT' ? 'default' : 'outline'}
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => handleTypeFilter('ACHAT')}
                >
                  Achat
                </Button>
                <Button
                  variant={filters.type === 'LOCATION' ? 'default' : 'outline'}
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => handleTypeFilter('LOCATION')}
                >
                  Location
                </Button>
              </div>
              
              <div className="flex gap-2 flex-wrap">
                <span className="text-xs font-medium text-gray-700 self-center">Stade:</span>
                <Button
                  variant={!filters.stage ? 'default' : 'outline'}
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => handleStageFilter('')}
                >
                  Tous
                </Button>
                {['NEW', 'QUALIFIED', 'APPOINTMENT', 'VISIT', 'NEGOTIATION', 'WON', 'LOST'].map((stage) => (
                  <Button
                    key={stage}
                    variant={filters.stage === stage ? 'default' : 'outline'}
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => handleStageFilter(stage)}
                  >
                    {getStageLabel(stage)}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Advanced Filters */}
          <div className="mt-3">
            <AdvancedFilters
              tenantId={tenantId}
              config={{
                showDateRange: true,
                showAssignedTo: true,
                showBudget: true,
                dateRangeLabel: 'Date de création',
              }}
              filters={advancedFilters}
              onFiltersChange={setAdvancedFilters}
            />
          </div>
        </div>


        {/* Deals View */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            <p className="mt-2 text-gray-600">Chargement des affaires...</p>
          </div>
        ) : deals.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Briefcase className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Aucune affaire trouvée</h3>
            <p className="text-gray-600 mb-4">Commencez par créer votre première affaire.</p>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Créer une affaire
            </Button>
          </div>
        ) : viewMode === 'kanban' ? (
          <div className="bg-white rounded-lg shadow p-3 w-full overflow-x-auto">
            <DealKanban
              deals={filteredDeals}
              loading={loading}
              onDealClick={(deal) => navigate(`/tenant/${tenantId}/crm/deals/${deal.id}`)}
              onStageChange={async (dealId, newStage) => {
                const deal = filteredDeals.find((d) => d.id === dealId) || deals.find((d) => d.id === dealId);
                if (deal && tenantId) {
                  try {
                    await updateDeal(tenantId, dealId, {
                      stage: newStage,
                      version: deal.version,
                    });
                    // Reload deals
                    await loadDeals();
                  } catch (err: any) {
                    alert(err.response?.data?.message || 'Erreur lors de la mise à jour du stade de l\'affaire');
                  }
                }
              }}
              onAddDeal={(stage) => {
                // Set the stage in the form and show it
                setShowForm(true);
                // You could pre-fill the stage in the form if needed
              }}
            />
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Stade
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Budget
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Localisation
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredDeals.map((deal) => (
                  <tr key={deal.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{deal.type}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {(() => {
                          const dealDetail = deal as CrmDealDetail;
                          return dealDetail.contact
                            ? `${dealDetail.contact.firstName} ${dealDetail.contact.lastName}`
                            : `Contact ID: ${deal.contactId}`;
                        })()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStageBadge(deal.stage)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {deal.budgetMin && deal.budgetMax
                          ? `${deal.budgetMin.toLocaleString()} - ${deal.budgetMax.toLocaleString()} FCFA`
                          : deal.budgetMax
                          ? `Jusqu'à ${deal.budgetMax.toLocaleString()} FCFA`
                          : '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">{deal.locationZone || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAddActivity(deal)}
                          title="Ajouter une activité"
                        >
                          <Activity className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAddActivity(deal)}
                          title="Ajouter un rendez-vous"
                        >
                          <Calendar className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/tenant/${tenantId}/crm/deals/${deal.id}`)}
                          title="Voir les détails"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingDeal(deal)}
                          title="Modifier"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="bg-gray-50 px-6 py-3 flex items-center justify-between border-t border-gray-200">
                <div className="text-sm text-gray-700">
                  Affichage de {((pagination.page - 1) * pagination.limit) + 1} à{' '}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} sur{' '}
                  {pagination.total} affaires
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFilters({ ...filters, page: pagination.page - 1 })}
                    disabled={pagination.page === 1}
                  >
                    Précédent
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFilters({ ...filters, page: pagination.page + 1 })}
                    disabled={pagination.page === pagination.totalPages}
                  >
                    Suivant
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

