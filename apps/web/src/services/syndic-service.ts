import apiClient from '../utils/api-client';
import { filenameFromDisposition } from '../utils/save-blob';
import {
  CreateAgendaItemRequest,
  ChargeCall,
  ChargeCallBatch,
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

export async function listSyndicates(tenantId: string): Promise<Syndicate[]> {
  const response = await apiClient.get<{ success: boolean; data: Syndicate[] }>(`/tenants/${tenantId}/syndics`);
  return response.data.data;
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
    // v2 backend derives special shares from isParkingIncluded/tantiemes.
    isParkingIncluded: data.lotType === 'PARKING' || (data.specialShares ?? 0) > 0
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
    isParkingIncluded:
      data.lotType !== undefined ? data.lotType === 'PARKING' || (data.specialShares ?? 0) > 0 : undefined
  };

  const response = await apiClient.patch<{ success: boolean; data: SyndicateLot }>(
    `/tenants/${tenantId}/syndics/${syndicId}/lots/${lotId}`,
    payload
  );
  return response.data.data;
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

export async function generateMeetingMinutesDocx(tenantId: string, syndicId: string, meetingId: string): Promise<Blob> {
  const response = await apiClient.post(
    `/tenants/${tenantId}/syndics/${syndicId}/assemblees/${meetingId}/compte-rendu`,
    {},
    { responseType: 'blob' }
  );
  return response.data;
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
): Promise<PaymentReminder> {
  const response = await apiClient.post<{ success: boolean; data: PaymentReminder }>(
    `/tenants/${tenantId}/syndics/${syndicId}/charges/${chargeId}/relance`,
    data
  );
  return response.data.data;
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
