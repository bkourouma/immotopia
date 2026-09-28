export type SyndicateStatus = 'ACTIVE' | 'IN_LIQUIDATION' | 'IN_DISPUTE';
export type ChargeCallStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE';
export type MeetingStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type MeetingType = 'ORDINARY' | 'EXTRAORDINARY';
export type VoteChoice = 'FOR' | 'AGAINST' | 'ABSTAIN';

export type LotType = 'APARTMENT' | 'PARKING' | 'CELLAR' | 'OFFICE' | 'COMMERCIAL' | 'OTHER';

export interface SyndicateLot {
  id: string;
  syndicateId: string;
  propertyId?: string | null;
  property?: {
    id: string;
    internalReference?: string | null;
    title?: string | null;
    address?: string | null;
    owner?: {
      id: string;
      email?: string | null;
      fullName?: string | null;
    } | null;
  } | null;
  ownerContactId?: string | null;
  coowner?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    legalName?: string | null;
    email?: string | null;
    fullName?: string | null;
  } | null;
  lotNumber: string;
  lotType: LotType;
  generalShares: number;
  specialShares?: number | null;
  ownerSince?: string | null;
  tenantAssignments?: Array<{
    id: string;
    tenantId: string;
    startDate: string;
    endDate?: string | null;
    leaseId?: string | null;
    notes?: string | null;
    isActive: boolean;
    contact?: {
      id: string;
      firstName?: string | null;
      lastName?: string | null;
      legalName?: string | null;
      email?: string | null;
    } | null;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface SyndicateCount {
  lots: number;
  chargeCalls: number;
  budgets?: number;
  generalMeetings?: number;
  documents?: number;
  serviceContracts?: number;
  incidents?: number;
}

export interface Syndicate {
  id: string;
  tenantId: string;
  name: string;
  address: string;
  registrationNo?: string | null;
  fiscalYear?: number;
  syndicManagerId?: string | null;
  cadastralReference?: string | null;
  totalLots: number;
  totalBuildings: number;
  status: SyndicateStatus;
  regulationDocUrl?: string | null;
  /** Lot S1 (besoin 7) : agence mandante, sinon identité de l'agence elle-même. */
  mandatingAgencyId?: string | null;
  mandatingAgency?: { id: string; name: string } | null;
  hasLogo?: boolean;
  logoUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  lots?: SyndicateLot[];
  chargeCalls?: Array<{ id: string }>;
  funds?: Array<{ id: string; balance: number; currency: string }>;
  _count?: SyndicateCount;
}

/** Lot S2 : source d'une affectation — le paiement lui-même ou une avance imputée. */
export type ChargePaymentAllocationSource = 'PAYMENT' | 'ADVANCE';

/**
 * Une ligne `payments[]` d'un appel de charges (lot S2) : une affectation, pas
 * un paiement — plusieurs lignes peuvent partager le même `paymentId` quand un
 * même paiement a été réparti sur plusieurs appels. `id` reste unique (celui
 * de l'affectation), `amount` est la part affectée à CET appel.
 */
export interface ChargePayment {
  id: string;
  paymentId: string;
  chargeCallId: string;
  amount: number | string;
  source: ChargePaymentAllocationSource;
  paidAt: string;
  method?: string | null;
  reference?: string | null;
  createdAt: string;
}

export interface ChargeCall {
  id: string;
  syndicateId: string;
  lotId: string;
  period: string;
  /** Lot S2 : bornes facultatives de la période, `null` si non renseignées. */
  periodStart?: string | null;
  periodEnd?: string | null;
  amount: number | string;
  currency: string;
  dueDate: string;
  status: ChargeCallStatus;
  isRecurring?: boolean;
  recurrenceFrequency?: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  recurrenceCount?: number;
  /** Fonds qui reçoit en entier ce qui est payé sur l'appel ; `null` : selon les postes du budget. */
  fundId?: string | null;
  createdAt: string;
  updatedAt: string;
  lot?: SyndicateLot;
  payments?: ChargePayment[];
  /** Lot S2 : calculés côté API à partir des affectations — préférés à `payments` pour le total. */
  paidAmount?: number | string;
  outstandingAmount?: number | string;
}

export interface CreateSyndicateRequest {
  propertyId?: string;
  name: string;
  address: string;
  registrationNo?: string;
  cadastralReference?: string;
  totalLots?: number;
  totalBuildings?: number;
  /** Lot S1 : `null` détache (identité de l'agence), absent = pas de mandant à la création. */
  mandatingAgencyId?: string | null;
}

export interface UpdateSyndicateRequest {
  name?: string;
  address?: string;
  registrationNo?: string | null;
  cadastralReference?: string | null;
  fiscalYear?: number;
  syndicManagerId?: string | null;
  status?: SyndicateStatus;
  /** Lot S1 : `null` détache le mandant (identité de l'agence). */
  mandatingAgencyId?: string | null;
}

export interface CreateSyndicateLotRequest {
  propertyId?: string;
  ownerContactId?: string;
  lotNumber: string;
  lotType: LotType;
  generalShares: number;
  specialShares?: number;
  ownerSince?: string;
}

export interface UpdateSyndicateLotRequest {
  propertyId?: string | null;
  ownerContactId?: string | null;
  lotNumber?: string;
  lotType?: LotType;
  generalShares?: number;
  specialShares?: number | null;
  ownerSince?: string | null;
}

export interface ImportLotsFromPropertiesRequest {
  propertyIds: string[];
}

export interface ImportLotsFromPropertiesResult {
  created: Array<{
    lotId: string;
    propertyId: string;
    lotNumber: string;
    sourceBuildingId: string | null;
  }>;
  skipped: Array<{
    propertyId: string;
    reason: string;
  }>;
  notFoundPropertyIds: string[];
  summary?: {
    requested: number;
    importable: number;
    created: number;
    skipped: number;
  };
  message?: string;
}

export interface CreateChargeCallRequest {
  lotId?: string;
  lotIds?: string[];
  applyToAllLots?: boolean;
  period: string;
  /** Lot S2 : facultatives, mais vont ensemble (les deux ou aucune). */
  periodStart?: string | null;
  periodEnd?: string | null;
  amount: number;
  currency?: string;
  dueDate: string;
  /** Appel versé en entier à ce fonds (appel de fonds travaux). */
  fundId?: string | null;
  isRecurring?: boolean;
  recurrenceFrequency?: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  recurrenceCount?: number;
}

export interface CreateChargeCallResult {
  chargeCalls: ChargeCall[];
  generatedLots: number;
  occurrences: number;
  totalCreated: number;
}

export interface CreateChargePaymentRequest {
  amount: number;
  paidAt: string;
  method?: string;
  reference?: string;
}

export interface CreateLotTenantAssignmentRequest {
  tenantId: string;
  startDate: string;
  endDate?: string;
  leaseId?: string;
  notes?: string;
}

/** Codes stables de `GMResolution.majorityRule` ; tout autre texte vaut l'article 24. */
export type MajorityRule = 'ARTICLE_24' | 'ARTICLE_25' | 'ARTICLE_26' | 'UNANIMITE';

/** Decompte d'une resolution calcule par l'API (tantiemes et nombre de lots). */
export interface ResolutionTally {
  rule: MajorityRule;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  sharesFor: number;
  sharesAgainst: number;
  sharesAbstain: number;
  totalShares: number;
  totalLots: number;
  referenceShares: number;
  ownersFor: number;
  totalOwners: number;
  result: 'APPROVED' | 'REJECTED' | null;
}

export interface MeetingResolution {
  id: string;
  meetingId: string;
  title: string;
  description?: string | null;
  majorityRule?: string | null;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  sharesFor: number;
  /** `null` tant qu'aucun vote n'est saisi. */
  result: 'PENDING' | 'APPROVED' | 'REJECTED' | 'DEFERRED' | null;
  createdAt: string;
  updatedAt: string;
  votes?: Array<{ id: string; lotId: string; vote: VoteChoice }>;
  tally?: ResolutionTally;
}

/** Contact CRM tel que l'API l'expose dans une assemblee. */
export interface MeetingContact {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  legalName?: string | null;
  email?: string | null;
}

/** Pouvoir (mandat) : le mandant se fait representer par le mandataire. */
export interface MeetingProxy {
  id: string;
  meetingId: string;
  grantorContactId: string;
  representativeContactId: string;
  createdAt: string;
  grantor?: MeetingContact | null;
  representative?: MeetingContact | null;
}

export interface CreateMeetingProxyRequest {
  grantorContactId: string;
  representativeContactId: string;
}

/** Lot d'une assemblee : le detail inclut le coproprietaire (`owner`). */
export type MeetingLot = SyndicateLot & { owner?: MeetingContact | null };

/** Tantiemes representes (lots ayant vote au moins une fois) sur le total. */
export interface MeetingAttendance {
  representedLots: number;
  representedShares: number;
  totalLots: number;
  totalShares: number;
  quorumPercent: number;
}

export interface MeetingAgendaItem {
  id: string;
  meetingId: string;
  orderIndex: number;
  title: string;
  discussions?: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface GeneralMeeting {
  id: string;
  syndicateId: string;
  type: MeetingType;
  scheduledAt: string;
  startTime?: string | null;
  endTime?: string | null;
  location?: string | null;
  status: MeetingStatus;
  quorum: number;
  createdAt: string;
  updatedAt: string;
  agendaItems?: MeetingAgendaItem[];
  resolutions?: MeetingResolution[];
  proxies?: MeetingProxy[];
  attendance?: MeetingAttendance;
  syndicate?: Syndicate;
}

export interface CreateMeetingRequest {
  type: MeetingType;
  scheduledAt: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  resolutions?: Array<{ title: string; description?: string; majorityRule?: string }>;
}

export interface UpdateMeetingRequest {
  startTime?: string | null;
  endTime?: string | null;
  location?: string | null;
  status?: MeetingStatus;
}

export interface CreateResolutionRequest {
  title: string;
  description?: string;
  majorityRule?: string;
}

export interface CreateAgendaItemRequest {
  title: string;
  orderIndex?: number;
  discussions?: string[];
}

export interface UpdateAgendaItemRequest {
  title?: string;
  orderIndex?: number;
  discussions?: string[];
}

export interface ServiceProvider {
  id: string;
  tenantId: string;
  name: string;
  specialty?: string | null;
  email?: string | null;
  phone?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateServiceProviderRequest {
  name: string;
  specialty?: string;
  email?: string;
  phone?: string;
}

export interface UpdateServiceProviderRequest {
  name?: string;
  specialty?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface MaintenanceContract {
  id: string;
  syndicateId: string;
  providerId: string;
  nature: string;
  startDate: string;
  endDate?: string | null;
  annualAmount?: number | string | null;
  currency: string;
  renewalAlertDays: number;
  status: 'ACTIVE' | 'EXPIRED' | 'TERMINATED';
  createdAt: string;
  updatedAt: string;
  provider?: ServiceProvider;
}

export interface CreateMaintenanceContractRequest {
  providerId: string;
  nature: string;
  startDate: string;
  endDate?: string;
  annualAmount?: number;
  currency?: string;
  renewalAlertDays?: number;
}

export interface CommonAreaAsset {
  id: string;
  syndicateId: string;
  name: string;
  category: string;
  lastMaintenanceDate?: string | null;
  nextMaintenanceDate?: string | null;
  notes?: string | null;
}

export interface SyndicProvidersPayload {
  providers: ServiceProvider[];
  contracts: MaintenanceContract[];
  commonAssets: CommonAreaAsset[];
}

export interface SyndicateDocument {
  id: string;
  syndicateId: string;
  title: string;
  type: 'REGULATION' | 'GENERAL_MEETING_MINUTES' | 'DIAGNOSTIC' | 'INSURANCE' | 'BUDGET' | 'OTHER';
  fileUrl: string;
  expiresAt?: string | null;
  createdAt: string;
}

export interface CreateSyndicateDocumentRequest {
  title: string;
  type: 'REGULATION' | 'GENERAL_MEETING_MINUTES' | 'DIAGNOSTIC' | 'INSURANCE' | 'BUDGET' | 'OTHER';
  file: File;
  expiresAt?: string;
}

export interface FinanceSummary {
  funds: Array<{ id: string; name: string; balance: number | string; currency: string }>;
  totals: {
    totalFundsBalance: number;
    totalCalled: number;
    totalPaid: number;
    totalOutstanding: number;
    overdueCount: number;
    overdueAmount: number;
    /** Lot S2 : somme des avances de tous les lots de la copropriété. */
    totalAdvance: number;
  };
}

export type ReminderChannel = 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH';
export type ReminderStatus = 'SENT' | 'DELIVERED' | 'FAILED';
export type InstalmentStatus = 'PENDING' | 'PAID' | 'LATE' | 'CANCELLED';
export type PaymentScheduleStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'DEFAULTED';

export interface OverdueDashboardItem {
  chargeCallId: string;
  lotId: string;
  lotNumber: string;
  property?: {
    id: string;
    title?: string | null;
    address?: string | null;
    internalReference?: string | null;
  } | null;
  owner: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  } | null;
  dueDate: string;
  status: ChargeCallStatus;
  amount: number;
  paid: number;
  outstanding: number;
  daysLate: number;
}

export interface OverdueDashboard {
  items: OverdueDashboardItem[];
  totals: {
    overdueCount: number;
    overdueAmount: number;
  };
}

export interface PaymentReminder {
  id: string;
  chargeCallId: string;
  lotId: string;
  reminderLevel: number;
  channel: ReminderChannel;
  sentAt: string;
  status: ReminderStatus;
  responseAction?: string | null;
  createdAt: string;
  updatedAt: string;
  chargeCall?: ChargeCall;
  lot?: SyndicateLot & {
    owner?: {
      id: string;
      firstName?: string | null;
      lastName?: string | null;
      email?: string | null;
      phone?: string | null;
    } | null;
  };
}

export interface ReminderBatchResult {
  processedCalls: number;
  remindersCreated: number;
  createdReminderIds: string[];
}

export interface LatePaymentPenalty {
  id: string;
  chargeCallId: string;
  lotId: string;
  daysLate: number;
  penaltyRate: number;
  penaltyAmount: number | string;
  appliedAt: string;
  waived: boolean;
  waivedAt?: string | null;
  waivedReason?: string | null;
  createdAt: string;
  updatedAt: string;
  chargeCall?: ChargeCall;
  lot?: SyndicateLot & {
    owner?: {
      id: string;
      firstName?: string | null;
      lastName?: string | null;
      email?: string | null;
      phone?: string | null;
    } | null;
  };
}

export interface PaymentScheduleInstalment {
  id: string;
  scheduleId: string;
  dueDate: string;
  amount: number | string;
  paidAt?: string | null;
  status: InstalmentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentSchedule {
  id: string;
  chargeCallId: string;
  lotId: string;
  agreedAt: string;
  totalAmount: number | string;
  status: PaymentScheduleStatus;
  createdAt: string;
  updatedAt: string;
  instalments?: PaymentScheduleInstalment[];
  chargeCall?: ChargeCall;
  lot?: SyndicateLot & {
    owner?: {
      id: string;
      firstName?: string | null;
      lastName?: string | null;
      email?: string | null;
    } | null;
  };
}

export interface CreateManualReminderRequest {
  reminderLevel?: number;
  channel?: ReminderChannel;
  sentAt?: string;
  status?: ReminderStatus;
  responseAction?: string;
}

export interface ListWithPaginationQuery {
  page?: number;
  limit?: number;
}

export interface CreateLatePenaltyRequest {
  daysLate?: number;
  penaltyRate: number;
  penaltyAmount?: number;
  appliedAt?: string;
  waived?: boolean;
  waivedReason?: string;
}

export interface WaivePenaltyRequest {
  waivedReason: string;
}

export interface CreatePaymentScheduleRequest {
  agreedAt?: string;
  totalAmount: number;
  instalments: Array<{
    dueDate: string;
    amount: number;
  }>;
}

export type OwnerAccountTransactionType =
  'CHARGE_CALL' | 'PAYMENT' | 'PENALTY' | 'WAIVER' | 'ADJUSTMENT' | 'FUND_TRANSFER';

export interface OwnerAccountTransaction {
  id: string;
  accountId: string;
  transactionDate: string;
  type: OwnerAccountTransactionType;
  debit?: number | string | null;
  credit?: number | string | null;
  balanceAfter: number | string;
  label: string;
  reference?: string | null;
  sourceId?: string | null;
  createdAt: string;
}

export interface OwnerAccount {
  id: string;
  syndicateId: string;
  lotId: string;
  contactId: string;
  balance: number | string;
  currency: string;
  createdAt: string;
  lastUpdatedAt: string;
  lot?: SyndicateLot & {
    owner?: {
      id: string;
      firstName?: string | null;
      lastName?: string | null;
      legalName?: string | null;
      email?: string | null;
      phone?: string | null;
    } | null;
  };
  contact?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    legalName?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
}

export interface CreateOwnerAccountAdjustmentRequest {
  direction: 'DEBIT' | 'CREDIT';
  amount: number;
  label: string;
  reference?: string;
  transactionDate?: string;
}

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
export type JournalType = 'GENERAL' | 'BANK' | 'CASH' | 'CHARGES';
export type SourceType = 'CHARGE_PAYMENT' | 'MANUAL' | 'PENALTY' | 'FUND';

export interface ChartOfAccount {
  id: string;
  syndicateId: string;
  accountNumber: string;
  accountName: string;
  accountClass: number;
  accountType: AccountType;
  isAuxiliary: boolean;
  parentAccountId?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AccountingJournal {
  id: string;
  syndicateId: string;
  journalType: JournalType;
  label: string;
  code: string;
  fiscalYear: number;
  createdAt: string;
  updatedAt: string;
}

export interface JournalEntryLine {
  id: string;
  entryId: string;
  accountId: string;
  lotId?: string | null;
  debit: number | string;
  credit: number | string;
  label: string;
  createdAt: string;
}

export interface JournalEntry {
  id: string;
  journalId: string;
  entryDate: string;
  reference: string;
  description: string;
  sourceType: SourceType;
  sourceId?: string | null;
  isLocked: boolean;
  createdAt: string;
  updatedAt: string;
  journal?: AccountingJournal;
  lines?: JournalEntryLine[];
}

export interface CreateChartOfAccountRequest {
  accountNumber: string;
  accountName: string;
  accountClass: number;
  accountType: AccountType;
  isAuxiliary?: boolean;
  parentAccountId?: string | null;
}

export interface CreateAccountingJournalRequest {
  journalType: JournalType;
  label: string;
  code: string;
  fiscalYear: number;
}

export interface CreateJournalEntryRequest {
  journalId: string;
  entryDate: string;
  reference: string;
  description: string;
  sourceType: SourceType;
  sourceId?: string;
  lines: Array<{
    accountId: string;
    lotId?: string;
    debit?: number;
    credit?: number;
    label: string;
  }>;
}

export interface TrialBalanceItem {
  accountId: string;
  accountNumber: string;
  accountName: string;
  totalDebit: number;
  totalCredit: number;
  balance: number;
}

export interface TrialBalance {
  items: TrialBalanceItem[];
  totals: {
    totalDebit: number;
    totalCredit: number;
    isBalanced: boolean;
  };
}

export type BudgetStatus = 'DRAFT' | 'APPROVED' | 'REVISED' | 'CLOSED';
export type DistributionKey = 'GENERAL_SHARES' | 'SPECIAL_SHARES' | 'EQUAL' | 'MANUAL';
export type BatchType = 'REGULAR' | 'EXCEPTIONAL';
export type BatchStatus = 'DRAFT' | 'SENT' | 'CLOSED';

export interface BudgetLineItem {
  id: string;
  budgetId: string;
  category: string;
  description: string;
  amountForecast: number | string;
  amountActual: number | string;
  distributionKey: DistributionKey;
  accountId?: string | null;
  /** Fonds alimenté par ce poste, au prorata de chaque paiement de charges. */
  fundId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetAllocation {
  id: string;
  budgetId: string;
  lotId: string;
  totalAllocated: number | string;
  breakdown: Array<{
    lineId: string;
    category: string;
    distributionKey: DistributionKey;
    allocated: number;
  }>;
  createdAt: string;
  updatedAt: string;
  lot?: SyndicateLot;
}

export interface SyndicateBudget {
  id: string;
  syndicateId: string;
  fiscalYear: number;
  label: string;
  status: BudgetStatus;
  approvedAt?: string | null;
  approvedByResolutionId?: string | null;
  totalAmount: number | string;
  currency: string;
  createdAt: string;
  updatedAt: string;
  lines?: BudgetLineItem[];
  allocations?: BudgetAllocation[];
}

export interface ChargeCallBatch {
  id: string;
  syndicateId: string;
  label: string;
  period: string;
  dueDate: string;
  batchType: BatchType;
  budgetId?: string | null;
  totalAmount: number | string;
  currency: string;
  status: BatchStatus;
  createdAt: string;
  updatedAt: string;
  chargeCalls?: ChargeCall[];
}

export interface CreateBudgetRequest {
  fiscalYear: number;
  label: string;
  totalAmount: number;
  currency?: string;
  lines: Array<{
    category: string;
    description: string;
    amountForecast: number;
    distributionKey: DistributionKey;
    accountId?: string;
    fundId?: string | null;
  }>;
}

export interface UpdateBudgetRequest {
  label?: string;
  status?: BudgetStatus;
  approvedByResolutionId?: string | null;
  totalAmount?: number;
}

export interface GenerateBudgetChargeCallsRequest {
  label: string;
  period: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  dueDate: string;
  batchType: BatchType;
  currency?: string;
  /** Nombre de périodes sur lesquelles répartir le budget annuel (1, 2, 4 ou 12) ; défaut 1. */
  periodsPerYear?: 1 | 2 | 4 | 12;
  /** Période à générer (1 à `periodsPerYear`) ; défaut 1. */
  periodIndex?: number;
}

export interface CreateChargeCallBatchRequest {
  label: string;
  period: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  dueDate: string;
  batchType: BatchType;
  budgetId?: string;
  totalAmount: number;
  currency?: string;
}

export type IncidentType = 'BREAKDOWN' | 'LEAK' | 'VANDALISM' | 'SAFETY' | 'OTHER';
export type IncidentUrgency = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type IncidentStatus = 'REPORTED' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type ImputationType = 'SYNDICATE_BUDGET' | 'INSURANCE' | 'LOT_OWNER' | 'THIRD_PARTY';

/**
 * Résultat de « Inviter au portail » (portail copropriétaire). Ce que rend
 * `POST .../profils/proprietaires/:id/invitation-portail`.
 *   - NEW_ACCOUNT : compte créé, `invitationUrl` est un lien d'activation ;
 *   - ACTIVATION_RENEWED : compte jamais utilisé, nouveau lien d'activation ;
 *   - EXISTING_ACCOUNT : compte déjà utilisé, `invitationUrl` mène à la
 *     connexion (jamais de lien qui changerait son mot de passe).
 */
export interface CoOwnerPortalInvitation {
  email: string;
  contactName: string;
  accountStatus: 'NEW_ACCOUNT' | 'ACTIVATION_RENEWED' | 'EXISTING_ACCOUNT';
  invitationUrl: string;
  expiresAt: string | null;
  emailSent: boolean;
  openedLots: number;
}

export interface CoOwnerPortalRevocation {
  closedLots: number;
  unlinkedAccounts: number;
}

export interface LotOwnerProfile {
  id: string;
  lotId: string;
  contactId: string;
  ownershipPercentage: number | string;
  ownedSince: string;
  ownedUntil?: string | null;
  portalAccessEnabled: boolean;
  portalAccessToken?: string | null;
  notificationPrefs?: any;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lot?: SyndicateLot;
  contact?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    legalName?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
}

export interface LotTenantProfile {
  id: string;
  lotId: string;
  contactId: string;
  leaseId?: string | null;
  tenantSince: string;
  tenantUntil?: string | null;
  chargesBilledToTenant: boolean;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
  lot?: SyndicateLot;
  contact?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    legalName?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
}

export interface IncidentCostImputation {
  id: string;
  incidentId: string;
  imputationType: ImputationType;
  amount: number | string;
  currency: string;
  budgetLineId?: string | null;
  lotId?: string | null;
  contractId?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  lot?: SyndicateLot;
}

export interface SyndicateIncident {
  id: string;
  syndicateId: string;
  reportedByContactId: string;
  lotId?: string | null;
  assetId?: string | null;
  incidentType: IncidentType;
  description: string;
  urgency: IncidentUrgency;
  status: IncidentStatus;
  reportedAt: string;
  resolvedAt?: string | null;
  providerId?: string | null;
  createdAt: string;
  updatedAt: string;
  lot?: SyndicateLot;
  imputations?: IncidentCostImputation[];
}

export interface CreateLotOwnerProfileRequest {
  lotId: string;
  contactId: string;
  ownershipPercentage: number;
  ownedSince: string;
  ownedUntil?: string;
  portalAccessEnabled?: boolean;
  notificationPrefs?: any;
  isActive?: boolean;
}

export interface CreateLotTenantProfileRequest {
  lotId: string;
  contactId: string;
  leaseId?: string;
  tenantSince: string;
  tenantUntil?: string;
  chargesBilledToTenant?: boolean;
  isCurrent?: boolean;
}

export interface CreateSyndicateIncidentRequest {
  reportedByContactId: string;
  lotId?: string;
  assetId?: string;
  incidentType: IncidentType;
  description: string;
  urgency: IncidentUrgency;
  reportedAt?: string;
}

export interface CreateIncidentImputationRequest {
  imputationType: ImputationType;
  amount: number;
  currency?: string;
  budgetLineId?: string;
  lotId?: string;
  contractId?: string;
  notes?: string;
}

// FR-013 : fonds financiers de la copropriete (SyndicateFund).
export interface SyndicateFund {
  id: string;
  syndicateId: string;
  name: string;
  balance: number | string;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSyndicateFundRequest {
  name: string;
  initialBalance?: number;
  currency?: string;
}

export interface RenameSyndicateFundRequest {
  name: string;
}

export interface AdjustSyndicateFundBalanceRequest {
  direction: 'CREDIT' | 'DEBIT';
  amount: number;
  reason: string;
  /** EXPENSE : dépense payée par le fonds (toujours un débit). Défaut : ajustement. */
  kind?: 'ADJUSTMENT' | 'EXPENSE';
}

/** Affectation d'un appel ou d'un poste de budget à un fonds ; `null` la retire. */
export interface AssignFundRequest {
  fundId: string | null;
}

// ---------------------------------------------------------------------------
// Lot S2 (besoins 4 et 5) : paiement par lot, avance, suivi mensuel.
// ---------------------------------------------------------------------------

/** Un appel non soldé du lot (`GET .../lots/:lotId/appels-ouverts`), pour la sélection des mois couverts. */
export interface LotOpenChargeCall {
  id: string;
  period: string;
  periodStart: string | null;
  periodEnd: string | null;
  dueDate: string;
  amount: number;
  paid: number;
  outstanding: number;
  currency: string;
  status: ChargeCallStatus;
}

/** Avance du lot (`GET .../lots/:lotId/avance`). */
export interface LotAdvance {
  advance: number;
  currency: string;
}

export interface RecordLotPaymentRequest {
  amount: number;
  paidAt: string;
  method: string;
  reference?: string | null;
  /** Appels cochés par le gestionnaire ; absent ou vide = automatique (plus anciens d'abord). */
  chargeCallIds?: string[];
}

/** Une ligne d'affectation, telle que rendue par l'enregistrement ou l'aperçu d'un paiement de lot. */
export interface LotPaymentAllocationView {
  /** `null` sur un aperçu. */
  paymentId: string | null;
  chargeCallId: string;
  period: string;
  amount: number;
  source: ChargePaymentAllocationSource;
  callStatusAfter: ChargeCallStatus;
}

/** Réponse de `POST .../lots/:lotId/paiements` et de son aperçu (`.../paiements/apercu`). */
export interface LotPaymentResult {
  payment: {
    /** `null` sur un aperçu : rien n'a été écrit. */
    id: string | null;
    lotId: string;
    chargeCallId: string | null;
    amount: number;
    unallocatedAmount: number;
    paidAt: string;
    method: string | null;
    reference: string | null;
  };
  allocations: LotPaymentAllocationView[];
  advance: number;
  lotAdvanceBalance: number;
  currency: string;
  /**
   * Reçus et quittances émis par ce paiement (lot S3). Présent seulement sur
   * l'enregistrement réel (`POST .../paiements`) — absent de l'aperçu
   * (`.../paiements/apercu`), qui n'écrit rien.
   */
  documents?: IssuedReceiptRef[];
}

export type MonthlyTrackingStatus = 'NONE' | 'PAID' | 'PARTIAL' | 'DUE' | 'OVERDUE';

export interface MonthlyTrackingCell {
  month: number;
  due: number;
  paid: number;
  status: MonthlyTrackingStatus;
}

export interface MonthlyTrackingLotRow {
  lotId: string;
  lotNumber: string;
  ownerName: string | null;
  advance: number;
  months: MonthlyTrackingCell[];
}

/** Réponse de `GET .../suivi-mensuel?year=` : grille lot × mois de la copropriété. */
export interface MonthlyTracking {
  year: number;
  currency: string;
  months: number[];
  lots: MonthlyTrackingLotRow[];
}

// -------------------------------------------------------------------------
// Lot S4 — programmation des appels de charges automatiques (besoin 6).
// Contrat : `packages/api/src/lib/syndics/charge-schedules.ts` et
// `charge-schedule-schemas.ts`.
// -------------------------------------------------------------------------

export type ChargeScheduleFrequency = 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';
export type ChargeScheduleAmountSource = 'BUDGET' | 'FIXED';
export type ChargeScheduleRunStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED';
export type ChargeScheduleRunTrigger = 'CRON' | 'MANUAL';

export interface ChargeSchedulePeriodDates {
  label: string;
  periodStart: string;
  periodEnd: string;
  issueDate: string;
  dueDate: string;
}

export interface ChargeScheduleRun {
  id: string;
  scheduleId: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  status: ChargeScheduleRunStatus;
  trigger: ChargeScheduleRunTrigger;
  batchId: string | null;
  callsCreated: number;
  callsCovered: number;
  notificationsSent: number;
  /** Avis non envoyés volontairement (propriétaire du lot qui n'est plus copropriétaire actuel). */
  notificationsSkipped: number;
  /** Remarque non sensible sur l'exécution (ex. lots dont l'avis n'est pas parti), ou `null`. */
  notes: string | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface ChargeScheduleBudgetRef {
  id: string;
  label: string;
  fiscalYear: number;
  status: BudgetStatus;
}

export interface ChargeSchedule {
  id: string;
  syndicateId: string;
  label: string;
  frequency: ChargeScheduleFrequency;
  issueDay: number;
  dueOffsetDays: number;
  amountSource: ChargeScheduleAmountSource;
  budgetId: string | null;
  budget: ChargeScheduleBudgetRef | null;
  fixedAmount: number | null;
  currency: string;
  startDate: string;
  endDate: string | null;
  active: boolean;
  nextRunAt: string | null;
  nextPeriod: ChargeSchedulePeriodDates | null;
  lastRunAt: string | null;
  lastRun: ChargeScheduleRun | null;
  hasIssuedPeriods: boolean;
  createdAt: string;
  updatedAt: string;
}

// --------------------------------------------------------------------------
// Lot S3 — reçus et quittances (besoin 1)
// --------------------------------------------------------------------------

export type ReceiptKind = 'RECEIPT' | 'QUITTANCE';

/** Un reçu de paiement ou une quittance de charges, tels que rendus par la liste. */
export interface ReceiptView {
  id: string;
  kind: ReceiptKind;
  number: string;
  lotId: string;
  lotNumber: string | null;
  contactId: string | null;
  coownerName: string | null;
  chargeCallId: string | null;
  chargePaymentId: string | null;
  periodLabel: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  amount: number;
  currency: string;
  issuedAt: string;
  emailedAt: string | null;
  /** Message générique stocké côté API (français) — préférer `emailErrorCode` pour un libellé traduit. */
  emailError: string | null;
  emailErrorCode: 'SMTP_REJECTED' | 'TIMEOUT' | 'ERROR' | null;
  /** Quittance produite par « Générer les quittances manquantes », sans appel réel derrière. */
  backfilled: boolean;
}

/** Filtres communs à `GET .../quittances` et `GET .../lots/:lotId/quittances`. */
export interface ReceiptListQuery {
  lotId?: string;
  contactId?: string;
  kind?: ReceiptKind;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface ReceiptListResult {
  items: ReceiptView[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

/** Paramètres de `GET .../quittances/impression` : période obligatoire, grille A4 1×1 à 3×4. */
export interface ReceiptPrintQuery {
  from: string;
  to: string;
  kind?: 'QUITTANCE' | 'RECEIPT' | 'ALL';
  lotId?: string;
  contactId?: string;
  cols?: number;
  rows?: number;
}

/** Réponse de `POST .../quittances/:receiptId/envoi`. */
export interface ResendReceiptResult {
  id: string;
  number: string;
  sent: boolean;
  emailedAt: string;
}

/**
 * Réponse de `POST .../quittances/generer-manquantes`. Plafonnée par requête
 * côté API (500 appels au plus) : `remaining > 0` signifie qu'un nouveau
 * passage traitera la suite.
 */
export interface BackfillReceiptsResult {
  created: number;
  skipped: number;
  remaining: number;
}

/** Référence minimale d'un document émis, portée par un résultat de paiement (lot S3). */
export interface IssuedReceiptRef {
  id: string;
  kind: ReceiptKind;
  number: string;
}

// ---------------------------------------------------------------------------
// Lot S6 — factures et paiements des prestataires (SyndicProviderInvoice).
// ---------------------------------------------------------------------------

export type ProviderInvoiceStatus = 'RECORDED' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';
export type ProviderPaymentMethod = 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CASH' | 'CHECK' | 'CARD' | 'OTHER';

export interface ProviderInvoicePayment {
  id: string;
  invoiceId: string;
  fundId: string | null;
  fund: { id: string; name: string } | null;
  amount: number;
  paidAt: string;
  method: ProviderPaymentMethod;
  reference: string | null;
  journalEntryId: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelEntryId: string | null;
  createdById: string | null;
  createdAt: string;
}

export interface ProviderInvoice {
  id: string;
  syndicateId: string;
  providerId: string;
  provider: { id: string; name: string } | null;
  contractId: string | null;
  contract: { id: string; nature: string } | null;
  incidentId: string | null;
  incident: { id: string; description: string; status: string } | null;
  budgetLineItemId: string | null;
  budgetLine: { id: string; category: string; description: string } | null;
  fundId: string | null;
  fund: { id: string; name: string } | null;
  number: string;
  label: string;
  invoiceDate: string;
  dueDate: string | null;
  amountHT: number;
  vatAmount: number;
  amountTTC: number;
  amountPaid: number;
  amountDue: number;
  currency: string;
  expenseAccountId: string | null;
  hasFile: boolean;
  fileName: string | null;
  status: ProviderInvoiceStatus;
  cancelledAt: string | null;
  cancelReason: string | null;
  journalEntryId: string | null;
  cancelEntryId: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateChargeScheduleRequest {
  label: string;
  frequency: ChargeScheduleFrequency;
  /** 1 à 28 : jour d'émission, valable tous les mois. */
  issueDay: number;
  dueOffsetDays: number;
  amountSource: ChargeScheduleAmountSource;
  budgetId?: string | null;
  fixedAmount?: number | null;
  currency?: string;
  /** `AAAA-MM-JJ`. */
  startDate: string;
  endDate?: string | null;
  active?: boolean;
}

export type UpdateChargeScheduleRequest = Partial<CreateChargeScheduleRequest>;

export interface ChargeScheduleRunResult {
  status: ChargeScheduleRunStatus;
  alreadyProcessed: boolean;
  runId: string;
  periodStart: string;
  periodLabel: string;
  batchId: string | null;
  callsCreated: number;
  callsCovered: number;
  notificationsSent: number;
  notificationsSkipped: number;
  error: string | null;
}

export interface ExecuteChargeScheduleResult {
  run: ChargeScheduleRunResult;
  schedule: ChargeSchedule;
}

/** Renvoi des avis non envoyés d'une exécution (anomalie recette, correctif Syndic). */
export interface ResendChargeScheduleRunNoticesResult {
  /** Avis effectivement envoyés lors de CE renvoi (pas le total de l'exécution). */
  resent: number;
  /** Toujours non envoyés après ce renvoi. */
  stillSkipped: number;
  /** Exécution mise à jour (compteurs et notes recalculés sur l'ensemble des appels non couverts). */
  run: ChargeScheduleRun;
}

export interface DeleteChargeScheduleResult {
  deleted: boolean;
  deactivated: boolean;
  schedule: ChargeSchedule | null;
}

export interface ChargeSchedulePreviewLot {
  lotId: string;
  lotNumber: string;
  amount: number;
}

export interface ChargeSchedulePreviewPeriod extends ChargeSchedulePeriodDates {
  totalAmount: number | null;
  currency: string;
  budgetId: string | null;
  lots: ChargeSchedulePreviewLot[];
  error: string | null;
}

export interface ChargeSchedulePreview {
  scheduleId: string;
  active: boolean;
  periods: ChargeSchedulePreviewPeriod[];
}

export interface ProviderInvoiceDetail extends ProviderInvoice {
  payments: ProviderInvoicePayment[];
}

export interface ProviderInvoiceListQuery {
  providerId?: string;
  contractId?: string;
  incidentId?: string;
  status?: ProviderInvoiceStatus;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface ProviderInvoiceListResult {
  items: ProviderInvoice[];
  total: number;
  page: number;
  limit: number;
}

/** Résultat du rattachement automatique à une imputation d'incident (§S6). */
export type IncidentImputationLinkResult =
  | { linked: true; imputationId: string }
  | { linked: false; reason: 'NO_INCIDENT' | 'NO_SYNDICATE_BUDGET_IMPUTATION' | 'AMBIGUOUS' };

export interface CreateProviderInvoiceRequest {
  providerId: string;
  contractId?: string;
  incidentId?: string;
  budgetLineItemId?: string;
  fundId?: string;
  expenseAccountId?: string;
  expenseKind?: 'CURRENT' | 'WORKS';
  number: string;
  label: string;
  invoiceDate: string;
  dueDate?: string;
  amountHT: number;
  vatAmount?: number;
  amountTTC?: number;
  currency?: string;
  /** Présent : la requête part en multipart. Absent : JSON. */
  file?: File;
}

export interface CreateProviderInvoiceResult {
  invoice: ProviderInvoice;
  incidentImputation: IncidentImputationLinkResult;
}

export interface UpdateProviderInvoiceRequest {
  number?: string;
  label?: string;
  dueDate?: string | null;
  fundId?: string | null;
}

export interface CancelProviderInvoiceRequest {
  reason: string;
}

export interface CreateProviderPaymentRequest {
  amount: number;
  paidAt: string;
  method: ProviderPaymentMethod;
  reference?: string;
  fundId?: string;
}

export interface ProviderPaymentFundInfo {
  id: string;
  name: string;
  balance: number;
  currency: string;
}

export interface ProviderPaymentResult {
  payment: ProviderInvoicePayment | null;
  invoice: ProviderInvoice;
  fund: ProviderPaymentFundInfo | null;
  fundBalanceNegative: boolean;
}

export interface ProviderBalance {
  providerId: string;
  providerName: string;
  currency: string;
  invoicesCount: number;
  totalInvoiced: number;
  totalPaid: number;
  totalDue: number;
  overdueDue: number;
}

export type FundMovementDirection = 'CREDIT' | 'DEBIT';
export type FundMovementSourceType =
  | 'MANUAL_ADJUSTMENT'
  | 'PROVIDER_PAYMENT'
  | 'PROVIDER_PAYMENT_REVERSAL'
  | 'OPENING'
  | 'CHARGE_PAYMENT'
  | 'MANUAL_EXPENSE';

export interface FundMovement {
  id: string;
  direction: FundMovementDirection;
  amount: number;
  balanceAfter: number;
  label: string;
  sourceType: FundMovementSourceType;
  sourceId: string | null;
  createdById: string | null;
  createdAt: string;
}

export interface FundMovementsResult {
  fund: { id: string; name: string; balance: number; currency: string };
  items: FundMovement[];
  total: number;
  page: number;
  limit: number;
}
