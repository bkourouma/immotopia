import React, { useState, useEffect } from 'react';
import { Wizard, WizardStep } from '../ui/wizard';
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
import { Button } from '../ui/button';

interface LeaseFormWizardProps {
  lease?: RentalLease;
  tenantId: string;
  onSubmit: (data: CreateLeaseRequest | UpdateLeaseRequest) => Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
}

export const LeaseFormWizard: React.FC<LeaseFormWizardProps> = ({
  lease,
  tenantId,
  onSubmit,
  onCancel,
  loading = false,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
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
  const [stepErrors, setStepErrors] = useState<Record<number, Record<string, string>>>({});

  useEffect(() => {
    loadProperties();
    loadClients();
  }, [tenantId]);

  // Helper functions for number formatting
  const formatNumber = (value: string | number | undefined): string => {
    if (!value) return '';
    const numStr = value.toString().replace(/\s/g, '');
    if (numStr === '') return '';
    const num = parseFloat(numStr);
    if (isNaN(num)) return '';
    return num.toLocaleString('fr-FR', { useGrouping: true, maximumFractionDigits: 0 });
  };

  const parseNumber = (value: string): string => {
    return value.replace(/\s/g, '');
  };

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
        // For now, show all contacts (TODO: filter by roles when roles are properly set)
        const clientContacts = response.contacts;
        setClients(clientContacts);
      }
    } catch (error) {
      console.error('Error loading clients:', error);
    } finally {
      setLoadingData(false);
    }
  };

  const handleChange = (field: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear errors for this field
    if (stepErrors[currentStep]?.[field]) {
      setStepErrors((prev) => {
        const newStepErrors = { ...prev };
        if (newStepErrors[currentStep]) {
          delete newStepErrors[currentStep][field];
        }
        return newStepErrors;
      });
    }
  };

  const handleNumberChange = (field: string, value: string) => {
    const cleaned = parseNumber(value);
    handleChange(field, cleaned);
  };

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};

    switch (step) {
      case 0: // Informations générales
        if (!formData.leaseNumber.trim() && !lease) {
          newErrors.leaseNumber = 'Le numéro de bail est requis';
        }
        if (!formData.propertyId) {
          newErrors.propertyId = 'La propriété est requise';
        }
        if (!formData.startDate) {
          newErrors.startDate = 'La date de début est requise';
        }
        if (formData.endDate && formData.endDate <= formData.startDate) {
          newErrors.endDate = 'La date de fin doit être après la date de début';
        }
        break;

      case 1: // Parties impliquées
        if (!formData.primaryRenterClientId) {
          newErrors.primaryRenterClientId = 'Le locataire principal est requis';
        }
        break;

      case 2: // Informations financières
        if (formData.dueDayOfMonth < 1 || formData.dueDayOfMonth > 31) {
          newErrors.dueDayOfMonth = 'Le jour d\'échéance doit être entre 1 et 31';
        }
        const rentAmountNum = parseFloat(parseNumber(formData.rentAmount));
        if (!formData.rentAmount || isNaN(rentAmountNum) || rentAmountNum <= 0) {
          newErrors.rentAmount = 'Le montant du loyer doit être supérieur à 0';
        }
        break;

      case 3: // Pénalités
        // Optional step - no required validation
        break;

      case 4: // Notes
        // Optional step - no required validation
        break;
    }

    setStepErrors((prev) => ({ ...prev, [step]: newErrors }));
    return Object.keys(newErrors).length === 0;
  };

  const handleStepChange = (step: number) => {
    if (step > currentStep) {
      if (!validateStep(currentStep)) {
        return;
      }
    }
    setCurrentStep(step);
  };

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

  const handleFinish = async () => {
    // Validate all steps
    let allValid = true;
    for (let i = 0; i < 5; i++) {
      if (!validateStep(i)) {
        allValid = false;
        if (i < currentStep) {
          setCurrentStep(i);
          break;
        }
      }
    }

    if (!allValid) {
      return;
    }

    setIsSubmitting(true);
    try {
      const submitData: CreateLeaseRequest | UpdateLeaseRequest = {
        ...(lease ? {} : { leaseNumber: formData.leaseNumber }),
        ...(lease
          ? {}
          : {
              propertyId: formData.propertyId,
              // Send contact IDs - backend will auto-create TenantClient if needed
              primaryRenterContactId: formData.primaryRenterClientId,
              ownerContactId: formData.ownerClientId || undefined,
              startDate: convertDateToISO(formData.startDate)!,
              endDate: convertDateToISO(formData.endDate),
              moveInDate: convertDateToISO(formData.moveInDate),
              moveOutDate: convertDateToISO(formData.moveOutDate),
              billingFrequency: formData.billingFrequency,
              dueDayOfMonth: parseInt(formData.dueDayOfMonth.toString()),
              currency: formData.currency,
              rentAmount: parseFloat(parseNumber(formData.rentAmount)),
              serviceChargeAmount: parseFloat(parseNumber(formData.serviceChargeAmount)) || 0,
              securityDepositAmount: parseFloat(parseNumber(formData.securityDepositAmount)) || 0,
              penaltyGraceDays: parseInt(formData.penaltyGraceDays) || 0,
              penaltyMode: formData.penaltyMode,
              penaltyRate: parseFloat(formData.penaltyRate) || 0,
              penaltyFixedAmount: parseFloat(parseNumber(formData.penaltyFixedAmount)) || 0,
              penaltyCapAmount: formData.penaltyCapAmount ? parseFloat(parseNumber(formData.penaltyCapAmount)) : undefined,
              notes: formData.notes || undefined,
            }),
        ...(lease
          ? {
              endDate: convertDateToISO(formData.endDate),
              moveInDate: convertDateToISO(formData.moveInDate),
              moveOutDate: convertDateToISO(formData.moveOutDate),
              rentAmount: parseFloat(parseNumber(formData.rentAmount)),
              serviceChargeAmount: parseFloat(parseNumber(formData.serviceChargeAmount)) || 0,
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
      setIsSubmitting(false);
    }
  };

  const currentStepErrors = stepErrors[currentStep] || {};

  // Step 1: Informations générales
  const step1Component = (
    <div className="space-y-4">
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
              className={currentStepErrors.leaseNumber ? 'border-red-500' : ''}
              required
            />
            {currentStepErrors.leaseNumber && (
              <p className="mt-1 text-sm text-red-600">{currentStepErrors.leaseNumber}</p>
            )}
          </div>
        )}

        <div>
          <label htmlFor="propertyId" className="block text-sm font-medium text-gray-700 mb-1">
            Propriété <span className="text-red-500">*</span>
          </label>
          <Select
            value={formData.propertyId}
            onValueChange={(value) => handleChange('propertyId', value)}
            disabled={!!lease || loadingData}
          >
            <SelectTrigger className={currentStepErrors.propertyId ? 'border-red-500' : ''}>
              <SelectValue placeholder="Sélectionner une propriété" />
            </SelectTrigger>
            <SelectContent>
              {properties.map((property) => (
                <SelectItem key={property.id} value={property.id}>
                  {property.internalReference} - {property.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {currentStepErrors.propertyId && (
            <p className="mt-1 text-sm text-red-600">{currentStepErrors.propertyId}</p>
          )}
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
            className={currentStepErrors.startDate ? 'border-red-500' : ''}
            required
            disabled={!!lease}
          />
          {currentStepErrors.startDate && (
            <p className="mt-1 text-sm text-red-600">{currentStepErrors.startDate}</p>
          )}
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
            className={currentStepErrors.endDate ? 'border-red-500' : ''}
            min={formData.startDate}
          />
          {currentStepErrors.endDate && (
            <p className="mt-1 text-sm text-red-600">{currentStepErrors.endDate}</p>
          )}
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
      </div>
    </div>
  );

  // Step 2: Parties impliquées
  const step2Component = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="primaryRenterClientId" className="block text-sm font-medium text-gray-700 mb-1">
            Locataire principal <span className="text-red-500">*</span>
          </label>
          <Select
            value={formData.primaryRenterClientId}
            onValueChange={(value) => handleChange('primaryRenterClientId', value)}
            disabled={!!lease || loadingData}
          >
            <SelectTrigger className={currentStepErrors.primaryRenterClientId ? 'border-red-500' : ''}>
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
          {currentStepErrors.primaryRenterClientId && (
            <p className="mt-1 text-sm text-red-600">{currentStepErrors.primaryRenterClientId}</p>
          )}
        </div>

        <div>
          <label htmlFor="ownerClientId" className="block text-sm font-medium text-gray-700 mb-1">
            Propriétaire
          </label>
          <Select
            value={formData.ownerClientId || 'none'}
            onValueChange={(value) => handleChange('ownerClientId', value === 'none' ? '' : value)}
            disabled={!!lease || loadingData}
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
      </div>
    </div>
  );

  // Step 3: Informations financières
  const step3Component = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            className={currentStepErrors.dueDayOfMonth ? 'border-red-500' : ''}
            required
          />
          {currentStepErrors.dueDayOfMonth && (
            <p className="mt-1 text-sm text-red-600">{currentStepErrors.dueDayOfMonth}</p>
          )}
        </div>

        <div>
          <label htmlFor="rentAmount" className="block text-sm font-medium text-gray-700 mb-1">
            Montant du loyer <span className="text-red-500">*</span>
          </label>
          <Input
            id="rentAmount"
            type="text"
            value={formatNumber(formData.rentAmount)}
            onChange={(e) => handleNumberChange('rentAmount', e.target.value)}
            placeholder="Ex: 150 000"
            className={currentStepErrors.rentAmount ? 'border-red-500' : ''}
            required
          />
          {currentStepErrors.rentAmount && (
            <p className="mt-1 text-sm text-red-600">{currentStepErrors.rentAmount}</p>
          )}
        </div>

        <div>
          <label htmlFor="serviceChargeAmount" className="block text-sm font-medium text-gray-700 mb-1">
            Charges de service
          </label>
          <Input
            id="serviceChargeAmount"
            type="text"
            value={formatNumber(formData.serviceChargeAmount)}
            onChange={(e) => handleNumberChange('serviceChargeAmount', e.target.value)}
            placeholder="Ex: 10 000"
          />
        </div>

        <div>
          <label htmlFor="securityDepositAmount" className="block text-sm font-medium text-gray-700 mb-1">
            Dépôt de garantie
          </label>
          <Input
            id="securityDepositAmount"
            type="text"
            value={formatNumber(formData.securityDepositAmount)}
            onChange={(e) => handleNumberChange('securityDepositAmount', e.target.value)}
            placeholder="Ex: 500 000"
          />
        </div>
      </div>
    </div>
  );

  // Step 4: Pénalités
  const step4Component = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="penaltyGraceDays" className="block text-sm font-medium text-gray-700 mb-1">
            Jours de grâce pour pénalités
          </label>
          <Input
            id="penaltyGraceDays"
            type="number"
            min="0"
            value={formData.penaltyGraceDays}
            onChange={(e) => handleChange('penaltyGraceDays', e.target.value)}
          />
          <p className="mt-1 text-xs text-gray-500">Nombre de jours avant l'application des pénalités</p>
        </div>

        <div>
          <label htmlFor="penaltyMode" className="block text-sm font-medium text-gray-700 mb-1">
            Mode de pénalité
          </label>
          <Select value={formData.penaltyMode} onValueChange={(value) => handleChange('penaltyMode', value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PERCENT_OF_BALANCE">Pourcentage du solde</SelectItem>
              <SelectItem value="FIXED_AMOUNT">Montant fixe</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {formData.penaltyMode === 'PERCENT_OF_BALANCE' && (
          <>
            <div>
              <label htmlFor="penaltyRate" className="block text-sm font-medium text-gray-700 mb-1">
                Taux de pénalité (%)
              </label>
              <Input
                id="penaltyRate"
                type="number"
                step="0.01"
                min="0"
                value={formData.penaltyRate}
                onChange={(e) => handleChange('penaltyRate', e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="penaltyCapAmount" className="block text-sm font-medium text-gray-700 mb-1">
                Montant maximum de pénalité (optionnel)
              </label>
              <Input
                id="penaltyCapAmount"
                type="text"
                value={formatNumber(formData.penaltyCapAmount)}
                onChange={(e) => handleNumberChange('penaltyCapAmount', e.target.value)}
                placeholder="Ex: 50 000"
              />
            </div>
          </>
        )}

        {formData.penaltyMode === 'FIXED_AMOUNT' && (
          <div>
            <label htmlFor="penaltyFixedAmount" className="block text-sm font-medium text-gray-700 mb-1">
              Montant fixe de pénalité
            </label>
            <Input
              id="penaltyFixedAmount"
              type="text"
              value={formatNumber(formData.penaltyFixedAmount)}
              onChange={(e) => handleNumberChange('penaltyFixedAmount', e.target.value)}
              placeholder="Ex: 5 000"
            />
          </div>
        )}
      </div>
    </div>
  );

  // Step 5: Notes
  const step5Component = (
    <div className="space-y-4">
      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
          Notes
        </label>
        <textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => handleChange('notes', e.target.value)}
          rows={6}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="Ajoutez des notes ou commentaires concernant ce bail..."
        />
      </div>
    </div>
  );

  // Check if a step is valid based on form data and errors
  const getStepValidity = (stepIndex: number): boolean => {
    // If there are errors for this step, it's invalid
    const stepErrs = stepErrors[stepIndex] || {};
    if (Object.keys(stepErrs).length > 0) {
      return false;
    }

    // Otherwise, validate the step data
    return validateStepData(stepIndex);
  };

  // Validate step data without setting errors (for isValid check)
  const validateStepData = (step: number): boolean => {
    switch (step) {
      case 0: // Informations générales
        if (!lease && !formData.leaseNumber.trim()) return false;
        if (!formData.propertyId) return false;
        if (!formData.startDate) return false;
        if (formData.endDate && formData.endDate <= formData.startDate) return false;
        return true;

      case 1: // Parties impliquées
        return !!formData.primaryRenterClientId;

      case 2: // Informations financières
        if (formData.dueDayOfMonth < 1 || formData.dueDayOfMonth > 31) return false;
        const rentAmountNum2 = parseFloat(parseNumber(formData.rentAmount));
        if (!formData.rentAmount || isNaN(rentAmountNum2) || rentAmountNum2 <= 0) return false;
        return true;

      case 3: // Pénalités (optional)
        return true;

      case 4: // Notes (optional)
        return true;

      default:
        return true;
    }
  };

  const steps: WizardStep[] = [
    {
      id: 'general',
      title: 'Informations générales',
      description: 'Numéro, propriété et dates du bail',
      component: step1Component,
      isValid: getStepValidity(0),
    },
    {
      id: 'parties',
      title: 'Parties impliquées',
      description: 'Locataire principal et propriétaire',
      component: step2Component,
      isValid: getStepValidity(1),
    },
    {
      id: 'financial',
      title: 'Informations financières',
      description: 'Montants, devise et fréquence de facturation',
      component: step3Component,
      isValid: getStepValidity(2),
    },
    {
      id: 'penalties',
      title: 'Pénalités',
      description: 'Configuration des pénalités de retard',
      component: step4Component,
      isValid: true,
      isOptional: true,
    },
    {
      id: 'notes',
      title: 'Notes',
      description: 'Informations complémentaires',
      component: step5Component,
      isValid: true,
      isOptional: true,
    },
  ];

  return (
    <div>
      {onCancel && (
        <div className="mb-4 flex justify-end">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting || loading}>
            Annuler
          </Button>
        </div>
      )}
      <Wizard
        steps={steps}
        currentStep={currentStep}
        onStepChange={handleStepChange}
        onFinish={handleFinish}
        isLoading={isSubmitting || loading}
        canSaveDraft={false}
      />
    </div>
  );
};

