// Frontend Property Types (matching backend types)

export enum PropertyType {
  APPARTEMENT = 'APPARTEMENT',
  MAISON_VILLA = 'MAISON_VILLA',
  STUDIO = 'STUDIO',
  DUPLEX_TRIPLEX = 'DUPLEX_TRIPLEX',
  CHAMBRE_COLOCATION = 'CHAMBRE_COLOCATION',
  BUREAU = 'BUREAU',
  BOUTIQUE_COMMERCIAL = 'BOUTIQUE_COMMERCIAL',
  ENTREPOT_INDUSTRIEL = 'ENTREPOT_INDUSTRIEL',
  TERRAIN = 'TERRAIN',
  IMMEUBLE = 'IMMEUBLE',
  PARKING_BOX = 'PARKING_BOX',
  LOT_PROGRAMME_NEUF = 'LOT_PROGRAMME_NEUF',
}

export enum PropertyOwnershipType {
  TENANT = 'TENANT',
  PUBLIC = 'PUBLIC',
  CLIENT = 'CLIENT',
}

export enum PropertyTransactionMode {
  SALE = 'SALE',
  RENTAL = 'RENTAL',
  SHORT_TERM = 'SHORT_TERM',
}

export enum PropertyFurnishingStatus {
  FURNISHED = 'FURNISHED',
  UNFURNISHED = 'UNFURNISHED',
  PARTIALLY_FURNISHED = 'PARTIALLY_FURNISHED',
}

export enum PropertyStatus {
  DRAFT = 'DRAFT',
  UNDER_REVIEW = 'UNDER_REVIEW',
  AVAILABLE = 'AVAILABLE',
  RESERVED = 'RESERVED',
  UNDER_OFFER = 'UNDER_OFFER',
  RENTED = 'RENTED',
  SOLD = 'SOLD',
  ARCHIVED = 'ARCHIVED',
}

export enum PropertyAvailability {
  AVAILABLE = 'AVAILABLE',
  UNAVAILABLE = 'UNAVAILABLE',
  SOON_AVAILABLE = 'SOON_AVAILABLE',
}

export enum PropertyMediaType {
  PHOTO = 'PHOTO',
  VIDEO = 'VIDEO',
  TOUR_360 = 'TOUR_360',
}

export enum PropertyDocumentType {
  TITLE_DEED = 'TITLE_DEED',
  MANDATE = 'MANDATE',
  PLAN = 'PLAN',
  TAX_DOCUMENT = 'TAX_DOCUMENT',
  OTHER = 'OTHER',
}

export enum PropertyVisitType {
  VISIT = 'VISIT',
  APPOINTMENT = 'APPOINTMENT',
}

export enum PropertyVisitGoal {
  CONTACT_TAKING = 'CONTACT_TAKING',
  NETWORKING = 'NETWORKING',
  EVALUATION = 'EVALUATION',
  CONTRACT_SIGNING = 'CONTRACT_SIGNING',
  FOLLOW_UP = 'FOLLOW_UP',
  NEGOTIATION = 'NEGOTIATION',
  OTHER = 'OTHER',
}

export enum PropertyVisitStatus {
  SCHEDULED = 'SCHEDULED',
  CONFIRMED = 'CONFIRMED',
  DONE = 'DONE',
  NO_SHOW = 'NO_SHOW',
  CANCELED = 'CANCELED',
}

// Property interfaces
export interface Property {
  id: string;
  internalReference: string;
  propertyType: PropertyType;
  ownershipType: PropertyOwnershipType;
  tenantId?: string;
  ownerUserId?: string;
  title: string;
  description: string;
  address: string;
  locationZone?: string;
  latitude?: number;
  longitude?: number;
  transactionModes: PropertyTransactionMode[];
  price?: number;
  fees?: number;
  currency: string;
  surfaceArea?: number;
  surfaceUseful?: number;
  surfaceTerrain?: number;
  rooms?: number;
  bedrooms?: number;
  bathrooms?: number;
  furnishingStatus?: PropertyFurnishingStatus;
  status: PropertyStatus;
  isPublished: boolean;
  publishedAt?: string;
  availability: PropertyAvailability;
  qualityScore?: number;
  qualityScoreUpdatedAt?: string;
  typeSpecificData?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  owner?: { id: string; email: string; fullName: string | null } | null;
}

