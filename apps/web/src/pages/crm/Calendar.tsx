import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { Button } from '../../components/ui/button';
import {
  getCalendarEvents,
  rescheduleAppointment,
  updateAppointmentCalendar,
  rescheduleFollowUp,
  markFollowUpDone,
  CalendarEvent,
  CalendarScope,
  CalendarFilters,
} from '../../services/crm-service';
import { Plus, X, Clock, User, Briefcase, CheckCircle, Download, FileSpreadsheet } from 'lucide-react';
import { Calendar as BigCalendar, momentLocalizer, View, Event as CalendarEventType } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import './Calendar.css';
import { AppointmentForm } from '../../components/crm/AppointmentForm';
import { ActivityForm } from '../../components/crm/ActivityForm';
import { createAppointment, CreateCrmAppointmentRequest } from '../../services/crm-service';
import { createActivity, CreateCrmActivityRequest } from '../../services/crm-service';
import { AdvancedFilters, AdvancedFilters as AdvancedFiltersType } from '../../components/crm/AdvancedFilters';
import { exportToCSV, exportToExcel } from '../../utils/export-utils';

// Configure moment localizer
const localizer = momentLocalizer(moment);

// Extend CalendarEvent to work with react-big-calendar
interface CalendarEventExtended extends CalendarEventType {
  title: string;
  start: Date;
  end: Date;
  eventId: string;
  eventType: 'APPOINTMENT' | 'FOLLOWUP' | 'PROPERTY_VISIT';
  contactId: string;
  contactName: string;
  dealId: string | null;
  dealLabel: string | null;
  status?: string;
  badges: string[];
  canEdit: boolean;
  canDrag: boolean;
  appointmentType?: string;
  nextActionType?: string;
  location?: string;
  assignedToUserId?: string | null;
  createdByUserId: string;
  resource?: any; // Store original event for reference
}

