import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '../components/dashboard/dashboard-layout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { listContacts, CrmContact, listTags, CrmTag } from '../services/crm-service';
import { useAuth } from '../hooks/useAuth';
import { Users, Plus, Search, Eye, Home, User, ShoppingCart, Building2, X, Tag as TagIcon, Download, FileSpreadsheet } from 'lucide-react';
import { AdvancedFilters, AdvancedFilters as AdvancedFiltersType } from '../components/crm/AdvancedFilters';
import { exportToCSV, exportToExcel } from '../utils/export-utils';

export const Clients: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { tenantMembership } = useAuth();
  const [clients, setClients] = useState<CrmContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'PROPRIETAIRE' | 'LOCATAIRE' | 'ACQUEREUR' | 'COPROPRIETAIRE'>('ALL');
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<CrmTag | null>(null);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFiltersType>({});

  // Read tag from URL params
  useEffect(() => {
    const tagId = searchParams.get('tag');
    if (tagId) {
      setSelectedTagId(tagId);
      loadTagInfo(tagId);
    } else {
      setSelectedTagId(null);
      setSelectedTag(null);
    }
  }, [searchParams, tenantMembership?.tenantId]);

  useEffect(() => {
    if (tenantMembership?.tenantId) {
      loadClients();
    }
  }, [tenantMembership?.tenantId, advancedFilters]);

  const loadTagInfo = async (tagId: string) => {
    if (!tenantMembership?.tenantId) return;
    try {
      const response = await listTags(tenantMembership.tenantId);
      if (response.success) {
        const tag = response.data.find(t => t.id === tagId);
        if (tag) {
          setSelectedTag(tag);
        }
      }
    } catch (err) {
      console.error('Error loading tag info:', err);
    }
  };

  const clearTagFilter = () => {
    setSearchParams({});
    setSelectedTagId(null);
    setSelectedTag(null);
  };

  const loadClients = async () => {
    if (!tenantMembership?.tenantId) return;
    setLoading(true);
    setError(null);
    try {
      // Fetch all contacts - we'll filter for those with client roles
      const response = await listContacts(tenantMembership.tenantId, {
        limit: 1000, // Get all contacts
        startDate: advancedFilters.startDate,
        endDate: advancedFilters.endDate,
        assignedTo: advancedFilters.assignedTo,
        source: advancedFilters.source,
      });
      if (response.success) {
        // Filter contacts that have client roles (converted contacts)
        const clientContacts = response.contacts.filter(contact => 
          contact.roles && contact.roles.length > 0 && contact.roles.some(r => r.active)
        );
        setClients(clientContacts);
      } else {
        setError('Erreur lors du chargement des clients');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des clients');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // Search is handled by filtering the clients array
  };

  const getClientTypeIcon = (type: string) => {
    switch (type) {
      case 'PROPRIETAIRE':
        return <Home className="h-4 w-4" />;
      case 'LOCATAIRE':
        return <User className="h-4 w-4" />;
      case 'ACQUEREUR':
        return <ShoppingCart className="h-4 w-4" />;
      case 'COPROPRIETAIRE':
        return <Building2 className="h-4 w-4" />;
      default:
        return <User className="h-4 w-4" />;
    }
  };

  const getClientTypeLabel = (type: string) => {
    switch (type) {
      case 'PROPRIETAIRE':
        return 'Propriétaire';
      case 'LOCATAIRE':
        return 'Locataire';
      case 'ACQUEREUR':
        return 'Acquéreur';
      case 'COPROPRIETAIRE':
        return 'Copropriétaire';
      default:
        return type;
    }
  };

  const getClientTypeBadge = (type: string) => {
    const styles = {
      PROPRIETAIRE: 'bg-blue-100 text-blue-800',
      LOCATAIRE: 'bg-green-100 text-green-800',
      ACQUEREUR: 'bg-purple-100 text-purple-800',
      COPROPRIETAIRE: 'bg-orange-100 text-orange-800',
    };
    return (
      <span
        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
          styles[type as keyof typeof styles] || 'bg-gray-100 text-gray-800'
        }`}
      >
        {getClientTypeIcon(type)}
        {getClientTypeLabel(type)}
      </span>
    );
  };

  // Filter clients based on search term, type, and tag
  const filteredClients = clients.filter((client) => {
    const matchesSearch =
      !searchTerm ||
      `${client.firstName} ${client.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = filterType === 'ALL' || 
      (client.roles && client.roles.some(r => r.active && r.role === filterType));
    
    const matchesTag = !selectedTagId || 
      (client.tags && client.tags.some(tag => tag.id === selectedTagId));
    
    return matchesSearch && matchesType && matchesTag;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Clients</h1>
            <p className="text-gray-600 mt-1">Gérez vos clients et leurs informations</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const exportData = filteredClients.map(client => ({
                  'Nom': `${client.firstName} ${client.lastName}`,
                  'Email': client.email,
                  'Téléphone': client.phone || '',
                  'Type': client.roles?.filter(r => r.active).map(r => getClientTypeLabel(r.role)).join(', ') || '',
                  'Groupes': client.tags?.map(t => t.name).join(', ') || '',
                  'Date d\'inscription': new Date(client.createdAt).toLocaleDateString('fr-FR'),
                }));
                exportToCSV(exportData, 'clients');
              }}
            >
              <Download className="h-4 w-4 mr-2" />
              Exporter CSV
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const exportData = filteredClients.map(client => ({
                  'Nom': `${client.firstName} ${client.lastName}`,
                  'Email': client.email,
                  'Téléphone': client.phone || '',
                  'Type': client.roles?.filter(r => r.active).map(r => getClientTypeLabel(r.role)).join(', ') || '',
                  'Groupes': client.tags?.map(t => t.name).join(', ') || '',
                  'Date d\'inscription': new Date(client.createdAt).toLocaleDateString('fr-FR'),
                }));
                exportToExcel(exportData, 'clients', 'Clients');
              }}
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Exporter Excel
            </Button>
            <Button onClick={() => navigate(`/tenant/${tenantMembership?.tenantId}/crm/contacts/new`)}>
              <Plus className="h-4 w-4 mr-2" />
              Nouveau client
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4">
          {/* Tag Filter Badge */}
          {selectedTag && (
            <div className="mb-4 flex items-center gap-2">
              <span className="text-sm text-gray-600">Filtre actif:</span>
              <div
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium text-white"
                style={{ backgroundColor: selectedTag.color || '#3B82F6' }}
              >
                <TagIcon className="h-4 w-4" />
                {selectedTag.name}
                <button
                  onClick={clearTagFilter}
                  className="hover:bg-white hover:bg-opacity-20 rounded-full p-0.5 transition-colors"
                  title="Retirer le filtre"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleSearch} className="flex gap-4 mb-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  type="text"
                  placeholder="Rechercher des clients..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Button type="submit">Rechercher</Button>
          </form>

          {/* Advanced Filters */}
          <div className="mt-4">
            <AdvancedFilters
              tenantId={tenantMembership?.tenantId}
              config={{
                showDateRange: true,
                showAssignedTo: true,
                showSource: true,
                dateRangeLabel: 'Date de création',
              }}
              filters={advancedFilters}
              onFiltersChange={setAdvancedFilters}
            />
          </div>

          <div className="flex gap-2 mt-4">
            <Button
              variant={filterType === 'ALL' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterType('ALL')}
            >
              Tous
            </Button>
            <Button
              variant={filterType === 'PROPRIETAIRE' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterType('PROPRIETAIRE')}
            >
              Propriétaires
            </Button>
            <Button
              variant={filterType === 'LOCATAIRE' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterType('LOCATAIRE')}
            >
              Locataires
            </Button>
            <Button
              variant={filterType === 'ACQUEREUR' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterType('ACQUEREUR')}
            >
              Acquéreurs
            </Button>
            <Button
              variant={filterType === 'COPROPRIETAIRE' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterType('COPROPRIETAIRE')}
            >
              Copropriétaires
            </Button>
          </div>
        </div>

        {/* Clients List */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            <p className="mt-2 text-gray-600">Chargement des clients...</p>
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun client trouvé</h3>
            <p className="text-gray-600 mb-4">
              {clients.length === 0
                ? 'Commencez par ajouter votre premier client.'
                : 'Aucun client ne correspond à votre recherche.'}
            </p>
            {clients.length === 0 && (
              <Button onClick={() => navigate(`/tenant/${tenantMembership?.tenantId}/crm/contacts/new`)}>
                <Plus className="h-4 w-4 mr-2" />
                Ajouter un client
              </Button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Client
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Groupes
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date d'inscription
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredClients.map((client) => {
                  // Get active roles for this client
                  const activeRoles = client.roles?.filter(r => r.active) || [];
                  
                  return (
                  <tr key={client.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center mr-3">
                          <Users className="h-5 w-5 text-gray-500" />
                        </div>
                        <div className="text-sm font-medium text-gray-900">
                          {client.firstName} {client.lastName}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">{client.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-wrap gap-1">
                        {activeRoles.map((role, idx) => (
                          <span key={idx}>{getClientTypeBadge(role.role)}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {client.tags && client.tags.length > 0 ? (
                          client.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag.id}
                              className="inline-flex items-center px-2 py-1 rounded text-xs font-medium shadow-sm"
                              style={{
                                backgroundColor: tag.color || '#3B82F6',
                                color: '#FFFFFF',
                              }}
                            >
                              {tag.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-gray-400">Aucun groupe</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {new Date(client.createdAt).toLocaleDateString('fr-FR')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/tenant/${tenantMembership?.tenantId}/crm/contacts/${client.id}`)}
                        title="Voir les détails"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

