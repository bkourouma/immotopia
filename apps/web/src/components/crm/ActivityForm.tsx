import React, { useState, useEffect } from 'react';
import {
  Form,
  Input,
  Select,
  Button,
  DatePicker,
  Row,
  Col,
  Space,
  Alert,
} from 'antd';
import dayjs from 'dayjs';
import { CreateCrmActivityRequest, CrmActivityType, CrmActivityDirection } from '../../types/crm-types';
import { listContacts, listDeals, getContact, getDeal, CrmContact, CrmDeal } from '../../services/crm-service';

const { TextArea } = Input;

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
      newErrors.submit = 'Vous devez sélectionner un contact pour créer une activité';
    }

    if (!formData.content.trim()) {
      newErrors.content = 'Le contenu est requis';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
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
        setErrors({ submit: 'Une erreur est survenue lors de l\'enregistrement de l\'activité' });
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
    <Form onFinish={handleSubmit} layout="vertical">
      {errors.submit && (
        <Alert message={errors.submit} type="error" showIcon style={{ marginBottom: 16 }} />
      )}

      {/* Contact and Deal Selection - Contact Required, Deal Optional */}
      <Row gutter={16}>
        {!contactId ? (
          <Col xs={24} md={12}>
            <Form.Item
              label="Contact"
              required
              validateStatus={errors.contactId ? 'error' : ''}
              help={errors.contactId}
            >
              {loadingContacts ? (
                <Input placeholder="Chargement..." disabled />
              ) : (
                <Select
                  value={formData.contactId}
                  onChange={(value) => handleChange('contactId', value)}
                  placeholder="Sélectionner un contact"
                  showSearch
                  filterOption={(input, option) => {
                    const label = typeof option?.label === 'string' 
                      ? option.label 
                      : String(option?.children || '');
                    return label.toLowerCase().includes(input.toLowerCase());
                  }}
                  optionLabelProp="label"
                >
                  {contacts.map((contact) => {
                    const label = `${contact.firstName} ${contact.lastName} ${contact.email ? `(${contact.email})` : ''}`;
                    return (
                      <Select.Option key={contact.id} value={contact.id} label={label}>
                        {label}
                      </Select.Option>
                    );
                  })}
                </Select>
              )}
            </Form.Item>
          </Col>
        ) : (
          <Col xs={24} md={12}>
            <Form.Item label="Contact" required>
              <Input
                value={
                  selectedContact
                    ? `${selectedContact.firstName} ${selectedContact.lastName}${selectedContact.email ? ` (${selectedContact.email})` : ''}`
                    : 'Chargement...'
                }
                disabled
              />
            </Form.Item>
          </Col>
        )}

        {!dealId ? (
          <Col xs={24} md={12}>
            <Form.Item
              label="Affaire (optionnel)"
              validateStatus={errors.dealId ? 'error' : ''}
              help={errors.dealId || (!formData.contactId && !contactId ? 'Sélectionnez d\'abord un contact' : '')}
            >
              {loadingDeals ? (
                <Input placeholder="Chargement..." disabled />
              ) : (
                <Select
                  value={formData.dealId}
                  onChange={(value) => handleChange('dealId', value)}
                  disabled={!formData.contactId && !contactId}
                  placeholder="Aucune affaire (optionnel)"
                  allowClear
                >
                  {deals.length === 0 && (formData.contactId || contactId) ? (
                    <Select.Option value="" disabled>
                      Aucune affaire pour ce contact
                    </Select.Option>
                  ) : (
                    deals.map((deal) => {
                      const typeLabel = deal.type === 'ACHAT' ? 'Achat' : 'Location';
                      const stageLabels: Record<string, string> = {
                        'NEW': 'Nouveau',
                        'QUALIFIED': 'Qualifié',
                        'VISIT': 'Visite',
                        'NEGOTIATION': 'Négociation',
                        'WON': 'Gagné',
                        'LOST': 'Perdu',
                      };
                      const budget = deal.budgetMax
                        ? ` - ${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(deal.budgetMax)}`
                        : '';
                      return (
                        <Select.Option key={deal.id} value={deal.id}>
                          {typeLabel} - {stageLabels[deal.stage] || deal.stage}{budget}
                        </Select.Option>
                      );
                    })
                  )}
                </Select>
              )}
            </Form.Item>
          </Col>
        ) : (
          <Col xs={24} md={12}>
            <Form.Item label="Affaire">
              <Input
                value={
                  selectedDeal
                    ? `${selectedDeal.type === 'ACHAT' ? 'Achat' : 'Location'} - ${
                        (() => {
                          const stageLabels: Record<string, string> = {
                            'NEW': 'Nouveau',
                            'QUALIFIED': 'Qualifié',
                            'VISIT': 'Visite',
                            'NEGOTIATION': 'Négociation',
                            'WON': 'Gagné',
                            'LOST': 'Perdu',
                          };
                          return stageLabels[selectedDeal.stage] || selectedDeal.stage;
                        })()
                      }${
                        selectedDeal.budgetMax
                          ? ` - ${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(selectedDeal.budgetMax)}`
                          : ''
                      }`
                    : 'Chargement...'
                }
                disabled
              />
            </Form.Item>
          </Col>
        )}
      </Row>

      {/* Activity Type and Direction */}
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item label="Type" required>
            <Select
              value={formData.activityType}
              onChange={(value) => handleChange('activityType', value)}
              placeholder="Sélectionner un type"
            >
              <Select.Option value="CALL">Appel</Select.Option>
              <Select.Option value="EMAIL">Email</Select.Option>
              <Select.Option value="SMS">SMS</Select.Option>
              <Select.Option value="WHATSAPP">WhatsApp</Select.Option>
              <Select.Option value="VISIT">Visite</Select.Option>
              <Select.Option value="MEETING">Réunion</Select.Option>
              <Select.Option value="NOTE">Note</Select.Option>
              <Select.Option value="TASK">Tâche</Select.Option>
            </Select>
          </Form.Item>
        </Col>

        <Col xs={24} md={12}>
          <Form.Item label="Direction">
            <Select
              value={formData.direction}
              onChange={(value) => handleChange('direction', value)}
              placeholder="Sélectionner une direction"
            >
              <Select.Option value="OUT">Sortant</Select.Option>
              <Select.Option value="IN">Entrant</Select.Option>
              <Select.Option value="INTERNAL">Interne</Select.Option>
            </Select>
          </Form.Item>
        </Col>
      </Row>

      {/* Subject and Content */}
      <Form.Item label="Sujet">
        <Input
          value={formData.subject}
          onChange={(e) => handleChange('subject', e.target.value)}
          placeholder="Sujet de l'activité"
        />
      </Form.Item>

      <Form.Item
        label="Contenu"
        required
        validateStatus={errors.content ? 'error' : ''}
        help={errors.content}
      >
        <TextArea
          value={formData.content}
          onChange={(e) => handleChange('content', e.target.value)}
          placeholder="Détails de l'activité..."
          rows={4}
        />
      </Form.Item>

      {/* Dates and Next Action */}
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item label="Date d'occurrence">
            <DatePicker
              showTime
              value={formData.occurredAt ? dayjs(formData.occurredAt) : null}
              onChange={(date) => handleChange('occurredAt', date ? date.format('YYYY-MM-DDTHH:mm') : '')}
              style={{ width: '100%' }}
              format="DD/MM/YYYY HH:mm"
            />
          </Form.Item>
        </Col>

        <Col xs={24} md={12}>
          <Form.Item label="Prochaine action">
            <DatePicker
              showTime
              value={formData.nextActionAt ? dayjs(formData.nextActionAt) : null}
              onChange={(date) => handleChange('nextActionAt', date ? date.format('YYYY-MM-DDTHH:mm') : '')}
              style={{ width: '100%' }}
              format="DD/MM/YYYY HH:mm"
            />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item label="Résultat">
            <Input
              value={formData.outcome}
              onChange={(e) => handleChange('outcome', e.target.value)}
              placeholder="Résultat de l'activité"
            />
          </Form.Item>
        </Col>

        <Col xs={24} md={12}>
          <Form.Item label="Type de prochaine action">
            <Input
              value={formData.nextActionType}
              onChange={(e) => handleChange('nextActionType', e.target.value)}
              placeholder="ex: Rappel, Envoyer un devis"
            />
          </Form.Item>
        </Col>
      </Row>

      {/* Actions */}
      <Form.Item>
        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          {onCancel && (
            <Button onClick={onCancel} disabled={isSubmitting || loading}>
              Annuler
            </Button>
          )}
          <Button type="primary" htmlType="submit" loading={isSubmitting || loading}>
            Créer l'activité
          </Button>
        </Space>
      </Form.Item>
    </Form>
  );
};

