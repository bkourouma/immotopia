import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Button,
  Checkbox,
  Space,
  Typography,
  Alert,
  Spin,
  Modal,
  Drawer,
  Tag,
  Divider,
  Row,
  Col,
} from 'antd';
import {
  PlusOutlined,
  CloseOutlined,
  ClockCircleOutlined,
  UserOutlined,
  ProjectOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  FileExcelOutlined,
  EnvironmentOutlined,
  HomeOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import {
  getCalendarEvents,
  rescheduleFollowUp,
  markFollowUpDone,
  CalendarEvent,
  CalendarEventType,
  CalendarScope,
  CalendarFilters,
} from '../../services/crm-service';
import { Calendar as BigCalendar, momentLocalizer, View, Event as RBCEvent } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import './Calendar.css';
import { ActivityForm } from '../../components/crm/ActivityForm';
import { createActivity, CreateCrmActivityRequest } from '../../services/crm-service';
import { AdvancedFilters, AdvancedFilters as AdvancedFiltersType } from '../../components/crm/AdvancedFilters';
import { exportToCSV, exportToExcel } from '../../utils/export-utils';

const { Title, Text } = Typography;

// Configure moment localizer
const localizer = momentLocalizer(moment);

// Extend CalendarEvent to work with react-big-calendar
interface CalendarEventExtended extends RBCEvent {
  title: string;
  start: Date;
  end: Date;
  eventId: string;
  eventType: CalendarEventType;
  contactId: string;
  contactName: string;
  dealId: string | null;
  dealLabel: string | null;
  status?: string;
  badges: string[];
  canEdit: boolean;
  canDrag: boolean;
  nextActionType?: string;
  location?: string;
  assignedToUserId?: string | null;
  createdByUserId: string;
  propertyId?: string | null; // For property visits
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
  const [showFollowups, setShowFollowups] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventExtended | null>(null);
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
      let typesToLoad: ('followups' | 'propertyVisits')[] = [];
      
      // Always include property visits in the global calendar
      typesToLoad.push('propertyVisits');
      
      // If advanced filter has a type, use it to determine what to load
      if (advancedFilters.type) {
        if (advancedFilters.type === 'FOLLOWUP') {
          typesToLoad.push('followups');
        } else if (advancedFilters.type === 'VISITE' || advancedFilters.type === 'RDV') {
          // Only property visits (already included)
          typesToLoad = ['propertyVisits'];
        }
      } else {
        // Use checkboxes if no advanced filter
        if (showFollowups) {
          typesToLoad.push('followups');
        }
      }

      const filters: CalendarFilters = {
        from: dateRange.from,
        to: dateRange.to,
        scope,
        types: typesToLoad.length > 0 ? typesToLoad : ['followups', 'propertyVisits'],
      };

      const response = await getCalendarEvents(tenantId, filters);

      if (response.success) {
        // Transform events to react-big-calendar format
        const transformedEvents: CalendarEventExtended[] = [];
        
        for (const event of response.events) {
          // Validate dates before creating Date objects
          const startDate = event.start ? new Date(event.start) : null;
          const endDate = event.end ? new Date(event.end) : null;
          
          // Skip events with invalid start dates
          if (!startDate || isNaN(startDate.getTime())) {
            console.warn('Skipping event with invalid start date:', event);
            continue;
          }
          
          transformedEvents.push({
            eventId: event.eventId,
            eventType: event.eventType,
            title: event.title,
            start: startDate,
            end: endDate && !isNaN(endDate.getTime()) ? endDate : startDate, // Use start as end for follow-ups or if end is invalid
            contactId: event.contactId,
            contactName: event.contactName,
            dealId: event.dealId,
            dealLabel: event.dealLabel,
            status: event.status,
            badges: event.badges,
            canEdit: event.canEdit,
            canDrag: event.canDrag,
            nextActionType: event.nextActionType,
            location: event.location,
            assignedToUserId: event.assignedToUserId,
            createdByUserId: event.createdByUserId,
            propertyId: event.propertyId,
            resource: event, // Store original event for reference
          });
        }
        
        let filteredEvents = transformedEvents;

        // Apply type filter if set
        if (advancedFilters.type) {
          filteredEvents = filteredEvents.filter((event) => {
            if (advancedFilters.type === 'FOLLOWUP') {
              return event.eventType === 'FOLLOWUP';
            }
            if (advancedFilters.type === 'VISITE' || advancedFilters.type === 'RDV') {
              return event.eventType === 'PROPERTY_VISIT';
            }
            return true;
          });
        }

        // Apply assignedTo filter if set
        if (advancedFilters.assignedTo) {
          filteredEvents = filteredEvents.filter((event) => {
            return event.assignedToUserId === advancedFilters.assignedTo;
          });
        }

        // Apply contactName filter if set
        if (advancedFilters.contactName) {
          const searchTerm = advancedFilters.contactName.toLowerCase().trim();
          filteredEvents = filteredEvents.filter((event) => {
            if (!event.contactName) return false;
            return event.contactName.toLowerCase().includes(searchTerm);
          });
        }

        setEvents(filteredEvents);
      } else {
        setError('Erreur lors du chargement des événements');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des événements');
    } finally {
      setLoading(false);
    }
  }, [tenantId, dateRange, scope, showFollowups, advancedFilters]);

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

    // Only allow dragging for follow-ups (property visits rescheduling not yet implemented)
    if (event.eventType === 'PROPERTY_VISIT') {
      setError('Le déplacement des visites de propriétés n\'est pas encore disponible');
      return;
    }

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
              end: start, // Follow-ups are point-in-time
            }
          : e
      )
    );

    try {
      // Follow-up
      await rescheduleFollowUp(tenantId, event.eventId, {
        nextActionAt: start,
      });
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

  // Handle event resize
  const handleEventResize = async ({ event, start, end }: { event: CalendarEventExtended; start: Date; end: Date }) => {
    if (!tenantId || !event.canDrag) return;

    const originalStart = event.start;
    const originalEnd = event.end;

    // Optimistic update
    setEvents((prev) =>
      prev.map((e) =>
        e.eventId === event.eventId
          ? {
              ...e,
              start,
              end,
            }
          : e
      )
    );

    try {
      // For follow-ups, reschedule with new time
      if (event.eventType === 'FOLLOWUP') {
        await rescheduleFollowUp(tenantId, event.eventId, {
          nextActionAt: start,
        });
      } else if (event.eventType === 'PROPERTY_VISIT') {
        // Property visit resizing not yet implemented
        setError('Le redimensionnement des visites de propriétés n\'est pas encore disponible');
        return;
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
      setError(err.response?.data?.message || 'Erreur lors du redimensionnement de l\'événement');
    }
  };


  // Handle mark done
  const handleMarkDone = async () => {
    if (!tenantId || !selectedEvent) return;

    try {
      if (selectedEvent.eventType === 'FOLLOWUP') {
        await markFollowUpDone(tenantId, selectedEvent.eventId);
      } else if (selectedEvent.eventType === 'PROPERTY_VISIT' && selectedEvent.propertyId) {
        // For property visits, we need to extract propertyId from the event
        // The eventId is the visitId, and we have propertyId in the event
        const { completePropertyVisit } = await import('../../services/property-service');
        await completePropertyVisit(tenantId, selectedEvent.propertyId, selectedEvent.eventId);
      }
      setSelectedEvent(null);
      await loadEvents();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la mise à jour');
    }
  };

  // Event style getter
  const eventStyleGetter = (event: CalendarEventExtended) => {
    const isDone = event.status === 'DONE' || event.status === 'CANCELED';
    const isFollowup = event.eventType === 'FOLLOWUP';
    const isPropertyVisit = event.eventType === 'PROPERTY_VISIT';

    let backgroundColor = '#10b981'; // Green for follow-ups
    if (isPropertyVisit) {
      backgroundColor = '#3b82f6'; // Blue for property visits
    }
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
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {/* Header */}
        <Row gutter={[16, 16]} justify="space-between" align="middle">
          <Col xs={24} sm={24} md={12}>
            <Title level={2} style={{ margin: 0 }}>Calendrier CRM</Title>
            <Text type="secondary">Gérez vos rendez-vous et relances</Text>
          </Col>
          <Col xs={24} sm={24} md={12}>
            <Space wrap style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button.Group>
                <Button
                  icon={<DownloadOutlined />}
                  onClick={() => {
                    const exportData = events.map(event => ({
                      'Type': event.eventType === 'FOLLOWUP' ? 'Relance' : 'Visite',
                      'Titre': event.title,
                      'Contact': event.contactName,
                      'Affaire': event.dealLabel || '',
                      'Date début': event.start && moment(event.start).isValid()
                        ? moment(event.start).format('DD/MM/YYYY HH:mm')
                        : 'Date invalide',
                      'Date fin': event.end && moment(event.end).isValid()
                        ? moment(event.end).format('DD/MM/YYYY HH:mm')
                        : '',
                      'Type d\'action': event.nextActionType || '',
                      'Lieu': event.location || '',
                      'Statut': event.status || '',
                      'Badges': event.badges.join(', ') || '',
                    }));
                    exportToCSV(exportData, 'calendrier');
                  }}
                >
                  CSV
                </Button>
                <Button
                  icon={<FileExcelOutlined />}
                  onClick={() => {
                    const exportData = events.map(event => ({
                      'Type': event.eventType === 'FOLLOWUP' ? 'Relance' : 'Visite',
                      'Titre': event.title,
                      'Contact': event.contactName,
                      'Affaire': event.dealLabel || '',
                      'Date début': event.start && moment(event.start).isValid()
                        ? moment(event.start).format('DD/MM/YYYY HH:mm')
                        : 'Date invalide',
                      'Date fin': event.end && moment(event.end).isValid()
                        ? moment(event.end).format('DD/MM/YYYY HH:mm')
                        : '',
                      'Type d\'action': event.nextActionType || '',
                      'Lieu': event.location || '',
                      'Statut': event.status || '',
                      'Badges': event.badges.join(', ') || '',
                    }));
                    exportToExcel(exportData, 'calendrier', 'Calendrier');
                  }}
                >
                  Excel
                </Button>
              </Button.Group>
              <Button
                onClick={() => setCurrentDate(new Date())}
              >
                Aujourd'hui
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  setShowActivityForm(true);
                  setPrefillContactId(undefined);
                  setPrefillDealId(undefined);
                }}
              >
                <span className="hidden sm:inline">Nouvelle activité</span>
                <span className="sm:hidden">Activité</span>
              </Button>
              <Button
                icon={<PlusOutlined />}
                onClick={() => {
                  setShowActivityForm(true);
                  setPrefillContactId(undefined);
                  setPrefillDealId(undefined);
                }}
              >
                <span className="hidden sm:inline">Nouvelle relance</span>
                <span className="sm:hidden">Relance</span>
              </Button>
            </Space>
          </Col>
        </Row>

        {/* Filters */}
        <Card>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Row gutter={[16, 16]} align="middle">
              <Col xs={24} sm={12} md={8}>
                <Space wrap>
                  <Text strong>Vue:</Text>
                  <Button.Group>
                    <Button
                      type={view === 'month' ? 'primary' : 'default'}
                      onClick={() => setView('month')}
                    >
                      Mois
                    </Button>
                    <Button
                      type={view === 'week' ? 'primary' : 'default'}
                      onClick={() => setView('week')}
                    >
                      Semaine
                    </Button>
                    <Button
                      type={view === 'day' ? 'primary' : 'default'}
                      onClick={() => setView('day')}
                    >
                      Jour
                    </Button>
                  </Button.Group>
                </Space>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Space>
                  <Checkbox
                    checked={scope === 'MINE'}
                    onChange={(e) => setScope(e.target.checked ? 'MINE' : 'GLOBAL')}
                  >
                    Mon calendrier
                  </Checkbox>
                  <Checkbox
                    checked={showFollowups}
                    onChange={(e) => setShowFollowups(e.target.checked)}
                  >
                    Relances
                  </Checkbox>
                </Space>
              </Col>
            </Row>

            {/* Advanced Filters */}
            <Divider />
            <AdvancedFilters
              tenantId={tenantId}
              config={{
                showDateRange: true,
                showAssignedTo: true,
                showType: true,
                showContactName: true,
                dateRangeLabel: 'Période personnalisée',
                typeLabel: 'Type d\'événement',
                contactNameLabel: 'Nom du client',
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
          </Space>
        </Card>

        {/* Error message */}
        {error && (
          <Alert message={error} type="error" showIcon closable onClose={() => setError(null)} />
        )}

        {/* Calendar */}
        <Card>
          <div 
            style={{ 
              height: '600px',
              minHeight: '400px',
              overflow: 'auto'
            }}
            className="calendar-container"
          >
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <Spin size="large" />
                <Text type="secondary" style={{ marginLeft: 16 }}>Chargement...</Text>
              </div>
            ) : (
            <div style={{ height: '100%', width: '100%' }}>
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
            </div>
            )}
          </div>
        </Card>

        {/* Event Detail Panel */}
        <Drawer
          title="Détails de l'événement"
          placement="right"
          onClose={() => setSelectedEvent(null)}
          open={selectedEvent !== null}
          width={400}
          className="event-detail-drawer"
        >
          {selectedEvent && (
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <div>
                <Title level={4} style={{ margin: 0, marginBottom: 8 }}>
                  {selectedEvent.title}
                </Title>
                <Space wrap>
                  {selectedEvent.badges.map((badge, idx) => (
                    <Tag key={idx} color="blue">
                      {badge}
                    </Tag>
                  ))}
                </Space>
              </div>

              <Divider />

              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <Space>
                  <ClockCircleOutlined />
                  <Text>
                    {selectedEvent.start && moment(selectedEvent.start).isValid()
                      ? moment(selectedEvent.start).format('DD/MM/YYYY HH:mm')
                      : 'Date invalide'}
                    {selectedEvent.end && moment(selectedEvent.end).isValid() && (
                      <> - {moment(selectedEvent.end).format('HH:mm')}</>
                    )}
                  </Text>
                </Space>

                <Space>
                  <UserOutlined />
                  <Button
                    type="link"
                    onClick={() => navigate(`/tenant/${tenantId}/crm/contacts/${selectedEvent.contactId}`)}
                    style={{ padding: 0 }}
                  >
                    {selectedEvent.contactName}
                  </Button>
                </Space>

                {selectedEvent.dealId && (
                  <Space>
                    <ProjectOutlined />
                    <Button
                      type="link"
                      onClick={() => navigate(`/tenant/${tenantId}/crm/deals/${selectedEvent.dealId}`)}
                      style={{ padding: 0 }}
                    >
                      {selectedEvent.dealLabel}
                    </Button>
                  </Space>
                )}

                {selectedEvent.location && (
                  <Space>
                    <EnvironmentOutlined />
                    <Text>{selectedEvent.location}</Text>
                  </Space>
                )}

                {selectedEvent.propertyId && (
                  <Space>
                    <HomeOutlined />
                    <Button
                      type="link"
                      onClick={() => navigate(`/tenant/${tenantId}/properties/${selectedEvent.propertyId}`)}
                      style={{ padding: 0 }}
                    >
                      Voir la propriété
                    </Button>
                  </Space>
                )}
              </Space>

              <Divider />

              <Button
                onClick={handleMarkDone}
                block
                icon={<CheckCircleOutlined />}
                disabled={selectedEvent.status === 'DONE' || selectedEvent.status === 'CANCELED'}
              >
                Marquer comme terminé
              </Button>
            </Space>
          )}
        </Drawer>

        {/* Activity Form Modal */}
        <Modal
          title="Nouvelle relance / tâche"
          open={showActivityForm}
          onCancel={() => {
            setShowActivityForm(false);
            setPrefillContactId(undefined);
            setPrefillDealId(undefined);
          }}
          footer={null}
          width={800}
        >
          {tenantId && (
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
          )}
        </Modal>
      </Space>
    </DashboardLayout>
  );
};

