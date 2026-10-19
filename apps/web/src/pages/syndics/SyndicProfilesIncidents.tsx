import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  App,
  Alert,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Tag,
  Typography
} from 'antd';
import { EditOutlined, PlusOutlined, UserAddOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { MoneyValue, Table } from '../../components/primitives';
import { ContactForm } from '../../components/crm/ContactForm';
import { createContact, listContacts } from '../../services/crm-service';
import { listProperties } from '../../services/property-service';
import {
  createIncidentImputation,
  createLotOwnerProfile,
  createLotTenantProfile,
  createSyndicIncident,
  inviteCoOwnerToPortal,
  listBudgets,
  listContracts,
  listLotOwnerProfilesWithSummary,
  listLotTenantProfiles,
  listProvidersContracts,
  listSyndicateLots,
  listSyndicIncidents,
  revokeCoOwnerPortalAccess,
  updateLotTenantProfile,
  updateSyndicIncident
} from '../../services/syndic-service';
import { CoOwnerInvitationResult } from '../../components/syndics/CoOwnerInvitationResult';
import { LinkedProviderInvoices } from '../../components/syndics/LinkedProviderInvoices';
import {
  BudgetLineItem,
  CoOwnerPortalInvitation,
  IncompleteOwnerShares,
  LotOwnerProfile,
  LotTenantProfile,
  MaintenanceContract,
  ServiceProvider,
  SyndicateBudget,
  SyndicateIncident,
  SyndicateLot
} from '../../types/syndic-types';
import type { Property } from '../../types/property-types';
import { useSyndicRouteContext } from './useSyndicRouteContext';
import { CreateCrmContactRequest, CrmContact, UpdateCrmContactRequest } from '../../types/crm-types';
import { formatLotLabel } from '../../utils/syndic-lot-label';
import { t } from '../../i18n/t';
import { dateFormat } from '../../i18n/format';

const { Paragraph, Title } = Typography;

type ContactTarget = 'owner' | 'tenant' | 'incident';

interface OpenOwner {
  profileId?: string;
  contactName: string;
}

/** Propriétaires en cours listés par le 409 `OPEN_OWNERS`, ou null pour toute autre erreur. */
function extractOpenOwners(err: any): OpenOwner[] | null {
  if (err?.response?.status !== 409) return null;
  const data = err.response?.data;
  const lists = [data?.errors];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    const entry = list.find((item: any) => item?.field === 'previousOwnersHandling' && item?.reason === 'OPEN_OWNERS');
    if (entry) return Array.isArray(entry.owners) ? entry.owners : [];
  }
  return null;
}

function getIncidentTypeLabel(type: string): string {
  switch (type) {
    case 'BREAKDOWN':
      return t('Panne');
    case 'LEAK':
      return t('Fuite');
    case 'VANDALISM':
      return t('Vandalisme');
    case 'SAFETY':
      return t('Sécurité');
    case 'OTHER':
      return t('Autre');
    default:
      return type;
  }
}

function getIncidentUrgencyLabel(urgency: string): string {
  switch (urgency) {
    case 'LOW':
      return t('Basse');
    case 'MEDIUM':
      return t('Moyenne');
    case 'HIGH':
      return t('Haute');
    case 'CRITICAL':
      return t('Critique');
    default:
      return urgency;
  }
}

function getIncidentStatusLabel(status: string): string {
  switch (status) {
    case 'REPORTED':
      return t('Signalé');
    case 'ASSIGNED':
      return t('Assigné');
    case 'IN_PROGRESS':
      return t('En cours');
    case 'RESOLVED':
      return t('Résolu');
    case 'CLOSED':
      return t('Clôturé');
    default:
      return status;
  }
}

const incidentStatusColors: Record<string, string> = {
  REPORTED: 'default',
  ASSIGNED: 'blue',
  IN_PROGRESS: 'processing',
  RESOLVED: 'green',
  CLOSED: 'default'
};

