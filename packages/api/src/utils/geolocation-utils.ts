import { logger } from './logger';

/**
 * Geocode an address to latitude/longitude coordinates
 * @param address - Full address string
 * @returns Coordinates or null if geocoding fails
 */
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    // TODO: Integrate with geocoding service (Google Maps API, Mapbox, etc.)
    // For now, return null to allow manual entry
    // Implementation should call external geocoding service
    logger.info('Geocoding address', { address });

    // Placeholder: In production, this would call a geocoding service
    // const result = await geocodingService.geocode(address);
    // return { lat: result.latitude, lng: result.longitude };

    return null;
  } catch (error) {
    logger.warn('Geocoding failed', { address, error });
    return null; // Allow manual entry if geocoding fails
  }
}

/**
 * Validate geolocation coordinates
 * @param lat - Latitude
 * @param lng - Longitude
 * @returns True if coordinates are valid
 */
export async function validateGeolocation(lat: number, lng: number): Promise<boolean> {
  try {
    // Validate coordinate ranges
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return false;
    }

    // TODO: Optional reverse geocoding validation
    // const result = await geocodingService.reverseGeocode(lat, lng);
    // return result !== null;

    return true;
  } catch (error) {
    logger.warn('Geolocation validation failed', { lat, lng, error });
    return false;
  }
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 * @param lat1 - First latitude
 * @param lng1 - First longitude
 * @param lat2 - Second latitude
 * @param lng2 - Second longitude
 * @returns Distance in meters
 */
export function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}