export const CalendarPage: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [events, setEvents] = useState<CalendarEventExtended[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<View>('month');
  const [scope, setScope] = useState<CalendarScope>('GLOBAL');
  const [showAppointments, setShowAppointments] = useState(true);
  const [showFollowups, setShowFollowups] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventExtended | null>(null);
  const [showAppointmentForm, setShowAppointmentForm] = useState(false);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [prefillContactId, setPrefillContactId] = useState<string | undefined>();
  const [prefillDealId, setPrefillDealId] = useState<string | undefined>();
  const [draggedEvent, setDraggedEvent] = useState<CalendarEventExtended | null>(null);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFiltersType>({});

  // Calculate date range based on current view
  const dateRange = useMemo(() => {
    const start = moment(currentDate).startOf(view === 'month' ? 'month' : view === 'week' ? 'week' : 'day');
    const end = moment(currentDate).endOf(view === 'month' ? 'month' : view === 'week' ? 'week' : 'day');
    // Add buffer for month view
    if (view === 'month') {
      start.subtract(7, 'days');
      end.add(7, 'days');
    }
    return { from: start.toDate(), to: end.toDate() };
  }, [currentDate, view]);

  // Load calendar events
  const loadEvents = useCallback(async () => {
    if (!tenantId) return;

    setLoading(true);
    setError(null);

    try {
      // Determine which types to load based on checkboxes and advanced filter
      let typesToLoad: ('appointments' | 'followups')[] = [];
      
      // If advanced filter has a type, use it to determine what to load
      if (advancedFilters.type) {
        if (advancedFilters.type === 'FOLLOWUP') {
          typesToLoad = ['followups'];
        } else if (advancedFilters.type === 'RDV' || advancedFilters.type === 'VISITE') {
          typesToLoad = ['appointments'];
        }
      } else {
        // Use checkboxes if no advanced filter
        typesToLoad = [
          ...(showAppointments ? ['appointments' as const] : []),
          ...(showFollowups ? ['followups' as const] : []),
        ];
      }

      const filters: CalendarFilters = {
        from: dateRange.from,
        to: dateRange.to,
        scope,
        types: typesToLoad.length > 0 ? typesToLoad : ['appointments', 'followups'],
      };

      const response = await getCalendarEvents(tenantId, filters);

      if (response.success) {
        // Transform events to react-big-calendar format
        let transformedEvents: CalendarEventExtended[] = response.events.map((event) => ({
          eventId: event.eventId,
          eventType: event.eventType,
          title: event.title,
          start: new Date(event.start),
          end: event.end ? new Date(event.end) : new Date(event.start), // Use start as end for follow-ups
          contactId: event.contactId,
          contactName: event.contactName,
          dealId: event.dealId,
          dealLabel: event.dealLabel,
          status: event.status,
          badges: event.badges,
          canEdit: event.canEdit,
          canDrag: event.canDrag,
          appointmentType: event.appointmentType,
          nextActionType: event.nextActionType,
          location: event.location,
          assignedToUserId: event.assignedToUserId,
          createdByUserId: event.createdByUserId,
          resource: event, // Store original event for reference
        }));

        // Apply type filter if set
        if (advancedFilters.type) {
          transformedEvents = transformedEvents.filter((event) => {
            if (advancedFilters.type === 'FOLLOWUP') {
              return event.eventType === 'FOLLOWUP';
            } else if (advancedFilters.type === 'RDV' || advancedFilters.type === 'VISITE') {
              return event.eventType === 'APPOINTMENT' && event.appointmentType === advancedFilters.type;
            }
            return true;
          });
        }

        // Apply assignedTo filter if set
        if (advancedFilters.assignedTo) {
          transformedEvents = transformedEvents.filter((event) => {
            return event.assignedToUserId === advancedFilters.assignedTo;
          });
        }

        setEvents(transformedEvents);
      } else {
        setError('Erreur lors du chargement des événements');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des événements');
    } finally {
      setLoading(false);
    }
  }, [tenantId, dateRange, scope, showAppointments, showFollowups, advancedFilters]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Handle event selection
  const handleSelectEvent = (event: CalendarEventExtended) => {
    setSelectedEvent(event);
  };

  // Handle drag and drop
  const handleEventDrop = async ({ event, start, end }: { event: CalendarEventExtended; start: Date; end: Date }) => {
    if (!tenantId || !event.canDrag) return;

    setDraggedEvent(event);
    const originalStart = event.start;
    const originalEnd = event.end;

    // Optimistic update
    setEvents((prev) =>
      prev.map((e) =>
        e.eventId === event.eventId
          ? {
              ...e,
              start,
              end: event.eventType === 'APPOINTMENT' ? end : start, // Follow-ups are point-in-time
            }
          : e
      )
    );

    try {
      if (event.eventType === 'APPOINTMENT') {
        await rescheduleAppointment(tenantId, event.eventId, {
          startAt: start,
          endAt: end,
        });
      } else {
        // Follow-up
        await rescheduleFollowUp(tenantId, event.eventId, {
          nextActionAt: start,
        });
      }
      // Reload events to ensure consistency
      await loadEvents();
    } catch (err: any) {
      // Revert on error
      setEvents((prev) =>
        prev.map((e) =>
          e.eventId === event.eventId
            ? {
                ...e,
                start: originalStart,
                end: originalEnd,
              }
            : e
        )
      );
      setError(err.response?.data?.message || 'Erreur lors du déplacement de l\'événement');
    } finally {
      setDraggedEvent(null);
    }
  };

  // Handle resize (appointments only)
  const handleEventResize = async ({ event, start, end }: { event: CalendarEventExtended; start: Date; end: Date }) => {
    if (!tenantId || event.eventType !== 'APPOINTMENT' || !event.canDrag) return;

    const originalEnd = event.end;

    // Optimistic update
    setEvents((prev) =>
      prev.map((e) =>
        e.eventId === event.eventId
          ? {
              ...e,
              end,
            }
          : e
      )
    );

    try {
      await updateAppointmentCalendar(tenantId, event.eventId, {
        endAt: end,
      });
      await loadEvents();
    } catch (err: any) {
      // Revert on error
      setEvents((prev) =>
        prev.map((e) =>
          e.eventId === event.eventId
            ? {
                ...e,
                end: originalEnd,
              }
            : e
        )
      );
      setError(err.response?.data?.message || 'Erreur lors du redimensionnement de l\'événement');
    }
  };

  // Handle mark done
  const handleMarkDone = async () => {
    if (!tenantId || !selectedEvent) return;

    try {
      if (selectedEvent.eventType === 'APPOINTMENT') {
        await updateAppointmentCalendar(tenantId, selectedEvent.eventId, {
          status: 'DONE',
        });
      } else {
        await markFollowUpDone(tenantId, selectedEvent.eventId);
      }
      setSelectedEvent(null);
      await loadEvents();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la mise à jour');
    }
  };

  // Event style getter
  const eventStyleGetter = (event: CalendarEventExtended) => {
    const isAppointment = event.eventType === 'APPOINTMENT';
    const isDone = event.status === 'DONE' || event.status === 'CANCELED';
    const isFollowup = event.eventType === 'FOLLOWUP';

    let backgroundColor = isAppointment ? '#3b82f6' : '#10b981'; // Blue for appointments, green for follow-ups
    let borderColor = backgroundColor;

    if (isDone) {
      backgroundColor = '#9ca3af'; // Gray for done/canceled
      borderColor = '#9ca3af';
    }

    return {
      style: {
        backgroundColor,
        borderColor,
        color: '#fff',
        borderRadius: '4px',
        border: 'none',
        opacity: isDone ? 0.6 : 1,
        fontSize: '11px',
        padding: '2px 4px',
        lineHeight: '1.2',
      },
      className: 'rbc-event-small',
    };
  };

  // Handle create appointment
  const handleCreateAppointment = async (data: CreateCrmAppointmentRequest) => {
    if (!tenantId) return;

    try {
      await createAppointment(tenantId, data);
      setShowAppointmentForm(false);
      setPrefillContactId(undefined);
      setPrefillDealId(undefined);
      await loadEvents();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la création du rendez-vous');
    }
  };

  // Handle create follow-up
  const handleCreateFollowUp = async (data: CreateCrmActivityRequest) => {
    if (!tenantId) return;

    try {
      await createActivity(tenantId, {
        ...data,
        activityType: 'TASK',
        nextActionAt: data.nextActionAt || new Date(),
      });
      setShowActivityForm(false);
      setPrefillContactId(undefined);
      setPrefillDealId(undefined);
      await loadEvents();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la création de la relance');
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-4">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Calendrier CRM</h1>
            <p className="text-sm text-gray-600 mt-1">Gérez vos rendez-vous et relances</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const exportData = events.map(event => ({
                  'Type': event.eventType === 'APPOINTMENT' ? 'Rendez-vous' : 'Relance',
                  'Titre': event.title,
                  'Contact': event.contactName,
                  'Affaire': event.dealLabel || '',
                  'Date début': moment(event.start).format('DD/MM/YYYY HH:mm'),
                  'Date fin': event.end ? moment(event.end).format('DD/MM/YYYY HH:mm') : '',
                  'Type de rendez-vous': event.appointmentType || event.nextActionType || '',
                  'Lieu': event.location || '',
                  'Statut': event.status || '',
                  'Badges': event.badges.join(', ') || '',
                }));
                exportToCSV(exportData, 'calendrier');
              }}
            >
              <Download className="h-4 w-4 mr-2" />
              CSV
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const exportData = events.map(event => ({
                  'Type': event.eventType === 'APPOINTMENT' ? 'Rendez-vous' : 'Relance',
                  'Titre': event.title,
                  'Contact': event.contactName,
                  'Affaire': event.dealLabel || '',
                  'Date début': moment(event.start).format('DD/MM/YYYY HH:mm'),
                  'Date fin': event.end ? moment(event.end).format('DD/MM/YYYY HH:mm') : '',
                  'Type de rendez-vous': event.appointmentType || event.nextActionType || '',
                  'Lieu': event.location || '',
                  'Statut': event.status || '',
                  'Badges': event.badges.join(', ') || '',
                }));
                exportToExcel(exportData, 'calendrier', 'Calendrier');
              }}
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Excel
            </Button>
            <Button
              variant="outline"
              onClick={() => setCurrentDate(new Date())}
            >
              Aujourd'hui
            </Button>
            <Button
              onClick={() => {
                setShowAppointmentForm(true);
                setPrefillContactId(undefined);
                setPrefillDealId(undefined);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Nouveau rendez-vous
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowActivityForm(true);
                setPrefillContactId(undefined);
                setPrefillDealId(undefined);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Nouvelle relance
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 space-y-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Vue:</label>
              <div className="flex gap-1">
                <Button
                  variant={view === 'month' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setView('month')}
                >
                  Mois
                </Button>
                <Button
                  variant={view === 'week' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setView('week')}
                >
                  Semaine
                </Button>
                <Button
                  variant={view === 'day' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setView('day')}
                >
                  Jour
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="myCalendar"
                checked={scope === 'MINE'}
                onChange={(e) => setScope(e.target.checked ? 'MINE' : 'GLOBAL')}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="myCalendar" className="text-sm font-medium text-gray-700">
                Mon calendrier
              </label>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="showAppointments"
                checked={showAppointments}
                onChange={(e) => setShowAppointments(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="showAppointments" className="text-sm font-medium text-gray-700">
                Rendez-vous
              </label>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="showFollowups"
                checked={showFollowups}
                onChange={(e) => setShowFollowups(e.target.checked)}
                className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
              />
              <label htmlFor="showFollowups" className="text-sm font-medium text-gray-700">
                Relances
              </label>
            </div>
          </div>

          {/* Advanced Filters */}
          <div className="border-t pt-4">
            <AdvancedFilters
              tenantId={tenantId}
              config={{
                showDateRange: true,
                showAssignedTo: true,
                showType: true,
                dateRangeLabel: 'Période personnalisée',
                typeLabel: 'Type d\'événement',
                typeOptions: [
                  { value: 'RDV', label: 'Rendez-vous (RDV)' },
                  { value: 'VISITE', label: 'Visite' },
                  { value: 'FOLLOWUP', label: 'Relance' },
                ],
              }}
              filters={advancedFilters}
              onFiltersChange={(newFilters) => {
                setAdvancedFilters(newFilters);
                // Update date range if set
                if (newFilters.startDate || newFilters.endDate) {
                  const from = newFilters.startDate ? new Date(newFilters.startDate) : dateRange.from;
                  const to = newFilters.endDate ? new Date(newFilters.endDate) : dateRange.to;
                  setCurrentDate(from);
                  // The dateRange will be recalculated based on currentDate and view
                }
              }}
            />
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* Calendar */}
        <div className="bg-white rounded-lg shadow" style={{ height: '600px' }}>
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-gray-500">Chargement...</div>
            </div>
          ) : (
            <BigCalendar<CalendarEventExtended>
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              view={view}
              onView={setView}
              date={currentDate}
              onNavigate={setCurrentDate}
              onSelectEvent={handleSelectEvent}
              onEventDrop={handleEventDrop}
              onEventResize={handleEventResize}
              eventPropGetter={eventStyleGetter}
              draggableAccessor={(event: CalendarEventExtended) => event.canDrag}
              resizable={true}
              defaultDate={new Date()}
              messages={{
                next: 'Suivant',
                previous: 'Précédent',
                today: "Aujourd'hui",
                month: 'Mois',
                week: 'Semaine',
                day: 'Jour',
                agenda: 'Agenda',
                date: 'Date',
                time: 'Heure',
                event: 'Événement',
                noEventsInRange: 'Aucun événement cette période',
              }}
            />
          )}
        </div>

        {/* Event Detail Panel */}
        {selectedEvent && (
          <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-xl z-50 overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">Détails de l'événement</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedEvent(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{selectedEvent.title}</h3>
                  <div className="flex gap-2 mt-2">
                    {selectedEvent.badges.map((badge, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded"
                      >
                        {badge}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Clock className="h-4 w-4" />
                    <span>
                      {moment(selectedEvent.start).format('DD/MM/YYYY HH:mm')}
                      {selectedEvent.end && selectedEvent.eventType === 'APPOINTMENT' && (
                        <> - {moment(selectedEvent.end).format('HH:mm')}</>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <User className="h-4 w-4" />
                    <button
                      onClick={() => navigate(`/tenant/${tenantId}/crm/contacts/${selectedEvent.contactId}`)}
                      className="text-blue-600 hover:underline"
                    >
                      {selectedEvent.contactName}
                    </button>
                  </div>

                  {selectedEvent.dealId && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Briefcase className="h-4 w-4" />
                      <button
                        onClick={() => navigate(`/tenant/${tenantId}/crm/deals/${selectedEvent.dealId}`)}
                        className="text-blue-600 hover:underline"
                      >
                        {selectedEvent.dealLabel}
                      </button>
                    </div>
                  )}

                  {selectedEvent.location && (
                    <div className="text-sm text-gray-600">
                      <strong>Lieu:</strong> {selectedEvent.location}
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t">
                  <Button
                    onClick={handleMarkDone}
                    variant="outline"
                    className="w-full"
                    disabled={selectedEvent.status === 'DONE' || selectedEvent.status === 'CANCELED'}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Marquer comme terminé
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Appointment Form Modal */}
        {showAppointmentForm && tenantId && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-gray-900">Nouveau rendez-vous</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowAppointmentForm(false);
                      setPrefillContactId(undefined);
                      setPrefillDealId(undefined);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <AppointmentForm
                  tenantId={tenantId}
                  contactId={prefillContactId}
                  dealId={prefillDealId}
                  onSubmit={handleCreateAppointment}
                  onCancel={() => {
                    setShowAppointmentForm(false);
                    setPrefillContactId(undefined);
                    setPrefillDealId(undefined);
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Activity Form Modal */}
        {showActivityForm && tenantId && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-gray-900">Nouvelle relance / tâche</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowActivityForm(false);
                      setPrefillContactId(undefined);
                      setPrefillDealId(undefined);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <ActivityForm
                  tenantId={tenantId}
                  contactId={prefillContactId}
                  dealId={prefillDealId}
                  onSubmit={handleCreateFollowUp}
                  onCancel={() => {
                    setShowActivityForm(false);
                    setPrefillContactId(undefined);
                    setPrefillDealId(undefined);
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

