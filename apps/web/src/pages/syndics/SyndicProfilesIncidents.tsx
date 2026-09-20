import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  App,
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography
} from 'antd';
import { ArrowLeftOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { listContacts } from '../../services/crm-service';
import { listProperties } from '../../services/property-service';
import {
  createIncidentImputation,
  createLotOwnerProfile,
  createLotTenantProfile,
  createSyndicIncident,
  listLotOwnerProfiles,
  listLotTenantProfiles,
  listSyndicateLots,
  listSyndicIncidents
} from '../../services/syndic-service';
import { LotOwnerProfile, LotTenantProfile, SyndicateIncident, SyndicateLot } from '../../types/syndic-types';
import type { Property } from '../../types/property-types';
import { useSyndicRouteContext } from './useSyndicRouteContext';
import { CrmContact } from '../../types/crm-types';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Paragraph, Title } = Typography;

const incidentTypeLabels: Record<string, string> = {
  BREAKDOWN: 'Panne',
  LEAK: 'Fuite',
  VANDALISM: 'Vandalisme',
  SAFETY: t('Sécurité'),
  OTHER: 'Autre'
};

const incidentUrgencyLabels: Record<string, string> = {
  LOW: 'Basse',
  MEDIUM: 'Moyenne',
  HIGH: 'Haute',
  CRITICAL: 'Critique'
};

const incidentStatusLabels: Record<string, string> = {
  REPORTED: t('Signalé'),
  IN_PROGRESS: t('En cours'),
  RESOLVED: t('Résolu'),
  CLOSED: t('Clôturé')
};

const incidentImputationTypeLabels: Record<string, string> = {
  SYNDICATE_BUDGET: t('Budget syndic'),
  INSURANCE: 'Assurance',
  LOT_OWNER: t('Lot propriétaire'),
  THIRD_PARTY: 'Tiers'
};

function isTechnicalLotLabel(value?: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toUpperCase();
  return normalized.startsWith('PROP-');
}

function getContactDisplayName(
  contact?: {
    firstName?: string | null;
    lastName?: string | null;
    legalName?: string | null;
    email?: string | null;
  } | null
): string {
  if (!contact) return '';
  const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
  return fullName || contact.legalName || contact.email || '';
}

function getLotDisplayName(
  lot?: SyndicateLot | null,
  profileContact?: {
    firstName?: string | null;
    lastName?: string | null;
    legalName?: string | null;
    email?: string | null;
  } | null,
  fallbackProperty?: {
    title?: string | null;
    address?: string | null;
    internalReference?: string | null;
  } | null
): string {
  if (!lot) return '-';
  const property = lot.property;
  const contactName = getContactDisplayName(profileContact);
  const titleLabel = property?.title?.trim() || fallbackProperty?.title?.trim() || '';
  const addressLabel = property?.address?.trim() || fallbackProperty?.address?.trim() || '';
  const referenceLabel =
    property?.internalReference?.trim() || fallbackProperty?.internalReference?.trim() || lot.lotNumber || '';
  const validReferenceLabel = isTechnicalLotLabel(referenceLabel) ? '' : referenceLabel;
  const lotLabel = titleLabel || addressLabel || validReferenceLabel;

  if (!lotLabel && contactName) return 'Lot';
  if (!lotLabel) return t('Lot sans libellé');
  return lotLabel || lot.lotNumber || '-';
}

function getLotOptionLabel(lot: SyndicateLot, propertiesByInternalReference: Record<string, Property>): string {
  const lotReference = lot.property?.internalReference || lot.lotNumber || '';
  const propertyByReference = lotReference
    ? propertiesByInternalReference[lotReference.trim().toUpperCase()]
    : undefined;
  const displayName = getLotDisplayName(lot, null, propertyByReference);
  return `${displayName} (${lot.lotType})`;
}

