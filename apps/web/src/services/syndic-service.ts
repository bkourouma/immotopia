import apiClient from '../utils/api-client';
import { filenameFromDisposition } from '../utils/save-blob';
import { API_URL } from '../config/api';
import type {
  LiveMeetingAdminView,
  ManagerDiscussionMessageView,
  ManagerDiscussionView,
  MeetingParticipantView,
  MeetingRecordingView,
  MeetingVisioAdminView,
  ParticipantLink,
  SetBulkAttendanceRequest,
  SetLotAttendanceRequest,
  VisioJoinInfo
} from '../types/syndic-live-types';
import {
  CreateAgendaItemRequest,
  ChargeCall,
  ChargeCallBatch,
  ChargeCallSummary,
  IncompleteOwnerShares,
  ChartOfAccount,
  CreateBudgetRequest,
  CreateIncidentImputationRequest,
  CreateLotOwnerProfileRequest,
  CreateLotTenantProfileRequest,
  CreateSyndicateIncidentRequest,
  CreateChargeCallBatchRequest,
  CreateAccountingJournalRequest,
  CreateChartOfAccountRequest,
  GenerateBudgetChargeCallsRequest,
  CreateJournalEntryRequest,
  CreateLatePenaltyRequest,
  CreateMaintenanceContractRequest,
  CreateMeetingRequest,
  CreateMeetingProxyRequest,
  CreateManualReminderRequest,
  CreatePaymentScheduleRequest,
  CreateResolutionRequest,
  CreateSyndicateDocumentRequest,
  UpdateSyndicateDocumentRequest,
  FinanceSummary,
  CreateOwnerAccountAdjustmentRequest,
  CreateChargeCallRequest,
  CreateChargeCallResult,
  CreateLotTenantAssignmentRequest,
  CreateChargePaymentRequest,
  LatePaymentPenalty,
  ListWithPaginationQuery,
  OwnerAccount,
  OwnerAccountTransaction,
  AccountingJournal,
  JournalEntry,
  OverdueDashboard,
  PaymentReminder,
  PaymentSchedule,
  ReminderBatchResult,
  CreateServiceProviderRequest,
  UpdateServiceProviderRequest,
  ServiceProvider,
  CreateSyndicateLotRequest,
  CreateSyndicateRequest,
  UpdateSyndicateRequest,
  GeneralMeeting,
  MeetingConvocationResult,
  MeetingProxy,
  MeetingStatus,
  MaintenanceContract,
  SyndicProvidersPayload,
  SyndicateDocument,
  Syndicate,
  SyndicateLot,
  UpdateMeetingRequest,
  UpdateAgendaItemRequest,
  UpdateSyndicateLotRequest,
  ImportLotsFromPropertiesResult,
  WaivePenaltyRequest,
  TrialBalance,
  BudgetAllocation,
  SyndicateBudget,
  UpdateBudgetRequest,
  IncidentCostImputation,
  LotOwnerProfile,
  CoOwnerPortalInvitation,
  CoOwnerPortalRevocation,
  LotTenantProfile,
  SyndicateIncident,
  SyndicateFund,
  CreateSyndicateFundRequest,
  RenameSyndicateFundRequest,
  AdjustSyndicateFundBalanceRequest,
  AssignFundRequest
} from '../types/syndic-types';

/**
 * Toutes les copropriétés de l'agence, toutes pages confondues.
 *
 * `GET .../syndics` pagine par défaut (20 par page) : une agence avec plus de
 * 20 copropriétés ne voyait que les premières dans la liste et le sélecteur
 * « Changer de copropriété ». Cette fonction tourne les pages (100 par appel,
 * le maximum accepté par l'API) jusqu'à épuisement.
 *
 * Garde-fous : arrêt au-delà de 50 pages (5000 copropriétés couvrent tout
 * usage réel), si une page revient vide, ou si `pagination` est absente de la
 * réponse — compat avec une API plus ancienne qui ne renvoyait que `data`
 * sans pagination, auquel cas ce premier lot est déjà la liste complète.
 */
export async function listSyndicates(tenantId: string): Promise<Syndicate[]> {
  const limit = 100;
  let page = 1;
  let all: Syndicate[] = [];

  for (let i = 0; i < 50; i += 1) {
    const response = await apiClient.get<{
      success: boolean;
      data: Syndicate[];
      pagination?: { page: number; limit: number; total: number; totalPages: number };
    }>(`/tenants/${tenantId}/syndics`, { params: { page, limit } });

    const batch = response.data.data;
    if (batch.length === 0) break;
    all = all.concat(batch);

    const pagination = response.data.pagination;
    if (!pagination || page >= pagination.totalPages) break;
    page += 1;
  }

  return all;
}

export async function getSyndicate(tenantId: string, syndicId: string): Promise<Syndicate> {
  const response = await apiClient.get<{ success: boolean; data: Syndicate }>(
    `/tenants/${tenantId}/syndics/${syndicId}`
  );
  return response.data.data;
}

export async function createSyndicate(tenantId: string, data: CreateSyndicateRequest): Promise<Syndicate> {
  const response = await apiClient.post<{ success: boolean; data: Syndicate }>(`/tenants/${tenantId}/syndics`, data);
  return response.data.data;
}

export async function updateSyndicate(
  tenantId: string,
  syndicId: string,
  data: UpdateSyndicateRequest
): Promise<Syndicate> {
  const payload = {
    name: data.name,
    address: data.address,
    registrationNo: data.registrationNo === '' ? null : data.registrationNo,
    cadastralReference: data.cadastralReference === '' ? null : data.cadastralReference,
    fiscalYear: data.fiscalYear,
    syndicManagerId: data.syndicManagerId === '' ? null : data.syndicManagerId,
    status: data.status,
    ...(data.mandatingAgencyId !== undefined ? { mandatingAgencyId: data.mandatingAgencyId } : {})
  };

  const response = await apiClient.patch<{ success: boolean; data: Syndicate }>(
    `/tenants/${tenantId}/syndics/${syndicId}`,
    payload
  );
  return response.data.data;
}

export async function deleteSyndicate(tenantId: string, syndicId: string): Promise<Syndicate> {
  const response = await apiClient.delete<{ success: boolean; data: Syndicate }>(
    `/tenants/${tenantId}/syndics/${syndicId}`
  );
  return response.data.data;
}

export async function listSyndicateLots(tenantId: string, syndicId: string): Promise<SyndicateLot[]> {
  const response = await apiClient.get<{ success: boolean; data: SyndicateLot[] }>(
    `/tenants/${tenantId}/syndics/${syndicId}/lots`
  );
  return response.data.data;
}

export async function createSyndicateLot(
  tenantId: string,
  syndicId: string,
  data: CreateSyndicateLotRequest
): Promise<SyndicateLot> {
  const payload = {
    propertyId: data.propertyId || undefined,
    coownerId: data.ownerContactId || undefined,
    lotNumber: data.lotNumber,
    lotType: data.lotType,
    tantiemes: data.generalShares,
    // Tantièmes spéciaux saisis, enregistrés tels quels ; vide = aucun.
    specialShares: data.specialShares ?? null,
    ownerSince: data.ownerSince || undefined
  };

  const response = await apiClient.post<{ success: boolean; data: SyndicateLot }>(
    `/tenants/${tenantId}/syndics/${syndicId}/lots`,
    payload
  );
  return response.data.data;
}

