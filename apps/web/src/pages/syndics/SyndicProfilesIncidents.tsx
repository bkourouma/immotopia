import React, { useEffect, useMemo, useState } from 'react';
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
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { MoneyValue } from '../../components/primitives';
import { listContacts } from '../../services/crm-service';
import { listProperties } from '../../services/property-service';
import {
  createIncidentImputation,
  createLotOwnerProfile,
  createLotTenantProfile,
  createSyndicIncident,
  inviteCoOwnerToPortal,
  listLotOwnerProfiles,
  listLotTenantProfiles,
  listProvidersContracts,
  listSyndicateLots,
  listSyndicIncidents,
  revokeCoOwnerPortalAccess,
  updateSyndicIncident
} from '../../services/syndic-service';
import { CoOwnerInvitationResult } from '../../components/syndics/CoOwnerInvitationResult';
import { LinkedProviderInvoices } from '../../components/syndics/LinkedProviderInvoices';
import {
  CoOwnerPortalInvitation,
  LotOwnerProfile,
  LotTenantProfile,
  ServiceProvider,
  SyndicateIncident,
  SyndicateLot
} from '../../types/syndic-types';
import type { Property } from '../../types/property-types';
import { useSyndicRouteContext } from './useSyndicRouteContext';
import { CrmContact } from '../../types/crm-types';
import { formatLotLabel } from '../../utils/syndic-lot-label';
import { t } from '../../i18n/t';

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

/**
 * Libellé d'un lot pour les tableaux de profils/incidents.
 *
 * `fallbackProperty` couvre les lots importés dont la relation `property`
 * n'est pas chargée directement : `getLotOptionLabel` la retrouve par
 * référence interne et la transmet ici. Toujours construit par
 * `formatLotLabel` (numéro de lot en tête) — voir ce module pour le pourquoi
 * (constat de recette, module 5.1).
 */
function getLotDisplayName(
  lot?: SyndicateLot | null,
  _profileContact?: {
    firstName?: string | null;
    lastName?: string | null;
    legalName?: string | null;
    email?: string | null;
  } | null,
  fallbackProperty?: {
    title?: string | null;
  } | null
): string {
  if (!lot) return '-';
  return formatLotLabel({ ...lot, property: lot.property || fallbackProperty || null });
}

function getLotOptionLabel(lot: SyndicateLot, propertiesByInternalReference: Record<string, Property>): string {
  const lotReference = lot.property?.internalReference || lot.lotNumber || '';
  const propertyByReference = lotReference
    ? propertiesByInternalReference[lotReference.trim().toUpperCase()]
    : undefined;
  return getLotDisplayName(lot, null, propertyByReference);
}

/** Message d'erreur de l'API : `message` (erreurs typées), à défaut `error`, sinon le repli. */
function apiErrorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { message?: string; error?: string } } } | null)?.response?.data;
  return data?.message || data?.error || fallback;
}

function contactLabel(profile: LotOwnerProfile): string {
  const contact = profile.contact;
  if (!contact) return profile.contactId;
  const name = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
  return name || contact.legalName || contact.email || profile.contactId;
}

