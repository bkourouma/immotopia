import apiClient from '../utils/api-client';
import { filenameFromDisposition } from '../utils/save-blob';
import {
  Property,
  PropertyTypeTemplate,
  CreatePropertyRequest,
  UpdatePropertyRequest,
  PropertySearchRequest,
  PropertySearchResponse,
  PropertyVisit
} from '../types/property-types';

// Re-export types for convenience
export type {
  Property,
  PropertyTypeTemplate,
  CreatePropertyRequest,
  UpdatePropertyRequest,
  PropertySearchRequest,
  PropertySearchResponse,
  PropertyVisit
};

/**
 * Get all property templates
 */
export async function getTemplates(): Promise<PropertyTypeTemplate[]> {
  const response = await apiClient.get<{ success: boolean; data: PropertyTypeTemplate[] }>('/property-templates');
  return response.data.data;
}

/**
 * Get template by property type
 */
export async function getTemplate(type: string): Promise<PropertyTypeTemplate> {
  const response = await apiClient.get<{ success: boolean; data: PropertyTypeTemplate }>(`/property-templates/${type}`);
  return response.data.data;
}

/**
 * Create a property
 */
export async function createProperty(tenantId: string, data: CreatePropertyRequest): Promise<Property> {
  const response = await apiClient.post<{ success: boolean; data: Property }>(`/tenants/${tenantId}/properties`, data);
  return response.data.data;
}

/**
 * Get property by ID
 */
export async function getProperty(tenantId: string, propertyId: string): Promise<Property> {
  const response = await apiClient.get<{ success: boolean; data: Property }>(
    `/tenants/${tenantId}/properties/${propertyId}`
  );
  return response.data.data;
}

/**
 * Update a property
 */
export async function updateProperty(
  tenantId: string,
  propertyId: string,
  data: UpdatePropertyRequest
): Promise<Property> {
  const response = await apiClient.put<{ success: boolean; data: Property }>(
    `/tenants/${tenantId}/properties/${propertyId}`,
    data
  );
  return response.data.data;
}

/**
 * Delete a property
 */
export async function deleteProperty(tenantId: string, propertyId: string): Promise<void> {
  await apiClient.delete(`/tenants/${tenantId}/properties/${propertyId}`);
}

/**
 * List properties with filters
 */
export interface ListPropertiesFilters {
  propertyType?: string;
  ownershipType?: string;
  status?: string;
  transactionMode?: string;
  /** Recherche libre : titre, adresse, référence interne. */
  q?: string;
  /** Commune ou zone. */
  city?: string;
  minPrice?: string | number;
  maxPrice?: string | number;
  minSurface?: string | number;
  maxSurface?: string | number;
  minRooms?: string | number;
  maxRooms?: string | number;
  minBedrooms?: string | number;
  maxBedrooms?: string | number;
  page?: number;
  limit?: number;
}

/**
 * Tous les filtres partent au serveur (REFONTE_UI_UX.md §8.4).
 *
 * `properties/Properties.tsx` en appliquait dix dans le navigateur, sur la page
 * déjà reçue, pendant que le compteur venait du serveur : la liste et son
 * compteur se contredisaient, et un bien pouvait exister sans jamais
 * apparaître. Les paramètres ci-dessous sont ceux que l'API accepte depuis le
 * commit `a2e43aa`.
 */
export async function listProperties(
  tenantId: string,
  filters?: ListPropertiesFilters,
  options?: { signal?: AbortSignal }
): Promise<PropertySearchResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters ?? {})) {
    // Une valeur vide n'est pas un filtre : `?q=` ne doit pas chercher la
    // chaîne vide, et `?minPrice=` ne doit pas valoir zéro.
    if (value === undefined || value === null || value === '') continue;
    params.append(key, String(value));
  }

  const response = await apiClient.get<{ success: boolean; data: Property[]; pagination: any }>(
    `/tenants/${tenantId}/properties?${params.toString()}`,
    { signal: options?.signal }
  );
  return {
    properties: response.data.data,
    pagination: response.data.pagination
  };
}

/**
 * Search properties
 */
