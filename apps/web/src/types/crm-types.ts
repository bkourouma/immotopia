// CRM types for frontend

// Enums
export type CrmContactStatus = 'LEAD' | 'ACTIVE_CLIENT' | 'ARCHIVED';
export type CrmContactRoleType = 'PROPRIETAIRE' | 'LOCATAIRE' | 'COPROPRIETAIRE' | 'ACQUEREUR';
export type CrmDealType = 'ACHAT' | 'LOCATION' | 'VENTE' | 'GESTION' | 'MANDAT';
export type CrmDealStage = 'NEW' | 'QUALIFIED' | 'VISIT' | 'NEGOTIATION' | 'WON' | 'LOST';
export type CrmActivityType = 'CALL' | 'EMAIL' | 'SMS' | 'WHATSAPP' | 'VISIT' | 'MEETING' | 'NOTE' | 'TASK' | 'CORRECTION';
export type CrmActivityDirection = 'IN' | 'OUT' | 'INTERNAL';
export type CrmDealPropertyStatus = 'SHORTLISTED' | 'PROPOSED' | 'VISITED' | 'REJECTED' | 'SELECTED';

// Project Intent Structure
export interface ProjectIntent {
  projectType?: 'BUY' | 'RENT' | 'SELL' | 'MANAGE' | 'INVEST';
  urgency?: 'IMMEDIATE' | 'LESS_THAN_3_MONTHS' | 'THREE_TO_SIX_MONTHS' | 'MORE_THAN_6_MONTHS';
  propertyTypes?: string[];
  intendedUse?: 'RESIDENTIAL' | 'COMMERCIAL' | 'MIXED';
  targetZones?: string[];
  budgetMin?: number;
  budgetMax?: number;
  financingMode?: 'CASH' | 'CREDIT' | 'MIXED';
  minSurface?: number;
  roomsMin?: number;
}