export const SyndicProfilesIncidents: React.FC = () => {
  const { message } = App.useApp();

  const { tenantId: effectiveTenantId, syndicId } = useSyndicRouteContext();
  const navigate = useNavigate();

  const [ownerProfiles, setOwnerProfiles] = useState<LotOwnerProfile[]>([]);
  const [tenantProfiles, setTenantProfiles] = useState<LotTenantProfile[]>([]);
  const [incidents, setIncidents] = useState<SyndicateIncident[]>([]);
  const [lots, setLots] = useState<SyndicateLot[]>([]);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [openOwner, setOpenOwner] = useState(false);
  const [openTenant, setOpenTenant] = useState(false);
  const [openIncident, setOpenIncident] = useState(false);
  const [openImputation, setOpenImputation] = useState(false);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);

  const [ownerForm] = Form.useForm();
  const [tenantForm] = Form.useForm();
  const [incidentForm] = Form.useForm();
  const [imputationForm] = Form.useForm();

  const lotsById = useMemo(
    () =>
      lots.reduce<Record<string, SyndicateLot>>((acc, lot) => {
        acc[lot.id] = lot;
        return acc;
      }, {}),
    [lots]
  );

  const propertiesByInternalReference = useMemo(
    () =>
      properties.reduce<Record<string, Property>>((acc, property) => {
        const key = property.internalReference?.trim().toUpperCase();
        if (key) acc[key] = property;
        return acc;
      }, {}),
    [properties]
  );

  useEffect(() => {
    if (!effectiveTenantId || !syndicId) {
      setLoading(false);
      setError(t('Paramètres profils/incidents manquants'));
      return;
    }
    void loadData();
  }, [effectiveTenantId, syndicId]);

  const loadData = async () => {
    if (!effectiveTenantId || !syndicId) return;
    setLoading(true);
    setError(null);
    try {
      const [owners, tenants, incidentsData] = await Promise.all([
        listLotOwnerProfiles(effectiveTenantId, syndicId),
        listLotTenantProfiles(effectiveTenantId, syndicId),
        listSyndicIncidents(effectiveTenantId, syndicId)
      ]);
      const [lotsData, contactsData, propertiesData] = await Promise.all([
        listSyndicateLots(effectiveTenantId, syndicId),
        listContacts(effectiveTenantId, { page: 1, limit: 200 }),
        listProperties(effectiveTenantId, { page: 1, limit: 1000 })
      ]);
      setOwnerProfiles(owners);
      setTenantProfiles(tenants);
      setIncidents(incidentsData);
      setLots(lotsData);
      setContacts(contactsData.contacts || []);
      setProperties(propertiesData.properties || []);
    } catch (err: any) {
      setError(err.response?.data?.error || t('Impossible de charger profils et incidents'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOwner = async () => {
    if (!effectiveTenantId || !syndicId) return;
    const values = await ownerForm.validateFields();
    setSubmitting(true);
    try {
      await createLotOwnerProfile(effectiveTenantId, syndicId, {
        lotId: values.lotId,
        contactId: values.contactId,
        ownershipPercentage: values.ownershipPercentage,
        ownedSince: new Date(values.ownedSince).toISOString(),
        portalAccessEnabled: values.portalAccessEnabled || false
      });
      message.success(t('Profil propriétaire créé'));
      setOpenOwner(false);
      ownerForm.resetFields();
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Création profil propriétaire impossible'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateTenant = async () => {
    if (!effectiveTenantId || !syndicId) return;
    const values = await tenantForm.validateFields();
    setSubmitting(true);
    try {
      await createLotTenantProfile(effectiveTenantId, syndicId, {
        lotId: values.lotId,
        contactId: values.contactId,
        tenantSince: new Date(values.tenantSince).toISOString(),
        chargesBilledToTenant: values.chargesBilledToTenant || false,
        isCurrent: true
      });
      message.success(t('Profil locataire créé'));
      setOpenTenant(false);
      tenantForm.resetFields();
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Création profil locataire impossible'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateIncident = async () => {
    if (!effectiveTenantId || !syndicId) return;
    const values = await incidentForm.validateFields();
    setSubmitting(true);
    try {
      await createSyndicIncident(effectiveTenantId, syndicId, {
        reportedByContactId: values.reportedByContactId,
        lotId: values.lotId || undefined,
        incidentType: values.incidentType,
        description: values.description,
        urgency: values.urgency
      });
      message.success(t('Incident créé'));
      setOpenIncident(false);
      incidentForm.resetFields();
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || t("Création d'incident impossible"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateImputation = async () => {
    if (!effectiveTenantId || !syndicId || !selectedIncidentId) return;
    const values = await imputationForm.validateFields();
    setSubmitting(true);
    try {
      await createIncidentImputation(effectiveTenantId, syndicId, selectedIncidentId, {
        imputationType: values.imputationType,
        amount: values.amount,
        currency: values.currency || 'XOF',
        lotId: values.lotId || undefined,
        notes: values.notes || undefined
      });
      message.success(t('Imputation enregistree'));
      setOpenImputation(false);
      setSelectedIncidentId(null);
      imputationForm.resetFields();
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || t("Imputation d'incident impossible"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <Space direction="vertical" size={4}>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate(`/tenant/${effectiveTenantId}/syndics/${syndicId}`)}
            >
              {t('Retour à la fiche syndic')}
            </Button>
            <Title level={2} style={{ margin: 0 }}>
              {t('Profils lot et incidents')}
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {t('Profils propriétaires/locataires et suivi des incidents avec imputations.')}
            </Paragraph>
          </Space>
          <Space>
            <Button icon={<PlusOutlined />} onClick={() => setOpenOwner(true)}>
              {t('Profil propriétaire')}
            </Button>
            <Button icon={<PlusOutlined />} onClick={() => setOpenTenant(true)}>
              {t('Profil locataire')}
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpenIncident(true)}>
              {t('Nouvel incident')}
            </Button>
          </Space>
        </div>

        {error ? <Alert type="error" message={error} showIcon /> : null}

        {loading ? (
          <div style={{ minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spin size="large" />
          </div>
        ) : (
          <>
            <Card title={t('Profils propriétaires')}>
              <Table
                scroll={{ x: 'max-content' }}
                rowKey="id"
                dataSource={ownerProfiles}
                pagination={{ pageSize: 8 }}
                columns={[
                  {
                    title: 'Lot',
                    render: (_, row) => {
                      const lot = row.lot || (row.lotId ? lotsById[row.lotId] : undefined);
                      const lotReference = lot?.property?.internalReference || lot?.lotNumber || '';
                      const propertyByReference = lotReference
                        ? propertiesByInternalReference[lotReference.trim().toUpperCase()]
                        : undefined;
                      return getLotDisplayName(lot, row.contact || null, propertyByReference);
                    }
                  },
                  {
                    title: 'Contact',
                    render: (_, row) => {
                      const contact = row.contact;
                      if (!contact) return row.contactId;
                      const name = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
                      return name || contact.legalName || contact.email || row.contactId;
                    }
                  },
                  { title: t('Part (%)'), dataIndex: 'ownershipPercentage' },
                  {
                    title: 'Depuis',
                    dataIndex: 'ownedSince',
                    render: (value: string) => dayjs(value).format('DD/MM/YYYY')
                  },
                  {
                    title: 'Portail',
                    render: (_, row) => (row.portalAccessEnabled ? <Tag color="green">ACTIVE</Tag> : <Tag>INACTIF</Tag>)
                  }
                ]}
              />
            </Card>

            <Card title={t('Profils locataires')}>
              <Table
                scroll={{ x: 'max-content' }}
                rowKey="id"
                dataSource={tenantProfiles}
                pagination={{ pageSize: 8 }}
                columns={[
                  {
                    title: 'Lot',
                    render: (_, row) => {
                      const lot = row.lot || (row.lotId ? lotsById[row.lotId] : undefined);
                      const lotReference = lot?.property?.internalReference || lot?.lotNumber || '';
                      const propertyByReference = lotReference
                        ? propertiesByInternalReference[lotReference.trim().toUpperCase()]
                        : undefined;
                      return getLotDisplayName(lot, row.contact || null, propertyByReference);
                    }
                  },
                  {
                    title: 'Contact',
                    render: (_, row) => {
                      const contact = row.contact;
                      if (!contact) return row.contactId;
                      const name = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
                      return name || contact.legalName || contact.email || row.contactId;
                    }
                  },
                  {
                    title: 'Depuis',
                    dataIndex: 'tenantSince',
                    render: (value: string) => dayjs(value).format('DD/MM/YYYY')
                  },
                  { title: t('Facture au locataire'), render: (_, row) => (row.chargesBilledToTenant ? 'Oui' : 'Non') }
                ]}
              />
            </Card>

            <Card title={t('Incidents et imputations')}>
              <Table
                scroll={{ x: 'max-content' }}
                rowKey="id"
                dataSource={incidents}
                pagination={{ pageSize: 8 }}
                expandable={{
                  expandedRowRender: incident => (
                    <Table
                      scroll={{ x: 'max-content' }}
                      rowKey="id"
                      dataSource={incident.imputations || []}
                      pagination={false}
                      size="small"
                      locale={{ emptyText: 'Aucune imputation pour cet incident.' }}
                      columns={[
                        {
                          title: 'Type',
                          dataIndex: 'imputationType',
                          render: (value: string) => incidentImputationTypeLabels[value] || value
                        },
                        {
                          title: 'Montant',
                          dataIndex: 'amount',
                          render: (value: number | string) => `${Number(value).toLocaleString(activeLocale())} XOF`
                        },
                        { title: 'Devise', dataIndex: 'currency' },
                        {
                          title: 'Lot',
                          render: (_, row) => {
                            const lot = row.lot || (row.lotId ? lotsById[row.lotId] : undefined);
                            const lotReference = lot?.property?.internalReference || lot?.lotNumber || '';
                            const propertyByReference = lotReference
                              ? propertiesByInternalReference[lotReference.trim().toUpperCase()]
                              : undefined;
                            return getLotDisplayName(lot, null, propertyByReference);
                          }
                        },
                        {
                          title: 'Notes',
                          dataIndex: 'notes',
                          render: (value: string | undefined | null) => value || '-'
                        },
                        {
                          title: t('Cree le'),
                          dataIndex: 'createdAt',
                          render: (value: string) => dayjs(value).format('DD/MM/YYYY HH:mm')
                        }
                      ]}
                    />
                  ),
                  rowExpandable: incident => (incident.imputations?.length || 0) > 0
                }}
                columns={[
                  {
                    title: 'Type',
                    dataIndex: 'incidentType',
                    render: (value: string) => incidentTypeLabels[value] || value
                  },
                  {
                    title: 'Urgence',
                    dataIndex: 'urgency',
                    render: (value: string) => incidentUrgencyLabels[value] || value
                  },
                  { title: 'Description', dataIndex: 'description' },
                  {
                    title: 'Statut',
                    dataIndex: 'status',
                    render: (value: string) => <Tag>{incidentStatusLabels[value] || value}</Tag>
                  },
                  {
                    title: 'Imputations',
                    render: (_, row) => (
                      <Tag color={(row.imputations?.length || 0) > 0 ? 'blue' : 'default'}>
                        {row.imputations?.length || 0}
                      </Tag>
                    )
                  },
                  {
                    title: 'Action',
                    render: (_, row) => (
                      <Button
                        size="small"
                        onClick={() => {
                          setSelectedIncidentId(row.id);
                          setOpenImputation(true);
                        }}
                      >
                        {t('Ajouter imputation')}
                      </Button>
                    )
                  }
                ]}
              />
            </Card>
          </>
        )}
      </Space>

      <Modal
        title={t('Nouveau profil propriétaire')}
        open={openOwner}
        onCancel={() => setOpenOwner(false)}
        onOk={() => void handleCreateOwner()}
        confirmLoading={submitting}
      >
        <Form
          form={ownerForm}
          layout="vertical"
          initialValues={{ ownershipPercentage: 100, portalAccessEnabled: false }}
        >
          <Form.Item label={t('Lot')} name="lotId" rules={[{ required: true, message: t('Lot obligatoire') }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={lots.map(lot => ({
                value: lot.id,
                label: getLotOptionLabel(lot, propertiesByInternalReference)
              }))}
            />
          </Form.Item>
          <Form.Item
            label={t('Contact propriétaire')}
            name="contactId"
            rules={[{ required: true, message: t('Contact obligatoire') }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={contacts.map(contact => {
                const name = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
                const label = name || contact.legalName || contact.email || contact.id;
                return { value: contact.id, label: contact.email ? `${label} (${contact.email})` : label };
              })}
            />
          </Form.Item>
          <Form.Item label={t('Part de propriete (%)')} name="ownershipPercentage" rules={[{ required: true }]}>
            <InputNumber min={0.01} max={100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label={t('Date de debut')} name="ownedSince" rules={[{ required: true }]}>
            <Input type="date" />
          </Form.Item>
          <Form.Item label={t('Activer accès portail')} name="portalAccessEnabled">
            <Select
              options={[
                { value: true, label: 'Oui' },
                { value: false, label: 'Non' }
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('Nouveau profil locataire')}
        open={openTenant}
        onCancel={() => setOpenTenant(false)}
        onOk={() => void handleCreateTenant()}
        confirmLoading={submitting}
      >
        <Form form={tenantForm} layout="vertical" initialValues={{ chargesBilledToTenant: false }}>
          <Form.Item label={t('Lot')} name="lotId" rules={[{ required: true, message: t('Lot obligatoire') }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={lots.map(lot => ({
                value: lot.id,
                label: getLotOptionLabel(lot, propertiesByInternalReference)
              }))}
            />
          </Form.Item>
          <Form.Item
            label={t('Contact locataire')}
            name="contactId"
            rules={[{ required: true, message: t('Contact obligatoire') }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={contacts.map(contact => {
                const name = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
                const label = name || contact.legalName || contact.email || contact.id;
                return { value: contact.id, label: contact.email ? `${label} (${contact.email})` : label };
              })}
            />
          </Form.Item>
          <Form.Item label={t("Date d'entrée")} name="tenantSince" rules={[{ required: true }]}>
            <Input type="date" />
          </Form.Item>
          <Form.Item label={t('Charges facturees au locataire')} name="chargesBilledToTenant">
            <Select
              options={[
                { value: true, label: 'Oui' },
                { value: false, label: 'Non' }
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('Nouvel incident')}
        open={openIncident}
        onCancel={() => setOpenIncident(false)}
        onOk={() => void handleCreateIncident()}
        confirmLoading={submitting}
      >
        <Form form={incidentForm} layout="vertical" initialValues={{ incidentType: 'OTHER', urgency: 'MEDIUM' }}>
          <Form.Item
            label={t('Contact declarant')}
            name="reportedByContactId"
            rules={[{ required: true, message: t('Contact obligatoire') }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={contacts.map(contact => {
                const name = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
                const label = name || contact.legalName || contact.email || contact.id;
                return { value: contact.id, label: contact.email ? `${label} (${contact.email})` : label };
              })}
            />
          </Form.Item>
          <Form.Item label={t('Lot (optionnel)')} name="lotId">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={lots.map(lot => ({
                value: lot.id,
                label: getLotOptionLabel(lot, propertiesByInternalReference)
              }))}
            />
          </Form.Item>
          <Form.Item label={t('Type incident')} name="incidentType" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'BREAKDOWN', label: 'Panne' },
                { value: 'LEAK', label: 'Fuite' },
                { value: 'VANDALISM', label: 'Vandalisme' },
                { value: 'SAFETY', label: 'Securite' },
                { value: 'OTHER', label: 'Autre' }
              ]}
            />
          </Form.Item>
          <Form.Item label={t('Urgence')} name="urgency" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'LOW', label: 'Basse' },
                { value: 'MEDIUM', label: 'Moyenne' },
                { value: 'HIGH', label: 'Haute' },
                { value: 'CRITICAL', label: 'Critique' }
              ]}
            />
          </Form.Item>
          <Form.Item label={t('Description')} name="description" rules={[{ required: true }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('Imputation d incident')}
        open={openImputation}
        onCancel={() => setOpenImputation(false)}
        onOk={() => void handleCreateImputation()}
        confirmLoading={submitting}
      >
        <Form
          form={imputationForm}
          layout="vertical"
          initialValues={{ imputationType: 'SYNDICATE_BUDGET', currency: 'XOF' }}
        >
          <Form.Item label={t('Type imputation')} name="imputationType" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'SYNDICATE_BUDGET', label: t('Budget syndic') },
                { value: 'INSURANCE', label: 'Assurance' },
                { value: 'LOT_OWNER', label: t('Lot propriétaire') },
                { value: 'THIRD_PARTY', label: 'Tiers' }
              ]}
            />
          </Form.Item>
          <Form.Item label={t('Montant')} name="amount" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label={t('Devise')} name="currency">
            <Input />
          </Form.Item>
          <Form.Item label={t('Lot (optionnel)')} name="lotId">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={lots.map(lot => ({
                value: lot.id,
                label: getLotOptionLabel(lot, propertiesByInternalReference)
              }))}
            />
          </Form.Item>
          <Form.Item label={t('Notes')} name="notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};
