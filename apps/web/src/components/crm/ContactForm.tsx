import React, { useState, useEffect } from 'react';
import {
  App,
  Form,
  Input,
  Select,
  Button,
  Tabs,
  Radio,
  Checkbox,
  DatePicker,
  InputNumber,
  Row,
  Col,
  Space,
  Typography,
  Alert,
  Upload,
  Avatar,
  Card
} from 'antd';
import { UserOutlined, UploadOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd';
import dayjs from 'dayjs';
import { LocationSelector } from '../ui/location-selector';
import { GeographicLocation, getLocationByCommuneId } from '../../services/geographic-service';
import { CreateCrmContactRequest, UpdateCrmContactRequest, CrmContact } from '../../types/crm-types';
import { formatNumberWithSpaces, parseFormattedNumber } from '../../lib/utils';
import { t } from '../../i18n/t';

const { TextArea } = Input;
const { TabPane } = Tabs;
const { Text } = Typography;

const COUNTRY_DIAL_CODES = [
  { value: '+225', label: t('CI (+225)') },
  { value: '+33', label: t('FR (+33)') },
  { value: '+32', label: t('BE (+32)') },
  { value: '+41', label: t('CH (+41)') },
  { value: '+1', label: t('US/CA (+1)') },
  { value: '+212', label: t('MA (+212)') },
  { value: '+221', label: t('SN (+221)') },
  { value: '+223', label: t('ML (+223)') },
  { value: '+226', label: t('BF (+226)') },
  { value: '+228', label: t('TG (+228)') },
  { value: '+229', label: t('BJ (+229)') },
  { value: '+234', label: t('NG (+234)') },
  { value: '+44', label: t('UK (+44)') }
];

const DEFAULT_COUNTRY_DIAL_CODE = '+225';

const splitPhoneWithCountryCode = (rawPhone?: string | null) => {
  const phone = rawPhone?.trim();
  if (!phone) {
    return {
      countryCode: DEFAULT_COUNTRY_DIAL_CODE,
      number: ''
    };
  }

  const matchingCode = [...COUNTRY_DIAL_CODES]
    .sort((a, b) => b.value.length - a.value.length)
    .find(code => phone.startsWith(code.value));

  if (!matchingCode) {
    return {
      countryCode: DEFAULT_COUNTRY_DIAL_CODE,
      number: phone
    };
  }

  return {
    countryCode: matchingCode.value,
    number: phone.slice(matchingCode.value.length).trim()
  };
};

const buildInternationalPhone = (countryCode?: string, rawNumber?: string) => {
  const trimmedNumber = rawNumber?.trim();
  if (!trimmedNumber) return undefined;

  const numberWithoutInlineCode = trimmedNumber.replace(/^\+\d{1,4}\s*/, '');
  return `${countryCode || DEFAULT_COUNTRY_DIAL_CODE} ${numberWithoutInlineCode}`.trim();
};

interface ContactFormProps {
  contact?: CrmContact;
  onSubmit: (data: CreateCrmContactRequest | UpdateCrmContactRequest) => Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
}

export const ContactForm: React.FC<ContactFormProps> = ({ contact, onSubmit, onCancel, loading = false }) => {
  const { message } = App.useApp();

  const [form] = Form.useForm();
  const [activeTab, setActiveTab] = useState('basic');
  const [location, setLocation] = useState<GeographicLocation | null>(null);
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  useEffect(() => {
    if (contact) {
      const primaryPhone = splitPhoneWithCountryCode(contact.phonePrimary || contact.phone || '');
      const secondaryPhone = splitPhoneWithCountryCode(contact.phoneSecondary || '');

      form.setFieldsValue({
        contactType: contact.contactType || 'PERSON',
        firstName: contact.firstName || '',
        lastName: contact.lastName || '',
        email: contact.email || '',
        phonePrimaryCountryCode: primaryPhone.countryCode,
        phonePrimary: primaryPhone.number,
        phoneSecondaryCountryCode: secondaryPhone.countryCode,
        phoneSecondary: secondaryPhone.number,
        phonePrimaryIsWhatsApp: (contact as any)?.phonePrimaryIsWhatsApp || false,
        phoneSecondaryIsWhatsApp: (contact as any)?.phoneSecondaryIsWhatsApp || false,
        civility: contact.civility || undefined,
        dateOfBirth: contact.dateOfBirth ? dayjs(contact.dateOfBirth) : undefined,
        nationality: contact.nationality || 'Ivoirienne',
        identityDocumentType: contact.identityDocumentType || undefined,
        identityDocumentNumber: contact.identityDocumentNumber || contact.numeroPieceId || '',
        identityDocumentExpiry: contact.identityDocumentExpiry ? dayjs(contact.identityDocumentExpiry) : undefined,
        profilePhotoUrl: contact.profilePhotoUrl || '',
        legalName: contact.legalName || '',
        legalForm: contact.legalForm || undefined,
        rccm: contact.rccm || '',
        taxId: contact.taxId || '',
        representativeName: contact.representativeName || '',
        representativeRole: contact.representativeRole || '',
        emailSecondary: contact.emailSecondary || '',
        address: contact.address || '',
        communeId: (contact as any).communeId || undefined,
        locationZone: contact.locationZone || '',
        targetZoneIds: (contact as any)?.targetZones?.map((tz: any) => tz.communeId || tz.commune?.id) || [],
        preferredLanguage: contact.preferredLanguage || undefined,
        preferredContactChannel: contact.preferredContactChannel || undefined,
        profession: contact.profession || contact.fonction || '',
        sectorOfActivity: contact.sectorOfActivity || undefined,
        employer: contact.employer || '',
        incomeMin: contact.incomeMin || undefined,
        incomeMax: contact.incomeMax || undefined,
        jobStability: contact.jobStability || undefined,
        borrowingCapacity: contact.borrowingCapacity || undefined,
        salaire: contact.salaire || undefined,
        source: contact.source || '',
        leadSource: contact.leadSource || undefined,
        maturityLevel: contact.maturityLevel || 'COLD',
        score: contact.score || 0,
        priorityLevel: contact.priorityLevel || 'NORMAL',
        assignedToUserId: contact.assignedToUserId || undefined,
        consentMarketing: contact.consentMarketing ?? true,
        consentWhatsapp: contact.consentWhatsapp ?? true,
        consentEmail: contact.consentEmail ?? true,
        consentSource: contact.consentSource || '',
        internalNotes: contact.internalNotes || ''
      });

      if (contact.profilePhotoUrl) {
        setFileList([
          {
            uid: '-1',
            name: 'profile.jpg',
            status: 'done',
            url: contact.profilePhotoUrl
          }
        ]);
      }
    }
  }, [contact, form]);

  useEffect(() => {
    const loadLocation = async () => {
      if (contact && (contact as any).communeId) {
        try {
          const loc = await getLocationByCommuneId((contact as any).communeId);
          if (loc) {
            setLocation(loc);
          }
        } catch (error) {
          console.error('Error loading location:', error);
        }
      }
    };
    loadLocation();
  }, [contact]);

  const handleFinish = async (values: any) => {
    try {
      const phonePrimary = buildInternationalPhone(values.phonePrimaryCountryCode, values.phonePrimary);
      const phoneSecondary = buildInternationalPhone(values.phoneSecondaryCountryCode, values.phoneSecondary);

      const submitData: CreateCrmContactRequest | UpdateCrmContactRequest = {
        contactType: values.contactType,
        civility: values.civility,
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        email: values.email.trim().toLowerCase(),
        phonePrimary,
        phoneSecondary,
        whatsappNumber: values.phonePrimaryIsWhatsApp
          ? phonePrimary
          : values.phoneSecondaryIsWhatsApp
            ? phoneSecondary
            : undefined,
        dateOfBirth: values.dateOfBirth ? values.dateOfBirth.format('YYYY-MM-DD') : undefined,
        nationality: values.nationality?.trim() || undefined,
        identityDocumentType: values.identityDocumentType,
        identityDocumentNumber: values.identityDocumentNumber?.trim() || undefined,
        identityDocumentExpiry: values.identityDocumentExpiry
          ? values.identityDocumentExpiry.format('YYYY-MM-DD')
          : undefined,
        profilePhotoUrl:
          values.profilePhotoUrl && values.profilePhotoUrl.startsWith('data:')
            ? values.profilePhotoUrl
            : values.profilePhotoUrl
              ? values.profilePhotoUrl.trim()
              : undefined,
        ...(values.contactType === 'COMPANY'
          ? {
              legalName: values.legalName?.trim() || undefined,
              legalForm: values.legalForm,
              rccm: values.rccm?.trim() || undefined,
              taxId: values.taxId?.trim() || undefined,
              representativeName: values.representativeName?.trim() || undefined,
              representativeRole: values.representativeRole?.trim() || undefined
            }
          : {}),
        emailSecondary: values.emailSecondary?.trim() || undefined,
        address: values.address?.trim() || undefined,
        communeId: values.communeId || location?.communeId || undefined,
        locationZone: values.locationZone?.trim() || undefined,
        targetZoneIds: values.targetZoneIds && values.targetZoneIds.length > 0 ? values.targetZoneIds : undefined,
        preferredLanguage: values.preferredLanguage?.trim() || undefined,
        preferredContactChannel: values.preferredContactChannel,
        profession: values.profession?.trim() || undefined,
        sectorOfActivity: values.sectorOfActivity?.trim() || undefined,
        employer: values.employer?.trim() || undefined,
        incomeMin: values.incomeMin ? parseFloat(parseFormattedNumber(String(values.incomeMin))) : undefined,
        incomeMax: values.incomeMax ? parseFloat(parseFormattedNumber(String(values.incomeMax))) : undefined,
        jobStability: values.jobStability,
        borrowingCapacity: values.borrowingCapacity,
        salaire: values.salaire ? parseFloat(String(values.salaire)) : undefined,
        source: values.source?.trim() || undefined,
        leadSource: values.leadSource,
        maturityLevel: values.maturityLevel,
        score: values.score ? parseInt(String(values.score)) : undefined,
        priorityLevel: values.priorityLevel,
        assignedToUserId: values.assignedToUserId || undefined,
        // Preserve existing consent values on update when consent fields are not submitted.
        consentMarketing: values.consentMarketing !== undefined ? Boolean(values.consentMarketing) : undefined,
        consentWhatsapp: values.consentWhatsapp !== undefined ? Boolean(values.consentWhatsapp) : undefined,
        consentEmail: values.consentEmail !== undefined ? Boolean(values.consentEmail) : undefined,
        consentSource: values.consentSource?.trim() || undefined,
        internalNotes: values.internalNotes?.trim() || undefined,
        phone: phonePrimary,
        numeroPieceId: values.identityDocumentNumber?.trim() || undefined,
        fonction: values.profession?.trim() || undefined
      };

      await onSubmit(submitData);
    } catch (error: any) {
      // Le detail du probleme doit toujours remonter a l'ecran : sans cela un
      // echec de validation passait totalement inapercu (champs marques dans un
      // onglet non affiche, aucun message), et une panne reseau se resumait a
      // un « une erreur est survenue » impossible a diagnostiquer.
      const fieldErrors: Array<{ field: string; message: string }> | undefined = error.response?.data?.errors;

      if (fieldErrors && fieldErrors.length > 0) {
        fieldErrors.forEach(err => {
          form.setFields([{ name: err.field, errors: [err.message] }]);
        });
        const invalidFields = fieldErrors.map(err => err.field).join(', ');
        message.error(
          t('Champs invalides : {{invalidFields}}. Verifiez les onglets du formulaire.', {
            invalidFields: invalidFields
          })
        );
      } else if (error.response?.data?.message) {
        message.error(error.response.data.message);
      } else if (error.response) {
        message.error(t('Enregistrement refuse par le serveur (HTTP {{status}}).', { status: error.response.status }));
      } else {
        // Aucune reponse HTTP : reseau coupe, session expiree pendant l'envoi,
        // ou erreur survenue avant la requete. On affiche la cause reelle.
        message.error(
          t('Enregistrement impossible : {{value}}', { value: error.message || 'aucune reponse du serveur' })
        );
        console.error('Echec de creation du contact', error);
      }
      return;
    }
  };

  const handleUploadChange = (info: any) => {
    let newFileList = [...info.fileList];
    newFileList = newFileList.slice(-1);
    newFileList = newFileList.map(file => {
      if (file.response) {
        file.url = file.response.url;
      }
      return file;
    });
    setFileList(newFileList);

    if (info.file.status === 'done') {
      const reader = new FileReader();
      reader.onloadend = () => {
        form.setFieldsValue({ profilePhotoUrl: reader.result });
      };
      if (info.file.originFileObj) {
        reader.readAsDataURL(info.file.originFileObj);
      }
    } else if (info.file.status === 'removed') {
      form.setFieldsValue({ profilePhotoUrl: '' });
    }
  };

  const beforeUpload = (file: File) => {
    const isImage = file.type.startsWith('image/');
    if (!isImage) {
      message.error(t('Vous ne pouvez télécharger que des images!'));
    }
    const isLt2M = file.size / 1024 / 1024 < 2;
    if (!isLt2M) {
      message.error(t("L'image doit être inférieure à 2MB!"));
    }
    return isImage && isLt2M;
  };

  const formatNumber = (value: string | number | undefined): string => {
    if (!value) return '';
    return formatNumberWithSpaces(String(value));
  };

  const handleNumberChange = (field: string, value: string) => {
    const cleaned = parseFormattedNumber(value);
    form.setFieldsValue({ [field]: cleaned });
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleFinish}
      initialValues={{
        contactType: contact?.contactType || 'PERSON',
        phonePrimaryCountryCode: DEFAULT_COUNTRY_DIAL_CODE,
        phoneSecondaryCountryCode: DEFAULT_COUNTRY_DIAL_CODE,
        nationality: contact?.nationality || 'Ivoirienne',
        maturityLevel: contact?.maturityLevel || 'COLD',
        score: contact?.score || 0,
        priorityLevel: contact?.priorityLevel || 'NORMAL',
        consentMarketing: contact?.consentMarketing ?? true,
        consentWhatsapp: contact?.consentWhatsapp ?? true,
        consentEmail: contact?.consentEmail ?? true
      }}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Tabs activeKey={activeTab} onChange={setActiveTab} type="card">
          <TabPane tab="Basique" key="basic">
            <Card>
              <Form.Item
                label={t('Type de contact')}
                name="contactType"
                rules={[{ required: true, message: t('Le type de contact est requis') }]}
              >
                <Radio.Group>
                  <Radio value="PERSON">{t('Personne')}</Radio>
                  <Radio value="COMPANY">{t('Entreprise')}</Radio>
                </Radio.Group>
              </Form.Item>

              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item
                    label={t('Prénom')}
                    name="firstName"
                    rules={[{ required: true, message: t('Le prénom est requis') }]}
                  >
                    <Input placeholder={t('Prénom')} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item
                    label={t('Nom')}
                    name="lastName"
                    rules={[{ required: true, message: t('Le nom est requis') }]}
                  >
                    <Input placeholder={t('Nom')} />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item
                    label={t('Email personnel')}
                    name="email"
                    rules={[
                      { required: true, message: t("L'email est requis") },
                      { type: 'email', message: t('Adresse email invalide') }
                    ]}
                  >
                    <Input type="email" placeholder="email@example.com" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label={t('Email professionnel')} name="emailSecondary">
                    <Input type="email" placeholder="email@example.com" />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item label={t('Téléphone principal')}>
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Form.Item name="phonePrimaryIsWhatsApp" valuePropName="checked" noStyle>
                        <Checkbox>{'WhatsApp'}</Checkbox>
                      </Form.Item>
                      <Form.Item name="phonePrimary" noStyle>
                        <Input
                          type="tel"
                          placeholder={t('Numéro principal')}
                          addonBefore={
                            <Form.Item name="phonePrimaryCountryCode" noStyle>
                              <Select
                                showSearch
                                optionFilterProp="label"
                                style={{ width: 130 }}
                                options={COUNTRY_DIAL_CODES}
                              />
                            </Form.Item>
                          }
                        />
                      </Form.Item>
                    </Space>
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label={t('Téléphone secondaire')}>
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Form.Item name="phoneSecondaryIsWhatsApp" valuePropName="checked" noStyle>
                        <Checkbox>{'WhatsApp'}</Checkbox>
                      </Form.Item>
                      <Form.Item name="phoneSecondary" noStyle>
                        <Input
                          type="tel"
                          placeholder={t('Numéro secondaire')}
                          addonBefore={
                            <Form.Item name="phoneSecondaryCountryCode" noStyle>
                              <Select
                                showSearch
                                optionFilterProp="label"
                                style={{ width: 130 }}
                                options={COUNTRY_DIAL_CODES}
                              />
                            </Form.Item>
                          }
                        />
                      </Form.Item>
                    </Space>
                  </Form.Item>
                </Col>
              </Row>
            </Card>
          </TabPane>

          <TabPane tab={t('Identité')} key="identification">
            <Card>
              <Form.Item
                noStyle
                shouldUpdate={(prevValues, currentValues) => prevValues.contactType !== currentValues.contactType}
              >
                {({ getFieldValue }) =>
                  getFieldValue('contactType') === 'PERSON' ? (
                    <>
                      <Row gutter={16}>
                        <Col xs={24} sm={12}>
                          <Form.Item label={t('Civilité')} name="civility">
                            <Select placeholder={t('Sélectionner')}>
                              <Select.Option value="MR">{t('Monsieur')}</Select.Option>
                              <Select.Option value="MRS">{t('Madame')}</Select.Option>
                              <Select.Option value="MS">{t('Mademoiselle')}</Select.Option>
                              <Select.Option value="DR">{t('Docteur')}</Select.Option>
                              <Select.Option value="PROF">{t('Professeur')}</Select.Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                          <Form.Item label={t('Date de naissance')} name="dateOfBirth">
                            <DatePicker style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                      </Row>

                      <Form.Item label={t('Nationalité')} name="nationality">
                        <Input placeholder={t('ex: Ivoirienne, Française')} />
                      </Form.Item>

                      <Row gutter={16}>
                        <Col xs={24} sm={8}>
                          <Form.Item label={t('Type de pièce')} name="identityDocumentType">
                            <Select placeholder={t('Sélectionner')}>
                              <Select.Option value="CNI">CNI</Select.Option>
                              <Select.Option value="PASSPORT">{t('Passeport')}</Select.Option>
                              <Select.Option value="DRIVING_LICENSE">{t('Permis de conduire')}</Select.Option>
                              <Select.Option value="OTHER">{t('Autre')}</Select.Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={8}>
                          <Form.Item label={t('Numéro de pièce')} name="identityDocumentNumber">
                            <Input placeholder={t('Numéro CNI, Passeport, etc.')} />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={8}>
                          <Form.Item label={t("Date d'expiration")} name="identityDocumentExpiry">
                            <DatePicker style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                      </Row>

                      <Form.Item label={t('Photo de profil')} name="profilePhotoUrl">
                        <Upload
                          listType="picture-circle"
                          fileList={fileList}
                          onChange={handleUploadChange}
                          beforeUpload={beforeUpload}
                          maxCount={1}
                        >
                          {fileList.length === 0 && (
                            <div>
                              <div style={{ marginTop: 8 }}>
                                <UploadOutlined />
                                <div style={{ marginTop: 8 }}>{t('Télécharger')}</div>
                              </div>
                            </div>
                          )}
                        </Upload>
                      </Form.Item>
                    </>
                  ) : (
                    <>
                      <Form.Item
                        label={t('Raison sociale')}
                        name="legalName"
                        rules={[{ required: true, message: t('La raison sociale est requise') }]}
                      >
                        <Input placeholder={t('Raison sociale')} />
                      </Form.Item>

                      <Row gutter={16}>
                        <Col xs={24} sm={12}>
                          <Form.Item label={t('Forme juridique')} name="legalForm">
                            <Select placeholder={t('Sélectionner')}>
                              <Select.Option value="SARL">SARL</Select.Option>
                              <Select.Option value="SA">SA</Select.Option>
                              <Select.Option value="EI">EI</Select.Option>
                              <Select.Option value="EURL">EURL</Select.Option>
                              <Select.Option value="SAS">SAS</Select.Option>
                              <Select.Option value="ASSOCIATION">{t('Association')}</Select.Option>
                              <Select.Option value="OTHER">{t('Autre')}</Select.Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                          <Form.Item label="RCCM" name="rccm">
                            <Input placeholder="RCCM" />
                          </Form.Item>
                        </Col>
                      </Row>

                      <Form.Item label={t('Numéro fiscal')} name="taxId">
                        <Input placeholder={t('Numéro fiscal')} />
                      </Form.Item>

                      <Row gutter={16}>
                        <Col xs={24} sm={12}>
                          <Form.Item label={t('Nom du représentant')} name="representativeName">
                            <Input placeholder={t('Nom du représentant')} />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                          <Form.Item label={t('Fonction du représentant')} name="representativeRole">
                            <Input placeholder={t('Fonction du représentant')} />
                          </Form.Item>
                        </Col>
                      </Row>
                    </>
                  )
                }
              </Form.Item>
            </Card>
          </TabPane>

          <TabPane tab="Contact" key="contact">
            <Card>
              <Form.Item label={t('Adresse complète')} name="address">
                <Input placeholder={t('Adresse complète')} />
              </Form.Item>

              <Form.Item
                label={t('Commune')}
                name="communeId"
                rules={[{ required: true, message: t('La commune est requise') }]}
              >
                <LocationSelector
                  value={form.getFieldValue('communeId')}
                  onChange={loc => {
                    setLocation(loc);
                    form.setFieldsValue({ communeId: loc?.communeId || undefined });
                  }}
                  placeholder={t('Rechercher une commune (ex: Cocody)...')}
                />
              </Form.Item>

              <Form.Item label="Quartier/Zone" name="locationZone">
                <Input placeholder="Quartier/Zone" />
              </Form.Item>

              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item label={t('Langue préférée')} name="preferredLanguage">
                    <Radio.Group>
                      <Radio value={t('Français')}>{t('Français')}</Radio>
                      <Radio value="Anglais">{t('Anglais')}</Radio>
                      <Radio value="Autre">{t('Autre')}</Radio>
                    </Radio.Group>
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label={t('Canal de contact préféré')} name="preferredContactChannel">
                    <Select placeholder={t('Sélectionner')}>
                      <Select.Option value="CALL">{t('Appel')}</Select.Option>
                      <Select.Option value="WHATSAPP">{'WhatsApp'}</Select.Option>
                      <Select.Option value="EMAIL">{t('Email')}</Select.Option>
                      <Select.Option value="SMS">SMS</Select.Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
            </Card>
          </TabPane>

          <TabPane tab="Professionnel" key="professional">
            <Card>
              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item label={t('Profession / Fonction')} name="profession">
                    <Input placeholder={t('Poste ou fonction')} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label={t("Secteur d'activité")} name="sectorOfActivity">
                    <Select placeholder={t('Sélectionner un secteur')}>
                      <Select.Option value="AGRICULTURE">{t('Agriculture')}</Select.Option>
                      <Select.Option value="BANQUE_FINANCE">{t('Banque & Finance')}</Select.Option>
                      <Select.Option value="COMMERCE">{t('Commerce')}</Select.Option>
                      <Select.Option value="CONSTRUCTION">{t('Construction')}</Select.Option>
                      <Select.Option value="EDUCATION">{t('Éducation')}</Select.Option>
                      <Select.Option value="ENERGIE">{t('Énergie')}</Select.Option>
                      <Select.Option value="INFORMATIQUE_TECHNOLOGIE">{t('Informatique & Technologie')}</Select.Option>
                      <Select.Option value="IMMOBILIER">{t('Immobilier')}</Select.Option>
                      <Select.Option value="INDUSTRIE">{t('Industrie')}</Select.Option>
                      <Select.Option value="SANTE">{t('Santé')}</Select.Option>
                      <Select.Option value="SERVICES">{t('Services')}</Select.Option>
                      <Select.Option value="TELECOMMUNICATIONS">{t('Télécommunications')}</Select.Option>
                      <Select.Option value="TOURISME_HOTELLERIE">{t('Tourisme & Hôtellerie')}</Select.Option>
                      <Select.Option value="TRANSPORT_LOGISTIQUE">{t('Transport & Logistique')}</Select.Option>
                      <Select.Option value="AUTRE">{t('Autre')}</Select.Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item label={t('Employeur')} name="employer">
                <Input placeholder={t('Employeur')} />
              </Form.Item>

              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item label={t('Revenus minimum (FCFA)')} name="incomeMin">
                    <Input
                      value={formatNumber(form.getFieldValue('incomeMin'))}
                      onChange={e => handleNumberChange('incomeMin', e.target.value)}
                      placeholder={t('Ex: 500 000')}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label={t('Revenus maximum (FCFA)')} name="incomeMax">
                    <Input
                      value={formatNumber(form.getFieldValue('incomeMax'))}
                      onChange={e => handleNumberChange('incomeMax', e.target.value)}
                      placeholder={t('Ex: 1 000 000')}
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item label={t('Salaire')} name="salaire">
                    <InputNumber style={{ width: '100%' }} placeholder={t('Montant du salaire')} min={0} step={0.01} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label={t('Stabilité professionnelle')} name="jobStability">
                    <Select placeholder={t('Sélectionner')}>
                      <Select.Option value="CDI">CDI</Select.Option>
                      <Select.Option value="CDD">CDD</Select.Option>
                      <Select.Option value="FREELANCE">{t('Freelance')}</Select.Option>
                      <Select.Option value="INFORMAL">{t('Informel')}</Select.Option>
                      <Select.Option value="RETIRED">{t('Retraité')}</Select.Option>
                      <Select.Option value="STUDENT">{t('Étudiant')}</Select.Option>
                      <Select.Option value="UNEMPLOYED">{t('Sans emploi')}</Select.Option>
                      <Select.Option value="OTHER">{t('Autre')}</Select.Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item label={t("Capacité d'emprunt")} name="borrowingCapacity">
                <Select placeholder={t('Sélectionner')}>
                  <Select.Option value="YES">{t('Oui')}</Select.Option>
                  <Select.Option value="NO">{t('Non')}</Select.Option>
                  <Select.Option value="UNKNOWN">{t('Inconnu')}</Select.Option>
                </Select>
              </Form.Item>
            </Card>
          </TabPane>

          <TabPane tab="CRM" key="crm">
            <Card>
              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item label={t('Source (legacy)')} name="source">
                    <Input placeholder={t('ex. : Site web, Recommandation, Visite')} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label={t('Source du lead')} name="leadSource">
                    <Select placeholder={t('Sélectionner')}>
                      <Select.Option value="WEBSITE">{t('Site web')}</Select.Option>
                      <Select.Option value="SOCIAL_MEDIA">{t('Réseaux sociaux')}</Select.Option>
                      <Select.Option value="REFERRAL">{t('Parrainage')}</Select.Option>
                      <Select.Option value="CAMPAIGN">{t('Campagne')}</Select.Option>
                      <Select.Option value="AGENCY">{t('Agence')}</Select.Option>
                      <Select.Option value="WALK_IN">{t('Visite spontanée')}</Select.Option>
                      <Select.Option value="PHONE_CALL">{t('Appel téléphonique')}</Select.Option>
                      <Select.Option value="OTHER">{t('Autre')}</Select.Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col xs={24} sm={8}>
                  <Form.Item label={t('Niveau de maturité')} name="maturityLevel">
                    <Select>
                      <Select.Option value="COLD">{t('Froid')}</Select.Option>
                      <Select.Option value="WARM">{t('Tiède')}</Select.Option>
                      <Select.Option value="HOT">{t('Chaud')}</Select.Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item label={t('Score (0-100)')} name="score">
                    <InputNumber style={{ width: '100%' }} min={0} max={100} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item label={t('Priorité')} name="priorityLevel">
                    <Select>
                      <Select.Option value="LOW">{t('Basse')}</Select.Option>
                      <Select.Option value="NORMAL">{t('Normale')}</Select.Option>
                      <Select.Option value="HIGH">{t('Haute')}</Select.Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
            </Card>
          </TabPane>

          <TabPane tab="Consentements" key="consents">
            <Card>
              <Form.Item label={t('Consentements')}>
                <Space direction="vertical">
                  <Form.Item name="consentMarketing" valuePropName="checked" noStyle>
                    <Checkbox>{t('Consentement marketing')}</Checkbox>
                  </Form.Item>
                  <Form.Item name="consentWhatsapp" valuePropName="checked" noStyle>
                    <Checkbox>{t('Consentement WhatsApp')}</Checkbox>
                  </Form.Item>
                  <Form.Item name="consentEmail" valuePropName="checked" noStyle>
                    <Checkbox>{t('Consentement Email')}</Checkbox>
                  </Form.Item>
                </Space>
              </Form.Item>

              <Form.Item label={t('Source du consentement')} name="consentSource">
                <Input placeholder={t('Comment le consentement a été obtenu')} />
              </Form.Item>

              <Form.Item label={t('Notes internes')} name="internalNotes">
                <TextArea rows={6} placeholder={t('Notes internes sur le contact...')} />
              </Form.Item>
            </Card>
          </TabPane>
        </Tabs>

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
            <Button onClick={onCancel} disabled={loading}>
              {t('Annuler')}
            </Button>
          )}
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading} size="large">
            {loading ? 'Enregistrement...' : contact ? t('Mettre à jour le contact') : t('Créer le contact')}
          </Button>
        </div>
      </Space>
    </Form>
  );
};
