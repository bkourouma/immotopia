import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { LocationSelector } from '../ui/location-selector';
import { GeographicLocation } from '../../services/geographic-service';
import { CreateCrmDealRequest, UpdateCrmDealRequest, CrmDeal, CrmContact } from '../../types/crm-types';
import { listContacts } from '../../services/crm-service';

interface DealFormProps {
  deal?: CrmDeal;
  contactId?: string;
  tenantId: string;
  onSubmit: (data: CreateCrmDealRequest | UpdateCrmDealRequest) => Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
}

type DealFormData = CreateCrmDealRequest | UpdateCrmDealRequest;

export const DealForm: React.FC<DealFormProps> = ({
  deal,
  contactId,
  tenantId,
  onSubmit,
  onCancel,
  loading = false,
}) => {
  const [formData, setFormData] = useState({
    contactId: deal?.contactId || contactId || '',
    type: (deal?.type || 'ACHAT') as 'ACHAT' | 'LOCATION' | 'VENTE' | 'GESTION' | 'MANDAT',
    budgetMin: deal?.budgetMin?.toString() || '',
    budgetMax: deal?.budgetMax?.toString() || '',
    location: null as GeographicLocation | null,
    locationZone: deal?.locationZone || '',
    expectedValue: deal?.expectedValue?.toString() || '',
    assignedToUserId: deal?.assignedToUserId || '',
    propertyType: (deal?.criteriaJson as any)?.propertyType || '',
    description: (deal?.criteriaJson as any)?.description || '',
    // Common fields
    rooms: (deal?.criteriaJson as any)?.rooms?.toString() || '',
    surface: (deal?.criteriaJson as any)?.surface?.toString() || '',
    furnishingStatus: (deal?.criteriaJson as any)?.furnishingStatus || '',
    // Apartment/Studio/Duplex specific
    floor: (deal?.criteriaJson as any)?.floor?.toString() || '',
    hasElevator: (deal?.criteriaJson as any)?.hasElevator || false,
    hasParking: (deal?.criteriaJson as any)?.hasParking || false,
    hasBalcony: (deal?.criteriaJson as any)?.hasBalcony || false,
    // Villa/House specific
    hasGarden: (deal?.criteriaJson as any)?.hasGarden || false,
    hasPool: (deal?.criteriaJson as any)?.hasPool || false,
    hasGarage: (deal?.criteriaJson as any)?.hasGarage || false,
    // Land specific
    landArea: (deal?.criteriaJson as any)?.landArea?.toString() || '',
    landType: (deal?.criteriaJson as any)?.landType || '',
    isServiced: (deal?.criteriaJson as any)?.isServiced || false,
    isBuildable: (deal?.criteriaJson as any)?.isBuildable || false,
    // Office specific
    officeCount: (deal?.criteriaJson as any)?.officeCount?.toString() || '',
    hasReception: (deal?.criteriaJson as any)?.hasReception || false,
    // Commercial specific
    commercialType: (deal?.criteriaJson as any)?.commercialType || '',
    hasStorefront: (deal?.criteriaJson as any)?.hasStorefront || false,
    // Penthouse specific
    hasTerrace: (deal?.criteriaJson as any)?.hasTerrace || false,
    // Immeuble specific
    floorsCount: (deal?.criteriaJson as any)?.floorsCount?.toString() || '',
    unitsCount: (deal?.criteriaJson as any)?.unitsCount?.toString() || '',
    apartmentsCount: (deal?.criteriaJson as any)?.apartmentsCount?.toString() || '',
    parkingSpaces: (deal?.criteriaJson as any)?.parkingSpaces?.toString() || '',
    occupancyRate: (deal?.criteriaJson as any)?.occupancyRate?.toString() || '',
    standing: (deal?.criteriaJson as any)?.standing || '',
    hasElevatorImmeuble: (deal?.criteriaJson as any)?.hasElevator || false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);

  // Helper functions for number formatting with spaces
  const formatNumber = (value: string): string => {
    if (!value) return '';
    // Remove all non-digit characters
    const numericValue = value.replace(/\s/g, '');
    if (!numericValue) return '';
    // Add spaces as thousand separators
    return numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  };

  const parseNumber = (value: string): string => {
    // Remove all spaces and non-digit characters
    return value.replace(/\s/g, '').replace(/[^\d]/g, '');
  };

  useEffect(() => {
    if (deal) {
      const criteria = deal.criteriaJson as any || {};
      setFormData({
        contactId: deal.contactId,
        type: deal.type,
        budgetMin: deal.budgetMin?.toString() || '',
        budgetMax: deal.budgetMax?.toString() || '',
        location: null as GeographicLocation | null,
        locationZone: deal.locationZone || '',
        expectedValue: deal.expectedValue?.toString() || '',
        assignedToUserId: deal.assignedToUserId || '',
        propertyType: criteria.propertyType || '',
        description: criteria.description || '',
        rooms: criteria.rooms?.toString() || '',
        surface: criteria.surface?.toString() || '',
        furnishingStatus: criteria.furnishingStatus || '',
        floor: criteria.floor?.toString() || '',
        hasElevator: criteria.hasElevator || false,
        hasParking: criteria.hasParking || false,
        hasBalcony: criteria.hasBalcony || false,
        hasGarden: criteria.hasGarden || false,
        hasPool: criteria.hasPool || false,
        hasGarage: criteria.hasGarage || false,
        landArea: criteria.landArea?.toString() || '',
        landType: criteria.landType || '',
        isServiced: criteria.isServiced || false,
        isBuildable: criteria.isBuildable || false,
        officeCount: criteria.officeCount?.toString() || '',
        hasReception: criteria.hasReception || false,
        commercialType: criteria.commercialType || '',
        hasStorefront: criteria.hasStorefront || false,
        hasTerrace: criteria.hasTerrace || false,
        floorsCount: criteria.floorsCount?.toString() || '',
        unitsCount: criteria.unitsCount?.toString() || '',
        apartmentsCount: criteria.apartmentsCount?.toString() || '',
        parkingSpaces: criteria.parkingSpaces?.toString() || '',
        occupancyRate: criteria.occupancyRate?.toString() || '',
        standing: criteria.standing || '',
        hasElevatorImmeuble: criteria.hasElevator || false,
      });
    }
  }, [deal]);

  useEffect(() => {
    const loadContacts = async () => {
      if (!tenantId) return;
      setLoadingContacts(true);
      try {
        // Fetch all contacts with a high limit to get all of them
        const response = await listContacts(tenantId, {
          page: 1,
          limit: 1000, // High limit to get all contacts
        });
        if (response.success) {
          setContacts(response.contacts);
        }
      } catch (err) {
        console.error('Error loading contacts:', err);
      } finally {
        setLoadingContacts(false);
      }
    };

    loadContacts();
  }, [tenantId]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.contactId.trim()) {
      newErrors.contactId = 'Le contact est requis';
    }

    if (formData.budgetMin && formData.budgetMax) {
      const min = parseFloat(formData.budgetMin);
      const max = parseFloat(formData.budgetMax);
      if (min > max) {
        newErrors.budgetMax = 'Le budget maximum doit être supérieur au budget minimum';
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
      // Build criteriaJson with property details based on property type
      const criteriaJson: Record<string, unknown> = {};
      
      // Common fields
      if (formData.propertyType) criteriaJson.propertyType = formData.propertyType;
      if (formData.description) criteriaJson.description = formData.description.trim();
      if (formData.rooms) criteriaJson.rooms = parseInt(formData.rooms);
      if (formData.surface) criteriaJson.surface = parseFloat(formData.surface);
      if (formData.furnishingStatus) criteriaJson.furnishingStatus = formData.furnishingStatus;
      
      // Apartment/Studio/Duplex fields
      if (['APPARTEMENT', 'STUDIO', 'DUPLEX', 'PENTHOUSE'].includes(formData.propertyType)) {
        if (formData.floor) criteriaJson.floor = parseInt(formData.floor);
        if (formData.hasElevator) criteriaJson.hasElevator = formData.hasElevator;
        if (formData.hasParking) criteriaJson.hasParking = formData.hasParking;
        if (formData.hasBalcony) criteriaJson.hasBalcony = formData.hasBalcony;
      }
      
      // Villa/House fields
      if (['VILLA', 'MAISON'].includes(formData.propertyType)) {
        if (formData.hasGarden) criteriaJson.hasGarden = formData.hasGarden;
        if (formData.hasPool) criteriaJson.hasPool = formData.hasPool;
        if (formData.hasGarage) criteriaJson.hasGarage = formData.hasGarage;
        if (formData.hasParking) criteriaJson.hasParking = formData.hasParking;
      }
      
      // Land fields
      if (formData.propertyType === 'TERRAIN') {
        if (formData.landArea) criteriaJson.landArea = parseFloat(formData.landArea);
        if (formData.landType) criteriaJson.landType = formData.landType;
        if (formData.isServiced) criteriaJson.isServiced = formData.isServiced;
        if (formData.isBuildable) criteriaJson.isBuildable = formData.isBuildable;
      }
      
      // Office fields
      if (formData.propertyType === 'BUREAU') {
        if (formData.officeCount) criteriaJson.officeCount = parseInt(formData.officeCount);
        if (formData.hasReception) criteriaJson.hasReception = formData.hasReception;
        if (formData.hasParking) criteriaJson.hasParking = formData.hasParking;
      }
      
      // Commercial fields
      if (formData.propertyType === 'COMMERCE') {
        if (formData.commercialType) criteriaJson.commercialType = formData.commercialType;
        if (formData.hasStorefront) criteriaJson.hasStorefront = formData.hasStorefront;
        if (formData.hasParking) criteriaJson.hasParking = formData.hasParking;
      }
      
      // Penthouse specific
      if (formData.propertyType === 'PENTHOUSE') {
        if (formData.hasTerrace) criteriaJson.hasTerrace = formData.hasTerrace;
      }
      
      // Immeuble specific
      if (formData.propertyType === 'IMMEUBLE') {
        if (formData.floorsCount) criteriaJson.floorsCount = parseInt(formData.floorsCount);
        if (formData.unitsCount) criteriaJson.unitsCount = parseInt(formData.unitsCount);
        if (formData.apartmentsCount) criteriaJson.apartmentsCount = parseInt(formData.apartmentsCount);
        if (formData.parkingSpaces) criteriaJson.parkingSpaces = parseInt(formData.parkingSpaces);
        if (formData.occupancyRate) criteriaJson.occupancyRate = parseFloat(formData.occupancyRate);
        if (formData.standing) criteriaJson.standing = formData.standing;
        if (formData.hasElevatorImmeuble) criteriaJson.hasElevator = formData.hasElevatorImmeuble;
      }

      const submitData: CreateCrmDealRequest | UpdateCrmDealRequest = {
        contactId: formData.contactId,
        type: formData.type,
        budgetMin: formData.budgetMin ? parseFloat(formData.budgetMin) : undefined,
        budgetMax: formData.budgetMax ? parseFloat(formData.budgetMax) : undefined,
        locationZone: formData.locationZone.trim() || undefined,
        expectedValue: formData.expectedValue ? parseFloat(formData.expectedValue) : undefined,
        assignedToUserId: formData.assignedToUserId || undefined,
        criteriaJson: Object.keys(criteriaJson).length > 0 ? criteriaJson : undefined,
        ...(deal ? { version: deal.version } : {}),
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
        setErrors({ submit: 'Une erreur est survenue lors de l\'enregistrement de l\'affaire' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: string, value: string | boolean | GeographicLocation | null) => {
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
    // Parse the value to remove formatting
    const numericValue = parseNumber(value);
    // Store the numeric value (without spaces)
    setFormData((prev) => ({ ...prev, [field]: numericValue }));
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
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {errors.submit}
        </div>
      )}

      {/* Section: Informations générales et Budget en 2 colonnes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Colonne gauche: Informations générales */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Informations générales</h3>
          
          <div className="space-y-4">
            <div>
              <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
                Type d'affaire <span className="text-red-500">*</span>
              </label>
              <select
                id="type"
                value={formData.type}
                onChange={(e) => handleChange('type', e.target.value)}
                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                required
              >
                <option value="ACHAT">Achat</option>
                <option value="LOCATION">Location</option>
                <option value="VENTE">Vente</option>
                <option value="GESTION">Gestion de biens</option>
                <option value="MANDAT">Mandat</option>
              </select>
            </div>

            {!contactId && (
              <div>
                <label htmlFor="contactId" className="block text-sm font-medium text-gray-700 mb-1">
                  Contact <span className="text-red-500">*</span>
                </label>
                {loadingContacts ? (
                  <div className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm items-center">
                    <span className="text-gray-500">Chargement des contacts...</span>
                  </div>
                ) : (
                  <select
                    id="contactId"
                    value={formData.contactId}
                    onChange={(e) => handleChange('contactId', e.target.value)}
                    className={`flex h-10 w-full rounded-md border ${
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
                  <p className="mt-1 text-sm text-red-600">{errors.contactId}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Colonne droite: Budget et localisation */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Budget et localisation</h3>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="budgetMin" className="block text-sm font-medium text-gray-700 mb-1">
                  Budget minimum (FCFA)
                </label>
                <Input
                  id="budgetMin"
                  type="text"
                  value={formatNumber(formData.budgetMin)}
                  onChange={(e) => handleNumberChange('budgetMin', e.target.value)}
                  placeholder="0"
                  inputMode="numeric"
                />
              </div>

              <div>
                <label htmlFor="budgetMax" className="block text-sm font-medium text-gray-700 mb-1">
                  Budget maximum (FCFA)
                </label>
                <Input
                  id="budgetMax"
                  type="text"
                  value={formatNumber(formData.budgetMax)}
                  onChange={(e) => handleNumberChange('budgetMax', e.target.value)}
                  className={errors.budgetMax ? 'border-red-500' : ''}
                  placeholder="0"
                  inputMode="numeric"
                />
                {errors.budgetMax && (
                  <p className="mt-1 text-sm text-red-600">{errors.budgetMax}</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Zone géographique (Commune)
              </label>
              <LocationSelector
                value={formData.location?.communeId}
                onChange={(location) => {
                  if (location) {
                    handleChange('locationZone', location.commune);
                    handleChange('location', location);
                  } else {
                    handleChange('locationZone', '');
                    handleChange('location', null);
                  }
                }}
                placeholder="Rechercher une commune (ex: Cocody, Abidjan, Côte d'Ivoire)..."
              />
            </div>
          </div>
        </div>
      </div>

      {/* Section: Type de bien et critères en split screen */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Colonne gauche: Type de bien */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Type de bien</h3>
          
          <div>
            <label htmlFor="propertyType" className="block text-sm font-medium text-gray-700 mb-1">
              Type de bien
            </label>
            <select
              id="propertyType"
              value={formData.propertyType}
              onChange={(e) => handleChange('propertyType', e.target.value)}
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">Sélectionner un type</option>
              <option value="APPARTEMENT">Appartement</option>
              <option value="VILLA">Villa</option>
              <option value="MAISON">Maison</option>
              <option value="TERRAIN">Terrain</option>
              <option value="BUREAU">Bureau</option>
              <option value="COMMERCE">Local commercial</option>
              <option value="STUDIO">Studio</option>
              <option value="DUPLEX">Duplex</option>
              <option value="PENTHOUSE">Penthouse</option>
              <option value="IMMEUBLE">Immeuble</option>
              <option value="AUTRE">Autre</option>
            </select>
          </div>

          <div>
            <label htmlFor="expectedValue" className="block text-sm font-medium text-gray-700 mb-1">
              Valeur estimée de la transaction (FCFA)
            </label>
            <Input
              id="expectedValue"
              type="text"
              value={formatNumber(formData.expectedValue)}
              onChange={(e) => handleNumberChange('expectedValue', e.target.value)}
              placeholder="0"
              inputMode="numeric"
            />
            <p className="mt-1 text-xs text-gray-500">
              Montant estimé auquel l'affaire devrait se conclure (différent du budget client)
            </p>
          </div>
        </div>

        {/* Colonne droite: Critères spécifiques */}
        {!formData.propertyType ? (
          <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Critères spécifiques</h3>
            <p className="text-sm text-gray-500 italic">Sélectionnez un type de bien pour voir les critères disponibles</p>
          </div>
        ) : (
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-6 space-y-5 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 bg-blue-600 rounded-full"></div>
            <h3 className="text-base font-semibold text-blue-900">
              Critères spécifiques - {formData.propertyType === 'APPARTEMENT' ? 'Appartement' :
                formData.propertyType === 'VILLA' ? 'Villa' :
                formData.propertyType === 'MAISON' ? 'Maison' :
                formData.propertyType === 'TERRAIN' ? 'Terrain' :
                formData.propertyType === 'BUREAU' ? 'Bureau' :
                formData.propertyType === 'COMMERCE' ? 'Local commercial' :
                formData.propertyType === 'STUDIO' ? 'Studio' :
                formData.propertyType === 'DUPLEX' ? 'Duplex' :
                formData.propertyType === 'PENTHOUSE' ? 'Penthouse' : 'Autre'}
            </h3>
          </div>

          {/* Common fields for most property types */}
          {['APPARTEMENT', 'VILLA', 'MAISON', 'STUDIO', 'DUPLEX', 'PENTHOUSE'].includes(formData.propertyType) && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {formData.propertyType !== 'STUDIO' && (
                  <div>
                    <label htmlFor="rooms" className="block text-sm font-medium text-gray-700 mb-1">
                      Nombre de pièces
                    </label>
                    <Input
                      id="rooms"
                      type="number"
                      min="0"
                      value={formData.rooms}
                      onChange={(e) => handleChange('rooms', e.target.value)}
                      placeholder="ex. : 3"
                    />
                  </div>
                )}
                <div>
                  <label htmlFor="surface" className="block text-sm font-medium text-gray-700 mb-1">
                    Surface (m²)
                  </label>
                  <Input
                    id="surface"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.surface}
                    onChange={(e) => handleChange('surface', e.target.value)}
                    placeholder="ex. : 120"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="furnishingStatus" className="block text-sm font-medium text-gray-700 mb-1">
                  État du meublé
                </label>
                <select
                  id="furnishingStatus"
                  value={formData.furnishingStatus}
                  onChange={(e) => handleChange('furnishingStatus', e.target.value)}
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Indifférent</option>
                  <option value="MEUBLE">Meublé</option>
                  <option value="SEMI_MEUBLE">Semi-meublé</option>
                  <option value="NON_MEUBLE">Non meublé</option>
                </select>
              </div>
            </>
          )}

          {/* Apartment/Studio/Duplex specific fields */}
          {['APPARTEMENT', 'STUDIO', 'DUPLEX'].includes(formData.propertyType) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="floor" className="block text-sm font-medium text-gray-700 mb-1">
                  Étage
                </label>
                <Input
                  id="floor"
                  type="number"
                  value={formData.floor}
                  onChange={(e) => handleChange('floor', e.target.value)}
                  placeholder="ex. : 2"
                />
              </div>
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700 mb-2">Équipements</label>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.hasElevator}
                      onChange={(e) => handleChange('hasElevator', e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Ascenseur</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.hasParking}
                      onChange={(e) => handleChange('hasParking', e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Parking</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.hasBalcony}
                      onChange={(e) => handleChange('hasBalcony', e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Balcon</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Villa/House specific fields */}
          {['VILLA', 'MAISON'].includes(formData.propertyType) && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="surface" className="block text-sm font-medium text-gray-700 mb-1">
                    Surface habitable (m²)
                  </label>
                  <Input
                    id="surface"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.surface}
                    onChange={(e) => handleChange('surface', e.target.value)}
                    placeholder="ex. : 200"
                  />
                </div>
                <div>
                  <label htmlFor="landArea" className="block text-sm font-medium text-gray-700 mb-1">
                    Surface du terrain (m²)
                  </label>
                  <Input
                    id="landArea"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.landArea}
                    onChange={(e) => handleChange('landArea', e.target.value)}
                    placeholder="ex. : 500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Équipements</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.hasGarden}
                      onChange={(e) => handleChange('hasGarden', e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Jardin</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.hasPool}
                      onChange={(e) => handleChange('hasPool', e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Piscine</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.hasGarage}
                      onChange={(e) => handleChange('hasGarage', e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Garage</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.hasParking}
                      onChange={(e) => handleChange('hasParking', e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Parking</span>
                  </label>
                </div>
              </div>
            </>
          )}

          {/* Land specific fields */}
          {formData.propertyType === 'TERRAIN' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="landArea" className="block text-sm font-medium text-gray-700 mb-1">
                    Superficie (m²)
                  </label>
                  <Input
                    id="landArea"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.landArea}
                    onChange={(e) => handleChange('landArea', e.target.value)}
                    placeholder="ex. : 500"
                  />
                </div>
                <div>
                  <label htmlFor="landType" className="block text-sm font-medium text-gray-700 mb-1">
                    Type de terrain
                  </label>
                  <select
                    id="landType"
                    value={formData.landType}
                    onChange={(e) => handleChange('landType', e.target.value)}
                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">Sélectionner</option>
                    <option value="URBAIN">Urbain</option>
                    <option value="VILLAGE">Village</option>
                    <option value="AGRICOLE">Agricole</option>
                    <option value="INDUSTRIEL">Industriel</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.isServiced}
                    onChange={(e) => handleChange('isServiced', e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">Viabilisé (eau, électricité, etc.)</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.isBuildable}
                    onChange={(e) => handleChange('isBuildable', e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">Constructible</span>
                </label>
              </div>
            </>
          )}

          {/* Office specific fields */}
          {formData.propertyType === 'BUREAU' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="surface" className="block text-sm font-medium text-gray-700 mb-1">
                    Surface (m²)
                  </label>
                  <Input
                    id="surface"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.surface}
                    onChange={(e) => handleChange('surface', e.target.value)}
                    placeholder="ex. : 150"
                  />
                </div>
                <div>
                  <label htmlFor="officeCount" className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre de bureaux
                  </label>
                  <Input
                    id="officeCount"
                    type="number"
                    min="0"
                    value={formData.officeCount}
                    onChange={(e) => handleChange('officeCount', e.target.value)}
                    placeholder="ex. : 5"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.hasReception}
                    onChange={(e) => handleChange('hasReception', e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">Réception</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.hasParking}
                    onChange={(e) => handleChange('hasParking', e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">Parking</span>
                </label>
              </div>
            </>
          )}

          {/* Commercial specific fields */}
          {formData.propertyType === 'COMMERCE' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="surface" className="block text-sm font-medium text-gray-700 mb-1">
                    Surface (m²)
                  </label>
                  <Input
                    id="surface"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.surface}
                    onChange={(e) => handleChange('surface', e.target.value)}
                    placeholder="ex. : 80"
                  />
                </div>
                <div>
                  <label htmlFor="commercialType" className="block text-sm font-medium text-gray-700 mb-1">
                    Type de commerce
                  </label>
                  <select
                    id="commercialType"
                    value={formData.commercialType}
                    onChange={(e) => handleChange('commercialType', e.target.value)}
                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">Sélectionner</option>
                    <option value="RESTAURANT">Restaurant</option>
                    <option value="BOUTIQUE">Boutique</option>
                    <option value="SUPERMARCHE">Supermarché</option>
                    <option value="PHARMACIE">Pharmacie</option>
                    <option value="SALON">Salon de coiffure</option>
                    <option value="AUTRE">Autre</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.hasStorefront}
                    onChange={(e) => handleChange('hasStorefront', e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">Vitrine</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.hasParking}
                    onChange={(e) => handleChange('hasParking', e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">Parking</span>
                </label>
              </div>
            </>
          )}

          {/* Penthouse specific fields */}
          {formData.propertyType === 'PENTHOUSE' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="floor" className="block text-sm font-medium text-gray-700 mb-1">
                  Étage
                </label>
                <Input
                  id="floor"
                  type="number"
                  value={formData.floor}
                  onChange={(e) => handleChange('floor', e.target.value)}
                  placeholder="ex. : 10"
                />
              </div>
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700 mb-2">Équipements</label>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.hasTerrace}
                      onChange={(e) => handleChange('hasTerrace', e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Terrasse</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.hasElevator}
                      onChange={(e) => handleChange('hasElevator', e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Ascenseur</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.hasParking}
                      onChange={(e) => handleChange('hasParking', e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Parking</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Studio specific - simplified */}
          {formData.propertyType === 'STUDIO' && (
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.hasBalcony}
                  onChange={(e) => handleChange('hasBalcony', e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">Balcon</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.hasParking}
                  onChange={(e) => handleChange('hasParking', e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">Parking</span>
              </label>
            </div>
          )}

          {/* Immeuble specific fields */}
          {formData.propertyType === 'IMMEUBLE' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="floorsCount" className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre d'étages
                  </label>
                  <Input
                    id="floorsCount"
                    type="number"
                    min="1"
                    value={formData.floorsCount}
                    onChange={(e) => handleChange('floorsCount', e.target.value)}
                    placeholder="ex. : 5"
                  />
                </div>
                <div>
                  <label htmlFor="apartmentsCount" className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre d'appartements
                  </label>
                  <Input
                    id="apartmentsCount"
                    type="number"
                    min="0"
                    value={formData.apartmentsCount}
                    onChange={(e) => handleChange('apartmentsCount', e.target.value)}
                    placeholder="ex. : 18"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="standing" className="block text-sm font-medium text-gray-700 mb-1">
                  Standing
                </label>
                <select
                  id="standing"
                  value={formData.standing}
                  onChange={(e) => handleChange('standing', e.target.value)}
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Sélectionner un standing</option>
                  <option value="ECONOMIQUE">Économique</option>
                  <option value="STANDARD">Standard</option>
                  <option value="HAUT_STANDING">Haut standing</option>
                  <option value="LUXE">Luxe</option>
                  <option value="PRESTIGE">Prestige</option>
                </select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="parkingSpaces" className="block text-sm font-medium text-gray-700 mb-1">
                    Places de parking
                  </label>
                  <Input
                    id="parkingSpaces"
                    type="number"
                    min="0"
                    value={formData.parkingSpaces}
                    onChange={(e) => handleChange('parkingSpaces', e.target.value)}
                    placeholder="ex. : 15"
                  />
                </div>
                <div>
                  <label htmlFor="occupancyRate" className="block text-sm font-medium text-gray-700 mb-1">
                    Taux d'occupation (%)
                  </label>
                  <Input
                    id="occupancyRate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={formData.occupancyRate}
                    onChange={(e) => handleChange('occupancyRate', e.target.value)}
                    placeholder="ex. : 75"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.hasElevatorImmeuble}
                    onChange={(e) => handleChange('hasElevatorImmeuble', e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">Ascenseur</span>
                </label>
              </div>
            </>
          )}

          {/* Autre - description textarea */}
          {formData.propertyType === 'AUTRE' && (
            <div>
              <label htmlFor="otherDescription" className="block text-sm font-medium text-gray-700 mb-1">
                Description du type de bien
              </label>
              <textarea
                id="otherDescription"
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                className="flex min-h-[120px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="Décrivez le type de bien recherché (ex: entrepôt, hangar, local industriel, etc.)"
              />
            </div>
          )}
          </div>
        )}
      </div>

      {/* Section: Description et valeur estimée */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Informations complémentaires</h3>
        
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
            Description / Besoins spécifiques
          </label>
          <textarea
            id="description"
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
            className="flex min-h-[100px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            placeholder="Décrivez les besoins spécifiques du client, contraintes particulières, équipements souhaités, etc."
          />
        </div>
      </div>

      <div className="flex justify-end space-x-3 pt-4">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting || loading}>
            Annuler
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting || loading}>
          {isSubmitting || loading ? 'Enregistrement...' : deal ? 'Mettre à jour l\'affaire' : 'Créer l\'affaire'}
        </Button>
      </div>
    </form>
  );
};

