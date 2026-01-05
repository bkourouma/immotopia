import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { ActivityForm } from '../../components/crm/ActivityForm';
import { ActivityTimeline } from '../../components/crm/ActivityTimeline';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  listActivities,
  createActivity,
  listContacts,
  CrmActivity,
  CrmContact,
  CreateCrmActivityRequest,
  ActivityFilters,
} from '../../services/crm-service';
import { listMembers, Member } from '../../services/membership-service';
import { CrmActivityType } from '../../types/crm-types';
import { Activity as ActivityIcon, Plus, Search, Filter, X } from 'lucide-react';

export const Activities: React.FC = () => {
  const { tenantId, contactId, dealId } = useParams<{ tenantId: string; contactId?: string; dealId?: string }>();
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState<ActivityFilters>({
    page: 1,
    limit: 50,
    contactId: contactId,
    dealId: dealId,
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  useEffect(() => {
    if (tenantId) {
      loadActivities();
      loadContacts();
      loadMembers();
    }
  }, [tenantId, filters, contactId, dealId]);

  useEffect(() => {
    setFilters((prev: ActivityFilters) => ({
      ...prev,
      contactId: contactId,
      dealId: dealId,
    }));
  }, [contactId, dealId]);

  const loadActivities = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await listActivities(tenantId, filters);
      if (response.success) {
        setActivities(response.activities);
        setPagination(response.pagination);
      } else {
        setError('Erreur lors du chargement des activités');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des activités');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (data: CreateCrmActivityRequest) => {
    if (!tenantId) return;
    try {
      await createActivity(tenantId, data);
      setShowForm(false);
      await loadActivities();
    } catch (err: any) {
      throw err;
    }
  };

  const loadContacts = async () => {
    if (!tenantId) return;
    try {
      const response = await listContacts(tenantId, { limit: 100 });
      if (response.success) {
        setContacts(response.contacts);
      }
    } catch (err) {
      console.error('Error loading contacts:', err);
    }
  };

  const loadMembers = async () => {
    if (!tenantId) return;
    try {
      const response = await listMembers(tenantId, { limit: 100 });
      if (response.success) {
        setMembers(response.data.members);
      }
    } catch (err) {
      console.error('Error loading members:', err);
    }
  };

  const handleTypeFilter = (type: string) => {
    setFilters({ ...filters, page: 1, type: (type || undefined) as CrmActivityType | undefined });
  };

  const handleContactFilter = (contactId: string) => {
    setFilters({ ...filters, page: 1, contactId: contactId || undefined });
  };

  const handleCollaboratorFilter = (userId: string) => {
    setFilters({ ...filters, page: 1, createdBy: userId || undefined });
  };

  const handleDateRangeFilter = (startDate?: string, endDate?: string) => {
    setFilters({ ...filters, page: 1, startDate, endDate });
  };

  const clearFilters = () => {
    setFilters({
      page: 1,
      limit: 50,
      contactId: contactId,
      dealId: dealId,
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Activités</h1>
            <p className="text-gray-600 mt-1">Suivez toutes les interactions et activités</p>
          </div>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nouvelle activité
          </Button>
        </div>

        {showForm && tenantId && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Créer une nouvelle activité</h2>
            <ActivityForm
              tenantId={tenantId}
              contactId={contactId}
              dealId={dealId}
              onSubmit={handleCreate}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 space-y-4">
          {/* Type Filters */}
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={!filters.type ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleTypeFilter('')}
            >
              Tous les types
            </Button>
            {['CALL', 'EMAIL', 'SMS', 'WHATSAPP', 'VISIT', 'MEETING', 'NOTE', 'TASK'].map((type) => {
              const typeLabels: Record<string, string> = {
                'CALL': 'Appel',
                'EMAIL': 'Email',
                'SMS': 'SMS',
                'WHATSAPP': 'WhatsApp',
                'VISIT': 'Visite',
                'MEETING': 'Réunion',
                'NOTE': 'Note',
                'TASK': 'Tâche'
              };
              return (
                <Button
                  key={type}
                  variant={filters.type === type ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleTypeFilter(type)}
                >
                  {typeLabels[type] || type}
                </Button>
              );
            })}
          </div>

          {/* Advanced Filters */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            >
              <Filter className="h-4 w-4 mr-2" />
              Filtres avancés
            </Button>
            {(filters.contactId || filters.createdBy || filters.startDate || filters.endDate) && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearFilters}
              >
                <X className="h-4 w-4 mr-2" />
                Réinitialiser
              </Button>
            )}
          </div>

          {showAdvancedFilters && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t">
              {/* Contact Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={filters.contactId || ''}
                  onChange={(e) => handleContactFilter(e.target.value)}
                >
                  <option value="">Tous les contacts</option>
                  {contacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.firstName} {contact.lastName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Collaborator Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Collaborateur
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={filters.createdBy || ''}
                  onChange={(e) => handleCollaboratorFilter(e.target.value)}
                >
                  <option value="">Tous les collaborateurs</option>
                  {members.map((member) => (
                    <option key={member.user.id} value={member.user.id}>
                      {member.user.fullName || member.user.email}
                    </option>
                  ))}
                </select>
              </div>

              {/* Start Date Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date début
                </label>
                <Input
                  type="date"
                  value={filters.startDate || ''}
                  onChange={(e) => handleDateRangeFilter(e.target.value || undefined, filters.endDate)}
                />
              </div>

              {/* End Date Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date fin
                </label>
                <Input
                  type="date"
                  value={filters.endDate || ''}
                  onChange={(e) => handleDateRangeFilter(filters.startDate, e.target.value || undefined)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Activities Timeline */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-6">
          <ActivityTimeline activities={activities} loading={loading} tenantId={tenantId} contactId={contactId} />
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Affichage de {((pagination.page - 1) * pagination.limit) + 1} à{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} sur{' '}
              {pagination.total} activités
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
    </DashboardLayout>
  );
};

