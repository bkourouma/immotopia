import {
  CrmContact,
  CrmContactRole,
  CrmDeal,
  CrmActivity,
  CrmDealProperty,
  CrmTag,
  CrmContactTag,
  CrmNote,
  CrmContactStatus,
  CrmContactRoleType,
  CrmDealType,
  CrmDealStage,
  CrmActivityType,
  CrmActivityDirection,
  CrmDealPropertyStatus,
  CrmEntityType
} from '@prisma/client';

// Re-export Prisma types
export type {
  CrmContact,
  CrmContactRole,
  CrmDeal,
  CrmActivity,
  CrmDealProperty,
  CrmTag,
  CrmContactTag,
  CrmNote,
  CrmContactStatus,
  CrmContactRoleType,
  CrmDealType,
  CrmDealStage,
  CrmActivityType,
  CrmActivityDirection,
  CrmDealPropertyStatus,
  CrmEntityType
};

// Extended Contact with relationships
export interface ContactDetail extends CrmContact {
  roles?: CrmContactRole[];
  deals?: CrmDeal[];
  recentActivities?: CrmActivity[];
  tags?: (CrmTag & { CrmContactTag: CrmContactTag })[];
  activeDeal?: CrmDeal | null;
  nextAction?: {
    id: string;
    nextActionAt: Date;
    nextActionType: string | null;
  } | null;
}

// Project Intent Structure (for JSON field)
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

// Create contact request
export interface CreateContactRequest {
  // Contact Type
  contactType?: 'PERSON' | 'COMPANY';

  // Person Identification
  civility?: 'MR' | 'MRS' | 'MS' | 'DR' | 'PROF';
  firstName: string;
  lastName: string;
  dateOfBirth?: Date | string;
  nationality?: string;
  identityDocumentType?: 'CNI' | 'PASSPORT' | 'DRIVING_LICENSE' | 'OTHER';
  identityDocumentNumber?: string;
  identityDocumentExpiry?: Date | string;
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
  phone?: string; // Maps to phonePrimary for backward compatibility
  phonePrimary?: string;
  phoneSecondary?: string;
  whatsappNumber?: string;
  address?: string;
  city?: string; // Legacy - to be deprecated
  district?: string; // Legacy - to be deprecated
  country?: string; // Legacy - to be deprecated
  communeId?: string;
  locationZone?: string;
  targetZoneIds?: string[]; // Array of commune IDs for target zones
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
  source?: string; // Legacy field
  leadSource?: 'WEBSITE' | 'SOCIAL_MEDIA' | 'REFERRAL' | 'CAMPAIGN' | 'AGENCY' | 'WALK_IN' | 'PHONE_CALL' | 'OTHER';
  maturityLevel?: 'COLD' | 'WARM' | 'HOT';
  score?: number;
  priorityLevel?: 'LOW' | 'NORMAL' | 'HIGH';

  // Status & Assignment
  assignedToUserId?: string;

  // Consents & Compliance
  consentMarketing?: boolean;
  consentWhatsapp?: boolean;
  consentEmail?: boolean;
  consentSource?: string;

  // Internal Notes
  internalNotes?: string;

  // Legacy fields (backward compatibility)
  numeroPieceId?: string;
  fonction?: string;
  salaire?: number;
}

// Update contact request
export interface UpdateContactRequest {
  // Contact Type
  contactType?: 'PERSON' | 'COMPANY';

  // Person Identification
  civility?: 'MR' | 'MRS' | 'MS' | 'DR' | 'PROF';
  firstName?: string;
  lastName?: string;
  dateOfBirth?: Date | string | null;
  nationality?: string | null;
  identityDocumentType?: 'CNI' | 'PASSPORT' | 'DRIVING_LICENSE' | 'OTHER' | null;
  identityDocumentNumber?: string | null;
  identityDocumentExpiry?: Date | string | null;
  profilePhotoUrl?: string | null;

  // Company Identification
  legalName?: string | null;
  legalForm?: 'SARL' | 'SA' | 'EI' | 'EURL' | 'SAS' | 'ASSOCIATION' | 'OTHER' | null;
  rccm?: string | null;
  taxId?: string | null;
  representativeName?: string | null;
  representativeRole?: string | null;

