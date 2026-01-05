import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { ContactForm } from '../../components/crm/ContactForm';
import { ActivityForm } from '../../components/crm/ActivityForm';
import { AppointmentForm } from '../../components/crm/AppointmentForm';
import { BulkTagManager } from '../../components/crm/BulkTagManager';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  listContacts,
  createContact,
  updateContact,
  createActivity,
  createAppointment,
  listTags,
  CrmContact,
  CrmTag,
  CreateCrmContactRequest,
  UpdateCrmContactRequest,
  CreateCrmActivityRequest,
  CreateCrmAppointmentRequest,
  ContactFilters,
} from '../../services/crm-service';
import { Users, Plus, Search, Edit, Eye, Activity, Calendar, Tag, X, Filter, Download, FileSpreadsheet } from 'lucide-react';
import { AdvancedFilters, AdvancedFilters as AdvancedFiltersType } from '../../components/crm/AdvancedFilters';
import { exportToCSV, exportToExcel } from '../../utils/export-utils';

export const Contacts: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState<CrmContact | null>(null);
  const [filters, setFilters] = useState<ContactFilters>({
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
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [selectedContactForActivity, setSelectedContactForActivity] = useState<CrmContact | null>(null);
  const [showAppointmentForm, setShowAppointmentForm] = useState(false);
  const [selectedContactForAppointment, setSelectedContactForAppointment] = useState<CrmContact | null>(null);
  const [allTags, setAllTags] = useState<CrmTag[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showTagFilter, setShowTagFilter] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [showBulkTagManager, setShowBulkTagManager] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFiltersType>({});
  const [hasActiveDealFilter, setHasActiveDealFilter] = useState<boolean | undefined>(undefined);
  const [hasUpcomingAppointmentOrActivityFilter, setHasUpcomingAppointmentOrActivityFilter] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    if (tenantId) {
      loadContacts();
      loadTags();
    }
  }, [tenantId, filters, advancedFilters, hasActiveDealFilter, hasUpcomingAppointmentOrActivityFilter]);

  const loadTags = async () => {
    if (!tenantId) return;
    try {
      const response = await listTags(tenantId);
      if (response.success) {
        setAllTags(response.data);
      }
    } catch (err) {
      console.error('Error loading tags:', err);
    }
  };

  const loadContacts = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await listContacts(tenantId, {
        ...filters,
        search: searchTerm || undefined,
        startDate: advancedFilters.startDate,
        endDate: advancedFilters.endDate,
        assignedTo: advancedFilters.assignedTo,
        source: advancedFilters.source,
        hasActiveDeal: hasActiveDealFilter,
        hasUpcomingAppointmentOrActivity: hasUpcomingAppointmentOrActivityFilter,
      });
      if (response.success) {
        setContacts(response.contacts);
        setPagination(response.pagination);
      } else {
        setError('Erreur lors du chargement des contacts');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des contacts');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters({ ...filters, page: 1, search: searchTerm || undefined });
  };

  const handleStatusFilter = (status: 'LEAD' | 'ACTIVE_CLIENT' | 'ARCHIVED' | '') => {
    setFilters({ ...filters, page: 1, status: status || undefined });
  };

  const handleTagToggle = (tagId: string) => {
    const newSelectedTags = selectedTags.includes(tagId)
      ? selectedTags.filter((id) => id !== tagId)
      : [...selectedTags, tagId];
    setSelectedTags(newSelectedTags);
    setFilters({ ...filters, page: 1, tagIds: newSelectedTags.length > 0 ? newSelectedTags : undefined });
  };

  const clearTagFilters = () => {
    setSelectedTags([]);
    setFilters({ ...filters, page: 1, tagIds: undefined });
  };

  const handleSelectAll = () => {
    if (selectedContacts.length === contacts.length) {
      setSelectedContacts([]);
    } else {
      setSelectedContacts(contacts.map((c) => c.id));
    }
  };

  const handleSelectContact = (contactId: string) => {
    if (selectedContacts.includes(contactId)) {
      setSelectedContacts(selectedContacts.filter((id) => id !== contactId));
    } else {
      setSelectedContacts([...selectedContacts, contactId]);
    }
  };

  const handleBulkTagComplete = () => {
    setSelectedContacts([]);
    loadContacts();
  };

  const handleCreate = async (data: CreateCrmContactRequest | UpdateCrmContactRequest) => {
    if (!tenantId) return;
    try {
      await createContact(tenantId, data as CreateCrmContactRequest);
      setShowForm(false);
      await loadContacts();
    } catch (err: any) {
      throw err; // Let ContactForm handle the error
    }
  };

  const handleUpdate = async (data: UpdateCrmContactRequest) => {
    if (!tenantId || !editingContact) return;
    try {
      await updateContact(tenantId, editingContact.id, data);
      setEditingContact(null);
      await loadContacts();
    } catch (err: any) {
      throw err; // Let ContactForm handle the error
    }
  };

  const handleAddActivity = (contact: CrmContact) => {
    setSelectedContactForActivity(contact);
    setShowActivityForm(true);
  };

  const handleCreateActivity = async (data: CreateCrmActivityRequest) => {
    if (!tenantId) return;
    try {
      await createActivity(tenantId, data);
      setShowActivityForm(false);
      setSelectedContactForActivity(null);
      // Optionally show success message or reload contacts
    } catch (err: any) {
      throw err;
    }
  };

  const handleAddAppointment = (contact: CrmContact) => {
    setSelectedContactForAppointment(contact);
    setShowAppointmentForm(true);
  };

  const handleCreateAppointment = async (data: CreateCrmAppointmentRequest) => {
    if (!tenantId) return;
    try {
      await createAppointment(tenantId, data);
      setShowAppointmentForm(false);
      setSelectedContactForAppointment(null);
      // Optionally show success message or reload contacts
    } catch (err: any) {
      throw err;
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      LEAD: 'bg-blue-100 text-blue-800',
      ACTIVE_CLIENT: 'bg-green-100 text-green-800',
      ARCHIVED: 'bg-gray-100 text-gray-800',
    };
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
          styles[status as keyof typeof styles] || styles.ARCHIVED
        }`}
      >
        {status === 'LEAD'
          ? 'Prospect'
          : status === 'ACTIVE_CLIENT'
          ? 'Client actif'
          : 'Archivé'}
      </span>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Contacts</h1>
            <p className="text-gray-600 mt-1">Gérez vos contacts et prospects CRM</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const exportData = contacts.map(contact => ({
                  'Nom': `${contact.firstName} ${contact.lastName}`,
                  'Email': contact.email,
                  'Téléphone': contact.phone || '',
                  'Statut': contact.status === 'LEAD' ? 'Prospect' : contact.status === 'ACTIVE_CLIENT' ? 'Client actif' : 'Archivé',
                  'Source': contact.source || '',
                  'Prochaine action': contact.nextAction ? `${contact.nextAction.nextActionType || 'Action'} - ${new Date(contact.nextAction.nextActionAt).toLocaleDateString('fr-FR')}` : '',
                  'Affaire en cours': contact.activeDeal ? `${contact.activeDeal.type === 'ACHAT' ? 'Achat' : 'Location'} - ${contact.activeDeal.stage}` : '',
                  'Date de création': new Date(contact.createdAt).toLocaleDateString('fr-FR'),
                }));
                exportToCSV(exportData, 'contacts');
              }}
            >
              <Download className="h-4 w-4 mr-2" />
              Exporter CSV
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const exportData = contacts.map(contact => ({
                  'Nom': `${contact.firstName} ${contact.lastName}`,
                  'Email': contact.email,
                  'Téléphone': contact.phone || '',
                  'Statut': contact.status === 'LEAD' ? 'Prospect' : contact.status === 'ACTIVE_CLIENT' ? 'Client actif' : 'Archivé',
                  'Source': contact.source || '',
                  'Prochaine action': contact.nextAction ? `${contact.nextAction.nextActionType || 'Action'} - ${new Date(contact.nextAction.nextActionAt).toLocaleDateString('fr-FR')}` : '',
                  'Affaire en cours': contact.activeDeal ? `${contact.activeDeal.type === 'ACHAT' ? 'Achat' : 'Location'} - ${contact.activeDeal.stage}` : '',
                  'Date de création': new Date(contact.createdAt).toLocaleDateString('fr-FR'),
                }));
                exportToExcel(exportData, 'contacts', 'Contacts');
              }}
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Exporter Excel
            </Button>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nouveau contact
            </Button>
          </div>
        </div>

        {showForm && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Créer un nouveau contact</h2>
            <ContactForm
              onSubmit={handleCreate}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

        {editingContact && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Modifier le contact</h2>
            <ContactForm
              contact={editingContact}
              onSubmit={handleUpdate}
              onCancel={() => setEditingContact(null)}
            />
          </div>
        )}

        {showActivityForm && selectedContactForActivity && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Ajouter une activité au contact</h2>
            <ActivityForm
              tenantId={tenantId!}
              contactId={selectedContactForActivity.id}
              onSubmit={handleCreateActivity}
              onCancel={() => {
                setShowActivityForm(false);
                setSelectedContactForActivity(null);
              }}
            />
          </div>
        )}

        {showAppointmentForm && selectedContactForAppointment && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Ajouter un rendez-vous au contact</h2>
            <AppointmentForm
              tenantId={tenantId!}
              contactId={selectedContactForAppointment.id}
              onSubmit={handleCreateAppointment}
              onCancel={() => {
                setShowAppointmentForm(false);
                setSelectedContactForAppointment(null);
              }}
            />
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4">
          <form onSubmit={handleSearch} className="flex gap-4 mb-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  type="text"
                  placeholder="Rechercher des contacts..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Button type="submit">Rechercher</Button>
          </form>

          <div className="space-y-3">
            {/* Status Filters */}
            <div className="flex gap-2 items-center">
              <span className="text-sm font-medium text-gray-700">Statut:</span>
              <Button
                variant={!filters.status ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleStatusFilter('')}
              >
                Tous
              </Button>
              <Button
                variant={filters.status === 'LEAD' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleStatusFilter('LEAD')}
              >
                Prospects
              </Button>
              <Button
                variant={filters.status === 'ACTIVE_CLIENT' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleStatusFilter('ACTIVE_CLIENT')}
              >
                Clients
              </Button>
              <Button
                variant={filters.status === 'ARCHIVED' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleStatusFilter('ARCHIVED')}
              >
                Archivés
              </Button>
            </div>

            {/* Tag Filters */}
            <div className="border-t pt-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">Filtrer par tags:</span>
                  {selectedTags.length > 0 && (
                    <span className="text-xs text-gray-500">({selectedTags.length} sélectionné{selectedTags.length > 1 ? 's' : ''})</span>
                  )}
                </div>
                <div className="flex gap-2">
                  {selectedTags.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearTagFilters}
                      className="text-xs"
                    >
                      <X className="h-3 w-3 mr-1" />
                      Effacer
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowTagFilter(!showTagFilter)}
                    className="text-xs"
                  >
                    <Filter className="h-3 w-3 mr-1" />
                    {showTagFilter ? 'Masquer' : 'Afficher'}
                  </Button>
                </div>
              </div>

              {showTagFilter && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {allTags.length === 0 ? (
                    <p className="text-sm text-gray-500 italic">Aucun tag disponible</p>
                  ) : (
                    allTags.map((tag) => (
                      <button
                        key={tag.id}
                        onClick={() => handleTagToggle(tag.id)}
                        className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                          selectedTags.includes(tag.id)
                            ? 'shadow-md'
                            : 'border-2 opacity-70 hover:opacity-100'
                        }`}
                        style={
                          selectedTags.includes(tag.id)
                            ? {
                                backgroundColor: tag.color || '#3B82F6',
                                color: '#FFFFFF',
                              }
                            : {
                                borderColor: tag.color || '#3B82F6',
                                color: tag.color || '#3B82F6',
                              }
                        }
                      >
                        {selectedTags.includes(tag.id) && (
                          <X className="h-3 w-3 mr-1" />
                        )}
                        {tag.name}
                      </button>
                    ))
                  )}
                </div>
              )}

              {/* Selected Tags Display */}
              {selectedTags.length > 0 && !showTagFilter && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedTags.map((tagId) => {
                    const tag = allTags.find((t) => t.id === tagId);
                    if (!tag) return null;
                    return (
                      <span
                        key={tag.id}
                        className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium shadow-sm"
                        style={{
                          backgroundColor: tag.color || '#3B82F6',
                          color: '#FFFFFF',
                        }}
                      >
                        {tag.name}
                        <button
                          onClick={() => handleTagToggle(tag.id)}
                          className="ml-2 hover:bg-white hover:bg-opacity-20 rounded-full p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Quick Filters */}
          <div className="flex items-center gap-4 mb-4 flex-wrap">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="hasActiveDeal"
                checked={hasActiveDealFilter === true}
                onChange={(e) => setHasActiveDealFilter(e.target.checked ? true : undefined)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="hasActiveDeal" className="text-sm font-medium text-gray-700">
                Affaire en cours
              </label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="hasUpcomingAppointmentOrActivity"
                checked={hasUpcomingAppointmentOrActivityFilter === true}
                onChange={(e) => setHasUpcomingAppointmentOrActivityFilter(e.target.checked ? true : undefined)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="hasUpcomingAppointmentOrActivity" className="text-sm font-medium text-gray-700">
                Rendez-vous ou Activité à venir
              </label>
            </div>
          </div>

          {/* Advanced Filters */}
          <div className="mt-4">
            <AdvancedFilters
              tenantId={tenantId}
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
        </div>

        {/* Contacts List */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            <p className="mt-2 text-gray-600">Chargement des contacts...</p>
          </div>
        ) : contacts.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun contact trouvé</h3>
            <p className="text-gray-600 mb-4">Commencez par créer votre premier contact.</p>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Créer un contact
            </Button>
          </div>
        ) : (
          <>
            {/* Bulk Actions Toolbar */}
            {selectedContacts.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg shadow p-4 mb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-blue-900">
                      {selectedContacts.length} contact{selectedContacts.length > 1 ? 's' : ''} sélectionné{selectedContacts.length > 1 ? 's' : ''}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedContacts([])}
                    >
                      Désélectionner tout
                    </Button>
                  </div>
                  <Button
                    onClick={() => setShowBulkTagManager(true)}
                    size="sm"
                  >
                    <Tag className="h-4 w-4 mr-2" />
                    Gérer les tags
                  </Button>
                </div>
              </div>
            )}

            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedContacts.length === contacts.length && contacts.length > 0}
                        onChange={handleSelectAll}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Nom
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Téléphone
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Statut
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Source
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Prochaine action
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Affaire en cours
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {contacts.map((contact) => (
                    <tr 
                      key={contact.id} 
                      className={`hover:bg-gray-50 ${selectedContacts.includes(contact.id) ? 'bg-blue-50' : ''}`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedContacts.includes(contact.id)}
                          onChange={() => handleSelectContact(contact.id)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {contact.firstName} {contact.lastName}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">{contact.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">{contact.phone || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(contact.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">{contact.source || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {contact.nextAction ? (
                          <div className="text-sm">
                            <div className="font-medium text-gray-900">
                              {contact.nextAction.nextActionType || 'Action'}
                            </div>
                            <div className="text-xs text-gray-500">
                              {new Date(contact.nextAction.nextActionAt).toLocaleDateString('fr-FR', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {contact.activeDeal ? (
                          <div className="text-sm">
                            <div className="font-medium text-gray-900">
                              {contact.activeDeal.type === 'ACHAT' ? 'Achat' : 'Location'}
                            </div>
                            <div className="text-xs text-gray-500">
                              {contact.activeDeal.stage === 'NEW' && 'Nouveau'}
                              {contact.activeDeal.stage === 'QUALIFIED' && 'Qualifié'}
                              {contact.activeDeal.stage === 'APPOINTMENT' && 'Rendez-vous'}
                              {contact.activeDeal.stage === 'VISIT' && 'Visite'}
                              {contact.activeDeal.stage === 'NEGOTIATION' && 'Négociation'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAddActivity(contact)}
                            title="Ajouter une activité"
                          >
                            <Activity className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAddAppointment(contact)}
                            title="Ajouter un rendez-vous"
                          >
                            <Calendar className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/tenant/${tenantId}/crm/contacts/${contact.id}`)}
                            title="Voir les détails"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingContact(contact)}
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
                  {pagination.total} contacts
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
          </>
        )}

        {/* Bulk Tag Manager Modal */}
        {showBulkTagManager && (
          <BulkTagManager
            tenantId={tenantId!}
            contactIds={selectedContacts}
            contactCount={selectedContacts.length}
            onClose={() => setShowBulkTagManager(false)}
            onComplete={handleBulkTagComplete}
          />
        )}
      </div>
    </DashboardLayout>
  );
};

