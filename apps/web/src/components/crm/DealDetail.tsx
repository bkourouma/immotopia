import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import { getDeal, updateDeal, CrmDeal, CrmDealDetail, UpdateCrmDealRequest, listAppointments, createAppointment, CrmAppointment, AppointmentFilters, CreateCrmAppointmentRequest } from '../../services/crm-service';
import { ActivityTimeline } from './ActivityTimeline';
import { PropertyMatching } from '../properties/PropertyMatching';
import { AppointmentForm } from './AppointmentForm';
import { getDealTypeLabel } from '../../utils/crm-utils';
import { Briefcase, User, Calendar, MapPin, DollarSign, Activity, Mail, Phone, Home, Tag, FileText, TrendingUp, Clock, CheckCircle, XCircle, Plus, Users, X } from 'lucide-react';

interface DealDetailProps {
  tenantId: string;
  dealId: string;
}

export const DealDetail: React.FC<DealDetailProps> = ({ tenantId, dealId }) => {
  const navigate = useNavigate();
  const [deal, setDeal] = useState<CrmDealDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingStage, setUpdatingStage] = useState(false);
  const [appointments, setAppointments] = useState<CrmAppointment[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(true);
  const [showAppointmentForm, setShowAppointmentForm] = useState(false);

  useEffect(() => {
    loadDeal();
    loadAppointments();
  }, [tenantId, dealId]);

  const loadDeal = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getDeal(tenantId, dealId);
      if (response.success) {
        setDeal(response.data);
      } else {
        setError('Erreur lors du chargement de l\'affaire');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement de l\'affaire');
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
        dealId: dealId,
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

  const handleStageChange = async (newStage: string) => {
    if (!deal) return;
    setUpdatingStage(true);
    try {
      const updateData: UpdateCrmDealRequest = {
        stage: newStage as any,
        version: deal.version,
      };
      const response = await updateDeal(tenantId, dealId, updateData);
      if (response.success) {
        setDeal(response.data);
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erreur lors de la mise à jour du stade de l\'affaire');
    } finally {
      setUpdatingStage(false);
    }
  };

  const handleCreateAppointment = async (data: CreateCrmAppointmentRequest) => {
    try {
      await createAppointment(tenantId, data);
      setShowAppointmentForm(false);
      await loadAppointments();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erreur lors de la création du rendez-vous');
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
        className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
          styles[stage] || styles.NEW
        }`}
      >
        {getStageLabel(stage)}
      </span>
    );
  };

  const getPropertyTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      APPARTEMENT: 'Appartement',
      VILLA: 'Villa',
      MAISON: 'Maison',
      TERRAIN: 'Terrain',
      BUREAU: 'Bureau',
      COMMERCE: 'Local commercial',
      STUDIO: 'Studio',
      DUPLEX: 'Duplex',
      PENTHOUSE: 'Penthouse',
      AUTRE: 'Autre',
    };
    return labels[type] || type;
  };

  const formatNumber = (value: number | undefined): string => {
    if (!value) return '';
    return value.toLocaleString('fr-FR').replace(/,/g, ' ');
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

  const criteria = deal?.criteriaJson as any || {};

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        <p className="mt-2 text-gray-600">Chargement de l'affaire...</p>
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

  if (!deal) {
    return <div>Affaire non trouvée</div>;
  }

  return (
    <div className="space-y-6 pb-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-gray-900">
                  {getDealTypeLabel(deal.type)}
                </h1>
                {getStageBadge(deal.stage)}
              </div>
            </div>
            <div className="flex gap-2 ml-4">
              <select
                value={deal.stage}
                onChange={(e) => handleStageChange(e.target.value)}
                disabled={updatingStage}
                className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              >
                <option value="NEW">Nouveau</option>
                <option value="QUALIFIED">Qualifié</option>
                <option value="APPOINTMENT">Rendez-vous</option>
                <option value="VISIT">Visite</option>
                <option value="NEGOTIATION">Négociation</option>
                <option value="WON">Gagné</option>
                <option value="LOST">Perdu</option>
              </select>
              <Button variant="outline" onClick={() => navigate(`/tenant/${tenantId}/crm/deals/${dealId}/edit`)}>
                Modifier
              </Button>
            </div>
          </div>
        </div>
        
        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Contact Information */}
            {deal.contact && (
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <User className="h-5 w-5 text-blue-600" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Contact</h3>
                </div>
                <div className="space-y-2.5">
                  <div className="flex items-center text-gray-900">
                    <span className="font-semibold text-base">{deal.contact.firstName} {deal.contact.lastName}</span>
                  </div>
                  {deal.contact.email && (
                    <div className="flex items-center text-gray-600">
                      <Mail className="h-4 w-4 mr-2.5 text-gray-400" />
                      <a href={`mailto:${deal.contact.email}`} className="text-sm hover:text-blue-600 transition-colors">
                        {deal.contact.email}
                      </a>
                    </div>
                  )}
                  {deal.contact.phone && (
                    <div className="flex items-center text-gray-600">
                      <Phone className="h-4 w-4 mr-2.5 text-gray-400" />
                      <a href={`tel:${deal.contact.phone}`} className="text-sm hover:text-blue-600 transition-colors">
                        {deal.contact.phone}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Budget & Location */}
            <div className="space-y-4">
              {/* Budget */}
              {(deal.budgetMin || deal.budgetMax) && (
                <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <DollarSign className="h-5 w-5 text-green-600" />
                    </div>
                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Budget</h3>
                  </div>
                  <div className="text-lg font-bold text-gray-900">
                    {deal.budgetMin && deal.budgetMax
                      ? `${formatNumber(deal.budgetMin)} - ${formatNumber(deal.budgetMax)} FCFA`
                      : deal.budgetMax
                      ? `Jusqu'à ${formatNumber(deal.budgetMax)} FCFA`
                      : `À partir de ${formatNumber(deal.budgetMin)} FCFA`}
                  </div>
                </div>
              )}
              
              {/* Location */}
              {deal.locationZone && (
                <div className="bg-purple-50 rounded-lg p-4 border border-purple-100">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <MapPin className="h-5 w-5 text-purple-600" />
                    </div>
                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Localisation</h3>
                  </div>
                  <div className="text-gray-900 font-medium">
                    {deal.locationZone}
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Dates */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="flex items-center gap-6 text-sm text-gray-600">
              {deal.createdAt && (
                <div className="flex items-center">
                  <Calendar className="h-4 w-4 mr-2 text-gray-400" />
                  <span className="font-medium">Créé le</span>
                  <span className="ml-2">{new Date(deal.createdAt).toLocaleDateString('fr-FR', { 
                    day: 'numeric', 
                    month: 'long', 
                    year: 'numeric' 
                  })}</span>
                </div>
              )}
              {deal.updatedAt && (
                <div className="flex items-center">
                  <Calendar className="h-4 w-4 mr-2 text-gray-400" />
                  <span className="font-medium">Modifié le</span>
                  <span className="ml-2">{new Date(deal.updatedAt).toLocaleDateString('fr-FR', { 
                    day: 'numeric', 
                    month: 'long', 
                    year: 'numeric' 
                  })}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Appointments */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-gray-900 flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg mr-3">
                <Calendar className="h-5 w-5 text-blue-600" />
              </div>
              Rendez-vous {appointments.length > 0 && (
                <span className="ml-2 px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold">
                  {appointments.length}
                </span>
              )}
            </h2>
            <Button
              onClick={() => setShowAppointmentForm(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              Nouveau rendez-vous
            </Button>
          </div>
        </div>
        <div className="p-6">
          {appointmentsLoading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-3 text-gray-600 text-sm">Chargement des rendez-vous...</p>
            </div>
          ) : appointments.length > 0 ? (
            <div className="space-y-4">
              {appointments.map((appointment) => (
                <div
                  key={appointment.id}
                  className="p-5 bg-gray-50 rounded-xl hover:bg-gray-100 border border-gray-200 hover:border-blue-300 transition-all cursor-pointer"
                  onClick={() => navigate(`/tenant/${tenantId}/crm/appointments/${appointment.id}`)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="font-semibold text-gray-900 text-base">{appointment.appointmentType}</span>
                        {getAppointmentStatusBadge(appointment.status)}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div className="flex items-center text-gray-700">
                          <Calendar className="h-4 w-4 mr-2.5 text-gray-400 flex-shrink-0" />
                          <span className="font-medium">{new Date(appointment.startAt).toLocaleDateString('fr-FR', {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })}</span>
                        </div>
                        <div className="flex items-center text-gray-700">
                          <Clock className="h-4 w-4 mr-2.5 text-gray-400 flex-shrink-0" />
                          <span className="font-medium">
                            {new Date(appointment.startAt).toLocaleTimeString('fr-FR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}{' '}
                            -{' '}
                            {new Date(appointment.endAt).toLocaleTimeString('fr-FR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        {appointment.location && (
                          <div className="flex items-center text-gray-700">
                            <MapPin className="h-4 w-4 mr-2.5 text-gray-400 flex-shrink-0" />
                            <span>{appointment.location}</span>
                          </div>
                        )}
                        {appointment.contact && (
                          <div className="flex items-center text-gray-700">
                            <User className="h-4 w-4 mr-2.5 text-gray-400 flex-shrink-0" />
                            <span>{appointment.contact.firstName} {appointment.contact.lastName}</span>
                          </div>
                        )}
                      </div>
                      {appointment.collaborators && appointment.collaborators.length > 0 && (
                        <div className="flex items-center flex-wrap gap-2 mt-3 pt-3 border-t border-gray-200">
                          <Users className="h-4 w-4 text-gray-400" />
                          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Collaborateurs:</span>
                          {appointment.collaborators.map((collab, idx) => (
                            <span key={collab.id} className="text-xs text-gray-600 bg-gray-200 px-2 py-1 rounded">
                              {collab.user.fullName || collab.user.email}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
              </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                  <Calendar className="h-8 w-8 text-gray-400" />
                </div>
                <p className="text-gray-600 font-medium mb-1">Aucun rendez-vous planifié</p>
                <p className="text-gray-500 text-sm mb-6">Commencez par créer votre premier rendez-vous</p>
                <Button
                  onClick={() => setShowAppointmentForm(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Créer un rendez-vous
                </Button>
              </div>
            )}
        </div>
      </div>

      {/* Type de bien et critères */}
      {(criteria.propertyType || deal.expectedValue) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-xl font-bold text-gray-900 flex items-center">
              <div className="p-2 bg-indigo-100 rounded-lg mr-3">
                <Home className="h-5 w-5 text-indigo-600" />
              </div>
              Type de bien et critères
            </h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Type de bien */}
              {criteria.propertyType && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Type de bien recherché</label>
                  <div className="flex items-center text-gray-900">
                    <Tag className="h-5 w-5 mr-2.5 text-indigo-600" />
                    <span className="text-base font-semibold">{getPropertyTypeLabel(criteria.propertyType)}</span>
                  </div>
                </div>
              )}
              
              {/* Valeur estimée */}
              {deal.expectedValue && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Valeur estimée de la transaction</label>
                  <div className="flex items-center text-gray-900">
                    <TrendingUp className="h-5 w-5 mr-2.5 text-green-600" />
                    <span className="text-base font-semibold">{formatNumber(deal.expectedValue)} FCFA</span>
                  </div>
                </div>
              )}
            </div>

            {/* Critères spécifiques */}
            {(criteria.rooms || criteria.surface || criteria.furnishingStatus || criteria.landArea || 
              criteria.hasGarden || criteria.hasPool || criteria.hasGarage || criteria.hasParking || 
              criteria.hasElevator || criteria.hasBalcony || criteria.floor || criteria.officeCount ||
              criteria.commercialType || criteria.hasStorefront || criteria.hasReception || criteria.hasTerrace) && (
              <div className="pt-6 border-t border-gray-200">
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4">Critères spécifiques</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {criteria.rooms && (
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                      <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Nombre de pièces</span>
                      <div className="mt-1 text-sm font-semibold text-gray-900">{criteria.rooms}</div>
                    </div>
                  )}
                  {criteria.surface && (
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                      <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Surface</span>
                      <div className="mt-1 text-sm font-semibold text-gray-900">{criteria.surface} m²</div>
                    </div>
                  )}
                  {criteria.landArea && (
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                      <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Surface du terrain</span>
                      <div className="mt-1 text-sm font-semibold text-gray-900">{criteria.landArea} m²</div>
                    </div>
                  )}
                  {criteria.furnishingStatus && (
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                      <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">État du meublé</span>
                      <div className="mt-1 text-sm font-semibold text-gray-900">
                        {criteria.furnishingStatus === 'MEUBLE' ? 'Meublé' :
                         criteria.furnishingStatus === 'SEMI_MEUBLE' ? 'Semi-meublé' :
                         criteria.furnishingStatus === 'NON_MEUBLE' ? 'Non meublé' : criteria.furnishingStatus}
                      </div>
                    </div>
                  )}
                  {criteria.floor && (
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                      <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Étage</span>
                      <div className="mt-1 text-sm font-semibold text-gray-900">{criteria.floor}</div>
                    </div>
                  )}
                  {criteria.officeCount && (
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                      <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Nombre de bureaux</span>
                      <div className="mt-1 text-sm font-semibold text-gray-900">{criteria.officeCount}</div>
                    </div>
                  )}
                  {criteria.commercialType && (
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                      <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Type de commerce</span>
                      <div className="mt-1 text-sm font-semibold text-gray-900">{criteria.commercialType}</div>
                    </div>
                  )}
                  {(criteria.hasGarden || criteria.hasPool || criteria.hasGarage || criteria.hasParking ||
                    criteria.hasElevator || criteria.hasBalcony || criteria.hasStorefront || 
                    criteria.hasReception || criteria.hasTerrace) && (
                    <div className="md:col-span-2 lg:col-span-3">
                      <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                        <span className="text-xs text-gray-500 font-bold uppercase tracking-wide block mb-3">Équipements</span>
                        <div className="flex flex-wrap gap-2">
                          {criteria.hasGarden && <span className="px-3 py-1.5 bg-green-100 text-green-800 rounded-lg text-sm font-medium">Jardin</span>}
                          {criteria.hasPool && <span className="px-3 py-1.5 bg-blue-100 text-blue-800 rounded-lg text-sm font-medium">Piscine</span>}
                          {criteria.hasGarage && <span className="px-3 py-1.5 bg-gray-200 text-gray-800 rounded-lg text-sm font-medium">Garage</span>}
                          {criteria.hasParking && <span className="px-3 py-1.5 bg-gray-200 text-gray-800 rounded-lg text-sm font-medium">Parking</span>}
                          {criteria.hasElevator && <span className="px-3 py-1.5 bg-gray-200 text-gray-800 rounded-lg text-sm font-medium">Ascenseur</span>}
                          {criteria.hasBalcony && <span className="px-3 py-1.5 bg-gray-200 text-gray-800 rounded-lg text-sm font-medium">Balcon</span>}
                          {criteria.hasStorefront && <span className="px-3 py-1.5 bg-gray-200 text-gray-800 rounded-lg text-sm font-medium">Vitrine</span>}
                          {criteria.hasReception && <span className="px-3 py-1.5 bg-gray-200 text-gray-800 rounded-lg text-sm font-medium">Réception</span>}
                          {criteria.hasTerrace && <span className="px-3 py-1.5 bg-gray-200 text-gray-800 rounded-lg text-sm font-medium">Terrasse</span>}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Description */}
      {criteria.description && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-xl font-bold text-gray-900 flex items-center">
              <div className="p-2 bg-amber-100 rounded-lg mr-3">
                <FileText className="h-5 w-5 text-amber-600" />
              </div>
              Description / Besoins spécifiques
            </h2>
          </div>
          <div className="p-6">
            <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{criteria.description}</p>
          </div>
        </div>
      )}

      {/* Activities Timeline */}
      {deal.activities && deal.activities.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-xl font-bold text-gray-900 flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg mr-3">
                <Activity className="h-5 w-5 text-purple-600" />
              </div>
              Chronologie des suivis
              {deal.activities.length > 0 && (
                <span className="ml-2 px-2.5 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-semibold">
                  {deal.activities.length}
                </span>
              )}
            </h2>
          </div>
          <div className="p-6">
            <ActivityTimeline activities={deal.activities} tenantId={tenantId} />
          </div>
        </div>
      )}

      {/* Property Matching */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-xl font-bold text-gray-900 flex items-center">
            <div className="p-2 bg-teal-100 rounded-lg mr-3">
              <Briefcase className="h-5 w-5 text-teal-600" />
            </div>
            Correspondance de propriétés
          </h2>
        </div>
        <div className="p-6">
          <PropertyMatching tenantId={tenantId} dealId={dealId} />
        </div>
      </div>

      {/* Appointment Form Modal */}
      {showAppointmentForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">Nouveau rendez-vous</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAppointmentForm(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <AppointmentForm
                tenantId={tenantId}
                dealId={dealId}
                contactId={deal?.contact?.id}
                onSubmit={handleCreateAppointment}
                onCancel={() => setShowAppointmentForm(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