export async function updateSyndicateLot(
  tenantId: string,
  syndicId: string,
  lotId: string,
  data: UpdateSyndicateLotRequest
): Promise<SyndicateLot> {
  const payload = {
    propertyId: data.propertyId === '' ? null : data.propertyId,
    coownerId: data.ownerContactId === '' ? null : data.ownerContactId,
    lotNumber: data.lotNumber,
    lotType: data.lotType,
    tantiemes: data.generalShares,
    // `null` efface les tantièmes spéciaux ; `undefined` les laisse inchangés.
    specialShares: data.specialShares,
    ownerSince: data.ownerSince
  };

  const response = await apiClient.patch<{ success: boolean; data: SyndicateLot }>(
    `/tenants/${tenantId}/syndics/${syndicId}/lots/${lotId}`,
    payload
  );
  return response.data.data;
}

/**
 * Supprime un lot sans mouvement. L'API répond 409 (message explicite) s'il a des
 * appels, paiements ou reçus : il faut alors le désactiver (tantièmes à 0).
 */
export async function deleteSyndicateLot(tenantId: string, syndicId: string, lotId: string): Promise<void> {
  await apiClient.delete(`/tenants/${tenantId}/syndics/${syndicId}/lots/${lotId}`);
}

export async function importSyndicateLotsFromProperties(
  tenantId: string,
  syndicId: string,
  propertyIds: string[]
): Promise<ImportLotsFromPropertiesResult> {
  const response = await apiClient.post<{ success: boolean; data: ImportLotsFromPropertiesResult }>(
    `/tenants/${tenantId}/syndics/${syndicId}/lots/import-properties`,
    { propertyIds }
  );
  return response.data.data;
}

export async function addLotTenantAssignment(
  tenantId: string,
  syndicId: string,
  lotId: string,
  data: CreateLotTenantAssignmentRequest
) {
  const response = await apiClient.post<{ success: boolean; data: any }>(
    `/tenants/${tenantId}/syndics/${syndicId}/lots/${lotId}/tenants`,
    data
  );
  return response.data.data;
}

export async function listChargeCalls(
  tenantId: string,
  syndicId: string,
  filters?: { period?: string; status?: string; page?: number; limit?: number }
): Promise<ChargeCall[]> {
  const response = await apiClient.get<{ success: boolean; data: ChargeCall[] }>(
    `/tenants/${tenantId}/syndics/${syndicId}/charges`,
    { params: filters }
  );
  return response.data.data;
}

/**
 * Tous les appels de charges filtrés ET la synthèse (montant appelé, dossiers
 * en attente / en retard) calculée par l'API sur l'ensemble des appels
 * filtrés : les cartes de l'écran ne se déduisent jamais d'une page.
 */
export async function listAllChargeCallsWithSummary(
  tenantId: string,
  syndicId: string,
  filters?: { period?: string; status?: string }
): Promise<{ items: ChargeCall[]; summary: ChargeCallSummary }> {
  const limit = 100;
  let items: ChargeCall[] = [];
  let summary: ChargeCallSummary | null = null;

  for (let page = 1; page <= 50; page += 1) {
    const response = await apiClient.get<{ success: boolean; data: ChargeCall[]; summary?: ChargeCallSummary }>(
      `/tenants/${tenantId}/syndics/${syndicId}/charges`,
      { params: { ...filters, page, limit } }
    );
    items = items.concat(response.data.data);
    summary = summary ?? response.data.summary ?? null;
    if (response.data.data.length < limit) break;
  }

  return {
    items,
    summary: summary ?? { totalCount: items.length, totalAmount: 0, pendingCount: 0, overdueCount: 0 }
  };
}

/**
 * Tous les appels de charges de la copropriété, toutes pages confondues.
 *
 * `GET .../charges` pagine par défaut (20 par page, 100 au maximum) : une
 * copropriété avec plus de 20 appels voyait sa page Finances afficher un total
 * de carte (calculé côté API sans pagination) qui ne correspondait plus à la
 * somme du tableau de détail (limité à la première page). Cette fonction
 * tourne les pages jusqu'à épuisement pour que les deux se recoupent toujours.
 */
export async function listAllChargeCalls(
  tenantId: string,
  syndicId: string,
  filters?: { period?: string; status?: string }
): Promise<ChargeCall[]> {
  const limit = 100;
  let page = 1;
  let all: ChargeCall[] = [];

  // Garde-fou : 50 pages (5000 appels) couvrent tout usage réel et évitent une
  // boucle infinie si l'API venait à renvoyer la page courante indéfiniment.
  for (let i = 0; i < 50; i += 1) {
    const batch = await listChargeCalls(tenantId, syndicId, { ...filters, page, limit });
    all = all.concat(batch);
    if (batch.length < limit) break;
    page += 1;
  }

  return all;
}

export async function createChargeCall(
  tenantId: string,
  syndicId: string,
  data: CreateChargeCallRequest
): Promise<CreateChargeCallResult | ChargeCall> {
  const response = await apiClient.post<{ success: boolean; data: CreateChargeCallResult | ChargeCall }>(
    `/tenants/${tenantId}/syndics/${syndicId}/charges`,
    data
  );
  return response.data.data;
}

export async function recordChargePayment(
  tenantId: string,
  syndicId: string,
  chargeId: string,
  data: CreateChargePaymentRequest
) {
  const response = await apiClient.post(`/tenants/${tenantId}/syndics/${syndicId}/charges/${chargeId}/pay`, data);
  return response.data.data;
}

export async function listMeetings(
  tenantId: string,
  syndicId: string,
  filters?: { status?: string }
): Promise<GeneralMeeting[]> {
  const response = await apiClient.get<{ success: boolean; data: GeneralMeeting[] }>(
    `/tenants/${tenantId}/syndics/${syndicId}/assemblees`,
    { params: filters }
  );
  return response.data.data;
}

export async function getMeeting(tenantId: string, syndicId: string, meetingId: string): Promise<GeneralMeeting> {
  const response = await apiClient.get<{ success: boolean; data: GeneralMeeting }>(
    `/tenants/${tenantId}/syndics/${syndicId}/assemblees/${meetingId}`
  );
  return response.data.data;
}

export async function createMeeting(
  tenantId: string,
  syndicId: string,
  data: CreateMeetingRequest
): Promise<GeneralMeeting> {
  const response = await apiClient.post<{ success: boolean; data: GeneralMeeting }>(
    `/tenants/${tenantId}/syndics/${syndicId}/assemblees`,
    data
  );
  return response.data.data;
}

/**
 * Crée l'assemblée. Les convocations partent APRÈS la réponse (`convocationPending`) ;
 * `idempotencyKey` rejoue la même création en cas de réessai (pas de doublon).
 */
export async function createMeetingWithConvocation(
  tenantId: string,
  syndicId: string,
  data: CreateMeetingRequest,
  idempotencyKey?: string
): Promise<{ meeting: GeneralMeeting; convocation: MeetingConvocationResult | null; convocationPending: boolean }> {
  const response = await apiClient.post<{
    success: boolean;
    data: GeneralMeeting;
    convocation?: MeetingConvocationResult | { status: 'SENDING' };
  }>(
    `/tenants/${tenantId}/syndics/${syndicId}/assemblees`,
    data,
    idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : undefined
  );
  const raw = response.data.convocation;
  const convocationPending = !!raw && 'status' in raw && raw.status === 'SENDING';
  return {
    meeting: response.data.data,
    convocation: convocationPending ? null : ((raw as MeetingConvocationResult | undefined) ?? null),
    convocationPending
  };
}

