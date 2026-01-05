import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Calendar, Clock, Briefcase, MapPin, FileText, Loader2, Users, Target, CheckCircle } from 'lucide-react';
import { PropertyVisitType, PropertyVisitGoal } from '../../types/property-types';
import { scheduleVisit, PropertyVisit } from '../../services/property-service';
import { listDeals } from '../../services/crm-service';
import { Deal } from '../../types/crm-types';
import { listMembers, Member } from '../../services/membership-service';
import { ContactSearchableSelect } from './ContactSearchableSelect';
import { getDealTypeLabel } from '../../utils/crm-utils';

interface PropertyVisitSchedulerProps {
  propertyId: string;
  tenantId: string;
  onVisitScheduled?: () => void;
  initialContactId?: string;
  initialDealId?: string;
}

export const PropertyVisitScheduler: React.FC<PropertyVisitSchedulerProps> = ({
  propertyId,
  tenantId,
  onVisitScheduled,
  initialContactId,
  initialDealId,
}) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingDeals, setLoadingDeals] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const [formData, setFormData] = useState({
    contactId: initialContactId || '',
    dealId: initialDealId || '',
    goal: '' as PropertyVisitGoal | '',
    scheduledAt: '',
    scheduledTime: '',
    duration: '60',
    location: '',
    assignedToUserId: '',
    collaboratorIds: [] as string[],
    notes: '',
  });

  useEffect(() => {
    loadMembers();
    if (initialContactId) {
      loadDeals(initialContactId);
    }
  }, [initialContactId]);

  const loadDeals = async (contactId: string) => {
    if (!contactId) return;
    setLoadingDeals(true);
    try {
      const response = await listDeals(tenantId, { page: 1, limit: 100, contactId });
      if (response.success) {
        setDeals(response.deals || []);
      }
    } catch (error) {
      console.error('Error loading deals:', error);
    } finally {
      setLoadingDeals(false);
    }
  };

  const loadMembers = async () => {
    setLoadingMembers(true);
    try {
      const response = await listMembers(tenantId, { page: 1, limit: 500, status: 'ACTIVE' });
      if (response.success) {
        setMembers(response.data.members || []);
      }
    } catch (error) {
      console.error('Error loading members:', error);
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleContactChange = (contactId: string) => {
    setFormData((prev) => ({ ...prev, contactId, dealId: '' }));
    if (contactId) {
      loadDeals(contactId);
    } else {
      setDeals([]);
    }
  };

  const goalOptions = [
    { value: PropertyVisitGoal.CONTACT_TAKING, label: 'Prise de contact' },
    { value: PropertyVisitGoal.NETWORKING, label: 'Mise en relation' },
    { value: PropertyVisitGoal.EVALUATION, label: 'Évaluation' },
    { value: PropertyVisitGoal.CONTRACT_SIGNING, label: 'Signature du contrat' },
    { value: PropertyVisitGoal.FOLLOW_UP, label: 'Suivi' },
    { value: PropertyVisitGoal.NEGOTIATION, label: 'Négociation' },
    { value: PropertyVisitGoal.OTHER, label: 'Autre' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Combine date and time
      const scheduledDateTime = new Date(`${formData.scheduledAt}T${formData.scheduledTime}`);

      if (scheduledDateTime <= new Date()) {
        alert('La date et l\'heure doivent être dans le futur');
        setLoading(false);
        return;
      }

      await scheduleVisit(tenantId, propertyId, {
        contactId: formData.contactId || undefined,
        dealId: formData.dealId || undefined,
        visitType: PropertyVisitType.VISIT, // Keep for backward compatibility
        goal: formData.goal || undefined,
        scheduledAt: scheduledDateTime.toISOString(),
        duration: formData.duration ? parseInt(formData.duration, 10) : undefined,
        location: formData.location || undefined,
        assignedToUserId: formData.assignedToUserId || undefined,
        collaboratorIds: formData.collaboratorIds.length > 0 ? formData.collaboratorIds : undefined,
        notes: formData.notes || undefined,
      });

      // Show success message
      setSuccessMessage('Visite planifiée avec succès !');

      // Reset form
      setFormData({
        contactId: '',
        dealId: '',
        goal: '',
        scheduledAt: '',
        scheduledTime: '',
        duration: '60',
        location: '',
        assignedToUserId: '',
        collaboratorIds: [],
        notes: '',
      });

      if (onVisitScheduled) {
        onVisitScheduled();
      }

      // Redirect to calendar after 1.5 seconds
      setTimeout(() => {
        navigate(`/tenant/${tenantId}/properties/visits/calendar`);
      }, 1500);
    } catch (error: any) {
      console.error('Error scheduling visit:', error);
      alert(error.response?.data?.error || 'Erreur lors de la planification de la visite');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Planifier une visite</h3>

        {/* Success Message */}
        {successMessage && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
            <p className="text-sm font-medium text-green-800">{successMessage}</p>
            <p className="text-xs text-green-600 ml-auto">Redirection en cours...</p>
          </div>
        )}

        <div className="space-y-4">
          {/* Contact */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contact (optionnel)
            </label>
            <ContactSearchableSelect
              tenantId={tenantId}
              value={formData.contactId}
              onChange={handleContactChange}
              placeholder="Rechercher un contact..."
            />
          </div>

          {/* Deal */}
          {formData.contactId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Briefcase className="h-4 w-4 inline mr-1" />
                Affaire (optionnel)
              </label>
              <select
                value={formData.dealId}
                onChange={(e) => setFormData((prev) => ({ ...prev, dealId: e.target.value }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2"
                disabled={loadingDeals}
              >
                <option value="">Aucune affaire</option>
                {deals.map((deal) => (
                  <option key={deal.id} value={deal.id}>
                    {getDealTypeLabel(deal.type)} - {deal.stage}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Goal */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Target className="h-4 w-4 inline mr-1" />
              Objectif (optionnel)
            </label>
            <select
              value={formData.goal}
              onChange={(e) => setFormData((prev) => ({ ...prev, goal: e.target.value as PropertyVisitGoal | '' }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            >
              <option value="">Sélectionner un objectif</option>
              {goalOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Calendar className="h-4 w-4 inline mr-1" />
                Date
              </label>
              <Input
                type="date"
                value={formData.scheduledAt}
                onChange={(e) => setFormData((prev) => ({ ...prev, scheduledAt: e.target.value }))}
                required
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Clock className="h-4 w-4 inline mr-1" />
                Heure
              </label>
              <Input
                type="time"
                value={formData.scheduledTime}
                onChange={(e) => setFormData((prev) => ({ ...prev, scheduledTime: e.target.value }))}
                required
              />
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Durée (minutes)
            </label>
            <Input
              type="number"
              value={formData.duration}
              onChange={(e) => setFormData((prev) => ({ ...prev, duration: e.target.value }))}
              min="15"
              step="15"
            />
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <MapPin className="h-4 w-4 inline mr-1" />
              Lieu (optionnel)
            </label>
            <Input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData((prev) => ({ ...prev, location: e.target.value }))}
              placeholder="Adresse de la propriété par défaut"
            />
          </div>

          {/* Collaborators */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Users className="h-4 w-4 inline mr-1" />
              Collaborateurs (optionnel)
            </label>
            {loadingMembers ? (
              <div className="flex h-32 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm items-center text-gray-500">
                Chargement des collaborateurs...
              </div>
            ) : members.length === 0 ? (
              <div className="text-sm text-gray-500 py-4">
                Aucun collaborateur disponible
              </div>
            ) : (
              <div className="border border-gray-300 rounded-md bg-white p-3 max-h-60 overflow-y-auto">
                <div className="space-y-2">
                  {members.map((member) => {
                    const isChecked = formData.collaboratorIds.includes(member.user.id);
                    return (
                      <label
                        key={member.user.id}
                        className="flex items-center space-x-3 p-2 rounded hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormData((prev) => ({
                                ...prev,
                                collaboratorIds: [...prev.collaboratorIds, member.user.id],
                              }));
                            } else {
                              setFormData((prev) => ({
                                ...prev,
                                collaboratorIds: prev.collaboratorIds.filter(
                                  (id) => id !== member.user.id
                                ),
                              }));
                            }
                          }}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900">
                            {member.user.fullName || member.user.email}
                          </div>
                          {member.user.fullName && (
                            <div className="text-xs text-gray-500">{member.user.email}</div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            {formData.collaboratorIds.length > 0 && (
              <p className="mt-2 text-xs text-gray-600">
                {formData.collaboratorIds.length} collaborateur{formData.collaboratorIds.length > 1 ? 's' : ''} sélectionné{formData.collaboratorIds.length > 1 ? 's' : ''}
              </p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <FileText className="h-4 w-4 inline mr-1" />
              Notes (optionnel)
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
              rows={3}
              placeholder="Notes supplémentaires sur la visite..."
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end pt-4">
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Planification...
                </>
              ) : (
                <>
                  <Calendar className="h-4 w-4 mr-2" />
                  Planifier la visite
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
};

