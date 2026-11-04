import React, { useMemo, useRef, useState } from 'react';
import { App, Button, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Alert, Tabs, Typography } from 'antd';
import { PlusOutlined, UserAddOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
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
import { useTabParam } from '../../components/syndics/finances/url-params';
import { IncidentsTab } from '../../components/syndics/profiles/IncidentsTab';
import { OwnerProfilesTab } from '../../components/syndics/profiles/OwnerProfilesTab';
import { TenantProfilesTab } from '../../components/syndics/profiles/TenantProfilesTab';
import {
  contactDisplayName,
  getImputationTypeLabel,
  getIncidentStatusLabel,
  getIncidentTypeLabel,
  getIncidentUrgencyLabel,
  getLotOptionLabel,
  IMPUTATION_TYPES,
  INCIDENT_STATUSES,
  INCIDENT_TYPES,
  INCIDENT_URGENCIES,
  profileContactName
} from '../../components/syndics/profiles/profile-labels';
import { profileKeys } from '../../components/syndics/profiles/query-keys';
import {
  BudgetLineItem,
  CoOwnerPortalInvitation,
  IncompleteOwnerShares,
  LotOwnerProfile,
  LotTenantProfile,
  MaintenanceContract,
  SyndicateBudget,
  SyndicateIncident,
  SyndicateLot
} from '../../types/syndic-types';
import type { ServiceProvider } from '../../types/syndic-types';
import type { Property } from '../../types/property-types';
import { useSyndicRouteContext } from './useSyndicRouteContext';
import { CreateCrmContactRequest, CrmContact, UpdateCrmContactRequest } from '../../types/crm-types';
import { STALE_TIME } from '../../lib/query-keys';
import { t } from '../../i18n/t';
import { dateFormat } from '../../i18n/format';

const { Paragraph, Title } = Typography;

/** Onglets de l'écran, dans l'ordre d'affichage (le premier est le défaut de `?tab=`). */
const PROFILE_TABS = ['proprietaires', 'locataires', 'incidents'] as const;
type ProfileTab = (typeof PROFILE_TABS)[number];

// Références stables : une liste absente ne doit pas recréer un tableau à chaque rendu (mémoïsation des onglets).
const NO_LOTS: SyndicateLot[] = [];
const NO_PROPERTIES: Property[] = [];
const NO_PROVIDERS: ServiceProvider[] = [];
const NO_OWNERS: LotOwnerProfile[] = [];
const NO_TENANTS: LotTenantProfile[] = [];
const NO_INCIDENTS: SyndicateIncident[] = [];
const NO_INCOMPLETE: IncompleteOwnerShares[] = [];

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

/** Délai de la recherche de contacts côté serveur (frappe au clavier). */
const CONTACT_SEARCH_DEBOUNCE_MS = 300;

/** Message d'erreur de l'API : `message` (erreurs typées), à défaut `error`, sinon le repli. */
function apiErrorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { message?: string; error?: string } } } | null)?.response?.data;
  return data?.message || data?.error || fallback;
}

function contactLabel(profile: LotOwnerProfile): string {
  return profileContactName(profile.contact, profile.contactId);
}

/**
 * Profils lot et incidents d'une copropriété : trois onglets paresseux
 * (`?tab=`), chacun avec sa barre de recherche (préfixes d'URL po, pl, in).
 * Une liste n'est demandée qu'à l'affichage de son onglet ; les lots et les
 * biens (libellés de lot) se chargent une fois pour tous les onglets, les
 * contacts à l'ouverture d'un formulaire, les prestataires avec l'onglet
 * Incidents, les budgets et contrats à l'ouverture de la modale d'imputation.
 */
