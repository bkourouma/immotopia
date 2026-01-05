import {
  Property,
  PropertyTypeTemplate,
  PropertyMedia,
  PropertyDocument,
  PropertyStatusHistory,
  PropertyVisit,
  PropertyMandate,
  PropertyQualityScore,
  PropertyType,
  PropertyOwnershipType,
  PropertyTransactionMode,
  PropertyFurnishingStatus,
  PropertyStatus,
  PropertyAvailability,
  PropertyMediaType,
  PropertyDocumentType,
  PropertyVisitType,
  PropertyVisitStatus,
  PropertyVisitGoal
} from '@prisma/client';

// Re-export Prisma types
export type {
  Property,
  PropertyTypeTemplate,
  PropertyMedia,
  PropertyDocument,
  PropertyStatusHistory,
  PropertyVisit,
  PropertyMandate,
  PropertyQualityScore,
  PropertyType,
  PropertyOwnershipType,
  PropertyTransactionMode,
  PropertyFurnishingStatus,
  PropertyStatus,
  PropertyAvailability,
  PropertyMediaType,
  PropertyDocumentType,
  PropertyVisitType,
  PropertyVisitStatus,
  PropertyVisitGoal
};

// Extended Property with relationships
export interface PropertyDetail extends Property {
  media?: PropertyMedia[];
  documents?: PropertyDocument[];
  statusHistory?: PropertyStatusHistory[];
  visits?: PropertyVisit[];
  mandates?: PropertyMandate[];
  qualityScores?: PropertyQualityScore[];
  containerParent?: Property | null;
  containerChildren?: Property[];
  tenant?: { id: string; name: string } | null;
  owner?: { id: string; email: string; fullName: string | null } | null;
}

// Property creation request
export interface CreatePropertyRequest {
  propertyType: PropertyType;
  ownershipType: PropertyOwnershipType;
  tenantId?: string;
  ownerUserId?: string;
  ownerEmail?: string; // Alternative to ownerUserId - will find/create User by email
  title: string;
  description: string;
  address: string;
  locationZone?: string;
  latitude?: number;
  longitude?: number;
  transactionModes: PropertyTransactionMode[];
  price?: number;
  fees?: number;
  currency?: string;
  surfaceArea?: number;
  surfaceUseful?: number;
  surfaceTerrain?: number;
  rooms?: number;
  bedrooms?: number;
  bathrooms?: number;
  furnishingStatus?: PropertyFurnishingStatus;
  availability?: PropertyAvailability;
  typeSpecificData?: Record<string, any>;
}

// Property update request
export interface UpdatePropertyRequest {
  ownerUserId?: string;
  title?: string;
  description?: string;
  address?: string;
  locationZone?: string;
  latitude?: number;
  longitude?: number;
  transactionModes?: PropertyTransactionMode[];
  price?: number;
  fees?: number;
  currency?: string;
  surfaceArea?: number;
  surfaceUseful?: number;
  surfaceTerrain?: number;
  rooms?: number;
  bedrooms?: number;
  bathrooms?: number;
  furnishingStatus?: PropertyFurnishingStatus;
  availability?: PropertyAvailability;
  typeSpecificData?: Record<string, any>;
}

// Property template field definition
export interface PropertyField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'date';
  required: boolean;
  defaultValue?: any;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    options?: string[];
  };
  section: string;
}

// Property template section
export interface PropertySection {
  key: string;
  label: string;
  order: number;
  fields: string[]; // Field keys
}

// Property template configuration
export interface PropertyTemplate {
  propertyType: PropertyType;
  name: string;
  description?: string;
  fieldDefinitions: PropertyField[];
  sections: PropertySection[];
  validationRules: Record<string, any>;
}

// Property search request
export interface PropertySearchRequest {
  propertyType?: PropertyType;
  location?: string;
  locationZone?: string;
  priceMin?: number;
  priceMax?: number;
  surfaceAreaMin?: number;
  surfaceAreaMax?: number;
  rooms?: number;
  bedrooms?: number;
  features?: string[];
  transactionMode?: PropertyTransactionMode;
  status?: PropertyStatus;
  ownershipType?: PropertyOwnershipType;
  latitude?: number;
  longitude?: number;
  radius?: number; // meters
  page?: number;
  limit?: number;
}

// Property search response
export interface PropertySearchResponse {
  properties: PropertyDetail[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Property match result
export interface PropertyMatch {
  property: PropertyDetail;
  matchScore: number; // 0-100
  matchExplanation: string;
  matchedCriteria: {
    budget: { matched: boolean; score: number; explanation: string };
    location: { matched: boolean; score: number; explanation: string };
    size: { matched: boolean; score: number; explanation: string };
    features: { matched: boolean; score: number; explanation: string };
    priceCoherence: { matched: boolean; score: number; explanation: string };
  };
}

// Property quality score with suggestions
export interface PropertyQualityScoreDetail extends PropertyQualityScore {
  suggestions: string[];
}

// Management mandate creation request
export interface CreateMandateRequest {
  propertyId: string;
  tenantId: string;
  startDate: Date;
  endDate?: Date;
  notes?: string;
}

// Property visit creation request
export interface CreateVisitRequest {
  propertyId: string;
  contactId?: string;
  dealId?: string;
  visitType: PropertyVisitType;
  goal?: PropertyVisitGoal;
  scheduledAt: Date;
  duration?: number; // minutes
  location?: string;
  assignedToUserId?: string;
  notes?: string;
}

// Property media upload request
export interface UploadMediaRequest {
  propertyId: string;
  mediaType: PropertyMediaType;
  file: File | Buffer;
  fileName: string;
  displayOrder?: number;
  isPrimary?: boolean;
}

// Property document upload request
export interface UploadDocumentRequest {
  propertyId: string;
  documentType: PropertyDocumentType;
  file: File | Buffer;
  fileName: string;
  expirationDate?: Date;
  isRequired?: boolean;
}

// Property status update request
export interface UpdateStatusRequest {
  status: PropertyStatus;
  notes?: string;
}

// Duplicate check result
export interface DuplicateCheckResult {
  isDuplicate: boolean;
  confidence: number; // 0-100
  matchedProperty?: PropertyDetail;
  reasons: string[];
}