export async function searchProperties(
  tenantId: string,
  searchRequest: PropertySearchRequest
): Promise<PropertySearchResponse> {
  const response = await apiClient.post<{
    success: boolean;
    data: Property[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }>(`/tenants/${tenantId}/properties/search`, searchRequest);
  return {
    properties: response.data.data,
    pagination: response.data.pagination
  };
}

/**
 * Create a management mandate
 */
export async function createMandate(
  tenantId: string,
  propertyId: string,
  data: {
    startDate: string;
    endDate?: string;
    notes?: string;
  }
): Promise<any> {
  const response = await apiClient.post<{ success: boolean; data: any }>(
    `/tenants/${tenantId}/properties/${propertyId}/mandates`,
    {
      propertyId,
      ...data
    }
  );
  return response.data.data;
}

/**
 * Revoke a management mandate
 */
export async function revokeMandate(tenantId: string, propertyId: string, mandateId: string): Promise<any> {
  const response = await apiClient.delete<{ success: boolean; data: any }>(
    `/tenants/${tenantId}/properties/${propertyId}/mandates/${mandateId}`
  );
  return response.data.data;
}

/**
 * Get property mandates
 */
export async function getPropertyMandates(tenantId: string, propertyId: string): Promise<any[]> {
  const response = await apiClient.get<{ success: boolean; data: any[] }>(
    `/tenants/${tenantId}/properties/${propertyId}/mandates`
  );
  return response.data.data;
}

/**
 * Get tenant mandates
 */
export async function getTenantMandates(tenantId: string): Promise<any[]> {
  const response = await apiClient.get<{ success: boolean; data: any[] }>(`/tenants/${tenantId}/mandates`);
  return response.data.data;
}

/**
 * Upload media file
 */
export async function uploadMedia(
  tenantId: string,
  propertyId: string,
  file: File,
  mediaType: string,
  displayOrder?: number,
  isPrimary?: boolean
): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('mediaType', mediaType);
  if (displayOrder !== undefined) {
    formData.append('displayOrder', displayOrder.toString());
  }
  if (isPrimary !== undefined) {
    formData.append('isPrimary', isPrimary.toString());
  }

  const response = await apiClient.post<{ success: boolean; data: any }>(
    `/tenants/${tenantId}/properties/${propertyId}/media`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    }
  );
  return response.data.data;
}

/**
 * Reorder media
 */
export async function reorderMedia(
  tenantId: string,
  propertyId: string,
  mediaOrders: Array<{ mediaId: string; displayOrder: number }>
): Promise<void> {
  await apiClient.post(`/tenants/${tenantId}/properties/${propertyId}/media/reorder`, { mediaOrders });
}

/**
 * Set primary media
 */
export async function setPrimaryMedia(tenantId: string, propertyId: string, mediaId: string): Promise<any> {
  const response = await apiClient.post<{ success: boolean; data: any }>(
    `/tenants/${tenantId}/properties/${propertyId}/media/primary`,
    { mediaId }
  );
  return response.data.data;
}

/**
 * Delete media
 */
export async function deleteMedia(tenantId: string, propertyId: string, mediaId: string): Promise<void> {
  await apiClient.delete(`/tenants/${tenantId}/properties/${propertyId}/media/${mediaId}`);
}

/**
 * Upload document
 */
export async function uploadDocument(
  tenantId: string,
  propertyId: string,
  file: File,
  documentType: string,
  expirationDate?: string,
  isRequired?: boolean
): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('documentType', documentType);
  if (expirationDate) {
    formData.append('expirationDate', expirationDate);
  }
  if (isRequired !== undefined) {
    formData.append('isRequired', isRequired.toString());
  }

  const response = await apiClient.post<{ success: boolean; data: any }>(
    `/tenants/${tenantId}/properties/${propertyId}/documents`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    }
  );
  return response.data.data;
}

/**
 * Update property status
 */
export async function updateStatus(
  tenantId: string,
  propertyId: string,
  status: string,
  notes?: string
): Promise<Property> {
  const response = await apiClient.post<{ success: boolean; data: Property }>(
    `/tenants/${tenantId}/properties/${propertyId}/status`,
    {
      status,
      notes
    }
  );
  return response.data.data;
}

/**
 * Get status history
 */
export async function getStatusHistory(tenantId: string, propertyId: string): Promise<any[]> {
  const response = await apiClient.get<{ success: boolean; data: any[] }>(
    `/tenants/${tenantId}/properties/${propertyId}/status/history`
  );
  return response.data.data;
}

/**
 * Publish property
 */
export async function publishProperty(tenantId: string, propertyId: string): Promise<Property> {
  const response = await apiClient.post<{ success: boolean; data: Property }>(
    `/tenants/${tenantId}/properties/${propertyId}/publish`
  );
  return response.data.data;
}

/**
 * Unpublish property
 */
export async function unpublishProperty(tenantId: string, propertyId: string): Promise<Property> {
  const response = await apiClient.post<{ success: boolean; data: Property }>(
    `/tenants/${tenantId}/properties/${propertyId}/unpublish`
  );
  return response.data.data;
}

