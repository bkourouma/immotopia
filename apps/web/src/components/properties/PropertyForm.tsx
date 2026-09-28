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
  Radio,
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
import { getOwnerClients, TenantClient } from '../../services/tenant-service';
import { onAntFormValidationFailed } from '../../lib/antFormFailure';
import { apiErrorText, apiFieldErrors, fieldLabel } from './property-api-errors';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
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
      // Mêmes propriétaires que l'assistant de création : clients OWNER, rattrapage compris.
      setOwners(await getOwnerClients(tenantId));
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
    return num.toLocaleString(activeLocale(), { useGrouping: true, maximumFractionDigits: 0 });
  };

  const parseNumber = (value: string): string => {
    return value.replace(/\s/g, '');
  };

  const handleFinish = async (values: any) => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      if (!location && !property) {
        message.error(t('La localisation est requise'));
        setIsSubmitting(false);
        return;
      }

      const submitData: CreatePropertyRequest | UpdatePropertyRequest = {
        ...(property ? {} : { propertyType: selectedType!, ownershipType: values.ownershipType }),
        // Édition : un propriétaire vidé s'envoie `null` (sinon le serveur ne voit
        // aucun changement). Création : absent, le serveur décide.
        ownerUserId: values.ownerUserId || (property ? null : undefined),
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
        furnishingStatus: values.furnishingStatus ?? undefined,
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
      // Le refus de l'API désigne ses champs : on les marque sur le formulaire
      // et on les nomme dans le bandeau (le message seul ne dit rien).
      const fieldErrors = apiFieldErrors(error).filter(entry => fieldLabel(entry.field) !== entry.field);
      if (fieldErrors.length > 0) {
        form.setFields(fieldErrors.map(entry => ({ name: entry.field, errors: [entry.message] })));
        form.scrollToField(fieldErrors[0].field, { behavior: 'smooth', block: 'center' });
      }
      setSubmitError(apiErrorText(error, t("Une erreur est survenue lors de l'enregistrement")));
      message.error(t("Erreur lors de l'enregistrement"));
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
            <Select showSearch optionFilterProp="children" placeholder={t('Sélectionner...')}>
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
      onFinishFailed={onAntFormValidationFailed(form)}
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
            message={t('Erreur')}
            description={<span style={{ whiteSpace: 'pre-line' }}>{submitError}</span>}
            type="error"
            showIcon
            closable
            onClose={() => setSubmitError(null)}
          />
        )}

        {/* SECTION 1: IDENTIFICATION */}
        <Card title={t('1. Identification')}>
          {!property && (
            <>
              <Form.Item
                label={t('Type de bien')}
                name="propertyType"
                rules={[{ required: true, message: t('Le type de bien est requis') }]}
              >
                <PropertyTypeSelector
                  selectedType={selectedType}
                  onSelect={handleTypeSelect}
                  disabled={loadingTemplate}
                />
              </Form.Item>

              <Form.Item
                label={t('Type de propriété')}
                name="ownershipType"
                rules={[{ required: true, message: t('Le type de propriété est requis') }]}
              >
                <Select>
                  <Select.Option value={PropertyOwnershipType.TENANT}>{t("Propriété de l'agence")}</Select.Option>
                  <Select.Option value={PropertyOwnershipType.PUBLIC}>{t('Propriété privée')}</Select.Option>
                  <Select.Option value={PropertyOwnershipType.CLIENT}>{t('Mandat de gestion')}</Select.Option>
                </Select>
              </Form.Item>
            </>
          )}

          {property && (
            <Form.Item label={t('Référence interne')}>
              <Input value={property.internalReference} disabled />
            </Form.Item>
          )}

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => prevValues.ownershipType !== currentValues.ownershipType}
          >
            {({ getFieldValue }) => {
              // Sur un bien existant, `ownershipType` ne fait plus partie du
              // formulaire (le champ n'est affiché qu'à la création) : c'est
              // celui du bien lui-même qui fait foi. À la création, c'est la
              // valeur choisie juste au-dessus (ou son défaut : agence).
              const ownershipType: PropertyOwnershipType = property
                ? property.ownershipType
                : getFieldValue('ownershipType') || PropertyOwnershipType.TENANT;
              const ownerRequired = ownershipType !== PropertyOwnershipType.TENANT;
              return (
                <Form.Item
                  label={t('Propriétaire')}
                  name="ownerUserId"
                  rules={ownerRequired ? [{ required: true, message: t('Le propriétaire est requis') }] : []}
                  extra={
                    !ownerRequired
                      ? t("Ce bien appartient à l'agence : il n'a pas de propriétaire distinct.")
                      : undefined
                  }
                >
                  <Select
                    showSearch
                    optionFilterProp="children"
                    placeholder={loadingOwners ? 'Chargement...' : t('Sélectionner un propriétaire')}
                    allowClear
                    loading={loadingOwners}
                  >
                    {/* Le nom seul : l'adresse reste la valeur, elle n'a pas à être lue. */}
                    {owners.map(owner => (
                      <Select.Option key={owner.id} value={owner.userId}>
                        {owner.user.fullName || owner.user.email}
                      </Select.Option>
                    ))}
                    {/* Propriétaire enregistré mais absent de la liste des clients (bien
                        créé avant que l'agence n'ait plus de propriétaire par défaut) :
                        on montre son nom, jamais son identifiant brut. */}
                    {property?.ownerUserId &&
                      property.owner &&
                      !owners.some(owner => owner.userId === property.ownerUserId) && (
                        <Select.Option key={property.ownerUserId} value={property.ownerUserId}>
                          {property.owner.fullName || property.owner.email}
                        </Select.Option>
                      )}
                  </Select>
                </Form.Item>
              );
            }}
          </Form.Item>

          <Form.Item
            label={t('Titre du bien')}
            name="title"
            rules={[{ required: true, message: t('Le titre est requis') }]}
          >
            <Input placeholder={t('Ex: Appartement 3 pièces à Cocody')} />
          </Form.Item>

          {/* Facultative, comme sur l'écran de création. La colonne est
              `NOT NULL` en base mais sans défaut : la chaîne vide la satisfait. */}
          <Form.Item label={t('Description')} name="description">
            <TextArea rows={5} placeholder={t('Décrivez la propriété (facultatif)...')} />
          </Form.Item>

          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                label={t('Statut')}
                name="status"
                rules={[{ required: true, message: t('Le statut est requis') }]}
              >
                <Select showSearch optionFilterProp="children">
                  <Select.Option value={PropertyStatus.DRAFT}>{t('Brouillon')}</Select.Option>
                  <Select.Option value={PropertyStatus.AVAILABLE}>{t('Disponible')}</Select.Option>
                  <Select.Option value={PropertyStatus.RESERVED}>{t('Réservé')}</Select.Option>
                  <Select.Option value={PropertyStatus.UNDER_OFFER}>{t('Sous offre')}</Select.Option>
                  <Select.Option value={PropertyStatus.SOLD}>{t('Vendu')}</Select.Option>
                  <Select.Option value={PropertyStatus.RENTED}>{t('Loué')}</Select.Option>
                  <Select.Option value={PropertyStatus.ARCHIVED}>{t('Archivé')}</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                label={t('Disponibilité')}
                name="availability"
                rules={[{ required: true, message: t('La disponibilité est requise') }]}
              >
                <Select>
                  <Select.Option value={PropertyAvailability.AVAILABLE}>{t('Immédiate')}</Select.Option>
                  <Select.Option value={PropertyAvailability.SOON_AVAILABLE}>{t('Bientôt disponible')}</Select.Option>
                  <Select.Option value={PropertyAvailability.UNAVAILABLE}>{t('Indisponible')}</Select.Option>
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
                <Form.Item label={t('Date de disponibilité')} name="availabilityDate">
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
              ) : null
            }
          </Form.Item>
        </Card>

        {/* SECTION 2: LOCALISATION */}
        <Card title={t('2. Localisation')}>
          <Form.Item
            label={t('Localisation (Pays > Région > Commune)')}
            required
            validateStatus={!location && !property ? 'error' : ''}
            help={!location && !property ? t('La localisation est requise') : ''}
          >
            <LocationSelector
              value={location?.communeId}
              onChange={loc => setLocation(loc)}
              placeholder={t("Rechercher une localisation (ex: Cocody, Abidjan, Côte d'Ivoire)...")}
              required
            />
          </Form.Item>

          <Form.Item
            label={t('Adresse précise (optionnel)')}
            help={t(
              'Rue, quartier ou lieu – remplit automatiquement adresse et coordonnées (service gratuit Photon/OpenStreetMap)'
            )}
          >
            <AddressAutocomplete
              placeholder={t('Ex: rue de Rivoli, Paris ou quartier Cocody...')}
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
              <Form.Item label={t('Quartier/Zone (optionnel)')} name="locationZone">
                <Input placeholder={t('Ex: Angré, Riviera, etc.')} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label={t('Adresse')} name="address">
                <Input placeholder={t('Adresse complète (optionnel)')} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label={t('Latitude')} name="latitude">
                <InputNumber style={{ width: '100%' }} step={0.000001} placeholder={t('Ex: 5.3600')} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label={t('Longitude')} name="longitude">
                <InputNumber style={{ width: '100%' }} step={0.000001} placeholder={t('Ex: -4.0083')} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item label={t("Points d'intérêt (optionnel)")} name="pointsOfInterest">
                <TextArea rows={2} placeholder={t('Écoles, transports, commerces à proximité...')} />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* SECTION 3: CARACTÉRISTIQUES GÉNÉRALES */}
        <Card title={t('3. Caractéristiques générales')}>
          <Row gutter={16}>
            {selectedType !== PropertyType.TERRAIN && (
              <Col xs={24} sm={12}>
                <Form.Item label={t('Surface principale (m²)')} name="surfaceArea">
                  <InputNumber style={{ width: '100%' }} placeholder={t('Ex: 75')} />
                </Form.Item>
              </Col>
            )}
            {shouldShowUsefulSurface(selectedType || property?.propertyType || PropertyType.APPARTEMENT) && (
              <Col xs={24} sm={12}>
                <Form.Item label={t('Surface utile (m²)')} name="surfaceUseful">
                  <InputNumber style={{ width: '100%' }} placeholder={t('Ex: 65')} />
                </Form.Item>
              </Col>
            )}
            <Col xs={24} sm={12}>
              <Form.Item label={t('Année de construction')} name="constructionYear">
                <InputNumber
                  style={{ width: '100%' }}
                  min={1800}
                  max={new Date().getFullYear()}
                  placeholder={t('Ex: 2020')}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label={t('État général')} name="generalCondition">
                <Select showSearch optionFilterProp="children" placeholder={t('Sélectionner...')}>
                  <Select.Option value="NEUF">{t('Neuf')}</Select.Option>
                  <Select.Option value="BON">{t('Bon')}</Select.Option>
                  <Select.Option value="A_RENOVER">{t('À rénover')}</Select.Option>
                  <Select.Option value="EN_CHANTIER">{t('En chantier')}</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label={t('Standing')} name="standing">
                <Select showSearch optionFilterProp="children" placeholder={t('Sélectionner...')}>
                  <Select.Option value="ECONOMIQUE">{t('Économique')}</Select.Option>
                  <Select.Option value="STANDARD">{t('Standard')}</Select.Option>
                  <Select.Option value="HAUT_STANDING">{t('Haut standing')}</Select.Option>
                  <Select.Option value="LUXE">{t('Luxe')}</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* SECTION 4: PRIX & CONDITIONS */}
        <Card title={t('4. Prix & Conditions')}>
          {/* Un bien est mis en vente **ou** en location, pas les deux — même
              règle que l'écran de création. Les cases à cocher permettaient les
              deux à la fois, alors que le modèle n'a qu'une colonne `price` :
              le loyer n'avait alors nulle part où se loger et disparaissait
              sans un mot.

              « Location courte durée » n'est plus proposée. Un bien qui la
              porte déjà s'affiche sur « Location » et la conserve tant qu'on ne
              choisit pas autre chose. */}
          <Form.Item
            label={t("Type d'opération")}
            name="transactionModes"
            rules={[{ required: true, message: t('Un mode de transaction est requis') }]}
            getValueProps={(modes: PropertyTransactionMode[] = []) => ({
              value: modes.includes(PropertyTransactionMode.SALE)
                ? PropertyTransactionMode.SALE
                : modes.length > 0
                  ? PropertyTransactionMode.RENTAL
                  : undefined
            })}
            getValueFromEvent={(event: { target: { value: PropertyTransactionMode } }) => [event.target.value]}
          >
            <Radio.Group>
              <Space>
                <Radio value={PropertyTransactionMode.SALE}>{t('Vente')}</Radio>
                <Radio value={PropertyTransactionMode.RENTAL}>{t('Location')}</Radio>
              </Space>
            </Radio.Group>
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
              // La courte durée reste une location, caution comprise.
              const isRental =
                transactionModes.includes(PropertyTransactionMode.RENTAL) ||
                transactionModes.includes(PropertyTransactionMode.SHORT_TERM);
              const hideRentAndFees = propertyType === PropertyType.IMMEUBLE && isRental;
              return (
                <Row gutter={16}>
                  {!hideRentAndFees && (
                    <>
                      <Col xs={24} sm={8}>
                        <Form.Item label={isSale ? t('Prix de vente') : t('Loyer mensuel')} name="price">
                          <Input
                            placeholder={t('Ex: 50 000 000')}
                            onChange={e => {
                              const cleaned = parseNumber(e.target.value);
                              form.setFieldsValue({ price: cleaned });
                            }}
                            value={form.getFieldValue('price') ? formatNumber(form.getFieldValue('price')) : ''}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Form.Item
                          label={isSale ? t('Charges de copropriété') : t('Charges (provision mensuelle)')}
                          name="fees"
                        >
                          <Input
                            placeholder={t('Ex: 50 000')}
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
                  {/* Le champ « Devise » a été retiré : tous les biens sont
                      libellés en francs CFA. La valeur continue de partir à
                      l'API — c'est le choix qui disparaît, pas la donnée. */}
                  {isRental && (
                    <Col xs={24} sm={8}>
                      <Form.Item label={t('Dépôt de garantie')} name="deposit">
                        <Input
                          placeholder={t('Ex: 500 000')}
                          onChange={e => {
                            const cleaned = parseNumber(e.target.value);
                            form.setFieldsValue({ deposit: cleaned });
                          }}
                          value={form.getFieldValue('deposit') ? formatNumber(form.getFieldValue('deposit')) : ''}
                        />
                      </Form.Item>
                    </Col>
                  )}
                  {/* Mode de commission et honoraires retirés : la rémunération
                      d'agence ne se gère pas depuis la fiche d'un bien. Les clés
                      restent dans `typeSpecificData` pour les biens qui les
                      portent déjà. */}
                </Row>
              );
            }}
          </Form.Item>
        </Card>

        {/* SECTION 5: CARACTÉRISTIQUES PHYSIQUES */}
        {selectedType && shouldShowRooms(selectedType) && (
          <Card title={t('5. Caractéristiques physiques')}>
            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item label={t('Nombre de pièces')} name="rooms">
                  <InputNumber style={{ width: '100%' }} placeholder={t('Ex: 3')} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label={t('Chambres')} name="bedrooms">
                  <InputNumber style={{ width: '100%' }} placeholder={t('Ex: 2')} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label={t('Salles de bain / WC')} name="bathrooms">
                  <InputNumber style={{ width: '100%' }} placeholder={t('Ex: 1')} />
                </Form.Item>
              </Col>
              {selectedType === PropertyType.MAISON_VILLA && (
                <Col xs={24} sm={12}>
                  <Form.Item label={t('Surface terrain (m²)')} name="surfaceTerrain">
                    <InputNumber style={{ width: '100%' }} placeholder={t('Ex: 500')} />
                  </Form.Item>
                </Col>
              )}
              {(selectedType === PropertyType.APPARTEMENT ||
                selectedType === PropertyType.STUDIO ||
                selectedType === PropertyType.DUPLEX_TRIPLEX) && (
                <Col xs={24} sm={12}>
                  <Form.Item label={t('Meublé')} name="furnishingStatus">
                    <Select>
                      <Select.Option value={PropertyFurnishingStatus.UNFURNISHED}>{t('Non meublé')}</Select.Option>
                      <Select.Option value={PropertyFurnishingStatus.FURNISHED}>{t('Meublé')}</Select.Option>
                      <Select.Option value={PropertyFurnishingStatus.PARTIALLY_FURNISHED}>
                        {t('Partiellement meublé')}
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
          <Card title={t('6. Caractéristiques spécifiques')}>
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
                                ? { ...field, label: t("Nombre total d'appartements") }
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
              {t('Annuler')}
            </Button>
          )}
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={isSubmitting || loading}>
            {isSubmitting ? 'Enregistrement...' : property ? t('Mettre à jour') : t('Créer')}
          </Button>
        </div>
      </Space>
    </Form>
  );
};