  // Multi-Channel Contact Information
  email?: string;
  emailSecondary?: string | null;
  phone?: string | null; // Maps to phonePrimary
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

  // Real Estate Project Intent
  projectIntent?: ProjectIntent | null;

  // Socio-Professional Profile
  profession?: string | null;
  sectorOfActivity?: string | null;
  employer?: string | null;
  incomeMin?: number | null;
  incomeMax?: number | null;
  jobStability?: 'CDI' | 'CDD' | 'FREELANCE' | 'INFORMAL' | 'RETIRED' | 'STUDENT' | 'UNEMPLOYED' | 'OTHER' | null;
  borrowingCapacity?: 'YES' | 'NO' | 'UNKNOWN' | null;

  // CRM Behavior & Scoring
  source?: string | null; // Legacy
  leadSource?:
    | 'WEBSITE'
    | 'SOCIAL_MEDIA'
    | 'REFERRAL'
    | 'CAMPAIGN'
    | 'AGENCY'
    | 'WALK_IN'
    | 'PHONE_CALL'
    | 'OTHER'
    | null;
  maturityLevel?: 'COLD' | 'WARM' | 'HOT' | null;
  score?: number | null;
  priorityLevel?: 'LOW' | 'NORMAL' | 'HIGH' | null;

  // Status & Assignment
  status?: CrmContactStatus;
  assignedToUserId?: string | null;

  // Financial Snapshot
  balance?: number | null;
  totalPaid?: number | null;
  totalDue?: number | null;
  depositAmount?: number | null;
  paymentIncidentsCount?: number | null;
  preferredPaymentMethod?: 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CASH' | 'CHECK' | 'CARD' | 'OTHER' | null;

  // Consents & Compliance
  consentMarketing?: boolean | null;
  consentWhatsapp?: boolean | null;
  consentEmail?: boolean | null;
  consentSource?: string | null;

  // Internal Notes
  internalNotes?: string | null;

  // Legacy fields
  numeroPieceId?: string | null;
  fonction?: string | null;
  salaire?: number | null;
}

// Convert contact request
export interface ConvertContactRequest {
  roles: CrmContactRoleType[];
}

// Extended Deal with relationships
export interface DealDetail extends CrmDeal {
  contact?: CrmContact;
  activities?: CrmActivity[];
  propertyMatches?: CrmDealProperty[];
}

// Create deal request
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

// Update deal request (includes version for optimistic locking)
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
  version: number; // Required for optimistic locking
}

// Create activity request
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
  correctionOfId?: string; // For correction activities
}

// Property match result
export interface PropertyMatch {
  propertyId: string;
  matchScore: number; // 0-100
  matchExplanation: {
    budgetFit?: number;
    zoneFit?: number;
    sizeFit?: number;
    extrasFit?: number;
    breakdown?: string;
  };
}

// Update property match status request
export interface UpdatePropertyMatchStatusRequest {
  status: CrmDealPropertyStatus;
}

// Dashboard KPIs
export interface DashboardKPIs {
  newLeads: number; // Last 7 days
  hotLeads: number; // Leads with deals in QUALIFIED/VISIT/NEGOTIATION
  dealsInNegotiation: number; // Deals in NEGOTIATION stage
}

// Next best action
export interface NextBestAction {
  type: 'FOLLOW_UP';
  description: string;
  dueDate: Date;
  contactId?: string;
  dealId?: string;
  activityId?: string;
}

// Dashboard response
export interface Dashboard {
  kpis: DashboardKPIs;
  nextActions: NextBestAction[];
}

// Contact filters
export interface ContactFilters {
  status?: CrmContactStatus;
  source?: string;
  assignedTo?: string;
  tag?: string;
  search?: string; // Search by name or email
  startDate?: string; // ISO date string for creation date range start
  endDate?: string; // ISO date string for creation date range end
  hasActiveDeal?: boolean; // Filter contacts with active deals
  hasUpcomingActivity?: boolean; // Filter contacts with upcoming activities
  page?: number;
  limit?: number;
}