/**
 * Match properties for a deal
 */
export async function matchPropertiesForDeal(tenantId: string, dealId: string, limit?: number): Promise<any[]> {
  const params = limit ? `?limit=${limit}` : '';
  const response = await apiClient.post<{ success: boolean; data: any[] }>(
    `/tenants/${tenantId}/crm/deals/${dealId}/properties/match${params}`
  );
  return response.data.data;
}

/**
 * Add property to deal shortlist
 */
export async function addPropertyToShortlist(
  tenantId: string,
  dealId: string,
  propertyId: string,
  matchScore?: number,
  matchExplanation?: any,
  sourceOwnerContactId?: string
): Promise<any> {
  const response = await apiClient.post<{ success: boolean; data: any }>(
    `/tenants/${tenantId}/crm/deals/${dealId}/properties`,
    {
      propertyId,
      matchScore,
      matchExplanation,
      sourceOwnerContactId
    }
  );
  return response.data.data;
}

/**
 * Schedule a property visit
 */
export async function scheduleVisit(
  tenantId: string,
  propertyId: string,
  visitData: {
    contactId?: string;
    dealId?: string;
    visitType: string;
    goal?: string;
    scheduledAt: string;
    duration?: number;
    location?: string;
    assignedToUserId?: string;
    collaboratorIds?: string[];
    notes?: string;
  }
): Promise<PropertyVisit> {
  const response = await apiClient.post<{ success: boolean; data: PropertyVisit }>(
    `/tenants/${tenantId}/properties/${propertyId}/visits`,
    visitData
  );
  return response.data.data;
}

/**
 * Get property visits
 */
export async function getPropertyVisits(tenantId: string, propertyId: string): Promise<PropertyVisit[]> {
  const response = await apiClient.get<{ success: boolean; data: PropertyVisit[] }>(
    `/tenants/${tenantId}/properties/${propertyId}/visits`
  );
  return response.data.data;
}

/**
 * Get calendar visits
 */
export async function getCalendarVisits(
  tenantId: string,
  startDate: string,
  endDate: string,
  assignedToUserId?: string
): Promise<Record<string, PropertyVisit[]>> {
  const params = new URLSearchParams({
    startDate,
    endDate
  });
  if (assignedToUserId) {
    params.append('assignedToUserId', assignedToUserId);
  }

  const response = await apiClient.get<{ success: boolean; data: Record<string, PropertyVisit[]> }>(
    `/tenants/${tenantId}/properties/visits/calendar?${params.toString()}`
  );
  return response.data.data;
}

/**
 * Get property quality score
 */
export async function getQualityScore(
  tenantId: string,
  propertyId: string,
  recalculate?: boolean
): Promise<{
  score: number;
  suggestions: string[];
  breakdown: {
    requiredFields: number;
    media: number;
    geolocation: number;
    description: number;
  };
}> {
  const params = recalculate ? '?recalculate=true' : '';
  const response = await apiClient.get<{
    success: boolean;
    data: {
      score: number;
      suggestions: string[];
      breakdown: {
        requiredFields: number;
        media: number;
        geolocation: number;
        description: number;
      };
    };
  }>(`/tenants/${tenantId}/properties/${propertyId}/quality${params}`);
  return response.data.data;
}

/**
 * Complete a property visit (mark as DONE)
 */
export async function completePropertyVisit(
  tenantId: string,
  propertyId: string,
  visitId: string,
  notes?: string
): Promise<PropertyVisit> {
  const response = await apiClient.post<{ success: boolean; data: PropertyVisit }>(
    `/tenants/${tenantId}/properties/${propertyId}/visits/${visitId}/complete`,
    { notes: notes || null }
  );
  return response.data.data;
}

/**
 * Fichier d'un document de bien. Jamais servi en statique
 * (`/uploads/properties/<bien>/documents` répond 404) : la route vérifie
 * l'agence, le bien et la permission `PROPERTIES_VIEW`.
 */
export async function downloadPropertyDocumentFile(
  tenantId: string,
  propertyId: string,
  documentId: string,
  fallbackName: string
): Promise<{ blob: Blob; filename: string }> {
  const response = await apiClient.get<Blob>(
    `/tenants/${tenantId}/properties/${encodeURIComponent(propertyId)}/documents/${encodeURIComponent(documentId)}/file`,
    { responseType: 'blob' }
  );
  return { blob: response.data, filename: filenameFromDisposition(response.headers?.['content-disposition'], fallbackName) };
}
