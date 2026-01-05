import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  CreateLeaseRequest,
  UpdateLeaseRequest,
  RentalLease,
  RentalBillingFrequency,
} from '../../services/rental-service';
import { listProperties, Property } from '../../services/property-service';
import { listContacts, CrmContact } from '../../services/crm-service';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { formatNumberWithSpaces, parseFormattedNumber } from '../../lib/utils';

interface LeaseFormProps {
  lease?: RentalLease;
  tenantId: string;
  onSubmit: (data: CreateLeaseRequest | UpdateLeaseRequest) => Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
}

export const LeaseForm: React.FC<LeaseFormProps> = ({
  lease,
  tenantId,
  onSubmit,
  onCancel,
  loading = false,
}) => {
  const [formData, setFormData] = useState({
    leaseNumber: lease?.lease_number || '',
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
    notes: lease?.notes || '',
  });

  const [properties, setProperties] = useState<Property[]>([]);
  const [clients, setClients] = useState<CrmContact[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadProperties();
    loadClients();
  }, [tenantId]);

  const handleNumberChange = (field: string, value: string) => {
    // Remove spaces for storage, but keep formatted for display
    const cleaned = parseFormattedNumber(value);
    handleChange(field, cleaned);
  };

  // Update form data when lease prop changes (for edit mode)
  useEffect(() => {
    if (lease) {
      setFormData({
        leaseNumber: lease.lease_number || '',
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
        notes: lease.notes || '',
      });
    }
  }, [lease]);

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
    setLoadingData(true);
    try {
      const response = await listContacts(tenantId, { limit: 1000 });
      if (response.success) {
        // Filter contacts that have client roles
        const clientContacts = response.contacts.filter(
          (contact) => contact.roles && contact.roles.length > 0 && contact.roles.some((r) => r.active)
        );
        setClients(clientContacts);
      }
    } catch (error) {
      console.error('Error loading clients:', error);
    } finally {
      setLoadingData(false);
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.leaseNumber.trim()) {
      newErrors.leaseNumber = 'Le numéro de bail est requis';
    }

    if (!formData.propertyId) {
      newErrors.propertyId = 'La propriété est requise';
    }

    if (!formData.primaryRenterClientId) {
      newErrors.primaryRenterClientId = 'Le locataire principal est requis';
    }

    if (!formData.startDate) {
      newErrors.startDate = 'La date de début est requise';
    }

    if (formData.endDate && formData.endDate <= formData.startDate) {
      newErrors.endDate = 'La date de fin doit être après la date de début';
    }

    if (formData.dueDayOfMonth < 1 || formData.dueDayOfMonth > 31) {
      newErrors.dueDayOfMonth = 'Le jour d\'échéance doit être entre 1 et 31';
    }

    const rentAmount = parseFloat(parseFormattedNumber(formData.rentAmount));
    if (!formData.rentAmount || isNaN(rentAmount) || rentAmount <= 0) {
      newErrors.rentAmount = 'Le montant du loyer doit être supérieur à 0';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    // Helper function to safely convert date string to ISO string
    const convertDateToISO = (dateString: string | undefined): string | undefined => {
      if (!dateString || !dateString.trim()) {
        return undefined;
      }
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        throw new Error(`Date invalide: ${dateString}`);
      }
      return date.toISOString();
    };

    setIsSubmitting(true);
    try {
      const submitData: CreateLeaseRequest | UpdateLeaseRequest = {
        ...(lease ? {} : { leaseNumber: formData.leaseNumber }),
        ...(lease
          ? {}
          : {
              propertyId: formData.propertyId,
              primaryRenterClientId: formData.primaryRenterClientId,
              ownerClientId: formData.ownerClientId || undefined,
              startDate: convertDateToISO(formData.startDate)!,
              endDate: convertDateToISO(formData.endDate),
              moveInDate: convertDateToISO(formData.moveInDate),
              moveOutDate: convertDateToISO(formData.moveOutDate),
              billingFrequency: formData.billingFrequency,
              dueDayOfMonth: parseInt(formData.dueDayOfMonth.toString()),
              currency: formData.currency,
              rentAmount: parseFloat(parseFormattedNumber(formData.rentAmount)) || 0,
              serviceChargeAmount: parseFloat(parseFormattedNumber(formData.serviceChargeAmount)) || 0,
              securityDepositAmount: parseFloat(parseFormattedNumber(formData.securityDepositAmount)) || 0,
              penaltyGraceDays: parseInt(formData.penaltyGraceDays) || 0,
              penaltyMode: formData.penaltyMode,
              penaltyRate: parseFloat(formData.penaltyRate) || 0,
              penaltyFixedAmount: parseFloat(formData.penaltyFixedAmount) || 0,
              penaltyCapAmount: formData.penaltyCapAmount ? parseFloat(formData.penaltyCapAmount) : undefined,
              notes: formData.notes || undefined,
            }),
        ...(lease
          ? {
              endDate: convertDateToISO(formData.endDate),
              moveInDate: convertDateToISO(formData.moveInDate),
              moveOutDate: convertDateToISO(formData.moveOutDate),
              rentAmount: parseFloat(parseFormattedNumber(formData.rentAmount)) || 0,
              serviceChargeAmount: parseFloat(parseFormattedNumber(formData.serviceChargeAmount)) || 0,
              securityDepositAmount: parseFloat(parseFormattedNumber(formData.securityDepositAmount)) || 0,
              billingFrequency: formData.billingFrequency,
              notes: formData.notes || undefined,
            }
          : {}),
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
        setErrors({ submit: 'Une erreur est survenue lors de l\'enregistrement du bail' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {errors.submit && (
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md">
          {errors.submit}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {!lease && (
          <div>
            <label htmlFor="leaseNumber" className="block text-sm font-medium text-gray-700 mb-1">
              Numéro de bail <span className="text-red-500">*</span>
            </label>
            <Input
              id="leaseNumber"
              value={formData.leaseNumber}
              onChange={(e) => handleChange('leaseNumber', e.target.value)}
              className={errors.leaseNumber ? 'border-red-500' : ''}
              required
            />
            {errors.leaseNumber && <p className="mt-1 text-sm text-red-600">{errors.leaseNumber}</p>}
          </div>
        )}

        <div>
          <label htmlFor="propertyId" className="block text-sm font-medium text-gray-700 mb-1">
            Propriété <span className="text-red-500">*</span>
          </label>
          <Select
            value={formData.propertyId}
            onValueChange={(value) => handleChange('propertyId', value)}
            disabled={!!lease}
          >
            <SelectTrigger className={errors.propertyId ? 'border-red-500' : ''}>
              <SelectValue placeholder="Sélectionner une propriété" />
            </SelectTrigger>
            <SelectContent>
              {properties.map((property) => (
                <SelectItem key={property.id} value={property.id}>
                  {property.internalReference} - {property.address}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.propertyId && <p className="mt-1 text-sm text-red-600">{errors.propertyId}</p>}
        </div>

        <div>
          <label htmlFor="primaryRenterClientId" className="block text-sm font-medium text-gray-700 mb-1">
            Locataire principal <span className="text-red-500">*</span>
          </label>
          <Select
            value={formData.primaryRenterClientId}
            onValueChange={(value) => handleChange('primaryRenterClientId', value)}
            disabled={!!lease}
          >
            <SelectTrigger className={errors.primaryRenterClientId ? 'border-red-500' : ''}>
              <SelectValue placeholder="Sélectionner un locataire" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.firstName} {client.lastName} {client.email ? `(${client.email})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.primaryRenterClientId && (
            <p className="mt-1 text-sm text-red-600">{errors.primaryRenterClientId}</p>
          )}
        </div>

        <div>
          <label htmlFor="ownerClientId" className="block text-sm font-medium text-gray-700 mb-1">
            Propriétaire
          </label>
          <Select
            value={formData.ownerClientId || 'none'}
            onValueChange={(value) => handleChange('ownerClientId', value === 'none' ? '' : value)}
            disabled={!!lease}
          >
            <SelectTrigger>
              <SelectValue placeholder="Sélectionner un propriétaire (optionnel)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Aucun</SelectItem>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.firstName} {client.lastName} {client.email ? `(${client.email})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
            Date de début <span className="text-red-500">*</span>
          </label>
          <Input
            id="startDate"
            type="date"
            value={formData.startDate}
            onChange={(e) => handleChange('startDate', e.target.value)}
            className={errors.startDate ? 'border-red-500' : ''}
            required
            disabled={!!lease}
          />
          {errors.startDate && <p className="mt-1 text-sm text-red-600">{errors.startDate}</p>}
        </div>

        <div>
          <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
            Date de fin
          </label>
          <Input
            id="endDate"
            type="date"
            value={formData.endDate}
            onChange={(e) => handleChange('endDate', e.target.value)}
            className={errors.endDate ? 'border-red-500' : ''}
          />
          {errors.endDate && <p className="mt-1 text-sm text-red-600">{errors.endDate}</p>}
        </div>

        <div>
          <label htmlFor="moveInDate" className="block text-sm font-medium text-gray-700 mb-1">
            Date d'emménagement
          </label>
          <Input
            id="moveInDate"
            type="date"
            value={formData.moveInDate}
            onChange={(e) => handleChange('moveInDate', e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="moveOutDate" className="block text-sm font-medium text-gray-700 mb-1">
            Date de déménagement
          </label>
          <Input
            id="moveOutDate"
            type="date"
            value={formData.moveOutDate}
            onChange={(e) => handleChange('moveOutDate', e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="billingFrequency" className="block text-sm font-medium text-gray-700 mb-1">
            Fréquence de facturation <span className="text-red-500">*</span>
          </label>
          <Select
            value={formData.billingFrequency}
            onValueChange={(value) => handleChange('billingFrequency', value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={RentalBillingFrequency.MONTHLY}>Mensuel</SelectItem>
              <SelectItem value={RentalBillingFrequency.QUARTERLY}>Trimestriel</SelectItem>
              <SelectItem value={RentalBillingFrequency.SEMIANNUAL}>Semestriel</SelectItem>
              <SelectItem value={RentalBillingFrequency.ANNUAL}>Annuel</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label htmlFor="dueDayOfMonth" className="block text-sm font-medium text-gray-700 mb-1">
            Jour d'échéance (1-31) <span className="text-red-500">*</span>
          </label>
          <Input
            id="dueDayOfMonth"
            type="number"
            min="1"
            max="31"
            value={formData.dueDayOfMonth}
            onChange={(e) => handleChange('dueDayOfMonth', parseInt(e.target.value) || 1)}
            className={errors.dueDayOfMonth ? 'border-red-500' : ''}
            required
          />
          {errors.dueDayOfMonth && (
            <p className="mt-1 text-sm text-red-600">{errors.dueDayOfMonth}</p>
          )}
        </div>

        <div>
          <label htmlFor="currency" className="block text-sm font-medium text-gray-700 mb-1">
            Devise
          </label>
          <Select value={formData.currency} onValueChange={(value) => handleChange('currency', value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="FCFA">FCFA</SelectItem>
              <SelectItem value="EUR">EUR</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label htmlFor="rentAmount" className="block text-sm font-medium text-gray-700 mb-1">
            Montant du loyer <span className="text-red-500">*</span>
          </label>
          <Input
            id="rentAmount"
            type="text"
            value={formatNumberWithSpaces(formData.rentAmount)}
            onChange={(e) => handleNumberChange('rentAmount', e.target.value)}
            className={errors.rentAmount ? 'border-red-500' : ''}
            required
            placeholder="Ex: 150 000"
            inputMode="numeric"
          />
          {errors.rentAmount && <p className="mt-1 text-sm text-red-600">{errors.rentAmount}</p>}
        </div>

        <div>
          <label htmlFor="serviceChargeAmount" className="block text-sm font-medium text-gray-700 mb-1">
            Charges de service
          </label>
          <Input
            id="serviceChargeAmount"
            type="text"
            value={formatNumberWithSpaces(formData.serviceChargeAmount)}
            onChange={(e) => handleNumberChange('serviceChargeAmount', e.target.value)}
            placeholder="Ex: 10 000"
            inputMode="numeric"
          />
        </div>

        <div>
          <label htmlFor="securityDepositAmount" className="block text-sm font-medium text-gray-700 mb-1">
            Dépôt de garantie
          </label>
          <Input
            id="securityDepositAmount"
            type="text"
            value={formatNumberWithSpaces(formData.securityDepositAmount)}
            onChange={(e) => handleNumberChange('securityDepositAmount', e.target.value)}
            placeholder="Ex: 500 000"
            inputMode="numeric"
          />
        </div>
      </div>

      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
          Notes
        </label>
        <textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => handleChange('notes', e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      <div className="flex justify-end gap-4">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting || loading}>
            Annuler
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting || loading}>
          {isSubmitting || loading ? 'Enregistrement...' : lease ? 'Mettre à jour' : 'Créer'}
        </Button>
      </div>
    </form>
  );
};

