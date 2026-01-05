import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { AppointmentForm } from '../../components/crm/AppointmentForm';
import { Button } from '../../components/ui/button';
import {
  listAppointments,
  createAppointment,
  updateAppointment,
  CrmAppointment,
  CreateCrmAppointmentRequest,
  UpdateAppointmentStatusRequest,
  AppointmentFilters,
} from '../../services/crm-service';
import { Calendar, Plus, CheckCircle, XCircle, Clock, Download, FileSpreadsheet } from 'lucide-react';
import { AdvancedFilters, AdvancedFilters as AdvancedFiltersType } from '../../components/crm/AdvancedFilters';
import { CrmAppointmentStatus } from '../../types/crm-types';
import { exportToCSV, exportToExcel } from '../../utils/export-utils';

export const Appointments: React.FC = () => {
  const { tenantId, contactId, dealId } = useParams<{ tenantId: string; contactId?: string; dealId?: string }>();
  const [appointments, setAppointments] = useState<CrmAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState<AppointmentFilters>({
    page: 1,
    limit: 50,
    contactId: contactId,
    dealId: dealId,
  });
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFiltersType>({});

  useEffect(() => {
    if (tenantId) {
      loadAppointments();
    }
  }, [tenantId, filters, contactId, dealId, advancedFilters]);

  useEffect(() => {
    setFilters((prev: AppointmentFilters) => ({
      ...prev,
      contactId: contactId,
      dealId: dealId,
    }));
  }, [contactId, dealId]);

  const loadAppointments = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await listAppointments(tenantId, {
        ...filters,
        assignedTo: advancedFilters.assignedTo,
        status: advancedFilters.status as CrmAppointmentStatus | undefined,
        appointmentType: advancedFilters.type as any,
        startDate: advancedFilters.startDate ? new Date(advancedFilters.startDate) : undefined,
        endDate: advancedFilters.endDate ? new Date(advancedFilters.endDate) : undefined,
      });
      if (response.success) {
        setAppointments(response.appointments);
      } else {
        setError('Erreur lors du chargement des rendez-vous');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des rendez-vous');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (data: CreateCrmAppointmentRequest) => {
    if (!tenantId) return;
    try {
      await createAppointment(tenantId, data);
      setShowForm(false);
      await loadAppointments();
    } catch (err: any) {
      throw err;
    }
  };

  const handleStatusUpdate = async (appointmentId: string, status: string) => {
    if (!tenantId) return;
    try {
      await updateAppointment(tenantId, appointmentId, { status: status as any });
      await loadAppointments();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erreur lors de la mise à jour du rendez-vous');
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; text: string; icon: any }> = {
      SCHEDULED: { bg: 'bg-blue-100', text: 'text-blue-800', icon: Clock },
      CONFIRMED: { bg: 'bg-green-100', text: 'text-green-800', icon: CheckCircle },
      DONE: { bg: 'bg-gray-100', text: 'text-gray-800', icon: CheckCircle },
      NO_SHOW: { bg: 'bg-orange-100', text: 'text-orange-800', icon: XCircle },
      CANCELED: { bg: 'bg-red-100', text: 'text-red-800', icon: XCircle },
    };
    const style = styles[status] || styles.SCHEDULED;
    const Icon = style.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
        <Icon className="h-3 w-3" />
        {status}
      </span>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Rendez-vous</h1>
            <p className="text-gray-600 mt-1">Planifiez et gérez les rendez-vous</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const exportData = appointments.map(appointment => ({
                  'Type': appointment.appointmentType,
                  'Contact': appointment.contact ? `${appointment.contact.firstName} ${appointment.contact.lastName}` : '',
                  'Date': new Date(appointment.startAt).toLocaleDateString('fr-FR'),
                  'Heure début': new Date(appointment.startAt).toLocaleTimeString('fr-FR'),
                  'Heure fin': new Date(appointment.endAt).toLocaleTimeString('fr-FR'),
                  'Lieu': appointment.location || '',
                  'Statut': appointment.status,
                  'Date de création': new Date(appointment.createdAt).toLocaleDateString('fr-FR'),
                }));
                exportToCSV(exportData, 'rendez-vous');
              }}
            >
              <Download className="h-4 w-4 mr-2" />
              Exporter CSV
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const exportData = appointments.map(appointment => ({
                  'Type': appointment.appointmentType,
                  'Contact': appointment.contact ? `${appointment.contact.firstName} ${appointment.contact.lastName}` : '',
                  'Date': new Date(appointment.startAt).toLocaleDateString('fr-FR'),
                  'Heure début': new Date(appointment.startAt).toLocaleTimeString('fr-FR'),
                  'Heure fin': new Date(appointment.endAt).toLocaleTimeString('fr-FR'),
                  'Lieu': appointment.location || '',
                  'Statut': appointment.status,
                  'Date de création': new Date(appointment.createdAt).toLocaleDateString('fr-FR'),
                }));
                exportToExcel(exportData, 'rendez-vous', 'Rendez-vous');
              }}
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Exporter Excel
            </Button>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nouveau rendez-vous
            </Button>
          </div>
        </div>

        {showForm && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Créer un nouveau rendez-vous</h2>
            <AppointmentForm
              tenantId={tenantId!}
              contactId={contactId}
              dealId={dealId}
              onSubmit={handleCreate}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

        {/* Advanced Filters */}
        <div className="bg-white rounded-lg shadow p-4">
          <AdvancedFilters
            tenantId={tenantId}
            config={{
              showDateRange: true,
              showAssignedTo: true,
              showStatus: true,
              showType: true,
              dateRangeLabel: 'Période des rendez-vous',
              statusLabel: 'Statut',
              typeLabel: 'Type',
              statusOptions: [
                { value: 'SCHEDULED', label: 'Planifié' },
                { value: 'CONFIRMED', label: 'Confirmé' },
                { value: 'DONE', label: 'Terminé' },
                { value: 'NO_SHOW', label: 'Absent' },
                { value: 'CANCELED', label: 'Annulé' },
              ],
              typeOptions: [
                { value: 'RDV', label: 'Rendez-vous' },
                { value: 'VISITE', label: 'Visite' },
              ],
            }}
            filters={advancedFilters}
            onFiltersChange={setAdvancedFilters}
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            <p className="mt-2 text-gray-600">Chargement des rendez-vous...</p>
          </div>
        ) : appointments.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun rendez-vous trouvé</h3>
            <p className="text-gray-600 mb-4">Commencez par créer votre premier rendez-vous.</p>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Créer un rendez-vous
            </Button>
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
                    Date et heure
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Lieu
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Statut
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {appointments.map((appointment) => (
                  <tr key={appointment.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{appointment.appointmentType}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {appointment.contact?.firstName} {appointment.contact?.lastName}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {new Date(appointment.startAt).toLocaleDateString()}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(appointment.startAt).toLocaleTimeString()} - {new Date(appointment.endAt).toLocaleTimeString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">{appointment.location || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(appointment.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end gap-2">
                        {appointment.status === 'SCHEDULED' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleStatusUpdate(appointment.id, 'CONFIRMED')}
                          >
                            Confirmer
                          </Button>
                        )}
                        {appointment.status !== 'DONE' && appointment.status !== 'CANCELED' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleStatusUpdate(appointment.id, 'DONE')}
                          >
                            Marquer comme terminé
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

