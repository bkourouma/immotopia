import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { CreateCrmAppointmentRequest, CrmAppointmentType } from '../../types/crm-types';
import { listContacts, listDeals, getContact, getDeal, CrmContact, CrmDeal } from '../../services/crm-service';
import { listMembers, Member } from '../../services/membership-service';
import { getDealTypeLabel } from '../../utils/crm-utils';
import { Users } from 'lucide-react';

interface AppointmentFormProps {
  tenantId: string;
  contactId?: string;
  dealId?: string;
  onSubmit: (data: CreateCrmAppointmentRequest) => Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
}

export const AppointmentForm: React.FC<AppointmentFormProps> = ({
  tenantId,
  contactId,
  dealId,
  onSubmit,
  onCancel,
  loading = false,
}) => {
  const [formData, setFormData] = useState({
    contactId: contactId || '',
    dealId: dealId || '',
    appointmentType: 'RDV' as CrmAppointmentType,
    date: '',
    startTime: '',
    endTime: '',
    location: '',
    assignedToUserId: '',
    collaboratorIds: [] as string[],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [deals, setDeals] = useState<CrmDeal[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [loadingDeals, setLoadingDeals] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [selectedContact, setSelectedContact] = useState<CrmContact | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<CrmDeal | null>(null);

  // Load pre-selected contact details
  useEffect(() => {
    const loadSelectedContact = async () => {
      if (!tenantId || !contactId) return;

      try {
        const contactResponse = await getContact(tenantId, contactId);
        if (contactResponse.success) {
          setSelectedContact(contactResponse.data);
        }
      } catch (err) {
        console.error('Error loading selected contact:', err);
      }
    };

    loadSelectedContact();
  }, [tenantId, contactId]);

  // Load pre-selected deal details
  useEffect(() => {
    const loadSelectedDeal = async () => {
      if (!tenantId || !dealId) return;

      try {
        const dealResponse = await getDeal(tenantId, dealId);
        if (dealResponse.success) {
          setSelectedDeal(dealResponse.data);
        }
      } catch (err) {
        console.error('Error loading selected deal:', err);
      }
    };

    loadSelectedDeal();
  }, [tenantId, dealId]);

  // Load contacts on mount
  useEffect(() => {
    const loadContacts = async () => {
      if (!tenantId || contactId) return; // Skip if contactId is pre-selected

      setLoadingContacts(true);
      try {
        const contactsResponse = await listContacts(tenantId, { page: 1, limit: 500 });
        if (contactsResponse.success) {
          setContacts(contactsResponse.contacts);
        }
      } catch (err) {
        console.error('Error loading contacts:', err);
      } finally {
        setLoadingContacts(false);
      }
    };

    loadContacts();
  }, [tenantId, contactId]);

  // Load deals - filtered by selected contact (cascade)
  useEffect(() => {
    const loadDeals = async () => {
      if (!tenantId || dealId) return; // Skip if dealId is pre-selected

      setLoadingDeals(true);
      try {
        // Filter deals by contactId if a contact is selected
        const filters: any = { page: 1, limit: 500 };
        const selectedContactId = formData.contactId || contactId;
        if (selectedContactId) {
          filters.contactId = selectedContactId;
        }

        const dealsResponse = await listDeals(tenantId, filters);
        if (dealsResponse.success) {
          setDeals(dealsResponse.deals);
        }
      } catch (err) {
        console.error('Error loading deals:', err);
      } finally {
        setLoadingDeals(false);
      }
    };

    loadDeals();
  }, [tenantId, dealId, formData.contactId, contactId]);

  // Load members (collaborators) on mount
  useEffect(() => {
    const loadMembers = async () => {
      if (!tenantId) return;

      setLoadingMembers(true);
      try {
        const membersResponse = await listMembers(tenantId, { page: 1, limit: 500, status: 'ACTIVE' });
        if (membersResponse.success) {
          setMembers(membersResponse.data.members);
        }
      } catch (err) {
        console.error('Error loading members:', err);
      } finally {
        setLoadingMembers(false);
      }
    };

    loadMembers();
  }, [tenantId]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.contactId && !contactId) {
      newErrors.contactId = 'Le contact est requis';
    }

    if (!formData.date) {
      newErrors.date = 'La date est requise';
    }

    if (!formData.startTime) {
      newErrors.startTime = 'L\'heure de début est requise';
    }

    if (!formData.endTime) {
      newErrors.endTime = 'L\'heure de fin est requise';
    }

    if (formData.date && formData.startTime && formData.endTime) {
      const startDateTime = new Date(`${formData.date}T${formData.startTime}`);
      const endDateTime = new Date(`${formData.date}T${formData.endTime}`);
      if (endDateTime <= startDateTime) {
        newErrors.endTime = 'L\'heure de fin doit être après l\'heure de début';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const finalContactId = formData.contactId || contactId;
      if (!finalContactId) {
        throw new Error('Contact ID is required');
      }

      // Combine date with times to create full datetime
      const startAt = new Date(`${formData.date}T${formData.startTime}`);
      const endAt = new Date(`${formData.date}T${formData.endTime}`);

      const submitData: CreateCrmAppointmentRequest = {
        contactId: finalContactId,
        dealId: formData.dealId || dealId || undefined,
        appointmentType: formData.appointmentType,
        startAt: startAt,
        endAt: endAt,
        location: formData.location.trim() || undefined,
        assignedToUserId: formData.assignedToUserId || undefined,
        collaboratorIds: formData.collaboratorIds.length > 0 ? formData.collaboratorIds : undefined,
      };

      await onSubmit(submitData);
    } catch (error: any) {
      if (error.response?.data?.errors) {
        const apiErrors: Record<string, string> = {};
        error.response.data.errors.forEach((err: { field: string; message: string }) => {
          apiErrors[err.field] = err.message;
        });
        setErrors(apiErrors);
      } else if (error.response?.data?.message) {
        setErrors({ submit: error.response.data.message });
      } else {
        setErrors({ submit: 'Une erreur est survenue lors de l\'enregistrement du rendez-vous' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    // If contact changes, clear deal selection and reload deals for that contact
    if (field === 'contactId') {
      setFormData((prev) => ({ 
        ...prev, 
        [field]: value,
        dealId: '', // Clear deal when contact changes
      }));
      
      // Reload deals for the selected contact
      if (value && !dealId) {
        setLoadingDeals(true);
        listDeals(tenantId, { contactId: value, page: 1, limit: 500 })
          .then((dealsResponse) => {
            if (dealsResponse.success) {
              setDeals(dealsResponse.deals);
            }
          })
          .catch((err) => {
            console.error('Error loading deals:', err);
          })
          .finally(() => {
            setLoadingDeals(false);
          });
      } else if (!value) {
        // If no contact selected, load all deals
        setLoadingDeals(true);
        listDeals(tenantId, { page: 1, limit: 500 })
          .then((dealsResponse) => {
            if (dealsResponse.success) {
              setDeals(dealsResponse.deals);
            }
          })
          .catch((err) => {
            console.error('Error loading deals:', err);
          })
          .finally(() => {
            setLoadingDeals(false);
          });
      }
    } else {
      setFormData((prev) => ({ ...prev, [field]: value }));
    }

    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {errors.submit && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {errors.submit}
        </div>
      )}

      <div>
        <label htmlFor="appointmentType" className="block text-sm font-medium text-gray-700 mb-1">
          Type de rendez-vous <span className="text-red-500">*</span>
        </label>
        <select
          id="appointmentType"
          value={formData.appointmentType}
          onChange={(e) => handleChange('appointmentType', e.target.value)}
          className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
          required
        >
          <option value="RDV">Rendez-vous</option>
          <option value="VISITE">Visite</option>
        </select>
      </div>

      {/* Contact and Deal Selection - Contact Required, Deal Optional */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {!contactId ? (
          <div>
            <label htmlFor="contactId" className="block text-sm font-medium text-gray-700 mb-1">
              Contact <span className="text-red-500">*</span>
            </label>
            {loadingContacts ? (
              <div className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm items-center text-gray-500">
                Chargement...
              </div>
            ) : (
              <select
                id="contactId"
                value={formData.contactId}
                onChange={(e) => handleChange('contactId', e.target.value)}
                className={`flex h-9 w-full rounded-md border ${
                  errors.contactId ? 'border-red-500' : 'border-slate-200'
                } bg-white px-3 py-2 text-sm`}
                required
              >
                <option value="">Sélectionner un contact</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.firstName} {contact.lastName} {contact.email ? `(${contact.email})` : ''}
                  </option>
                ))}
              </select>
            )}
            {errors.contactId && (
              <p className="mt-1 text-xs text-red-600">{errors.contactId}</p>
            )}
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contact <span className="text-red-500">*</span>
            </label>
            <div className="flex h-9 w-full rounded-md border border-slate-200 bg-gray-50 px-3 py-2 text-sm items-center text-gray-600">
              {selectedContact ? (
                <span className="font-medium">
                  {selectedContact.firstName} {selectedContact.lastName}
                  {selectedContact.email && <span className="text-gray-500 ml-2">({selectedContact.email})</span>}
                </span>
              ) : (
                <span className="text-gray-400">Chargement...</span>
              )}
            </div>
          </div>
        )}

        {!dealId ? (
          <div>
            <label htmlFor="dealId" className="block text-sm font-medium text-gray-700 mb-1">
              Affaire <span className="text-gray-400 text-xs">(optionnel)</span>
            </label>
            {loadingDeals ? (
              <div className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm items-center text-gray-500">
                Chargement...
              </div>
            ) : (
              <select
                id="dealId"
                value={formData.dealId}
                onChange={(e) => handleChange('dealId', e.target.value)}
                disabled={!formData.contactId && !contactId}
                className={`flex h-9 w-full rounded-md border ${
                  errors.dealId ? 'border-red-500' : 'border-slate-200'
                } bg-white px-3 py-2 text-sm ${
                  (!formData.contactId && !contactId) ? 'bg-gray-100 cursor-not-allowed' : ''
                }`}
              >
                <option value="">Aucune affaire (optionnel)</option>
                {deals.length === 0 && (formData.contactId || contactId) ? (
                  <option value="" disabled>Aucune affaire pour ce contact</option>
                ) : (
                  deals.map((deal) => {
                    const typeLabel = getDealTypeLabel(deal.type);
                    const stageLabels: Record<string, string> = {
                      'NEW': 'Nouveau',
                      'QUALIFIED': 'Qualifié',
                      'APPOINTMENT': 'Rendez-vous',
                      'VISIT': 'Visite',
                      'NEGOTIATION': 'Négociation',
                      'WON': 'Gagné',
                      'LOST': 'Perdu',
                    };
                    const budget = deal.budgetMax 
                      ? ` - ${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(deal.budgetMax)}`
                      : '';
                    return (
                      <option key={deal.id} value={deal.id}>
                        {typeLabel} - {stageLabels[deal.stage] || deal.stage}{budget}
                      </option>
                    );
                  })
                )}
              </select>
            )}
            {(!formData.contactId && !contactId) && (
              <p className="mt-1 text-xs text-gray-500">Sélectionnez d'abord un contact</p>
            )}
            {errors.dealId && (
              <p className="mt-1 text-xs text-red-600">{errors.dealId}</p>
            )}
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Affaire
            </label>
            <div className="flex h-9 w-full rounded-md border border-slate-200 bg-gray-50 px-3 py-2 text-sm items-center text-gray-600">
              {selectedDeal ? (
                <span className="font-medium">
                  {selectedDeal.type === 'ACHAT' ? 'Achat' : 'Location'} - {
                    (() => {
                      const stageLabels: Record<string, string> = {
                        'NEW': 'Nouveau',
                        'QUALIFIED': 'Qualifié',
                        'APPOINTMENT': 'Rendez-vous',
                        'VISIT': 'Visite',
                        'NEGOTIATION': 'Négociation',
                        'WON': 'Gagné',
                        'LOST': 'Perdu',
                      };
                      return stageLabels[selectedDeal.stage] || selectedDeal.stage;
                    })()
                  }
                  {selectedDeal.budgetMax && (
                    <span className="text-gray-500 ml-2">
                      - {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(selectedDeal.budgetMax)}
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-gray-400">Chargement...</span>
              )}
            </div>
          </div>
        )}
      </div>

      <div>
        <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-1">
          Date <span className="text-red-500">*</span>
        </label>
        <Input
          id="date"
          type="date"
          value={formData.date}
          onChange={(e) => handleChange('date', e.target.value)}
          className={errors.date ? 'border-red-500' : ''}
          required
        />
        {errors.date && (
          <p className="mt-1 text-sm text-red-600">{errors.date}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="startTime" className="block text-sm font-medium text-gray-700 mb-1">
            Heure de début <span className="text-red-500">*</span>
          </label>
          <Input
            id="startTime"
            type="time"
            value={formData.startTime}
            onChange={(e) => handleChange('startTime', e.target.value)}
            className={errors.startTime ? 'border-red-500' : ''}
            required
          />
          {errors.startTime && (
            <p className="mt-1 text-sm text-red-600">{errors.startTime}</p>
          )}
        </div>

        <div>
          <label htmlFor="endTime" className="block text-sm font-medium text-gray-700 mb-1">
            Heure de fin <span className="text-red-500">*</span>
          </label>
          <Input
            id="endTime"
            type="time"
            value={formData.endTime}
            onChange={(e) => handleChange('endTime', e.target.value)}
            className={errors.endTime ? 'border-red-500' : ''}
            required
          />
          {errors.endTime && (
            <p className="mt-1 text-sm text-red-600">{errors.endTime}</p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">
          Lieu
        </label>
        <Input
          id="location"
          type="text"
          value={formData.location}
          onChange={(e) => handleChange('location', e.target.value)}
          placeholder="Adresse ou lieu du rendez-vous"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          <Users className="inline h-4 w-4 mr-1" />
          Collaborateurs <span className="text-gray-400 text-xs">(optionnel)</span>
        </label>
        {loadingMembers ? (
          <div className="flex h-32 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm items-center text-gray-500">
            Chargement des collaborateurs...
          </div>
        ) : members.length === 0 ? (
          <div className="text-sm text-gray-500 py-4">
            Aucun collaborateur disponible
          </div>
        ) : (
          <div className="border border-slate-200 rounded-md bg-white p-3 max-h-60 overflow-y-auto">
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

      <div className="flex justify-end space-x-3 pt-4">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting || loading}>
            Annuler
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting || loading}>
          {isSubmitting || loading ? 'Enregistrement...' : 'Créer le rendez-vous'}
        </Button>
      </div>
    </form>
  );
};

