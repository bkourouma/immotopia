import React, { useState, useEffect } from 'react';
import { Form, Input, Select, Button, Checkbox, InputNumber, Row, Col, Card, Alert, Space, Typography } from 'antd';
import { LocationSelector } from '../ui/location-selector';
import { GeographicLocation } from '../../services/geographic-service';
import { CreateCrmDealRequest, UpdateCrmDealRequest, CrmDeal, CrmContact } from '../../types/crm-types';
import { listContacts } from '../../services/crm-service';

const { TextArea } = Input;
const { Title, Text } = Typography;

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
  loading = false
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
    hasElevatorImmeuble: (deal?.criteriaJson as any)?.hasElevator || false
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
      const criteria = (deal.criteriaJson as any) || {};
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
        hasElevatorImmeuble: criteria.hasElevator || false
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
          limit: 1000 // High limit to get all contacts
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

  const handleSubmit = async () => {
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
        ...(deal ? { version: deal.version } : {})
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
        setErrors({ submit: "Une erreur est survenue lors de l'enregistrement de l'affaire" });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: string, value: string | boolean | GeographicLocation | null) => {
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
    // Parse the value to remove formatting
    const numericValue = parseNumber(value);
    // Store the numeric value (without spaces)
    setFormData(prev => ({ ...prev, [field]: numericValue }));
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  return (
    <Form onFinish={handleSubmit} layout="vertical" className="space-y-6">
      {errors.submit && <Alert message={errors.submit} type="error" showIcon className="mb-4" />}

      {/* Section: Informations générales et Budget en 2 colonnes */}
      <Row gutter={[16, 16]}>
        {/* Colonne gauche: Informations générales */}
        <Col xs={24} lg={12}>
          <Card title="Informations générales" size="small">
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Form.Item label="Type d'affaire" required validateStatus={errors.type ? 'error' : ''} help={errors.type}>
                <Select
                  value={formData.type}
                  onChange={value => handleChange('type', value)}
                  placeholder="Sélectionner un type"
                >
                  <Select.Option value="ACHAT">Achat</Select.Option>
                  <Select.Option value="LOCATION">Location</Select.Option>
                  <Select.Option value="VENTE">Vente</Select.Option>
                  <Select.Option value="GESTION">Gestion de biens</Select.Option>
                  <Select.Option value="MANDAT">Mandat</Select.Option>
                </Select>
              </Form.Item>

              {!contactId && (
                <Form.Item
                  label="Contact"
                  required
                  validateStatus={errors.contactId ? 'error' : ''}
                  help={errors.contactId}
                >
                  {loadingContacts ? (
                    <Input placeholder="Chargement des contacts..." disabled />
                  ) : (
                    <Select
                      value={formData.contactId}
                      onChange={value => handleChange('contactId', value)}
                      placeholder="Sélectionner un contact"
                      showSearch
                      filterOption={(input, option) => {
                        const label = typeof option?.label === 'string' ? option.label : String(option?.children || '');
                        return label.toLowerCase().includes(input.toLowerCase());
                      }}
                      optionLabelProp="label"
                    >
                      {contacts.map(contact => {
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
              )}
            </Space>
          </Card>
        </Col>

        {/* Colonne droite: Budget et localisation */}
        <Col xs={24} lg={12}>
          <Card title="Budget et localisation" size="small">
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item label="Budget minimum (FCFA)">
                    <InputNumber
                      value={formData.budgetMin ? parseFloat(formData.budgetMin) : undefined}
                      onChange={value => handleNumberChange('budgetMin', value?.toString() || '')}
                      placeholder="0"
                      style={{ width: '100%' }}
                      formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
                      parser={value => {
                        const parsed = value!.replace(/\s?/g, '');
                        return parsed ? parseFloat(parsed) : 0;
                      }}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    label="Budget maximum (FCFA)"
                    validateStatus={errors.budgetMax ? 'error' : ''}
                    help={errors.budgetMax}
                  >
                    <InputNumber
                      value={formData.budgetMax ? parseFloat(formData.budgetMax) : undefined}
                      onChange={value => handleNumberChange('budgetMax', value?.toString() || '')}
                      placeholder="0"
                      style={{ width: '100%' }}
                      formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
                      parser={value => {
                        const parsed = value!.replace(/\s?/g, '');
                        return parsed ? parseFloat(parsed) : 0;
                      }}
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item label="Zone géographique (Commune)">
                <LocationSelector
                  value={formData.location?.communeId}
                  onChange={location => {
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
              </Form.Item>
            </Space>
          </Card>
        </Col>
      </Row>

      {/* Section: Type de bien et critères en split screen */}
      <Row gutter={[16, 16]}>
        {/* Colonne gauche: Type de bien */}
        <Col xs={24} lg={12}>
          <Card title="Type de bien" size="small">
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Form.Item label="Type de bien">
                <Select
                  value={formData.propertyType}
                  onChange={value => handleChange('propertyType', value)}
                  placeholder="Sélectionner un type"
                  allowClear
                >
                  <Select.Option value="APPARTEMENT">Appartement</Select.Option>
                  <Select.Option value="VILLA">Villa</Select.Option>
                  <Select.Option value="MAISON">Maison</Select.Option>
                  <Select.Option value="TERRAIN">Terrain</Select.Option>
                  <Select.Option value="BUREAU">Bureau</Select.Option>
                  <Select.Option value="COMMERCE">Local commercial</Select.Option>
                  <Select.Option value="STUDIO">Studio</Select.Option>
                  <Select.Option value="DUPLEX">Duplex</Select.Option>
                  <Select.Option value="PENTHOUSE">Penthouse</Select.Option>
                  <Select.Option value="IMMEUBLE">Immeuble</Select.Option>
                  <Select.Option value="AUTRE">Autre</Select.Option>
                </Select>
              </Form.Item>

              <Form.Item label="Valeur estimée de la transaction (FCFA)">
                <InputNumber
                  value={formData.expectedValue ? parseFloat(formData.expectedValue) : undefined}
                  onChange={value => handleNumberChange('expectedValue', value?.toString() || '')}
                  placeholder="0"
                  style={{ width: '100%' }}
                  formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
                  parser={value => {
                    const parsed = value!.replace(/\s?/g, '');
                    return parsed ? parseFloat(parsed) : 0;
                  }}
                />
                <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginTop: '4px' }}>
                  Montant estimé auquel l'affaire devrait se conclure (différent du budget client)
                </Text>
              </Form.Item>
            </Space>
          </Card>
        </Col>

        {/* Colonne droite: Critères spécifiques */}
        <Col xs={24} lg={12}>
          {!formData.propertyType ? (
            <Card title="Critères spécifiques" size="small">
              <Text type="secondary" italic>
                Sélectionnez un type de bien pour voir les critères disponibles
              </Text>
            </Card>
          ) : (
            <Card
              title={
                <Space>
                  <div style={{ width: 8, height: 8, backgroundColor: '#1890ff', borderRadius: '50%' }}></div>
                  <span>
                    Critères spécifiques -{' '}
                    {formData.propertyType === 'APPARTEMENT'
                      ? 'Appartement'
                      : formData.propertyType === 'VILLA'
                        ? 'Villa'
                        : formData.propertyType === 'MAISON'
                          ? 'Maison'
                          : formData.propertyType === 'TERRAIN'
                            ? 'Terrain'
                            : formData.propertyType === 'BUREAU'
                              ? 'Bureau'
                              : formData.propertyType === 'COMMERCE'
                                ? 'Local commercial'
                                : formData.propertyType === 'STUDIO'
                                  ? 'Studio'
                                  : formData.propertyType === 'DUPLEX'
                                    ? 'Duplex'
                                    : formData.propertyType === 'PENTHOUSE'
                                      ? 'Penthouse'
                                      : 'Autre'}
                  </span>
                </Space>
              }
              size="small"
              style={{ background: 'linear-gradient(to bottom right, #e6f7ff, #f0f5ff)', border: '2px solid #91d5ff' }}
            >
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                {/* Common fields for most property types */}
                {['APPARTEMENT', 'VILLA', 'MAISON', 'STUDIO', 'DUPLEX', 'PENTHOUSE'].includes(
                  formData.propertyType
                ) && (
                  <>
                    <Row gutter={16}>
                      {formData.propertyType !== 'STUDIO' && (
                        <Col xs={24} md={12}>
                          <Form.Item label="Nombre de pièces">
                            <InputNumber
                              value={formData.rooms ? parseInt(formData.rooms) : undefined}
                              onChange={value => handleChange('rooms', value?.toString() || '')}
                              placeholder="ex. : 3"
                              min={0}
                              style={{ width: '100%' }}
                            />
                          </Form.Item>
                        </Col>
                      )}
                      <Col xs={24} md={formData.propertyType === 'STUDIO' ? 24 : 12}>
                        <Form.Item label="Surface (m²)">
                          <InputNumber
                            value={formData.surface ? parseFloat(formData.surface) : undefined}
                            onChange={value => handleChange('surface', value?.toString() || '')}
                            placeholder="ex. : 120"
                            min={0}
                            step={0.01}
                            style={{ width: '100%' }}
                          />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Form.Item label="État du meublé">
                      <Select
                        value={formData.furnishingStatus}
                        onChange={value => handleChange('furnishingStatus', value)}
                        placeholder="Indifférent"
                        allowClear
                      >
                        <Select.Option value="MEUBLE">Meublé</Select.Option>
                        <Select.Option value="SEMI_MEUBLE">Semi-meublé</Select.Option>
                        <Select.Option value="NON_MEUBLE">Non meublé</Select.Option>
                      </Select>
                    </Form.Item>
                  </>
                )}

                {/* Apartment/Studio/Duplex specific fields */}
                {['APPARTEMENT', 'STUDIO', 'DUPLEX'].includes(formData.propertyType) && (
                  <Row gutter={16}>
                    <Col xs={24} md={12}>
                      <Form.Item label="Étage">
                        <InputNumber
                          value={formData.floor ? parseInt(formData.floor) : undefined}
                          onChange={value => handleChange('floor', value?.toString() || '')}
                          placeholder="ex. : 2"
                          style={{ width: '100%' }}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item label="Équipements">
                        <Space direction="vertical">
                          <Checkbox
                            checked={formData.hasElevator}
                            onChange={e => handleChange('hasElevator', e.target.checked)}
                          >
                            Ascenseur
                          </Checkbox>
                          <Checkbox
                            checked={formData.hasParking}
                            onChange={e => handleChange('hasParking', e.target.checked)}
                          >
                            Parking
                          </Checkbox>
                          <Checkbox
                            checked={formData.hasBalcony}
                            onChange={e => handleChange('hasBalcony', e.target.checked)}
                          >
                            Balcon
                          </Checkbox>
                        </Space>
                      </Form.Item>
                    </Col>
                  </Row>
                )}

                {/* Villa/House specific fields */}
                {['VILLA', 'MAISON'].includes(formData.propertyType) && (
                  <>
                    <Row gutter={16}>
                      <Col xs={24} md={12}>
                        <Form.Item label="Surface habitable (m²)">
                          <InputNumber
                            value={formData.surface ? parseFloat(formData.surface) : undefined}
                            onChange={value => handleChange('surface', value?.toString() || '')}
                            placeholder="ex. : 200"
                            min={0}
                            step={0.01}
                            style={{ width: '100%' }}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item label="Surface du terrain (m²)">
                          <InputNumber
                            value={formData.landArea ? parseFloat(formData.landArea) : undefined}
                            onChange={value => handleChange('landArea', value?.toString() || '')}
                            placeholder="ex. : 500"
                            min={0}
                            step={0.01}
                            style={{ width: '100%' }}
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Form.Item label="Équipements">
                      <Checkbox.Group>
                        <Row>
                          <Col xs={12} md={6}>
                            <Checkbox
                              checked={formData.hasGarden}
                              onChange={e => handleChange('hasGarden', e.target.checked)}
                            >
                              Jardin
                            </Checkbox>
                          </Col>
                          <Col xs={12} md={6}>
                            <Checkbox
                              checked={formData.hasPool}
                              onChange={e => handleChange('hasPool', e.target.checked)}
                            >
                              Piscine
                            </Checkbox>
                          </Col>
                          <Col xs={12} md={6}>
                            <Checkbox
                              checked={formData.hasGarage}
                              onChange={e => handleChange('hasGarage', e.target.checked)}
                            >
                              Garage
                            </Checkbox>
                          </Col>
                          <Col xs={12} md={6}>
                            <Checkbox
                              checked={formData.hasParking}
                              onChange={e => handleChange('hasParking', e.target.checked)}
                            >
                              Parking
                            </Checkbox>
                          </Col>
                        </Row>
                      </Checkbox.Group>
                    </Form.Item>
                  </>
                )}

                {/* Land specific fields */}
                {formData.propertyType === 'TERRAIN' && (
                  <>
                    <Row gutter={16}>
                      <Col xs={24} md={12}>
                        <Form.Item label="Superficie (m²)">
                          <InputNumber
                            value={formData.landArea ? parseFloat(formData.landArea) : undefined}
                            onChange={value => handleChange('landArea', value?.toString() || '')}
                            placeholder="ex. : 500"
                            min={0}
                            step={0.01}
                            style={{ width: '100%' }}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item label="Type de terrain">
                          <Select
                            value={formData.landType}
                            onChange={value => handleChange('landType', value)}
                            placeholder="Sélectionner"
                            allowClear
                          >
                            <Select.Option value="URBAIN">Urbain</Select.Option>
                            <Select.Option value="VILLAGE">Village</Select.Option>
                            <Select.Option value="AGRICOLE">Agricole</Select.Option>
                            <Select.Option value="INDUSTRIEL">Industriel</Select.Option>
                          </Select>
                        </Form.Item>
                      </Col>
                    </Row>
                    <Form.Item>
                      <Space direction="vertical">
                        <Checkbox
                          checked={formData.isServiced}
                          onChange={e => handleChange('isServiced', e.target.checked)}
                        >
                          Viabilisé (eau, électricité, etc.)
                        </Checkbox>
                        <Checkbox
                          checked={formData.isBuildable}
                          onChange={e => handleChange('isBuildable', e.target.checked)}
                        >
                          Constructible
                        </Checkbox>
                      </Space>
                    </Form.Item>
                  </>
                )}

                {/* Office specific fields */}
                {formData.propertyType === 'BUREAU' && (
                  <>
                    <Row gutter={16}>
                      <Col xs={24} md={12}>
                        <Form.Item label="Surface (m²)">
                          <InputNumber
                            value={formData.surface ? parseFloat(formData.surface) : undefined}
                            onChange={value => handleChange('surface', value?.toString() || '')}
                            placeholder="ex. : 150"
                            min={0}
                            step={0.01}
                            style={{ width: '100%' }}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item label="Nombre de bureaux">
                          <InputNumber
                            value={formData.officeCount ? parseInt(formData.officeCount) : undefined}
                            onChange={value => handleChange('officeCount', value?.toString() || '')}
                            placeholder="ex. : 5"
                            min={0}
                            style={{ width: '100%' }}
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Form.Item>
                      <Space direction="vertical">
                        <Checkbox
                          checked={formData.hasReception}
                          onChange={e => handleChange('hasReception', e.target.checked)}
                        >
                          Réception
                        </Checkbox>
                        <Checkbox
                          checked={formData.hasParking}
                          onChange={e => handleChange('hasParking', e.target.checked)}
                        >
                          Parking
                        </Checkbox>
                      </Space>
                    </Form.Item>
                  </>
                )}

                {/* Commercial specific fields */}
                {formData.propertyType === 'COMMERCE' && (
                  <>
                    <Row gutter={16}>
                      <Col xs={24} md={12}>
                        <Form.Item label="Surface (m²)">
                          <InputNumber
                            value={formData.surface ? parseFloat(formData.surface) : undefined}
                            onChange={value => handleChange('surface', value?.toString() || '')}
                            placeholder="ex. : 80"
                            min={0}
                            step={0.01}
                            style={{ width: '100%' }}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item label="Type de commerce">
                          <Select
                            value={formData.commercialType}
                            onChange={value => handleChange('commercialType', value)}
                            placeholder="Sélectionner"
                            allowClear
                          >
                            <Select.Option value="RESTAURANT">Restaurant</Select.Option>
                            <Select.Option value="BOUTIQUE">Boutique</Select.Option>
                            <Select.Option value="SUPERMARCHE">Supermarché</Select.Option>
                            <Select.Option value="PHARMACIE">Pharmacie</Select.Option>
                            <Select.Option value="SALON">Salon de coiffure</Select.Option>
                            <Select.Option value="AUTRE">Autre</Select.Option>
                          </Select>
                        </Form.Item>
                      </Col>
                    </Row>
                    <Form.Item>
                      <Space direction="vertical">
                        <Checkbox
                          checked={formData.hasStorefront}
                          onChange={e => handleChange('hasStorefront', e.target.checked)}
                        >
                          Vitrine
                        </Checkbox>
                        <Checkbox
                          checked={formData.hasParking}
                          onChange={e => handleChange('hasParking', e.target.checked)}
                        >
                          Parking
                        </Checkbox>
                      </Space>
                    </Form.Item>
                  </>
                )}

                {/* Penthouse specific fields */}
                {formData.propertyType === 'PENTHOUSE' && (
                  <Row gutter={16}>
                    <Col xs={24} md={12}>
                      <Form.Item label="Étage">
                        <InputNumber
                          value={formData.floor ? parseInt(formData.floor) : undefined}
                          onChange={value => handleChange('floor', value?.toString() || '')}
                          placeholder="ex. : 10"
                          style={{ width: '100%' }}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item label="Équipements">
                        <Space direction="vertical">
                          <Checkbox
                            checked={formData.hasTerrace}
                            onChange={e => handleChange('hasTerrace', e.target.checked)}
                          >
                            Terrasse
                          </Checkbox>
                          <Checkbox
                            checked={formData.hasElevator}
                            onChange={e => handleChange('hasElevator', e.target.checked)}
                          >
                            Ascenseur
                          </Checkbox>
                          <Checkbox
                            checked={formData.hasParking}
                            onChange={e => handleChange('hasParking', e.target.checked)}
                          >
                            Parking
                          </Checkbox>
                        </Space>
                      </Form.Item>
                    </Col>
                  </Row>
                )}

                {/* Studio specific - simplified */}
                {formData.propertyType === 'STUDIO' && (
                  <Form.Item>
                    <Space direction="vertical">
                      <Checkbox
                        checked={formData.hasBalcony}
                        onChange={e => handleChange('hasBalcony', e.target.checked)}
                      >
                        Balcon
                      </Checkbox>
                      <Checkbox
                        checked={formData.hasParking}
                        onChange={e => handleChange('hasParking', e.target.checked)}
                      >
                        Parking
                      </Checkbox>
                    </Space>
                  </Form.Item>
                )}

                {/* Immeuble specific fields */}
                {formData.propertyType === 'IMMEUBLE' && (
                  <>
                    <Row gutter={16}>
                      <Col xs={24} md={12}>
                        <Form.Item label="Nombre d'étages">
                          <InputNumber
                            value={formData.floorsCount ? parseInt(formData.floorsCount) : undefined}
                            onChange={value => handleChange('floorsCount', value?.toString() || '')}
                            placeholder="ex. : 5"
                            min={1}
                            style={{ width: '100%' }}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item label="Nombre d'appartements">
                          <InputNumber
                            value={formData.apartmentsCount ? parseInt(formData.apartmentsCount) : undefined}
                            onChange={value => handleChange('apartmentsCount', value?.toString() || '')}
                            placeholder="ex. : 18"
                            min={0}
                            style={{ width: '100%' }}
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Form.Item label="Standing">
                      <Select
                        value={formData.standing}
                        onChange={value => handleChange('standing', value)}
                        placeholder="Sélectionner un standing"
                        allowClear
                      >
                        <Select.Option value="ECONOMIQUE">Économique</Select.Option>
                        <Select.Option value="STANDARD">Standard</Select.Option>
                        <Select.Option value="HAUT_STANDING">Haut standing</Select.Option>
                        <Select.Option value="LUXE">Luxe</Select.Option>
                        <Select.Option value="PRESTIGE">Prestige</Select.Option>
                      </Select>
                    </Form.Item>
                    <Row gutter={16}>
                      <Col xs={24} md={12}>
                        <Form.Item label="Places de parking">
                          <InputNumber
                            value={formData.parkingSpaces ? parseInt(formData.parkingSpaces) : undefined}
                            onChange={value => handleChange('parkingSpaces', value?.toString() || '')}
                            placeholder="ex. : 15"
                            min={0}
                            style={{ width: '100%' }}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item label="Taux d'occupation (%)">
                          <InputNumber
                            value={formData.occupancyRate ? parseFloat(formData.occupancyRate) : undefined}
                            onChange={value => handleChange('occupancyRate', value?.toString() || '')}
                            placeholder="ex. : 75"
                            min={0}
                            max={100}
                            step={0.1}
                            style={{ width: '100%' }}
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Form.Item>
                      <Checkbox
                        checked={formData.hasElevatorImmeuble}
                        onChange={e => handleChange('hasElevatorImmeuble', e.target.checked)}
                      >
                        Ascenseur
                      </Checkbox>
                    </Form.Item>
                  </>
                )}

                {/* Autre - description textarea */}
                {formData.propertyType === 'AUTRE' && (
                  <Form.Item label="Description du type de bien">
                    <TextArea
                      value={formData.description}
                      onChange={e => handleChange('description', e.target.value)}
                      placeholder="Décrivez le type de bien recherché (ex: entrepôt, hangar, local industriel, etc.)"
                      rows={4}
                    />
                  </Form.Item>
                )}
              </Space>
            </Card>
          )}
        </Col>
      </Row>

      {/* Section: Description et valeur estimée */}
      <Card title="Informations complémentaires" size="small">
        <Form.Item label="Description / Besoins spécifiques">
          <TextArea
            value={formData.description}
            onChange={e => handleChange('description', e.target.value)}
            placeholder="Décrivez les besoins spécifiques du client, contraintes particulières, équipements souhaités, etc."
            rows={4}
          />
        </Form.Item>
      </Card>

      <Form.Item>
        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          {onCancel && (
            <Button onClick={onCancel} disabled={isSubmitting || loading}>
              Annuler
            </Button>
          )}
          <Button type="primary" htmlType="submit" loading={isSubmitting || loading}>
            {deal ? "Mettre à jour l'affaire" : "Créer l'affaire"}
          </Button>
        </Space>
      </Form.Item>
    </Form>
  );
};
