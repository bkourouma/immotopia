import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Wizard, WizardStep } from '../ui/wizard';
import { PropertyTypeSelector } from './PropertyTypeSelector';
import { LocationSelector } from '../ui/location-selector';
import { Input } from '../ui/input';
import { PropertyMediaUpload } from './PropertyMediaUpload';
import { PropertyMediaGallery } from './PropertyMediaGallery';
import { Loader2 } from 'lucide-react';
import {
  CreatePropertyRequest,
  UpdatePropertyRequest,
  Property,
  PropertyTypeTemplate,
  PropertyType,
  PropertyOwnershipType,
  PropertyTransactionMode,
  PropertyFurnishingStatus,
  PropertyAvailability,
  PropertyStatus,
  PropertyMediaType,
} from '../../types/property-types';
import { getTemplate, createProperty, updateProperty } from '../../services/property-service';
import { GeographicLocation } from '../../services/geographic-service';
import { useAuth } from '../../hooks/useAuth';
import { listContacts, CrmContact } from '../../services/crm-service';
import apiClient from '../../utils/api-client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

interface PropertyFormWizardProps {
  property?: Property;
  tenantId: string;
  onComplete?: (propertyId: string) => void;
  onCancel?: () => void;
}

export const PropertyFormWizard: React.FC<PropertyFormWizardProps> = ({
  property,
  tenantId,
  onComplete,
  onCancel,
}) => {
  const { tenantMembership } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [savedPropertyId, setSavedPropertyId] = useState<string | null>(property?.id || null);
  const [isLoading, setIsLoading] = useState(false);
  const [template, setTemplate] = useState<PropertyTypeTemplate | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  
  // Ref to track if auto-save has been attempted to prevent infinite loops
  const autoSaveAttemptedRef = useRef(false);
  
  // State to force refresh of media gallery after upload
  const [mediaRefreshKey, setMediaRefreshKey] = useState(0);
  
  // State for owners (using CrmContact like LeaseForm)
  const [owners, setOwners] = useState<Array<CrmContact & { userId?: string }>>([]);
  const [loadingOwners, setLoadingOwners] = useState(false);

  // Form data state
  const [formData, setFormData] = useState({
    // Step 1: Type & Identification
    propertyType: property?.propertyType || ('' as PropertyType),
    ownershipType: property?.ownershipType || PropertyOwnershipType.TENANT,
    ownerUserId: property?.ownerUserId || '',
    title: property?.title || '',
    description: property?.description || '',
    status: property?.status || PropertyStatus.DRAFT,
    availability: property?.availability || PropertyAvailability.AVAILABLE,
    availabilityDate: '',

    // Step 2: Localisation
    location: null as GeographicLocation | null,
    locationZone: property?.locationZone || '',
    address: property?.address || '',
    latitude: property?.latitude?.toString() || '',
    longitude: property?.longitude?.toString() || '',
    pointsOfInterest: '',

    // Step 3: Caractéristiques générales
    surfaceArea: property?.surfaceArea?.toString() || '',
    surfaceUseful: property?.surfaceUseful?.toString() || '',
    constructionYear: '',
    generalCondition: '',
    standing: '',

    // Step 4: Prix & Conditions
    transactionModes: property?.transactionModes || [PropertyTransactionMode.SALE],
    price: property?.price?.toString() || '',
    fees: property?.fees?.toString() || '',
    currency: property?.currency || 'CFA',
    deposit: '',
    commissionMode: '',
    commissionAmount: '',

    // Step 5: Caractéristiques physiques
    rooms: property?.rooms?.toString() || '',
    bedrooms: property?.bedrooms?.toString() || '',
    bathrooms: property?.bathrooms?.toString() || '',
    surfaceTerrain: property?.surfaceTerrain?.toString() || '',
    furnishingStatus: property?.furnishingStatus || PropertyFurnishingStatus.UNFURNISHED,

    // Step 6: Type-specific data
    typeSpecificData: property?.typeSpecificData || {},
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load owners on mount
  useEffect(() => {
    loadOwners();
  }, [tenantId]);

  // Load template when type is selected
  useEffect(() => {
    if (formData.propertyType && !property) {
      loadTemplate(formData.propertyType);
    } else if (property?.propertyType) {
      loadTemplate(property.propertyType);
    }
  }, [formData.propertyType, property]);

  const loadOwners = async () => {
    setLoadingOwners(true);
    try {
      // Use listContacts like LeaseForm to get all contacts with roles
      const response = await listContacts(tenantId, { limit: 1000 });
      if (response.success) {
        // Filter contacts that have client roles (like LeaseForm does)
        const clientContacts = response.contacts.filter(
          (contact) => contact.roles && contact.roles.length > 0 && contact.roles.some((r) => r.active)
        );
        
        // Store contacts - we'll send the email to backend which will find/create User
        setOwners(clientContacts);
      }
    } catch (error) {
      console.error('Error loading owners:', error);
    } finally {
      setLoadingOwners(false);
    }
  };

  const loadTemplate = async (type: PropertyType) => {
    setLoadingTemplate(true);
    try {
      const loadedTemplate = await getTemplate(type);
      setTemplate(loadedTemplate);
    } catch (error) {
      console.error('Error loading template:', error);
    } finally {
      setLoadingTemplate(false);
    }
  };

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

  const handleChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleNumberChange = (field: string, value: string) => {
    const cleaned = parseNumber(value);
    handleChange(field, cleaned);
  };

  // Save as draft
  const handleSaveDraft = async () => {
    setIsLoading(true);
    try {
      const submitData: CreatePropertyRequest | UpdatePropertyRequest = {
        ...(property ? {} : { propertyType: formData.propertyType, ownershipType: formData.ownershipType }),
        ownerUserId: formData.ownerUserId && !formData.ownerUserId.includes('@') ? formData.ownerUserId : undefined,
        ownerEmail: formData.ownerUserId && formData.ownerUserId.includes('@') ? formData.ownerUserId : undefined,
        title: formData.title.trim() || 'Brouillon',
        description: formData.description.trim() || '',
        address: formData.address.trim() || undefined,
        locationZone: formData.locationZone.trim() || undefined,
        latitude: formData.latitude ? parseFloat(formData.latitude) : undefined,
        longitude: formData.longitude ? parseFloat(formData.longitude) : undefined,
        transactionModes: formData.transactionModes,
        price: formData.price ? parseFloat(parseNumber(formData.price)) : undefined,
        fees: formData.fees ? parseFloat(parseNumber(formData.fees)) : undefined,
        currency: formData.currency,
        surfaceArea: formData.surfaceArea ? parseFloat(formData.surfaceArea) : undefined,
        surfaceUseful: formData.surfaceUseful ? parseFloat(formData.surfaceUseful) : undefined,
        surfaceTerrain: formData.surfaceTerrain ? parseFloat(formData.surfaceTerrain) : undefined,
        rooms: formData.rooms ? parseInt(formData.rooms, 10) : undefined,
        bedrooms: formData.bedrooms ? parseInt(formData.bedrooms, 10) : undefined,
        bathrooms: formData.bathrooms ? parseInt(formData.bathrooms, 10) : undefined,
        furnishingStatus: formData.furnishingStatus,
        availability: formData.availability,
        typeSpecificData: processTypeSpecificData({
          ...formData.typeSpecificData,
          country: formData.location?.country,
          countryId: formData.location?.countryId,
          region: formData.location?.region,
          regionId: formData.location?.regionId,
          commune: formData.location?.commune,
          communeId: formData.location?.communeId,
          pointsOfInterest: formData.pointsOfInterest,
          constructionYear: formData.constructionYear ? parseInt(formData.constructionYear, 10) : undefined,
          generalCondition: formData.generalCondition,
          standing: formData.standing,
          deposit: formData.deposit ? parseFloat(parseNumber(formData.deposit)) : undefined,
          commissionMode: formData.commissionMode,
          commissionAmount: formData.commissionAmount ? parseFloat(parseNumber(formData.commissionAmount)) : undefined,
          availabilityDate: formData.availabilityDate || undefined,
        }),
      };

      if (savedPropertyId) {
        await updateProperty(tenantId, savedPropertyId, submitData);
      } else {
        const newProperty = await createProperty(tenantId, submitData as CreatePropertyRequest);
        setSavedPropertyId(newProperty.id);
      }
      
      alert('Brouillon enregistré avec succès !');
    } catch (error: any) {
      console.error('Error saving draft:', error);
      alert(error.response?.data?.error || 'Erreur lors de l\'enregistrement du brouillon');
    } finally {
      setIsLoading(false);
    }
  };

  // Finish wizard
  const handleFinish = async () => {
    setIsLoading(true);
    try {
      const submitData: CreatePropertyRequest | UpdatePropertyRequest = {
        ...(property ? {} : { propertyType: formData.propertyType, ownershipType: formData.ownershipType }),
        ownerUserId: formData.ownerUserId && !formData.ownerUserId.includes('@') ? formData.ownerUserId : undefined,
        ownerEmail: formData.ownerUserId && formData.ownerUserId.includes('@') ? formData.ownerUserId : undefined,
        title: formData.title.trim(),
        description: formData.description.trim(),
        address: formData.address.trim() || undefined,
        locationZone: formData.locationZone.trim() || undefined,
        latitude: formData.latitude ? parseFloat(formData.latitude) : undefined,
        longitude: formData.longitude ? parseFloat(formData.longitude) : undefined,
        transactionModes: formData.transactionModes,
        price: formData.price ? parseFloat(parseNumber(formData.price)) : undefined,
        fees: formData.fees ? parseFloat(parseNumber(formData.fees)) : undefined,
        currency: formData.currency,
        surfaceArea: formData.surfaceArea ? parseFloat(formData.surfaceArea) : undefined,
        surfaceUseful: formData.surfaceUseful ? parseFloat(formData.surfaceUseful) : undefined,
        surfaceTerrain: formData.surfaceTerrain ? parseFloat(formData.surfaceTerrain) : undefined,
        rooms: formData.rooms ? parseInt(formData.rooms, 10) : undefined,
        bedrooms: formData.bedrooms ? parseInt(formData.bedrooms, 10) : undefined,
        bathrooms: formData.bathrooms ? parseInt(formData.bathrooms, 10) : undefined,
        furnishingStatus: formData.furnishingStatus,
        availability: formData.availability,
        typeSpecificData: processTypeSpecificData({
          ...formData.typeSpecificData,
          country: formData.location?.country,
          countryId: formData.location?.countryId,
          region: formData.location?.region,
          regionId: formData.location?.regionId,
          commune: formData.location?.commune,
          communeId: formData.location?.communeId,
          pointsOfInterest: formData.pointsOfInterest,
          constructionYear: formData.constructionYear ? parseInt(formData.constructionYear, 10) : undefined,
          generalCondition: formData.generalCondition,
          standing: formData.standing,
          deposit: formData.deposit ? parseFloat(parseNumber(formData.deposit)) : undefined,
          commissionMode: formData.commissionMode,
          commissionAmount: formData.commissionAmount ? parseFloat(parseNumber(formData.commissionAmount)) : undefined,
          availabilityDate: formData.availabilityDate || undefined,
        }),
      };

      let finalPropertyId = savedPropertyId;
      if (finalPropertyId) {
        await updateProperty(tenantId, finalPropertyId, submitData);
      } else {
        const newProperty = await createProperty(tenantId, submitData as CreatePropertyRequest);
        finalPropertyId = newProperty.id;
      }

      if (onComplete && finalPropertyId) {
        onComplete(finalPropertyId);
      }
    } catch (error: any) {
      console.error('Error finishing wizard:', error);
      alert(error.response?.data?.error || 'Erreur lors de l\'enregistrement');
    } finally {
      setIsLoading(false);
    }
  };

  // Validate step
  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};

    switch (step) {
      case 0: // Type & Identification
        if (!formData.propertyType) {
          newErrors.propertyType = 'Le type de propriété est requis';
        }
        if (!formData.title.trim()) {
          newErrors.title = 'Le titre est requis';
        }
        if (!formData.description.trim()) {
          newErrors.description = 'La description est requise';
        }
        break;
      case 1: // Localisation
        if (!formData.location) {
          newErrors.location = 'La localisation est requise';
        }
        break;
      case 2: // Caractéristiques générales - optional
        break;
      case 3: // Prix & Conditions
        if (formData.transactionModes.length === 0) {
          newErrors.transactionModes = 'Au moins un mode de transaction est requis';
        }
        break;
      case 4: // Caractéristiques spécifiques
        if (template && template.sections) {
          template.sections.forEach((section: any) => {
            section.fieldDefinitions?.forEach((field: any) => {
              if (field.required) {
                const value = formData.typeSpecificData[field.key];
                if (!value || (Array.isArray(value) && value.length === 0)) {
                  newErrors[`typeSpecific.${field.key}`] = `${field.label} est requis`;
                }
              }
            });
          });
        }
        break;
      default:
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Step components will be created in the next part due to length...

  const steps: WizardStep[] = [
    {
      id: 'type',
      title: 'Type & Identification',
      description: 'Sélectionnez le type de bien et les informations de base',
      component: (
        <div className="space-y-6">
          {/* Step 1 content will be added */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Type de propriété <span className="text-red-500">*</span>
            </label>
            <PropertyTypeSelector
              selectedType={formData.propertyType}
              onSelect={(type) => handleChange('propertyType', type)}
            />
            {errors.propertyType && (
              <p className="mt-1 text-sm text-red-600">{errors.propertyType}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Titre <span className="text-red-500">*</span>
            </label>
            <Input
              value={formData.title}
              onChange={(e) => handleChange('title', e.target.value)}
              placeholder="Ex: Appartement 3 pièces à Cocody"
              className={errors.title ? 'border-red-500' : ''}
            />
            {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={6}
              className={`w-full rounded-md border px-3 py-2 ${errors.description ? 'border-red-500' : 'border-gray-300'}`}
              placeholder="Décrivez la propriété..."
            />
            {errors.description && (
              <p className="mt-1 text-sm text-red-600">{errors.description}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Propriétaire
            </label>
            <Select
              value={formData.ownerUserId || 'none'}
              onValueChange={(value) => handleChange('ownerUserId', value === 'none' ? '' : value)}
              disabled={loadingOwners}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingOwners ? 'Chargement...' : 'Sélectionner un propriétaire (optionnel)'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucun</SelectItem>
                {owners.map((owner) => (
                  <SelectItem key={owner.id} value={owner.email}>
                    {owner.firstName} {owner.lastName}
                    {owner.email ? ` (${owner.email})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ),
      isValid: !!(formData.propertyType && formData.title.trim() && formData.description.trim()),
    },
    {
      id: 'location',
      title: 'Localisation',
      description: 'Indiquez l\'emplacement de la propriété',
      component: (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Localisation (Pays &gt; Région &gt; Commune) <span className="text-red-500">*</span>
            </label>
            <LocationSelector
              value={formData.location?.communeId}
              onChange={(location) => handleChange('location', location)}
              placeholder="Rechercher une localisation..."
              error={errors.location}
            />
            {errors.location && <p className="mt-1 text-sm text-red-600">{errors.location}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quartier/Zone (optionnel)
            </label>
            <Input
              value={formData.locationZone}
              onChange={(e) => handleChange('locationZone', e.target.value)}
              placeholder="Ex: Angré, Riviera, etc."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Adresse
            </label>
            <Input
              value={formData.address}
              onChange={(e) => handleChange('address', e.target.value)}
              placeholder="Adresse complète (optionnel)"
            />
          </div>
        </div>
      ),
      isValid: !!formData.location,
    },
    {
      id: 'characteristics',
      title: 'Caractéristiques générales',
      description: 'Informations générales sur la propriété',
      component: (
        <div className="space-y-4">
          {/* Masquer complètement pour Terrain et Lot programme neuf */}
          {(formData.propertyType as PropertyType) === PropertyType.TERRAIN || (formData.propertyType as PropertyType) === PropertyType.LOT_PROGRAMME_NEUF ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-gray-600 text-sm">
                {(formData.propertyType as PropertyType) === PropertyType.TERRAIN
                  ? 'Les caractéristiques spécifiques du terrain seront renseignées dans l\'étape suivante.'
                  : 'Les informations sur le programme seront renseignées dans l\'étape suivante.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(formData.propertyType as PropertyType) !== PropertyType.TERRAIN && (formData.propertyType as PropertyType) !== PropertyType.PARKING_BOX && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Surface principale (m²)
                  </label>
                  <Input
                    type="number"
                    value={formData.surfaceArea}
                    onChange={(e) => handleChange('surfaceArea', e.target.value)}
                    placeholder="Ex: 75"
                  />
                </div>
              )}
              {/* Année de construction - masquer pour Terrain, Lot programme neuf, Parking */}
              {(formData.propertyType as PropertyType) !== PropertyType.TERRAIN &&
                (formData.propertyType as PropertyType) !== PropertyType.LOT_PROGRAMME_NEUF &&
                (formData.propertyType as PropertyType) !== PropertyType.PARKING_BOX && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Année de construction
                    </label>
                    <Input
                      type="number"
                      value={formData.constructionYear}
                      onChange={(e) => handleChange('constructionYear', e.target.value)}
                      min="1800"
                      max={new Date().getFullYear()}
                      placeholder="Ex: 2020"
                    />
                  </div>
                )}
              {/* État général - masquer pour Terrain, Lot programme neuf, Parking */}
              {(formData.propertyType as PropertyType) !== PropertyType.TERRAIN &&
                (formData.propertyType as PropertyType) !== PropertyType.LOT_PROGRAMME_NEUF &&
                (formData.propertyType as PropertyType) !== PropertyType.PARKING_BOX && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      État général
                    </label>
                    <select
                      value={formData.generalCondition}
                      onChange={(e) => handleChange('generalCondition', e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2"
                    >
                      <option value="">Sélectionner...</option>
                      <option value="NEUF">Neuf</option>
                      <option value="BON">Bon</option>
                      <option value="A_RENOVER">À rénover</option>
                      <option value="EN_CHANTIER">En chantier</option>
                    </select>
                  </div>
                )}
              {/* Standing - masquer pour Terrain, Parking */}
              {(formData.propertyType as PropertyType) !== PropertyType.TERRAIN && (formData.propertyType as PropertyType) !== PropertyType.PARKING_BOX && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Standing
                  </label>
                  <select
                    value={formData.standing}
                    onChange={(e) => handleChange('standing', e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2"
                  >
                    <option value="">Sélectionner...</option>
                    <option value="ECONOMIQUE">Économique</option>
                    <option value="STANDARD">Standard</option>
                    <option value="HAUT_STANDING">Haut standing</option>
                    <option value="LUXE">Luxe</option>
                  </select>
                </div>
              )}
            </div>
          )}
        </div>
      ),
      isValid: true,
      isOptional: true,
    },
    {
      id: 'pricing',
      title: 'Prix & Conditions',
      description: 'Définissez le prix et les conditions de transaction',
      component: (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Type d'opération <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-4">
              {Object.values(PropertyTransactionMode).map((mode) => (
                <label key={mode} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.transactionModes.includes(mode)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        handleChange('transactionModes', [...formData.transactionModes, mode]);
                      } else {
                        handleChange(
                          'transactionModes',
                          formData.transactionModes.filter((m) => m !== mode)
                        );
                      }
                    }}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600"
                  />
                  <span className="text-sm text-gray-700">
                    {mode === PropertyTransactionMode.SALE ? 'Vente' : 
                     mode === PropertyTransactionMode.RENTAL ? 'Location' : 
                     'Location courte durée'}
                  </span>
                </label>
              ))}
            </div>
            {errors.transactionModes && (
              <p className="mt-1 text-sm text-red-600">{errors.transactionModes}</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {formData.transactionModes.includes(PropertyTransactionMode.SALE) ? 'Prix (vente)' : 'Loyer (location)'}
              </label>
              <Input
                type="text"
                value={formatNumber(formData.price)}
                onChange={(e) => handleNumberChange('price', e.target.value)}
                placeholder="Ex: 50 000 000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Charges
              </label>
              <Input
                type="text"
                value={formatNumber(formData.fees)}
                onChange={(e) => handleNumberChange('fees', e.target.value)}
                placeholder="Ex: 50 000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Devise
              </label>
              <select
                value={formData.currency}
                onChange={(e) => handleChange('currency', e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2"
              >
                <option value="CFA">CFA</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>
        </div>
      ),
      isValid: formData.transactionModes.length > 0,
    },
    {
      id: 'specific-characteristics',
      title: 'Caractéristiques spécifiques',
      description: 'Détails spécifiques au type de bien sélectionné',
      component: (
        <div className="space-y-6">
          {loadingTemplate ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600 mr-3" />
              <span className="text-gray-600">Chargement des caractéristiques...</span>
            </div>
          ) : template && template.sections && template.sections.length > 0 ? (
            template.sections.map((section: any) => (
              <div key={section.id || section.title} className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-800 border-b pb-2">
                  {section.title}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {section.fieldDefinitions?.map((field: any) => {
                    const fieldKey = field.key;
                    const value = formData.typeSpecificData[fieldKey] || '';
                    const error = errors[`typeSpecific.${fieldKey}`];

                    // Translate option values to French labels
                    const translateOption = (optionValue: string): string => {
                      const translations: Record<string, string> = {
                        // Orientation
                        'NORTH': 'Nord',
                        'SOUTH': 'Sud',
                        'EAST': 'Est',
                        'WEST': 'Ouest',
                        // Garage
                        'GARAGE_1': 'Garage : 1 véhicule',
                        'GARAGE_2': 'Garage : 2 véhicules',
                        // Bathroom type
                        'SHOWER': 'Douche',
                        'BATHTUB': 'Baignoire',
                        // Room type
                        'PRIVATE': 'Privée',
                        'SHARED': 'Partagée',
                        // Kitchen access
                        'NONE': 'Aucune',
                        // Services
                        'INTERNET': 'Internet',
                        'WATER': 'Eau',
                        'POWER': 'Électricité',
                        'CLEANING': 'Ménage',
                        // Land title
                        'ACD': 'ACD',
                        'CPF': 'CPF',
                        'TF': 'Titre foncier',
                        'ATTESTATION': 'Attestation',
                        // Zoning
                        'RESIDENTIAL': 'Résidentiel',
                        'COMMERCIAL': 'Commercial',
                        'MIXED': 'Mixte',
                        'AGRICULTURAL': 'Agricole',
                      };
                      return translations[optionValue] || optionValue;
                    };

                    switch (field.type) {
                      case 'text':
                        return (
                          <div key={fieldKey}>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              {field.label}
                              {field.required && <span className="text-red-500 ml-1">*</span>}
                              {field.unit && <span className="text-gray-500 ml-1">({field.unit})</span>}
                            </label>
                            <Input
                              type="text"
                              value={value}
                              onChange={(e) => {
                                setFormData((prev) => ({
                                  ...prev,
                                  typeSpecificData: {
                                    ...prev.typeSpecificData,
                                    [fieldKey]: e.target.value,
                                  },
                                }));
                              }}
                              className={error ? 'border-red-500' : ''}
                              placeholder={`Saisir ${field.label.toLowerCase()}`}
                            />
                            {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
                          </div>
                        );

                      case 'number':
                        return (
                          <div key={fieldKey}>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              {field.label}
                              {field.required && <span className="text-red-500 ml-1">*</span>}
                              {field.unit && <span className="text-gray-500 ml-1">({field.unit})</span>}
                            </label>
                            <Input
                              type="number"
                              value={value}
                              onChange={(e) => {
                                setFormData((prev) => ({
                                  ...prev,
                                  typeSpecificData: {
                                    ...prev.typeSpecificData,
                                    [fieldKey]: e.target.value,
                                  },
                                }));
                              }}
                              min={field.validation?.min}
                              max={field.validation?.max}
                              className={error ? 'border-red-500' : ''}
                              placeholder={`Ex: ${field.unit ? `100 ${field.unit}` : '100'}`}
                            />
                            {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
                          </div>
                        );

                      case 'boolean':
                        return (
                          <div key={fieldKey} className="flex items-center gap-2 pt-6">
                            <input
                              type="checkbox"
                              checked={!!value}
                              onChange={(e) => {
                                setFormData((prev) => ({
                                  ...prev,
                                  typeSpecificData: {
                                    ...prev.typeSpecificData,
                                    [fieldKey]: e.target.checked,
                                  },
                                }));
                              }}
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <label className="text-sm font-medium text-gray-700">
                              {field.label}
                              {field.required && <span className="text-red-500 ml-1">*</span>}
                            </label>
                            {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
                          </div>
                        );

                      case 'select':
                        return (
                          <div key={fieldKey}>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              {field.label}
                              {field.required && <span className="text-red-500 ml-1">*</span>}
                            </label>
                            <select
                              value={value}
                              onChange={(e) => {
                                setFormData((prev) => ({
                                  ...prev,
                                  typeSpecificData: {
                                    ...prev.typeSpecificData,
                                    [fieldKey]: e.target.value,
                                  },
                                }));
                              }}
                              className={`w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                                error ? 'border-red-500' : 'border-gray-300'
                              }`}
                              required={field.required}
                            >
                              <option value="">Sélectionner...</option>
                              {field.validation?.options?.map((option: string) => (
                                <option key={option} value={option}>
                                  {translateOption(option)}
                                </option>
                              ))}
                            </select>
                            {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
                          </div>
                        );

                      case 'multiselect':
                        return (
                          <div key={fieldKey} className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              {field.label}
                              {field.required && <span className="text-red-500 ml-1">*</span>}
                            </label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              {field.validation?.options?.map((option: string) => {
                                const selectedValues = Array.isArray(value) ? value : [];
                                const isSelected = selectedValues.includes(option);
                                return (
                                  <label
                                    key={option}
                                    className="flex items-center gap-2 p-2 border rounded-md cursor-pointer hover:bg-gray-50"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={(e) => {
                                        const currentValues = Array.isArray(value) ? value : [];
                                        const newValues = e.target.checked
                                          ? [...currentValues, option]
                                          : currentValues.filter((v) => v !== option);
                                        setFormData((prev) => ({
                                          ...prev,
                                          typeSpecificData: {
                                            ...prev.typeSpecificData,
                                            [fieldKey]: newValues,
                                          },
                                        }));
                                      }}
                                      className="h-4 w-4 rounded border-gray-300 text-blue-600"
                                    />
                                    <span className="text-sm text-gray-700">{translateOption(option)}</span>
                                  </label>
                                );
                              })}
                            </div>
                            {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
                          </div>
                        );

                      case 'date':
                        return (
                          <div key={fieldKey}>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              {field.label}
                              {field.required && <span className="text-red-500 ml-1">*</span>}
                            </label>
                            <Input
                              type="date"
                              value={value}
                              onChange={(e) => {
                                setFormData((prev) => ({
                                  ...prev,
                                  typeSpecificData: {
                                    ...prev.typeSpecificData,
                                    [fieldKey]: e.target.value,
                                  },
                                }));
                              }}
                              className={error ? 'border-red-500' : ''}
                            />
                            {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
                          </div>
                        );

                      default:
                        return null;
                    }
                  })}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <p className="text-gray-500">
                {formData.propertyType
                  ? 'Aucune caractéristique spécifique pour ce type de bien.'
                  : 'Veuillez d\'abord sélectionner un type de bien.'}
              </p>
            </div>
          )}
        </div>
      ),
      isValid: true, // Will be validated dynamically
    },
    {
      id: 'media',
      title: 'Médias',
      description: 'Ajoutez des photos et vidéos de la propriété',
      component: (
        <div className="space-y-6">
          {savedPropertyId ? (
            <>
              <div>
                <h3 className="text-lg font-semibold mb-4">Photos</h3>
                <PropertyMediaUpload
                  propertyId={savedPropertyId}
                  tenantId={tenantId}
                  mediaType={PropertyMediaType.PHOTO}
                  onUploadComplete={() => setMediaRefreshKey(prev => prev + 1)}
                />
                <div className="mt-4">
                  <PropertyMediaGallery
                    propertyId={savedPropertyId}
                    tenantId={tenantId}
                    mediaType={PropertyMediaType.PHOTO}
                    refreshTrigger={mediaRefreshKey}
                  />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-4">Vidéos</h3>
                <PropertyMediaUpload
                  propertyId={savedPropertyId}
                  tenantId={tenantId}
                  mediaType={PropertyMediaType.VIDEO}
                  onUploadComplete={() => setMediaRefreshKey(prev => prev + 1)}
                />
                <div className="mt-4">
                  <PropertyMediaGallery
                    propertyId={savedPropertyId}
                    tenantId={tenantId}
                    mediaType={PropertyMediaType.VIDEO}
                    refreshTrigger={mediaRefreshKey}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-12 bg-blue-50 rounded-lg border border-blue-200">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">
                Préparation de l'espace médias...
              </p>
            </div>
          )}
        </div>
      ),
      isValid: true,
      isOptional: true,
    },
  ];

  // Helper function to process typeSpecificData and convert number fields
  const processTypeSpecificData = (data: Record<string, any>): Record<string, any> => {
    if (!template || !template.fieldDefinitions) {
      return data;
    }

    const processed: Record<string, any> = { ...data };
    
    // Convert number fields to numbers based on template
    template.fieldDefinitions.forEach((field: any) => {
      if (field.type === 'number' && processed[field.key] !== undefined && processed[field.key] !== null && processed[field.key] !== '') {
        const numValue = parseFloat(String(processed[field.key]));
        if (!isNaN(numValue)) {
          processed[field.key] = numValue;
        }
      }
    });

    return processed;
  };

  // Auto-save when reaching media step
  useEffect(() => {
    const autoSaveForMedia = async () => {
      // If we're on the media step (index 5) and property hasn't been saved yet
      // Also check if we haven't already attempted to save (prevents infinite loops)
      if (
        currentStep === 5 && 
        !savedPropertyId && 
        !isLoading && 
        !property && 
        !autoSaveAttemptedRef.current
      ) {
        // Validate required steps first (steps 0, 1, 3)
        const requiredStepsValid = 
          formData.propertyType && 
          formData.title.trim() && 
          formData.description.trim() &&
          formData.location &&
          formData.transactionModes.length > 0;
        
        if (requiredStepsValid) {
          // Mark as attempted to prevent retries
          autoSaveAttemptedRef.current = true;
          setIsLoading(true);
          try {
            // Process typeSpecificData to convert number fields
            const processedTypeSpecificData = processTypeSpecificData({
              ...formData.typeSpecificData,
              country: formData.location?.country,
              countryId: formData.location?.countryId,
              region: formData.location?.region,
              regionId: formData.location?.regionId,
              commune: formData.location?.commune,
              communeId: formData.location?.communeId,
              pointsOfInterest: formData.pointsOfInterest,
              constructionYear: formData.constructionYear ? parseInt(formData.constructionYear, 10) : undefined,
              generalCondition: formData.generalCondition,
              standing: formData.standing,
              deposit: formData.deposit ? parseFloat(parseNumber(formData.deposit)) : undefined,
              commissionMode: formData.commissionMode,
              commissionAmount: formData.commissionAmount ? parseFloat(parseNumber(formData.commissionAmount)) : undefined,
              availabilityDate: formData.availabilityDate || undefined,
            });

            const submitData: CreatePropertyRequest = {
              propertyType: formData.propertyType,
              ownershipType: formData.ownershipType,
              title: formData.title.trim() || 'Brouillon',
              description: formData.description.trim() || '',
              address: formData.address.trim() || '',
              locationZone: formData.locationZone.trim() || undefined,
              latitude: formData.latitude ? parseFloat(formData.latitude) : undefined,
              longitude: formData.longitude ? parseFloat(formData.longitude) : undefined,
              transactionModes: formData.transactionModes,
              price: formData.price ? parseFloat(parseNumber(formData.price)) : undefined,
              fees: formData.fees ? parseFloat(parseNumber(formData.fees)) : undefined,
              currency: formData.currency,
              surfaceArea: formData.surfaceArea ? parseFloat(formData.surfaceArea) : undefined,
              surfaceUseful: formData.surfaceUseful ? parseFloat(formData.surfaceUseful) : undefined,
              surfaceTerrain: formData.surfaceTerrain ? parseFloat(formData.surfaceTerrain) : undefined,
              rooms: formData.rooms ? parseInt(formData.rooms, 10) : undefined,
              bedrooms: formData.bedrooms ? parseInt(formData.bedrooms, 10) : undefined,
              bathrooms: formData.bathrooms ? parseInt(formData.bathrooms, 10) : undefined,
              furnishingStatus: formData.furnishingStatus,
              availability: formData.availability,
              typeSpecificData: processedTypeSpecificData,
            };

            const newProperty = await createProperty(tenantId, submitData);
            setSavedPropertyId(newProperty.id);
          } catch (error: any) {
            console.error('Error auto-saving for media:', error);
            // Keep ref as true to prevent infinite retry loops
            // User can navigate away and back to step 5 to retry
            // Don't show alert, just log - user can still continue
          } finally {
            setIsLoading(false);
          }
        }
      }
    };

    autoSaveForMedia();
    // Only depend on currentStep and savedPropertyId to prevent infinite loops
    // formData is accessed inside the effect but not in dependencies to avoid reruns on every change
  }, [currentStep, savedPropertyId, tenantId]);
  
  // Reset auto-save attempted flag when step changes away from media step
  useEffect(() => {
    if (currentStep !== 5) {
      autoSaveAttemptedRef.current = false;
    }
  }, [currentStep]);

  // Add validation on step change
  const handleStepChange = (step: number) => {
    if (step > currentStep) {
      // Validate current step before moving forward
      if (!validateStep(currentStep)) {
        return;
      }
    }
    setCurrentStep(step);
  };

  return (
    <Wizard
      steps={steps}
      currentStep={currentStep}
      onStepChange={handleStepChange}
      onSave={handleSaveDraft}
      onFinish={handleFinish}
      isLoading={isLoading}
      canSaveDraft={true}
    />
  );
};