export const SyndicProfilesIncidents: React.FC = () => {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();

  const { tenantId: effectiveTenantId, syndicId } = useSyndicRouteContext();
  const [activeTab, setActiveTab] = useTabParam<ProfileTab>(PROFILE_TABS, 'proprietaires');

  const ready = Boolean(effectiveTenantId && syndicId);
  const tenantKey = effectiveTenantId ?? '';
  const syndicKey = syndicId ?? '';

  // Une requête par onglet, lancée seulement quand l'onglet est affiché.
  const ownersQuery = useQuery({
    queryKey: profileKeys.owners(tenantKey, syndicKey),
    queryFn: () => listLotOwnerProfilesWithSummary(tenantKey, syndicKey),
    enabled: ready && activeTab === 'proprietaires'
  });
  const tenantsQuery = useQuery({
    queryKey: profileKeys.tenants(tenantKey, syndicKey),
    queryFn: () => listLotTenantProfiles(tenantKey, syndicKey),
    enabled: ready && activeTab === 'locataires'
  });
  const incidentsQuery = useQuery({
    queryKey: profileKeys.incidents(tenantKey, syndicKey),
    queryFn: () => listSyndicIncidents(tenantKey, syndicKey),
    enabled: ready && activeTab === 'incidents'
  });
  // Lots et biens : les trois tableaux et les formulaires en tirent leurs libellés de lot.
  const lotsQuery = useQuery({
    queryKey: profileKeys.lots(tenantKey, syndicKey),
    queryFn: () => listSyndicateLots(tenantKey, syndicKey),
    enabled: ready,
    staleTime: STALE_TIME.list
  });
  const propertiesQuery = useQuery({
    queryKey: profileKeys.properties(tenantKey),
    queryFn: async () => (await listProperties(tenantKey, { page: 1, limit: 1000 })).properties || [],
    enabled: ready,
    staleTime: STALE_TIME.list
  });
  // Prestataires : colonne, critère et formulaire de l'onglet Incidents.
  const providersQuery = useQuery({
    queryKey: profileKeys.providers(tenantKey, syndicKey),
    queryFn: async () => (await listProvidersContracts(tenantKey, syndicKey)).providers || [],
    enabled: ready && activeTab === 'incidents',
    staleTime: STALE_TIME.list
  });

  const lots = lotsQuery.data ?? NO_LOTS;
  const properties = propertiesQuery.data ?? NO_PROPERTIES;
  const providers = providersQuery.data ?? NO_PROVIDERS;

  const reload = (list: 'owners' | 'tenants' | 'incidents') =>
    queryClient.invalidateQueries({ queryKey: profileKeys[list](tenantKey, syndicKey) });

  const activeQuery =
    activeTab === 'proprietaires' ? ownersQuery : activeTab === 'locataires' ? tenantsQuery : incidentsQuery;
  const loadError = (activeQuery.error ?? lotsQuery.error) as { response?: { data?: { error?: string } } } | null;
  const error = ready
    ? loadError
      ? loadError.response?.data?.error || t('Impossible de charger profils et incidents')
      : null
    : t('Paramètres profils/incidents manquants');
  const listLoading =
    ready && (activeQuery.isLoading || lotsQuery.isLoading || (activeTab === 'incidents' && providersQuery.isLoading));

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
  // Création d'un contact depuis un formulaire : le champ d'origine reçoit le contact créé.
  const [createContactFor, setCreateContactFor] = useState<ContactTarget | null>(null);
  const contactSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tous les contacts déjà vus (liste initiale, recherches, créations) : la sélection courante reste affichable.
  const knownContacts = useRef<Record<string, CrmContact>>({});
  // Contacts des formulaires : chargés à la première ouverture d'un formulaire, pas au montage de la page.
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const contactsRequested = useRef(false);
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

  // Charge les contacts des formulaires une seule fois, à la première ouverture d'un formulaire.
  const ensureContacts = async () => {
    if (!effectiveTenantId || contactsRequested.current) return;
    contactsRequested.current = true;
    try {
      const contactsData = await listContacts(effectiveTenantId, { page: 1, limit: 200 });
      const found = contactsData.contacts || [];
      rememberContacts(found);
      // Les contacts déjà présents (créés ou recherchés entre-temps) restent en tête.
      setContacts(previous => {
        const merged = [...previous, ...found];
        return merged.filter((contact, index) => merged.findIndex(c => c.id === contact.id) === index);
      });
    } catch {
      contactsRequested.current = false;
      message.error(t('Recherche de contacts impossible'));
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
      await reload('owners');
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
      await reload('tenants');
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
      await reload('incidents');
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
      message.success(t('Imputation enregistrée'));
      setOpenImputation(false);
      setSelectedIncidentId(null);
      imputationForm.resetFields();
      await reload('incidents');
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
      await reload('incidents');
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
      await reload('incidents');
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
      await reload('owners');
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
      await reload('owners');
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
      await reload('tenants');
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

  // Ouverture de la modale d'imputation depuis une ligne d'incident.
  const openImputationModal = (incident: SyndicateIncident) => {
    setSelectedIncidentId(incident.id);
    // Le lot de l'incident est pré-rempli, mais reste modifiable :
    // main permet d'imputer un incident des parties communes à un
    // lot précis.
    imputationForm.resetFields();
    imputationForm.setFieldsValue({ lotId: incident.lotId || undefined });
    setOpenImputation(true);
    void loadImputationOptions();
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
            <Button
              icon={<PlusOutlined />}
              onClick={() => {
                setOpenOwner(true);
                void ensureContacts();
              }}
            >
              {t('Profil propriétaire')}
            </Button>
            <Button
              icon={<PlusOutlined />}
              onClick={() => {
                setOpenTenant(true);
                void ensureContacts();
              }}
            >
              {t('Profil locataire')}
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setOpenIncident(true);
                void ensureContacts();
              }}
            >
              {t('Nouvel incident')}
            </Button>
          </Space>
        </div>

        {error ? <Alert type="error" message={error} showIcon /> : null}

        <Tabs
          activeKey={activeTab}
          onChange={key => setActiveTab(key as ProfileTab)}
          destroyOnHidden
          items={[
            {
              key: 'proprietaires',
              label: t('Profils propriétaires'),
              children: ready ? (
                <OwnerProfilesTab
                  items={ownersQuery.data?.items ?? NO_OWNERS}
                  incompleteShares={ownersQuery.data?.incompleteLots ?? NO_INCOMPLETE}
                  loading={listLoading}
                  lots={lots}
                  lotsById={lotsById}
                  propertiesByInternalReference={propertiesByInternalReference}
                  invitingProfileId={invitingProfileId}
                  revokingProfileId={revokingProfileId}
                  onInvite={profile => void handleInvite(profile)}
                  onRevoke={confirmRevoke}
                />
              ) : null
            },
            {
              key: 'locataires',
              label: t('Profils locataires'),
              children: ready ? (
                <TenantProfilesTab
                  items={tenantsQuery.data ?? NO_TENANTS}
                  loading={listLoading}
                  lots={lots}
                  lotsById={lotsById}
                  propertiesByInternalReference={propertiesByInternalReference}
                  endingTenantProfileId={endingTenantProfileId}
                  onEnd={confirmEndTenantProfile}
                />
              ) : null
            },
            {
              key: 'incidents',
              label: t('Incidents et imputations'),
              children: ready ? (
                <IncidentsTab
                  tenantId={tenantKey}
                  syndicId={syndicKey}
                  items={incidentsQuery.data ?? NO_INCIDENTS}
                  loading={listLoading}
                  lots={lots}
                  lotsById={lotsById}
                  propertiesByInternalReference={propertiesByInternalReference}
                  providers={providers}
                  assigningProviderIncidentId={assigningProviderIncidentId}
                  onAssignProvider={(incidentId, providerId) => void handleAssignProvider(incidentId, providerId)}
                  onEdit={openEditIncidentModal}
                  onAddImputation={openImputationModal}
                />
              ) : null
            }
          ]}
        />
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
          <Form.Item label={t('Part de propriété (%)')} name="ownershipPercentage" rules={[{ required: true }]}>
            <InputNumber min={0.01} max={100} step={0.01} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label={t('Date de début')} name="ownedSince" rules={[{ required: true }]}>
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
          <Form.Item label={t('Charges facturées au locataire')} name="chargesBilledToTenant">
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
            label={t('Contact déclarant')}
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
        title={t("Imputation d'incident")}
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