// Deal filters
export interface DealFilters {
  type?: CrmDealType;
  stage?: CrmDealStage;
  assignedTo?: string;
  contactId?: string;
  budgetMin?: number;
  budgetMax?: number;
  startDate?: string; // ISO date string for creation date range start
  endDate?: string; // ISO date string for creation date range end
  page?: number;
  limit?: number;
}

// Activity filters
export interface ActivityFilters {
  contactId?: string;
  dealId?: string;
  type?: CrmActivityType;
  createdBy?: string; // User ID who created the activity
  startDate?: string; // ISO date string for period start
  endDate?: string; // ISO date string for period end
  page?: number;
  limit?: number;
}

// Pagination response
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// Paginated response wrapper
export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
}

// Zod validation schemas
import { z } from 'zod';
import { httpUrl } from '../lib/safe-url';

// Helper schema for project intent JSON
const projectIntentSchema = z
  .object({
    projectType: z.enum(['BUY', 'RENT', 'SELL', 'MANAGE', 'INVEST']).optional(),
    urgency: z.enum(['IMMEDIATE', 'LESS_THAN_3_MONTHS', 'THREE_TO_SIX_MONTHS', 'MORE_THAN_6_MONTHS']).optional(),
    propertyTypes: z.array(z.string()).optional(),
    intendedUse: z.enum(['RESIDENTIAL', 'COMMERCIAL', 'MIXED']).optional(),
    targetZones: z.array(z.string()).optional(),
    budgetMin: z.number().nonnegative().optional(),
    budgetMax: z.number().nonnegative().optional(),
    financingMode: z.enum(['CASH', 'CREDIT', 'MIXED']).optional(),
    minSurface: z.number().nonnegative().optional(),
    roomsMin: z.number().int().nonnegative().optional()
  })
  .optional();

export const createContactSchema = z.object({
  // Contact Type
  contactType: z.enum(['PERSON', 'COMPANY']).optional(),

  // Person Identification
  civility: z.enum(['MR', 'MRS', 'MS', 'DR', 'PROF']).optional(),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  dateOfBirth: z.union([z.date(), z.string()]).optional(),
  nationality: z.string().optional(),
  identityDocumentType: z.enum(['CNI', 'PASSPORT', 'DRIVING_LICENSE', 'OTHER']).optional(),
  identityDocumentNumber: z.string().optional(),
  identityDocumentExpiry: z.union([z.date(), z.string()]).optional(),
  profilePhotoUrl: httpUrl().optional(),

  // Company Identification
  legalName: z.string().optional(),
  legalForm: z.enum(['SARL', 'SA', 'EI', 'EURL', 'SAS', 'ASSOCIATION', 'OTHER']).optional(),
  rccm: z.string().optional(),
  taxId: z.string().optional(),
  representativeName: z.string().optional(),
  representativeRole: z.string().optional(),

  // Multi-Channel Contact Information
  email: z.string().email('Invalid email address'),
  emailSecondary: z.string().email().optional(),
  phone: z.string().optional(), // Legacy, maps to phonePrimary
  phonePrimary: z.string().optional(),
  phoneSecondary: z.string().optional(),
  whatsappNumber: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(), // Legacy
  district: z.string().optional(), // Legacy
  country: z.string().optional(), // Legacy
  communeId: z
    .union([z.string().uuid(), z.literal('')])
    .optional()
    .transform(v => (v === '' ? undefined : v)),
  locationZone: z.string().optional(),
  preferredLanguage: z.string().optional(),
  preferredContactChannel: z.enum(['CALL', 'WHATSAPP', 'EMAIL', 'SMS']).optional(),

  // Real Estate Project Intent (optional on create)
  projectIntent: projectIntentSchema.optional(),

  // Socio-Professional Profile
  profession: z.string().optional(),
  sectorOfActivity: z.string().optional(),
  employer: z.string().optional(),
  incomeMin: z.number().nonnegative().optional(),
  incomeMax: z.number().nonnegative().optional(),
  jobStability: z.enum(['CDI', 'CDD', 'FREELANCE', 'INFORMAL', 'RETIRED', 'STUDENT', 'UNEMPLOYED', 'OTHER']).optional(),
  borrowingCapacity: z.enum(['YES', 'NO', 'UNKNOWN']).optional(),

  // CRM Behavior & Scoring
  source: z.string().optional(), // Legacy
  leadSource: z
    .enum(['WEBSITE', 'SOCIAL_MEDIA', 'REFERRAL', 'CAMPAIGN', 'AGENCY', 'WALK_IN', 'PHONE_CALL', 'OTHER'])
    .optional(),
  maturityLevel: z.enum(['COLD', 'WARM', 'HOT']).optional(),
  score: z.number().int().min(0).max(100).optional(),
  priorityLevel: z.enum(['LOW', 'NORMAL', 'HIGH']).optional(),

  // Status & Assignment
  assignedToUserId: z.string().uuid().optional(),

  // Consents & Compliance
  consentMarketing: z.boolean().optional(),
  consentWhatsapp: z.boolean().optional(),
  consentEmail: z.boolean().optional(),
  consentSource: z.string().optional(),

  // Internal Notes
  internalNotes: z.string().optional(),

  // Legacy fields
  numeroPieceId: z.string().optional(),
  fonction: z.string().optional(),
  salaire: z.number().nonnegative().optional()
});

