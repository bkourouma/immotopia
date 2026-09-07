/**
 * Photon (Komoot) geocoding – gratuit, sans clé API.
 * Autocomplétion d'adresses niveau rue / quartier / point précis (OpenStreetMap).
 * @see https://photon.komoot.io/
 */

const PHOTON_BASE = 'https://photon.komoot.io/api';

export interface PhotonFeatureProperties {
  osm_type?: string;
  osm_id?: number;
  osm_key?: string;
  osm_value?: string;
  type?: string;
  name?: string;
  street?: string;
  housenumber?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  countrycode?: string;
  district?: string;
  neighbourhood?: string;
  county?: string;
  extent?: number[];
}

export interface PhotonResult {
  id: string;
  displayName: string;
  address: string;
  locationZone?: string;
  latitude: number;
  longitude: number;
  type: string;
  city?: string;
  country?: string;
  postcode?: string;
}

interface PhotonFeature {
  type: string;
  geometry: { type: string; coordinates: [number, number] };
  properties: PhotonFeatureProperties;
}

interface PhotonResponse {
  type: string;
  features: PhotonFeature[];
}

function buildDisplayName(props: PhotonFeatureProperties): string {
  const parts: string[] = [];
  if (props.street) {
    parts.push(props.housenumber ? `${props.street} ${props.housenumber}` : props.street);
  } else if (props.name) {
    parts.push(props.name);
  }
  if (props.district && parts.indexOf(props.district) === -1) parts.push(props.district);
  if (props.city && parts.indexOf(props.city) === -1) parts.push(props.city);
  if (props.state && parts.indexOf(props.state) === -1) parts.push(props.state);
  if (props.country && parts.indexOf(props.country) === -1) parts.push(props.country);
  return parts.filter(Boolean).join(', ');
}

function buildAddressLine(props: PhotonFeatureProperties): string {
  if (props.street) {
    return props.housenumber ? `${props.street} ${props.housenumber}` : props.street;
  }
  return props.name || '';
}

/**
 * Recherche d'adresses (rue, quartier, lieu) via Photon – gratuit.
 */
export async function searchAddresses(
  query: string,
  options: { limit?: number; lang?: string; lat?: number; lon?: number } = {}
): Promise<PhotonResult[]> {
  const q = query?.trim();
  if (!q || q.length < 2) return [];

  const params = new URLSearchParams();
  params.set('q', q);
  params.set('limit', String(options.limit ?? 10));
  if (options.lang) params.set('lang', options.lang);
  if (options.lat != null) params.set('lat', String(options.lat));
  if (options.lon != null) params.set('lon', String(options.lon));

  const url = `${PHOTON_BASE}/?${params.toString()}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) return [];
  const data: PhotonResponse = await res.json();
  if (!data.features || !Array.isArray(data.features)) return [];

  return data.features.map((f, i) => {
    const props = f.properties || {};
    const [lon, lat] = f.geometry?.coordinates ?? [0, 0];
    const locationZone =
      props.district || props.neighbourhood || props.county || undefined;
    return {
      id: `photon-${props.osm_type ?? 'n'}-${props.osm_id ?? i}`,
      displayName: buildDisplayName(props),
      address: buildAddressLine(props),
      locationZone: locationZone || undefined,
      latitude: lat,
      longitude: lon,
      type: props.type || 'place',
      city: props.city,
      country: props.country,
      postcode: props.postcode,
    };
  });
}
