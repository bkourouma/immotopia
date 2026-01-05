import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { LocationSelector } from '../ui/location-selector';
import { GeographicLocation, getLocationByCommuneId } from '../../services/geographic-service';
import { CreateCrmContactRequest, UpdateCrmContactRequest, CrmContact } from '../../types/crm-types';
import { CommuneMultiSelect } from './CommuneMultiSelect';
import { formatNumberWithSpaces, parseFormattedNumber } from '../../lib/utils';

interface ContactFormProps {
  contact?: CrmContact;
  onSubmit: (data: CreateCrmContactRequest | UpdateCrmContactRequest) => Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
}

export const ContactForm: React.FC<ContactFormProps> = ({
  contact,
  onSubmit,
  onCancel,
  loading = false,
}) => {
  const [activeTab, setActiveTab] = useState('basic');
  const [formData, setFormData] = useState({
    // Contact Type
    contactType: (contact?.contactType || 'PERSON') as 'PERSON' | 'COMPANY',
    
    // Basic Information
    firstName: contact?.firstName || '',
    lastName: contact?.lastName || '',
    email: contact?.email || '',
    phonePrimary: contact?.phonePrimary || contact?.phone || '',
    phoneSecondary: contact?.phoneSecondary || '',
    phonePrimaryIsWhatsApp: (contact as any)?.phonePrimaryIsWhatsApp || false,
    phoneSecondaryIsWhatsApp: (contact as any)?.phoneSecondaryIsWhatsApp || false,
    
    // Person Identification
    civility: contact?.civility || '',
    dateOfBirth: contact?.dateOfBirth ? new Date(contact.dateOfBirth).toISOString().split('T')[0] : '',
    nationality: contact?.nationality || 'Ivoirienne',
    identityDocumentType: contact?.identityDocumentType || '',
    identityDocumentNumber: contact?.identityDocumentNumber || contact?.numeroPieceId || '',
    identityDocumentExpiry: contact?.identityDocumentExpiry ? new Date(contact.identityDocumentExpiry).toISOString().split('T')[0] : '',
    profilePhotoUrl: contact?.profilePhotoUrl || '',
    
    // Company Identification
    legalName: contact?.legalName || '',
    legalForm: contact?.legalForm || '',
    rccm: contact?.rccm || '',
    taxId: contact?.taxId || '',
    representativeName: contact?.representativeName || '',
    representativeRole: contact?.representativeRole || '',
    
    // Contact Information
    emailSecondary: contact?.emailSecondary || '',
    address: contact?.address || '',
    location: null as GeographicLocation | null,
    locationZone: contact?.locationZone || '',
    targetZoneIds: (contact as any)?.targetZones?.map((tz: any) => tz.communeId || tz.commune?.id) || [],
    preferredLanguage: contact?.preferredLanguage || '',
    preferredContactChannel: contact?.preferredContactChannel || '',
    
    // Professional Profile
    profession: contact?.profession || contact?.fonction || '',
    sectorOfActivity: contact?.sectorOfActivity || '',
    employer: contact?.employer || '',
    incomeMin: contact?.incomeMin?.toString() || '',
    incomeMax: contact?.incomeMax?.toString() || '',
    jobStability: contact?.jobStability || '',
    borrowingCapacity: contact?.borrowingCapacity || '',
    salaire: contact?.salaire?.toString() || '',
    
    // CRM Behavior & Scoring
    source: contact?.source || '',
    leadSource: contact?.leadSource || '',
    maturityLevel: contact?.maturityLevel || 'COLD',
    score: contact?.score?.toString() || '0',
    priorityLevel: contact?.priorityLevel || 'NORMAL',
    assignedToUserId: contact?.assignedToUserId || '',
    
    // Consents & Compliance
    consentMarketing: contact?.consentMarketing || false,
    consentWhatsapp: contact?.consentWhatsapp || false,
    consentEmail: contact?.consentEmail || false,
    consentSource: contact?.consentSource || '',
    
    // Internal Notes
    internalNotes: contact?.internalNotes || '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (contact) {
      setFormData({
        contactType: (contact.contactType || 'PERSON') as 'PERSON' | 'COMPANY',
        firstName: contact.firstName || '',
        lastName: contact.lastName || '',
        email: contact.email || '',
        phonePrimary: contact.phonePrimary || contact.phone || '',
        phoneSecondary: contact.phoneSecondary || '',
        phonePrimaryIsWhatsApp: (contact as any)?.phonePrimaryIsWhatsApp || false,
        phoneSecondaryIsWhatsApp: (contact as any)?.phoneSecondaryIsWhatsApp || false,
        civility: contact.civility || '',
        dateOfBirth: contact.dateOfBirth ? new Date(contact.dateOfBirth).toISOString().split('T')[0] : '',
        nationality: contact.nationality || 'Ivoirienne',
        identityDocumentType: contact.identityDocumentType || '',
        identityDocumentNumber: contact.identityDocumentNumber || contact.numeroPieceId || '',
        identityDocumentExpiry: contact.identityDocumentExpiry ? new Date(contact.identityDocumentExpiry).toISOString().split('T')[0] : '',
        profilePhotoUrl: contact.profilePhotoUrl || '',
        legalName: contact.legalName || '',
        legalForm: contact.legalForm || '',
        rccm: contact.rccm || '',
        taxId: contact.taxId || '',
        representativeName: contact.representativeName || '',
        representativeRole: contact.representativeRole || '',
        emailSecondary: contact.emailSecondary || '',
        address: contact.address || '',
        location: null as GeographicLocation | null, // Will be loaded from communeId if available
        locationZone: contact.locationZone || '',
        targetZoneIds: (contact as any)?.targetZones?.map((tz: any) => tz.communeId || tz.commune?.id) || [],
        preferredLanguage: contact.preferredLanguage || '',
        preferredContactChannel: contact.preferredContactChannel || '',
        profession: contact.profession || contact.fonction || '',
        sectorOfActivity: contact.sectorOfActivity || '',
        employer: contact.employer || '',
        incomeMin: contact.incomeMin?.toString() || '',
        incomeMax: contact.incomeMax?.toString() || '',
        jobStability: contact.jobStability || '',
        borrowingCapacity: contact.borrowingCapacity || '',
        salaire: contact.salaire?.toString() || '',
        source: contact.source || '',
        leadSource: contact.leadSource || '',
        maturityLevel: contact.maturityLevel || 'COLD',
        score: contact.score?.toString() || '0',
        priorityLevel: contact.priorityLevel || 'NORMAL',
        assignedToUserId: contact.assignedToUserId || '',
        consentMarketing: contact.consentMarketing || false,
        consentWhatsapp: contact.consentWhatsapp || false,
        consentEmail: contact.consentEmail || false,
        consentSource: contact.consentSource || '',
        internalNotes: contact.internalNotes || '',
      });
    }
  }, [contact]);

  // Load location from communeId if available
  useEffect(() => {
    const loadLocation = async () => {
      // For now, we'll need to add communeId to the Contact type
      // This will be handled when we update the backend to return communeId
      if (contact && (contact as any).communeId) {
        try {
          const location = await getLocationByCommuneId((contact as any).communeId);
          if (location) {
            setFormData(prev => ({ ...prev, location }));
          }
        } catch (error) {
          console.error('Error loading location:', error);
        }
      }
    };
    loadLocation();
  }, [contact]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.firstName.trim()) {
      newErrors.firstName = 'Le prénom est requis';
    }

    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Le nom est requis';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'L\'email est requis';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Adresse email invalide';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      setActiveTab('basic');
      return;
    }

    setIsSubmitting(true);
    try {
      const submitData: CreateCrmContactRequest | UpdateCrmContactRequest = {
        contactType: formData.contactType,
        civility: formData.civility as any,
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim().toLowerCase(),
        phonePrimary: formData.phonePrimary.trim() || undefined,
        phoneSecondary: formData.phoneSecondary.trim() || undefined,
        whatsappNumber: formData.phonePrimaryIsWhatsApp ? formData.phonePrimary.trim() || undefined : (formData.phoneSecondaryIsWhatsApp ? formData.phoneSecondary.trim() || undefined : undefined),
        dateOfBirth: formData.dateOfBirth || undefined,
        nationality: formData.nationality.trim() || undefined,
        identityDocumentType: formData.identityDocumentType as any,
        identityDocumentNumber: formData.identityDocumentNumber.trim() || undefined,
        identityDocumentExpiry: formData.identityDocumentExpiry || undefined,
        profilePhotoUrl: formData.profilePhotoUrl && formData.profilePhotoUrl.startsWith('data:') ? formData.profilePhotoUrl : (formData.profilePhotoUrl ? formData.profilePhotoUrl.trim() : undefined),
        ...(formData.contactType === 'COMPANY' ? {
          legalName: formData.legalName.trim() || undefined,
          legalForm: formData.legalForm ? (formData.legalForm as any) : undefined,
          rccm: formData.rccm.trim() || undefined,
          taxId: formData.taxId.trim() || undefined,
          representativeName: formData.representativeName.trim() || undefined,
          representativeRole: formData.representativeRole.trim() || undefined,
        } : {}),
        emailSecondary: formData.emailSecondary.trim() || undefined,
        address: formData.address.trim() || undefined,
        communeId: formData.location?.communeId || undefined,
        locationZone: formData.locationZone.trim() || undefined,
        targetZoneIds: formData.targetZoneIds && formData.targetZoneIds.length > 0 ? formData.targetZoneIds : undefined,
        preferredLanguage: formData.preferredLanguage.trim() || undefined,
        preferredContactChannel: formData.preferredContactChannel as any,
        profession: formData.profession.trim() || undefined,
        sectorOfActivity: formData.sectorOfActivity.trim() || undefined,
        employer: formData.employer.trim() || undefined,
        incomeMin: formData.incomeMin ? parseFloat(parseFormattedNumber(formData.incomeMin)) : undefined,
        incomeMax: formData.incomeMax ? parseFloat(parseFormattedNumber(formData.incomeMax)) : undefined,
        jobStability: formData.jobStability as any,
        borrowingCapacity: formData.borrowingCapacity as any,
        salaire: formData.salaire.trim() ? parseFloat(formData.salaire) : undefined,
        source: formData.source.trim() || undefined,
        leadSource: formData.leadSource as any,
        maturityLevel: formData.maturityLevel as any,
        score: formData.score ? parseInt(formData.score) : undefined,
        priorityLevel: formData.priorityLevel as any,
        assignedToUserId: formData.assignedToUserId || undefined,
        consentMarketing: formData.consentMarketing,
        consentWhatsapp: formData.consentWhatsapp,
        consentEmail: formData.consentEmail,
        consentSource: formData.consentSource.trim() || undefined,
        internalNotes: formData.internalNotes.trim() || undefined,
        // Legacy fields for backward compatibility
        phone: formData.phonePrimary.trim() || undefined,
        numeroPieceId: formData.identityDocumentNumber.trim() || undefined,
        fonction: formData.profession.trim() || undefined,
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
        setErrors({ submit: 'Une erreur est survenue lors de l\'enregistrement du contact' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: string, value: string | boolean | GeographicLocation | null | string[]) => {
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
    // Remove spaces for storage, but keep formatted for display
    const cleaned = parseFormattedNumber(value);
    handleChange(field, cleaned);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 overflow-visible">
      {errors.submit && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {errors.submit}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full overflow-visible">
        <TabsList className="grid w-full grid-cols-5 lg:grid-cols-6 bg-gray-50 border border-gray-300 rounded-lg p-1 gap-1 shadow-sm">
          <TabsTrigger 
            value="basic"
            className="data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:font-semibold data-[state=active]:shadow-md data-[state=inactive]:bg-white data-[state=inactive]:text-gray-700 data-[state=inactive]:hover:bg-gray-100 border-r border-gray-300 last:border-r-0 transition-all"
          >
            Basique
          </TabsTrigger>
          <TabsTrigger 
            value="identification"
            className="data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:font-semibold data-[state=active]:shadow-md data-[state=inactive]:bg-white data-[state=inactive]:text-gray-700 data-[state=inactive]:hover:bg-gray-100 border-r border-gray-300 last:border-r-0 transition-all"
          >
            Identité
          </TabsTrigger>
          <TabsTrigger 
            value="contact"
            className="data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:font-semibold data-[state=active]:shadow-md data-[state=inactive]:bg-white data-[state=inactive]:text-gray-700 data-[state=inactive]:hover:bg-gray-100 border-r border-gray-300 last:border-r-0 transition-all"
          >
            Contact
          </TabsTrigger>
          <TabsTrigger 
            value="professional"
            className="data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:font-semibold data-[state=active]:shadow-md data-[state=inactive]:bg-white data-[state=inactive]:text-gray-700 data-[state=inactive]:hover:bg-gray-100 border-r border-gray-300 last:border-r-0 transition-all"
          >
            Professionnel
          </TabsTrigger>
          <TabsTrigger 
            value="crm"
            className="data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:font-semibold data-[state=active]:shadow-md data-[state=inactive]:bg-white data-[state=inactive]:text-gray-700 data-[state=inactive]:hover:bg-gray-100 border-r border-gray-300 last:border-r-0 transition-all"
          >
            CRM
          </TabsTrigger>
          <TabsTrigger 
            value="consents"
            className="data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:font-semibold data-[state=active]:shadow-md data-[state=inactive]:bg-white data-[state=inactive]:text-gray-700 data-[state=inactive]:hover:bg-gray-100 last:border-r-0 transition-all"
          >
            Consentements
          </TabsTrigger>
        </TabsList>

        {/* Basic Information Tab */}
        <TabsContent value="basic" className="space-y-4 mt-4 overflow-visible bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Type de contact <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="contactType"
                    value="PERSON"
                    checked={formData.contactType === 'PERSON'}
                    onChange={(e) => handleChange('contactType', e.target.value)}
                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Personne</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="contactType"
                    value="COMPANY"
                    checked={formData.contactType === 'COMPANY'}
                    onChange={(e) => handleChange('contactType', e.target.value)}
                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Entreprise</span>
                </label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
                Prénom <span className="text-red-500">*</span>
              </label>
              <Input
                id="firstName"
                value={formData.firstName}
                onChange={(e) => handleChange('firstName', e.target.value)}
                className={errors.firstName ? 'border-red-500' : ''}
                required
              />
              {errors.firstName && <p className="mt-1 text-sm text-red-600">{errors.firstName}</p>}
            </div>

            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
                Nom <span className="text-red-500">*</span>
              </label>
              <Input
                id="lastName"
                value={formData.lastName}
                onChange={(e) => handleChange('lastName', e.target.value)}
                className={errors.lastName ? 'border-red-500' : ''}
                required
              />
              {errors.lastName && <p className="mt-1 text-sm text-red-600">{errors.lastName}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email personnel <span className="text-red-500">*</span>
              </label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                className={errors.email ? 'border-red-500' : ''}
                required
              />
              {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
            </div>

            <div>
              <label htmlFor="emailSecondary" className="block text-sm font-medium text-gray-700 mb-1">
                Email professionnel
              </label>
              <Input
                id="emailSecondary"
                type="email"
                value={formData.emailSecondary}
                onChange={(e) => handleChange('emailSecondary', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="phonePrimary" className="block text-sm font-medium text-gray-700 mb-1">
                Téléphone principal
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="phonePrimaryIsWhatsApp"
                  checked={formData.phonePrimaryIsWhatsApp}
                  onChange={(e) => handleChange('phonePrimaryIsWhatsApp', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="phonePrimaryIsWhatsApp" className="text-sm text-gray-700">
                  WhatsApp
                </label>
              </div>
              <Input
                id="phonePrimary"
                type="tel"
                value={formData.phonePrimary}
                onChange={(e) => handleChange('phonePrimary', e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <label htmlFor="phoneSecondary" className="block text-sm font-medium text-gray-700 mb-1">
                Téléphone secondaire
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="phoneSecondaryIsWhatsApp"
                  checked={formData.phoneSecondaryIsWhatsApp}
                  onChange={(e) => handleChange('phoneSecondaryIsWhatsApp', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="phoneSecondaryIsWhatsApp" className="text-sm text-gray-700">
                  WhatsApp
                </label>
              </div>
              <Input
                id="phoneSecondary"
                type="tel"
                value={formData.phoneSecondary}
                onChange={(e) => handleChange('phoneSecondary', e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
        </TabsContent>

        {/* Identification Tab */}
        <TabsContent value="identification" className="space-y-4 mt-4 overflow-visible bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          {formData.contactType === 'PERSON' ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Civilité</label>
                  <Select value={formData.civility} onValueChange={(v) => handleChange('civility', v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MR">Monsieur</SelectItem>
                      <SelectItem value="MRS">Madame</SelectItem>
                      <SelectItem value="MS">Mademoiselle</SelectItem>
                      <SelectItem value="DR">Docteur</SelectItem>
                      <SelectItem value="PROF">Professeur</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label htmlFor="dateOfBirth" className="block text-sm font-medium text-gray-700 mb-1">
                    Date de naissance
                  </label>
                  <Input
                    id="dateOfBirth"
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={(e) => handleChange('dateOfBirth', e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="nationality" className="block text-sm font-medium text-gray-700 mb-1">
                  Nationalité
                </label>
                <Input
                  id="nationality"
                  value={formData.nationality}
                  onChange={(e) => handleChange('nationality', e.target.value)}
                  placeholder="ex: Ivoirienne, Française"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type de pièce</label>
                  <Select value={formData.identityDocumentType} onValueChange={(v) => handleChange('identityDocumentType', v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CNI">CNI</SelectItem>
                      <SelectItem value="PASSPORT">Passeport</SelectItem>
                      <SelectItem value="DRIVING_LICENSE">Permis de conduire</SelectItem>
                      <SelectItem value="OTHER">Autre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label htmlFor="identityDocumentNumber" className="block text-sm font-medium text-gray-700 mb-1">
                    Numéro de pièce
                  </label>
                  <Input
                    id="identityDocumentNumber"
                    value={formData.identityDocumentNumber}
                    onChange={(e) => handleChange('identityDocumentNumber', e.target.value)}
                    placeholder="Numéro CNI, Passeport, etc."
                  />
                </div>

                <div>
                  <label htmlFor="identityDocumentExpiry" className="block text-sm font-medium text-gray-700 mb-1">
                    Date d'expiration
                  </label>
                  <Input
                    id="identityDocumentExpiry"
                    type="date"
                    value={formData.identityDocumentExpiry}
                    onChange={(e) => handleChange('identityDocumentExpiry', e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Photo de profil
                </label>
                <div className="space-y-2">
                  {formData.profilePhotoUrl && (
                    <div className="relative inline-block">
                      <img
                        src={formData.profilePhotoUrl}
                        alt="Profile"
                        className="h-20 w-20 rounded-full object-cover border-2 border-gray-300"
                      />
                      <button
                        type="button"
                        onClick={() => handleChange('profilePhotoUrl', '')}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 text-xs hover:bg-red-600"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  <div>
                    <input
                      type="file"
                      id="profilePhoto"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            handleChange('profilePhotoUrl', reader.result as string);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById('profilePhoto')?.click()}
                    >
                      {formData.profilePhotoUrl ? 'Changer la photo' : 'Télécharger une photo'}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <label htmlFor="legalName" className="block text-sm font-medium text-gray-700 mb-1">
                  Raison sociale <span className="text-red-500">*</span>
                </label>
                <Input
                  id="legalName"
                  value={formData.legalName}
                  onChange={(e) => handleChange('legalName', e.target.value)}
                  required={formData.contactType === 'COMPANY'}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Forme juridique</label>
                  <Select value={formData.legalForm} onValueChange={(v) => handleChange('legalForm', v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SARL">SARL</SelectItem>
                      <SelectItem value="SA">SA</SelectItem>
                      <SelectItem value="EI">EI</SelectItem>
                      <SelectItem value="EURL">EURL</SelectItem>
                      <SelectItem value="SAS">SAS</SelectItem>
                      <SelectItem value="ASSOCIATION">Association</SelectItem>
                      <SelectItem value="OTHER">Autre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label htmlFor="rccm" className="block text-sm font-medium text-gray-700 mb-1">RCCM</label>
                  <Input
                    id="rccm"
                    value={formData.rccm}
                    onChange={(e) => handleChange('rccm', e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="taxId" className="block text-sm font-medium text-gray-700 mb-1">Numéro fiscal</label>
                <Input
                  id="taxId"
                  value={formData.taxId}
                  onChange={(e) => handleChange('taxId', e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="representativeName" className="block text-sm font-medium text-gray-700 mb-1">
                    Nom du représentant
                  </label>
                  <Input
                    id="representativeName"
                    value={formData.representativeName}
                    onChange={(e) => handleChange('representativeName', e.target.value)}
                  />
                </div>

                <div>
                  <label htmlFor="representativeRole" className="block text-sm font-medium text-gray-700 mb-1">
                    Fonction du représentant
                  </label>
                  <Input
                    id="representativeRole"
                    value={formData.representativeRole}
                    onChange={(e) => handleChange('representativeRole', e.target.value)}
                  />
                </div>
              </div>
            </>
          )}
        </TabsContent>

        {/* Contact Information Tab */}
        <TabsContent value="contact" className="space-y-4 mt-4 overflow-visible bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div>
            <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
              Adresse complète
            </label>
            <Input
              id="address"
              value={formData.address}
              onChange={(e) => handleChange('address', e.target.value)}
              placeholder="Adresse complète"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Localisation (Pays &gt; Région &gt; Commune)
            </label>
            <LocationSelector
              value={formData.location?.communeId}
              onChange={(location) => handleChange('location', location)}
              placeholder="Rechercher une localisation (ex: Cocody, Abidjan, Côte d'Ivoire)..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Langue préférée
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="preferredLanguage"
                    value="Français"
                    checked={formData.preferredLanguage === 'Français'}
                    onChange={(e) => handleChange('preferredLanguage', e.target.value)}
                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Français</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="preferredLanguage"
                    value="Anglais"
                    checked={formData.preferredLanguage === 'Anglais'}
                    onChange={(e) => handleChange('preferredLanguage', e.target.value)}
                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Anglais</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="preferredLanguage"
                    value="Autre"
                    checked={formData.preferredLanguage === 'Autre'}
                    onChange={(e) => handleChange('preferredLanguage', e.target.value)}
                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Autre</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Canal de contact préféré
              </label>
              <Select value={formData.preferredContactChannel} onValueChange={(v) => handleChange('preferredContactChannel', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CALL">Appel</SelectItem>
                  <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                  <SelectItem value="EMAIL">Email</SelectItem>
                  <SelectItem value="SMS">SMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </TabsContent>

        {/* Professional Profile Tab */}
        <TabsContent value="professional" className="space-y-4 mt-4 overflow-visible bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="profession" className="block text-sm font-medium text-gray-700 mb-1">
                Profession / Fonction
              </label>
              <Input
                id="profession"
                value={formData.profession}
                onChange={(e) => handleChange('profession', e.target.value)}
                placeholder="Poste ou fonction"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Secteur d'activité
              </label>
              <Select value={formData.sectorOfActivity} onValueChange={(v) => handleChange('sectorOfActivity', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un secteur" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AGRICULTURE">Agriculture</SelectItem>
                  <SelectItem value="BANQUE_FINANCE">Banque & Finance</SelectItem>
                  <SelectItem value="COMMERCE">Commerce</SelectItem>
                  <SelectItem value="CONSTRUCTION">Construction</SelectItem>
                  <SelectItem value="EDUCATION">Éducation</SelectItem>
                  <SelectItem value="ENERGIE">Énergie</SelectItem>
                  <SelectItem value="INFORMATIQUE_TECHNOLOGIE">Informatique & Technologie</SelectItem>
                  <SelectItem value="IMMOBILIER">Immobilier</SelectItem>
                  <SelectItem value="INDUSTRIE">Industrie</SelectItem>
                  <SelectItem value="SANTE">Santé</SelectItem>
                  <SelectItem value="SERVICES">Services</SelectItem>
                  <SelectItem value="TELECOMMUNICATIONS">Télécommunications</SelectItem>
                  <SelectItem value="TOURISME_HOTELLERIE">Tourisme & Hôtellerie</SelectItem>
                  <SelectItem value="TRANSPORT_LOGISTIQUE">Transport & Logistique</SelectItem>
                  <SelectItem value="AUTRE">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label htmlFor="employer" className="block text-sm font-medium text-gray-700 mb-1">
              Employeur
            </label>
            <Input
              id="employer"
              value={formData.employer}
              onChange={(e) => handleChange('employer', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="incomeMin" className="block text-sm font-medium text-gray-700 mb-1">
                Revenus minimum (FCFA)
              </label>
              <Input
                id="incomeMin"
                type="text"
                value={formatNumberWithSpaces(formData.incomeMin)}
                onChange={(e) => handleNumberChange('incomeMin', e.target.value)}
                placeholder="Ex: 500 000"
                inputMode="numeric"
              />
            </div>

            <div>
              <label htmlFor="incomeMax" className="block text-sm font-medium text-gray-700 mb-1">
                Revenus maximum (FCFA)
              </label>
              <Input
                id="incomeMax"
                type="text"
                value={formatNumberWithSpaces(formData.incomeMax)}
                onChange={(e) => handleNumberChange('incomeMax', e.target.value)}
                placeholder="Ex: 1 000 000"
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="salaire" className="block text-sm font-medium text-gray-700 mb-1">
                Salaire
              </label>
              <Input
                id="salaire"
                type="number"
                step="0.01"
                min="0"
                value={formData.salaire}
                onChange={(e) => handleChange('salaire', e.target.value)}
                placeholder="Montant du salaire"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stabilité professionnelle</label>
              <Select value={formData.jobStability} onValueChange={(v) => handleChange('jobStability', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CDI">CDI</SelectItem>
                  <SelectItem value="CDD">CDD</SelectItem>
                  <SelectItem value="FREELANCE">Freelance</SelectItem>
                  <SelectItem value="INFORMAL">Informel</SelectItem>
                  <SelectItem value="RETIRED">Retraité</SelectItem>
                  <SelectItem value="STUDENT">Étudiant</SelectItem>
                  <SelectItem value="UNEMPLOYED">Sans emploi</SelectItem>
                  <SelectItem value="OTHER">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Capacité d'emprunt</label>
              <Select value={formData.borrowingCapacity} onValueChange={(v) => handleChange('borrowingCapacity', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="YES">Oui</SelectItem>
                  <SelectItem value="NO">Non</SelectItem>
                  <SelectItem value="UNKNOWN">Inconnu</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </TabsContent>

        {/* CRM & Scoring Tab */}
        <TabsContent value="crm" className="space-y-4 mt-4 overflow-visible bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="source" className="block text-sm font-medium text-gray-700 mb-1">
                Source (legacy)
              </label>
              <Input
                id="source"
                value={formData.source}
                onChange={(e) => handleChange('source', e.target.value)}
                placeholder="ex. : Site web, Recommandation, Visite"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Source du lead</label>
              <Select value={formData.leadSource} onValueChange={(v) => handleChange('leadSource', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WEBSITE">Site web</SelectItem>
                  <SelectItem value="SOCIAL_MEDIA">Réseaux sociaux</SelectItem>
                  <SelectItem value="REFERRAL">Parrainage</SelectItem>
                  <SelectItem value="CAMPAIGN">Campagne</SelectItem>
                  <SelectItem value="AGENCY">Agence</SelectItem>
                  <SelectItem value="WALK_IN">Visite spontanée</SelectItem>
                  <SelectItem value="PHONE_CALL">Appel téléphonique</SelectItem>
                  <SelectItem value="OTHER">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Niveau de maturité</label>
              <Select value={formData.maturityLevel} onValueChange={(v) => handleChange('maturityLevel', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="COLD">Froid</SelectItem>
                  <SelectItem value="WARM">Tiède</SelectItem>
                  <SelectItem value="HOT">Chaud</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label htmlFor="score" className="block text-sm font-medium text-gray-700 mb-1">
                Score (0-100)
              </label>
              <Input
                id="score"
                type="number"
                min="0"
                max="100"
                value={formData.score}
                onChange={(e) => handleChange('score', e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priorité</label>
              <Select value={formData.priorityLevel} onValueChange={(v) => handleChange('priorityLevel', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Basse</SelectItem>
                  <SelectItem value="NORMAL">Normale</SelectItem>
                  <SelectItem value="HIGH">Haute</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </TabsContent>

        {/* Consents & Notes Tab */}
        <TabsContent value="consents" className="space-y-4 mt-4 overflow-visible bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700 mb-2">Consentements</label>
            
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="consentMarketing"
                checked={formData.consentMarketing}
                onChange={(e) => handleChange('consentMarketing', e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="consentMarketing" className="text-sm text-gray-700">
                Consentement marketing
              </label>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="consentWhatsapp"
                checked={formData.consentWhatsapp}
                onChange={(e) => handleChange('consentWhatsapp', e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="consentWhatsapp" className="text-sm text-gray-700">
                Consentement WhatsApp
              </label>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="consentEmail"
                checked={formData.consentEmail}
                onChange={(e) => handleChange('consentEmail', e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="consentEmail" className="text-sm text-gray-700">
                Consentement Email
              </label>
            </div>
          </div>

          <div>
            <label htmlFor="consentSource" className="block text-sm font-medium text-gray-700 mb-1">
              Source du consentement
            </label>
            <Input
              id="consentSource"
              value={formData.consentSource}
              onChange={(e) => handleChange('consentSource', e.target.value)}
              placeholder="Comment le consentement a été obtenu"
            />
          </div>

          <div>
            <label htmlFor="internalNotes" className="block text-sm font-medium text-gray-700 mb-1">
              Notes internes
            </label>
            <textarea
              id="internalNotes"
              value={formData.internalNotes}
              onChange={(e) => handleChange('internalNotes', e.target.value)}
              rows={6}
              className="flex w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Notes internes sur le contact..."
            />
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end space-x-3 pt-4 border-t">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting || loading}>
            Annuler
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting || loading}>
          {isSubmitting || loading ? 'Enregistrement...' : contact ? 'Mettre à jour le contact' : 'Créer le contact'}
        </Button>
      </div>
    </form>
  );
};