export const SyndicProfilesIncidents: React.FC = () => {
  const { message, modal } = App.useApp();

  const { tenantId: effectiveTenantId, syndicId } = useSyndicRouteContext();

  const [ownerProfiles, setOwnerProfiles] = useState<LotOwnerProfile[]>([]);
  const [tenantProfiles, setTenantProfiles] = useState<LotTenantProfile[]>([]);
  const [incidents, setIncidents] = useState<SyndicateIncident[]>([]);
  const [lots, setLots] = useState<SyndicateLot[]>([]);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [providers, setProviders] = useState<ServiceProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [assigningProviderIncidentId, setAssigningProviderIncidentId] = useState<string | null>(null);
  // Portail copropriétaire : invitation en cours, résultat affiché, révocation.
  const [invitingProfileId, setInvitingProfileId] = useState<string | null>(null);
  const [revokingProfileId, setRevokingProfileId] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<CoOwnerPortalInvitation | null>(null);
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
      const [lotsData, contactsData, propertiesData, providersData] = await Promise.all([
        listSyndicateLots(effectiveTenantId, syndicId),
        listContacts(effectiveTenantId, { page: 1, limit: 200 }),
        listProperties(effectiveTenantId, { page: 1, limit: 1000 }),
        listProvidersContracts(effectiveTenantId, syndicId)
      ]);
      setOwnerProfiles(owners);
      setTenantProfiles(tenants);
      setIncidents(incidentsData);
      setLots(lotsData);
      setContacts(contactsData.contacts || []);
      setProperties(propertiesData.properties || []);
      setProviders(providersData.providers || []);
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

  /**
   * Assignation d'un prestataire a un incident (ecart recette #2, FR-010) :
   * `updateIncidentSchema` (packages/api/src/lib/syndics/schemas.ts) accepte
   * deja `providerId`, et `updateSyndicIncident` existait deja cote web sans
   * qu'aucun ecran ne l'appelle pour ce champ. La liste deroulante se nourrit
   * des prestataires de `listProvidersContracts`, y compris ceux crees a la
   * volee depuis `<SyndicProviders>`.
   */
  const handleAssignProvider = async (incidentId: string, providerId: string | undefined) => {
    if (!effectiveTenantId || !syndicId) return;
    setAssigningProviderIncidentId(incidentId);
    try {
      await updateSyndicIncident(effectiveTenantId, syndicId, incidentId, { providerId: providerId || null });
      message.success(t('Prestataire assigné à l’incident'));
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Assignation du prestataire impossible'));
    } finally {
      setAssigningProviderIncidentId(null);
    }
  };

  /**
   * « Inviter au portail » : ouvre le portail copropriétaire au contact du
   * profil (compte créé au besoin, lots ouverts) et affiche le lien à copier,
   * que l'e-mail soit parti ou non. L'e-mail du contact est obligatoire : le
   * serveur refuse sinon, avec un message qui dit quoi corriger.
   */
  const handleInvite = async (profile: LotOwnerProfile) => {
    if (!effectiveTenantId || !syndicId) return;
    setInvitingProfileId(profile.id);
    try {
      const result = await inviteCoOwnerToPortal(effectiveTenantId, syndicId, profile.id);
      setInvitation(result);
      await loadData();
    } catch (err) {
      message.error(apiErrorMessage(err, t('Invitation au portail impossible')));
    } finally {
      setInvitingProfileId(null);
    }
  };

  const handleRevoke = async (profile: LotOwnerProfile) => {
    if (!effectiveTenantId || !syndicId) return;
    setRevokingProfileId(profile.id);
    try {
      await revokeCoOwnerPortalAccess(effectiveTenantId, syndicId, profile.id);
      message.success(t('Accès au portail révoqué'));
      await loadData();
    } catch (err) {
      message.error(apiErrorMessage(err, t("Révocation de l'accès impossible")));
    } finally {
      setRevokingProfileId(null);
    }
  };

  const confirmRevoke = (profile: LotOwnerProfile) => {
    modal.confirm({
      title: t("Révoquer l'accès au portail ?"),
      content: t(
        "{{name}} ne pourra plus consulter aucun de ses lots dans l'agence. Son compte utilisateur n'est pas supprimé.",
        { name: contactLabel(profile) }
      ),
      okText: t('Révoquer'),
      okButtonProps: { danger: true },
      cancelText: t('Annuler'),
      onOk: () => handleRevoke(profile)
    });
  };

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <Space direction="vertical" size={4}>
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
                    title: t('Lot'),
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
                    title: t('Contact'),
                    render: (_, row) => {
                      const contact = row.contact;
                      if (!contact) return row.contactId;
                      const name = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
                      return name || contact.legalName || contact.email || row.contactId;
                    }
                  },
                  { title: t('Part (%)'), dataIndex: 'ownershipPercentage' },
                  {
                    title: t('Depuis'),
                    dataIndex: 'ownedSince',
                    render: (value: string) => dayjs(value).format('DD/MM/YYYY')
                  },
                  {
                    title: t('Portail'),
                    render: (_, row) =>
                      row.portalAccessEnabled ? <Tag color="green">{t('Actif')}</Tag> : <Tag>{t('Inactif')}</Tag>
                  },
                  {
                    title: t('Accès portail'),
                    key: 'portal-actions',
                    render: (_, row) => (
                      <Space wrap>
                        <Button
                          size="small"
                          loading={invitingProfileId === row.id}
                          disabled={row.isActive === false}
                          onClick={() => void handleInvite(row)}
                        >
                          {t('Inviter au portail')}
                        </Button>
                        {row.portalAccessEnabled ? (
                          <Button
                            size="small"
                            danger
                            loading={revokingProfileId === row.id}
                            onClick={() => confirmRevoke(row)}
                          >
                            {t("Révoquer l'accès")}
                          </Button>
                        ) : null}
                      </Space>
                    )
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
                    title: t('Lot'),
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
                    title: t('Contact'),
                    render: (_, row) => {
                      const contact = row.contact;
                      if (!contact) return row.contactId;
                      const name = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
                      return name || contact.legalName || contact.email || row.contactId;
                    }
                  },
                  {
                    title: t('Depuis'),
                    dataIndex: 'tenantSince',
                    render: (value: string) => dayjs(value).format('DD/MM/YYYY')
                  },
                  {
                    title: t('Facture au locataire'),
                    render: (_, row) => (row.chargesBilledToTenant ? t('Oui') : t('Non'))
                  }
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
                    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                      <Table
                        scroll={{ x: 'max-content' }}
                        rowKey="id"
                        dataSource={incident.imputations || []}
                        pagination={false}
                        size="small"
                        locale={{ emptyText: t('Aucune imputation pour cet incident.') }}
                        columns={[
                          {
                            title: t('Type'),
                            dataIndex: 'imputationType',
                            render: (value: string) => incidentImputationTypeLabels[value] || value
                          },
                          {
                            title: t('Montant'),
                            dataIndex: 'amount',
                            align: 'end',
                            render: (value: number | string) => <MoneyValue value={value} />
                          },
                          {
                            title: t('Lot'),
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
                            title: t('Notes'),
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
                      {effectiveTenantId && syndicId ? (
                        <div>
                          <Typography.Text strong>{t('Factures liées')}</Typography.Text>
                          <LinkedProviderInvoices
                            tenantId={effectiveTenantId}
                            syndicId={syndicId}
                            incidentId={incident.id}
                          />
                        </div>
                      ) : null}
                    </Space>
                  ),
                  rowExpandable: () => true
                }}
                columns={[
                  {
                    title: t('Lot'),
                    key: 'lot',
                    render: (_: unknown, incident: SyndicateIncident) =>
                      (incident.lotId ? lotsById[incident.lotId]?.lotNumber : undefined) || '-'
                  },
                  {
                    title: t('Type'),
                    dataIndex: 'incidentType',
                    render: (value: string) => incidentTypeLabels[value] || value
                  },
                  {
                    title: t('Urgence'),
                    dataIndex: 'urgency',
                    render: (value: string) => incidentUrgencyLabels[value] || value
                  },
                  {
                    title: t('Description'),
                    dataIndex: 'description',
                    // Texte complet, retourné à la ligne : sans largeur fixe, le
                    // tableau l'étalerait sur une seule ligne. 440 px font tenir
                    // une description courante sur deux lignes.
                    width: 440,
                    render: (value: string) => (
                      <div style={{ width: 440, maxWidth: '100%', whiteSpace: 'normal' }}>{value}</div>
                    )
                  },
                  {
                    title: t('Statut'),
                    dataIndex: 'status',
                    render: (value: string) => <Tag>{incidentStatusLabels[value] || value}</Tag>
                  },
                  {
                    title: t('Imputations'),
                    render: (_, row) => (
                      <Tag color={(row.imputations?.length || 0) > 0 ? 'blue' : 'default'}>
                        {row.imputations?.length || 0}
                      </Tag>
                    )
                  },
                  {
                    title: t('Prestataire'),
                    key: 'providerId',
                    render: (_, row) => (
                      <Select
                        allowClear
                        showSearch
                        style={{ minWidth: 200 }}
                        placeholder={t('Aucun prestataire')}
                        optionFilterProp="label"
                        value={row.providerId || undefined}
                        loading={assigningProviderIncidentId === row.id}
                        disabled={assigningProviderIncidentId === row.id}
                        options={providers.map(provider => ({ value: provider.id, label: provider.name }))}
                        onChange={value => void handleAssignProvider(row.id, value)}
                      />
                    )
                  },
                  {
                    title: t('Action'),
                    render: (_, row) => (
                      <Button
                        size="small"
                        onClick={() => {
                          setSelectedIncidentId(row.id);
                          // Le lot de l'incident est pré-rempli, mais reste modifiable :
                          // main permet d'imputer un incident des parties communes à un
                          // lot précis.
                          imputationForm.resetFields();
                          imputationForm.setFieldsValue({ lotId: row.lotId || undefined });
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
        title={t('Inviter au portail copropriétaire')}
        open={invitation !== null}
        onCancel={() => setInvitation(null)}
        footer={[
          <Button key="close" type="primary" onClick={() => setInvitation(null)}>
            {t('Fermer')}
          </Button>
        ]}
      >
        {invitation ? <CoOwnerInvitationResult invitation={invitation} /> : null}
      </Modal>

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
              showSearch
              optionFilterProp="label"
              options={[
                { value: true, label: t('Oui') },
                { value: false, label: t('Non') }
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
              showSearch
              optionFilterProp="label"
              options={[
                { value: true, label: t('Oui') },
                { value: false, label: t('Non') }
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
              showSearch
              optionFilterProp="label"
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
              showSearch
              optionFilterProp="label"
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
              showSearch
              optionFilterProp="label"
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