const INCIDENT_TYPES = ['BREAKDOWN', 'LEAK', 'VANDALISM', 'SAFETY', 'OTHER'];
const INCIDENT_URGENCIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const INCIDENT_STATUSES = ['REPORTED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
const IMPUTATION_TYPES = ['SYNDICATE_BUDGET', 'INSURANCE', 'LOT_OWNER', 'THIRD_PARTY'];

function getImputationTypeLabel(type: string): string {
  switch (type) {
    case 'SYNDICATE_BUDGET':
      return t('Budget syndic');
    case 'INSURANCE':
      return t('Assurance');
    case 'LOT_OWNER':
      return t('Lot propriétaire');
    case 'THIRD_PARTY':
      return t('Tiers');
    default:
      return type;
  }
}

/** Délai de la recherche de contacts côté serveur (frappe au clavier). */
const CONTACT_SEARCH_DEBOUNCE_MS = 300;

function contactDisplayName(contact: CrmContact): string {
  const name = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
  const label = name || contact.legalName || contact.email || contact.id;
  return contact.email ? `${label} (${contact.email})` : label;
}

/** Un profil locataire est « actuel » s'il est marqué ainsi et que sa fin est vide ou à venir. */
function isTenantProfileCurrent(profile: LotTenantProfile): boolean {
  if (!profile.isCurrent) return false;
  return !profile.tenantUntil || dayjs(profile.tenantUntil).isAfter(dayjs());
}

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
  // Lots dont les parts totalisent moins de 100 % : calculé par l'API sur tous les profils.
  const [incompleteShares, setIncompleteShares] = useState<IncompleteOwnerShares[]>([]);
  const [tenantProfiles, setTenantProfiles] = useState<LotTenantProfile[]>([]);
  const [incidents, setIncidents] = useState<SyndicateIncident[]>([]);
  const [lots, setLots] = useState<SyndicateLot[]>([]);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [providers, setProviders] = useState<ServiceProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  // Soumission du profil propriétaire en cours (anti double clic, voir handleCreateOwner).
  const submittingOwnerRef = useRef(false);
  // Création refusée car le lot a déjà un propriétaire en cours : en attente du choix revente / indivision.
  const [pendingOwner, setPendingOwner] = useState<{ values: any; owners: OpenOwner[] } | null>(null);
  const [assigningProviderIncidentId, setAssigningProviderIncidentId] = useState<string | null>(null);
  // Portail copropriétaire : invitation en cours, résultat affiché, révocation.
  const [invitingProfileId, setInvitingProfileId] = useState<string | null>(null);
  const [revokingProfileId, setRevokingProfileId] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<CoOwnerPortalInvitation | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Création d'un contact depuis un formulaire : le champ d'origine reçoit le contact créé.
  const [createContactFor, setCreateContactFor] = useState<ContactTarget | null>(null);
  const contactSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tous les contacts déjà vus (liste initiale, recherches, créations) : la sélection courante reste affichable.
  const knownContacts = useRef<Record<string, CrmContact>>({});
  const [budgets, setBudgets] = useState<SyndicateBudget[]>([]);
  const [contracts, setContracts] = useState<MaintenanceContract[]>([]);
  const [endingTenantProfileId, setEndingTenantProfileId] = useState<string | null>(null);

  const [openOwner, setOpenOwner] = useState(false);
  const [openTenant, setOpenTenant] = useState(false);
  const [openIncident, setOpenIncident] = useState(false);
  const [openImputation, setOpenImputation] = useState(false);
  const [openEditIncident, setOpenEditIncident] = useState(false);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [editingIncident, setEditingIncident] = useState<SyndicateIncident | null>(null);
  const [editIncidentStatus, setEditIncidentStatus] = useState<string | undefined>(undefined);

  const [ownerForm] = Form.useForm();
  const [tenantForm] = Form.useForm();
  const [incidentForm] = Form.useForm();
  const [imputationForm] = Form.useForm();
  const [editIncidentForm] = Form.useForm();

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
        listLotOwnerProfilesWithSummary(effectiveTenantId, syndicId),
        listLotTenantProfiles(effectiveTenantId, syndicId),
        listSyndicIncidents(effectiveTenantId, syndicId)
      ]);
      const [lotsData, contactsData, propertiesData, providersData] = await Promise.all([
        listSyndicateLots(effectiveTenantId, syndicId),
        listContacts(effectiveTenantId, { page: 1, limit: 200 }),
        listProperties(effectiveTenantId, { page: 1, limit: 1000 }),
        listProvidersContracts(effectiveTenantId, syndicId)
      ]);
      setOwnerProfiles(owners.items);
      setIncompleteShares(owners.incompleteLots);
      setTenantProfiles(tenants);
      setIncidents(incidentsData);
      setLots(lotsData);
      rememberContacts(contactsData.contacts || []);
      setContacts(contactsData.contacts || []);
      setProperties(propertiesData.properties || []);
      setProviders(providersData.providers || []);
    } catch (err: any) {
      setError(err.response?.data?.error || t('Impossible de charger profils et incidents'));
    } finally {
      setLoading(false);
    }
  };

  const rememberContacts = (list: CrmContact[]) => {
    for (const contact of list) knownContacts.current[contact.id] = contact;
  };

  const formForTarget = (target: ContactTarget) =>
    target === 'owner' ? ownerForm : target === 'tenant' ? tenantForm : incidentForm;

  /** Contacts actuellement sélectionnés dans les trois formulaires : à conserver dans les options. */
  const selectedContacts = (): CrmContact[] => {
    const ids = [
      ownerForm.getFieldValue('contactId'),
      tenantForm.getFieldValue('contactId'),
      incidentForm.getFieldValue('reportedByContactId')
    ];
    return ids.map(id => (id ? knownContacts.current[id] : undefined)).filter((c): c is CrmContact => Boolean(c));
  };

  // Recherche côté serveur (au-delà des 200 premiers contacts), avec un délai après la frappe.
  const handleContactSearch = (term: string) => {
    if (contactSearchTimer.current) clearTimeout(contactSearchTimer.current);
    if (!effectiveTenantId) return;
    contactSearchTimer.current = setTimeout(() => {
      const search = term.trim();
      listContacts(effectiveTenantId, { page: 1, limit: 200, ...(search ? { search } : {}) })
        .then(result => {
          const found = result.contacts || [];
          rememberContacts(found);
          const merged = [...selectedContacts(), ...found];
          setContacts(merged.filter((contact, index) => merged.findIndex(c => c.id === contact.id) === index));
        })
        .catch(() => message.error(t('Recherche de contacts impossible')));
    }, CONTACT_SEARCH_DEBOUNCE_MS);
  };

  const handleCreateContact = async (data: CreateCrmContactRequest | UpdateCrmContactRequest) => {
    if (!effectiveTenantId || !createContactFor) return;
    const created = (await createContact(effectiveTenantId, data as CreateCrmContactRequest)).data;
    rememberContacts([created]);
    setContacts(previous => [created, ...previous.filter(contact => contact.id !== created.id)]);
    formForTarget(createContactFor).setFieldsValue({
      [createContactFor === 'incident' ? 'reportedByContactId' : 'contactId']: created.id
    });
    message.success(t('Contact créé'));
    setCreateContactFor(null);
  };

  /** Champ contact : recherche serveur, création à la volée (bouton voisin et liste vide). */
  const renderContactSelect = (target: ContactTarget) => (
    <Space.Compact style={{ width: '100%' }}>
      <Select
        style={{ width: '100%' }}
        showSearch
        filterOption={false}
        onSearch={handleContactSearch}
        options={contacts.map(contact => ({ value: contact.id, label: contactDisplayName(contact) }))}
        notFoundContent={
          <Button type="link" icon={<UserAddOutlined />} onClick={() => setCreateContactFor(target)}>
            {t('Créer un contact')}
          </Button>
        }
      />
      <Button icon={<UserAddOutlined />} onClick={() => setCreateContactFor(target)}>
        {t('Créer un contact')}
      </Button>
    </Space.Compact>
  );

  const handleCreateOwner = async () => {
    // Garde-fou anti double clic : la validation étant asynchrone, un second clic
    // ne voit pas encore `submitting` à true ; la ref, elle, l'est immédiatement.
    if (!effectiveTenantId || !syndicId || submittingOwnerRef.current) return;
    submittingOwnerRef.current = true;
    setSubmitting(true);
    try {
      // Champs invalides : AntD affiche les erreurs sous les champs, rien n'est envoyé.
      const values = await ownerForm.validateFields().catch(() => null);
      if (!values) return;
      await submitOwner(values);
    } finally {
      submittingOwnerRef.current = false;
      setSubmitting(false);
    }
  };

  // Envoie la création ; `previousOwnersHandling` n'est posé qu'après le choix de l'utilisateur
  // dans la modale « propriétaire en cours ».
  const submitOwner = async (values: any, previousOwnersHandling?: 'CLOSE' | 'KEEP') => {
    if (!effectiveTenantId || !syndicId) return;
    try {
      await createLotOwnerProfile(effectiveTenantId, syndicId, {
        lotId: values.lotId,
        contactId: values.contactId,
        ownershipPercentage: values.ownershipPercentage,
        ownedSince: new Date(values.ownedSince).toISOString(),
        portalAccessEnabled: values.portalAccessEnabled || false,
        ...(previousOwnersHandling ? { previousOwnersHandling } : {})
      });
      message.success(t('Profil propriétaire créé'));
      setOpenOwner(false);
      ownerForm.resetFields();
      await loadData();
    } catch (err: any) {
      const openOwners = extractOpenOwners(err);
      if (openOwners) {
        setPendingOwner({ values, owners: openOwners });
        return;
      }
      // Parts au-delà de 100 % (409) : le message chiffré est reporté sous le champ fautif.
      const shareError = (err.response?.data?.errors as Array<{ field: string; message: string }> | undefined)?.find(
        fieldErr => fieldErr.field === 'ownershipPercentage'
      );
      if (shareError) ownerForm.setFields([{ name: 'ownershipPercentage', errors: [shareError.message] }]);
      message.error(err.response?.data?.error || t('Création profil propriétaire impossible'));
    }
  };

  const resolveOpenOwners = async (handling: 'CLOSE' | 'KEEP') => {
    if (!pendingOwner || submittingOwnerRef.current) return;
    submittingOwnerRef.current = true;
    setSubmitting(true);
    const { values } = pendingOwner;
    setPendingOwner(null);
    try {
      await submitOwner(values, handling);
    } finally {
      submittingOwnerRef.current = false;
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

  // Postes de budget et contrats de la copropriété, chargés à l'ouverture de la modale d'imputation.
  const loadImputationOptions = async () => {
    if (!effectiveTenantId || !syndicId) return;
    try {
      const [budgetsData, contractsData] = await Promise.all([
        listBudgets(effectiveTenantId, syndicId),
        listContracts(effectiveTenantId, syndicId)
      ]);
      setBudgets(budgetsData);
      setContracts(contractsData);
    } catch {
      message.error(t('Chargement des budgets et contrats impossible'));
    }
  };

  const budgetLineOptions = budgets
    .filter(budget => (budget.lines || []).length > 0)
    .map(budget => ({
      label: `${budget.label} (${budget.fiscalYear})`,
      options: (budget.lines || []).map((line: BudgetLineItem) => ({
        value: line.id,
        label: line.description ? `${line.category} — ${line.description}` : line.category
      }))
    }));

  const handleCreateImputation = async () => {
    if (!effectiveTenantId || !syndicId || !selectedIncidentId) return;
    const values = await imputationForm.validateFields();
    setSubmitting(true);
    try {
      await createIncidentImputation(effectiveTenantId, syndicId, selectedIncidentId, {
        imputationType: values.imputationType,
        amount: values.amount,
        currency: values.currency || 'XOF',
        budgetLineId: values.budgetLineId || undefined,
        contractId: values.contractId || undefined,
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
   * « Modifier l'incident » (écart recette #2, FR-010) : la colonne Statut
   * était un simple Tag en lecture seule, sans aucun moyen de faire avancer
   * l'incident (En cours → Résolu → Clôturé). La modale réutilise
   * `updateSyndicIncident`, déjà appelé pour l'assignation de prestataire.
   */
  const openEditIncidentModal = (incident: SyndicateIncident) => {
    setEditingIncident(incident);
    setEditIncidentStatus(incident.status);
    editIncidentForm.setFieldsValue({
      status: incident.status,
      providerId: incident.providerId || undefined,
      description: incident.description,
      resolvedAt: incident.resolvedAt ? dayjs(incident.resolvedAt) : undefined
    });
    setOpenEditIncident(true);
  };

  const handleUpdateIncident = async () => {
    if (!effectiveTenantId || !syndicId || !editingIncident) return;
    const values = await editIncidentForm.validateFields();
    const becomesResolvedOrClosed = values.status === 'RESOLVED' || values.status === 'CLOSED';
    const resolvedAt = values.resolvedAt
      ? values.resolvedAt.toISOString()
      : becomesResolvedOrClosed
        ? new Date().toISOString()
        : undefined;

    const payload: Partial<SyndicateIncident> = {};
    if (values.status !== editingIncident.status) payload.status = values.status;
    if ((values.providerId || null) !== (editingIncident.providerId || null)) {
      payload.providerId = values.providerId || null;
    }
    if (values.description !== editingIncident.description) payload.description = values.description;
    if (becomesResolvedOrClosed && resolvedAt && resolvedAt !== editingIncident.resolvedAt) {
      payload.resolvedAt = resolvedAt;
    }

    setSubmitting(true);
    try {
      await updateSyndicIncident(effectiveTenantId, syndicId, editingIncident.id, payload);
      message.success(t('Incident mis à jour'));
      setOpenEditIncident(false);
      setEditingIncident(null);
      editIncidentForm.resetFields();
      await loadData();
    } catch (err) {
      message.error(apiErrorMessage(err, t('Mise à jour de l’incident impossible')));
    } finally {
      setSubmitting(false);
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

  // Fin d'un profil locataire : sortie à la date du jour, l'historique est conservé.
  const handleEndTenantProfile = async (profile: LotTenantProfile) => {
    if (!effectiveTenantId || !syndicId) return;
    setEndingTenantProfileId(profile.id);
    try {
      await updateLotTenantProfile(effectiveTenantId, syndicId, profile.id, {
        isCurrent: false,
        tenantUntil: new Date().toISOString()
      });
      message.success(t('Profil locataire terminé'));
      await loadData();
    } catch (err) {
      message.error(apiErrorMessage(err, t('Fin du profil locataire impossible')));
    } finally {
      setEndingTenantProfileId(null);
    }
  };

  const confirmEndTenantProfile = (profile: LotTenantProfile) => {
    modal.confirm({
      title: t("Mettre fin à ce profil locataire à la date d'aujourd'hui ?"),
      okText: t('Terminer'),
      cancelText: t('Annuler'),
      onOk: () => handleEndTenantProfile(profile)
    });
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
              {incompleteShares.length > 0 ? (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message={t('Quotes-parts incomplètes')}
                  description={incompleteShares
                    .map(item =>
                      t('Lot {{lot}} : {{percentage}} % attribués', {
                        lot: item.lotNumber,
                        percentage: item.totalPercentage
                      })
                    )
                    .join(' ; ')}
                />
              ) : null}
              <Table
                exportFilename={t('Profils propriétaires')}
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
                    render: (value: string) => dayjs(value).format(dateFormat('short'))
                  },
                  {
                    title: t('Portail'),
                    render: (_, row) =>
                      row.portalAccessEnabled ? <Tag color="green">{t('Actif')}</Tag> : <Tag>{t('Inactif')}</Tag>
                  },
                  {
                    title: t('Accès portail'),
                    key: 'portal-actions',
                    exportable: false,
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
                exportFilename={t('Profils locataires')}
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
                    render: (value: string) => dayjs(value).format(dateFormat('short'))
                  },
                  {
                    title: t('Facture au locataire'),
                    render: (_, row) => (row.chargesBilledToTenant ? t('Oui') : t('Non'))
                  },
                  {
                    title: t('Statut'),
                    key: 'status',
                    render: (_, row) =>
                      isTenantProfileCurrent(row) ? <Tag color="green">{t('Actuel')}</Tag> : <Tag>{t('Terminé')}</Tag>
                  },
                  {
                    title: t('Actions'),
                    key: 'tenant-actions',
                    exportable: false,
                    render: (_, row) =>
                      isTenantProfileCurrent(row) ? (
                        <Button
                          size="small"
                          loading={endingTenantProfileId === row.id}
                          onClick={() => confirmEndTenantProfile(row)}
                        >
                          {t('Terminer')}
                        </Button>
                      ) : null
                  }
                ]}
              />
            </Card>

            <Card title={t('Incidents et imputations')}>
              <Table
                exportFilename={t('Incidents et imputations')}
                scroll={{ x: 1000 }}
                rowKey="id"
                dataSource={incidents}
                pagination={{ pageSize: 8 }}
                expandable={{
                  expandedRowRender: incident => (
                    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                      <Table
                        // Sous-tableau d'une ligne dépliée : pas d'export propre.
                        exportable={false}
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
                            render: (value: string) => getImputationTypeLabel(value)
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
                            render: (value: string) => dayjs(value).format(dateFormat('dateTime'))
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
                    width: 100,
                    render: (value: string) => getIncidentTypeLabel(value)
                  },
                  {
                    title: t('Urgence'),
                    dataIndex: 'urgency',
                    width: 90,
                    render: (value: string) => getIncidentUrgencyLabel(value)
                  },
                  {
                    title: t('Description'),
                    dataIndex: 'description',
                    // Texte complet, retourné à la ligne : sans largeur fixe, le
                    // tableau l'étalerait sur une seule ligne. 240 px laissent
                    // Statut, Prestataire et Actions visibles sans défilement
                    // horizontal sur un écran de portable.
                    width: 240,
                    render: (value: string) => (
                      <div style={{ width: 240, maxWidth: '100%', whiteSpace: 'normal' }}>{value}</div>
                    )
                  },
                  {
                    title: t('Statut'),
                    dataIndex: 'status',
                    width: 110,
                    render: (value: string) => (
                      <Tag color={incidentStatusColors[value] || 'default'}>{getIncidentStatusLabel(value)}</Tag>
                    )
                  },
                  {
                    title: t('Imputations'),
                    width: 100,
                    render: (_, row) => (
                      <Tag color={(row.imputations?.length || 0) > 0 ? 'blue' : 'default'}>
                        {row.imputations?.length || 0}
                      </Tag>
                    )
                  },
                  {
                    title: t('Prestataire'),
                    key: 'providerId',
                    width: 200,
                    // Le rendu est un sélecteur : on exporte le nom du prestataire assigné.
                    exportValue: (row: SyndicateIncident) =>
                      providers.find(provider => provider.id === row.providerId)?.name ?? '',
                    render: (_, row) => (
                      <Select
                        allowClear
                        showSearch
                        style={{ minWidth: 180 }}
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
                    title: t('Actions'),
                    key: 'actions',
                    fixed: 'right',
                    width: 220,
                    render: (_, row) => (
                      <Space wrap>
                        <Button size="small" icon={<EditOutlined />} onClick={() => openEditIncidentModal(row)}>
                          {t("Modifier l'incident")}
                        </Button>
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
                            void loadImputationOptions();
                          }}
                        >
                          {t('Ajouter imputation')}
                        </Button>
                      </Space>
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
        afterClose={() => ownerForm.resetFields()}
        onOk={() => void handleCreateOwner()}
        confirmLoading={submitting}
      >
        <Form
          form={ownerForm}
          layout="vertical"
          initialValues={{ ownershipPercentage: 100, portalAccessEnabled: false }}
          onValuesChange={changed => {
            // L'erreur de dépassement posée par le serveur ne vaut que pour la valeur envoyée.
            if (changed.ownershipPercentage !== undefined) {
              ownerForm.setFields([{ name: 'ownershipPercentage', errors: [] }]);
            }
          }}
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
            {renderContactSelect('owner')}
          </Form.Item>
          <Form.Item label={t('Part de propriete (%)')} name="ownershipPercentage" rules={[{ required: true }]}>
            <InputNumber min={0.01} max={100} step={0.01} style={{ width: '100%' }} />
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
        title={t('Ce lot a déjà un propriétaire en cours')}
        open={pendingOwner !== null}
        onCancel={() => setPendingOwner(null)}
        cancelText={t('Annuler')}
        okButtonProps={{ style: { display: 'none' } }}
      >
        {pendingOwner ? (
          <div>
            <Paragraph>{t('Propriétaire(s) actuel(s) de ce lot :')}</Paragraph>
            <ul>
              {pendingOwner.owners.map((owner, index) => (
                <li key={owner.profileId ?? index}>{owner.contactName}</li>
              ))}
            </ul>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button block type="primary" onClick={() => void resolveOpenOwners('CLOSE')}>
                {t("Revente : clôturer l'ancien propriétaire à la date d'acquisition")}
              </Button>
              <Button block onClick={() => void resolveOpenOwners('KEEP')}>
                {t('Indivision : ils sont propriétaires ensemble')}
              </Button>
            </Space>
          </div>
        ) : null}
      </Modal>

      <Modal
        title={t('Créer un contact')}
        open={createContactFor !== null}
        onCancel={() => setCreateContactFor(null)}
        footer={null}
        width={800}
        destroyOnHidden
      >
        <ContactForm onSubmit={handleCreateContact} onCancel={() => setCreateContactFor(null)} />
      </Modal>

      <Modal
        title={t('Nouveau profil locataire')}
        open={openTenant}
        onCancel={() => setOpenTenant(false)}
        afterClose={() => tenantForm.resetFields()}
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
            {renderContactSelect('tenant')}
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
        afterClose={() => incidentForm.resetFields()}
        onOk={() => void handleCreateIncident()}
        confirmLoading={submitting}
      >
        <Form form={incidentForm} layout="vertical" initialValues={{ incidentType: 'OTHER', urgency: 'MEDIUM' }}>
          <Form.Item
            label={t('Contact declarant')}
            name="reportedByContactId"
            rules={[{ required: true, message: t('Contact obligatoire') }]}
          >
            {renderContactSelect('incident')}
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
              options={INCIDENT_TYPES.map(value => ({ value, label: getIncidentTypeLabel(value) }))}
            />
          </Form.Item>
          <Form.Item label={t('Urgence')} name="urgency" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={INCIDENT_URGENCIES.map(value => ({ value, label: getIncidentUrgencyLabel(value) }))}
            />
          </Form.Item>
          <Form.Item label={t('Description')} name="description" rules={[{ required: true }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t("Modifier l'incident")}
        open={openEditIncident}
        onCancel={() => {
          setOpenEditIncident(false);
          setEditingIncident(null);
          editIncidentForm.resetFields();
        }}
        onOk={() => void handleUpdateIncident()}
        okText={t('Enregistrer')}
        confirmLoading={submitting}
      >
        <Form
          form={editIncidentForm}
          layout="vertical"
          onValuesChange={changed => {
            if (changed.status !== undefined) setEditIncidentStatus(changed.status);
          }}
        >
          <Form.Item label={t('Statut')} name="status" rules={[{ required: true, message: t('Statut obligatoire') }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={INCIDENT_STATUSES.map(value => ({ value, label: getIncidentStatusLabel(value) }))}
            />
          </Form.Item>
          <Form.Item label={t('Prestataire')} name="providerId">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder={t('Aucun prestataire')}
              options={providers.map(provider => ({ value: provider.id, label: provider.name }))}
            />
          </Form.Item>
          <Form.Item
            label={t('Description')}
            name="description"
            rules={[{ required: true, message: t('Description obligatoire') }]}
          >
            <Input.TextArea rows={3} />
          </Form.Item>
          {editIncidentStatus === 'RESOLVED' || editIncidentStatus === 'CLOSED' ? (
            <Form.Item label={t('Date de résolution')} name="resolvedAt">
              <DatePicker style={{ width: '100%' }} format={dateFormat('short')} />
            </Form.Item>
          ) : null}
        </Form>
      </Modal>

      <Modal
        title={t('Imputation d incident')}
        open={openImputation}
        onCancel={() => setOpenImputation(false)}
        afterClose={() => imputationForm.resetFields()}
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
              options={IMPUTATION_TYPES.map(value => ({ value, label: getImputationTypeLabel(value) }))}
            />
          </Form.Item>
          <Form.Item label={t('Montant')} name="amount" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          {/* L'API attend le code ISO XOF ; l'écran affiche le libellé usuel FCFA. */}
          <Form.Item label={t('Devise')}>
            <Input value="FCFA" readOnly disabled />
          </Form.Item>
          <Form.Item label={t('Poste de budget (optionnel)')} name="budgetLineId">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder={t('Aucun poste de budget')}
              options={budgetLineOptions}
            />
          </Form.Item>
          <Form.Item label={t('Contrat (optionnel)')} name="contractId">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder={t('Aucun contrat')}
              options={contracts.map(contract => ({
                value: contract.id,
                label: contract.provider?.name ? `${contract.nature} — ${contract.provider.name}` : contract.nature
              }))}
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
          <Form.Item label={t('Notes')} name="notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};