export const updateContactSchema = z.object({
  // Contact Type
  contactType: z.enum(['PERSON', 'COMPANY']).optional().nullable(),

  // Person Identification
  civility: z.enum(['MR', 'MRS', 'MS', 'DR', 'PROF']).optional().nullable(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  dateOfBirth: z.union([z.date(), z.string()]).optional().nullable(),
  nationality: z.string().optional().nullable(),
  identityDocumentType: z.enum(['CNI', 'PASSPORT', 'DRIVING_LICENSE', 'OTHER']).optional().nullable(),
  identityDocumentNumber: z.string().optional().nullable(),
  identityDocumentExpiry: z.union([z.date(), z.string()]).optional().nullable(),
  profilePhotoUrl: httpUrl().optional().nullable(),

  // Company Identification
  legalName: z.string().optional().nullable(),
  legalForm: z.enum(['SARL', 'SA', 'EI', 'EURL', 'SAS', 'ASSOCIATION', 'OTHER']).optional().nullable(),
  rccm: z.string().optional().nullable(),
  taxId: z.string().optional().nullable(),
  representativeName: z.string().optional().nullable(),
  representativeRole: z.string().optional().nullable(),

  // Multi-Channel Contact Information
  email: z.string().email().optional(),
  emailSecondary: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(), // Legacy
  phonePrimary: z.string().optional().nullable(),
  phoneSecondary: z.string().optional().nullable(),
  whatsappNumber: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(), // Legacy
  district: z.string().optional().nullable(), // Legacy
  country: z.string().optional().nullable(), // Legacy
  communeId: z.string().uuid().optional().nullable(),
  locationZone: z.string().optional().nullable(),
  preferredLanguage: z.string().optional().nullable(),
  preferredContactChannel: z.enum(['CALL', 'WHATSAPP', 'EMAIL', 'SMS']).optional().nullable(),

  // Real Estate Project Intent
  projectIntent: projectIntentSchema.nullable(),

  // Socio-Professional Profile
  profession: z.string().optional().nullable(),
  sectorOfActivity: z.string().optional().nullable(),
  employer: z.string().optional().nullable(),
  incomeMin: z.number().nonnegative().optional().nullable(),
  incomeMax: z.number().nonnegative().optional().nullable(),
  jobStability: z
    .enum(['CDI', 'CDD', 'FREELANCE', 'INFORMAL', 'RETIRED', 'STUDENT', 'UNEMPLOYED', 'OTHER'])
    .optional()
    .nullable(),
  borrowingCapacity: z.enum(['YES', 'NO', 'UNKNOWN']).optional().nullable(),

  // CRM Behavior & Scoring
  source: z.string().optional().nullable(), // Legacy
  leadSource: z
    .enum(['WEBSITE', 'SOCIAL_MEDIA', 'REFERRAL', 'CAMPAIGN', 'AGENCY', 'WALK_IN', 'PHONE_CALL', 'OTHER'])
    .optional()
    .nullable(),
  maturityLevel: z.enum(['COLD', 'WARM', 'HOT']).optional().nullable(),
  score: z.number().int().min(0).max(100).optional().nullable(),
  priorityLevel: z.enum(['LOW', 'NORMAL', 'HIGH']).optional().nullable(),

  // Status & Assignment
  status: z.enum(['LEAD', 'ACTIVE_CLIENT', 'ARCHIVED']).optional(),
  assignedToUserId: z.string().uuid().optional().nullable(),

  // Financial Snapshot
  balance: z.number().optional().nullable(),
  totalPaid: z.number().optional().nullable(),
  totalDue: z.number().optional().nullable(),
  depositAmount: z.number().optional().nullable(),
  paymentIncidentsCount: z.number().int().nonnegative().optional().nullable(),
  preferredPaymentMethod: z
    .enum(['MOBILE_MONEY', 'BANK_TRANSFER', 'CASH', 'CHECK', 'CARD', 'OTHER'])
    .optional()
    .nullable(),

  // Consents & Compliance
  consentMarketing: z.boolean().optional().nullable(),
  consentWhatsapp: z.boolean().optional().nullable(),
  consentEmail: z.boolean().optional().nullable(),
  consentSource: z.string().optional().nullable(),

  // Internal Notes
  internalNotes: z.string().optional().nullable(),

  // Legacy fields
  numeroPieceId: z.string().optional().nullable(),
  fonction: z.string().optional().nullable(),
  salaire: z.number().nonnegative().optional().nullable()
});

export const createDealSchema = z
  .object({
    contactId: z.string().uuid('Contact ID must be a valid UUID'),
    type: z.enum(['ACHAT', 'LOCATION', 'VENTE', 'GESTION', 'MANDAT']),
    budgetMin: z.number().positive().optional(),
    budgetMax: z.number().positive().optional(),
    locationZone: z.string().optional(),
    criteriaJson: z.record(z.unknown()).optional(),
    expectedValue: z.number().positive().optional(),
    assignedToUserId: z.string().uuid().optional()
  })
  .refine(
    data => {
      if (data.budgetMin && data.budgetMax) {
        return data.budgetMax >= data.budgetMin;
      }
      return true;
    },
    {
      message: 'Budget max must be greater than or equal to budget min',
      path: ['budgetMax']
    }
  );

export const updateDealSchema = z
  .object({
    type: z.enum(['ACHAT', 'LOCATION', 'VENTE', 'GESTION', 'MANDAT']).optional(),
    stage: z.enum(['NEW', 'QUALIFIED', 'VISIT', 'NEGOTIATION', 'WON', 'LOST']).optional(),
    budgetMin: z.number().positive().optional(),
    budgetMax: z.number().positive().optional(),
    locationZone: z.string().optional().nullable(),
    criteriaJson: z.record(z.unknown()).optional(),
    expectedValue: z.number().positive().optional(),
    probability: z.number().min(0).max(1).optional(),
    assignedToUserId: z.string().uuid().optional().nullable(),
    closedReason: z.string().optional(),
    version: z.number().int().positive('Version is required for optimistic locking')
  })
  .refine(
    data => {
      if (data.budgetMin && data.budgetMax) {
        return data.budgetMax >= data.budgetMin;
      }
      return true;
    },
    {
      message: 'Budget max must be greater than or equal to budget min',
      path: ['budgetMax']
    }
  );

export const createActivitySchema = z.object({
  contactId: z.string().uuid('Contact ID must be a valid UUID'),
  dealId: z.string().uuid().optional(),
  activityType: z.enum(['CALL', 'EMAIL', 'SMS', 'WHATSAPP', 'VISIT', 'MEETING', 'NOTE', 'TASK', 'CORRECTION']),
  direction: z.enum(['IN', 'OUT', 'INTERNAL']).optional(),
  subject: z.string().optional(),
  content: z.string().min(1, 'Content is required'),
  outcome: z.string().optional(),
  occurredAt: z.coerce.date().optional(),
  nextActionAt: z.coerce.date().optional(),
  nextActionType: z.string().optional(),
  correctionOfId: z.string().uuid().optional()
});

export const convertContactSchema = z.object({
  roles: z
    .array(z.enum(['PROPRIETAIRE', 'LOCATAIRE', 'COPROPRIETAIRE', 'ACQUEREUR']))
    .min(1, 'At least one role must be provided')
});