/** Renvoie la convocation d'une assemblée planifiée. */
export async function resendMeetingConvocation(
  tenantId: string,
  syndicId: string,
  meetingId: string
): Promise<MeetingConvocationResult> {
  const response = await apiClient.post<{ success: boolean; convocation: MeetingConvocationResult }>(
    `/tenants/${tenantId}/syndics/${syndicId}/assemblees/${meetingId}/convocation`
  );
  return response.data.convocation;
}

export async function updateMeeting(
  tenantId: string,
  syndicId: string,
  meetingId: string,
  data: UpdateMeetingRequest
): Promise<GeneralMeeting> {
  const response = await apiClient.patch<{ success: boolean; data: GeneralMeeting }>(
    `/tenants/${tenantId}/syndics/${syndicId}/assemblees/${meetingId}`,
    data
  );
  return response.data.data;
}

/** Ouvre, cloture ou annule une AG ; l'API refuse une transition incoherente (409). */
export async function updateMeetingStatus(
  tenantId: string,
  syndicId: string,
  meetingId: string,
  status: MeetingStatus
): Promise<GeneralMeeting> {
  return updateMeeting(tenantId, syndicId, meetingId, { status });
}

export async function listMeetingProxies(
  tenantId: string,
  syndicId: string,
  meetingId: string
): Promise<MeetingProxy[]> {
  const response = await apiClient.get<{ success: boolean; data: MeetingProxy[] }>(
    `/tenants/${tenantId}/syndics/${syndicId}/assemblees/${meetingId}/pouvoirs`
  );
  return response.data.data;
}

export async function createMeetingProxy(
  tenantId: string,
  syndicId: string,
  meetingId: string,
  data: CreateMeetingProxyRequest
): Promise<MeetingProxy> {
  const response = await apiClient.post<{ success: boolean; data: MeetingProxy }>(
    `/tenants/${tenantId}/syndics/${syndicId}/assemblees/${meetingId}/pouvoirs`,
    data
  );
  return response.data.data;
}

export async function deleteMeetingProxy(
  tenantId: string,
  syndicId: string,
  meetingId: string,
  proxyId: string
): Promise<MeetingProxy> {
  const response = await apiClient.delete<{ success: boolean; data: MeetingProxy }>(
    `/tenants/${tenantId}/syndics/${syndicId}/assemblees/${meetingId}/pouvoirs/${proxyId}`
  );
  return response.data.data;
}

export async function addMeetingResolution(
  tenantId: string,
  syndicId: string,
  meetingId: string,
  data: CreateResolutionRequest
) {
  const response = await apiClient.post(
    `/tenants/${tenantId}/syndics/${syndicId}/assemblees/${meetingId}/resolutions`,
    data
  );
  return response.data.data;
}

export async function castResolutionVote(
  tenantId: string,
  syndicId: string,
  meetingId: string,
  resolutionId: string,
  data: { lotId: string; vote: 'FOR' | 'AGAINST' | 'ABSTAIN' }
) {
  const response = await apiClient.post(
    `/tenants/${tenantId}/syndics/${syndicId}/assemblees/${meetingId}/resolutions/${resolutionId}/votes`,
    data
  );
  return response.data.data;
}

export async function addMeetingAgendaItem(
  tenantId: string,
  syndicId: string,
  meetingId: string,
  data: CreateAgendaItemRequest
) {
  const response = await apiClient.post(
    `/tenants/${tenantId}/syndics/${syndicId}/assemblees/${meetingId}/ordre-du-jour`,
    data
  );
  return response.data.data;
}

export async function updateMeetingAgendaItem(
  tenantId: string,
  syndicId: string,
  meetingId: string,
  agendaItemId: string,
  data: UpdateAgendaItemRequest
) {
  const response = await apiClient.patch(
    `/tenants/${tenantId}/syndics/${syndicId}/assemblees/${meetingId}/ordre-du-jour/${agendaItemId}`,
    data
  );
  return response.data.data;
}

export async function deleteMeetingAgendaItem(
  tenantId: string,
  syndicId: string,
  meetingId: string,
  agendaItemId: string
) {
  const response = await apiClient.delete(
    `/tenants/${tenantId}/syndics/${syndicId}/assemblees/${meetingId}/ordre-du-jour/${agendaItemId}`
  );
  return response.data.data;
}

/** Convocation Word d'un lot à l'assemblée (`GET .../assemblees/:meetingId/lots/:lotId/convocation.docx`). */
export async function downloadMeetingConvocationWord(
  tenantId: string,
  syndicId: string,
  meetingId: string,
  lotId: string,
  fallbackName = 'convocation.docx'
): Promise<{ blob: Blob; filename: string }> {
  const response = await apiClient.get<Blob>(
    `/tenants/${tenantId}/syndics/${syndicId}/assemblees/${encodeURIComponent(meetingId)}/lots/${encodeURIComponent(lotId)}/convocation.docx`,
    { responseType: 'blob' }
  );
  return {
    blob: response.data,
    filename: filenameFromDisposition(response.headers?.['content-disposition'], fallbackName)
  };
}

/** Compte rendu Word de l'AG ; le nom vient de `Content-Disposition`, sinon `fallbackName`. */
export async function generateMeetingMinutesDocx(
  tenantId: string,
  syndicId: string,
  meetingId: string,
  fallbackName = 'compte-rendu.docx'
): Promise<{ blob: Blob; filename: string }> {
  const response = await apiClient.post<Blob>(
    `/tenants/${tenantId}/syndics/${syndicId}/assemblees/${meetingId}/compte-rendu`,
    {},
    { responseType: 'blob' }
  );
  return {
    blob: response.data,
    filename: filenameFromDisposition(response.headers?.['content-disposition'], fallbackName)
  };
}

export async function listProvidersContracts(tenantId: string, syndicId: string): Promise<SyndicProvidersPayload> {
  const response = await apiClient.get<{ success: boolean; data: SyndicProvidersPayload }>(
    `/tenants/${tenantId}/syndics/${syndicId}/prestataires`
  );
  return response.data.data;
}

export async function createProvider(
  tenantId: string,
  syndicId: string,
  data: CreateServiceProviderRequest
): Promise<ServiceProvider> {
  const response = await apiClient.post<{ success: boolean; data: ServiceProvider }>(
    `/tenants/${tenantId}/syndics/${syndicId}/prestataires`,
    data
  );
  return response.data.data;
}

export async function updateProvider(
  tenantId: string,
  syndicId: string,
  providerId: string,
  data: UpdateServiceProviderRequest
): Promise<ServiceProvider> {
  const response = await apiClient.patch<{ success: boolean; data: ServiceProvider }>(
    `/tenants/${tenantId}/syndics/${syndicId}/prestataires/${providerId}`,
    data
  );
  return response.data.data;
}

export async function deleteProvider(tenantId: string, syndicId: string, providerId: string): Promise<void> {
  await apiClient.delete(`/tenants/${tenantId}/syndics/${syndicId}/prestataires/${providerId}`);
}

export async function listContracts(
  tenantId: string,
  syndicId: string,
  filters?: { status?: string }
): Promise<MaintenanceContract[]> {
  const response = await apiClient.get<{ success: boolean; data: MaintenanceContract[] }>(
    `/tenants/${tenantId}/syndics/${syndicId}/contrats`,
    { params: filters }
  );
  return response.data.data;
}

export async function createContract(
  tenantId: string,
  syndicId: string,
  data: CreateMaintenanceContractRequest
): Promise<MaintenanceContract> {
  const response = await apiClient.post<{ success: boolean; data: MaintenanceContract }>(
    `/tenants/${tenantId}/syndics/${syndicId}/contrats`,
    data
  );
  return response.data.data;
}

