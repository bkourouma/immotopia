import apiClient from '../utils/api-client';

export interface GeographicLocation {
  id: string;
  country: string;
  countryId: string;
  region: string;
  regionId: string;
  commune: string;
  communeId: string;
  displayName: string;
  searchText: string;
}

/**
 * Search for locations (communes) with hierarchical display
 */
export async function searchLocations(query: string, limit: number = 50): Promise<GeographicLocation[]> {
  const response = await apiClient.get<{ success: boolean; data: GeographicLocation[] }>(
    `/geographic/search?q=${encodeURIComponent(query)}&limit=${limit}`
  );
  return response.data.data;
}

/**
 * Get all communes
 */
export async function getAllCommunes(): Promise<GeographicLocation[]> {
  const response = await apiClient.get<{ success: boolean; data: GeographicLocation[] }>(
    '/geographic/communes'
  );
  return response.data.data;
}

/**
 * Get location by commune ID
 */
export async function getLocationByCommuneId(communeId: string): Promise<GeographicLocation | null> {
  try {
    const response = await apiClient.get<{ success: boolean; data: GeographicLocation }>(
      `/geographic/locations/${communeId}`
    );
    return response.data.data;
  } catch (error) {
    return null;
  }
}

