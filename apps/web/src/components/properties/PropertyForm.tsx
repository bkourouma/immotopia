import React, { useState, useEffect } from 'react';
import {
  App,
  Form,
  Input,
  Select,
  Button,
  Card,
  Space,
  Row,
  Col,
  Typography,
  Alert,
  Checkbox,
  DatePicker,
  InputNumber,
  Divider,
  Spin
} from 'antd';
import { SaveOutlined, HomeOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { LocationSelector } from '../ui/location-selector';
import { AddressAutocomplete, AddressSuggestion } from '../ui/address-autocomplete';
import { PropertyTypeSelector } from './PropertyTypeSelector';
import { GeographicLocation, getLocationByCommuneId } from '../../services/geographic-service';
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
  PropertyStatus
} from '../../types/property-types';
import { getTemplate } from '../../services/property-service';
import { useAuth } from '../../hooks/useAuth';
import { getTenantClients, TenantClient } from '../../services/tenant-service';

const { TextArea } = Input;
const { Title, Text } = Typography;

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
  loading = false
}) => {
  const { message } = App.useApp();

  const [form] = Form.useForm();
  const { tenantMembership } = useAuth();
  const [selectedType, setSelectedType] = useState<PropertyType | undefined>(property?.propertyType);
  const [template, setTemplate] = useState<PropertyTypeTemplate | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [owners, setOwners] = useState<TenantClient[]>([]);
  const [loadingOwners, setLoadingOwners] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [location, setLocation] = useState<GeographicLocation | null>(null);

  useEffect(() => {
    loadOwners();
  }, [tenantId]);

  useEffect(() => {
    if (selectedType && !property) {
      loadTemplate(selectedType);
    } else if (property?.propertyType) {
      loadTemplate(property.propertyType);
    }
  }, [selectedType, property]);

  useEffect(() => {
    const loadLocation = async () => {
      if (property?.typeSpecificData) {
        const communeId = property.typeSpecificData.communeId;
        if (communeId) {
          const constructLocationFromData = (): GeographicLocation => ({
            id: communeId,
            communeId: communeId,
            commune: property.typeSpecificData?.commune || '',
            regionId: property.typeSpecificData?.regionId || '',
            region: property.typeSpecificData?.region || '',
            countryId: property.typeSpecificData?.countryId || '',
            country: property.typeSpecificData?.country || '',
            displayName: `${property.typeSpecificData?.commune || ''}, ${property.typeSpecificData?.region || ''}, ${property.typeSpecificData?.country || ''}`,
            searchText: `${property.typeSpecificData?.commune || ''} ${property.typeSpecificData?.region || ''} ${property.typeSpecificData?.country || ''}`
          });

          try {
            const loc = await getLocationByCommuneId(communeId);
            if (loc) {
              setLocation(loc);
            } else if (property.typeSpecificData.commune) {
              setLocation(constructLocationFromData());
            }
          } catch (error) {
            console.error('Error loading location:', error);
            if (property.typeSpecificData.commune) {
              setLocation(constructLocationFromData());
            }
          }
        }
      }
    };

    loadLocation();
  }, [property]);

  useEffect(() => {
    if (property) {
      form.setFieldsValue({
        title: property.title,
        description: property.description,
        status: property.status,
        availability: property.availability,
        availabilityDate: property.typeSpecificData?.availabilityDate
          ? dayjs(property.typeSpecificData.availabilityDate)
          : undefined,
        locationZone: property.locationZone,
        address: property.address,
        latitude: property.latitude,
        longitude: property.longitude,
        pointsOfInterest: property.typeSpecificData?.pointsOfInterest,
        surfaceArea: property.surfaceArea,
        surfaceUseful: property.surfaceUseful,
        constructionYear: property.typeSpecificData?.constructionYear,
        generalCondition: property.typeSpecificData?.generalCondition,
        standing: property.typeSpecificData?.standing,
        transactionModes: property.transactionModes,
        price: property.price,
        fees: property.fees,
        currency: property.currency,
        deposit: property.typeSpecificData?.deposit,
        commissionMode: property.typeSpecificData?.commissionMode,
        commissionAmount: property.typeSpecificData?.commissionAmount,
        rooms: property.rooms,
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        surfaceTerrain: property.surfaceTerrain,
        furnishingStatus: property.furnishingStatus,
        ownerUserId: property.ownerUserId || undefined,
        ownershipType: property.ownershipType
      });
    }
  }, [property, form]);

  const loadOwners = async () => {
    setLoadingOwners(true);
    try {
      const response = await getTenantClients(tenantId);
      if (response.success) {
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
    } catch (error) {
      console.error('Error loading template:', error);
    } finally {
      setLoadingTemplate(false);
    }
  };

  const handleTypeSelect = (type: PropertyType) => {
    setSelectedType(type);
    form.setFieldsValue({ propertyType: type });
    loadTemplate(type);
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

  const handleFinish = async (values: any) => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      if (!location && !property) {
        message.error('La localisation est requise');
        setIsSubmitting(false);
        return;
      }

      const submitData: CreatePropertyRequest | UpdatePropertyRequest = {
        ...(property ? {} : { propertyType: selectedType!, ownershipType: values.ownershipType }),
        ownerUserId: values.ownerUserId || undefined,
        title: values.title.trim(),
        description: values.description.trim(),
        address: values.address?.trim() || undefined,
        locationZone: values.locationZone?.trim() || undefined,
        latitude: values.latitude ? parseFloat(values.latitude) : undefined,
        longitude: values.longitude ? parseFloat(values.longitude) : undefined,
        transactionModes: values.transactionModes || [PropertyTransactionMode.SALE],
        price: values.price ? parseFloat(parseNumber(String(values.price))) : undefined,
        fees: values.fees ? parseFloat(parseNumber(String(values.fees))) : undefined,
        currency: values.currency || 'CFA',
        surfaceArea: values.surfaceArea ? parseFloat(String(values.surfaceArea)) : undefined,
        surfaceUseful: values.surfaceUseful ? parseFloat(String(values.surfaceUseful)) : undefined,
        surfaceTerrain: values.surfaceTerrain ? parseFloat(String(values.surfaceTerrain)) : undefined,
        rooms: values.rooms ? parseInt(String(values.rooms), 10) : undefined,
        bedrooms: values.bedrooms ? parseInt(String(values.bedrooms), 10) : undefined,
        bathrooms: values.bathrooms ? parseInt(String(values.bathrooms), 10) : undefined,
        furnishingStatus: values.furnishingStatus,
        availability: values.availability,
        status: values.status,
        typeSpecificData: {
          ...(property?.typeSpecificData || {}),
          country: location?.country,
          countryId: location?.countryId,
          region: location?.region,
          regionId: location?.regionId,
          commune: location?.commune,
          communeId: location?.communeId,
          pointsOfInterest: values.pointsOfInterest,
          constructionYear: values.constructionYear ? parseInt(String(values.constructionYear), 10) : undefined,
          generalCondition: values.generalCondition,
          standing: values.standing,
          deposit: values.deposit ? parseFloat(parseNumber(String(values.deposit))) : undefined,
          commissionMode: values.commissionMode,
          commissionAmount: values.commissionAmount
            ? parseFloat(parseNumber(String(values.commissionAmount)))
            : undefined,
          availabilityDate: values.availabilityDate ? dayjs(values.availabilityDate).format('YYYY-MM-DD') : undefined
        }
      };

      await onSubmit(submitData);
    } catch (error: any) {
      setSubmitError(error.response?.data?.error || "Une erreur est survenue lors de l'enregistrement");
      message.error("Erreur lors de l'enregistrement");
    } finally {
      setIsSubmitting(false);
    }
  };

  const shouldShowRooms = (propertyType: PropertyType): boolean => {
    return (
      propertyType === PropertyType.APPARTEMENT ||
      propertyType === PropertyType.STUDIO ||
      propertyType === PropertyType.DUPLEX_TRIPLEX ||
      propertyType === PropertyType.MAISON_VILLA ||
      propertyType === PropertyType.CHAMBRE_COLOCATION
    );
  };

  const shouldShowUsefulSurface = (propertyType: PropertyType): boolean => {
    return (
      propertyType === PropertyType.APPARTEMENT ||
      propertyType === PropertyType.STUDIO ||
      propertyType === PropertyType.DUPLEX_TRIPLEX ||
      propertyType === PropertyType.MAISON_VILLA ||
      propertyType === PropertyType.BUREAU
    );
  };

  const renderField = (field: any) => {
    const fieldKey = `typeSpecific.${field.key}`;
    const value = form.getFieldValue(fieldKey) || field.defaultValue || '';

    switch (field.type) {
      case 'text':
        return (
          <Form.Item
            key={field.key}
            name={fieldKey}
            label={field.label}
            rules={field.required ? [{ required: true, message: `${field.label} est requis` }] : []}
          >
            <Input placeholder={field.label} />
          </Form.Item>
        );

      case 'number':
        return (
          <Form.Item
            key={field.key}
            name={fieldKey}
            label={field.label}
            rules={field.required ? [{ required: true, message: `${field.label} est requis` }] : []}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={field.validation?.min}
              max={field.validation?.max}
              placeholder={field.label}
            />
          </Form.Item>
        );

      case 'boolean':
        return (
          <Form.Item
            key={field.key}
            name={fieldKey}
            valuePropName="checked"
            rules={field.required ? [{ required: true, message: `${field.label} est requis` }] : []}
          >
            <Checkbox>{field.label}</Checkbox>
          </Form.Item>
        );

      case 'select':
        return (
          <Form.Item
            key={field.key}
            name={fieldKey}
            label={field.label}
            rules={field.required ? [{ required: true, message: `${field.label} est requis` }] : []}
          >
            <Select placeholder="Sélectionner...">
              {field.validation?.options && Array.isArray(field.validation.options)
                ? field.validation.options.map((option: string) => (
                    <Select.Option key={option} value={option}>
                      {option.replace(/_/g, ' ')}
                    </Select.Option>
                  ))
                : null}
            </Select>
          </Form.Item>
        );

      case 'date':
        return (
          <Form.Item
            key={field.key}
            name={fieldKey}
            label={field.label}
            rules={field.required ? [{ required: true, message: `${field.label} est requis` }] : []}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        );

      default:
        return null;
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleFinish}
      initialValues={{
        ownershipType: property?.ownershipType || PropertyOwnershipType.TENANT,
        status: property?.status || PropertyStatus.DRAFT,
        availability: property?.availability || PropertyAvailability.AVAILABLE,
        transactionModes: property?.transactionModes || [PropertyTransactionMode.SALE],
        currency: property?.currency || 'CFA',
        furnishingStatus: property?.furnishingStatus || PropertyFurnishingStatus.UNFURNISHED
      }}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {submitError && (
          <Alert
            message="Erreur"
            description={submitError}
            type="error"
            showIcon
            closable
            onClose={() => setSubmitError(null)}
          />
        )}

        {/* SECTION 1: IDENTIFICATION */}
        <Card title="1. Identification">
          {!property && (
            <>
              <Form.Item
                label="Type de bien"
                name="propertyType"
                rules={[{ required: true, message: 'Le type de bien est requis' }]}
              >
                <PropertyTypeSelector
                  selectedType={selectedType}
                  onSelect={handleTypeSelect}
                  disabled={loadingTemplate}
                />
              </Form.Item>

              <Form.Item
                label="Type de propriété"
                name="ownershipType"
                rules={[{ required: true, message: 'Le type de propriété est requis' }]}
              >
                <Select>
                  <Select.Option value={PropertyOwnershipType.TENANT}>Propriété de l'agence</Select.Option>
                  <Select.Option value={PropertyOwnershipType.PUBLIC}>Propriété privée</Select.Option>
                  <Select.Option value={PropertyOwnershipType.CLIENT}>Mandat de gestion</Select.Option>
                </Select>
              </Form.Item>
            </>
          )}

          {property && (
            <Form.Item label="Référence interne">
              <Input value={property.internalReference} disabled />
            </Form.Item>
          )}

          <Form.Item
            label="Propriétaire"
            name="ownerUserId"
            rules={[{ required: true, message: 'Le propriétaire est requis' }]}
          >
            <Select
              placeholder={loadingOwners ? 'Chargement...' : 'Sélectionner un propriétaire'}
              allowClear
              loading={loadingOwners}
            >
              {owners.map(owner => (
                <Select.Option key={owner.id} value={owner.userId}>
                  {owner.user.fullName || owner.user.email}
                  {owner.user.email && owner.user.fullName ? ` (${owner.user.email})` : ''}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item label="Titre du bien" name="title" rules={[{ required: true, message: 'Le titre est requis' }]}>
            <Input placeholder="Ex: Appartement 3 pièces à Cocody" />
          </Form.Item>

          <Form.Item
            label="Description"
            name="description"
            rules={[{ required: true, message: 'La description est requise' }]}
          >
            <TextArea rows={5} placeholder="Description détaillée du bien..." />
          </Form.Item>

          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item label="Statut" name="status" rules={[{ required: true, message: 'Le statut est requis' }]}>
                <Select>
                  <Select.Option value={PropertyStatus.DRAFT}>Brouillon</Select.Option>
                  <Select.Option value={PropertyStatus.AVAILABLE}>Disponible</Select.Option>
                  <Select.Option value={PropertyStatus.RESERVED}>Réservé</Select.Option>
                  <Select.Option value={PropertyStatus.UNDER_OFFER}>Sous offre</Select.Option>
                  <Select.Option value={PropertyStatus.SOLD}>Vendu</Select.Option>
                  <Select.Option value={PropertyStatus.RENTED}>Loué</Select.Option>
                  <Select.Option value={PropertyStatus.ARCHIVED}>Archivé</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                label="Disponibilité"
                name="availability"
                rules={[{ required: true, message: 'La disponibilité est requise' }]}
              >
                <Select>
                  <Select.Option value={PropertyAvailability.AVAILABLE}>Immédiate</Select.Option>
                  <Select.Option value={PropertyAvailability.SOON_AVAILABLE}>Bientôt disponible</Select.Option>
                  <Select.Option value={PropertyAvailability.UNAVAILABLE}>Indisponible</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => prevValues.availability !== currentValues.availability}
          >
            {({ getFieldValue }) =>
              getFieldValue('availability') === PropertyAvailability.SOON_AVAILABLE ? (
                <Form.Item label="Date de disponibilité" name="availabilityDate">
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
              ) : null
            }
          </Form.Item>
        </Card>

        {/* SECTION 2: LOCALISATION */}
        <Card title="2. Localisation">
          <Form.Item
            label="Localisation (Pays > Région > Commune)"
            required
            validateStatus={!location && !property ? 'error' : ''}
            help={!location && !property ? 'La localisation est requise' : ''}
          >
            <LocationSelector
              value={location?.communeId}
              onChange={loc => setLocation(loc)}
              placeholder="Rechercher une localisation (ex: Cocody, Abidjan, Côte d'Ivoire)..."
              required
            />
          </Form.Item>

          <Form.Item
            label="Adresse précise (optionnel)"
            help="Rue, quartier ou lieu – remplit automatiquement adresse et coordonnées (service gratuit Photon/OpenStreetMap)"
          >
            <AddressAutocomplete
              placeholder="Ex: rue de Rivoli, Paris ou quartier Cocody..."
              onSelect={(suggestion: AddressSuggestion) => {
                form.setFieldsValue({
                  address: suggestion.address,
                  locationZone: suggestion.locationZone ?? form.getFieldValue('locationZone'),
                  latitude: suggestion.latitude,
                  longitude: suggestion.longitude
                });
              }}
            />
          </Form.Item>

          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item label="Quartier/Zone (optionnel)" name="locationZone">
                <Input placeholder="Ex: Angré, Riviera, etc." />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="Adresse" name="address">
                <Input placeholder="Adresse complète (optionnel)" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="Latitude" name="latitude">
                <InputNumber style={{ width: '100%' }} step={0.000001} placeholder="Ex: 5.3600" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="Longitude" name="longitude">
                <InputNumber style={{ width: '100%' }} step={0.000001} placeholder="Ex: -4.0083" />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item label="Points d'intérêt (optionnel)" name="pointsOfInterest">
                <TextArea rows={2} placeholder="Écoles, transports, commerces à proximité..." />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* SECTION 3: CARACTÉRISTIQUES GÉNÉRALES */}
        <Card title="3. Caractéristiques générales">
          <Row gutter={16}>
            {selectedType !== PropertyType.TERRAIN && (
              <Col xs={24} sm={12}>
                <Form.Item label="Surface principale (m²)" name="surfaceArea">
                  <InputNumber style={{ width: '100%' }} placeholder="Ex: 75" />
                </Form.Item>
              </Col>
            )}
            {shouldShowUsefulSurface(selectedType || property?.propertyType || PropertyType.APPARTEMENT) && (
              <Col xs={24} sm={12}>
                <Form.Item label="Surface utile (m²)" name="surfaceUseful">
                  <InputNumber style={{ width: '100%' }} placeholder="Ex: 65" />
                </Form.Item>
              </Col>
            )}
            <Col xs={24} sm={12}>
              <Form.Item label="Année de construction" name="constructionYear">
                <InputNumber
                  style={{ width: '100%' }}
                  min={1800}
                  max={new Date().getFullYear()}
                  placeholder="Ex: 2020"
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="État général" name="generalCondition">
                <Select placeholder="Sélectionner...">
                  <Select.Option value="NEUF">Neuf</Select.Option>
                  <Select.Option value="BON">Bon</Select.Option>
                  <Select.Option value="A_RENOVER">À rénover</Select.Option>
                  <Select.Option value="EN_CHANTIER">En chantier</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="Standing" name="standing">
                <Select placeholder="Sélectionner...">
                  <Select.Option value="ECONOMIQUE">Économique</Select.Option>
                  <Select.Option value="STANDARD">Standard</Select.Option>
                  <Select.Option value="HAUT_STANDING">Haut standing</Select.Option>
                  <Select.Option value="LUXE">Luxe</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* SECTION 4: PRIX & CONDITIONS */}
        <Card title="4. Prix & Conditions">
          <Form.Item
            label="Type d'opération"
            name="transactionModes"
            rules={[{ required: true, message: 'Au moins un mode de transaction est requis' }]}
          >
            <Checkbox.Group>
              <Space>
                <Checkbox value={PropertyTransactionMode.SALE}>Vente</Checkbox>
                <Checkbox value={PropertyTransactionMode.RENTAL}>Location</Checkbox>
                <Checkbox value={PropertyTransactionMode.SHORT_TERM}>Location courte durée</Checkbox>
              </Space>
            </Checkbox.Group>
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) =>
              prevValues.transactionModes !== currentValues.transactionModes ||
              prevValues.propertyType !== currentValues.propertyType
            }
          >
            {({ getFieldValue }) => {
              const transactionModes = getFieldValue('transactionModes') || [];
              const propertyType = getFieldValue('propertyType') || selectedType || property?.propertyType;
              const isSale = transactionModes.includes(PropertyTransactionMode.SALE);
              const hideRentAndFees =
                propertyType === PropertyType.IMMEUBLE &&
                (transactionModes.includes(PropertyTransactionMode.RENTAL) ||
                  transactionModes.includes(PropertyTransactionMode.SHORT_TERM));
              return (
                <Row gutter={16}>
                  {!hideRentAndFees && (
                    <>
                      <Col xs={24} sm={8}>
                        <Form.Item label={isSale ? 'Prix (vente)' : 'Loyer (location)'} name="price">
                          <Input
                            placeholder="Ex: 50 000 000"
                            onChange={e => {
                              const cleaned = parseNumber(e.target.value);
                              form.setFieldsValue({ price: cleaned });
                            }}
                            value={form.getFieldValue('price') ? formatNumber(form.getFieldValue('price')) : ''}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Form.Item label="Charges" name="fees">
                          <Input
                            placeholder="Ex: 50 000"
                            onChange={e => {
                              const cleaned = parseNumber(e.target.value);
                              form.setFieldsValue({ fees: cleaned });
                            }}
                            value={form.getFieldValue('fees') ? formatNumber(form.getFieldValue('fees')) : ''}
                          />
                        </Form.Item>
                      </Col>
                    </>
                  )}
                  <Col xs={24} sm={8}>
                    <Form.Item label="Devise" name="currency">
                      <Select>
                        <Select.Option value="CFA">CFA</Select.Option>
                        <Select.Option value="EUR">EUR</Select.Option>
                        <Select.Option value="USD">USD</Select.Option>
                      </Select>
                    </Form.Item>
                  </Col>
                  {transactionModes.includes(PropertyTransactionMode.RENTAL) && (
                    <Col xs={24} sm={8}>
                      <Form.Item label="Dépôt de garantie" name="deposit">
                        <Input
                          placeholder="Ex: 500 000"
                          onChange={e => {
                            const cleaned = parseNumber(e.target.value);
                            form.setFieldsValue({ deposit: cleaned });
                          }}
                          value={form.getFieldValue('deposit') ? formatNumber(form.getFieldValue('deposit')) : ''}
                        />
                      </Form.Item>
                    </Col>
                  )}
                  <Col xs={24} sm={8}>
                    <Form.Item label="Mode de commission" name="commissionMode">
                      <Select placeholder="Sélectionner...">
                        <Select.Option value="FIXE">Fixe</Select.Option>
                        <Select.Option value="POURCENTAGE">Pourcentage</Select.Option>
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={8}>
                    <Form.Item label="Commission / Honoraires" name="commissionAmount">
                      <Input
                        placeholder="Ex: 1 000 000"
                        onChange={e => {
                          const cleaned = parseNumber(e.target.value);
                          form.setFieldsValue({ commissionAmount: cleaned });
                        }}
                        value={
                          form.getFieldValue('commissionAmount')
                            ? formatNumber(form.getFieldValue('commissionAmount'))
                            : ''
                        }
                      />
                    </Form.Item>
                  </Col>
                </Row>
              );
            }}
          </Form.Item>
        </Card>

        {/* SECTION 5: CARACTÉRISTIQUES PHYSIQUES */}
        {selectedType && shouldShowRooms(selectedType) && (
          <Card title="5. Caractéristiques physiques">
            <Row gutter={16}>
              <Col xs={24} sm={8}>
                <Form.Item label="Nombre de pièces" name="rooms">
                  <InputNumber style={{ width: '100%' }} placeholder="Ex: 3" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label="Chambres" name="bedrooms">
                  <InputNumber style={{ width: '100%' }} placeholder="Ex: 2" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label="Salles de bain / WC" name="bathrooms">
                  <InputNumber style={{ width: '100%' }} placeholder="Ex: 1" />
                </Form.Item>
              </Col>
              {selectedType === PropertyType.MAISON_VILLA && (
                <Col xs={24} sm={8}>
                  <Form.Item label="Surface terrain (m²)" name="surfaceTerrain">
                    <InputNumber style={{ width: '100%' }} placeholder="Ex: 500" />
                  </Form.Item>
                </Col>
              )}
              {(selectedType === PropertyType.APPARTEMENT ||
                selectedType === PropertyType.STUDIO ||
                selectedType === PropertyType.DUPLEX_TRIPLEX) && (
                <Col xs={24} sm={8}>
                  <Form.Item label="Meublé" name="furnishingStatus">
                    <Select>
                      <Select.Option value={PropertyFurnishingStatus.UNFURNISHED}>Non meublé</Select.Option>
                      <Select.Option value={PropertyFurnishingStatus.FURNISHED}>Meublé</Select.Option>
                      <Select.Option value={PropertyFurnishingStatus.PARTIALLY_FURNISHED}>
                        Partiellement meublé
                      </Select.Option>
                    </Select>
                  </Form.Item>
                </Col>
              )}
            </Row>
          </Card>
        )}

        {/* SECTION 6: CARACTÉRISTIQUES SPÉCIFIQUES */}
        {template && template.sections && Array.isArray(template.sections) && template.sections.length > 0 && (
          <Card title="6. Caractéristiques spécifiques">
            {loadingTemplate ? (
              <div style={{ textAlign: 'center', padding: '24px' }}>
                <Spin />
              </div>
            ) : (
              template.sections
                .sort((a, b) => a.order - b.order)
                .map(section => (
                  <Card key={section.key} type="inner" title={section.label} style={{ marginBottom: 16 }}>
                    <Row gutter={16}>
                      {section.fields && Array.isArray(section.fields)
                        ? section.fields.map(fieldKey => {
                            const field = template.fieldDefinitions?.find(f => f.key === fieldKey);
                            if (!field) return null;
                            const currentType = selectedType || property?.propertyType;
                            if (currentType === PropertyType.IMMEUBLE && field.key === 'occupancy_rate') return null;
                            const displayField =
                              currentType === PropertyType.IMMEUBLE && field.key === 'units_count'
                                ? { ...field, label: "Nombre total d'appartements" }
                                : field;
                            return (
                              <Col key={field.key} xs={24} sm={12}>
                                {renderField(displayField)}
                              </Col>
                            );
                          })
                        : null}
                    </Row>
                  </Card>
                ))
            )}
          </Card>
        )}

        {/* Actions */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 16,
            paddingTop: 16,
            borderTop: '1px solid #f0f0f0'
          }}
        >
          {onCancel && (
            <Button onClick={onCancel} disabled={isSubmitting}>
              Annuler
            </Button>
          )}
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={isSubmitting || loading}>
            {isSubmitting ? 'Enregistrement...' : property ? 'Mettre à jour' : 'Créer'}
          </Button>
        </div>
      </Space>
    </Form>
  );
};