export async function listSyndicDocuments(
  tenantId: string,
  syndicId: string,
  filters?: { type?: string }
): Promise<SyndicateDocument[]> {
  const response = await apiClient.get<{ success: boolean; data: SyndicateDocument[] }>(
    `/tenants/${tenantId}/syndics/${syndicId}/documents`,
    { params: filters }
  );
  return response.data.data;
}

export async function createSyndicDocument(
  tenantId: string,
  syndicId: string,
  data: CreateSyndicateDocumentRequest
): Promise<SyndicateDocument> {
  const formData = new FormData();
  formData.append('title', data.title);
  formData.append('type', data.type);
  formData.append('file', data.file);
  if (data.expiresAt) {
    formData.append('expiresAt', data.expiresAt);
  }
  if (data.visibleToCoOwners !== undefined) {
    formData.append('visibleToCoOwners', String(data.visibleToCoOwners));
  }

  const response = await apiClient.post<{ success: boolean; data: SyndicateDocument }>(
    `/tenants/${tenantId}/syndics/${syndicId}/documents`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    }
  );
  return response.data.data;
}

export async function updateSyndicDocument(
  tenantId: string,
  syndicId: string,
  documentId: string,
  data: UpdateSyndicateDocumentRequest
): Promise<SyndicateDocument> {
  const response = await apiClient.patch<{ success: boolean; data: SyndicateDocument }>(
    `/tenants/${tenantId}/syndics/${syndicId}/documents/${documentId}`,
    data
  );
  return response.data.data;
}

export async function getSyndicFinanceSummary(tenantId: string, syndicId: string): Promise<FinanceSummary> {
  const response = await apiClient.get<{ success: boolean; data: FinanceSummary }>(
    `/tenants/${tenantId}/syndics/${syndicId}/finances`
  );
  return response.data.data;
}

export async function getOverdueDashboard(tenantId: string, syndicId: string): Promise<OverdueDashboard> {
  const response = await apiClient.get<{ success: boolean; data: OverdueDashboard }>(
    `/tenants/${tenantId}/syndics/${syndicId}/retards`
  );
  return response.data.data;
}

export async function listPaymentReminders(
  tenantId: string,
  syndicId: string,
  query?: ListWithPaginationQuery
): Promise<PaymentReminder[]> {
  const response = await apiClient.get<{ success: boolean; data: PaymentReminder[] }>(
    `/tenants/${tenantId}/syndics/${syndicId}/relances`,
    { params: query }
  );
  return response.data.data;
}

export async function createManualReminder(
  tenantId: string,
  syndicId: string,
  chargeId: string,
  data: CreateManualReminderRequest
): Promise<PaymentReminder & { notificationFailed: boolean }> {
  const response = await apiClient.post<{ success: boolean; data: PaymentReminder; notificationFailed?: boolean }>(
    `/tenants/${tenantId}/syndics/${syndicId}/charges/${chargeId}/relance`,
    data
  );
  // La relance est enregistrée même si l'envoi échoue : l'API le signale à part.
  return { ...response.data.data, notificationFailed: response.data.notificationFailed === true };
}

export async function runReminderBatch(tenantId: string, syndicId: string): Promise<ReminderBatchResult> {
  const response = await apiClient.post<{ success: boolean; data: ReminderBatchResult }>(
    `/tenants/${tenantId}/syndics/${syndicId}/relances/batch`,
    {}
  );
  return response.data.data;
}

export async function listLatePaymentPenalties(
  tenantId: string,
  syndicId: string,
  query?: ListWithPaginationQuery
): Promise<LatePaymentPenalty[]> {
  const response = await apiClient.get<{ success: boolean; data: LatePaymentPenalty[] }>(
    `/tenants/${tenantId}/syndics/${syndicId}/penalites`,
    { params: query }
  );
  return response.data.data;
}

export async function createLatePaymentPenalty(
  tenantId: string,
  syndicId: string,
  chargeId: string,
  data: CreateLatePenaltyRequest
): Promise<LatePaymentPenalty> {
  const response = await apiClient.post<{ success: boolean; data: LatePaymentPenalty }>(
    `/tenants/${tenantId}/syndics/${syndicId}/charges/${chargeId}/penalite`,
    data
  );
  return response.data.data;
}

export async function waiveLatePaymentPenalty(
  tenantId: string,
  syndicId: string,
  penaltyId: string,
  data: WaivePenaltyRequest
): Promise<LatePaymentPenalty> {
  const response = await apiClient.patch<{ success: boolean; data: LatePaymentPenalty }>(
    `/tenants/${tenantId}/syndics/${syndicId}/penalites/${penaltyId}/remise`,
    data
  );
  return response.data.data;
}

export async function createPaymentSchedule(
  tenantId: string,
  syndicId: string,
  chargeId: string,
  data: CreatePaymentScheduleRequest
): Promise<PaymentSchedule> {
  const response = await apiClient.post<{ success: boolean; data: PaymentSchedule }>(
    `/tenants/${tenantId}/syndics/${syndicId}/charges/${chargeId}/echeancier`,
    data
  );
  return response.data.data;
}

export async function listPaymentSchedules(
  tenantId: string,
  syndicId: string,
  query?: ListWithPaginationQuery
): Promise<PaymentSchedule[]> {
  const response = await apiClient.get<{ success: boolean; data: PaymentSchedule[] }>(
    `/tenants/${tenantId}/syndics/${syndicId}/echeanciers`,
    { params: query }
  );
  return response.data.data;
}

export async function getLotOwnerAccount(tenantId: string, syndicId: string, lotId: string): Promise<OwnerAccount> {
  const response = await apiClient.get<{ success: boolean; data: OwnerAccount }>(
    `/tenants/${tenantId}/syndics/${syndicId}/lots/${lotId}/compte`
  );
  return response.data.data;
}

export async function listLotOwnerAccountTransactions(
  tenantId: string,
  syndicId: string,
  lotId: string,
  query?: ListWithPaginationQuery & { from?: string; to?: string }
): Promise<OwnerAccountTransaction[]> {
  const response = await apiClient.get<{ success: boolean; data: OwnerAccountTransaction[] }>(
    `/tenants/${tenantId}/syndics/${syndicId}/lots/${lotId}/compte/transactions`,
    { params: query }
  );
  return response.data.data;
}

/**
 * Transactions d'un compte de lot (page demandée) et leur nombre TOTAL, compté
 * par l'API : la carte « Transactions » ne dépend pas de la taille de page.
 */
export async function listLotOwnerAccountTransactionsWithTotal(
  tenantId: string,
  syndicId: string,
  lotId: string,
  query?: ListWithPaginationQuery & { from?: string; to?: string }
): Promise<{ items: OwnerAccountTransaction[]; totalCount: number }> {
  const response = await apiClient.get<{
    success: boolean;
    data: OwnerAccountTransaction[];
    summary?: { totalCount: number };
  }>(`/tenants/${tenantId}/syndics/${syndicId}/lots/${lotId}/compte/transactions`, { params: query });
  return {
    items: response.data.data,
    totalCount: response.data.summary?.totalCount ?? response.data.data.length
  };
}

export async function createLotOwnerAccountAdjustment(
  tenantId: string,
  syndicId: string,
  lotId: string,
  data: CreateOwnerAccountAdjustmentRequest
): Promise<OwnerAccountTransaction> {
  const response = await apiClient.post<{ success: boolean; data: OwnerAccountTransaction }>(
    `/tenants/${tenantId}/syndics/${syndicId}/lots/${lotId}/compte/ajustements`,
    data
  );
  return response.data.data;
}

