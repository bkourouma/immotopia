import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import { getContact, convertContact, createDeal, CrmContact, CrmContactDetail, listAppointments, CrmAppointment, AppointmentFilters, CreateCrmDealRequest } from '../../services/crm-service';
import { ActivityTimeline } from './ActivityTimeline';
import { ConvertContactDialog } from './ConvertContactDialog';
import { TagManager } from './TagManager';
import { AddDealDialog } from './AddDealDialog';
import { User, Mail, Phone, Calendar, Tag, Briefcase, Activity, Clock, CheckCircle, XCircle, Plus, MapPin, Building, FileText, Info, DollarSign, TrendingUp, Award } from 'lucide-react';

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
  const [showAddDealDialog, setShowAddDealDialog] = useState(false);
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

  const handleCreateDeal = async (data: CreateCrmDealRequest) => {
    try {
      await createDeal(tenantId, data);
      setShowAddDealDialog(false);
      await loadContact();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erreur lors de la création de l\'affaire');
      throw err;
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
    <div className="space-y-6 pb-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-gray-900">
                  {displayName}
                </h1>
                {getStatusBadge(contact.status)}
              </div>
            </div>
            <div className="flex gap-2 ml-4">
              {contact.status === 'LEAD' && (
                <Button onClick={() => setShowConvertDialog(true)} className="bg-green-600 hover:bg-green-700 text-white">
                  Convertir
                </Button>
              )}
              <Button variant="outline" onClick={() => navigate(`/tenant/${tenantId}/crm/contacts/${contactId}/edit`)}>
                Modifier
              </Button>
            </div>
          </div>
        </div>
        
        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Contact Quick Info */}
            <div className="space-y-4">
              {contact.email && (
                <div className="flex items-center text-gray-700">
                  <div className="p-2 bg-blue-100 rounded-lg mr-3">
                    <Mail className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">Email</div>
                    <a href={`mailto:${contact.email}`} className="text-base font-semibold text-gray-900 hover:text-blue-600 transition-colors">
                      {contact.email}
                    </a>
                  </div>
                </div>
              )}
              {(contact.phonePrimary || contact.phone) && (
                <div className="flex items-center text-gray-700">
                  <div className="p-2 bg-green-100 rounded-lg mr-3">
                    <Phone className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">Téléphone</div>
                    <a href={`tel:${contact.phonePrimary || contact.phone}`} className="text-base font-semibold text-gray-900 hover:text-green-600 transition-colors">
                      {contact.phonePrimary || contact.phone}
                    </a>
                  </div>
                </div>
              )}
            </div>
            
            {/* Additional Info */}
            <div className="space-y-4">
              {contact.source && (
                <div className="flex items-center text-gray-700">
                  <div className="p-2 bg-purple-100 rounded-lg mr-3">
                    <Tag className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">Source</div>
                    <div className="text-base font-semibold text-gray-900">{contact.source}</div>
                  </div>
                </div>
              )}
              {contact.lastInteractionAt && (
                <div className="flex items-center text-gray-700">
                  <div className="p-2 bg-amber-100 rounded-lg mr-3">
                    <Clock className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">Dernière interaction</div>
                    <div className="text-base font-semibold text-gray-900">
                      {new Date(contact.lastInteractionAt).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric'
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Dates */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="flex items-center gap-6 text-sm text-gray-600">
              <div className="flex items-center">
                <Calendar className="h-4 w-4 mr-2 text-gray-400" />
                <span className="font-medium">Créé le</span>
                <span className="ml-2">{new Date(contact.createdAt).toLocaleDateString('fr-FR', { 
                  day: 'numeric', 
                  month: 'long', 
                  year: 'numeric' 
                })}</span>
              </div>
              <div className="flex items-center">
                <Calendar className="h-4 w-4 mr-2 text-gray-400" />
                <span className="font-medium">Modifié le</span>
                <span className="ml-2">{new Date(contact.updatedAt).toLocaleDateString('fr-FR', { 
                  day: 'numeric', 
                  month: 'long', 
                  year: 'numeric' 
                })}</span>
              </div>
            </div>
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

      {/* Information Sections - Full Width */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Identification Information */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-base font-semibold mb-3 flex items-center">
            <User className="h-4 w-4 mr-2" />
            Identification
          </h2>
          <dl className="space-y-2 text-sm">
            {contact.civility && (
              <div>
                <dt className="text-gray-500">Civilité</dt>
                <dd className="font-medium">
                  {contact.civility === 'MR' ? 'Monsieur' :
                   contact.civility === 'MRS' ? 'Madame' :
                   contact.civility === 'MS' ? 'Mademoiselle' :
                   contact.civility === 'DR' ? 'Docteur' :
                   contact.civility === 'PROF' ? 'Professeur' : contact.civility}
                </dd>
              </div>
            )}
            {contact.dateOfBirth && (
              <div>
                <dt className="text-gray-500">Date de naissance</dt>
                <dd className="font-medium">{new Date(contact.dateOfBirth).toLocaleDateString('fr-FR')}</dd>
              </div>
            )}
            {contact.nationality && (
              <div>
                <dt className="text-gray-500">Nationalité</dt>
                <dd className="font-medium">{contact.nationality}</dd>
              </div>
            )}
            {contact.identityDocumentType && (
              <div>
                <dt className="text-gray-500">Pièce d'identité</dt>
                <dd className="font-medium">
                  {contact.identityDocumentType === 'CNI' ? 'CNI' :
                   contact.identityDocumentType === 'PASSPORT' ? 'Passeport' :
                   contact.identityDocumentType === 'DRIVING_LICENSE' ? 'Permis de conduire' :
                   'Autre'} {contact.identityDocumentNumber && `: ${contact.identityDocumentNumber}`}
                </dd>
                {contact.identityDocumentExpiry && (
                  <dd className="text-xs text-gray-500 mt-1">
                    Expire le {new Date(contact.identityDocumentExpiry).toLocaleDateString('fr-FR')}
                  </dd>
                )}
              </div>
            )}
            {contact.profilePhotoUrl && (
              <div>
                <dt className="text-gray-500 mb-2">Photo</dt>
                <dd>
                  <img
                    src={contact.profilePhotoUrl}
                    alt="Profile"
                    className="h-20 w-20 rounded-full object-cover border-2 border-gray-300"
                  />
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Contact Information */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h2 className="text-base font-bold text-gray-900 flex items-center">
              <div className="p-1.5 bg-green-100 rounded-lg mr-2">
                <Mail className="h-4 w-4 text-green-600" />
              </div>
              Contact
            </h2>
          </div>
          <div className="p-4">
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-gray-500">Email personnel</dt>
              <dd className="font-medium">{contact.email || '-'}</dd>
            </div>
            {contact.emailSecondary && (
              <div>
                <dt className="text-gray-500">Email professionnel</dt>
                <dd className="font-medium">{contact.emailSecondary}</dd>
              </div>
            )}
            {contact.phonePrimary && (
              <div>
                <dt className="text-gray-500">Téléphone principal</dt>
                <dd className="font-medium flex items-center">
                  <Phone className="h-3 w-3 mr-1" />
                  {contact.phonePrimary}
                  {contact.whatsappNumber === contact.phonePrimary && (
                    <span className="ml-2 text-xs bg-green-100 text-green-800 px-1.5 py-0.5 rounded">WhatsApp</span>
                  )}
                </dd>
              </div>
            )}
            {contact.phoneSecondary && contact.phoneSecondary !== contact.phonePrimary && (
              <div>
                <dt className="text-gray-500">Téléphone secondaire</dt>
                <dd className="font-medium flex items-center">
                  <Phone className="h-3 w-3 mr-1" />
                  {contact.phoneSecondary}
                  {contact.whatsappNumber === contact.phoneSecondary && (
                    <span className="ml-2 text-xs bg-green-100 text-green-800 px-1.5 py-0.5 rounded">WhatsApp</span>
                  )}
                </dd>
              </div>
            )}
            {contact.address && (
              <div>
                <dt className="text-gray-500">Adresse</dt>
                <dd className="font-medium">{contact.address}</dd>
              </div>
            )}
            {contact.locationZone && (
              <div>
                <dt className="text-gray-500">Zone</dt>
                <dd className="font-medium flex items-center">
                  <MapPin className="h-3 w-3 mr-1" />
                  {contact.locationZone}
                </dd>
              </div>
            )}
            {contact.preferredLanguage && (
              <div>
                <dt className="text-gray-500">Langue préférée</dt>
                <dd className="font-medium">{contact.preferredLanguage}</dd>
              </div>
            )}
            {contact.preferredContactChannel && (
              <div>
                <dt className="text-gray-500">Canal préféré</dt>
                <dd className="font-medium">
                  {contact.preferredContactChannel === 'CALL' ? 'Appel' :
                   contact.preferredContactChannel === 'WHATSAPP' ? 'WhatsApp' :
                   contact.preferredContactChannel === 'EMAIL' ? 'Email' :
                   contact.preferredContactChannel === 'SMS' ? 'SMS' : contact.preferredContactChannel}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Professional Information */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h2 className="text-base font-bold text-gray-900 flex items-center">
              <div className="p-1.5 bg-purple-100 rounded-lg mr-2">
                <Briefcase className="h-4 w-4 text-purple-600" />
              </div>
              Professionnel
            </h2>
          </div>
          <div className="p-4">
          <dl className="space-y-2 text-sm">
            {contact.profession && (
              <div>
                <dt className="text-gray-500">Profession</dt>
                <dd className="font-medium">{contact.profession}</dd>
              </div>
            )}
            {contact.sectorOfActivity && (
              <div>
                <dt className="text-gray-500">Secteur d'activité</dt>
                <dd className="font-medium">{contact.sectorOfActivity.replace(/_/g, ' ')}</dd>
              </div>
            )}
            {contact.employer && (
              <div>
                <dt className="text-gray-500">Employeur</dt>
                <dd className="font-medium">{contact.employer}</dd>
              </div>
            )}
            {(contact.incomeMin || contact.incomeMax) && (
              <div>
                <dt className="text-gray-500">Revenus</dt>
                <dd className="font-medium">
                  {contact.incomeMin && contact.incomeMax
                    ? `${contact.incomeMin.toLocaleString('fr-FR')} - ${contact.incomeMax.toLocaleString('fr-FR')} FCFA`
                    : contact.incomeMin
                    ? `Min: ${contact.incomeMin.toLocaleString('fr-FR')} FCFA`
                    : `Max: ${contact.incomeMax?.toLocaleString('fr-FR')} FCFA`}
                </dd>
              </div>
            )}
            {contact.salaire && (
              <div>
                <dt className="text-gray-500">Salaire</dt>
                <dd className="font-medium">{contact.salaire.toLocaleString('fr-FR')} FCFA</dd>
              </div>
            )}
            {contact.jobStability && (
              <div>
                <dt className="text-gray-500">Stabilité</dt>
                <dd className="font-medium">
                  {contact.jobStability === 'CDI' ? 'CDI' :
                   contact.jobStability === 'CDD' ? 'CDD' :
                   contact.jobStability === 'FREELANCE' ? 'Freelance' :
                   contact.jobStability === 'INFORMAL' ? 'Informel' :
                   contact.jobStability === 'RETIRED' ? 'Retraité' :
                   contact.jobStability === 'STUDENT' ? 'Étudiant' :
                   contact.jobStability === 'UNEMPLOYED' ? 'Sans emploi' :
                   contact.jobStability}
                </dd>
              </div>
            )}
            {contact.borrowingCapacity && (
              <div>
                <dt className="text-gray-500">Capacité d'emprunt</dt>
                <dd className="font-medium">
                  {contact.borrowingCapacity === 'YES' ? 'Oui' :
                   contact.borrowingCapacity === 'NO' ? 'Non' :
                   'Inconnu'}
                </dd>
              </div>
            )}
          </dl>
          </div>
        </div>
      </div>

      {/* CRM Information Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CRM & Scoring */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h2 className="text-base font-bold text-gray-900 flex items-center">
              <div className="p-1.5 bg-amber-100 rounded-lg mr-2">
                <TrendingUp className="h-4 w-4 text-amber-600" />
              </div>
              CRM & Scoring
            </h2>
          </div>
          <div className="p-4">
          <dl className="space-y-2 text-sm">
            {contact.leadSource && (
              <div>
                <dt className="text-gray-500">Source du lead</dt>
                <dd className="font-medium">
                  {contact.leadSource === 'WEBSITE' ? 'Site web' :
                   contact.leadSource === 'SOCIAL_MEDIA' ? 'Réseaux sociaux' :
                   contact.leadSource === 'REFERRAL' ? 'Parrainage' :
                   contact.leadSource === 'CAMPAIGN' ? 'Campagne' :
                   contact.leadSource === 'AGENCY' ? 'Agence' :
                   contact.leadSource === 'WALK_IN' ? 'Visite spontanée' :
                   contact.leadSource === 'PHONE_CALL' ? 'Appel téléphonique' :
                   'Autre'}
                </dd>
              </div>
            )}
            {contact.maturityLevel && (
              <div>
                <dt className="text-gray-500">Niveau de maturité</dt>
                <dd className="font-medium">
                  {contact.maturityLevel === 'COLD' ? 'Froid' :
                   contact.maturityLevel === 'WARM' ? 'Tiède' :
                   contact.maturityLevel === 'HOT' ? 'Chaud' : contact.maturityLevel}
                </dd>
              </div>
            )}
            {contact.score !== undefined && (
              <div>
                <dt className="text-gray-500">Score</dt>
                <dd className="font-medium">{contact.score}/100</dd>
              </div>
            )}
            {contact.priorityLevel && (
              <div>
                <dt className="text-gray-500">Priorité</dt>
                <dd className="font-medium">
                  {contact.priorityLevel === 'LOW' ? 'Basse' :
                   contact.priorityLevel === 'NORMAL' ? 'Normale' :
                   contact.priorityLevel === 'HIGH' ? 'Haute' : contact.priorityLevel}
                </dd>
              </div>
            )}
            {contact.source && (
              <div>
                <dt className="text-gray-500">Source (legacy)</dt>
                <dd className="font-medium">{contact.source}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Consents & Notes */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h2 className="text-base font-bold text-gray-900 flex items-center">
              <div className="p-1.5 bg-teal-100 rounded-lg mr-2">
                <FileText className="h-4 w-4 text-teal-600" />
              </div>
              Consentements & Notes
            </h2>
          </div>
          <div className="p-4">
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-gray-500">Consentements</dt>
              <dd className="space-y-1 mt-1">
                {contact.consentMarketing && (
                  <div className="flex items-center text-green-600">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    <span>Marketing</span>
                  </div>
                )}
                {contact.consentWhatsapp && (
                  <div className="flex items-center text-green-600">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    <span>WhatsApp</span>
                  </div>
                )}
                {contact.consentEmail && (
                  <div className="flex items-center text-green-600">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    <span>Email</span>
                  </div>
                )}
                {!contact.consentMarketing && !contact.consentWhatsapp && !contact.consentEmail && (
                  <span className="text-gray-500">Aucun consentement</span>
                )}
              </dd>
            </div>
            {contact.consentSource && (
              <div>
                <dt className="text-gray-500">Source du consentement</dt>
                <dd className="font-medium">{contact.consentSource}</dd>
              </div>
            )}
            {contact.internalNotes && (
              <div>
                <dt className="text-gray-500">Notes internes</dt>
                <dd className="font-medium whitespace-pre-wrap">{contact.internalNotes}</dd>
              </div>
            )}
          </dl>
          </div>
        </div>
      </div>

      {/* Grid Layout - 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Roles & Tags - Column 1 */}
        <div className="space-y-6">
          {/* Roles */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h2 className="text-base font-bold text-gray-900 flex items-center">
                <div className="p-1.5 bg-indigo-100 rounded-lg mr-2">
                  <User className="h-4 w-4 text-indigo-600" />
                </div>
                Rôles
              </h2>
            </div>
            <div className="p-4">
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
          </div>

          {/* Tags */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <div className="flex justify-between items-center">
                <h2 className="text-base font-bold text-gray-900 flex items-center">
                  <div className="p-1.5 bg-pink-100 rounded-lg mr-2">
                    <Tag className="h-4 w-4 text-pink-600" />
                  </div>
                  Groupes {contact.tags && contact.tags.length > 0 && (
                    <span className="ml-2 px-2 py-1 bg-pink-100 text-pink-700 rounded-full text-xs font-semibold">
                      {contact.tags.length}
                    </span>
                  )}
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
            </div>
            <div className="p-4">
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
        </div>

        {/* Deals - Column 2 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <div className="flex justify-between items-center">
              <h2 className="text-base font-bold text-gray-900 flex items-center">
                <div className="p-1.5 bg-orange-100 rounded-lg mr-2">
                  <Briefcase className="h-4 w-4 text-orange-600" />
                </div>
                Affaires {contact.deals && contact.deals.length > 0 && (
                  <span className="ml-2 px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-semibold">
                    {contact.deals.length}
                  </span>
                )}
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddDealDialog(true)}
              >
                <Plus className="h-3 w-3 mr-1" />
                Ajouter
              </Button>
            </div>
          </div>
          <div className="p-4">
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
            <div className="text-center py-4">
              <Briefcase className="h-8 w-8 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500 text-xs mb-2">Aucune affaire associée</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddDealDialog(true)}
              >
                <Plus className="h-3 w-3 mr-1" />
                Ajouter une affaire
              </Button>
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Appointments - Full Width */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <div className="flex justify-between items-center">
            <h2 className="text-base font-bold text-gray-900 flex items-center">
              <div className="p-1.5 bg-blue-100 rounded-lg mr-2">
                <Calendar className="h-4 w-4 text-blue-600" />
              </div>
              Rendez-vous {appointments.length > 0 && (
                <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
                  {appointments.length}
                </span>
              )}
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
        </div>
        <div className="p-4">
        {appointmentsLoading ? (
          <div className="text-center py-6">
            <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-gray-900"></div>
            <p className="mt-2 text-gray-600 text-xs">Chargement...</p>
          </div>
        ) : appointments.length > 0 ? (
          <div className="space-y-3">
            {appointments.map((appointment) => (
              <div
                key={appointment.id}
                onClick={() => navigate(`/tenant/${tenantId}/crm/appointments?contactId=${contactId}`)}
                className="p-4 bg-gray-50 rounded-xl hover:bg-gray-100 border border-gray-200 hover:border-blue-300 cursor-pointer transition-all"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="font-semibold text-base text-gray-900">{appointment.appointmentType}</span>
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
                    </div>
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
            <p className="text-gray-600 font-medium mb-1">Aucun rendez-vous</p>
            <p className="text-gray-500 text-sm mb-6">Créez votre premier rendez-vous pour ce contact</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/tenant/${tenantId}/crm/appointments?contactId=${contactId}`)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Créer un rendez-vous
            </Button>
          </div>
        )}
      </div>

      {/* Activities Timeline - Full Width */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h2 className="text-base font-bold text-gray-900 flex items-center">
            <div className="p-1.5 bg-purple-100 rounded-lg mr-2">
              <Activity className="h-4 w-4 text-purple-600" />
            </div>
            Chronologie des suivis
            {contact.recentActivities && contact.recentActivities.length > 0 && (
              <span className="ml-2 px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">
                {contact.recentActivities.length}
              </span>
            )}
          </h2>
        </div>
        <div className="p-4">
        {contact.recentActivities && contact.recentActivities.length > 0 ? (
          <ActivityTimeline activities={contact.recentActivities} tenantId={tenantId} contactId={contactId} />
        ) : (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-gray-100 rounded-full mb-3">
              <Activity className="h-6 w-6 text-gray-400" />
            </div>
            <p className="text-gray-500 text-sm">Aucun suivi récent</p>
          </div>
        )}
        </div>
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

      {/* Add Deal Dialog */}
      {showAddDealDialog && contact && (
        <AddDealDialog
          tenantId={tenantId}
          contactId={contactId}
          contactName={displayName}
          onSubmit={handleCreateDeal}
          onCancel={() => setShowAddDealDialog(false)}
        />
      )}
    </div>
  );
};