export interface PropertyMedia {
  id: string;
  propertyId: string;
  mediaType: PropertyMediaType;
  filePath: string;
  fileUrl?: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  displayOrder: number;
  isPrimary: boolean;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface PropertyDocument {
  id: string;
  propertyId: string;
  documentType: PropertyDocumentType;
  filePath: string;
  fileUrl?: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  expirationDate?: string;
  warningSentAt?: string;
  gracePeriodEndsAt?: string;
  isRequired: boolean;
  isValid: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PropertyStatusHistory {
  id: string;
  propertyId: string;
  previousStatus?: PropertyStatus;
  newStatus: PropertyStatus;
  changedByUserId: string;
  notes?: string;
  createdAt: string;
}

export interface PropertyVisit {
  id: string;
  propertyId: string;
  contactId?: string;
  dealId?: string;
  visitType: PropertyVisitType;
  goal?: PropertyVisitGoal;
  scheduledAt: string;
  duration?: number;
  location?: string;
  status: PropertyVisitStatus;
  assignedToUserId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  // Optional relations (may be included when fetching calendar visits)
  property?: {
    id: string;
    title?: string;
    address: string;
  };
  contact?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  deal?: {
    id: string;
    type: 'ACHAT' | 'LOCATION' | 'VENTE' | 'GESTION' | 'MANDAT';
  };
  assignedTo?: {
    id: string;
    email: string;
    fullName?: string;
  };
  collaborators?: Array<{
    id: string;
    userId: string;
    user: {
      id: string;
      email: string;
      fullName?: string;
    };
  }>;
}

export interface PropertyMandate {
  id: string;
  propertyId: string;
  tenantId: string;
  ownerUserId: string;
  startDate: string;
  endDate?: string;
  scope?: Record<string, any>;
  notes?: string;
  isActive: boolean;
  revokedAt?: string;
  revokedByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PropertyQualityScore {
  id: string;
  propertyId: string;
  score: number;
  suggestions: string[];
  calculatedAt: string;
}

export interface PropertyTypeTemplate {
  id: string;
  propertyType: PropertyType;
  name: string;
  description?: string;
  fieldDefinitions: PropertyField[];
  sections: PropertySection[];
  validationRules: Record<string, any>;
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

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

export interface PropertySection {
  key: string;
  label: string;
  order: number;
  fields: string[];
}

// Request/Response types
export interface CreatePropertyRequest {
  propertyType: PropertyType;
  ownershipType: PropertyOwnershipType;
  tenantId?: string;
  ownerUserId?: string;
  ownerEmail?: string;
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
  radius?: number;
  page?: number;
  limit?: number;
}

export interface PropertySearchResponse {
  properties: Property[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface PropertyMatch {
  property: Property;
  matchScore: number;
  matchExplanation: string;
  matchedCriteria: {
    budget: { matched: boolean; score: number; explanation: string };
    location: { matched: boolean; score: number; explanation: string };
    size: { matched: boolean; score: number; explanation: string };
    features: { matched: boolean; score: number; explanation: string };
    priceCoherence: { matched: boolean; score: number; explanation: string };
  };
}

export interface CreateVisitRequest {
  propertyId: string;
  contactId?: string;
  dealId?: string;
  visitType: PropertyVisitType;
  scheduledAt: string;
  duration?: number;
  location?: string;
  assignedToUserId?: string;
  notes?: string;
}

export interface UpdateStatusRequest {
  status: PropertyStatus;
  notes?: string;
}