export async function downloadLotOwnerAccountStatement(
  tenantId: string,
  syndicId: string,
  lotId: string,
  query?: { from?: string; to?: string }
): Promise<Blob> {
  const response = await apiClient.get(`/tenants/${tenantId}/syndics/${syndicId}/lots/${lotId}/compte/releve`, {
    params: query,
    responseType: 'blob'
  });
  return response.data as Blob;
}

export async function listChartOfAccounts(
  tenantId: string,
  syndicId: string,
  query?: { onlyActive?: boolean }
): Promise<ChartOfAccount[]> {
  const response = await apiClient.get<{ success: boolean; data: ChartOfAccount[] }>(
    `/tenants/${tenantId}/syndics/${syndicId}/comptabilite/comptes`,
    { params: query }
  );
  return response.data.data;
}

export async function createChartOfAccount(
  tenantId: string,
  syndicId: string,
  data: CreateChartOfAccountRequest
): Promise<ChartOfAccount> {
  const response = await apiClient.post<{ success: boolean; data: ChartOfAccount }>(
    `/tenants/${tenantId}/syndics/${syndicId}/comptabilite/comptes`,
    data
  );
  return response.data.data;
}

export interface LoadSyndicChartTemplateResult {
  created: number;
  skipped: number;
  total: number;
}

export async function loadSyndicChartTemplate(
  tenantId: string,
  syndicId: string
): Promise<LoadSyndicChartTemplateResult> {
  const response = await apiClient.post<{ success: boolean; data: LoadSyndicChartTemplateResult }>(
    `/tenants/${tenantId}/syndics/${syndicId}/comptabilite/comptes/charger-plan-syscohada`
  );
  return response.data.data;
}

export async function listAccountingJournals(
  tenantId: string,
  syndicId: string,
  query?: { fiscalYear?: number }
): Promise<AccountingJournal[]> {
  const response = await apiClient.get<{ success: boolean; data: AccountingJournal[] }>(
    `/tenants/${tenantId}/syndics/${syndicId}/comptabilite/journaux`,
    { params: query }
  );
  return response.data.data;
}

export async function createAccountingJournal(
  tenantId: string,
  syndicId: string,
  data: CreateAccountingJournalRequest
): Promise<AccountingJournal> {
  const response = await apiClient.post<{ success: boolean; data: AccountingJournal }>(
    `/tenants/${tenantId}/syndics/${syndicId}/comptabilite/journaux`,
    data
  );
  return response.data.data;
}

export async function listAccountingEntries(
  tenantId: string,
  syndicId: string,
  query?: ListWithPaginationQuery & { journalId?: string; from?: string; to?: string }
): Promise<JournalEntry[]> {
  const response = await apiClient.get<{ success: boolean; data: JournalEntry[] }>(
    `/tenants/${tenantId}/syndics/${syndicId}/comptabilite/ecritures`,
    { params: query }
  );
  return response.data.data;
}

export async function createAccountingEntry(
  tenantId: string,
  syndicId: string,
  data: CreateJournalEntryRequest
): Promise<JournalEntry> {
  const response = await apiClient.post<{ success: boolean; data: JournalEntry }>(
    `/tenants/${tenantId}/syndics/${syndicId}/comptabilite/ecritures`,
    data
  );
  return response.data.data;
}

export async function lockAccountingEntry(tenantId: string, syndicId: string, entryId: string): Promise<JournalEntry> {
  const response = await apiClient.patch<{ success: boolean; data: JournalEntry }>(
    `/tenants/${tenantId}/syndics/${syndicId}/comptabilite/ecritures/${entryId}/verrouiller`,
    { lock: true }
  );
  return response.data.data;
}

export async function getTrialBalance(
  tenantId: string,
  syndicId: string,
  query?: { from?: string; to?: string }
): Promise<TrialBalance> {
  const response = await apiClient.get<{ success: boolean; data: TrialBalance }>(
    `/tenants/${tenantId}/syndics/${syndicId}/comptabilite/balance`,
    { params: query }
  );
  return response.data.data;
}

export async function getGeneralLedger(
  tenantId: string,
  syndicId: string,
  query?: ListWithPaginationQuery & { accountId?: string; from?: string; to?: string }
): Promise<any[]> {
  const safeQuery = query
    ? {
        ...query,
        limit: query.limit ? Math.min(query.limit, 100) : query.limit
      }
    : query;

  const response = await apiClient.get<{ success: boolean; data: any[] }>(
    `/tenants/${tenantId}/syndics/${syndicId}/comptabilite/grand-livre`,
    { params: safeQuery }
  );
  return response.data.data;
}

export async function listBudgets(
  tenantId: string,
  syndicId: string,
  query?: { fiscalYear?: number; status?: string }
): Promise<SyndicateBudget[]> {
  const response = await apiClient.get<{ success: boolean; data: SyndicateBudget[] }>(
    `/tenants/${tenantId}/syndics/${syndicId}/budgets`,
    { params: query }
  );
  return response.data.data;
}

export async function createBudget(
  tenantId: string,
  syndicId: string,
  data: CreateBudgetRequest
): Promise<SyndicateBudget> {
  const response = await apiClient.post<{ success: boolean; data: SyndicateBudget }>(
    `/tenants/${tenantId}/syndics/${syndicId}/budgets`,
    data
  );
  return response.data.data;
}

export async function updateBudget(
  tenantId: string,
  syndicId: string,
  budgetId: string,
  data: UpdateBudgetRequest
): Promise<SyndicateBudget> {
  const response = await apiClient.patch<{ success: boolean; data: SyndicateBudget }>(
    `/tenants/${tenantId}/syndics/${syndicId}/budgets/${budgetId}`,
    data
  );
  return response.data.data;
}

export async function recomputeBudgetAllocations(
  tenantId: string,
  syndicId: string,
  budgetId: string
): Promise<BudgetAllocation[]> {
  const response = await apiClient.post<{ success: boolean; data: BudgetAllocation[] }>(
    `/tenants/${tenantId}/syndics/${syndicId}/budgets/${budgetId}/repartition`,
    {}
  );
  return response.data.data;
}

export async function generateBudgetChargeCalls(
  tenantId: string,
  syndicId: string,
  budgetId: string,
  data: GenerateBudgetChargeCallsRequest
): Promise<ChargeCallBatch> {
  const response = await apiClient.post<{ success: boolean; data: ChargeCallBatch }>(
    `/tenants/${tenantId}/syndics/${syndicId}/budgets/${budgetId}/generer-appels`,
    data
  );
  return response.data.data;
}

export async function listChargeCallBatches(
  tenantId: string,
  syndicId: string,
  query?: { status?: string; period?: string }
): Promise<ChargeCallBatch[]> {
  const response = await apiClient.get<{ success: boolean; data: ChargeCallBatch[] }>(
    `/tenants/${tenantId}/syndics/${syndicId}/charges/batch`,
    { params: query }
  );
  return response.data.data;
}

export async function createChargeCallBatch(
  tenantId: string,
  syndicId: string,
  data: CreateChargeCallBatchRequest
): Promise<ChargeCallBatch> {
  const response = await apiClient.post<{ success: boolean; data: ChargeCallBatch }>(
    `/tenants/${tenantId}/syndics/${syndicId}/charges/batch`,
    data
  );
  return response.data.data;
}

