import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import { getDeal, updateDeal, CrmDeal, CrmDealDetail, UpdateCrmDealRequest, listAppointments, CrmAppointment, AppointmentFilters } from '../../services/crm-service';
import { ActivityTimeline } from './ActivityTimeline';
import { PropertyMatching } from '../properties/PropertyMatching';
import { Briefcase, User, Calendar, MapPin, DollarSign, Activity, Mail, Phone, Home, Tag, FileText, TrendingUp, Clock, CheckCircle, XCircle, Plus, Users } from 'lucide-react';

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
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-gray-900">
                {deal.type === 'ACHAT' ? 'Achat' : 'Location'}
              </h1>
              {getStageBadge(deal.stage)}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              {/* Contact Information */}
              {deal.contact && (
                <div className="space-y-2">
                  <div className="flex items-center text-gray-600">
                    <User className="h-4 w-4 mr-2" />
                    <span className="font-medium">{deal.contact.firstName} {deal.contact.lastName}</span>
                  </div>
                  {deal.contact.email && (
                    <div className="flex items-center text-gray-600 ml-6">
                      <Mail className="h-3 w-3 mr-2" />
                      {deal.contact.email}
                    </div>
                  )}
                  {deal.contact.phone && (
                    <div className="flex items-center text-gray-600 ml-6">
                      <Phone className="h-3 w-3 mr-2" />
                      {deal.contact.phone}
                    </div>
                  )}
                </div>
              )}
              
              {/* Location */}
              {deal.locationZone && (
                <div className="flex items-center text-gray-600">
                  <MapPin className="h-4 w-4 mr-2" />
                  {deal.locationZone}
                </div>
              )}
              
              {/* Budget */}
              {(deal.budgetMin || deal.budgetMax) && (
                <div className="flex items-center text-gray-600">
                  <DollarSign className="h-4 w-4 mr-2" />
                  {deal.budgetMin && deal.budgetMax
                    ? `${formatNumber(deal.budgetMin)} - ${formatNumber(deal.budgetMax)} FCFA`
                    : deal.budgetMax
                    ? `Jusqu'à ${formatNumber(deal.budgetMax)} FCFA`
                    : `À partir de ${formatNumber(deal.budgetMin)} FCFA`}
                </div>
              )}
              
              {/* Dates */}
              <div className="space-y-1">
                {deal.createdAt && (
                  <div className="flex items-center text-gray-600">
                    <Calendar className="h-4 w-4 mr-2" />
                    Créé le : {new Date(deal.createdAt).toLocaleDateString('fr-FR')}
                  </div>
                )}
                {deal.updatedAt && (
                  <div className="flex items-center text-gray-500 text-sm ml-6">
                    Modifié le : {new Date(deal.updatedAt).toLocaleDateString('fr-FR')}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <select
              value={deal.stage}
              onChange={(e) => handleStageChange(e.target.value)}
              disabled={updatingStage}
              className="px-3 py-2 border rounded-md"
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

      {/* Appointments */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold flex items-center">
            <Calendar className="h-5 w-5 mr-2" />
            Rendez-vous {appointments.length > 0 && `(${appointments.length})`}
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/tenant/${tenantId}/crm/appointments?dealId=${dealId}`)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Nouveau rendez-vous
          </Button>
        </div>
        {appointmentsLoading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
            <p className="mt-2 text-gray-600 text-sm">Chargement des rendez-vous...</p>
          </div>
        ) : appointments.length > 0 ? (
          <div className="space-y-3">
            {appointments.map((appointment) => (
              <div
                key={appointment.id}
                className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 border border-gray-200"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-medium text-gray-900">{appointment.appointmentType}</span>
                      {getAppointmentStatusBadge(appointment.status)}
                    </div>
                    <div className="space-y-1 text-sm text-gray-600">
                      <div className="flex items-center">
                        <Calendar className="h-4 w-4 mr-2" />
                        {new Date(appointment.startAt).toLocaleDateString('fr-FR', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </div>
                      <div className="flex items-center">
                        <Clock className="h-4 w-4 mr-2" />
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
                          <Tag className="h-4 w-4 mr-2" />
                          {appointment.location}
                        </div>
                      )}
                      {appointment.contact && (
                        <div className="flex items-center">
                          <User className="h-4 w-4 mr-2" />
                          {appointment.contact.firstName} {appointment.contact.lastName}
                        </div>
                      )}
                      {appointment.collaborators && appointment.collaborators.length > 0 && (
                        <div className="flex items-center flex-wrap gap-1 mt-1">
                          <Users className="h-4 w-4 mr-1" />
                          <span className="text-xs text-gray-500">Collaborateurs:</span>
                          {appointment.collaborators.map((collab, idx) => (
                            <span key={collab.id} className="text-xs text-gray-600">
                              {collab.user.fullName || collab.user.email}
                              {idx < appointment.collaborators!.length - 1 && ', '}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/tenant/${tenantId}/crm/appointments?dealId=${dealId}`)}
                  >
                    Voir détails
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Aucun rendez-vous planifié</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => navigate(`/tenant/${tenantId}/crm/appointments?dealId=${dealId}`)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Créer un rendez-vous
            </Button>
          </div>
        )}
      </div>

      {/* Type de bien et critères */}
      {(criteria.propertyType || deal.expectedValue) && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center">
            <Home className="h-5 w-5 mr-2" />
            Type de bien et critères
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Type de bien */}
            {criteria.propertyType && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type de bien recherché</label>
                <div className="flex items-center text-gray-900">
                  <Tag className="h-4 w-4 mr-2" />
                  {getPropertyTypeLabel(criteria.propertyType)}
                </div>
              </div>
            )}
            
            {/* Valeur estimée */}
            {deal.expectedValue && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valeur estimée de la transaction</label>
                <div className="flex items-center text-gray-900">
                  <TrendingUp className="h-4 w-4 mr-2" />
                  {formatNumber(deal.expectedValue)} FCFA
                </div>
              </div>
            )}
          </div>

          {/* Critères spécifiques */}
          {(criteria.rooms || criteria.surface || criteria.furnishingStatus || criteria.landArea || 
            criteria.hasGarden || criteria.hasPool || criteria.hasGarage || criteria.hasParking || 
            criteria.hasElevator || criteria.hasBalcony || criteria.floor || criteria.officeCount ||
            criteria.commercialType || criteria.hasStorefront || criteria.hasReception || criteria.hasTerrace) && (
            <div className="mt-6 pt-6 border-t">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Critères spécifiques</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {criteria.rooms && (
                  <div>
                    <span className="text-sm text-gray-600">Nombre de pièces:</span>
                    <span className="ml-2 font-medium">{criteria.rooms}</span>
                  </div>
                )}
                {criteria.surface && (
                  <div>
                    <span className="text-sm text-gray-600">Surface:</span>
                    <span className="ml-2 font-medium">{criteria.surface} m²</span>
                  </div>
                )}
                {criteria.landArea && (
                  <div>
                    <span className="text-sm text-gray-600">Surface du terrain:</span>
                    <span className="ml-2 font-medium">{criteria.landArea} m²</span>
                  </div>
                )}
                {criteria.furnishingStatus && (
                  <div>
                    <span className="text-sm text-gray-600">État du meublé:</span>
                    <span className="ml-2 font-medium">
                      {criteria.furnishingStatus === 'MEUBLE' ? 'Meublé' :
                       criteria.furnishingStatus === 'SEMI_MEUBLE' ? 'Semi-meublé' :
                       criteria.furnishingStatus === 'NON_MEUBLE' ? 'Non meublé' : criteria.furnishingStatus}
                    </span>
                  </div>
                )}
                {criteria.floor && (
                  <div>
                    <span className="text-sm text-gray-600">Étage:</span>
                    <span className="ml-2 font-medium">{criteria.floor}</span>
                  </div>
                )}
                {criteria.officeCount && (
                  <div>
                    <span className="text-sm text-gray-600">Nombre de bureaux:</span>
                    <span className="ml-2 font-medium">{criteria.officeCount}</span>
                  </div>
                )}
                {criteria.commercialType && (
                  <div>
                    <span className="text-sm text-gray-600">Type de commerce:</span>
                    <span className="ml-2 font-medium">{criteria.commercialType}</span>
                  </div>
                )}
                {(criteria.hasGarden || criteria.hasPool || criteria.hasGarage || criteria.hasParking ||
                  criteria.hasElevator || criteria.hasBalcony || criteria.hasStorefront || 
                  criteria.hasReception || criteria.hasTerrace) && (
                  <div className="md:col-span-2 lg:col-span-3">
                    <span className="text-sm text-gray-600 block mb-2">Équipements:</span>
                    <div className="flex flex-wrap gap-2">
                      {criteria.hasGarden && <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">Jardin</span>}
                      {criteria.hasPool && <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">Piscine</span>}
                      {criteria.hasGarage && <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-sm">Garage</span>}
                      {criteria.hasParking && <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-sm">Parking</span>}
                      {criteria.hasElevator && <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-sm">Ascenseur</span>}
                      {criteria.hasBalcony && <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-sm">Balcon</span>}
                      {criteria.hasStorefront && <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-sm">Vitrine</span>}
                      {criteria.hasReception && <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-sm">Réception</span>}
                      {criteria.hasTerrace && <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-sm">Terrasse</span>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Description */}
      {criteria.description && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center">
            <FileText className="h-5 w-5 mr-2" />
            Description / Besoins spécifiques
          </h2>
          <p className="text-gray-700 whitespace-pre-wrap">{criteria.description}</p>
        </div>
      )}

      {/* Activities Timeline */}
      {deal.activities && deal.activities.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center">
            <Activity className="h-5 w-5 mr-2" />
            Chronologie des activités ({deal.activities.length})
          </h2>
          <ActivityTimeline activities={deal.activities} tenantId={tenantId} />
        </div>
      )}

      {/* Property Matching */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center">
          <Briefcase className="h-5 w-5 mr-2" />
          Correspondance de propriétés
        </h2>
        <PropertyMatching tenantId={tenantId} dealId={dealId} />
      </div>
    </div>
  );
};

