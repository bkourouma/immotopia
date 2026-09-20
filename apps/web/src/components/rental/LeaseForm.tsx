import React, { useState, useEffect } from 'react';
import { App, Form, Input, Select, Button, Row, Col, Alert, InputNumber, DatePicker, Space } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import {
  CreateLeaseRequest,
  UpdateLeaseRequest,
  RentalLease,
  RentalBillingFrequency
} from '../../services/rental-service';
import { listProperties, Property } from '../../services/property-service';
import { PropertyType } from '../../types/property-types';
import { listContacts, CrmContact } from '../../services/crm-service';
import { formatNumberWithSpaces, parseFormattedNumber } from '../../lib/utils';
import { t } from '../../i18n/t';

const { TextArea } = Input;

interface LeaseFormProps {
  lease?: RentalLease;
  tenantId: string;
  onSubmit: (data: CreateLeaseRequest | UpdateLeaseRequest) => Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
}

export const LeaseForm: React.FC<LeaseFormProps> = ({ lease, tenantId, onSubmit, onCancel, loading = false }) => {
  const { message } = App.useApp();

  const [form] = Form.useForm();
  const [formData, setFormData] = useState({
    propertyId: lease?.property_id || '',
    primaryRenterClientId: lease?.primary_renter_client_id || '',
    ownerClientId: lease?.owner_client_id || '',
    startDate: lease?.start_date ? lease.start_date.split('T')[0] : '',
    endDate: lease?.end_date ? lease.end_date.split('T')[0] : '',
    moveInDate: lease?.move_in_date ? lease.move_in_date.split('T')[0] : '',
    moveOutDate: lease?.move_out_date ? lease.move_out_date.split('T')[0] : '',
    billingFrequency: lease?.billing_frequency || RentalBillingFrequency.MONTHLY,
    dueDayOfMonth: lease?.due_day_of_month || 1,
    currency: lease?.currency || 'FCFA',
    rentAmount: lease?.rent_amount?.toString() || '',
    serviceChargeAmount: lease?.service_charge_amount?.toString() || '0',
    securityDepositAmount: lease?.security_deposit_amount?.toString() || '0',
    penaltyGraceDays: lease?.penalty_grace_days?.toString() || '0',
    penaltyMode: lease?.penalty_mode || 'PERCENT_OF_BALANCE',
    penaltyRate: lease?.penalty_rate?.toString() || '0',
    penaltyFixedAmount: lease?.penalty_fixed_amount?.toString() || '0',
    penaltyCapAmount: lease?.penalty_cap_amount?.toString() || '',
    notes: lease?.notes || ''
  });

  const [properties, setProperties] = useState<Property[]>([]);
  const [clients, setClients] = useState<CrmContact[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [clientsLoaded, setClientsLoaded] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load properties and clients when tenant changes
  useEffect(() => {
    loadProperties();
  }, [tenantId]);

  // Load clients when tenant or lease changes (lease needed to include referenced contacts)
  useEffect(() => {
    loadClients();
  }, [tenantId, lease?.id]);

  const handleNumberChange = (field: string, value: string) => {
    // Remove spaces for storage, but keep formatted for display
    const cleaned = parseFormattedNumber(value);
    handleChange(field, cleaned);
  };

  // Update form data when lease prop changes (for edit mode)
  // Wait for clients to be loaded before setting form values to ensure Select options are available
  useEffect(() => {
    console.log('[LeaseForm] useEffect triggered', {
      hasLease: !!lease,
      clientsLoaded,
      clientsCount: clients.length,
      leasePrimaryRenterId: lease?.primary_renter_client_id,
      leaseOwnerId: lease?.owner_client_id
    });

    if (lease && clientsLoaded) {
      const primaryRenter = clients.find(c => c.id === lease.primary_renter_client_id);
      const owner = clients.find(c => c.id === lease.owner_client_id);

      console.log('[LeaseForm] Setting form values', {
        primaryRenterClientId: lease.primary_renter_client_id,
        ownerClientId: lease.owner_client_id,
        availableClientIds: clients.map(c => c.id).slice(0, 5), // Show first 5 for brevity
        totalClients: clients.length,
        primaryRenterFound: primaryRenter
          ? { id: primaryRenter.id, name: `${primaryRenter.firstName} ${primaryRenter.lastName}` }
          : null,
        ownerFound: owner ? { id: owner.id, name: `${owner.firstName} ${owner.lastName}` } : null
      });

      // Check if IDs exist but don't match (case sensitivity, whitespace, etc.)
      const primaryRenterIdMatches = clients.filter(
        c =>
          c.id.toLowerCase() === lease.primary_renter_client_id?.toLowerCase() ||
          c.id.trim() === lease.primary_renter_client_id?.trim()
      );
      const ownerIdMatches = clients.filter(
        c =>
          c.id.toLowerCase() === lease.owner_client_id?.toLowerCase() || c.id.trim() === lease.owner_client_id?.trim()
      );

      if (!primaryRenter && primaryRenterIdMatches.length > 0) {
        console.warn('[LeaseForm] Primary renter ID found with case/whitespace difference:', {
          leaseId: lease.primary_renter_client_id,
          foundId: primaryRenterIdMatches[0].id
        });
      }
      if (!owner && ownerIdMatches.length > 0) {
        console.warn('[LeaseForm] Owner ID found with case/whitespace difference:', {
          leaseId: lease.owner_client_id,
          foundId: ownerIdMatches[0].id
        });
      }

      const newFormData = {
        propertyId: lease.property_id || '',
        primaryRenterClientId: lease.primary_renter_client_id || '',
        ownerClientId: lease.owner_client_id || '',
        startDate: lease.start_date ? lease.start_date.split('T')[0] : '',
        endDate: lease.end_date ? lease.end_date.split('T')[0] : '',
        moveInDate: lease.move_in_date ? lease.move_in_date.split('T')[0] : '',
        moveOutDate: lease.move_out_date ? lease.move_out_date.split('T')[0] : '',
        billingFrequency: lease.billing_frequency || RentalBillingFrequency.MONTHLY,
        dueDayOfMonth: lease.due_day_of_month || 1,
        currency: lease.currency || 'FCFA',
        rentAmount: lease.rent_amount?.toString() || '',
        serviceChargeAmount: lease.service_charge_amount?.toString() || '0',
        securityDepositAmount: lease.security_deposit_amount?.toString() || '0',
        penaltyGraceDays: lease.penalty_grace_days?.toString() || '0',
        penaltyMode: lease.penalty_mode || 'PERCENT_OF_BALANCE',
        penaltyRate: lease.penalty_rate?.toString() || '0',
        penaltyFixedAmount: lease.penalty_fixed_amount?.toString() || '0',
        penaltyCapAmount: lease.penalty_cap_amount?.toString() || '',
        notes: lease.notes || ''
      };
      setFormData(newFormData);

      // Update form values - clients are now loaded, so Select options will be available
      const formValues = {
        propertyId: newFormData.propertyId,
        primaryRenterClientId: newFormData.primaryRenterClientId,
        ownerClientId: newFormData.ownerClientId || undefined,
        startDate: newFormData.startDate ? dayjs(newFormData.startDate) : undefined,
        endDate: newFormData.endDate ? dayjs(newFormData.endDate) : undefined,
        moveInDate: newFormData.moveInDate ? dayjs(newFormData.moveInDate) : undefined,
        moveOutDate: newFormData.moveOutDate ? dayjs(newFormData.moveOutDate) : undefined,
        billingFrequency: newFormData.billingFrequency,
        dueDayOfMonth: newFormData.dueDayOfMonth,
        currency: newFormData.currency,
        rentAmount: newFormData.rentAmount ? parseFloat(parseFormattedNumber(newFormData.rentAmount)) : undefined,
        serviceChargeAmount: newFormData.serviceChargeAmount
          ? parseFloat(parseFormattedNumber(newFormData.serviceChargeAmount))
          : undefined,
        securityDepositAmount: newFormData.securityDepositAmount
          ? parseFloat(parseFormattedNumber(newFormData.securityDepositAmount))
          : undefined,
        notes: newFormData.notes
      };
      console.log('[LeaseForm] Calling form.setFieldsValue with:', formValues);
      form.setFieldsValue(formValues);
      console.log('[LeaseForm] Form values set');
    } else {
      console.log('[LeaseForm] Skipping form update', {
        reason: !lease ? 'no lease' : !clientsLoaded ? 'clients not loaded' : 'unknown'
      });
    }
  }, [lease, clientsLoaded, form, clients]);

  const loadProperties = async () => {
    setLoadingData(true);
    try {
      const response = await listProperties(tenantId, { limit: 1000 });
      setProperties(response.properties || []);
    } catch (error) {
      console.error('Error loading properties:', error);
    } finally {
      setLoadingData(false);
    }
  };

  const loadClients = async () => {
    console.log('[LeaseForm] loadClients called', { hasLease: !!lease });
    setLoadingData(true);
    setClientsLoaded(false);
    try {
      const response = await listContacts(tenantId, { limit: 1000 });
      console.log('[LeaseForm] listContacts response:', {
        success: response.success,
        totalContacts: response.contacts?.length || 0
      });
      if (response.success) {
        // Filter contacts that have client roles
        let clientContacts = response.contacts.filter(
          contact => contact.roles && contact.roles.length > 0 && contact.roles.some(r => r.active)
        );

        // If editing a lease, also include contacts referenced in the lease
        // even if they don't have active roles (for backward compatibility)
        if (lease) {
          const referencedContactIds = new Set<string>();
          if (lease.primary_renter_client_id) {
            referencedContactIds.add(lease.primary_renter_client_id);
          }
          if (lease.owner_client_id) {
            referencedContactIds.add(lease.owner_client_id);
          }

          const referencedContacts = response.contacts.filter(contact => referencedContactIds.has(contact.id));

          // Merge: add referenced contacts that are not already in clientContacts
          const existingIds = new Set(clientContacts.map(c => c.id));
          const additionalContacts = referencedContacts.filter(c => !existingIds.has(c.id));

          if (additionalContacts.length > 0) {
            console.log('[LeaseForm] Adding referenced contacts without active roles:', {
              count: additionalContacts.length,
              ids: additionalContacts.map(c => c.id)
            });
            clientContacts = [...clientContacts, ...additionalContacts];
          }
        }

        console.log('[LeaseForm] Filtered client contacts:', {
          count: clientContacts.length,
          clientIds: clientContacts.map(c => ({ id: c.id, name: `${c.firstName} ${c.lastName}`, email: c.email }))
        });
        setClients(clientContacts);
      }
      setClientsLoaded(true);
      console.log('[LeaseForm] clientsLoaded set to true');
    } catch (error) {
      console.error('[LeaseForm] Error loading clients:', error);
      setClientsLoaded(true); // Mark as loaded even on error to allow form update
    } finally {
      setLoadingData(false);
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.propertyId) {
      newErrors.propertyId = t('La propriété est requise');
    }

    if (!formData.primaryRenterClientId) {
      newErrors.primaryRenterClientId = t('Le locataire principal est requis');
    }

    if (!formData.startDate) {
      newErrors.startDate = t('La date de début est requise');
    }

    if (formData.endDate && formData.endDate <= formData.startDate) {
      newErrors.endDate = t('La date de fin doit être après la date de début');
    }

    if (formData.dueDayOfMonth < 1 || formData.dueDayOfMonth > 31) {
      newErrors.dueDayOfMonth = t("Le jour d'échéance doit être entre 1 et 31");
    }

    const rentAmount = parseFloat(parseFormattedNumber(formData.rentAmount));
    if (!formData.rentAmount || isNaN(rentAmount) || rentAmount <= 0) {
      newErrors.rentAmount = t('Le montant du loyer doit être supérieur à 0');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (values: any) => {
    // Helper function to safely convert date to ISO string
    const convertDateToISO = (date: Dayjs | undefined): string | undefined => {
      if (!date) {
        return undefined;
      }
      return date.toISOString();
    };

    setIsSubmitting(true);
    try {
      const submitData: CreateLeaseRequest | UpdateLeaseRequest = {
        ...(lease
          ? {}
          : {
              propertyId: formData.propertyId,
              primaryRenterClientId: formData.primaryRenterClientId,
              ownerClientId: formData.ownerClientId || undefined,
              startDate: convertDateToISO(values.startDate)!,
              endDate: convertDateToISO(values.endDate),
              moveInDate: convertDateToISO(values.moveInDate),
              moveOutDate: convertDateToISO(values.moveOutDate),
              billingFrequency: values.billingFrequency,
              dueDayOfMonth: values.dueDayOfMonth || 1,
              currency: values.currency || 'FCFA',
              rentAmount: values.rentAmount || 0,
              serviceChargeAmount: values.serviceChargeAmount || 0,
              securityDepositAmount: values.securityDepositAmount || 0,
              penaltyGraceDays: formData.penaltyGraceDays ? parseInt(formData.penaltyGraceDays) : 0,
              penaltyMode: formData.penaltyMode,
              penaltyRate: formData.penaltyRate ? parseFloat(formData.penaltyRate) : 0,
              penaltyFixedAmount: formData.penaltyFixedAmount ? parseFloat(formData.penaltyFixedAmount) : 0,
              penaltyCapAmount: formData.penaltyCapAmount ? parseFloat(formData.penaltyCapAmount) : undefined,
              notes: values.notes || undefined
            }),
        ...(lease
          ? {
              endDate: convertDateToISO(values.endDate),
              moveInDate: convertDateToISO(values.moveInDate),
              moveOutDate: convertDateToISO(values.moveOutDate),
              rentAmount: values.rentAmount || 0,
              serviceChargeAmount: values.serviceChargeAmount || 0,
              securityDepositAmount: values.securityDepositAmount || 0,
              billingFrequency: values.billingFrequency,
              notes: values.notes || undefined
            }
          : {})
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
        message.error(error.response.data.message);
      } else {
        const errorMsg = t("Une erreur est survenue lors de l'enregistrement du bail");
        setErrors({ submit: errorMsg });
        message.error(errorMsg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: string, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear field error when user changes the value
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  // Log form values when clients are loaded or form is updated
  useEffect(() => {
    if (clientsLoaded) {
      const formValues = form.getFieldsValue();
      console.log('[LeaseForm] Current form values after clients loaded:', {
        ...formValues,
        primaryRenterClientId: formValues.primaryRenterClientId,
        ownerClientId: formValues.ownerClientId,
        primaryRenterClient: clients.find(c => c.id === formValues.primaryRenterClientId),
        ownerClient: clients.find(c => c.id === formValues.ownerClientId)
      });
    }
  }, [form, clientsLoaded]);

  // Properties available for lease: exclude buildings (IMMEUBLE) that have apartments
  const leaseableProperties = properties.filter(p => {
    if (p.propertyType === PropertyType.IMMEUBLE && (p._count?.containerChildren ?? 0) > 0) {
      return false;
    }
    return true;
  });

  const getPropertyOptionLabel = (property: Property): string => {
    const ownerLabel = property.owner?.fullName?.trim() || '';
    const title = property.title?.trim() || property.internalReference || t('Sans libellé');
    const buildingPart = property.containerParent?.title ? ` ( ${property.containerParent.title} )` : '';
    const titleWithBuilding = title + buildingPart;
    if (ownerLabel) return `${ownerLabel} - ${titleWithBuilding}`;
    return titleWithBuilding;
  };

  console.log('[LeaseForm] Render - initialValues:', {
    propertyId: formData.propertyId,
    primaryRenterClientId: formData.primaryRenterClientId,
    ownerClientId: formData.ownerClientId,
    clientsCount: clients.length,
    clientsLoaded
  });

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleSubmit}
      initialValues={{
        propertyId: formData.propertyId,
        primaryRenterClientId: formData.primaryRenterClientId,
        ownerClientId: formData.ownerClientId || undefined,
        startDate: formData.startDate ? dayjs(formData.startDate) : undefined,
        endDate: formData.endDate ? dayjs(formData.endDate) : undefined,
        moveInDate: formData.moveInDate ? dayjs(formData.moveInDate) : undefined,
        moveOutDate: formData.moveOutDate ? dayjs(formData.moveOutDate) : undefined,
        billingFrequency: formData.billingFrequency,
        dueDayOfMonth: formData.dueDayOfMonth,
        currency: formData.currency,
        rentAmount: formData.rentAmount ? parseFloat(parseFormattedNumber(formData.rentAmount)) : undefined,
        serviceChargeAmount: formData.serviceChargeAmount
          ? parseFloat(parseFormattedNumber(formData.serviceChargeAmount))
          : undefined,
        securityDepositAmount: formData.securityDepositAmount
          ? parseFloat(parseFormattedNumber(formData.securityDepositAmount))
          : undefined,
        notes: formData.notes
      }}
    >
      {errors.submit && (
        <Alert
          message={t('Erreur')}
          description={errors.submit}
          type="error"
          showIcon
          closable
          style={{ marginBottom: 24 }}
        />
      )}

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item
            label={t('Propriété')}
            name="propertyId"
            required
            validateStatus={errors.propertyId ? 'error' : ''}
            help={errors.propertyId}
            rules={[{ required: true, message: t('La propriété est requise') }]}
          >
            <Select
              placeholder={t('Sélectionner une propriété')}
              disabled={!!lease}
              onChange={value => handleChange('propertyId', value)}
              loading={loadingData}
              showSearch
              filterOption={(input, option) => {
                const label = option?.children?.toString().toLowerCase() || '';
                return label.includes(input.toLowerCase());
              }}
              optionFilterProp="children"
            >
              {leaseableProperties.map(property => (
                <Select.Option key={property.id} value={property.id}>
                  {getPropertyOptionLabel(property)}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Col>

        <Col xs={24} md={12}>
          <Form.Item
            label={t('Locataire principal')}
            name="primaryRenterClientId"
            required
            validateStatus={errors.primaryRenterClientId ? 'error' : ''}
            help={errors.primaryRenterClientId}
            rules={[{ required: true, message: t('Le locataire principal est requis') }]}
          >
            <Select
              placeholder={t('Sélectionner un locataire')}
              disabled={!!lease}
              onChange={value => handleChange('primaryRenterClientId', value)}
              loading={loadingData}
            >
              {clients.map(client => (
                <Select.Option key={client.id} value={client.id}>
                  {client.firstName} {client.lastName} {client.email ? `(${client.email})` : ''}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Col>

        <Col xs={24} md={12}>
          <Form.Item label={t('Propriétaire')} name="ownerClientId">
            <Select
              placeholder={t('Sélectionner un propriétaire (optionnel)')}
              disabled={!!lease}
              allowClear
              onChange={value => handleChange('ownerClientId', value || '')}
              loading={loadingData}
            >
              {clients.map(client => (
                <Select.Option key={client.id} value={client.id}>
                  {client.firstName} {client.lastName} {client.email ? `(${client.email})` : ''}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Col>

        <Col xs={24} md={12}>
          <Form.Item
            label={t('Date de début')}
            name="startDate"
            required
            validateStatus={errors.startDate ? 'error' : ''}
            help={errors.startDate}
            rules={[{ required: true, message: t('La date de début est requise') }]}
          >
            <DatePicker
              style={{ width: '100%' }}
              disabled={!!lease}
              onChange={date => handleChange('startDate', date ? date.format('YYYY-MM-DD') : '')}
            />
          </Form.Item>
        </Col>

        <Col xs={24} md={12}>
          <Form.Item
            label={t('Date de fin')}
            name="endDate"
            validateStatus={errors.endDate ? 'error' : ''}
            help={errors.endDate}
          >
            <DatePicker
              style={{ width: '100%' }}
              onChange={date => handleChange('endDate', date ? date.format('YYYY-MM-DD') : '')}
            />
          </Form.Item>
        </Col>

        <Col xs={24} md={12}>
          <Form.Item label={t("Date d'emménagement")} name="moveInDate">
            <DatePicker
              style={{ width: '100%' }}
              onChange={date => handleChange('moveInDate', date ? date.format('YYYY-MM-DD') : '')}
            />
          </Form.Item>
        </Col>

        <Col xs={24} md={12}>
          <Form.Item label={t('Date de déménagement')} name="moveOutDate">
            <DatePicker
              style={{ width: '100%' }}
              onChange={date => handleChange('moveOutDate', date ? date.format('YYYY-MM-DD') : '')}
            />
          </Form.Item>
        </Col>

        <Col xs={24} md={12}>
          <Form.Item
            label={t('Fréquence de facturation')}
            name="billingFrequency"
            required
            rules={[{ required: true, message: t('La fréquence de facturation est requise') }]}
          >
            <Select onChange={value => handleChange('billingFrequency', value)}>
              <Select.Option value={RentalBillingFrequency.MONTHLY}>{t('Mensuel')}</Select.Option>
              <Select.Option value={RentalBillingFrequency.QUARTERLY}>{t('Trimestriel')}</Select.Option>
              <Select.Option value={RentalBillingFrequency.SEMIANNUAL}>{t('Semestriel')}</Select.Option>
              <Select.Option value={RentalBillingFrequency.ANNUAL}>{t('Annuel')}</Select.Option>
            </Select>
          </Form.Item>
        </Col>

        <Col xs={24} md={12}>
          <Form.Item
            label={t("Jour d'échéance (1-31)")}
            name="dueDayOfMonth"
            required
            validateStatus={errors.dueDayOfMonth ? 'error' : ''}
            help={errors.dueDayOfMonth}
            rules={[
              { required: true, message: t("Le jour d'échéance est requis") },
              { type: 'number', min: 1, max: 31, message: t("Le jour d'échéance doit être entre 1 et 31") }
            ]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={1}
              max={31}
              onChange={value => handleChange('dueDayOfMonth', value || 1)}
            />
          </Form.Item>
        </Col>

        <Col xs={24} md={12}>
          <Form.Item label={t('Devise')} name="currency">
            <Select onChange={value => handleChange('currency', value)}>
              <Select.Option value="FCFA">FCFA</Select.Option>
              <Select.Option value="EUR">EUR</Select.Option>
              <Select.Option value="USD">USD</Select.Option>
            </Select>
          </Form.Item>
        </Col>

        <Col xs={24} md={12}>
          <Form.Item
            label={t('Montant du loyer')}
            name="rentAmount"
            required
            validateStatus={errors.rentAmount ? 'error' : ''}
            help={errors.rentAmount}
            rules={[
              { required: true, message: t('Le montant du loyer est requis') },
              { type: 'number', min: 0.01, message: t('Le montant du loyer doit être supérieur à 0') }
            ]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              step={1000}
              formatter={value => formatNumberWithSpaces(value?.toString() || '')}
              parser={
                (value => {
                  if (!value) return 0;
                  const parsed = parseFormattedNumber(value);
                  const num = parseFloat(parsed);
                  return isNaN(num) ? 0 : num;
                }) as (displayValue: string | undefined) => number
              }
              onChange={value => handleChange('rentAmount', value?.toString() || '')}
              placeholder={t('Ex: 150000')}
            />
          </Form.Item>
        </Col>

        <Col xs={24} md={12}>
          <Form.Item label={t('Charges de service')} name="serviceChargeAmount">
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              step={1000}
              formatter={value => formatNumberWithSpaces(value?.toString() || '')}
              parser={
                (value => {
                  if (!value) return 0;
                  const parsed = parseFormattedNumber(value);
                  const num = parseFloat(parsed);
                  return isNaN(num) ? 0 : num;
                }) as (displayValue: string | undefined) => number
              }
              onChange={value => handleChange('serviceChargeAmount', value?.toString() || '0')}
              placeholder={t('Ex: 10000')}
            />
          </Form.Item>
        </Col>

        <Col xs={24} md={12}>
          <Form.Item label={t('Dépôt de garantie')} name="securityDepositAmount">
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              step={1000}
              formatter={value => formatNumberWithSpaces(value?.toString() || '')}
              parser={
                (value => {
                  if (!value) return 0;
                  const parsed = parseFormattedNumber(value);
                  const num = parseFloat(parsed);
                  return isNaN(num) ? 0 : num;
                }) as (displayValue: string | undefined) => number
              }
              onChange={value => handleChange('securityDepositAmount', value?.toString() || '0')}
              placeholder={t('Ex: 500000')}
            />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item label={t('Notes')} name="notes">
        <TextArea
          rows={4}
          onChange={e => handleChange('notes', e.target.value)}
          placeholder={t('Notes additionnelles sur le bail...')}
        />
      </Form.Item>

      <Form.Item>
        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          {onCancel && (
            <Button onClick={onCancel} disabled={isSubmitting || loading}>
              {t('Annuler')}
            </Button>
          )}
          <Button type="primary" htmlType="submit" loading={isSubmitting || loading}>
            {lease ? t('Mettre à jour') : t('Créer')}
          </Button>
        </Space>
      </Form.Item>
    </Form>
  );
};