// Contact
export interface Contact {
  id: string;
  tenantId: string;
  // Contact Type
  contactType?: 'PERSON' | 'COMPANY';
  // Person Identification
  civility?: 'MR' | 'MRS' | 'MS' | 'DR' | 'PROF';
  firstName: string;
  lastName: string;
  dateOfBirth?: Date;
  nationality?: string;
  identityDocumentType?: 'CNI' | 'PASSPORT' | 'DRIVING_LICENSE' | 'OTHER';
  identityDocumentNumber?: string;
  identityDocumentExpiry?: Date;
  profilePhotoUrl?: string;
  // Company Identification
  legalName?: string;
  legalForm?: 'SARL' | 'SA' | 'EI' | 'EURL' | 'SAS' | 'ASSOCIATION' | 'OTHER';
  rccm?: string;
  taxId?: string;
  representativeName?: string;
  representativeRole?: string;
  // Multi-Channel Contact Information
  email: string;
  emailSecondary?: string;
  phone?: string; // Legacy, maps to phonePrimary
  phonePrimary?: string;
  phoneSecondary?: string;
  whatsappNumber?: string;
  address?: string;
  city?: string; // Legacy - to be deprecated
  district?: string; // Legacy - to be deprecated
  country?: string; // Legacy - to be deprecated
  communeId?: string;
  locationZone?: string;
  preferredLanguage?: string;
  preferredContactChannel?: 'CALL' | 'WHATSAPP' | 'EMAIL' | 'SMS';
  // Real Estate Project Intent
  projectIntent?: ProjectIntent;
  // Socio-Professional Profile
  profession?: string;
  sectorOfActivity?: string;
  employer?: string;
  incomeMin?: number;
  incomeMax?: number;
  jobStability?: 'CDI' | 'CDD' | 'FREELANCE' | 'INFORMAL' | 'RETIRED' | 'STUDENT' | 'UNEMPLOYED' | 'OTHER';
  borrowingCapacity?: 'YES' | 'NO' | 'UNKNOWN';
  // CRM Behavior & Scoring
  source?: string; // Legacy
  leadSource?: 'WEBSITE' | 'SOCIAL_MEDIA' | 'REFERRAL' | 'CAMPAIGN' | 'AGENCY' | 'WALK_IN' | 'PHONE_CALL' | 'OTHER';
  maturityLevel?: 'COLD' | 'WARM' | 'HOT';
  score?: number;
  priorityLevel?: 'LOW' | 'NORMAL' | 'HIGH';
  status: CrmContactStatus;
  assignedToUserId?: string;
  lastInteractionAt?: Date;
  nextActionAt?: Date;
  // Financial Snapshot
  balance?: number;
  totalPaid?: number;
  totalDue?: number;
  depositAmount?: number;
  paymentIncidentsCount?: number;
  preferredPaymentMethod?: 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CASH' | 'CHECK' | 'CARD' | 'OTHER';
  // Consents & Compliance
  consentMarketing?: boolean;
  consentWhatsapp?: boolean;
  consentEmail?: boolean;
  consentDate?: Date;
  consentSource?: string;
  // Internal Notes
  internalNotes?: string;
  // Legacy fields (backward compatibility)
  numeroPieceId?: string;
  fonction?: string;
  salaire?: number;
  // Relations
  roles?: ContactRole[];
  tags?: Tag[];
  activeDeal?: Deal | null;
  nextAction?: {
    id: string;
    nextActionAt: Date;
    nextActionType: string | null;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContactDetail extends Contact {
  roles?: ContactRole[];
  deals?: Deal[];
  recentActivities?: Activity[];
  tags?: Tag[];
}

export interface ContactRole {
  id: string;
  role: CrmContactRoleType;
  active: boolean;
  startedAt: Date;
  endedAt?: Date;
}

// Deal
export interface Deal {
  id: string;
  tenantId: string;
  contactId: string;
  type: CrmDealType;
  stage: CrmDealStage;
  budgetMin?: number;
  budgetMax?: number;
  locationZone?: string;
  criteriaJson?: Record<string, unknown>;
  expectedValue?: number;
  probability?: number;
  assignedToUserId?: string;
  closedReason?: string;
  closedAt?: Date;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DealDetail extends Deal {
  contact?: Contact;
  activities?: Activity[];
  propertyMatches?: DealProperty[];
}

// Activity
export interface Activity {
  id: string;
  tenantId: string;
  contactId?: string;
  dealId?: string;
  activityType: CrmActivityType;
  direction?: CrmActivityDirection;
  subject?: string;
  content: string;
  outcome?: string;
  occurredAt: Date;
  createdByUserId: string;
  createdBy?: {
    id: string;
    email: string;
    fullName?: string;
  };
  contact?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  deal?: {
    id: string;
    type: CrmDealType;
    stage: CrmDealStage;
  };
  nextActionAt?: Date;
  nextActionType?: string;
  correctionOfId?: string;
  createdAt: Date;
}

// Deal Property Match
export interface DealProperty {
  id: string;
  dealId: string;
  propertyId: string;
  matchScore?: number;
  matchExplanationJson?: Record<string, unknown>;
  status: CrmDealPropertyStatus;
  createdAt: Date;
}

// Tag
export interface Tag {
  id: string;
  tenantId: string;
  name: string;
  color?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Property Match
export interface PropertyMatch {
  propertyId: string;
  matchScore: number;
  matchExplanation: {
    budgetFit?: number;
    zoneFit?: number;
    sizeFit?: number;
    extrasFit?: number;
    breakdown?: string;
  };
}

// Dashboard
export interface DashboardKPIs {
  newLeads: number;
  hotLeads: number;
  dealsInNegotiation: number;
}

export interface NextBestAction {
  type: 'FOLLOW_UP';
  description: string;
  dueDate: Date;
  contactId?: string;
  dealId?: string;
  activityId?: string;
}

export interface Dashboard {
  kpis: DashboardKPIs;
  nextActions: NextBestAction[];
}

// Request types
export interface CreateContactRequest {
  contactType?: 'PERSON' | 'COMPANY';
  civility?: 'MR' | 'MRS' | 'MS' | 'DR' | 'PROF';
  firstName: string;
  lastName: string;
  dateOfBirth?: Date | string;
  nationality?: string;
  identityDocumentType?: 'CNI' | 'PASSPORT' | 'DRIVING_LICENSE' | 'OTHER';
  identityDocumentNumber?: string;
  identityDocumentExpiry?: Date | string;
  profilePhotoUrl?: string;
  legalName?: string;
  legalForm?: 'SARL' | 'SA' | 'EI' | 'EURL' | 'SAS' | 'ASSOCIATION' | 'OTHER';
  rccm?: string;
  taxId?: string;
  representativeName?: string;
  representativeRole?: string;
  email: string;
  emailSecondary?: string;
  phone?: string;
  phonePrimary?: string;
  phoneSecondary?: string;
  whatsappNumber?: string;
  address?: string;
  city?: string;
  district?: string;
  country?: string;
  communeId?: string;
  locationZone?: string;
  targetZoneIds?: string[]; // Array of commune IDs for target zones
  preferredLanguage?: string;
  preferredContactChannel?: 'CALL' | 'WHATSAPP' | 'EMAIL' | 'SMS';
  projectIntent?: ProjectIntent;
  profession?: string;
  sectorOfActivity?: string;
  employer?: string;
  incomeMin?: number;
  incomeMax?: number;
  jobStability?: 'CDI' | 'CDD' | 'FREELANCE' | 'INFORMAL' | 'RETIRED' | 'STUDENT' | 'UNEMPLOYED' | 'OTHER';
  borrowingCapacity?: 'YES' | 'NO' | 'UNKNOWN';
  source?: string;
  leadSource?: 'WEBSITE' | 'SOCIAL_MEDIA' | 'REFERRAL' | 'CAMPAIGN' | 'AGENCY' | 'WALK_IN' | 'PHONE_CALL' | 'OTHER';
  maturityLevel?: 'COLD' | 'WARM' | 'HOT';
  score?: number;
  priorityLevel?: 'LOW' | 'NORMAL' | 'HIGH';
  assignedToUserId?: string;
  consentMarketing?: boolean;
  consentWhatsapp?: boolean;
  consentEmail?: boolean;
  consentSource?: string;
  internalNotes?: string;
  numeroPieceId?: string;
  fonction?: string;
  salaire?: number;
}

export interface UpdateContactRequest {
  contactType?: 'PERSON' | 'COMPANY';
  civility?: 'MR' | 'MRS' | 'MS' | 'DR' | 'PROF';
  firstName?: string;
  lastName?: string;
  dateOfBirth?: Date | string | null;
  nationality?: string | null;
  identityDocumentType?: 'CNI' | 'PASSPORT' | 'DRIVING_LICENSE' | 'OTHER' | null;
  identityDocumentNumber?: string | null;
  identityDocumentExpiry?: Date | string | null;
  profilePhotoUrl?: string | null;
  legalName?: string | null;
  legalForm?: 'SARL' | 'SA' | 'EI' | 'EURL' | 'SAS' | 'ASSOCIATION' | 'OTHER' | null;
  rccm?: string | null;
  taxId?: string | null;
  representativeName?: string | null;
  representativeRole?: string | null;
  email?: string;
  emailSecondary?: string | null;
  phone?: string | null;
  phonePrimary?: string | null;
  phoneSecondary?: string | null;
  whatsappNumber?: string | null;
  address?: string | null;
  city?: string | null; // Legacy - to be deprecated
  district?: string | null; // Legacy - to be deprecated
  country?: string | null; // Legacy - to be deprecated
  communeId?: string | null;
  locationZone?: string | null;
  targetZoneIds?: string[] | null; // Array of commune IDs for target zones
  preferredLanguage?: string | null;
  preferredContactChannel?: 'CALL' | 'WHATSAPP' | 'EMAIL' | 'SMS' | null;
  projectIntent?: ProjectIntent | null;
  profession?: string | null;
  sectorOfActivity?: string | null;
  employer?: string | null;
  incomeMin?: number | null;
  incomeMax?: number | null;
  jobStability?: 'CDI' | 'CDD' | 'FREELANCE' | 'INFORMAL' | 'RETIRED' | 'STUDENT' | 'UNEMPLOYED' | 'OTHER' | null;
  borrowingCapacity?: 'YES' | 'NO' | 'UNKNOWN' | null;
  source?: string | null;
  leadSource?: 'WEBSITE' | 'SOCIAL_MEDIA' | 'REFERRAL' | 'CAMPAIGN' | 'AGENCY' | 'WALK_IN' | 'PHONE_CALL' | 'OTHER' | null;
  maturityLevel?: 'COLD' | 'WARM' | 'HOT' | null;
  score?: number | null;
  priorityLevel?: 'LOW' | 'NORMAL' | 'HIGH' | null;
  status?: CrmContactStatus;
  assignedToUserId?: string | null;
  balance?: number | null;
  totalPaid?: number | null;
  totalDue?: number | null;
  depositAmount?: number | null;
  paymentIncidentsCount?: number | null;
  preferredPaymentMethod?: 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CASH' | 'CHECK' | 'CARD' | 'OTHER' | null;
  consentMarketing?: boolean | null;
  consentWhatsapp?: boolean | null;
  consentEmail?: boolean | null;
  consentSource?: string | null;
  internalNotes?: string | null;
  numeroPieceId?: string | null;
  fonction?: string | null;
  salaire?: number | null;
}

export interface ConvertContactRequest {
  roles: CrmContactRoleType[];
}

export interface CreateDealRequest {
  contactId: string;
  type: CrmDealType;
  budgetMin?: number;
  budgetMax?: number;
  locationZone?: string;
  criteriaJson?: Record<string, unknown>;
  expectedValue?: number;
  assignedToUserId?: string;
}

export interface UpdateDealRequest {
  type?: CrmDealType;
  stage?: CrmDealStage;
  budgetMin?: number;
  budgetMax?: number;
  locationZone?: string;
  criteriaJson?: Record<string, unknown>;
  expectedValue?: number;
  probability?: number;
  assignedToUserId?: string | null;
  closedReason?: string;
  version: number;
}

export interface CreateActivityRequest {
  contactId: string; // Required
  dealId?: string; // Optional
  activityType: CrmActivityType;
  direction?: CrmActivityDirection;
  subject?: string;
  content: string;
  outcome?: string;
  occurredAt?: Date;
  nextActionAt?: Date;
  nextActionType?: string;
}

export interface UpdatePropertyMatchStatusRequest {
  status: CrmDealPropertyStatus;
}

// Filter types
export interface ContactFilters {
  status?: CrmContactStatus;
  source?: string;
  assignedTo?: string;
  tag?: string;
  tagIds?: string[];
  search?: string;
  startDate?: string;
  endDate?: string;
  hasActiveDeal?: boolean;
  hasUpcomingActivity?: boolean;
  page?: number;
  limit?: number;
}

export interface DealFilters {
  type?: CrmDealType;
  stage?: CrmDealStage;
  assignedTo?: string;
  contactId?: string;
  budgetMin?: number;
  budgetMax?: number;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface ActivityFilters {
  contactId?: string;
  dealId?: string;
  type?: CrmActivityType;
  createdBy?: string; // Collaborator/user who created the activity
  startDate?: string; // ISO date string for period start
  endDate?: string; // ISO date string for period end
  page?: number;
  limit?: number;
}

// Pagination
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  contacts?: T[];
  deals?: T[];
  activities?: T[];
  matches?: T[];
  pagination: Pagination;
}

// Type aliases for backward compatibility with "Crm" prefix naming
export type CrmContact = Contact;
export type CrmContactDetail = ContactDetail;
export type CrmDeal = Deal;
export type CrmDealDetail = DealDetail;
export type CrmActivity = Activity;
export type CrmTag = Tag;

// Request type aliases
export type CreateCrmContactRequest = CreateContactRequest;
export type UpdateCrmContactRequest = UpdateContactRequest;
export type CreateCrmDealRequest = CreateDealRequest;
export type UpdateCrmDealRequest = UpdateDealRequest;
export type CreateCrmActivityRequest = CreateActivityRequest;

