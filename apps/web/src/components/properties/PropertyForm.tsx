import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { LocationSelector } from '../ui/location-selector';
import { PropertyTypeSelector } from './PropertyTypeSelector';
import { GeographicLocation } from '../../services/geographic-service';
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
} from '../../types/property-types';
import { getTemplate } from '../../services/property-service';
import { useAuth } from '../../hooks/useAuth';
import { getTenantClients, TenantClient } from '../../services/tenant-service';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

interface PropertyFormProps {
  property?: Property;
  tenantId: string;
  onSubmit: (data: CreatePropertyRequest | UpdatePropertyRequest) => Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
}

export const PropertyForm: React.FC<PropertyFormProps> = ({
  property,
  tenantId,
  onSubmit,
  onCancel,
  loading = false,
}) => {
  const { tenantMembership } = useAuth();
  const [selectedType, setSelectedType] = useState<PropertyType | undefined>(
    property?.propertyType
  );
  const [template, setTemplate] = useState<PropertyTypeTemplate | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  
  // State for owners
  const [owners, setOwners] = useState<TenantClient[]>([]);
  const [loadingOwners, setLoadingOwners] = useState(false);

  const [formData, setFormData] = useState({
    // Identification
    propertyType: property?.propertyType || ('' as PropertyType),
    ownershipType: property?.ownershipType || PropertyOwnershipType.TENANT,
    ownerUserId: property?.ownerUserId || '',
    title: property?.title || '',
    description: property?.description || '',
    status: property?.status || PropertyStatus.DRAFT,
    availability: property?.availability || PropertyAvailability.AVAILABLE,
    availabilityDate: '',
    
    // Localisation
    location: null as GeographicLocation | null, // Selected location (commune, region, country)
    locationZone: property?.locationZone || '',
    address: property?.address || '',
    latitude: property?.latitude?.toString() || '',
    longitude: property?.longitude?.toString() || '',
    pointsOfInterest: '',
    
    // Caractéristiques générales
    surfaceArea: property?.surfaceArea?.toString() || '',
    surfaceUseful: property?.surfaceUseful?.toString() || '',
    constructionYear: '',
    generalCondition: '',
    standing: '',
    
    // Prix & conditions
    transactionModes: property?.transactionModes || [PropertyTransactionMode.SALE],
    price: property?.price?.toString() || '',
    fees: property?.fees?.toString() || '',
    currency: property?.currency || 'CFA',
    deposit: '',
    commissionMode: '',
    commissionAmount: '',
    
    // Caractéristiques physiques (selon type)
    rooms: property?.rooms?.toString() || '',
    bedrooms: property?.bedrooms?.toString() || '',
    bathrooms: property?.bathrooms?.toString() || '',
    surfaceTerrain: property?.surfaceTerrain?.toString() || '',
    furnishingStatus: property?.furnishingStatus || PropertyFurnishingStatus.UNFURNISHED,
    
    // Type-specific data
    typeSpecificData: property?.typeSpecificData || {},
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load owners on mount
  useEffect(() => {
    loadOwners();
  }, [tenantId]);

  // Load template when type is selected
  useEffect(() => {
    if (selectedType && !property) {
      loadTemplate(selectedType);
    } else if (property?.propertyType) {
      loadTemplate(property.propertyType);
    }
  }, [selectedType, property]);

  const loadOwners = async () => {
    setLoadingOwners(true);
    try {
      const response = await getTenantClients(tenantId);
      if (response.success) {
        // Include all tenant clients as potential owners
        // Any client can be a property owner, not just those with OWNER/CO_OWNER type
        setOwners(response.data);
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
      setFormData((prev) => ({ ...prev, propertyType: type }));
    } catch (error) {
      console.error('Error loading template:', error);
    } finally {
      setLoadingTemplate(false);
    }
  };

  const handleTypeSelect = (type: PropertyType) => {
    setSelectedType(type);
    setFormData((prev) => ({
      ...prev,
      propertyType: type,
      typeSpecificData: {},
      // Clear irrelevant fields when type changes
      ...(type === PropertyType.TERRAIN || type === PropertyType.BUREAU || 
          type === PropertyType.BOUTIQUE_COMMERCIAL || type === PropertyType.ENTREPOT_INDUSTRIEL
        ? { rooms: '', bedrooms: '', bathrooms: '' }
        : {}),
      ...(type === PropertyType.TERRAIN || type === PropertyType.BOUTIQUE_COMMERCIAL || 
          type === PropertyType.ENTREPOT_INDUSTRIEL
        ? { surfaceUseful: '' }
        : {}),
      ...(type === PropertyType.TERRAIN ? { surfaceArea: '' } : {}),
    }));
    loadTemplate(type);
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.propertyType) {
      newErrors.propertyType = 'Le type de propriété est requis';
    }
    if (!formData.title.trim()) {
      newErrors.title = 'Le titre est requis';
    }
    if (!formData.description.trim()) {
      newErrors.description = 'La description est requise';
    }
    if (!formData.location) {
      newErrors.location = 'La localisation est requise';
    }
    // Address is optional
    if (formData.transactionModes.length === 0) {
      newErrors.transactionModes = 'Au moins un mode de transaction est requis';
    }

    // Validate template-specific required fields
    if (template && template.fieldDefinitions && Array.isArray(template.fieldDefinitions)) {
      template.fieldDefinitions.forEach((field) => {
        if (field.required) {
          const value = formData.typeSpecificData[field.key];
          if (value === undefined || value === null || value === '') {
            newErrors[`typeSpecific.${field.key}`] = `${field.label} est requis`;
          }
        }
      });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const submitData: CreatePropertyRequest | UpdatePropertyRequest = {
        ...(property ? {} : { propertyType: formData.propertyType, ownershipType: formData.ownershipType }),
        ownerUserId: formData.ownerUserId || undefined,
        title: formData.title.trim(),
        description: formData.description.trim(),
        address: formData.address.trim(),
        locationZone: formData.locationZone.trim() || undefined,
        latitude: formData.latitude ? parseFloat(formData.latitude) : undefined,
        longitude: formData.longitude ? parseFloat(formData.longitude) : undefined,
        transactionModes: formData.transactionModes,
        price: formData.price ? parseFloat(formData.price) : undefined,
        fees: formData.fees ? parseFloat(formData.fees) : undefined,
        currency: formData.currency,
        surfaceArea: formData.surfaceArea ? parseFloat(formData.surfaceArea) : undefined,
        surfaceUseful: formData.surfaceUseful ? parseFloat(formData.surfaceUseful) : undefined,
        surfaceTerrain: formData.surfaceTerrain ? parseFloat(formData.surfaceTerrain) : undefined,
        rooms: formData.rooms ? parseInt(formData.rooms, 10) : undefined,
        bedrooms: formData.bedrooms ? parseInt(formData.bedrooms, 10) : undefined,
        bathrooms: formData.bathrooms ? parseInt(formData.bathrooms, 10) : undefined,
        furnishingStatus: formData.furnishingStatus,
        availability: formData.availability,
        typeSpecificData: {
          ...formData.typeSpecificData,
          // Add geographic data
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
          deposit: formData.deposit ? parseFloat(formData.deposit) : undefined,
          commissionMode: formData.commissionMode,
          commissionAmount: formData.commissionAmount ? parseFloat(parseNumber(formData.commissionAmount)) : undefined,
          availabilityDate: formData.availabilityDate || undefined,
        },
      };

      await onSubmit(submitData);
    } catch (error: any) {
      if (error.response?.data?.error) {
        setErrors({ submit: error.response.data.error });
      } else {
        setErrors({ submit: 'Une erreur est survenue lors de l\'enregistrement' });
      }
    } finally {
      setIsSubmitting(false);
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
    if (field.startsWith('typeSpecific.')) {
      const key = field.replace('typeSpecific.', '');
      setFormData((prev) => ({
        ...prev,
        typeSpecificData: {
          ...prev.typeSpecificData,
          [key]: value,
        },
      }));
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

  const handleNumberChange = (field: string, value: string) => {
    // Remove spaces for storage, but keep formatted for display
    const cleaned = parseNumber(value);
    handleChange(field, cleaned);
  };

  // Helper functions
  const shouldShowRooms = (propertyType: PropertyType): boolean => {
    return propertyType === PropertyType.APPARTEMENT ||
           propertyType === PropertyType.STUDIO ||
           propertyType === PropertyType.DUPLEX_TRIPLEX ||
           propertyType === PropertyType.MAISON_VILLA ||
           propertyType === PropertyType.CHAMBRE_COLOCATION;
  };

  const shouldShowUsefulSurface = (propertyType: PropertyType): boolean => {
    return propertyType === PropertyType.APPARTEMENT ||
           propertyType === PropertyType.STUDIO ||
           propertyType === PropertyType.DUPLEX_TRIPLEX ||
           propertyType === PropertyType.MAISON_VILLA ||
           propertyType === PropertyType.BUREAU;
  };

  const renderField = (field: any) => {
    const fieldKey = `typeSpecific.${field.key}`;
    const value = formData.typeSpecificData[field.key] || field.defaultValue || '';
    const error = errors[fieldKey];

    switch (field.type) {
      case 'text':
        return (
          <div key={field.key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </label>
            <Input
              type="text"
              value={value}
              onChange={(e) => handleChange(fieldKey, e.target.value)}
              className={error ? 'border-red-500' : ''}
              required={field.required}
            />
            {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
          </div>
        );

      case 'number':
        return (
          <div key={field.key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </label>
            <Input
              type="number"
              value={value}
              onChange={(e) => handleChange(fieldKey, e.target.value)}
              min={field.validation?.min}
              max={field.validation?.max}
              className={error ? 'border-red-500' : ''}
              required={field.required}
            />
            {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
          </div>
        );

      case 'boolean':
        return (
          <div key={field.key} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={value === true || value === 'true'}
              onChange={(e) => handleChange(fieldKey, e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label className="text-sm font-medium text-gray-700">
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        );

      case 'select':
        return (
          <div key={field.key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </label>
            <select
              value={value}
              onChange={(e) => handleChange(fieldKey, e.target.value)}
              className={`w-full rounded-md border px-3 py-2 ${error ? 'border-red-500' : 'border-gray-300'}`}
              required={field.required}
            >
              <option value="">Sélectionner...</option>
              {field.validation?.options && Array.isArray(field.validation.options) ? field.validation.options.map((option: string) => (
                <option key={option} value={option}>
                  {option.replace(/_/g, ' ')}
                </option>
              )) : null}
            </select>
            {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
          </div>
        );

      case 'date':
        return (
          <div key={field.key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </label>
            <Input
              type="date"
              value={value}
              onChange={(e) => handleChange(fieldKey, e.target.value)}
              className={error ? 'border-red-500' : ''}
              required={field.required}
            />
            {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {errors.submit && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {errors.submit}
        </div>
      )}

      {/* ========== SECTION 1: IDENTIFICATION ========== */}
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <h2 className="text-xl font-bold text-gray-900 border-b pb-2">1. Identification</h2>
        
        {/* Type de bien (only for new properties) */}
        {!property && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Type de bien <span className="text-red-500">*</span>
            </label>
            <PropertyTypeSelector
              selectedType={selectedType}
              onSelect={handleTypeSelect}
              disabled={loadingTemplate}
            />
            {errors.propertyType && (
              <p className="mt-2 text-sm text-red-600">{errors.propertyType}</p>
            )}
          </div>
        )}

        {/* Type de propriété (Ownership) */}
        {!property && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Type de propriété <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.ownershipType}
              onChange={(e) => handleChange('ownershipType', e.target.value as PropertyOwnershipType)}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
              required
            >
              <option value={PropertyOwnershipType.TENANT}>Propriété de l'agence</option>
              <option value={PropertyOwnershipType.PUBLIC}>Propriété privée</option>
              <option value={PropertyOwnershipType.CLIENT}>Mandat de gestion</option>
            </select>
          </div>
        )}

        {/* Propriétaire */}
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
                <SelectItem key={owner.id} value={owner.userId}>
                  {owner.user.fullName || owner.user.email}
                  {owner.user.email && owner.user.fullName ? ` (${owner.user.email})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Référence interne (read-only if property exists) */}
        {property && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Référence interne
            </label>
            <Input
              value={property.internalReference}
              disabled
              className="bg-gray-50"
            />
          </div>
        )}

        {/* Titre */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Titre du bien <span className="text-red-500">*</span>
          </label>
          <Input
            value={formData.title}
            onChange={(e) => handleChange('title', e.target.value)}
            className={errors.title ? 'border-red-500' : ''}
            required
            placeholder="Ex: Appartement 3 pièces à Cocody"
          />
          {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title}</p>}
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description <span className="text-red-500">*</span>
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
            rows={5}
            className={`w-full rounded-md border px-3 py-2 ${errors.description ? 'border-red-500' : 'border-gray-300'}`}
            required
            placeholder="Description détaillée du bien..."
          />
          {errors.description && (
            <p className="mt-1 text-sm text-red-600">{errors.description}</p>
          )}
        </div>

        {/* Statut et Disponibilité */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Statut <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.status}
              onChange={(e) => handleChange('status', e.target.value as PropertyStatus)}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
              required
            >
              <option value={PropertyStatus.DRAFT}>Brouillon</option>
              <option value={PropertyStatus.AVAILABLE}>Disponible</option>
              <option value={PropertyStatus.RESERVED}>Réservé</option>
              <option value={PropertyStatus.UNDER_OFFER}>Sous offre</option>
              <option value={PropertyStatus.SOLD}>Vendu</option>
              <option value={PropertyStatus.RENTED}>Loué</option>
              <option value={PropertyStatus.ARCHIVED}>Archivé</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Disponibilité <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.availability}
              onChange={(e) => handleChange('availability', e.target.value as PropertyAvailability)}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
              required
            >
              <option value={PropertyAvailability.AVAILABLE}>Immédiate</option>
              <option value={PropertyAvailability.SOON_AVAILABLE}>Bientôt disponible</option>
              <option value={PropertyAvailability.UNAVAILABLE}>Indisponible</option>
            </select>
          </div>
        </div>

        {/* Date de disponibilité (si bientôt disponible) */}
        {formData.availability === PropertyAvailability.SOON_AVAILABLE && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date de disponibilité
            </label>
            <Input
              type="date"
              value={formData.availabilityDate}
              onChange={(e) => handleChange('availabilityDate', e.target.value)}
            />
          </div>
        )}
      </div>

      {/* ========== SECTION 2: LOCALISATION ========== */}
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <h2 className="text-xl font-bold text-gray-900 border-b pb-2">2. Localisation</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Localisation (Pays &gt; Région &gt; Commune) <span className="text-red-500">*</span>
            </label>
            <LocationSelector
              value={formData.location?.communeId}
              onChange={(location) => handleChange('location', location)}
              placeholder="Rechercher une localisation (ex: Cocody, Abidjan, Côte d'Ivoire)..."
              required
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
              className={errors.address ? 'border-red-500' : ''}
              placeholder="Adresse complète (optionnel)"
            />
            {errors.address && <p className="mt-1 text-sm text-red-600">{errors.address}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Latitude
            </label>
            <Input
              type="number"
              step="any"
              value={formData.latitude}
              onChange={(e) => handleChange('latitude', e.target.value)}
              placeholder="Ex: 5.3600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Longitude
            </label>
            <Input
              type="number"
              step="any"
              value={formData.longitude}
              onChange={(e) => handleChange('longitude', e.target.value)}
              placeholder="Ex: -4.0083"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Points d'intérêt (optionnel)
            </label>
            <textarea
              value={formData.pointsOfInterest}
              onChange={(e) => handleChange('pointsOfInterest', e.target.value)}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
              placeholder="Écoles, transports, commerces à proximité..."
            />
          </div>
        </div>
      </div>

      {/* ========== SECTION 3: CARACTÉRISTIQUES GÉNÉRALES ========== */}
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <h2 className="text-xl font-bold text-gray-900 border-b pb-2">3. Caractéristiques générales</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Surface principale */}
          {formData.propertyType !== PropertyType.TERRAIN && (
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

          {/* Surface utile */}
          {shouldShowUsefulSurface(formData.propertyType) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Surface utile (m²)
              </label>
              <Input
                type="number"
                value={formData.surfaceUseful}
                onChange={(e) => handleChange('surfaceUseful', e.target.value)}
                placeholder="Ex: 65"
              />
            </div>
          )}

          {/* Année de construction */}
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

          {/* État général */}
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

          {/* Standing */}
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
        </div>
      </div>

      {/* ========== SECTION 4: PRIX & CONDITIONS ========== */}
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <h2 className="text-xl font-bold text-gray-900 border-b pb-2">4. Prix & Conditions</h2>
        
        {/* Type d'opération */}
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
          {/* Prix / Loyer */}
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

          {/* Charges */}
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

          {/* Devise */}
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
              <option value="USD">USD</option>
            </select>
          </div>

          {/* Dépôt de garantie (si location) */}
          {formData.transactionModes.includes(PropertyTransactionMode.RENTAL) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Dépôt de garantie
              </label>
              <Input
                type="text"
                value={formatNumber(formData.deposit)}
                onChange={(e) => handleNumberChange('deposit', e.target.value)}
                placeholder="Ex: 500 000"
              />
            </div>
          )}

          {/* Commission mode */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mode de commission
            </label>
            <select
              value={formData.commissionMode}
              onChange={(e) => handleChange('commissionMode', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            >
              <option value="">Sélectionner...</option>
              <option value="FIXE">Fixe</option>
              <option value="POURCENTAGE">Pourcentage</option>
            </select>
          </div>

          {/* Commission montant */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Commission / Honoraires
            </label>
            <Input
              type="text"
              value={formatNumber(formData.commissionAmount)}
              onChange={(e) => handleNumberChange('commissionAmount', e.target.value)}
              placeholder="Ex: 1 000 000"
            />
          </div>
        </div>
      </div>

      {/* ========== SECTION 5: CARACTÉRISTIQUES PHYSIQUES (selon type) ========== */}
      {formData.propertyType && shouldShowRooms(formData.propertyType) && (
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-xl font-bold text-gray-900 border-b pb-2">5. Caractéristiques physiques</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre de pièces
              </label>
              <Input
                type="number"
                value={formData.rooms}
                onChange={(e) => handleChange('rooms', e.target.value)}
                placeholder="Ex: 3"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Chambres
              </label>
              <Input
                type="number"
                value={formData.bedrooms}
                onChange={(e) => handleChange('bedrooms', e.target.value)}
                placeholder="Ex: 2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Salles de bain / WC
              </label>
              <Input
                type="number"
                value={formData.bathrooms}
                onChange={(e) => handleChange('bathrooms', e.target.value)}
                placeholder="Ex: 1"
              />
            </div>

            {/* Surface terrain pour Maison/Villa */}
            {formData.propertyType === PropertyType.MAISON_VILLA && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Surface terrain (m²)
                </label>
                <Input
                  type="number"
                  value={formData.surfaceTerrain}
                  onChange={(e) => handleChange('surfaceTerrain', e.target.value)}
                  placeholder="Ex: 500"
                />
              </div>
            )}

            {/* Meublé (pour certains types) */}
            {(formData.propertyType === PropertyType.APPARTEMENT ||
              formData.propertyType === PropertyType.STUDIO ||
              formData.propertyType === PropertyType.DUPLEX_TRIPLEX) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Meublé
                </label>
                <select
                  value={formData.furnishingStatus}
                  onChange={(e) => handleChange('furnishingStatus', e.target.value as PropertyFurnishingStatus)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                >
                  <option value={PropertyFurnishingStatus.UNFURNISHED}>Non meublé</option>
                  <option value={PropertyFurnishingStatus.FURNISHED}>Meublé</option>
                  <option value={PropertyFurnishingStatus.PARTIALLY_FURNISHED}>Partiellement meublé</option>
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========== SECTION 6: CARACTÉRISTIQUES SPÉCIFIQUES (Template) ========== */}
      {template && template.sections && Array.isArray(template.sections) && template.sections.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          <h2 className="text-xl font-bold text-gray-900 border-b pb-2">6. Caractéristiques spécifiques</h2>
          {template.sections
            .sort((a, b) => a.order - b.order)
            .map((section) => (
              <div key={section.key} className="border rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-4">{section.label}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {section.fields && Array.isArray(section.fields) ? section.fields.map((fieldKey) => {
                    const field = template.fieldDefinitions?.find((f) => f.key === fieldKey);
                    return field ? renderField(field) : null;
                  }) : null}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Note: Médias et Contacts seront gérés dans d'autres composants/sections */}

      {/* Actions */}
      <div className="flex justify-end gap-4 pt-4 border-t">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Annuler
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting || loading}>
          {isSubmitting ? 'Enregistrement...' : property ? 'Mettre à jour' : 'Créer'}
        </Button>
      </div>
    </form>
  );
};