export async function listLotOwnerProfiles(
  tenantId: string,
  syndicId: string,
  query?: { lotId?: string }
): Promise<LotOwnerProfile[]> {
  const response = await apiClient.get<{ success: boolean; data: LotOwnerProfile[] }>(
    `/tenants/${tenantId}/syndics/${syndicId}/profils/proprietaires`,
    { params: query }
  );
  return response.data.data;
}

/** Profils propriétaires et lots aux parts incomplètes (agrégat serveur, tous les profils de la copropriété). */
export async function listLotOwnerProfilesWithSummary(
  tenantId: string,
  syndicId: string
): Promise<{ items: LotOwnerProfile[]; incompleteLots: IncompleteOwnerShares[] }> {
  const response = await apiClient.get<{
    success: boolean;
    data: LotOwnerProfile[];
    summary?: { incompleteLots?: IncompleteOwnerShares[] };
  }>(`/tenants/${tenantId}/syndics/${syndicId}/profils/proprietaires`);
  return { items: response.data.data, incompleteLots: response.data.summary?.incompleteLots ?? [] };
}

export async function createLotOwnerProfile(
  tenantId: string,
  syndicId: string,
  data: CreateLotOwnerProfileRequest
): Promise<LotOwnerProfile> {
  const response = await apiClient.post<{ success: boolean; data: LotOwnerProfile }>(
    `/tenants/${tenantId}/syndics/${syndicId}/profils/proprietaires`,
    data
  );
  return response.data.data;
}

export async function updateLotOwnerProfile(
  tenantId: string,
  syndicId: string,
  ownerProfileId: string,
  data: Partial<CreateLotOwnerProfileRequest>
): Promise<LotOwnerProfile> {
  const response = await apiClient.patch<{ success: boolean; data: LotOwnerProfile }>(
    `/tenants/${tenantId}/syndics/${syndicId}/profils/proprietaires/${ownerProfileId}`,
    data
  );
  return response.data.data;
}

/** Ouvre le portail copropriétaire au contact de ce profil ; le lien est rendu que l'e-mail parte ou non. */
export async function inviteCoOwnerToPortal(
  tenantId: string,
  syndicId: string,
  ownerProfileId: string
): Promise<CoOwnerPortalInvitation> {
  const response = await apiClient.post<{ success: boolean; data: CoOwnerPortalInvitation }>(
    `/tenants/${tenantId}/syndics/${syndicId}/profils/proprietaires/${ownerProfileId}/invitation-portail`
  );
  return response.data.data;
}

/** Ferme le portail copropriétaire au contact de ce profil (tous ses lots de l'agence). */
export async function revokeCoOwnerPortalAccess(
  tenantId: string,
  syndicId: string,
  ownerProfileId: string
): Promise<CoOwnerPortalRevocation> {
  const response = await apiClient.delete<{ success: boolean; data: CoOwnerPortalRevocation }>(
    `/tenants/${tenantId}/syndics/${syndicId}/profils/proprietaires/${ownerProfileId}/invitation-portail`
  );
  return response.data.data;
}

/**
 * Télécharge le fichier d'un document de copropriété. Les documents ne sont
 * jamais servis en statique (`/uploads/syndics` est refusé) : ils passent par
 * cette route, qui vérifie que le document appartient à l'agence.
 */
export async function downloadSyndicDocument(
  tenantId: string,
  syndicId: string,
  documentId: string,
  fallbackName: string
): Promise<{ blob: Blob; filename: string }> {
  const response = await apiClient.get<Blob>(
    `/tenants/${tenantId}/syndics/${syndicId}/documents/${encodeURIComponent(documentId)}/fichier`,
    { responseType: 'blob' }
  );
  return {
    blob: response.data,
    filename: filenameFromDisposition(response.headers?.['content-disposition'], fallbackName)
  };
}

export async function listLotTenantProfiles(
  tenantId: string,
  syndicId: string,
  query?: { lotId?: string }
): Promise<LotTenantProfile[]> {
  const response = await apiClient.get<{ success: boolean; data: LotTenantProfile[] }>(
    `/tenants/${tenantId}/syndics/${syndicId}/profils/locataires`,
    { params: query }
  );
  return response.data.data;
}

export async function createLotTenantProfile(
  tenantId: string,
  syndicId: string,
  data: CreateLotTenantProfileRequest
): Promise<LotTenantProfile> {
  const response = await apiClient.post<{ success: boolean; data: LotTenantProfile }>(
    `/tenants/${tenantId}/syndics/${syndicId}/profils/locataires`,
    data
  );
  return response.data.data;
}

export async function updateLotTenantProfile(
  tenantId: string,
  syndicId: string,
  tenantProfileId: string,
  data: Partial<CreateLotTenantProfileRequest>
): Promise<LotTenantProfile> {
  const response = await apiClient.patch<{ success: boolean; data: LotTenantProfile }>(
    `/tenants/${tenantId}/syndics/${syndicId}/profils/locataires/${tenantProfileId}`,
    data
  );
  return response.data.data;
}

export async function listSyndicIncidents(
  tenantId: string,
  syndicId: string,
  query?: { status?: string }
): Promise<SyndicateIncident[]> {
  const response = await apiClient.get<{ success: boolean; data: SyndicateIncident[] }>(
    `/tenants/${tenantId}/syndics/${syndicId}/incidents`,
    { params: query }
  );
  return response.data.data;
}

export async function createSyndicIncident(
  tenantId: string,
  syndicId: string,
  data: CreateSyndicateIncidentRequest
): Promise<SyndicateIncident> {
  const response = await apiClient.post<{ success: boolean; data: SyndicateIncident }>(
    `/tenants/${tenantId}/syndics/${syndicId}/incidents`,
    data
  );
  return response.data.data;
}

export async function updateSyndicIncident(
  tenantId: string,
  syndicId: string,
  incidentId: string,
  data: Partial<SyndicateIncident>
): Promise<SyndicateIncident> {
  const response = await apiClient.patch<{ success: boolean; data: SyndicateIncident }>(
    `/tenants/${tenantId}/syndics/${syndicId}/incidents/${incidentId}`,
    data
  );
  return response.data.data;
}

export async function createIncidentImputation(
  tenantId: string,
  syndicId: string,
  incidentId: string,
  data: CreateIncidentImputationRequest
): Promise<IncidentCostImputation> {
  const response = await apiClient.post<{ success: boolean; data: IncidentCostImputation }>(
    `/tenants/${tenantId}/syndics/${syndicId}/incidents/${incidentId}/imputations`,
    data
  );
  return response.data.data;
}

// FR-013 : fonds financiers de la copropriete (SyndicateFund).
export async function listSyndicateFunds(tenantId: string, syndicId: string): Promise<SyndicateFund[]> {
  const response = await apiClient.get<{ success: boolean; data: SyndicateFund[] }>(
    `/tenants/${tenantId}/syndics/${syndicId}/fonds`
  );
  return response.data.data;
}

export async function createSyndicateFund(
  tenantId: string,
  syndicId: string,
  data: CreateSyndicateFundRequest
): Promise<SyndicateFund> {
  const response = await apiClient.post<{ success: boolean; data: SyndicateFund }>(
    `/tenants/${tenantId}/syndics/${syndicId}/fonds`,
    data
  );
  return response.data.data;
}

export async function renameSyndicateFund(
  tenantId: string,
  syndicId: string,
  fundId: string,
  data: RenameSyndicateFundRequest
): Promise<SyndicateFund> {
  const response = await apiClient.patch<{ success: boolean; data: SyndicateFund }>(
    `/tenants/${tenantId}/syndics/${syndicId}/fonds/${fundId}`,
    data
  );
  return response.data.data;
}

