import React, { useState, useEffect } from 'react';
import {
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
  message,
  Card
} from 'antd';
import { UserOutlined, UploadOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd';
import dayjs from 'dayjs';
import { LocationSelector } from '../ui/location-selector';
import { GeographicLocation, getLocationByCommuneId } from '../../services/geographic-service';
import { CreateCrmContactRequest, UpdateCrmContactRequest, CrmContact } from '../../types/crm-types';
import { formatNumberWithSpaces, parseFormattedNumber } from '../../lib/utils';

const { TextArea } = Input;
const { TabPane } = Tabs;
const { Text } = Typography;

const COUNTRY_DIAL_CODES = [
  { value: '+225', label: 'CI (+225)' },
  { value: '+33', label: 'FR (+33)' },
  { value: '+32', label: 'BE (+32)' },
  { value: '+41', label: 'CH (+41)' },
  { value: '+1', label: 'US/CA (+1)' },
  { value: '+212', label: 'MA (+212)' },
  { value: '+221', label: 'SN (+221)' },
  { value: '+223', label: 'ML (+223)' },
  { value: '+226', label: 'BF (+226)' },
  { value: '+228', label: 'TG (+228)' },
  { value: '+229', label: 'BJ (+229)' },
  { value: '+234', label: 'NG (+234)' },
  { value: '+44', label: 'UK (+44)' }
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
      if (error.response?.data?.errors) {
        const apiErrors: Record<string, string> = {};
        error.response.data.errors.forEach((err: { field: string; message: string }) => {
          apiErrors[err.field] = err.message;
          form.setFields([{ name: err.field, errors: [err.message] }]);
        });
      } else if (error.response?.data?.message) {
        message.error(error.response.data.message);
      } else {
        message.error("Une erreur est survenue lors de l'enregistrement du contact");
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
      message.error('Vous ne pouvez télécharger que des images!');
    }
    const isLt2M = file.size / 1024 / 1024 < 2;
    if (!isLt2M) {
      message.error("L'image doit être inférieure à 2MB!");
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
                label="Type de contact"
                name="contactType"
                rules={[{ required: true, message: 'Le type de contact est requis' }]}
              >
                <Radio.Group>
                  <Radio value="PERSON">Personne</Radio>
                  <Radio value="COMPANY">Entreprise</Radio>
                </Radio.Group>
              </Form.Item>

              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item
                    label="Prénom"
                    name="firstName"
                    rules={[{ required: true, message: 'Le prénom est requis' }]}
                  >
                    <Input placeholder="Prénom" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="Nom" name="lastName" rules={[{ required: true, message: 'Le nom est requis' }]}>
                    <Input placeholder="Nom" />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item
                    label="Email personnel"
                    name="email"
                    rules={[
                      { required: true, message: "L'email est requis" },
                      { type: 'email', message: 'Adresse email invalide' }
                    ]}
                  >
                    <Input type="email" placeholder="email@example.com" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="Email professionnel" name="emailSecondary">
                    <Input type="email" placeholder="email@example.com" />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item label="Téléphone principal">
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Form.Item name="phonePrimaryIsWhatsApp" valuePropName="checked" noStyle>
                        <Checkbox>WhatsApp</Checkbox>
                      </Form.Item>
                      <Form.Item name="phonePrimary" noStyle>
                        <Input
                          type="tel"
                          placeholder="Numéro principal"
                          addonBefore={
                            <Form.Item name="phonePrimaryCountryCode" noStyle>
                              <Select style={{ width: 130 }} options={COUNTRY_DIAL_CODES} />
                            </Form.Item>
                          }
                        />
                      </Form.Item>
                    </Space>
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="Téléphone secondaire">
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Form.Item name="phoneSecondaryIsWhatsApp" valuePropName="checked" noStyle>
                        <Checkbox>WhatsApp</Checkbox>
                      </Form.Item>
                      <Form.Item name="phoneSecondary" noStyle>
                        <Input
                          type="tel"
                          placeholder="Numéro secondaire"
                          addonBefore={
                            <Form.Item name="phoneSecondaryCountryCode" noStyle>
                              <Select style={{ width: 130 }} options={COUNTRY_DIAL_CODES} />
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

          <TabPane tab="Identité" key="identification">
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
                          <Form.Item label="Civilité" name="civility">
                            <Select placeholder="Sélectionner">
                              <Select.Option value="MR">Monsieur</Select.Option>
                              <Select.Option value="MRS">Madame</Select.Option>
                              <Select.Option value="MS">Mademoiselle</Select.Option>
                              <Select.Option value="DR">Docteur</Select.Option>
                              <Select.Option value="PROF">Professeur</Select.Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                          <Form.Item label="Date de naissance" name="dateOfBirth">
                            <DatePicker style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                      </Row>

                      <Form.Item label="Nationalité" name="nationality">
                        <Input placeholder="ex: Ivoirienne, Française" />
                      </Form.Item>

                      <Row gutter={16}>
                        <Col xs={24} sm={8}>
                          <Form.Item label="Type de pièce" name="identityDocumentType">
                            <Select placeholder="Sélectionner">
                              <Select.Option value="CNI">CNI</Select.Option>
                              <Select.Option value="PASSPORT">Passeport</Select.Option>
                              <Select.Option value="DRIVING_LICENSE">Permis de conduire</Select.Option>
                              <Select.Option value="OTHER">Autre</Select.Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={8}>
                          <Form.Item label="Numéro de pièce" name="identityDocumentNumber">
                            <Input placeholder="Numéro CNI, Passeport, etc." />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={8}>
                          <Form.Item label="Date d'expiration" name="identityDocumentExpiry">
                            <DatePicker style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                      </Row>

                      <Form.Item label="Photo de profil" name="profilePhotoUrl">
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
                                <div style={{ marginTop: 8 }}>Télécharger</div>
                              </div>
                            </div>
                          )}
                        </Upload>
                      </Form.Item>
                    </>
                  ) : (
                    <>
                      <Form.Item
                        label="Raison sociale"
                        name="legalName"
                        rules={[{ required: true, message: 'La raison sociale est requise' }]}
                      >
                        <Input placeholder="Raison sociale" />
                      </Form.Item>

                      <Row gutter={16}>
                        <Col xs={24} sm={12}>
                          <Form.Item label="Forme juridique" name="legalForm">
                            <Select placeholder="Sélectionner">
                              <Select.Option value="SARL">SARL</Select.Option>
                              <Select.Option value="SA">SA</Select.Option>
                              <Select.Option value="EI">EI</Select.Option>
                              <Select.Option value="EURL">EURL</Select.Option>
                              <Select.Option value="SAS">SAS</Select.Option>
                              <Select.Option value="ASSOCIATION">Association</Select.Option>
                              <Select.Option value="OTHER">Autre</Select.Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                          <Form.Item label="RCCM" name="rccm">
                            <Input placeholder="RCCM" />
                          </Form.Item>
                        </Col>
                      </Row>

                      <Form.Item label="Numéro fiscal" name="taxId">
                        <Input placeholder="Numéro fiscal" />
                      </Form.Item>

                      <Row gutter={16}>
                        <Col xs={24} sm={12}>
                          <Form.Item label="Nom du représentant" name="representativeName">
                            <Input placeholder="Nom du représentant" />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                          <Form.Item label="Fonction du représentant" name="representativeRole">
                            <Input placeholder="Fonction du représentant" />
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
              <Form.Item label="Adresse complète" name="address">
                <Input placeholder="Adresse complète" />
              </Form.Item>

              <Form.Item
                label="Commune"
                name="communeId"
                rules={[{ required: true, message: 'La commune est requise' }]}
              >
                <LocationSelector
                  value={form.getFieldValue('communeId')}
                  onChange={loc => {
                    setLocation(loc);
                    form.setFieldsValue({ communeId: loc?.communeId || undefined });
                  }}
                  placeholder="Rechercher une commune (ex: Cocody)..."
                />
              </Form.Item>

              <Form.Item label="Quartier/Zone" name="locationZone">
                <Input placeholder="Quartier/Zone" />
              </Form.Item>

              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item label="Langue préférée" name="preferredLanguage">
                    <Radio.Group>
                      <Radio value="Français">Français</Radio>
                      <Radio value="Anglais">Anglais</Radio>
                      <Radio value="Autre">Autre</Radio>
                    </Radio.Group>
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="Canal de contact préféré" name="preferredContactChannel">
                    <Select placeholder="Sélectionner">
                      <Select.Option value="CALL">Appel</Select.Option>
                      <Select.Option value="WHATSAPP">WhatsApp</Select.Option>
                      <Select.Option value="EMAIL">Email</Select.Option>
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
                  <Form.Item label="Profession / Fonction" name="profession">
                    <Input placeholder="Poste ou fonction" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="Secteur d'activité" name="sectorOfActivity">
                    <Select placeholder="Sélectionner un secteur">
                      <Select.Option value="AGRICULTURE">Agriculture</Select.Option>
                      <Select.Option value="BANQUE_FINANCE">Banque & Finance</Select.Option>
                      <Select.Option value="COMMERCE">Commerce</Select.Option>
                      <Select.Option value="CONSTRUCTION">Construction</Select.Option>
                      <Select.Option value="EDUCATION">Éducation</Select.Option>
                      <Select.Option value="ENERGIE">Énergie</Select.Option>
                      <Select.Option value="INFORMATIQUE_TECHNOLOGIE">Informatique & Technologie</Select.Option>
                      <Select.Option value="IMMOBILIER">Immobilier</Select.Option>
                      <Select.Option value="INDUSTRIE">Industrie</Select.Option>
                      <Select.Option value="SANTE">Santé</Select.Option>
                      <Select.Option value="SERVICES">Services</Select.Option>
                      <Select.Option value="TELECOMMUNICATIONS">Télécommunications</Select.Option>
                      <Select.Option value="TOURISME_HOTELLERIE">Tourisme & Hôtellerie</Select.Option>
                      <Select.Option value="TRANSPORT_LOGISTIQUE">Transport & Logistique</Select.Option>
                      <Select.Option value="AUTRE">Autre</Select.Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item label="Employeur" name="employer">
                <Input placeholder="Employeur" />
              </Form.Item>

              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item label="Revenus minimum (FCFA)" name="incomeMin">
                    <Input
                      value={formatNumber(form.getFieldValue('incomeMin'))}
                      onChange={e => handleNumberChange('incomeMin', e.target.value)}
                      placeholder="Ex: 500 000"
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="Revenus maximum (FCFA)" name="incomeMax">
                    <Input
                      value={formatNumber(form.getFieldValue('incomeMax'))}
                      onChange={e => handleNumberChange('incomeMax', e.target.value)}
                      placeholder="Ex: 1 000 000"
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item label="Salaire" name="salaire">
                    <InputNumber style={{ width: '100%' }} placeholder="Montant du salaire" min={0} step={0.01} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="Stabilité professionnelle" name="jobStability">
                    <Select placeholder="Sélectionner">
                      <Select.Option value="CDI">CDI</Select.Option>
                      <Select.Option value="CDD">CDD</Select.Option>
                      <Select.Option value="FREELANCE">Freelance</Select.Option>
                      <Select.Option value="INFORMAL">Informel</Select.Option>
                      <Select.Option value="RETIRED">Retraité</Select.Option>
                      <Select.Option value="STUDENT">Étudiant</Select.Option>
                      <Select.Option value="UNEMPLOYED">Sans emploi</Select.Option>
                      <Select.Option value="OTHER">Autre</Select.Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item label="Capacité d'emprunt" name="borrowingCapacity">
                <Select placeholder="Sélectionner">
                  <Select.Option value="YES">Oui</Select.Option>
                  <Select.Option value="NO">Non</Select.Option>
                  <Select.Option value="UNKNOWN">Inconnu</Select.Option>
                </Select>
              </Form.Item>
            </Card>
          </TabPane>

          <TabPane tab="CRM" key="crm">
            <Card>
              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item label="Source (legacy)" name="source">
                    <Input placeholder="ex. : Site web, Recommandation, Visite" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="Source du lead" name="leadSource">
                    <Select placeholder="Sélectionner">
                      <Select.Option value="WEBSITE">Site web</Select.Option>
                      <Select.Option value="SOCIAL_MEDIA">Réseaux sociaux</Select.Option>
                      <Select.Option value="REFERRAL">Parrainage</Select.Option>
                      <Select.Option value="CAMPAIGN">Campagne</Select.Option>
                      <Select.Option value="AGENCY">Agence</Select.Option>
                      <Select.Option value="WALK_IN">Visite spontanée</Select.Option>
                      <Select.Option value="PHONE_CALL">Appel téléphonique</Select.Option>
                      <Select.Option value="OTHER">Autre</Select.Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col xs={24} sm={8}>
                  <Form.Item label="Niveau de maturité" name="maturityLevel">
                    <Select>
                      <Select.Option value="COLD">Froid</Select.Option>
                      <Select.Option value="WARM">Tiède</Select.Option>
                      <Select.Option value="HOT">Chaud</Select.Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item label="Score (0-100)" name="score">
                    <InputNumber style={{ width: '100%' }} min={0} max={100} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item label="Priorité" name="priorityLevel">
                    <Select>
                      <Select.Option value="LOW">Basse</Select.Option>
                      <Select.Option value="NORMAL">Normale</Select.Option>
                      <Select.Option value="HIGH">Haute</Select.Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
            </Card>
          </TabPane>

          <TabPane tab="Consentements" key="consents">
            <Card>
              <Form.Item label="Consentements">
                <Space direction="vertical">
                  <Form.Item name="consentMarketing" valuePropName="checked" noStyle>
                    <Checkbox>Consentement marketing</Checkbox>
                  </Form.Item>
                  <Form.Item name="consentWhatsapp" valuePropName="checked" noStyle>
                    <Checkbox>Consentement WhatsApp</Checkbox>
                  </Form.Item>
                  <Form.Item name="consentEmail" valuePropName="checked" noStyle>
                    <Checkbox>Consentement Email</Checkbox>
                  </Form.Item>
                </Space>
              </Form.Item>

              <Form.Item label="Source du consentement" name="consentSource">
                <Input placeholder="Comment le consentement a été obtenu" />
              </Form.Item>

              <Form.Item label="Notes internes" name="internalNotes">
                <TextArea rows={6} placeholder="Notes internes sur le contact..." />
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
              Annuler
            </Button>
          )}
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading} size="large">
            {loading ? 'Enregistrement...' : contact ? 'Mettre à jour le contact' : 'Créer le contact'}
          </Button>
        </div>
      </Space>
    </Form>
  );
};
