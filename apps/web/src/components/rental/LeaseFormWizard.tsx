import React, { useState, useEffect } from 'react';
import { Form, Input, Select, Button, Row, Col, Alert, InputNumber, DatePicker, Space } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import {
  CreateLeaseRequest,
  UpdateLeaseRequest,
  RentalLease,
  RentalBillingFrequency
} from '../../services/rental-service';
import { listProperties, getProperty, Property } from '../../services/property-service';
import { PropertyType, PropertyTransactionMode, PropertyStatus } from '../../types/property-types';
import { listContacts, CrmContact } from '../../services/crm-service';
import { formatNumberWithSpaces, parseFormattedNumber } from '../../lib/utils';
import { StepRail } from '../primitives/StepRail';

const { TextArea } = Input;

interface LeaseFormWizardProps {
  lease?: RentalLease;
  tenantId: string;
  initialPropertyId?: string;
  onSubmit: (data: CreateLeaseRequest | UpdateLeaseRequest) => Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
}

export const LeaseFormWizard: React.FC<LeaseFormWizardProps> = ({
  lease,
  tenantId,
  initialPropertyId,
  onSubmit,
  onCancel,
  loading = false
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({
    propertyId: lease?.property_id || initialPropertyId || '',
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

  const [form] = Form.useForm();
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

  // Auto-fill rent amount and currency when property is selected
  useEffect(() => {
    if (!formData.propertyId || lease) return;
    const selectedProperty = properties.find(p => p.id === formData.propertyId);
    if (!selectedProperty) return;
    setFormData(prev => {
      const updates: Partial<typeof prev> = {};
      if (selectedProperty.price != null && selectedProperty.price > 0) {
        updates.rentAmount = String(selectedProperty.price);
      }
      if (selectedProperty.currency) {
        updates.currency = selectedProperty.currency;
      }
      return Object.keys(updates).length ? { ...prev, ...updates } : prev;
    });
  }, [formData.propertyId, properties, lease]);

  // Auto-select owner when property is selected
  useEffect(() => {
    console.log('[LeaseFormWizard] Auto-select owner effect triggered', {
      propertyId: formData.propertyId,
      hasLease: !!lease,
      propertiesCount: properties.length,
      clientsCount: clients.length
    });

    // Only auto-select if we're creating a new lease (not editing)
    if (lease || !formData.propertyId) {
      console.log('[LeaseFormWizard] Skipping auto-select:', {
        reason: lease ? 'editing existing lease' : 'no property selected'
      });
      return;
    }

    const autoSelectOwner = async () => {
      console.log('[LeaseFormWizard] Starting auto-select owner process', {
        propertyId: formData.propertyId
      });

      // Find the selected property in the list
      let selectedProperty = properties.find(p => p.id === formData.propertyId);
      console.log('[LeaseFormWizard] Property found in list:', {
        found: !!selectedProperty,
        hasOwner: !!selectedProperty?.owner,
        hasContainerParent: !!selectedProperty?.containerParent,
        ownerEmail: selectedProperty?.owner?.email,
        ownerId: selectedProperty?.owner?.id
      });

      // If the selected property is linked to an immeuble (building), get the immeuble's owner for display
      const parentImmeubleId = selectedProperty?.containerParent?.id;
      const isLinkedToImmeuble =
        parentImmeubleId && selectedProperty?.containerParent?.propertyType === PropertyType.IMMEUBLE;
      if (selectedProperty && isLinkedToImmeuble && parentImmeubleId) {
        try {
          const parentImmeuble = await getProperty(tenantId, parentImmeubleId);
          const immeubleOwner = parentImmeuble.owner ?? undefined;
          const effectiveOwner = selectedProperty.owner ?? immeubleOwner;
          if (effectiveOwner) {
            selectedProperty = { ...selectedProperty, owner: effectiveOwner };
            console.log('[LeaseFormWizard] Using immeuble owner for property linked to building:', {
              hasOwner: !!effectiveOwner,
              ownerEmail: effectiveOwner.email
            });
          }
        } catch (error) {
          console.error('[LeaseFormWizard] Error loading parent immeuble:', error);
        }
      }

      // If property still doesn't have owner info, load full property details
      if (selectedProperty && !selectedProperty.owner) {
        console.log('[LeaseFormWizard] Property owner not in list, loading full details...');
        try {
          const propertyDetails = await getProperty(tenantId, formData.propertyId);
          selectedProperty = propertyDetails;
          console.log('[LeaseFormWizard] Property details loaded:', {
            hasOwner: !!propertyDetails.owner,
            ownerEmail: propertyDetails.owner?.email,
            ownerId: propertyDetails.owner?.id
          });
        } catch (error) {
          console.error('[LeaseFormWizard] Error loading property details:', error);
          return;
        }
      }

      // If property has an owner with email, find matching contact
      const ownerEmail = selectedProperty?.owner?.email;
      console.log('[LeaseFormWizard] Checking owner email:', {
        ownerEmail,
        clientsAvailable: clients.length > 0
      });

      if (ownerEmail && clients.length > 0) {
        // Normalize email for comparison (lowercase, trim)
        const normalizedOwnerEmail = ownerEmail.toLowerCase().trim();
        console.log('[LeaseFormWizard] Searching for contact with email:', normalizedOwnerEmail);

        const normalizeAccents = (s: string) =>
          (s || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();

        // First, try exact email match (primary and secondary)
        let ownerContact = clients.find(client => {
          const primary = (client.email || '').toLowerCase().trim();
          const secondary = (client.emailSecondary || '').toLowerCase().trim();
          return primary === normalizedOwnerEmail || secondary === normalizedOwnerEmail;
        });

        // If no exact match, try same domain + same local part (handles casing/encoding edge cases)
        if (!ownerContact && normalizedOwnerEmail.includes('@')) {
          const [ownerLocal, ownerDomain] = normalizedOwnerEmail.split('@');
          ownerContact = clients.find(client => {
            const primary = (client.email || '').toLowerCase().trim();
            const secondary = (client.emailSecondary || '').toLowerCase().trim();
            for (const email of [primary, secondary]) {
              if (!email) continue;
              const [local, domain] = email.split('@');
              if (domain === ownerDomain && (local === ownerLocal || local?.toLowerCase() === ownerLocal)) {
                return true;
              }
            }
            return false;
          });
        }

        // If no exact match, try to find by owner name if available (with accent-insensitive match)
        if (!ownerContact && selectedProperty?.owner?.fullName) {
          const ownerFullName = selectedProperty.owner.fullName;
          const cleanedOwnerName = ownerFullName
            .replace(/\s*\([^)]*\)\s*/g, '')
            .toLowerCase()
            .trim();
          const normalizedOwnerName = normalizeAccents(cleanedOwnerName);

          console.log('[LeaseFormWizard] No exact email match, trying to find by owner name:', {
            original: ownerFullName,
            cleaned: cleanedOwnerName,
            normalized: normalizedOwnerName
          });

          ownerContact = clients.find(client => {
            const clientFullName = `${client.firstName || ''} ${client.lastName || ''}`.trim();
            const normalizedClientName = normalizeAccents(clientFullName);
            if (normalizedClientName === normalizedOwnerName) return true;
            const ownerParts = normalizedOwnerName.split(/\s+/).filter(p => p.length > 0);
            const clientParts = normalizedClientName.split(/\s+/).filter(p => p.length > 0);
            if (ownerParts.length >= 2 && clientParts.length >= 2) {
              const ownerFirst = ownerParts[0];
              const ownerLast = ownerParts[ownerParts.length - 1];
              const clientFirst = clientParts[0];
              const clientLast = clientParts[clientParts.length - 1];
              return (
                (ownerFirst === clientFirst && ownerLast === clientLast) ||
                (ownerFirst === clientLast && ownerLast === clientFirst)
              );
            }
            return false;
          });

          if (ownerContact) {
            console.log('[LeaseFormWizard] Found contact by name match:', {
              contactId: ownerContact.id,
              contactName: `${ownerContact.firstName} ${ownerContact.lastName}`,
              contactEmail: ownerContact.email,
              propertyOwnerEmail: ownerEmail
            });
          }
        }

        // If still no match, try by same domain + owner name parts in contact name/email
        if (!ownerContact && ownerEmail && selectedProperty?.owner?.fullName) {
          const emailDomain = normalizedOwnerEmail.split('@')[1];
          const ownerNameParts = normalizeAccents(selectedProperty.owner.fullName)
            .split(/\s+/)
            .filter(p => p.length > 1);
          ownerContact = clients.find(client => {
            const primary = (client.email || '').toLowerCase();
            const secondary = (client.emailSecondary || '').toLowerCase();
            const hasSameDomain = primary.includes(`@${emailDomain}`) || secondary.includes(`@${emailDomain}`);
            if (!hasSameDomain) return false;
            const clientName = normalizeAccents(`${client.firstName} ${client.lastName}`);
            return ownerNameParts.some(part => part.length > 1 && clientName.includes(part));
          });
          if (ownerContact) {
            console.log('[LeaseFormWizard] Found contact by same domain + name parts:', {
              contactId: ownerContact.id,
              contactEmail: ownerContact.email
            });
          }
        }

        if (ownerContact) {
          // Only auto-select if no owner is currently selected, or if the current owner doesn't match
          const currentOwnerContact = formData.ownerClientId
            ? clients.find(client => client.id === formData.ownerClientId)
            : null;

          console.log('[LeaseFormWizard] Current owner state:', {
            currentOwnerClientId: formData.ownerClientId,
            currentOwnerContact: currentOwnerContact
              ? {
                  id: currentOwnerContact.id,
                  email: currentOwnerContact.email
                }
              : null
          });

          // Auto-select if no owner selected, or if current owner email doesn't match property owner
          const normalizedCurrentEmail = currentOwnerContact?.email?.toLowerCase().trim();
          if (!currentOwnerContact || normalizedCurrentEmail !== normalizedOwnerEmail) {
            console.log('[LeaseFormWizard] ✅ Auto-selecting owner contact:', {
              contactId: ownerContact.id,
              contactName: `${ownerContact.firstName} ${ownerContact.lastName}`,
              contactEmail: ownerContact.email,
              propertyOwnerEmail: ownerEmail
            });
            setFormData(prev => ({ ...prev, ownerClientId: ownerContact.id }));
          } else {
            console.log('[LeaseFormWizard] Owner already matches, skipping auto-select');
          }
        } else {
          console.warn('[LeaseFormWizard] ❌ No matching contact found for owner:', {
            ownerEmail: normalizedOwnerEmail,
            ownerName: selectedProperty?.owner?.fullName,
            ownerId: selectedProperty?.owner?.id,
            totalClients: clients.length
          });
          console.log(
            '[LeaseFormWizard] Tip: Create a CRM contact with email:',
            normalizedOwnerEmail,
            'to enable auto-selection'
          );
        }
      } else {
        console.log('[LeaseFormWizard] Cannot auto-select owner:', {
          reason: !ownerEmail ? 'no owner email' : 'no clients loaded'
        });
      }
    };

    autoSelectOwner();
  }, [formData.propertyId, properties, clients, lease, tenantId]);

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
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear errors for this field
    if (stepErrors[currentStep]?.[field]) {
      setStepErrors(prev => {
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
          newErrors.dueDayOfMonth = "Le jour d'échéance doit être entre 1 et 31";
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

    setStepErrors(prev => ({ ...prev, [step]: newErrors }));
    return Object.keys(newErrors).length === 0;
  };

  const handleStepChange = (step: number) => {
    if (step > currentStep) {
      if (!validateStep(logicalStepFromDisplay(currentStep))) {
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
    // Validate all steps (skip financial and penalties steps when isSaleOnly)
    const stepsToValidate = isSaleOnly ? [0, 1, 4] : [0, 1, 2, 3, 4];
    let allValid = true;
    for (const logicalStep of stepsToValidate) {
      if (!validateStep(logicalStep)) {
        allValid = false;
        const displayIdx = displayStepFromLogical(logicalStep);
        if (displayIdx >= 0 && displayIdx < currentStep) {
          setCurrentStep(displayIdx);
          break;
        }
      }
    }

    if (!allValid) {
      return;
    }

    setIsSubmitting(true);
    setErrors({});
    try {
      const startDateIso = convertDateToISO(formData.startDate);
      if (!startDateIso) {
        setErrors({ submit: 'La date de début est requise' });
        return;
      }
      const submitData: CreateLeaseRequest | UpdateLeaseRequest = {
        ...(lease
          ? {}
          : {
              propertyId: formData.propertyId,
              // Send contact IDs - backend will auto-create TenantClient if needed
              primaryRenterContactId: formData.primaryRenterClientId,
              ownerContactId: formData.ownerClientId || undefined,
              startDate: startDateIso,
              endDate: convertDateToISO(formData.endDate),
              moveInDate: convertDateToISO(formData.moveInDate),
              moveOutDate: convertDateToISO(formData.moveOutDate),
              ...(isSaleOnly
                ? {
                    billingFrequency: RentalBillingFrequency.MONTHLY,
                    dueDayOfMonth: 1,
                    currency: formData.currency || 'FCFA',
                    rentAmount: 0,
                    serviceChargeAmount: 0,
                    securityDepositAmount: 0,
                    penaltyGraceDays: 0,
                    penaltyMode: 'PERCENT_OF_BALANCE',
                    penaltyRate: 0,
                    penaltyFixedAmount: 0
                  }
                : {
                    billingFrequency: formData.billingFrequency,
                    dueDayOfMonth: parseInt(formData.dueDayOfMonth.toString(), 10),
                    currency: formData.currency,
                    rentAmount: parseFloat(parseNumber(formData.rentAmount)),
                    serviceChargeAmount: parseFloat(parseNumber(formData.serviceChargeAmount)) || 0,
                    securityDepositAmount: parseFloat(parseNumber(formData.securityDepositAmount)) || 0,
                    penaltyGraceDays: parseInt(formData.penaltyGraceDays.toString(), 10) || 0,
                    penaltyMode: formData.penaltyMode,
                    penaltyRate: parseFloat(formData.penaltyRate.toString()) || 0,
                    penaltyFixedAmount: parseFloat(parseNumber(formData.penaltyFixedAmount)) || 0,
                    penaltyCapAmount: formData.penaltyCapAmount
                      ? parseFloat(parseNumber(formData.penaltyCapAmount))
                      : undefined
                  }),
              notes: formData.notes || undefined
            }),
        ...(lease
          ? {
              endDate: convertDateToISO(formData.endDate),
              moveInDate: convertDateToISO(formData.moveInDate),
              moveOutDate: convertDateToISO(formData.moveOutDate),
              rentAmount: parseFloat(parseNumber(formData.rentAmount)),
              serviceChargeAmount: parseFloat(parseNumber(formData.serviceChargeAmount)) || 0,
              billingFrequency: formData.billingFrequency,
              notes: formData.notes || undefined
            }
          : {})
      };

      await onSubmit(submitData);
    } catch (error: any) {
      const apiErrors: Record<string, string> = {};
      const errData = error.response?.data;
      if (errData?.errors && Array.isArray(errData.errors)) {
        errData.errors.forEach((err: { path?: string[]; field?: string; message: string }) => {
          const field = err.path?.[0] ?? err.field ?? 'submit';
          apiErrors[field] = err.message;
        });
      }
      const message = errData?.message || error.message || "Une erreur est survenue lors de l'enregistrement du bail";
      if (!apiErrors.submit) {
        apiErrors.submit = message;
      }
      setErrors(prev => ({ ...prev, ...apiErrors }));
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentStepErrors = stepErrors[currentStep] || {};

  // Skip "Informations financières" step when property has Type d'opération: Vente only
  const selectedProperty = properties.find(p => p.id === formData.propertyId);
  const modes = selectedProperty?.transactionModes ?? [];
  const isSaleOnly =
    modes.includes(PropertyTransactionMode.SALE) &&
    !modes.includes(PropertyTransactionMode.RENTAL) &&
    !modes.includes(PropertyTransactionMode.SHORT_TERM);

  // Step indices: when isSaleOnly, we skip step 2 (financial) and step 3 (penalties). Logical steps: 0=general, 1=parties, 2=financial, 3=penalties, 4=notes
  const stepIndices = isSaleOnly ? [0, 1, 4] : [0, 1, 2, 3, 4];
  const logicalStepFromDisplay = (displayIndex: number) => stepIndices[displayIndex];
  const displayStepFromLogical = (logicalIndex: number) => stepIndices.indexOf(logicalIndex);

  // Properties available for lease: only those in location (RENTAL or SHORT_TERM); exclude buildings with apartments; exclude Loué (RENTED) and Vendu (SOLD)
  const leaseableProperties = properties.filter(p => {
    const normalizedModes = (p.transactionModes ?? []).map(mode => String(mode).toUpperCase());
    const hasModeInfo = normalizedModes.length > 0;
    const hasRentalMode = normalizedModes.some(mode => ['RENTAL', 'SHORT_TERM', 'LOCATION', 'RENT'].includes(mode));

    // If modes are defined and none is rental-oriented, exclude.
    // If modes are missing (legacy data), keep property visible.
    if (hasModeInfo && !hasRentalMode) return false;

    if (p.propertyType === PropertyType.IMMEUBLE && (p._count?.containerChildren ?? 0) > 0) {
      return false;
    }

    if (p.status === PropertyStatus.SOLD || p.status === PropertyStatus.RENTED) {
      return !!lease && p.id === lease.property_id;
    }

    return true;
  });

  const getPropertyOptionLabel = (property: Property): string => {
    const ownerLabel = property.owner?.fullName?.trim() || '';
    const title = property.title?.trim() || property.internalReference || 'Sans libellé';
    const buildingPart = property.containerParent?.title ? ` ( ${property.containerParent.title} )` : '';
    const titleWithBuilding = title + buildingPart;
    if (ownerLabel) return `${ownerLabel} - ${titleWithBuilding}`;
    return titleWithBuilding;
  };

  // Step 1: Informations générales
  const step1Component = (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {errors.submit && (
        <Alert
          message="Erreur"
          description={errors.submit}
          type="error"
          showIcon
          closable
          onClose={() => setErrors(prev => ({ ...prev, submit: '' }))}
        />
      )}
      <Row gutter={16}>
        <Col xs={24}>
          <Form.Item
            label="Propriété"
            required
            validateStatus={currentStepErrors.propertyId ? 'error' : ''}
            help={currentStepErrors.propertyId}
          >
            <Select
              value={formData.propertyId}
              onChange={value => handleChange('propertyId', value)}
              disabled={!!lease || loadingData}
              placeholder="Sélectionner une propriété"
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
      </Row>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item
            label="Date de début"
            required
            validateStatus={currentStepErrors.startDate ? 'error' : ''}
            help={currentStepErrors.startDate}
          >
            <DatePicker
              value={formData.startDate ? dayjs(formData.startDate) : null}
              onChange={date => handleChange('startDate', date ? date.format('YYYY-MM-DD') : '')}
              disabled={!!lease}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Col>

        <Col xs={24} md={12}>
          <Form.Item
            label="Date de fin"
            validateStatus={currentStepErrors.endDate ? 'error' : ''}
            help={currentStepErrors.endDate}
          >
            <DatePicker
              value={formData.endDate ? dayjs(formData.endDate) : null}
              onChange={date => handleChange('endDate', date ? date.format('YYYY-MM-DD') : '')}
              disabledDate={current => (formData.startDate ? current && current < dayjs(formData.startDate) : false)}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item label="Date d'emménagement">
            <DatePicker
              value={formData.moveInDate ? dayjs(formData.moveInDate) : null}
              onChange={date => handleChange('moveInDate', date ? date.format('YYYY-MM-DD') : '')}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Col>

        <Col xs={24} md={12}>
          <Form.Item label="Date de déménagement">
            <DatePicker
              value={formData.moveOutDate ? dayjs(formData.moveOutDate) : null}
              onChange={date => handleChange('moveOutDate', date ? date.format('YYYY-MM-DD') : '')}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Col>
      </Row>
    </Space>
  );

  // Step 2: Parties impliquées
  const step2Component = (
    <Row gutter={16}>
      <Col xs={24} md={12}>
        <Form.Item
          label="Locataire principal"
          required
          validateStatus={currentStepErrors.primaryRenterClientId ? 'error' : ''}
          help={currentStepErrors.primaryRenterClientId}
        >
          <Select
            value={formData.primaryRenterClientId}
            onChange={value => handleChange('primaryRenterClientId', value)}
            disabled={!!lease || loadingData}
            placeholder="Sélectionner un locataire"
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
        <Form.Item label="Propriétaire">
          <Select
            value={formData.ownerClientId || undefined}
            onChange={value => handleChange('ownerClientId', value || '')}
            disabled={!!lease || loadingData}
            placeholder="Sélectionner un propriétaire (optionnel)"
            allowClear
          >
            {clients.map(client => (
              <Select.Option key={client.id} value={client.id}>
                {client.firstName} {client.lastName} {client.email ? `(${client.email})` : ''}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
      </Col>
    </Row>
  );

  // Step 3: Informations financières
  const step3Component = (
    <Row gutter={16}>
      <Col xs={24} md={12}>
        <Form.Item label="Devise">
          <Select value={formData.currency} onChange={value => handleChange('currency', value)}>
            <Select.Option value="FCFA">FCFA</Select.Option>
            <Select.Option value="EUR">EUR</Select.Option>
            <Select.Option value="USD">USD</Select.Option>
          </Select>
        </Form.Item>
      </Col>

      <Col xs={24} md={12}>
        <Form.Item label="Fréquence de facturation" required>
          <Select value={formData.billingFrequency} onChange={value => handleChange('billingFrequency', value)}>
            <Select.Option value={RentalBillingFrequency.MONTHLY}>Mensuel</Select.Option>
            <Select.Option value={RentalBillingFrequency.QUARTERLY}>Trimestriel</Select.Option>
            <Select.Option value={RentalBillingFrequency.SEMIANNUAL}>Semestriel</Select.Option>
            <Select.Option value={RentalBillingFrequency.ANNUAL}>Annuel</Select.Option>
          </Select>
        </Form.Item>
      </Col>

      <Col xs={24} md={12}>
        <Form.Item
          label="Jour d'échéance (1-31)"
          required
          validateStatus={currentStepErrors.dueDayOfMonth ? 'error' : ''}
          help={currentStepErrors.dueDayOfMonth}
        >
          <InputNumber
            min={1}
            max={31}
            value={formData.dueDayOfMonth}
            onChange={value => handleChange('dueDayOfMonth', value || 1)}
            style={{ width: '100%' }}
          />
        </Form.Item>
      </Col>

      <Col xs={24} md={12}>
        <Form.Item
          label="Montant du loyer"
          required
          validateStatus={currentStepErrors.rentAmount ? 'error' : ''}
          help={currentStepErrors.rentAmount}
        >
          <InputNumber
            value={formData.rentAmount ? parseFloat(parseNumber(formData.rentAmount)) : undefined}
            onChange={value => handleChange('rentAmount', value?.toString() || '')}
            formatter={value => formatNumberWithSpaces(value?.toString() || '')}
            parser={value => parseFloat(parseFormattedNumber(value || '')) || 0}
            placeholder="Ex: 150 000"
            style={{ width: '100%' }}
            step={1000}
          />
        </Form.Item>
      </Col>

      <Col xs={24} md={12}>
        <Form.Item label="Charges de service">
          <InputNumber
            value={formData.serviceChargeAmount ? parseFloat(parseNumber(formData.serviceChargeAmount)) : undefined}
            onChange={value => handleChange('serviceChargeAmount', value?.toString() || '0')}
            formatter={value => formatNumberWithSpaces(value?.toString() || '')}
            parser={value => parseFloat(parseFormattedNumber(value || '')) || 0}
            placeholder="Ex: 10 000"
            style={{ width: '100%' }}
            step={1000}
          />
        </Form.Item>
      </Col>

      <Col xs={24} md={12}>
        <Form.Item label="Dépôt de garantie">
          <InputNumber
            value={formData.securityDepositAmount ? parseFloat(parseNumber(formData.securityDepositAmount)) : undefined}
            onChange={value => handleChange('securityDepositAmount', value?.toString() || '0')}
            formatter={value => formatNumberWithSpaces(value?.toString() || '')}
            parser={value => parseFloat(parseFormattedNumber(value || '')) || 0}
            placeholder="Ex: 500 000"
            style={{ width: '100%' }}
            step={1000}
          />
        </Form.Item>
      </Col>
    </Row>
  );

  // Step 4: Pénalités
  const step4Component = (
    <Row gutter={16}>
      <Col xs={24} md={12}>
        <Form.Item label="Jours de grâce pour pénalités" help="Nombre de jours avant l'application des pénalités">
          <InputNumber
            min={0}
            value={parseInt(formData.penaltyGraceDays) || 0}
            onChange={value => handleChange('penaltyGraceDays', value?.toString() || '0')}
            style={{ width: '100%' }}
          />
        </Form.Item>
      </Col>

      <Col xs={24} md={12}>
        <Form.Item label="Mode de pénalité">
          <Select value={formData.penaltyMode} onChange={value => handleChange('penaltyMode', value)}>
            <Select.Option value="PERCENT_OF_BALANCE">Pourcentage du solde</Select.Option>
            <Select.Option value="FIXED_AMOUNT">Montant fixe</Select.Option>
          </Select>
        </Form.Item>
      </Col>

      {formData.penaltyMode === 'PERCENT_OF_BALANCE' && (
        <>
          <Col xs={24} md={12}>
            <Form.Item label="Taux de pénalité (%)">
              <InputNumber
                min={0}
                step={0.01}
                value={parseFloat(formData.penaltyRate) || 0}
                onChange={value => handleChange('penaltyRate', value?.toString() || '0')}
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Col>

          <Col xs={24} md={12}>
            <Form.Item label="Montant maximum de pénalité (optionnel)">
              <InputNumber
                value={formData.penaltyCapAmount ? parseFloat(parseNumber(formData.penaltyCapAmount)) : undefined}
                onChange={value => handleChange('penaltyCapAmount', value?.toString() || '')}
                formatter={value => formatNumberWithSpaces(value?.toString() || '')}
                parser={value => parseFloat(parseFormattedNumber(value || '')) || 0}
                placeholder="Ex: 50 000"
                style={{ width: '100%' }}
                step={1000}
              />
            </Form.Item>
          </Col>
        </>
      )}

      {formData.penaltyMode === 'FIXED_AMOUNT' && (
        <Col xs={24} md={12}>
          <Form.Item label="Montant fixe de pénalité">
            <InputNumber
              value={formData.penaltyFixedAmount ? parseFloat(parseNumber(formData.penaltyFixedAmount)) : undefined}
              onChange={value => handleChange('penaltyFixedAmount', value?.toString() || '0')}
              formatter={value => formatNumberWithSpaces(value?.toString() || '')}
              parser={value => parseFloat(parseFormattedNumber(value || '')) || 0}
              placeholder="Ex: 5 000"
              style={{ width: '100%' }}
              step={1000}
            />
          </Form.Item>
        </Col>
      )}
    </Row>
  );

  // Step 5: Notes
  const step5Component = (
    <Form.Item label="Notes">
      <TextArea
        value={formData.notes}
        onChange={e => handleChange('notes', e.target.value)}
        rows={6}
        placeholder="Ajoutez des notes ou commentaires concernant ce bail..."
      />
    </Form.Item>
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

  /**
   * Le rail ne porte que le titre : la description de chaque etape est deja
   * repetee dans le panneau qu'elle coiffe. `shortTitle` sert au repli sous
   * 1 200 px, ou la colonne d'une etape tombe sous 120 px.
   */
  const stepItems: { title: string; shortTitle: string; invalid?: boolean }[] = [
    {
      title: 'Informations générales',
      shortTitle: 'Général',
      invalid: !getStepValidity(stepIndices[0])
    },
    {
      title: 'Parties impliquées',
      shortTitle: 'Parties',
      invalid: !getStepValidity(stepIndices[1])
    },
    ...(isSaleOnly
      ? []
      : [
          {
            title: 'Informations financières',
            shortTitle: 'Finances',
            invalid: !getStepValidity(stepIndices[2])
          }
        ]),
    ...(isSaleOnly ? [] : [{ title: 'Pénalités', shortTitle: 'Pénalités' }]),
    { title: 'Notes', shortTitle: 'Notes' }
  ];

  const stepComponents = [step1Component, step2Component, step3Component, step4Component, step5Component];

  const currentLogicalStep = logicalStepFromDisplay(currentStep);
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === stepItems.length - 1;

  return (
    <Form form={form} layout="vertical">
      {onCancel && (
        <div style={{ marginBottom: 16, textAlign: 'right' }}>
          <Button onClick={onCancel} disabled={isSubmitting || loading}>
            Annuler
          </Button>
        </div>
      )}

      {/* `Steps` horizontal repartissait la largeur entre le titre ET la
          description des cinq etapes : sous 992 px chaque colonne tombait sous
          70 px et « Informations financières » se cassait au milieu d'un mot.
          `<StepRail>` est le remplacant prevu au-dela de quatre etapes — il
          rend une barre de progression sous ce palier. */}
      <div style={{ marginBottom: 32 }}>
        <StepRail
          items={stepItems.map(step => ({ title: step.title, shortTitle: step.shortTitle }))}
          current={currentStep}
          // Ouvert de bout en bout, comme l'ancien `Steps` : c'est
          // `handleStepChange` qui refuse d'avancer sur une etape invalide,
          // pas le rail.
          furthest={stepItems.length - 1}
          onChange={handleStepChange}
          invalid={stepItems.map((step, index) => (step.invalid ? index : -1)).filter(index => index >= 0)}
        />
      </div>

      <div style={{ minHeight: 400, marginBottom: 24 }}>{stepComponents[currentLogicalStep]}</div>

      <div className="it-toolbar">
        <Button disabled={isFirstStep || isSubmitting || loading} onClick={() => handleStepChange(currentStep - 1)}>
          Précédent
        </Button>
        {isLastStep ? (
          <Button type="primary" loading={isSubmitting || loading} onClick={handleFinish}>
            Créer le bail
          </Button>
        ) : (
          <Button
            type="primary"
            disabled={!getStepValidity(currentStep) || isSubmitting || loading}
            onClick={() => handleStepChange(currentStep + 1)}
          >
            Suivant
          </Button>
        )}
      </div>
    </Form>
  );
};
