import React, { useState, useEffect, useRef } from 'react';
import {
  App,
  Card,
  Space,
  Typography,
  Input,
  Select,
  Button,
  Checkbox,
  Radio,
  InputNumber,
  DatePicker,
  Row,
  Col,
  Alert,
  Spin,
  Empty,
  Divider
} from 'antd';
import { ArrowLeftOutlined, ArrowRightOutlined, CheckCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { StepRail } from '../primitives/StepRail';
import { PropertyTypeSelector } from './PropertyTypeSelector';
import { LocationSelector } from '../ui/location-selector';
import { PropertyMediaUpload } from './PropertyMediaUpload';
import { PropertyMediaGallery } from './PropertyMediaGallery';
import apiClient from '../../utils/api-client';
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
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useOwnAssetsOnly } from '../../hooks/useMenuAccess';
import { contactDisplayName } from '../../utils/contact-display';
import { listContacts, CrmContact } from '../../services/crm-service';
import { t } from '../../i18n/t';
import { isQuotaExceededResponse } from '../../utils/subscription-denial-notice';

import { activeLocale } from '../../i18n/format';
const { TextArea } = Input;
const { Title, Text } = Typography;

/**
 * Les étapes du parcours, désignées par un nom et non par leur rang.
 *
 * Le rang était la seule identité d'une étape : la validation branchait sur
 * `case 3`, l'enregistrement préalable aux médias sur `currentStep === 5`.
 * Tant que les six étapes étaient les mêmes pour tous les types de bien, cela
 * tenait. Dès qu'une étape disparaît — un parking n'a pas de caractéristiques
 * générales — ou s'ajoute — un immeuble a des appartements — tous les rangs
 * glissent et chaque branche désigne l'étape d'à côté.
 */
type CleEtape = 'identification' | 'localisation' | 'caracteristiques' | 'prix' | 'specificites' | 'medias';

/** Étapes qui exigent que le bien existe déjà en base pour fonctionner. */
const ETAPES_APRES_ENREGISTREMENT: CleEtape[] = ['medias'];

/**
 * Un appartement saisi au fil de la création de l'immeuble.
 *
 * Les lots se créaient un par un dans une fenêtre modale, après coup, depuis la
 * fiche de l'immeuble. Ils se saisissent maintenant dans la page, à la suite des
 * caractéristiques de l'immeuble : le nombre d'appartements déclaré fait
 * apparaître autant de lignes, pré-titrées et modifiables. Rien ne part en base
 * avant le bouton final.
 */
interface AppartementSaisi {
  titre: string;
  surface: string;
  pieces: string;
  chambres: string;
  sallesDeBain: string;
  prix: string;
}

/**
 * Plafond du nombre de lignes générées, ET de la saisie du champ « Nombre
 * total d'appartements » lui-même (voir `validation.max` injecté plus bas).
 *
 * Une faute de frappe dans ce champ — 1200 au lieu de 12 — ne doit pas tenter
 * de peindre mille deux cents formulaires et figer l'onglet.
 *
 * Ce plafond doit rester au-dessus de tout immeuble réel : il bornait
 * auparavant aussi la CRÉATION effective des lots (`creerLesAppartements` ne
 * crée que les lignes de `appartements`), si bien qu'un immeuble de 79 ou 102
 * appartements (cf. docs/recette/SCENARIO_SYNDIC_ABONNEMENT.md, immeuble « Les
 * Manguiers ») en perdait silencieusement une partie à la création. Fixé à
 * 200 : large marge au-dessus des tailles réelles observées, tout en bloquant
 * la saisie sur une faute de frappe.
 */
const MAX_APPARTEMENTS = 200;

function appartementVide(rang: number): AppartementSaisi {
  return { titre: `Appartement ${rang}`, surface: '', pieces: '', chambres: '', sallesDeBain: '', prix: '' };
}

/**
 * Ce que « Caractéristiques générales » a à demander, type par type.
 *
 * L'écran posait ces questions à tout le monde, en excluant au cas par cas au
 * fil du JSX. Un parking n'y trouvait donc **aucun champ** : l'étape s'affichait
 * vide, et il fallait cliquer « Suivant » sur une page blanche. Un terrain n'y
 * lisait qu'un encart annonçant l'étape suivante.
 *
 * La table dit qui demande quoi. Quand elle ne retient rien, l'étape n'existe
 * pas — c'est `aDesCaracteristiquesGenerales` qui le décide.
 */
function caracteristiquesGenerales(type: PropertyType) {
  const batiDatable = ![PropertyType.TERRAIN, PropertyType.PARKING_BOX, PropertyType.LOT_PROGRAMME_NEUF].includes(type);
  const habitable = [
    PropertyType.APPARTEMENT,
    PropertyType.STUDIO,
    PropertyType.DUPLEX_TRIPLEX,
    PropertyType.MAISON_VILLA,
    PropertyType.CHAMBRE_COLOCATION
  ].includes(type);

  return {
    // L'immeuble non plus : sa surface est la somme de celle de ses
    // appartements, saisies lot par lot. Une « surface principale » d'immeuble
    // ne serait ni vérifiable ni utilisée.
    surface: ![PropertyType.TERRAIN, PropertyType.PARKING_BOX, PropertyType.IMMEUBLE].includes(type),
    anneeEtEtat: batiDatable,
    // Le standing classe un logement ou un immeuble de bureaux. Il ne veut rien
    // dire d'un entrepôt, d'un terrain ou d'une place de parking.
    standing: habitable || [PropertyType.IMMEUBLE, PropertyType.BUREAU].includes(type),
    pieces: habitable,
    surfaceTerrain: type === PropertyType.MAISON_VILLA,
    meuble: [PropertyType.APPARTEMENT, PropertyType.STUDIO, PropertyType.DUPLEX_TRIPLEX].includes(type)
  };
}

