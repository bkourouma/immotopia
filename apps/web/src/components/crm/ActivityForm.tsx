import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { CreateCrmActivityRequest, CrmActivityType, CrmActivityDirection } from '../../types/crm-types';
import { listContacts, listDeals, getContact, getDeal, CrmContact, CrmDeal } from '../../services/crm-service';
import { getDealTypeLabel } from '../../utils/crm-utils';

interface ActivityFormProps {
  tenantId: string;
  contactId?: string;
  dealId?: string;
  onSubmit: (data: CreateCrmActivityRequest) => Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
}

export const ActivityForm: React.FC<ActivityFormProps> = ({
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
    activityType: 'CALL' as CrmActivityType,
    direction: 'OUT' as CrmActivityDirection,
    subject: '',
    content: '',
    outcome: '',
    occurredAt: new Date().toISOString().slice(0, 16),
    nextActionAt: '',
    nextActionType: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [deals, setDeals] = useState<CrmDeal[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [loadingDeals, setLoadingDeals] = useState(false);
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

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Contact is required
    if (!formData.contactId && !contactId) {
      newErrors.contactId = 'Le contact est requis';
      newErrors.submit = 'Vous devez sélectionner un contact pour créer un suivi';
    }

    if (!formData.content.trim()) {
      newErrors.content = 'Le contenu est requis';
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
      // contactId is required - it should be validated by now
      const finalContactId = formData.contactId || contactId;
      if (!finalContactId) {
        throw new Error('Contact ID is required');
      }

      const submitData: CreateCrmActivityRequest = {
        contactId: finalContactId,
        dealId: formData.dealId || dealId || undefined,
        activityType: formData.activityType,
        direction: formData.direction,
        subject: formData.subject.trim() || undefined,
        content: formData.content.trim(),
        outcome: formData.outcome.trim() || undefined,
        occurredAt: formData.occurredAt ? new Date(formData.occurredAt) : undefined,
        nextActionAt: formData.nextActionAt ? new Date(formData.nextActionAt) : undefined,
        nextActionType: formData.nextActionType.trim() || undefined,
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
        setErrors({ submit: 'Une erreur est survenue lors de l\'enregistrement du suivi' });
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
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
          {errors.submit}
        </div>
      )}

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

      {/* Activity Type and Direction */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="activityType" className="block text-sm font-medium text-gray-700 mb-1">
            Type <span className="text-red-500">*</span>
          </label>
          <select
            id="activityType"
            value={formData.activityType}
            onChange={(e) => handleChange('activityType', e.target.value)}
            className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            required
          >
            <option value="CALL">Appel</option>
            <option value="EMAIL">Email</option>
            <option value="SMS">SMS</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="VISIT">Visite</option>
            <option value="MEETING">Réunion</option>
            <option value="NOTE">Note</option>
            <option value="TASK">Tâche</option>
          </select>
        </div>

        <div>
          <label htmlFor="direction" className="block text-sm font-medium text-gray-700 mb-1">
            Direction
          </label>
          <select
            id="direction"
            value={formData.direction}
            onChange={(e) => handleChange('direction', e.target.value)}
            className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="OUT">Sortant</option>
            <option value="IN">Entrant</option>
            <option value="INTERNAL">Interne</option>
          </select>
        </div>
      </div>

      {/* Subject and Content */}
      <div>
        <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">
          Sujet
        </label>
        <Input
          id="subject"
          type="text"
          value={formData.subject}
          onChange={(e) => handleChange('subject', e.target.value)}
          placeholder="Sujet du suivi"
          className="h-9"
        />
      </div>

      <div>
        <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-1">
          Contenu <span className="text-red-500">*</span>
        </label>
        <textarea
          id="content"
          value={formData.content}
          onChange={(e) => handleChange('content', e.target.value)}
          className={`flex min-h-[80px] w-full rounded-md border ${
            errors.content ? 'border-red-500' : 'border-slate-200'
          } bg-white px-3 py-2 text-sm`}
          required
          placeholder="Détails du suivi..."
        />
        {errors.content && (
          <p className="mt-1 text-xs text-red-600">{errors.content}</p>
        )}
      </div>

      {/* Dates and Next Action */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label htmlFor="occurredAt" className="block text-sm font-medium text-gray-700 mb-1">
            Date d'occurrence
          </label>
          <Input
            id="occurredAt"
            type="datetime-local"
            value={formData.occurredAt}
            onChange={(e) => handleChange('occurredAt', e.target.value)}
            className="h-9"
          />
        </div>

        <div>
          <label htmlFor="nextActionAt" className="block text-sm font-medium text-gray-700 mb-1">
            Prochaine action
          </label>
          <Input
            id="nextActionAt"
            type="datetime-local"
            value={formData.nextActionAt}
            onChange={(e) => handleChange('nextActionAt', e.target.value)}
            className="h-9"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label htmlFor="outcome" className="block text-sm font-medium text-gray-700 mb-1">
            Résultat
          </label>
          <Input
            id="outcome"
            type="text"
            value={formData.outcome}
            onChange={(e) => handleChange('outcome', e.target.value)}
            placeholder="Résultat du suivi"
            className="h-9"
          />
        </div>

        <div>
          <label htmlFor="nextActionType" className="block text-sm font-medium text-gray-700 mb-1">
            Type de prochaine action
          </label>
          <Input
            id="nextActionType"
            type="text"
            value={formData.nextActionType}
            onChange={(e) => handleChange('nextActionType', e.target.value)}
            placeholder="ex: Rappel, Envoyer un devis"
            className="h-9"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting || loading} className="h-9">
            Annuler
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting || loading} className="h-9">
          {isSubmitting || loading ? 'Enregistrement...' : 'Créer le suivi'}
        </Button>
      </div>
    </form>
  );
};

