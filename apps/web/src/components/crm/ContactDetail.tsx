import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import { getContact, convertContact, CrmContact, CrmContactDetail, listAppointments, CrmAppointment, AppointmentFilters } from '../../services/crm-service';
import { ActivityTimeline } from './ActivityTimeline';
import { ConvertContactDialog } from './ConvertContactDialog';
import { TagManager } from './TagManager';
import { User, Mail, Phone, Calendar, Tag, Briefcase, Activity, Clock, CheckCircle, XCircle, Plus } from 'lucide-react';

interface ContactDetailProps {
  tenantId: string;
  contactId: string;
}

export const ContactDetail: React.FC<ContactDetailProps> = ({ tenantId, contactId }) => {
  const navigate = useNavigate();
  const [contact, setContact] = useState<CrmContactDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [showTagManager, setShowTagManager] = useState(false);
  const [appointments, setAppointments] = useState<CrmAppointment[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(true);

  useEffect(() => {
    loadContact();
    loadAppointments();
  }, [tenantId, contactId]);

  const handleConvert = async (roles: string[]) => {
    try {
      await convertContact(tenantId, contactId, roles);
      setShowConvertDialog(false);
      await loadContact();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erreur lors de la conversion du contact');
    }
  };

  const loadContact = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getContact(tenantId, contactId);
      if (response.success) {
        console.log('Contact data received:', response.data);
        setContact(response.data);
      } else {
        setError('Erreur lors du chargement du contact');
      }
    } catch (err: any) {
      console.error('Error loading contact:', err);
      setError(err.response?.data?.message || 'Erreur lors du chargement du contact');
    } finally {
      setLoading(false);
    }
  };

  const loadAppointments = async () => {
    setAppointmentsLoading(true);
    try {
      const filters: AppointmentFilters = {
        page: 1,
        limit: 50,
        contactId: contactId,
      };
      const response = await listAppointments(tenantId, filters);
      if (response.success) {
        setAppointments(response.appointments);
      }
    } catch (err: any) {
      console.error('Error loading appointments:', err);
    } finally {
      setAppointmentsLoading(false);
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
        className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
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

  const getDealStageLabel = (stage: string): string => {
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

  const getAppointmentStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; text: string; icon: any; label: string }> = {
      SCHEDULED: { bg: 'bg-blue-100', text: 'text-blue-800', icon: Clock, label: 'Planifié' },
      CONFIRMED: { bg: 'bg-green-100', text: 'text-green-800', icon: CheckCircle, label: 'Confirmé' },
      DONE: { bg: 'bg-gray-100', text: 'text-gray-800', icon: CheckCircle, label: 'Terminé' },
      NO_SHOW: { bg: 'bg-orange-100', text: 'text-orange-800', icon: XCircle, label: 'Absent' },
      CANCELED: { bg: 'bg-red-100', text: 'text-red-800', icon: XCircle, label: 'Annulé' },
    };
    const style = styles[status] || styles.SCHEDULED;
    const Icon = style.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
        <Icon className="h-3 w-3" />
        {style.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        <p className="mt-2 text-gray-600">Chargement du contact...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
        {error}
      </div>
    );
  }

  if (!contact) {
    return <div>Contact non trouvé</div>;
  }

  const displayName = contact.firstName || contact.lastName 
    ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim()
    : contact.email || 'Contact sans nom';

  return (
    <div className="space-y-4">
      {/* Header - Compact */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <h1 className="text-xl font-bold text-gray-900">
                {displayName}
              </h1>
              {getStatusBadge(contact.status)}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div className="flex items-center text-gray-600">
                <Mail className="h-4 w-4 mr-2 flex-shrink-0" />
                <span className="truncate">{contact.email || 'Aucun email'}</span>
              </div>
              <div className="flex items-center text-gray-600">
                <Phone className="h-4 w-4 mr-2 flex-shrink-0" />
                <span>{contact.phone || 'Aucun téléphone'}</span>
              </div>
              {contact.source && (
                <div className="flex items-center text-gray-600">
                  <Tag className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span>Source : {contact.source}</span>
                </div>
              )}
              {contact.lastInteractionAt && (
                <div className="flex items-center text-gray-600">
                  <Calendar className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span>Dernière interaction : {new Date(contact.lastInteractionAt).toLocaleDateString('fr-FR')}</span>
                </div>
              )}
            </div>
            <div className="text-xs text-gray-500 mt-2">
              Créé le {new Date(contact.createdAt).toLocaleDateString('fr-FR')} • Modifié le {new Date(contact.updatedAt).toLocaleDateString('fr-FR')}
            </div>
          </div>
          <div className="flex gap-2 ml-4">
            {contact.status === 'LEAD' && (
              <Button size="sm" onClick={() => setShowConvertDialog(true)}>
                Convertir
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => navigate(`/tenant/${tenantId}/crm/contacts/${contactId}/edit`)}>
              Modifier
            </Button>
          </div>
        </div>
      </div>

      {showConvertDialog && contact && (
        <ConvertContactDialog
          contactName={displayName}
          onSubmit={handleConvert}
          onCancel={() => setShowConvertDialog(false)}
        />
      )}

      {/* Grid Layout - 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Roles & Tags - Column 1 */}
        <div className="space-y-4">
          {/* Roles */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-base font-semibold mb-3 flex items-center">
              <User className="h-4 w-4 mr-2" />
              Rôles
            </h2>
            {contact.roles && contact.roles.length > 0 ? (
              <div className="space-y-2">
                {contact.roles.map((role: any) => (
                  <div
                    key={role.id}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm"
                  >
                    <div>
                      <span className="font-medium">{role.role}</span>
                      {role.active ? (
                        <span className="ml-2 text-xs text-green-600">Actif</span>
                      ) : (
                        <span className="ml-2 text-xs text-gray-500">Inactif</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(role.startedAt).toLocaleDateString('fr-FR')}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Aucun rôle assigné</p>
            )}
          </div>

          {/* Tags */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-base font-semibold flex items-center">
                <Tag className="h-4 w-4 mr-2" />
                Groupes {contact.tags && contact.tags.length > 0 && `(${contact.tags.length})`}
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTagManager(true)}
              >
                <Plus className="h-3 w-3 mr-1" />
                Gérer
              </Button>
            </div>
            {contact.tags && contact.tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {contact.tags.map((tag: any) => (
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
                ))}
              </div>
            ) : (
              <div className="text-center py-4">
                <Tag className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500 text-xs mb-2">Aucun groupe</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowTagManager(true)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Ajouter
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Deals - Column 2 */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-base font-semibold mb-3 flex items-center">
            <Briefcase className="h-4 w-4 mr-2" />
            Affaires {contact.deals && contact.deals.length > 0 && `(${contact.deals.length})`}
          </h2>
          {contact.deals && contact.deals.length > 0 ? (
            <div className="space-y-2">
              {contact.deals.map((deal: any) => (
                <div
                  key={deal.id}
                  onClick={() => navigate(`/tenant/${tenantId}/crm/deals/${deal.id}`)}
                  className="p-2 bg-gray-50 rounded hover:bg-gray-100 cursor-pointer text-sm transition-colors"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-medium">{deal.type}</span>
                      <span className="ml-2 text-xs text-gray-600">- {getDealStageLabel(deal.stage)}</span>
                    </div>
                    {deal.budgetMax && (
                      <span className="text-xs font-medium">
                        {deal.budgetMax.toLocaleString('fr-FR', { style: 'decimal' })} FCFA
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">Aucune affaire associée</p>
          )}
        </div>
      </div>

      {/* Appointments - Full Width */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-base font-semibold flex items-center">
            <Calendar className="h-4 w-4 mr-2" />
            Rendez-vous {appointments.length > 0 && `(${appointments.length})`}
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/tenant/${tenantId}/crm/appointments?contactId=${contactId}`)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Nouveau
          </Button>
        </div>
        {appointmentsLoading ? (
          <div className="text-center py-6">
            <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-gray-900"></div>
            <p className="mt-2 text-gray-600 text-xs">Chargement...</p>
          </div>
        ) : appointments.length > 0 ? (
          <div className="space-y-2">
            {appointments.map((appointment) => (
              <div
                key={appointment.id}
                onClick={() => navigate(`/tenant/${tenantId}/crm/appointments?contactId=${contactId}`)}
                className="p-3 bg-gray-50 rounded hover:bg-gray-100 border border-gray-200 cursor-pointer transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-sm text-gray-900">{appointment.appointmentType}</span>
                      {getAppointmentStatusBadge(appointment.status)}
                    </div>
                    <div className="space-y-1 text-xs text-gray-600">
                      <div className="flex items-center">
                        <Calendar className="h-3 w-3 mr-2" />
                        {new Date(appointment.startAt).toLocaleDateString('fr-FR', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </div>
                      <div className="flex items-center">
                        <Clock className="h-3 w-3 mr-2" />
                        {new Date(appointment.startAt).toLocaleTimeString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        -{' '}
                        {new Date(appointment.endAt).toLocaleTimeString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                      {appointment.location && (
                        <div className="flex items-center">
                          <Tag className="h-3 w-3 mr-2" />
                          {appointment.location}
                        </div>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/tenant/${tenantId}/crm/appointments?contactId=${contactId}`);
                    }}
                  >
                    Détails
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <Calendar className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-500 text-xs mb-2">Aucun rendez-vous</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/tenant/${tenantId}/crm/appointments?contactId=${contactId}`)}
            >
              <Plus className="h-3 w-3 mr-1" />
              Créer
            </Button>
          </div>
        )}
      </div>

      {/* Activities Timeline - Full Width */}
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-base font-semibold mb-3 flex items-center">
          <Activity className="h-4 w-4 mr-2" />
          Chronologie des activités
        </h2>
        {contact.recentActivities && contact.recentActivities.length > 0 ? (
          <ActivityTimeline activities={contact.recentActivities} tenantId={tenantId} contactId={contactId} />
        ) : (
          <p className="text-gray-500 text-sm">Aucune activité récente</p>
        )}
      </div>

      {/* Tag Manager Modal */}
      {showTagManager && contact && (
        <TagManager
          tenantId={tenantId}
          contactId={contactId}
          contactName={displayName}
          onClose={() => setShowTagManager(false)}
          onTagsUpdated={loadContact}
        />
      )}
    </div>
  );
};

