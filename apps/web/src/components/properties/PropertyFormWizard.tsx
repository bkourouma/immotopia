import React, { useState, useEffect, useRef } from 'react';
import {
  App,
  Steps,
  Card,
  Space,
  Typography,
  Input,
  Select,
  Button,
  Checkbox,
  InputNumber,
  DatePicker,
  Row,
  Col,
  Alert,
  Spin,
  Empty,
  Divider
} from 'antd';
import { SaveOutlined, ArrowLeftOutlined, ArrowRightOutlined, CheckCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { PropertyTypeSelector } from './PropertyTypeSelector';
import { LocationSelector } from '../ui/location-selector';
import { PropertyMediaUpload } from './PropertyMediaUpload';
import { PropertyMediaGallery } from './PropertyMediaGallery';
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
  PropertyMediaType
} from '../../types/property-types';
import { getTemplate, createProperty, updateProperty } from '../../services/property-service';
import { GeographicLocation } from '../../services/geographic-service';
import { useAuth } from '../../hooks/useAuth';
import { listContacts, CrmContact } from '../../services/crm-service';

const { TextArea } = Input;
const { Title, Text } = Typography;

interface PropertyFormWizardProps {
  property?: Property;
  tenantId: string;
  onComplete?: (propertyId: string) => void;
  onCancel?: () => void;
}