export async function adjustSyndicateFundBalance(
  tenantId: string,
  syndicId: string,
  fundId: string,
  data: AdjustSyndicateFundBalanceRequest
): Promise<SyndicateFund & { negativeBalance?: boolean }> {
  const response = await apiClient.post<{ success: boolean; data: SyndicateFund & { negativeBalance?: boolean } }>(
    `/tenants/${tenantId}/syndics/${syndicId}/fonds/${fundId}/ajustement`,
    data
  );
  return response.data.data;
}

/** Affecte un appel de charges à un fonds : ce qui sera payé ensuite sur l'appel le crédite en entier. */
export async function assignChargeCallFund(
  tenantId: string,
  syndicId: string,
  chargeId: string,
  data: AssignFundRequest
): Promise<{ id: string; fundId: string | null }> {
  const response = await apiClient.patch<{ success: boolean; data: { id: string; fundId: string | null } }>(
    `/tenants/${tenantId}/syndics/${syndicId}/charges/${chargeId}/fonds`,
    data
  );
  return response.data.data;
}

/** Affecte un poste de budget à un fonds : le fonds reçoit la part du poste dans chaque paiement. */
export async function assignBudgetLineFund(
  tenantId: string,
  syndicId: string,
  budgetId: string,
  lineId: string,
  data: AssignFundRequest
): Promise<{ id: string; fundId: string | null }> {
  const response = await apiClient.patch<{ success: boolean; data: { id: string; fundId: string | null } }>(
    `/tenants/${tenantId}/syndics/${syndicId}/budgets/${budgetId}/lignes/${lineId}/fonds`,
    data
  );
  return response.data.data;
}

/* ---------------------------------------------------------------- AG en direct (spec 043) */

const liveBase = (tenantId: string, syndicId: string, meetingId: string) =>
  `/tenants/${tenantId}/syndics/${syndicId}/assemblees/${meetingId}`;

/** Photographie de la séance : quorum, lots émargés, résolutions, participation. */
export async function getLiveMeeting(
  tenantId: string,
  syndicId: string,
  meetingId: string
): Promise<LiveMeetingAdminView> {
  const response = await apiClient.get<{ success: boolean; data: LiveMeetingAdminView }>(
    `${liveBase(tenantId, syndicId, meetingId)}/direct`
  );
  return response.data.data;
}

/** Émarge un lot : présent, représenté (par un contact) ou absent. */
export async function setLotAttendance(
  tenantId: string,
  syndicId: string,
  meetingId: string,
  lotId: string,
  data: SetLotAttendanceRequest
): Promise<LiveMeetingAdminView> {
  const response = await apiClient.put<{ success: boolean; data: LiveMeetingAdminView }>(
    `${liveBase(tenantId, syndicId, meetingId)}/presences/${lotId}`,
    data
  );
  return response.data.data;
}

/** Émargement en masse (500 lots au plus). */
export async function setBulkAttendance(
  tenantId: string,
  syndicId: string,
  meetingId: string,
  data: SetBulkAttendanceRequest
): Promise<LiveMeetingAdminView> {
  const response = await apiClient.post<{ success: boolean; data: LiveMeetingAdminView }>(
    `${liveBase(tenantId, syndicId, meetingId)}/presences`,
    data
  );
  return response.data.data;
}

export async function openResolutionVote(
  tenantId: string,
  syndicId: string,
  meetingId: string,
  resolutionId: string
): Promise<LiveMeetingAdminView> {
  const response = await apiClient.post<{ success: boolean; data: LiveMeetingAdminView }>(
    `${liveBase(tenantId, syndicId, meetingId)}/resolutions/${resolutionId}/ouvrir-vote`
  );
  return response.data.data;
}

export async function closeResolutionVote(
  tenantId: string,
  syndicId: string,
  meetingId: string,
  resolutionId: string
): Promise<LiveMeetingAdminView> {
  const response = await apiClient.post<{ success: boolean; data: LiveMeetingAdminView }>(
    `${liveBase(tenantId, syndicId, meetingId)}/resolutions/${resolutionId}/clore-vote`
  );
  return response.data.data;
}

export async function listMeetingParticipants(
  tenantId: string,
  syndicId: string,
  meetingId: string
): Promise<MeetingParticipantView[]> {
  const response = await apiClient.get<{ success: boolean; data: MeetingParticipantView[] }>(
    `${liveBase(tenantId, syndicId, meetingId)}/participants`
  );
  return response.data.data;
}

/** Délivre un lien personnel (le jeton n'est remis qu'une fois, dans l'URL). */
export async function issueParticipantLink(
  tenantId: string,
  syndicId: string,
  meetingId: string,
  contactId: string
): Promise<ParticipantLink> {
  const response = await apiClient.post<{ success: boolean; data: ParticipantLink }>(
    `${liveBase(tenantId, syndicId, meetingId)}/participants/${contactId}/lien`
  );
  return response.data.data;
}

export async function revokeParticipantLinks(
  tenantId: string,
  syndicId: string,
  meetingId: string,
  contactId: string
): Promise<{ revoked: number }> {
  const response = await apiClient.delete<{ success: boolean; data: { revoked: number } }>(
    `${liveBase(tenantId, syndicId, meetingId)}/participants/${contactId}/liens`
  );
  return response.data.data;
}

/* ---------------------------------------------------------------- visio de l'AG (spec 045) */

/** Participants en visio (mains levées, droit de parole) ; `enabled: false` si la visio n'est pas configurée. */
export async function getMeetingVisio(
  tenantId: string,
  syndicId: string,
  meetingId: string
): Promise<MeetingVisioAdminView> {
  const response = await apiClient.get<{ success: boolean; data: MeetingVisioAdminView }>(
    `${liveBase(tenantId, syndicId, meetingId)}/visio`
  );
  return response.data.data;
}

/** Jeton de connexion du gestionnaire (modérateur) à la salle. */
export async function issueMeetingVisioToken(
  tenantId: string,
  syndicId: string,
  meetingId: string
): Promise<VisioJoinInfo> {
  const response = await apiClient.post<{ success: boolean; data: VisioJoinInfo }>(
    `${liveBase(tenantId, syndicId, meetingId)}/visio/jeton`
  );
  return response.data.data;
}

/** Autorise (`true`) ou interdit (`false`) micro et caméra à un copropriétaire, présent ou non (V16b). */
export async function setVisioParticipantSpeaking(
  tenantId: string,
  syndicId: string,
  meetingId: string,
  participantId: string,
  allowed: boolean
): Promise<MeetingVisioAdminView> {
  const response = await apiClient.post<{ success: boolean; data: MeetingVisioAdminView }>(
    `${liveBase(tenantId, syndicId, meetingId)}/visio/participants/${participantId}/parole`,
    { allowed }
  );
  return response.data.data;
}

export type VisioMuteSource = 'MICROPHONE' | 'CAMERA';

/** Coupe les pistes micro et/ou caméra publiées d'un participant (il peut les rouvrir : V16c). */
export async function muteVisioParticipant(
  tenantId: string,
  syndicId: string,
  meetingId: string,
  participantId: string,
  sources?: VisioMuteSource[]
): Promise<MeetingVisioAdminView & { mutedTracks: number }> {
  const response = await apiClient.post<{
    success: boolean;
    data: MeetingVisioAdminView & { mutedTracks: number };
  }>(
    `${liveBase(tenantId, syndicId, meetingId)}/visio/participants/${participantId}/couper`,
    sources ? { sources } : {}
  );
  return response.data.data;
}