function aDesCaracteristiquesGenerales(type: PropertyType): boolean {
  return Object.values(caracteristiquesGenerales(type)).some(Boolean);
}

/**
 * Le nom affiché d'un propriétaire dans la liste.
 *
 * L'adresse e-mail suivait le nom entre parenthèses ; elle reste la valeur
 * envoyée, mais n'a plus à être lue. Le repli n'est pas décoratif : un contact
 * de type `COMPANY` porte sa raison sociale et peut n'avoir ni prénom ni nom,
 * et une option vide serait impossible à choisir. Il n'y en a aucun dans le
 * jeu actuel — le type en autorise.
 */
function nomProprietaire(owner: CrmContact): string {
  return contactDisplayName(owner);
}

interface PropertyFormWizardProps {
  property?: Property;
  tenantId: string;
  onComplete?: (propertyId: string) => void;
  onCancel?: () => void;
}

export const PropertyFormWizard: React.FC<PropertyFormWizardProps> = ({ property, tenantId, onComplete, onCancel }) => {
  const { message } = App.useApp();

  const { tenantMembership } = useAuth();
  const { isDesktop } = useBreakpoint();
  // Compte « détenu en propre » : pas de propriétaire tiers, le bien reste à l'agence.
  const ownAssetsOnly = useOwnAssetsOnly(tenantId, !property);
  const [currentStep, setCurrentStep] = useState(0);
  // Etape la plus avancee atteinte : borne ce sur quoi le rail est cliquable.
  // Sans elle, un clic sur la sixieme pastille depuis la premiere etape ne
  // validait que l'etape courante et sautait les quatre du milieu.
  const [maxStepReached, setMaxStepReached] = useState(0);
  const [savedPropertyId, setSavedPropertyId] = useState<string | null>(property?.id || null);
  const [appartements, setAppartements] = useState<AppartementSaisi[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [template, setTemplate] = useState<PropertyTypeTemplate | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const autoSaveAttemptedRef = useRef(false);
  // Vrai tant que handleFinish tourne. Un double clic sur « Terminer »
  // declenche deux appels avant que React n'ait rendu le bouton en
  // chargement : le second repartirait avec un POST de creation.
  const finishInFlightRef = useRef(false);
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
    // Le champ « Devise » a été retiré de l'écran : tous les biens sont
    // libellés en francs CFA. La valeur continue de partir à l'API, la colonne
    // existe toujours — c'est le choix qui disparaît, pas la donnée.
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

  // « Propriétaire : l'agence / un client ». Un client choisi fait un bien
  // CLIENT (mandat de gestion à créer depuis la fiche) ; « l'agence », ou un
  // compte « détenu en propre » (choix masqué, rien n'est envoyé), garde un
  // bien d'agence.
  const [detenteur, setDetenteur] = useState<'AGENCE' | 'CLIENT'>(
    property && property.ownershipType !== PropertyOwnershipType.TENANT ? 'CLIENT' : 'AGENCE'
  );
  const clientChoisi = detenteur === 'CLIENT' && !ownAssetsOnly;
  const proprietaireChoisi = clientChoisi ? formData.ownerUserId : '';
  const typeDeDetention = clientChoisi
    ? PropertyOwnershipType.CLIENT
    : formData.ownershipType === PropertyOwnershipType.CLIENT
      ? PropertyOwnershipType.TENANT
      : formData.ownershipType;

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
    return num.toLocaleString(activeLocale(), { useGrouping: true, maximumFractionDigits: 0 });
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

  /**
   * Construit le corps d'enregistrement (création ou mise à jour) à partir de
   * `formData`.
   *
   * Point unique pour l'enregistrement automatique de l'étape « Médias »
   * (`autoSaveForMedia`) et pour « Terminer » (`handleFinish`) : avant ce
   * commit, chacun construisait son propre corps à la main, et leur
   * divergence sur `address` (absent d'un côté, chaîne vide de l'autre) a
   * causé le 500 corrigé par 335658e. Même `formData`, même corps, quel que
   * soit l'appelant.
   */
  const construireCorpsBien = (pourCreation: boolean): CreatePropertyRequest | UpdatePropertyRequest => ({
    ...(pourCreation ? { propertyType: formData.propertyType, ownershipType: typeDeDetention } : {}),
    ownerUserId: proprietaireChoisi && !String(proprietaireChoisi).includes('@') ? proprietaireChoisi : undefined,
    ownerEmail: proprietaireChoisi && String(proprietaireChoisi).includes('@') ? proprietaireChoisi : undefined,
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
      commissionAmount: formData.commissionAmount ? parseFloat(parseNumber(formData.commissionAmount)) : undefined
    })
  });

  const handleFinish = async () => {
    if (finishInFlightRef.current) return;
    finishInFlightRef.current = true;
    setIsLoading(true);
    try {
      const submitData: CreatePropertyRequest | UpdatePropertyRequest = construireCorpsBien(!property);

      let finalPropertyId = savedPropertyId;
      if (finalPropertyId) {
        await updateProperty(tenantId, finalPropertyId, submitData);
      } else {
        // L'enregistrement automatique de l'etape « Medias » a echoue (quota
        // refuse, par exemple) : « Terminer » relance legitimement la creation.
        const newProperty = await createProperty(tenantId, submitData as CreatePropertyRequest);
        finalPropertyId = newProperty.id;
      }

      if (finalPropertyId && (formData.propertyType as PropertyType) === PropertyType.IMMEUBLE) {
        await creerLesAppartements(finalPropertyId);
      }

      if (onComplete && finalPropertyId) {
        onComplete(finalPropertyId);
      }
    } catch (error: any) {
      console.error('Error finishing wizard:', error);
      // Un refus de quota est deja annonce par la notification de la coquille
      // (intercepteur d'api-client, avec le lien vers l'abonnement) : un
      // second message dirait la meme chose moins bien.
      if (!isQuotaExceededResponse(error)) {
        message.error(error.response?.data?.error || t("Erreur lors de l'enregistrement"));
      }
    } finally {
      finishInFlightRef.current = false;
      setIsLoading(false);
    }
  };

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};

    switch (cleEtape(step)) {
      case 'identification':
        if (!formData.propertyType) {
          newErrors.propertyType = t('Le type de propriété est requis');
        }
        if (!formData.title.trim()) {
          newErrors.title = t('Le titre est requis');
        }
        if (clientChoisi && (!formData.ownerUserId || !String(formData.ownerUserId).trim())) {
          newErrors.ownerUserId = t('Le propriétaire est requis');
        }
        break;
      case 'localisation':
        if (!formData.location) {
          newErrors.location = t('La localisation est requise');
        }
        break;
      case 'prix':
        if (formData.transactionModes.length === 0) {
          newErrors.transactionModes = t('Un mode de transaction est requis');
        }
        break;
      case 'specificites':
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
      // Le rail n'ouvre que les etapes deja atteintes ; seul « Suivant » va de
      // l'avant, et uniquement d'un cran, apres validation.
      if (step > maxStepReached && !validateStep(currentStep)) {
        return;
      }
    }
    setCurrentStep(step);
    setMaxStepReached(prev => Math.max(prev, step));
  };

  const translateOption = (optionValue: string): string => {
    const translations: Record<string, string> = {
      NORTH: 'Nord',
      SOUTH: 'Sud',
      EAST: 'Est',
      WEST: 'Ouest',
      GARAGE_1: t('Garage : 1 véhicule'),
      GARAGE_2: t('Garage : 2 véhicules'),
      SHOWER: 'Douche',
      BATHTUB: 'Baignoire',
      PRIVATE: t('Privée'),
      SHARED: t('Partagée'),
      NONE: 'Aucune',
      INTERNET: 'Internet',
      WATER: 'Eau',
      POWER: t('Électricité'),
      CLEANING: t('Ménage'),
      ACD: 'ACD',
      CPF: 'CPF',
      TF: t('Titre foncier'),
      ATTESTATION: 'Attestation',
      RESIDENTIAL: t('Résidentiel'),
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
              aria-label={field.label}
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
              placeholder={t('Saisir {{value}}', { value: field.label.toLowerCase() })}
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
              aria-label={field.label}
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
              aria-label={field.label}
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
              showSearch
              optionFilterProp="children"
              aria-label={field.label}
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
              placeholder={t('Sélectionner...')}
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
              aria-label={field.label}
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

  /**
   * Le nombre d'appartements déclaré fait apparaître autant de lignes.
   *
   * Les lignes déjà saisies sont conservées quand le nombre augmente : corriger
   * « 10 » en « 12 » ajoute deux lignes, il ne repart pas de zéro. Quand il
   * diminue, seules les dernières tombent.
   */
  const nbAppartementsDeclare = Number((formData.typeSpecificData as Record<string, unknown>)?.units_count) || 0;

  useEffect(() => {
    if ((formData.propertyType as PropertyType) !== PropertyType.IMMEUBLE) return;
    const voulu = Math.min(Math.max(0, Math.floor(nbAppartementsDeclare)), MAX_APPARTEMENTS);

    setAppartements(precedents => {
      if (precedents.length === voulu) return precedents;
      if (voulu < precedents.length) return precedents.slice(0, voulu);
      const ajoutes = Array.from({ length: voulu - precedents.length }, (_, i) =>
        appartementVide(precedents.length + i + 1)
      );
      return [...precedents, ...ajoutes];
    });
  }, [nbAppartementsDeclare, formData.propertyType]);

  const modifierAppartement = (rang: number, champ: keyof AppartementSaisi, valeur: string) => {
    setAppartements(precedents =>
      precedents.map((appartement, i) => (i === rang ? { ...appartement, [champ]: valeur } : appartement))
    );
  };

  /**
   * Crée les lots une fois l'immeuble enregistré.
   *
   * Par lots de cinq, et avec `allSettled` : un appartement refusé ne doit pas
   * emporter les onze autres, et l'utilisateur doit savoir combien sont passés.
   */
  const creerLesAppartements = async (immeubleId: string) => {
    const aCreer = appartements.filter(a => a.titre.trim());
    if (aCreer.length === 0) return;

    const charge = aCreer.map(appartement => ({
      propertyType: PropertyType.APPARTEMENT,
      ownershipType: typeDeDetention,
      title: appartement.titre.trim(),
      address: formData.address.trim() || undefined,
      locationZone: formData.locationZone.trim() || undefined,
      transactionModes: formData.transactionModes,
      currency: formData.currency,
      price: appartement.prix ? parseFloat(parseNumber(appartement.prix)) : undefined,
      surfaceArea: appartement.surface ? parseFloat(appartement.surface) : undefined,
      rooms: appartement.pieces ? parseInt(appartement.pieces, 10) : undefined,
      bedrooms: appartement.chambres ? parseInt(appartement.chambres, 10) : undefined,
      bathrooms: appartement.sallesDeBain ? parseInt(appartement.sallesDeBain, 10) : undefined,
      availability: PropertyAvailability.AVAILABLE,
      status: PropertyStatus.AVAILABLE
    }));

    const TAILLE_LOT = 5;
    let crees = 0;
    for (let i = 0; i < charge.length; i += TAILLE_LOT) {
      const resultats = await Promise.allSettled(
        charge
          .slice(i, i + TAILLE_LOT)
          .map(corps => apiClient.post(`/tenants/${tenantId}/properties/${immeubleId}/sub-properties`, corps))
      );
      crees += resultats.filter(r => r.status === 'fulfilled').length;
    }

    if (crees < charge.length) {
      message.warning(
        t('{{crees}} appartement(s) créé(s) sur {{length}}. Les autres sont à reprendre sur la fiche.', {
          crees: crees,
          length: charge.length
        })
      );
    } else {
      message.success(t('{{crees}} appartement(s) créé(s).', { crees: crees }));
    }
  };

  /** Ce que l'étape « Caractéristiques générales » demande pour ce type. */
  const carac = caracteristiquesGenerales(formData.propertyType as PropertyType);

  /**
   * Le mode d'opération coché, d'où découlent les conditions à saisir.
   *
   * `location` couvre aussi la courte durée : la case n'est plus proposée, mais
   * un bien qui la porte déjà reste un bien à louer, avec sa caution.
   *
   * Les deux cases ne s'excluent pas — un bien peut être proposé à la vente et
   * à la location. Le modèle n'a pourtant qu'une colonne `price` : dans ce cas
   * de figure, le montant saisi vaut pour la vente et le loyer n'a pas où se
   * loger. C'est une limite du modèle, pas de cet écran.
   */
  const vente = formData.transactionModes.includes(PropertyTransactionMode.SALE);
  const location =
    formData.transactionModes.includes(PropertyTransactionMode.RENTAL) ||
    formData.transactionModes.includes(PropertyTransactionMode.SHORT_TERM);

  /** Un immeuble mis en location se valorise lot par lot, pas en bloc. */
  const masquerPrixEtCharges = (formData.propertyType as PropertyType) === PropertyType.IMMEUBLE && location;

  const toutesLesEtapes: Array<{
    cle: CleEtape;
    title: string;
    shortTitle?: string;
    description: string;
    content: React.ReactNode;
  }> = [
    {
      cle: 'identification',
      title: t('Type et identification'),
      description: t('Sélectionnez le type de bien et les informations de base'),
      content: (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Text strong>
              {t('Type de propriété')} <Text type="danger">*</Text>
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
              {t('Titre')} <Text type="danger">*</Text>
            </Text>
            <Input
              value={formData.title}
              onChange={e => handleChange('title', e.target.value)}
              placeholder={t('Ex: Appartement 3 pièces à Cocody')}
              status={errors.title ? 'error' : ''}
            />
            {errors.title && (
              <Text type="danger" style={{ fontSize: 12 }}>
                {errors.title}
              </Text>
            )}
          </div>

          <div>
            {!ownAssetsOnly && (
              <>
                <Text strong>{t('Propriétaire')}</Text>
                <div>
                  <Radio.Group
                    value={detenteur}
                    onChange={e => {
                      setDetenteur(e.target.value);
                      if (e.target.value === 'AGENCE') handleChange('ownerUserId', '');
                    }}
                  >
                    <Radio value="AGENCE">{t("L'agence")}</Radio>
                    <Radio value="CLIENT">{t('Un client')}</Radio>
                  </Radio.Group>
                </div>
              </>
            )}
            {clientChoisi && (
              <Select
                showSearch
                optionFilterProp="children"
                style={{ width: '100%' }}
                value={formData.ownerUserId || undefined}
                onChange={value => handleChange('ownerUserId', value || '')}
                placeholder={loadingOwners ? 'Chargement...' : t('Sélectionner un propriétaire')}
                allowClear
                loading={loadingOwners}
                status={errors.ownerUserId ? 'error' : ''}
              >
                {owners.map(owner => (
                  <Select.Option key={owner.id} value={owner.email}>
                    {nomProprietaire(owner)}
                  </Select.Option>
                ))}
              </Select>
            )}
            {errors.ownerUserId && (
              <Text type="danger" style={{ fontSize: 12 }}>
                {errors.ownerUserId}
              </Text>
            )}
            {typeDeDetention === PropertyOwnershipType.TENANT ? (
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                {t("Ce bien appartient à l'agence : il n'a pas de propriétaire distinct.")}
              </Text>
            ) : (
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                {t('Bien de client : un mandat de gestion se crée depuis la fiche du bien.')}
              </Text>
            )}
          </div>

          {/* La description ferme l'étape : c'est le seul champ facultatif des
              quatre, et le seul long. Placée avant le propriétaire, elle
              séparait deux champs obligatoires par six lignes de saisie libre,
              et une liste déroulante requise passait sous la ligne de
              flottaison. L'ordre visuel est aussi l'ordre de tabulation. */}
          <div>
            <Text strong>{t('Description')}</Text>
            <TextArea
              value={formData.description}
              onChange={e => handleChange('description', e.target.value)}
              rows={6}
              placeholder={t('Décrivez la propriété (facultatif)...')}
            />
          </div>
        </Space>
      )
    },
    {
      cle: 'localisation',
      title: t('Localisation'),
      description: t("Indiquez l'emplacement de la propriété"),
      content: (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Text strong>
              Localisation (Pays &gt; Région &gt; Commune) <Text type="danger">*</Text>
            </Text>
            <LocationSelector
              value={formData.location?.communeId}
              onChange={location => handleChange('location', location)}
              placeholder={t('Rechercher une localisation...')}
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
              <Text strong>{t('Quartier/Zone (optionnel)')}</Text>
              <Input
                value={formData.locationZone}
                onChange={e => handleChange('locationZone', e.target.value)}
                placeholder={t('Ex: Angré, Riviera, etc.')}
              />
            </Col>
            <Col xs={24} sm={12}>
              <Text strong>{t('Adresse')}</Text>
              <Input
                value={formData.address}
                onChange={e => handleChange('address', e.target.value)}
                placeholder={t('Adresse complète (optionnel)')}
              />
            </Col>
          </Row>
        </Space>
      )
    },
    {
      cle: 'caracteristiques',
      title: t('Caractéristiques générales'),
      shortTitle: t('Caractéristiques'),
      description: t('Informations générales sur la propriété'),
      content: (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {/* Chaque champ est ici parce que `caracteristiquesGenerales` le
              retient pour ce type, et non parce qu'il n'a pas été exclu. La
              différence se voit sur un parking : aucune de ces questions ne le
              concerne, l'étape n'apparaît donc pas du tout au lieu de s'ouvrir
              sur une page vide. */}
          {
            <Row gutter={16}>
              {carac.surface && (
                <Col xs={24} sm={12}>
                  <Text strong>{t('Surface principale (m²)')}</Text>
                  <InputNumber
                    style={{ width: '100%' }}
                    value={formData.surfaceArea ? Number(formData.surfaceArea) : undefined}
                    onChange={val => handleChange('surfaceArea', val ? String(val) : '')}
                    placeholder={t('Ex: 75')}
                  />
                </Col>
              )}
              {carac.anneeEtEtat && (
                <Col xs={24} sm={12}>
                  <Text strong>{t('Année de construction')}</Text>
                  <InputNumber
                    style={{ width: '100%' }}
                    value={formData.constructionYear ? Number(formData.constructionYear) : undefined}
                    onChange={val => handleChange('constructionYear', val ? String(val) : '')}
                    min={1800}
                    max={new Date().getFullYear()}
                    placeholder={t('Ex: 2020')}
                  />
                </Col>
              )}
              {carac.anneeEtEtat && (
                <Col xs={24} sm={12}>
                  <Text strong>{t('État général')}</Text>
                  <Select
                    showSearch
                    optionFilterProp="children"
                    style={{ width: '100%' }}
                    value={formData.generalCondition || undefined}
                    onChange={val => handleChange('generalCondition', val)}
                    placeholder={t('Sélectionner...')}
                  >
                    <Select.Option value="NEUF">{t('Neuf')}</Select.Option>
                    <Select.Option value="BON">{t('Bon')}</Select.Option>
                    <Select.Option value="A_RENOVER">{t('À rénover')}</Select.Option>
                    <Select.Option value="EN_CHANTIER">{t('En chantier')}</Select.Option>
                  </Select>
                </Col>
              )}
              {carac.standing && (
                <Col xs={24} sm={12}>
                  <Text strong>{t('Standing')}</Text>
                  <Select
                    showSearch
                    optionFilterProp="children"
                    style={{ width: '100%' }}
                    value={formData.standing || undefined}
                    onChange={val => handleChange('standing', val)}
                    placeholder={t('Sélectionner...')}
                  >
                    <Select.Option value="ECONOMIQUE">{t('Économique')}</Select.Option>
                    <Select.Option value="STANDARD">{t('Standard')}</Select.Option>
                    <Select.Option value="HAUT_STANDING">{t('Haut standing')}</Select.Option>
                    <Select.Option value="LUXE">{t('Luxe')}</Select.Option>
                  </Select>
                </Col>
              )}
              {/* Demi-largeur, comme les quatre champs qui precedent : l'etape
                  garde une seule trame a deux colonnes. En tiers, les trois
                  comptages remplissaient une ligne a eux seuls et le statut
                  d'ameublement — ou la surface du terrain — restait seul sur la
                  suivante. */}
              {carac.pieces && (
                <>
                  <Col xs={24} sm={12}>
                    <Text strong>{t('Nombre de pièces')}</Text>
                    <InputNumber
                      style={{ width: '100%' }}
                      min={0}
                      value={formData.rooms ? Number(formData.rooms) : undefined}
                      onChange={val => handleChange('rooms', val !== null && val !== undefined ? String(val) : '')}
                      placeholder={t('Ex: 3')}
                    />
                  </Col>
                  <Col xs={24} sm={12}>
                    <Text strong>{t('Nombre de chambres')}</Text>
                    <InputNumber
                      style={{ width: '100%' }}
                      min={0}
                      value={formData.bedrooms ? Number(formData.bedrooms) : undefined}
                      onChange={val => handleChange('bedrooms', val !== null && val !== undefined ? String(val) : '')}
                      placeholder={t('Ex: 2')}
                    />
                  </Col>
                  <Col xs={24} sm={12}>
                    <Text strong>{t('Nombre de salles de bain')}</Text>
                    <InputNumber
                      style={{ width: '100%' }}
                      min={0}
                      value={formData.bathrooms ? Number(formData.bathrooms) : undefined}
                      onChange={val => handleChange('bathrooms', val !== null && val !== undefined ? String(val) : '')}
                      placeholder={t('Ex: 2')}
                    />
                  </Col>
                </>
              )}
              {carac.surfaceTerrain && (
                <Col xs={24} sm={12}>
                  <Text strong>{t('Surface terrain (m²)')}</Text>
                  <InputNumber
                    style={{ width: '100%' }}
                    value={formData.surfaceTerrain ? Number(formData.surfaceTerrain) : undefined}
                    onChange={val =>
                      handleChange('surfaceTerrain', val !== null && val !== undefined ? String(val) : '')
                    }
                    placeholder={t('Ex: 500')}
                  />
                </Col>
              )}
              {carac.meuble && (
                <Col xs={24} sm={12}>
                  <Text strong>{t("Statut d'ameublement")}</Text>
                  <Select
                    style={{ width: '100%' }}
                    value={formData.furnishingStatus}
                    onChange={value => handleChange('furnishingStatus', value)}
                  >
                    <Select.Option value={PropertyFurnishingStatus.UNFURNISHED}>{t('Non meublé')}</Select.Option>
                    <Select.Option value={PropertyFurnishingStatus.FURNISHED}>{t('Meublé')}</Select.Option>
                    <Select.Option value={PropertyFurnishingStatus.PARTIALLY_FURNISHED}>
                      {t('Partiellement meublé')}
                    </Select.Option>
                  </Select>
                </Col>
              )}
            </Row>
          }
        </Space>
      )
    },
    {
      cle: 'prix',
      title: t('Prix & Conditions'),
      shortTitle: t('Prix et conditions'),
      description: t('Définissez le prix et les conditions de transaction'),
      content: (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Text strong>
              {t("Type d'opération")} <Text type="danger">*</Text>
            </Text>
            {/* Un bien est mis en vente **ou** en location, pas les deux.
                C'étaient des cases à cocher : on pouvait donc cocher les deux,
                alors que le modèle n'a qu'une colonne `price`. Le loyer n'avait
                alors nulle part où se loger, et le montant saisi valait pour la
                vente — le loyer était perdu sans que rien ne le dise. Des
                boutons radio rendent la situation impossible.

                « Location courte durée » n'est plus proposée à la saisie. Le
                mode reste dans le modèle : un bien qui le porte déjà s'affiche
                sur « Location » et le conserve tant qu'on ne choisit pas
                autre chose. */}
            <Radio.Group
              value={vente ? PropertyTransactionMode.SALE : location ? PropertyTransactionMode.RENTAL : undefined}
              onChange={event => handleChange('transactionModes', [event.target.value as PropertyTransactionMode])}
            >
              <Space>
                <Radio value={PropertyTransactionMode.SALE}>{t('Vente')}</Radio>
                <Radio value={PropertyTransactionMode.RENTAL}>{t('Location')}</Radio>
              </Space>
            </Radio.Group>
            {errors.transactionModes && (
              <Text type="danger" style={{ fontSize: 12 }}>
                {errors.transactionModes}
              </Text>
            )}
          </div>

          {/* Conditions de l'opération.
              Vente et location ne demandent pas la même chose. Le dépôt de
              garantie n'a aucun sens en vente : il n'apparaît qu'en location,
              comme dans l'écran Modifier. Les libellés du prix, des charges et
              des honoraires suivent le mode coché plutôt que de rester neutres
              — « Charges » ne veut pas dire la même chose selon qu'on achète
              ou qu'on loue.

              Le dépôt, la commission et la date de disponibilité étaient déjà
              déclarés dans l'état de ce formulaire et envoyés à l'API, mais
              n'étaient demandés nulle part : ils partaient vides à chaque
              création, et il fallait rouvrir le bien en modification pour les
              saisir. */}
          {(formData.propertyType as PropertyType) === PropertyType.IMMEUBLE && (
            <Alert
              type="info"
              showIcon
              message={
                location
                  ? t(
                      "La location se gère appartement par appartement : le loyer se saisit sur chaque lot, à l'étape « Appartements ». Aucun loyer n'est demandé pour l'immeuble lui-même."
                    )
                  : t(
                      "Ce prix est celui de l'immeuble entier. Un appartement peut aussi se vendre seul : son prix se saisit alors sur le lot, à l'étape « Appartements »."
                    )
              }
            />
          )}

          <Row gutter={16}>
            {!masquerPrixEtCharges && (
              <>
                <Col xs={24} sm={8}>
                  <Text strong>{vente ? t('Prix de vente') : t('Loyer mensuel')}</Text>
                  <Input
                    value={formatNumber(formData.price)}
                    onChange={e => handleNumberChange('price', e.target.value)}
                    placeholder={vente ? t('Ex: 50 000 000') : t('Ex: 150 000')}
                  />
                </Col>
                <Col xs={24} sm={8}>
                  <Text strong>{vente ? t('Charges de copropriété') : t('Charges (provision mensuelle)')}</Text>
                  <Input
                    value={formatNumber(formData.fees)}
                    onChange={e => handleNumberChange('fees', e.target.value)}
                    placeholder={t('Ex: 50 000')}
                  />
                </Col>
              </>
            )}
            {location && (
              <Col xs={24} sm={8}>
                <Text strong>{t('Dépôt de garantie')}</Text>
                <Input
                  value={formatNumber(formData.deposit)}
                  onChange={e => handleNumberChange('deposit', e.target.value)}
                  placeholder={t('Ex: 300 000')}
                />
              </Col>
            )}

            {/* Le mode de commission et les honoraires ne sont plus demandés :
                la rémunération d'agence ne se gère pas depuis la fiche d'un
                bien. Les deux clés restent dans `typeSpecificData` pour les
                biens qui les portent déjà — masquer la saisie n'efface rien. */}
          </Row>
        </Space>
      )
    },
    {
      cle: 'specificites',
      title: t('Caractéristiques spécifiques'),
      shortTitle: t('Spécificités'),
      description: t('Détails spécifiques au type de bien sélectionné'),
      content: (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {loadingTemplate ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <Spin size="large" />
              <div style={{ marginTop: 16 }}>
                <Text type="secondary">{t('Chargement des caractéristiques...')}</Text>
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
                    // Le gabarit (prisma/seeds/property-templates-seed.ts) ne porte pas de
                    // `validation.max` pour ce champ : sans plafond ici, l'InputNumber
                    // acceptait n'importe quelle valeur, qui n'etait ensuite qu'en
                    // partie honoree (voir MAX_APPARTEMENTS). On bloque desormais la
                    // saisie au meme plafond que la creation, plutot que de tronquer
                    // apres coup sans le dire.
                    const displayField =
                      (formData.propertyType as PropertyType) === PropertyType.IMMEUBLE && field.key === 'units_count'
                        ? {
                            ...field,
                            label: t("Nombre total d'appartements"),
                            validation: { ...field.validation, min: 1, max: MAX_APPARTEMENTS }
                          }
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
                  ? t('Aucune caractéristique spécifique pour ce type de bien.')
                  : t("Veuillez d'abord sélectionner un type de bien.")
              }
            />
          )}

          {/* Les appartements, à la suite des caractéristiques de l'immeuble.
              Ils occupaient une étape à part, et chaque lot se saisissait dans
              une fenêtre modale, après l'enregistrement de l'immeuble. Le
              nombre déclaré juste au-dessus fait maintenant apparaître autant
              de lignes, pré-titrées, modifiables, dans la page. Rien ne part en
              base avant le bouton final. */}
          {(formData.propertyType as PropertyType) === PropertyType.IMMEUBLE && (
            <Card type="inner" title={t('Appartements ({{length}})', { length: appartements.length })}>
              {appartements.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={t(
                    "Indiquez le nombre total d'appartements ci-dessus : autant de lignes apparaîtront ici."
                  )}
                />
              ) : (
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  {/* Le champ ci-dessus bloque desormais la saisie a MAX_APPARTEMENTS
                      (voir `validation.max` injecte plus haut) : cette alerte ne peut
                      plus se declencher a la creation. Elle reste un filet pour un
                      immeuble existant dont le nombre declare, enregistre avant ce
                      correctif, depasse encore le plafond. */}
                  {nbAppartementsDeclare > MAX_APPARTEMENTS && (
                    <Alert
                      type="warning"
                      showIcon
                      message={t(
                        "Seuls les {{MAX_APPARTEMENTS}} premiers appartements sont saisissables ici. Ajoutez les suivants un par un depuis la fiche de l'immeuble, une fois celui-ci enregistré.",
                        { MAX_APPARTEMENTS: MAX_APPARTEMENTS }
                      )}
                    />
                  )}

                  {/* Les libellés une seule fois, en tête : les répéter sur
                      chaque ligne noierait la grille. Chaque champ garde son
                      propre nom accessible. */}
                  {isDesktop && (
                    <Row gutter={8} style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-small)' }}>
                      <Col sm={7}>{t('Titre')}</Col>
                      <Col sm={4}>{t('Surface (m²)')}</Col>
                      <Col sm={3}>{t('Pièces')}</Col>
                      <Col sm={3}>{t('Chambres')}</Col>
                      <Col sm={3}>{t('SdB')}</Col>
                      <Col sm={4}>{vente ? t('Prix') : t('Loyer')}</Col>
                    </Row>
                  )}

                  {appartements.map((appartement, rang) => (
                    <Row gutter={[8, 8]} key={rang} align="middle">
                      <Col xs={24} sm={7}>
                        <Input
                          aria-label={t("Titre de l'appartement {{value}}", { value: rang + 1 })}
                          value={appartement.titre}
                          onChange={e => modifierAppartement(rang, 'titre', e.target.value)}
                          placeholder={t('Appartement {{value}}', { value: rang + 1 })}
                        />
                      </Col>
                      <Col xs={12} sm={4}>
                        <InputNumber
                          aria-label={t("Surface de l'appartement {{value}}", { value: rang + 1 })}
                          style={{ width: '100%' }}
                          min={0}
                          value={appartement.surface ? Number(appartement.surface) : undefined}
                          onChange={val => modifierAppartement(rang, 'surface', val != null ? String(val) : '')}
                          placeholder="m²"
                        />
                      </Col>
                      <Col xs={12} sm={3}>
                        <InputNumber
                          aria-label={t("Pièces de l'appartement {{value}}", { value: rang + 1 })}
                          style={{ width: '100%' }}
                          min={0}
                          value={appartement.pieces ? Number(appartement.pieces) : undefined}
                          onChange={val => modifierAppartement(rang, 'pieces', val != null ? String(val) : '')}
                        />
                      </Col>
                      <Col xs={12} sm={3}>
                        <InputNumber
                          aria-label={t("Chambres de l'appartement {{value}}", { value: rang + 1 })}
                          style={{ width: '100%' }}
                          min={0}
                          value={appartement.chambres ? Number(appartement.chambres) : undefined}
                          onChange={val => modifierAppartement(rang, 'chambres', val != null ? String(val) : '')}
                        />
                      </Col>
                      <Col xs={12} sm={3}>
                        <InputNumber
                          aria-label={t("Salles de bain de l'appartement {{value}}", { value: rang + 1 })}
                          style={{ width: '100%' }}
                          min={0}
                          value={appartement.sallesDeBain ? Number(appartement.sallesDeBain) : undefined}
                          onChange={val => modifierAppartement(rang, 'sallesDeBain', val != null ? String(val) : '')}
                        />
                      </Col>
                      <Col xs={24} sm={4}>
                        <Input
                          aria-label={t("{{value}} de l'appartement {{value2}}", {
                            value: vente ? 'Prix' : 'Loyer',
                            value2: rang + 1
                          })}
                          value={formatNumber(appartement.prix)}
                          onChange={e => modifierAppartement(rang, 'prix', parseNumber(e.target.value))}
                          placeholder={vente ? t('Ex: 25 000 000') : t('Ex: 150 000')}
                        />
                      </Col>
                    </Row>
                  ))}
                </Space>
              )}
            </Card>
          )}
        </Space>
      )
    },
    {
      cle: 'medias',
      title: t('Médias'),
      description: t('Ajoutez des photos et vidéos de la propriété'),
      content: (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {savedPropertyId ? (
            <>
              <div>
                <Title level={4}>{t('Photos')}</Title>
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
                <Title level={4}>{t('Vidéos')}</Title>
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
                <Text type="secondary">{t("Préparation de l'espace médias...")}</Text>
              </div>
            </div>
          )}
        </Space>
      )
    }
  ];

  /**
   * Les étapes réellement parcourues pour ce type de bien.
   *
   * Un parking ou un terrain saute « Caractéristiques générales », qui n'a rien
   * à leur demander. Tant qu'aucun type n'est choisi, on garde le parcours
   * complet : le rail doit annoncer le chemin, pas se réécrire à chaque clic sur
   * une vignette de type.
   */
  const steps = toutesLesEtapes.filter(etape => {
    if (!formData.propertyType) return true;
    const type = formData.propertyType as PropertyType;
    if (etape.cle === 'caracteristiques') return aDesCaracteristiquesGenerales(type);
    return true;
  });

  const cleEtape = (index: number): CleEtape | undefined => steps[index]?.cle;

  /**
   * Le rang de l'etape courante peut devenir invalide : changer de type de bien
   * raccourcit le parcours. Sans ce garde, on resterait sur un indice qui ne
   * designe plus rien et l'ecran se viderait.
   */
  useEffect(() => {
    if (currentStep > steps.length - 1) {
      setCurrentStep(steps.length - 1);
      setMaxStepReached(prev => Math.min(prev, steps.length - 1));
    }
  }, [steps.length, currentStep]);

  useEffect(() => {
    const autoSaveForMedia = async () => {
      const cle = cleEtape(currentStep);
      const exigeUnBienEnregistre = cle !== undefined && ETAPES_APRES_ENREGISTREMENT.includes(cle);

      if (exigeUnBienEnregistre && !savedPropertyId && !isLoading && !property && !autoSaveAttemptedRef.current) {
        const requiredStepsValid =
          formData.propertyType && formData.title.trim() && formData.location && formData.transactionModes.length > 0;

        if (requiredStepsValid) {
          autoSaveAttemptedRef.current = true;
          setIsLoading(true);
          try {
            const submitData = construireCorpsBien(true) as CreatePropertyRequest;

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
    const cle = cleEtape(currentStep);
    if (cle === undefined || !ETAPES_APRES_ENREGISTREMENT.includes(cle)) {
      autoSaveAttemptedRef.current = false;
    }
    // `steps` change avec le type de bien ; la cle de l'etape courante aussi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, steps.length]);

  const isStepValid = (stepIndex: number): boolean => {
    switch (cleEtape(stepIndex)) {
      case 'identification':
        return !!(
          formData.propertyType &&
          formData.title.trim() &&
          (!clientChoisi || (formData.ownerUserId && String(formData.ownerUserId).trim()))
        );
      case 'localisation':
        return !!formData.location;
      case 'prix':
        return formData.transactionModes.length > 0;
      default:
        return true;
    }
  };

  const isLastStep = currentStep === steps.length - 1;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Le rail porte la position dans le parcours ; l'en-tete du panneau
          porte le detail de l'etape. Aucun des deux ne repete l'autre. */}
      <Card styles={{ body: { padding: isDesktop ? 'var(--space-6)' : 'var(--space-4)' } }}>
        <StepRail
          items={steps.map(step => ({ title: step.title, shortTitle: step.shortTitle }))}
          current={currentStep}
          // En modification, tout est deja renseigne : le rail est ouvert de
          // bout en bout, comme l ancien `Steps`.
          furthest={property ? steps.length - 1 : maxStepReached}
          onChange={handleStepChange}
        />
      </Card>

      <Card style={{ marginTop: 'var(--space-4)', minHeight: 500 }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 'var(--space-3)',
              flexWrap: 'wrap',
              paddingBottom: 'var(--space-4)',
              borderBottom: '1px solid var(--border-subtle)'
            }}
          >
            <div style={{ minWidth: 0, flex: '1 1 320px' }}>
              <Title
                level={2}
                style={{
                  margin: 0,
                  fontSize: 'var(--font-size-h1)',
                  lineHeight: 'var(--line-height-h1)'
                }}
              >
                {steps[currentStep].title}
              </Title>
              {steps[currentStep].description && (
                <Text type="secondary" style={{ fontSize: 'var(--font-size-small)' }}>
                  {steps[currentStep].description}
                </Text>
              )}
            </div>
            {/* Sous 992 px le compteur est deja dans le rail replie. */}
            {isDesktop && (
              <Text
                type="secondary"
                style={{
                  fontSize: 'var(--font-size-caption)',
                  whiteSpace: 'nowrap',
                  fontVariantNumeric: 'tabular-nums'
                }}
              >
                {t('Étape')} {currentStep + 1} sur {steps.length}
              </Text>
            )}
          </div>
          {steps[currentStep].content}
        </Space>
      </Card>

      {/* Sous 992 px, la barre s'empile : les deux actions de parcours passent
          en bas et prennent toute la largeur, donc a portee de pouce (P1).
          L'ordre visuel suit l'ordre du DOM — donc l'ordre de tabulation. */}
      <div
        style={{
          marginTop: 'var(--space-6)',
          display: 'flex',
          flexDirection: isDesktop ? 'row' : 'column',
          justifyContent: 'space-between',
          alignItems: isDesktop ? 'center' : 'stretch',
          gap: 'var(--space-3)'
        }}
      >
        <Space size="small" wrap style={{ justifyContent: isDesktop ? 'flex-start' : 'center' }}>
          {onCancel && (
            <Button onClick={onCancel} disabled={isLoading}>
              {t('Annuler')}
            </Button>
          )}
        </Space>

        <div
          style={{
            display: 'flex',
            gap: 'var(--space-2)',
            justifyContent: 'flex-end'
          }}
        >
          {currentStep > 0 && (
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => handleStepChange(currentStep - 1)}
              disabled={isLoading}
              block={!isDesktop}
            >
              {t('Précédent')}
            </Button>
          )}
          {isLastStep ? (
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={handleFinish}
              loading={isLoading}
              disabled={!isStepValid(currentStep)}
              block={!isDesktop}
            >
              {t('Terminer')}
            </Button>
          ) : (
            <Button
              type="primary"
              icon={<ArrowRightOutlined />}
              iconPlacement="end"
              onClick={() => handleStepChange(currentStep + 1)}
              disabled={!isStepValid(currentStep) || isLoading}
              block={!isDesktop}
            >
              {t('Suivant')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
