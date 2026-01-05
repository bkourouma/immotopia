import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface GeographicLocation {
  id: string;
  country: string;
  countryId: string;
  region: string;
  regionId: string;
  commune: string;
  communeId: string;
  displayName: string; // Format: "Commune, Région, Pays"
  searchText: string; // For search matching
}

/**
 * Search for locations (communes) with hierarchical display
 * Returns results in format: "Commune, Région, Pays"
 */
export async function searchLocations(query: string, limit: number = 50): Promise<GeographicLocation[]> {
  const searchTerm = query.toLowerCase().trim();

  if (!searchTerm) {
    return [];
  }

  const communes = await prisma.commune.findMany({
    where: {
      isActive: true,
      OR: [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { nameFr: { contains: searchTerm, mode: 'insensitive' } }
      ]
    },
    include: {
      region: {
        include: {
          country: true
        }
      }
    },
    take: limit,
    orderBy: {
      name: 'asc'
    }
  });

  return communes.map(commune => ({
    id: commune.id,
    country: commune.region.country.nameFr || commune.region.country.name,
    countryId: commune.region.country.id,
    region: commune.region.nameFr || commune.region.name,
    regionId: commune.region.id,
    commune: commune.nameFr || commune.name,
    communeId: commune.id,
    displayName: `${commune.nameFr || commune.name}, ${commune.region.nameFr || commune.region.name}, ${commune.region.country.nameFr || commune.region.country.name}`,
    searchText:
      `${commune.nameFr || commune.name} ${commune.region.nameFr || commune.region.name} ${commune.region.country.nameFr || commune.region.country.name}`.toLowerCase()
  }));
}

/**
 * Get all regions for a country
 */
export async function getRegionsByCountry(countryCode: string) {
  const country = await prisma.country.findUnique({
    where: { code: countryCode }
  });

  if (!country) {
    return [];
  }

  return prisma.region.findMany({
    where: {
      countryId: country.id,
      isActive: true
    },
    include: {
      communes: {
        where: { isActive: true },
        orderBy: { name: 'asc' }
      }
    },
    orderBy: { name: 'asc' }
  });
}

/**
 * Get all communes for a region
 */
export async function getCommunesByRegion(regionId: string) {
  return prisma.commune.findMany({
    where: {
      regionId,
      isActive: true
    },
    orderBy: { name: 'asc' }
  });
}

/**
 * Get all active communes
 */
export async function getAllCommunes(): Promise<GeographicLocation[]> {
  const communes = await prisma.commune.findMany({
    where: {
      isActive: true
    },
    include: {
      region: {
        include: {
          country: true
        }
      }
    },
    orderBy: {
      name: 'asc'
    }
  });

  return communes.map(commune => ({
    id: commune.id,
    country: commune.region.country.nameFr || commune.region.country.name,
    countryId: commune.region.country.id,
    region: commune.region.nameFr || commune.region.name,
    regionId: commune.region.id,
    commune: commune.nameFr || commune.name,
    communeId: commune.id,
    displayName: `${commune.nameFr || commune.name}, ${commune.region.nameFr || commune.region.name}, ${commune.region.country.nameFr || commune.region.country.name}`,
    searchText:
      `${commune.nameFr || commune.name} ${commune.region.nameFr || commune.region.name} ${commune.region.country.nameFr || commune.region.country.name}`.toLowerCase()
  }));
}

/**
 * Get location by commune ID
 */
export async function getLocationByCommuneId(communeId: string): Promise<GeographicLocation | null> {
  const commune = await prisma.commune.findUnique({
    where: { id: communeId },
    include: {
      region: {
        include: {
          country: true
        }
      }
    }
  });

  if (!commune) {
    return null;
  }

  return {
    id: commune.id,
    country: commune.region.country.nameFr || commune.region.country.name,
    countryId: commune.region.country.id,
    region: commune.region.nameFr || commune.region.name,
    regionId: commune.region.id,
    commune: commune.nameFr || commune.name,
    communeId: commune.id,
    displayName: `${commune.nameFr || commune.name}, ${commune.region.nameFr || commune.region.name}, ${commune.region.country.nameFr || commune.region.country.name}`,
    searchText:
      `${commune.nameFr || commune.name} ${commune.region.nameFr || commune.region.name} ${commune.region.country.nameFr || commune.region.country.name}`.toLowerCase()
  };
}