/** Interdit (`locked: true`) ou rend (`false`) micro et caméra à tous les copropriétaires (V16d). */
export async function setVisioMediaLock(
  tenantId: string,
  syndicId: string,
  meetingId: string,
  locked: boolean
): Promise<MeetingVisioAdminView> {
  const response = await apiClient.post<{ success: boolean; data: MeetingVisioAdminView }>(
    `${liveBase(tenantId, syndicId, meetingId)}/visio/media/verrou`,
    { locked }
  );
  return response.data.data;
}

/** Exclut un participant de la salle, avec option de révoquer ses liens personnels. */
export async function removeVisioParticipant(
  tenantId: string,
  syndicId: string,
  meetingId: string,
  participantId: string,
  revokeLinks: boolean
): Promise<MeetingVisioAdminView & { revokedLinks: number }> {
  const response = await apiClient.post<{
    success: boolean;
    data: MeetingVisioAdminView & { revokedLinks: number };
  }>(`${liveBase(tenantId, syndicId, meetingId)}/visio/participants/${participantId}/exclure`, { revokeLinks });
  return response.data.data;
}

/* ---------------------------------------------------------------- discussion de la visio (spec 046) */

/** Toute la discussion (masqués compris), lisible à tout moment pour une AG de l'agence. */
export async function getMeetingDiscussion(
  tenantId: string,
  syndicId: string,
  meetingId: string
): Promise<ManagerDiscussionView> {
  const response = await apiClient.get<{ success: boolean; data: ManagerDiscussionView }>(
    `${liveBase(tenantId, syndicId, meetingId)}/visio/discussion`
  );
  return response.data.data;
}

/** Message du gestionnaire (annonce, réponse) : diffusé à la salle par le serveur. */
export async function postMeetingDiscussionMessage(
  tenantId: string,
  syndicId: string,
  meetingId: string,
  body: string
): Promise<ManagerDiscussionMessageView> {
  const response = await apiClient.post<{ success: boolean; data: ManagerDiscussionMessageView }>(
    `${liveBase(tenantId, syndicId, meetingId)}/visio/discussion/messages`,
    { body }
  );
  return response.data.data;
}

/** Masque ou rétablit un message (idempotent). */
export async function setMeetingDiscussionMessageHidden(
  tenantId: string,
  syndicId: string,
  meetingId: string,
  messageId: string,
  hidden: boolean
): Promise<ManagerDiscussionMessageView> {
  const response = await apiClient.post<{ success: boolean; data: ManagerDiscussionMessageView }>(
    `${liveBase(tenantId, syndicId, meetingId)}/visio/discussion/messages/${messageId}/masquer`,
    { hidden }
  );
  return response.data.data;
}

/** Ferme ou rouvre la discussion pour les copropriétaires (idempotent). */
export async function setMeetingDiscussionOpen(
  tenantId: string,
  syndicId: string,
  meetingId: string,
  open: boolean
): Promise<{ open: boolean }> {
  const response = await apiClient.post<{ success: boolean; data: { open: boolean } }>(
    `${liveBase(tenantId, syndicId, meetingId)}/visio/discussion/etat`,
    { open }
  );
  return response.data.data;
}

/** Coupe ou rétablit l'écriture d'un participant dans la discussion (idempotent). */
export async function setVisioParticipantWriting(
  tenantId: string,
  syndicId: string,
  meetingId: string,
  participantId: string,
  allowed: boolean
): Promise<{ participantId: string; muted: boolean }> {
  const response = await apiClient.post<{ success: boolean; data: { participantId: string; muted: boolean } }>(
    `${liveBase(tenantId, syndicId, meetingId)}/visio/participants/${participantId}/ecriture`,
    { allowed }
  );
  return response.data.data;
}

/* ---------------------------------------------------------------- enregistrement (spec 045, R1-R10) */

/** Démarre l'enregistrement de la séance (un seul actif par AG). */
export async function startMeetingRecording(
  tenantId: string,
  syndicId: string,
  meetingId: string
): Promise<MeetingRecordingView> {
  const response = await apiClient.post<{ success: boolean; data: MeetingRecordingView }>(
    `${liveBase(tenantId, syndicId, meetingId)}/visio/enregistrement/demarrer`
  );
  return response.data.data;
}

/** Arrête l'enregistrement en cours ; le fichier est ensuite traité côté serveur. */
export async function stopMeetingRecording(
  tenantId: string,
  syndicId: string,
  meetingId: string
): Promise<MeetingRecordingView> {
  const response = await apiClient.post<{ success: boolean; data: MeetingRecordingView }>(
    `${liveBase(tenantId, syndicId, meetingId)}/visio/enregistrement/arreter`
  );
  return response.data.data;
}

/** Enregistrements de l'AG, le plus récent d'abord. */
export async function getMeetingRecordings(
  tenantId: string,
  syndicId: string,
  meetingId: string
): Promise<MeetingRecordingView[]> {
  const response = await apiClient.get<{ success: boolean; data: MeetingRecordingView[] }>(
    `${liveBase(tenantId, syndicId, meetingId)}/enregistrements`
  );
  return response.data.data;
}

/** Efface le fichier ; la ligne reste en `DELETED` (trace). */
export async function deleteMeetingRecording(
  tenantId: string,
  syndicId: string,
  meetingId: string,
  recordingId: string
): Promise<MeetingRecordingView> {
  const response = await apiClient.delete<{ success: boolean; data: MeetingRecordingView }>(
    `${liveBase(tenantId, syndicId, meetingId)}/enregistrements/${recordingId}`
  );
  return response.data.data;
}

/** Relance le rapatriement d'un enregistrement en échec (409 si ce n'est pas possible). */
export async function retryMeetingRecording(
  tenantId: string,
  syndicId: string,
  meetingId: string,
  recordingId: string
): Promise<MeetingRecordingView> {
  const response = await apiClient.post<{ success: boolean; data: MeetingRecordingView }>(
    `${liveBase(tenantId, syndicId, meetingId)}/enregistrements/${recordingId}/reessayer`
  );
  return response.data.data;
}

/**
 * URL du flux vidéo (lecteur) ou du téléchargement. La route est authentifiée par
 * le cookie de session : jamais de jeton dans l'adresse, jamais de chemin disque.
 */
export function meetingRecordingFileUrl(
  tenantId: string,
  syndicId: string,
  meetingId: string,
  recordingId: string,
  download = false
): string {
  const base = `${API_URL}${liveBase(tenantId, syndicId, meetingId)}/enregistrements/${recordingId}/fichier`;
  return download ? `${base}?telecharger=1` : base;
}

/** Délai d'un téléchargement d'enregistrement : un MP4 de séance est volumineux (15 min). */
const RECORDING_DOWNLOAD_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Télécharge le MP4 par l'API authentifiée (blob) pour pouvoir annoncer le nom du fichier et
 * l'échec éventuel ; le nom vient de `Content-Disposition`, sinon `fallbackName`.
 */
export async function downloadMeetingRecordingFile(
  tenantId: string,
  syndicId: string,
  meetingId: string,
  recordingId: string,
  fallbackName = 'enregistrement.mp4'
): Promise<{ blob: Blob; filename: string }> {
  const response = await apiClient.get<Blob>(
    `${liveBase(tenantId, syndicId, meetingId)}/enregistrements/${recordingId}/fichier`,
    { params: { telecharger: 1 }, responseType: 'blob', timeout: RECORDING_DOWNLOAD_TIMEOUT_MS }
  );
  return {
    blob: response.data,
    filename: filenameFromDisposition(response.headers?.['content-disposition'], fallbackName)
  };
}