export const PropertyFormWizard: React.FC<PropertyFormWizardProps> = ({ property, tenantId, onComplete, onCancel }) => {
  const { message } = App.useApp();

  const { tenantMembership } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [savedPropertyId, setSavedPropertyId] = useState<string | null>(property?.id || null);
  const [isLoading, setIsLoading] = useState(false);
  const [template, setTemplate] = useState<PropertyTypeTemplate | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const autoSaveAttemptedRef = useRef(false);
  const [mediaRefreshKey, setMediaRefreshKey] = useState(0);
  const [owners, setOwners] = useState<Array<CrmContact & { userId?: string }>>([]);
  const [loadingOwners, setLoadingOwners] = useState(false);

  const [formData, setFormData] = useState({
    propertyType: property?.propertyType || ('' as PropertyType),
    ownershipType: property?.ownershipType || PropertyOwnershipType.TENANT,
    ownerUserId: property?.ownerUserId || '',
    title: property?.title || '',
    description: property?.description || '',
    status: property?.status || PropertyStatus.DRAFT,
    availability: property?.availability || PropertyAvailability.AVAILABLE,
    availabilityDate: '',
    location: null as GeographicLocation | null,
    locationZone: property?.locationZone || '',
    address: property?.address || '',
    latitude: property?.latitude?.toString() || '',
    longitude: property?.longitude?.toString() || '',
    pointsOfInterest: '',
    surfaceArea: property?.surfaceArea?.toString() || '',
    surfaceUseful: property?.surfaceUseful?.toString() || '',
    constructionYear: '',
    generalCondition: '',
    standing: '',
    transactionModes: property?.transactionModes || [PropertyTransactionMode.SALE],
    price: property?.price?.toString() || '',
    fees: property?.fees?.toString() || '',
    currency: property?.currency || 'CFA',
    deposit: '',
    commissionMode: '',
    commissionAmount: '',
    rooms: property?.rooms?.toString() || '',
    bedrooms: property?.bedrooms?.toString() || '',
    bathrooms: property?.bathrooms?.toString() || '',
    surfaceTerrain: property?.surfaceTerrain?.toString() || '',
    furnishingStatus: property?.furnishingStatus || PropertyFurnishingStatus.UNFURNISHED,
    typeSpecificData: property?.typeSpecificData || {}
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    loadOwners();
  }, [tenantId]);

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
      const response = await listContacts(tenantId, { limit: 1000 });
      if (response.success) {
        const clientContacts = response.contacts.filter(
          contact => contact.roles && contact.roles.length > 0 && contact.roles.some(r => r.active)
        );
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
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => {
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

  const processTypeSpecificData = (data: Record<string, any>): Record<string, any> => {
    if (!template || !template.fieldDefinitions) {
      return data;
    }
    const processed: Record<string, any> = { ...data };
    template.fieldDefinitions.forEach((field: any) => {
      if (
        field.type === 'number' &&
        processed[field.key] !== undefined &&
        processed[field.key] !== null &&
        processed[field.key] !== ''
      ) {
        const numValue = parseFloat(String(processed[field.key]));
        if (!isNaN(numValue)) {
          processed[field.key] = numValue;
        }
      }
    });
    return processed;
  };

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
          availabilityDate: formData.availabilityDate || undefined
        })
      };

      if (savedPropertyId) {
        await updateProperty(tenantId, savedPropertyId, submitData);
      } else {
        const newProperty = await createProperty(tenantId, submitData as CreatePropertyRequest);
        setSavedPropertyId(newProperty.id);
      }
      message.success('Brouillon enregistré avec succès !');
    } catch (error: any) {
      console.error('Error saving draft:', error);
      message.error(error.response?.data?.error || "Erreur lors de l'enregistrement du brouillon");
    } finally {
      setIsLoading(false);
    }
  };

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
          availabilityDate: formData.availabilityDate || undefined
        })
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
      message.error(error.response?.data?.error || "Erreur lors de l'enregistrement");
    } finally {
      setIsLoading(false);
    }
  };

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};

    switch (step) {
      case 0:
        if (!formData.propertyType) {
          newErrors.propertyType = 'Le type de propriété est requis';
        }
        if (!formData.title.trim()) {
          newErrors.title = 'Le titre est requis';
        }
        if (!formData.description.trim()) {
          newErrors.description = 'La description est requise';
        }
        if (!formData.ownerUserId || !String(formData.ownerUserId).trim()) {
          newErrors.ownerUserId = 'Le propriétaire est requis';
        }
        break;
      case 1:
        if (!formData.location) {
          newErrors.location = 'La localisation est requise';
        }
        break;
      case 3:
        if (formData.transactionModes.length === 0) {
          newErrors.transactionModes = 'Au moins un mode de transaction est requis';
        }
        break;
      case 4:
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
    }

    setErrors(newErrors);
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

  const translateOption = (optionValue: string): string => {
    const translations: Record<string, string> = {
      NORTH: 'Nord',
      SOUTH: 'Sud',
      EAST: 'Est',
      WEST: 'Ouest',
      GARAGE_1: 'Garage : 1 véhicule',
      GARAGE_2: 'Garage : 2 véhicules',
      SHOWER: 'Douche',
      BATHTUB: 'Baignoire',
      PRIVATE: 'Privée',
      SHARED: 'Partagée',
      NONE: 'Aucune',
      INTERNET: 'Internet',
      WATER: 'Eau',
      POWER: 'Électricité',
      CLEANING: 'Ménage',
      ACD: 'ACD',
      CPF: 'CPF',
      TF: 'Titre foncier',
      ATTESTATION: 'Attestation',
      RESIDENTIAL: 'Résidentiel',
      COMMERCIAL: 'Commercial',
      MIXED: 'Mixte',
      AGRICULTURAL: 'Agricole'
    };
    return translations[optionValue] || optionValue;
  };

  const renderField = (field: any) => {
    const fieldKey = field.key;
    const value = formData.typeSpecificData[fieldKey] || '';
    const error = errors[`typeSpecific.${fieldKey}`];

    switch (field.type) {
      case 'text':
        return (
          <div key={fieldKey}>
            <Text strong>
              {field.label}
              {field.required && <Text type="danger"> *</Text>}
              {field.unit && <Text type="secondary"> ({field.unit})</Text>}
            </Text>
            <Input
              value={value}
              onChange={e => {
                setFormData(prev => ({
                  ...prev,
                  typeSpecificData: {
                    ...prev.typeSpecificData,
                    [fieldKey]: e.target.value
                  }
                }));
              }}
              status={error ? 'error' : ''}
              placeholder={`Saisir ${field.label.toLowerCase()}`}
            />
            {error && (
              <Text type="danger" style={{ fontSize: 12 }}>
                {error}
              </Text>
            )}
          </div>
        );

      case 'number':
        return (
          <div key={fieldKey}>
            <Text strong>
              {field.label}
              {field.required && <Text type="danger"> *</Text>}
              {field.unit && <Text type="secondary"> ({field.unit})</Text>}
            </Text>
            <InputNumber
              style={{ width: '100%' }}
              value={value ? Number(value) : undefined}
              onChange={val => {
                setFormData(prev => ({
                  ...prev,
                  typeSpecificData: {
                    ...prev.typeSpecificData,
                    [fieldKey]: val
                  }
                }));
              }}
              min={field.validation?.min}
              max={field.validation?.max}
              placeholder={`Ex: ${field.unit ? `100 ${field.unit}` : '100'}`}
            />
            {error && (
              <Text type="danger" style={{ fontSize: 12 }}>
                {error}
              </Text>
            )}
          </div>
        );

      case 'boolean':
        return (
          <div key={fieldKey}>
            <Checkbox
              checked={!!value}
              onChange={e => {
                setFormData(prev => ({
                  ...prev,
                  typeSpecificData: {
                    ...prev.typeSpecificData,
                    [fieldKey]: e.target.checked
                  }
                }));
              }}
            >
              {field.label}
              {field.required && <Text type="danger"> *</Text>}
            </Checkbox>
            {error && (
              <Text type="danger" style={{ fontSize: 12 }}>
                {error}
              </Text>
            )}
          </div>
        );

      case 'select':
        return (
          <div key={fieldKey}>
            <Text strong>
              {field.label}
              {field.required && <Text type="danger"> *</Text>}
            </Text>
            <Select
              style={{ width: '100%' }}
              value={value || undefined}
              onChange={val => {
                setFormData(prev => ({
                  ...prev,
                  typeSpecificData: {
                    ...prev.typeSpecificData,
                    [fieldKey]: val
                  }
                }));
              }}
              status={error ? 'error' : ''}
              placeholder="Sélectionner..."
            >
              {field.validation?.options?.map((option: string) => (
                <Select.Option key={option} value={option}>
                  {translateOption(option)}
                </Select.Option>
              ))}
            </Select>
            {error && (
              <Text type="danger" style={{ fontSize: 12 }}>
                {error}
              </Text>
            )}
          </div>
        );

      case 'multiselect':
        return (
          <div key={fieldKey}>
            <Text strong>
              {field.label}
              {field.required && <Text type="danger"> *</Text>}
            </Text>
            <Checkbox.Group
              value={Array.isArray(value) ? value : []}
              onChange={checkedValues => {
                setFormData(prev => ({
                  ...prev,
                  typeSpecificData: {
                    ...prev.typeSpecificData,
                    [fieldKey]: checkedValues
                  }
                }));
              }}
            >
              <Row gutter={[8, 8]}>
                {field.validation?.options?.map((option: string) => (
                  <Col key={option} xs={12} sm={8} md={6}>
                    <Checkbox value={option}>{translateOption(option)}</Checkbox>
                  </Col>
                ))}
              </Row>
            </Checkbox.Group>
            {error && (
              <Text type="danger" style={{ fontSize: 12 }}>
                {error}
              </Text>
            )}
          </div>
        );

      case 'date':
        return (
          <div key={fieldKey}>
            <Text strong>
              {field.label}
              {field.required && <Text type="danger"> *</Text>}
            </Text>
            <DatePicker
              style={{ width: '100%' }}
              value={value ? dayjs(value) : undefined}
              onChange={date => {
                setFormData(prev => ({
                  ...prev,
                  typeSpecificData: {
                    ...prev.typeSpecificData,
                    [fieldKey]: date ? date.format('YYYY-MM-DD') : ''
                  }
                }));
              }}
            />
            {error && (
              <Text type="danger" style={{ fontSize: 12 }}>
                {error}
              </Text>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  const shouldShowRoomFields = (propertyType: PropertyType): boolean => {
    return (
      propertyType === PropertyType.APPARTEMENT ||
      propertyType === PropertyType.STUDIO ||
      propertyType === PropertyType.DUPLEX_TRIPLEX ||
      propertyType === PropertyType.MAISON_VILLA ||
      propertyType === PropertyType.CHAMBRE_COLOCATION
    );
  };

  const shouldShowFurnishingField = (propertyType: PropertyType): boolean => {
    return (
      propertyType === PropertyType.APPARTEMENT ||
      propertyType === PropertyType.STUDIO ||
      propertyType === PropertyType.DUPLEX_TRIPLEX
    );
  };

  const steps = [
    {
      title: 'Type et identification',
      description: 'Sélectionnez le type de bien et les informations de base',
      content: (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Text strong>
              Type de propriété <Text type="danger">*</Text>
            </Text>
            <PropertyTypeSelector
              selectedType={formData.propertyType}
              onSelect={type => handleChange('propertyType', type)}
            />
            {errors.propertyType && (
              <Text type="danger" style={{ fontSize: 12 }}>
                {errors.propertyType}
              </Text>
            )}
          </div>

          <div>
            <Text strong>
              Titre <Text type="danger">*</Text>
            </Text>
            <Input
              value={formData.title}
              onChange={e => handleChange('title', e.target.value)}
              placeholder="Ex: Appartement 3 pièces à Cocody"
              status={errors.title ? 'error' : ''}
            />
            {errors.title && (
              <Text type="danger" style={{ fontSize: 12 }}>
                {errors.title}
              </Text>
            )}
          </div>

          <div>
            <Text strong>
              Description <Text type="danger">*</Text>
            </Text>
            <TextArea
              value={formData.description}
              onChange={e => handleChange('description', e.target.value)}
              rows={6}
              placeholder="Décrivez la propriété..."
              status={errors.description ? 'error' : ''}
            />
            {errors.description && (
              <Text type="danger" style={{ fontSize: 12 }}>
                {errors.description}
              </Text>
            )}
          </div>

          <div>
            <Text strong>
              Propriétaire <Text type="danger">*</Text>
            </Text>
            <Select
              style={{ width: '100%' }}
              value={formData.ownerUserId || undefined}
              onChange={value => handleChange('ownerUserId', value || '')}
              placeholder={loadingOwners ? 'Chargement...' : 'Sélectionner un propriétaire'}
              allowClear
              loading={loadingOwners}
              status={errors.ownerUserId ? 'error' : ''}
            >
              {owners.map(owner => (
                <Select.Option key={owner.id} value={owner.email}>
                  {owner.firstName} {owner.lastName}
                  {owner.email ? ` (${owner.email})` : ''}
                </Select.Option>
              ))}
            </Select>
            {errors.ownerUserId && (
              <Text type="danger" style={{ fontSize: 12 }}>
                {errors.ownerUserId}
              </Text>
            )}
          </div>
        </Space>
      )
    },
    {
      title: 'Localisation',
      description: "Indiquez l'emplacement de la propriété",
      content: (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Text strong>
              Localisation (Pays &gt; Région &gt; Commune) <Text type="danger">*</Text>
            </Text>
            <LocationSelector
              value={formData.location?.communeId}
              onChange={location => handleChange('location', location)}
              placeholder="Rechercher une localisation..."
              error={errors.location}
            />
            {errors.location && (
              <Text type="danger" style={{ fontSize: 12 }}>
                {errors.location}
              </Text>
            )}
          </div>

          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Text strong>Quartier/Zone (optionnel)</Text>
              <Input
                value={formData.locationZone}
                onChange={e => handleChange('locationZone', e.target.value)}
                placeholder="Ex: Angré, Riviera, etc."
              />
            </Col>
            <Col xs={24} sm={12}>
              <Text strong>Adresse</Text>
              <Input
                value={formData.address}
                onChange={e => handleChange('address', e.target.value)}
                placeholder="Adresse complète (optionnel)"
              />
            </Col>
          </Row>
        </Space>
      )
    },
    {
      title: 'Caractéristiques générales',
      description: 'Informations générales sur la propriété',
      content: (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {(formData.propertyType as PropertyType) === PropertyType.TERRAIN ||
          (formData.propertyType as PropertyType) === PropertyType.LOT_PROGRAMME_NEUF ? (
            <Alert
              message={
                (formData.propertyType as PropertyType) === PropertyType.TERRAIN
                  ? "Les caractéristiques spécifiques du terrain seront renseignées dans l'étape suivante."
                  : "Les informations sur le programme seront renseignées dans l'étape suivante."
              }
              type="info"
              showIcon
            />
          ) : (
            <Row gutter={16}>
              {(formData.propertyType as PropertyType) !== PropertyType.TERRAIN &&
                (formData.propertyType as PropertyType) !== PropertyType.PARKING_BOX && (
                  <Col xs={24} sm={12}>
                    <Text strong>Surface principale (m²)</Text>
                    <InputNumber
                      style={{ width: '100%' }}
                      value={formData.surfaceArea ? Number(formData.surfaceArea) : undefined}
                      onChange={val => handleChange('surfaceArea', val ? String(val) : '')}
                      placeholder="Ex: 75"
                    />
                  </Col>
                )}
              {(formData.propertyType as PropertyType) !== PropertyType.TERRAIN &&
                (formData.propertyType as PropertyType) !== PropertyType.LOT_PROGRAMME_NEUF &&
                (formData.propertyType as PropertyType) !== PropertyType.PARKING_BOX && (
                  <Col xs={24} sm={12}>
                    <Text strong>Année de construction</Text>
                    <InputNumber
                      style={{ width: '100%' }}
                      value={formData.constructionYear ? Number(formData.constructionYear) : undefined}
                      onChange={val => handleChange('constructionYear', val ? String(val) : '')}
                      min={1800}
                      max={new Date().getFullYear()}
                      placeholder="Ex: 2020"
                    />
                  </Col>
                )}
              {(formData.propertyType as PropertyType) !== PropertyType.TERRAIN &&
                (formData.propertyType as PropertyType) !== PropertyType.LOT_PROGRAMME_NEUF &&
                (formData.propertyType as PropertyType) !== PropertyType.PARKING_BOX && (
                  <Col xs={24} sm={12}>
                    <Text strong>État général</Text>
                    <Select
                      style={{ width: '100%' }}
                      value={formData.generalCondition || undefined}
                      onChange={val => handleChange('generalCondition', val)}
                      placeholder="Sélectionner..."
                    >
                      <Select.Option value="NEUF">Neuf</Select.Option>
                      <Select.Option value="BON">Bon</Select.Option>
                      <Select.Option value="A_RENOVER">À rénover</Select.Option>
                      <Select.Option value="EN_CHANTIER">En chantier</Select.Option>
                    </Select>
                  </Col>
                )}
              {(formData.propertyType as PropertyType) !== PropertyType.TERRAIN &&
                (formData.propertyType as PropertyType) !== PropertyType.PARKING_BOX && (
                  <Col xs={24} sm={12}>
                    <Text strong>Standing</Text>
                    <Select
                      style={{ width: '100%' }}
                      value={formData.standing || undefined}
                      onChange={val => handleChange('standing', val)}
                      placeholder="Sélectionner..."
                    >
                      <Select.Option value="ECONOMIQUE">Économique</Select.Option>
                      <Select.Option value="STANDARD">Standard</Select.Option>
                      <Select.Option value="HAUT_STANDING">Haut standing</Select.Option>
                      <Select.Option value="LUXE">Luxe</Select.Option>
                    </Select>
                  </Col>
                )}
              {shouldShowRoomFields(formData.propertyType as PropertyType) && (
                <>
                  <Col xs={24} sm={8}>
                    <Text strong>Nombre de pièces</Text>
                    <InputNumber
                      style={{ width: '100%' }}
                      min={0}
                      value={formData.rooms ? Number(formData.rooms) : undefined}
                      onChange={val => handleChange('rooms', val !== null && val !== undefined ? String(val) : '')}
                      placeholder="Ex: 3"
                    />
                  </Col>
                  <Col xs={24} sm={8}>
                    <Text strong>Nombre de chambres</Text>
                    <InputNumber
                      style={{ width: '100%' }}
                      min={0}
                      value={formData.bedrooms ? Number(formData.bedrooms) : undefined}
                      onChange={val => handleChange('bedrooms', val !== null && val !== undefined ? String(val) : '')}
                      placeholder="Ex: 2"
                    />
                  </Col>
                  <Col xs={24} sm={8}>
                    <Text strong>Nombre de salles de bain</Text>
                    <InputNumber
                      style={{ width: '100%' }}
                      min={0}
                      value={formData.bathrooms ? Number(formData.bathrooms) : undefined}
                      onChange={val => handleChange('bathrooms', val !== null && val !== undefined ? String(val) : '')}
                      placeholder="Ex: 2"
                    />
                  </Col>
                </>
              )}
              {(formData.propertyType as PropertyType) === PropertyType.MAISON_VILLA && (
                <Col xs={24} sm={8}>
                  <Text strong>Surface terrain (m²)</Text>
                  <InputNumber
                    style={{ width: '100%' }}
                    value={formData.surfaceTerrain ? Number(formData.surfaceTerrain) : undefined}
                    onChange={val =>
                      handleChange('surfaceTerrain', val !== null && val !== undefined ? String(val) : '')
                    }
                    placeholder="Ex: 500"
                  />
                </Col>
              )}
              {shouldShowFurnishingField(formData.propertyType as PropertyType) && (
                <Col xs={24} sm={8}>
                  <Text strong>Statut d'ameublement</Text>
                  <Select
                    style={{ width: '100%' }}
                    value={formData.furnishingStatus}
                    onChange={value => handleChange('furnishingStatus', value)}
                  >
                    <Select.Option value={PropertyFurnishingStatus.UNFURNISHED}>Non meublé</Select.Option>
                    <Select.Option value={PropertyFurnishingStatus.FURNISHED}>Meublé</Select.Option>
                    <Select.Option value={PropertyFurnishingStatus.PARTIALLY_FURNISHED}>
                      Partiellement meublé
                    </Select.Option>
                  </Select>
                </Col>
              )}
            </Row>
          )}
        </Space>
      )
    },
    {
      title: 'Prix & Conditions',
      description: 'Définissez le prix et les conditions de transaction',
      content: (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Text strong>
              Type d'opération <Text type="danger">*</Text>
            </Text>
            <Checkbox.Group
              value={formData.transactionModes}
              onChange={checkedValues => {
                handleChange('transactionModes', checkedValues as PropertyTransactionMode[]);
              }}
            >
              <Space>
                <Checkbox value={PropertyTransactionMode.SALE}>Vente</Checkbox>
                <Checkbox value={PropertyTransactionMode.RENTAL}>Location</Checkbox>
                <Checkbox value={PropertyTransactionMode.SHORT_TERM}>Location courte durée</Checkbox>
              </Space>
            </Checkbox.Group>
            {errors.transactionModes && (
              <Text type="danger" style={{ fontSize: 12 }}>
                {errors.transactionModes}
              </Text>
            )}
          </div>

          <Row gutter={16}>
            {!(
              (formData.propertyType as PropertyType) === PropertyType.IMMEUBLE &&
              (formData.transactionModes.includes(PropertyTransactionMode.RENTAL) ||
                formData.transactionModes.includes(PropertyTransactionMode.SHORT_TERM))
            ) && (
              <>
                <Col xs={24} sm={8}>
                  <Text strong>
                    {formData.transactionModes.includes(PropertyTransactionMode.SALE)
                      ? 'Prix (vente)'
                      : 'Loyer (location)'}
                  </Text>
                  <Input
                    value={formatNumber(formData.price)}
                    onChange={e => handleNumberChange('price', e.target.value)}
                    placeholder="Ex: 50 000 000"
                  />
                </Col>
                <Col xs={24} sm={8}>
                  <Text strong>Charges</Text>
                  <Input
                    value={formatNumber(formData.fees)}
                    onChange={e => handleNumberChange('fees', e.target.value)}
                    placeholder="Ex: 50 000"
                  />
                </Col>
              </>
            )}
            <Col xs={24} sm={8}>
              <Text strong>Devise</Text>
              <Select
                style={{ width: '100%' }}
                value={formData.currency}
                onChange={val => handleChange('currency', val)}
              >
                <Select.Option value="CFA">CFA</Select.Option>
                <Select.Option value="EUR">EUR</Select.Option>
                <Select.Option value="USD">USD</Select.Option>
              </Select>
            </Col>
          </Row>
        </Space>
      )
    },
    {
      title: 'Caractéristiques spécifiques',
      description: 'Détails spécifiques au type de bien sélectionné',
      content: (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {loadingTemplate ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <Spin size="large" />
              <div style={{ marginTop: 16 }}>
                <Text type="secondary">Chargement des caractéristiques...</Text>
              </div>
            </div>
          ) : template && template.sections && template.sections.length > 0 ? (
            template.sections.map((section: any) => (
              <Card key={section.id || section.title} type="inner" title={section.title} style={{ marginBottom: 16 }}>
                <Row gutter={16}>
                  {section.fieldDefinitions?.map((field: any) => {
                    if (
                      (formData.propertyType as PropertyType) === PropertyType.IMMEUBLE &&
                      field.key === 'occupancy_rate'
                    ) {
                      return null;
                    }
                    const displayField =
                      (formData.propertyType as PropertyType) === PropertyType.IMMEUBLE && field.key === 'units_count'
                        ? { ...field, label: "Nombre total d'appartements" }
                        : field;
                    return (
                      <Col key={field.key} xs={24} sm={12}>
                        {renderField(displayField)}
                      </Col>
                    );
                  })}
                </Row>
              </Card>
            ))
          ) : (
            <Empty
              description={
                formData.propertyType
                  ? 'Aucune caractéristique spécifique pour ce type de bien.'
                  : "Veuillez d'abord sélectionner un type de bien."
              }
            />
          )}
        </Space>
      )
    },
    {
      title: 'Médias',
      description: 'Ajoutez des photos et vidéos de la propriété',
      content: (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {savedPropertyId ? (
            <>
              <div>
                <Title level={4}>Photos</Title>
                <PropertyMediaUpload
                  propertyId={savedPropertyId}
                  tenantId={tenantId}
                  mediaType={PropertyMediaType.PHOTO}
                  onUploadComplete={() => setMediaRefreshKey(prev => prev + 1)}
                />
                <div style={{ marginTop: 16 }}>
                  <PropertyMediaGallery
                    propertyId={savedPropertyId}
                    tenantId={tenantId}
                    mediaType={PropertyMediaType.PHOTO}
                    refreshTrigger={mediaRefreshKey}
                  />
                </div>
              </div>
              <Divider />
              <div>
                <Title level={4}>Vidéos</Title>
                <PropertyMediaUpload
                  propertyId={savedPropertyId}
                  tenantId={tenantId}
                  mediaType={PropertyMediaType.VIDEO}
                  onUploadComplete={() => setMediaRefreshKey(prev => prev + 1)}
                />
                <div style={{ marginTop: 16 }}>
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
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <Spin size="large" />
              <div style={{ marginTop: 16 }}>
                <Text type="secondary">Préparation de l'espace médias...</Text>
              </div>
            </div>
          )}
        </Space>
      )
    }
  ];

  useEffect(() => {
    const autoSaveForMedia = async () => {
      if (currentStep === 5 && !savedPropertyId && !isLoading && !property && !autoSaveAttemptedRef.current) {
        const requiredStepsValid =
          formData.propertyType &&
          formData.title.trim() &&
          formData.description.trim() &&
          formData.location &&
          formData.transactionModes.length > 0;

        if (requiredStepsValid) {
          autoSaveAttemptedRef.current = true;
          setIsLoading(true);
          try {
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
              commissionAmount: formData.commissionAmount
                ? parseFloat(parseNumber(formData.commissionAmount))
                : undefined,
              availabilityDate: formData.availabilityDate || undefined
            });

            const submitData: CreatePropertyRequest = {
              propertyType: formData.propertyType,
              ownershipType: formData.ownershipType,
              ownerUserId:
                formData.ownerUserId && !String(formData.ownerUserId).includes('@') ? formData.ownerUserId : undefined,
              ownerEmail:
                formData.ownerUserId && String(formData.ownerUserId).includes('@') ? formData.ownerUserId : undefined,
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
              typeSpecificData: processedTypeSpecificData
            };

            const newProperty = await createProperty(tenantId, submitData);
            setSavedPropertyId(newProperty.id);
          } catch (error: any) {
            console.error('Error auto-saving for media:', error);
          } finally {
            setIsLoading(false);
          }
        }
      }
    };

    autoSaveForMedia();
  }, [currentStep, savedPropertyId, tenantId]);

  useEffect(() => {
    if (currentStep !== 5) {
      autoSaveAttemptedRef.current = false;
    }
  }, [currentStep]);

  const isStepValid = (stepIndex: number): boolean => {
    switch (stepIndex) {
      case 0:
        return !!(
          formData.propertyType &&
          formData.title.trim() &&
          formData.description.trim() &&
          formData.ownerUserId &&
          String(formData.ownerUserId).trim()
        );
      case 1:
        return !!formData.location;
      case 3:
        return formData.transactionModes.length > 0;
      default:
        return true;
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <Steps
        current={currentStep}
        onChange={handleStepChange}
        items={steps.map((step, index) => ({
          title: step.title,
          description: step.description,
          status: index < currentStep ? 'finish' : index === currentStep ? 'process' : 'wait',
          icon: index < currentStep ? <CheckCircleOutlined /> : undefined
        }))}
      />

      <Card style={{ marginTop: 24, minHeight: 500 }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Title level={3}>{steps[currentStep].title}</Title>
            {steps[currentStep].description && <Text type="secondary">{steps[currentStep].description}</Text>}
          </div>
          <Divider />
          {steps[currentStep].content}
        </Space>
      </Card>

      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
        <Space>
          {onCancel && (
            <Button onClick={onCancel} disabled={isLoading}>
              Annuler
            </Button>
          )}
          <Button icon={<SaveOutlined />} onClick={handleSaveDraft} disabled={isLoading}>
            Enregistrer en brouillon
          </Button>
        </Space>

        <Space>
          {currentStep > 0 && (
            <Button icon={<ArrowLeftOutlined />} onClick={() => handleStepChange(currentStep - 1)} disabled={isLoading}>
              Précédent
            </Button>
          )}
          {currentStep < steps.length - 1 ? (
            <Button
              type="primary"
              icon={<ArrowRightOutlined />}
              onClick={() => handleStepChange(currentStep + 1)}
              disabled={!isStepValid(currentStep) || isLoading}
            >
              Suivant
            </Button>
          ) : (
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={handleFinish}
              loading={isLoading}
              disabled={!isStepValid(currentStep)}
            >
              Terminer
            </Button>
          )}
        </Space>
      </div>

      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <Text type="secondary">
          Étape {currentStep + 1} sur {steps.length}
        </Text>
      </div>
    </div>
  );
};
