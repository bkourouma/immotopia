import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { PropertyStatus, PropertyTransactionMode, CrmDealPropertyStatus } from '@prisma/client';
import { calculateDistance } from '../utils/geolocation-utils';

/**
 * Match score weights
 */
const MATCH_WEIGHTS = {
  BUDGET: 0.3,
  LOCATION: 0.25,
  SIZE_ROOMS: 0.2,
  FEATURES: 0.15,
  PRICE_COHERENCE: 0.1
};

/**
 * Match result interface
 */
export interface PropertyMatchResult {
  propertyId: string;
  matchScore: number;
  explanation: {
    budgetScore: number;
    locationScore: number;
    sizeScore: number;
    featuresScore: number;
    priceCoherenceScore: number;
    reasons: string[];
  };
}

/**
 * Match properties for a deal
 * @param dealId - Deal ID
 * @param tenantId - Tenant ID (for isolation)
 * @param limit - Maximum number of matches to return
 * @returns Matched properties with scores
 */
export async function matchPropertiesForDeal(
  dealId: string,
  tenantId: string,
  limit: number = 20
): Promise<PropertyMatchResult[]> {
  // Get deal with criteria
  const deal = await prisma.crmDeal.findFirst({
    where: {
      id: dealId,
      tenantId
    }
  });

  if (!deal) {
    throw new Error('Deal not found');
  }

  // Get all available properties for the tenant
  const properties = await prisma.property.findMany({
    where: {
      OR: [
        { ownershipType: 'TENANT', tenantId },
        { ownershipType: 'CLIENT', mandates: { some: { tenantId, isActive: true } } }
      ],
      status: {
        in: [PropertyStatus.AVAILABLE, PropertyStatus.RESERVED, PropertyStatus.UNDER_OFFER]
      },
      isPublished: true
    },
    include: {
      media: {
        where: { isPrimary: true },
        take: 1
      }
    }
  });

  // Calculate match scores
  const matches: PropertyMatchResult[] = properties.map(property => {
    const score = calculateMatchScore(deal, property);
    return {
      propertyId: property.id,
      matchScore: score.total,
      explanation: score
    };
  });

  // Sort by score (descending) and limit
  matches.sort((a, b) => b.matchScore - a.matchScore);
  return matches.slice(0, limit);
}

/**
 * Calculate match score for a property against a deal
 * @param deal - Deal with criteria
 * @param property - Property to match
 * @returns Match score breakdown
 */
export function calculateMatchScore(
  deal: {
    budgetMin?: number | null;
    budgetMax?: number | null;
    locationZone?: string | null;
    criteriaJson?: any;
    type?: string;
  },
  property: {
    price?: number | null;
    locationZone?: string | null;
    surfaceArea?: number | null;
    rooms?: number | null;
    bedrooms?: number | null;
    transactionModes?: PropertyTransactionMode[];
    typeSpecificData?: any;
  }
): {
  total: number;
  budgetScore: number;
  locationScore: number;
  sizeScore: number;
  featuresScore: number;
  priceCoherenceScore: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  let total = 0;

  // Budget matching (30%)
  const budgetScore = matchBudget(deal, property);
  total += budgetScore * MATCH_WEIGHTS.BUDGET;
  if (budgetScore > 0) {
    reasons.push(`Budget: ${Math.round(budgetScore * 100)}% match`);
  }

  // Location matching (25%)
  const locationScore = matchLocation(deal, property);
  total += locationScore * MATCH_WEIGHTS.LOCATION;
  if (locationScore > 0) {
    reasons.push(`Location: ${Math.round(locationScore * 100)}% match`);
  }

  // Size/rooms matching (20%)
  const sizeScore = matchSize(deal, property);
  total += sizeScore * MATCH_WEIGHTS.SIZE_ROOMS;
  if (sizeScore > 0) {
    reasons.push(`Size/Rooms: ${Math.round(sizeScore * 100)}% match`);
  }

  // Features matching (15%)
  const featuresScore = matchFeatures(deal, property);
  total += featuresScore * MATCH_WEIGHTS.FEATURES;
  if (featuresScore > 0) {
    reasons.push(`Features: ${Math.round(featuresScore * 100)}% match`);
  }

  // Price coherence (10%)
  const priceCoherenceScore = calculatePriceCoherence(deal, property);
  total += priceCoherenceScore * MATCH_WEIGHTS.PRICE_COHERENCE;
  if (priceCoherenceScore > 0) {
    reasons.push(`Price coherence: ${Math.round(priceCoherenceScore * 100)}%`);
  }

  return {
    total: Math.round(total * 100) / 100,
    budgetScore: Math.round(budgetScore * 100) / 100,
    locationScore: Math.round(locationScore * 100) / 100,
    sizeScore: Math.round(sizeScore * 100) / 100,
    featuresScore: Math.round(featuresScore * 100) / 100,
    priceCoherenceScore: Math.round(priceCoherenceScore * 100) / 100,
    reasons
  };
}

/**
 * Match budget criteria
 * @param deal - Deal with budget
 * @param property - Property with price
 * @returns Score 0-1
 */
function matchBudget(
  deal: { budgetMin?: number | null; budgetMax?: number | null },
  property: { price?: number | null; transactionModes?: PropertyTransactionMode[] }
): number {
  if (!deal.budgetMin && !deal.budgetMax) {
    return 1.0; // No budget constraint = perfect match
  }

  if (!property.price) {
    return 0.0; // No price = no match
  }

  const price = Number(property.price);

  // Check if property transaction mode matches deal type
  // This is simplified - in reality, we'd check deal.type against transactionModes
  if (deal.budgetMin && price < Number(deal.budgetMin)) {
    return 0.0; // Below minimum budget
  }

  if (deal.budgetMax && price > Number(deal.budgetMax)) {
    // Over budget - partial score based on how much over
    const overage = price - Number(deal.budgetMax);
    const budgetRange = Number(deal.budgetMax) - (Number(deal.budgetMin) || 0);
    if (budgetRange > 0) {
      const penalty = Math.min(overage / budgetRange, 0.5); // Max 50% penalty
      return Math.max(0.5 - penalty, 0);
    }
    return 0.3; // Default penalty if no range
  }

  // Within budget - score based on how close to center
  if (deal.budgetMin && deal.budgetMax) {
    const budgetCenter = (Number(deal.budgetMin) + Number(deal.budgetMax)) / 2;
    const budgetRange = Number(deal.budgetMax) - Number(deal.budgetMin);
    const distanceFromCenter = Math.abs(price - budgetCenter);
    const normalizedDistance = distanceFromCenter / budgetRange;
    return Math.max(1.0 - normalizedDistance, 0.5); // At least 50% if within range
  }

  // Only min or max specified
  if (deal.budgetMin) {
    const distanceFromMin = price - Number(deal.budgetMin);
    const budgetRange = Number(deal.budgetMin) * 0.2; // Assume 20% range
    return Math.min(1.0, 0.7 + (distanceFromMin / budgetRange) * 0.3);
  }

  if (deal.budgetMax) {
    const distanceFromMax = Number(deal.budgetMax) - price;
    const budgetRange = Number(deal.budgetMax) * 0.2;
    return Math.min(1.0, 0.7 + (distanceFromMax / budgetRange) * 0.3);
  }

  return 1.0;
}

/**
 * Match location criteria
 * @param deal - Deal with location
 * @param property - Property with location
 * @returns Score 0-1
 */
function matchLocation(
  deal: { locationZone?: string | null },
  property: { locationZone?: string | null; latitude?: number | null; longitude?: number | null }
): number {
  if (!deal.locationZone) {
    return 1.0; // No location constraint = perfect match
  }

  if (!property.locationZone) {
    return 0.0; // No property location = no match
  }

  // Exact match
  if (property.locationZone.toLowerCase() === deal.locationZone.toLowerCase()) {
    return 1.0;
  }

  // Partial match (contains)
  if (
    property.locationZone.toLowerCase().includes(deal.locationZone.toLowerCase()) ||
    deal.locationZone.toLowerCase().includes(property.locationZone.toLowerCase())
  ) {
    return 0.7;
  }

  // No match
  return 0.0;
}

/**
 * Match size/rooms criteria
 * @param deal - Deal with criteria
 * @param property - Property with size/rooms
 * @returns Score 0-1
 */
function matchSize(
  deal: { criteriaJson?: any },
  property: { surfaceArea?: number | null; rooms?: number | null; bedrooms?: number | null }
): number {
  if (!deal.criteriaJson) {
    return 1.0; // No size constraint = perfect match
  }

  const criteria = deal.criteriaJson as any;
  let score = 0;
  let factors = 0;

  // Surface area matching
  if (criteria.surfaceAreaMin || criteria.surfaceAreaMax) {
    factors++;
    if (property.surfaceArea) {
      const surface = property.surfaceArea;
      if (criteria.surfaceAreaMin && surface < criteria.surfaceAreaMin) {
        score += 0; // Below minimum
      } else if (criteria.surfaceAreaMax && surface > criteria.surfaceAreaMax) {
        // Over maximum - partial score
        const overage = surface - criteria.surfaceAreaMax;
        const range = criteria.surfaceAreaMax - (criteria.surfaceAreaMin || 0);
        score += Math.max(0.5 - (overage / range) * 0.5, 0);
      } else {
        // Within range
        if (criteria.surfaceAreaMin && criteria.surfaceAreaMax) {
          const center = (criteria.surfaceAreaMin + criteria.surfaceAreaMax) / 2;
          const range = criteria.surfaceAreaMax - criteria.surfaceAreaMin;
          const distance = Math.abs(surface - center);
          score += Math.max(1.0 - distance / range, 0.5);
        } else {
          score += 1.0;
        }
      }
    } else {
      score += 0; // No surface area
    }
  }

  // Rooms matching
  if (criteria.roomsMin || criteria.rooms) {
    factors++;
    const requiredRooms = criteria.roomsMin || criteria.rooms;
    if (property.rooms && property.rooms >= requiredRooms) {
      score += 1.0;
    } else {
      score += 0;
    }
  }

  // Bedrooms matching
  if (criteria.bedroomsMin || criteria.bedrooms) {
    factors++;
    const requiredBedrooms = criteria.bedroomsMin || criteria.bedrooms;
    if (property.bedrooms && property.bedrooms >= requiredBedrooms) {
      score += 1.0;
    } else {
      score += 0;
    }
  }

  return factors > 0 ? score / factors : 1.0;
}

/**
 * Match features criteria
 * @param deal - Deal with criteria
 * @param property - Property with features
 * @returns Score 0-1
 */
function matchFeatures(deal: { criteriaJson?: any }, property: { typeSpecificData?: any }): number {
  if (!deal.criteriaJson || !deal.criteriaJson.features) {
    return 1.0; // No feature constraint = perfect match
  }

  const requiredFeatures = deal.criteriaJson.features as string[];
  if (!requiredFeatures || requiredFeatures.length === 0) {
    return 1.0;
  }

  if (!property.typeSpecificData) {
    return 0.0;
  }

  const propertyFeatures = property.typeSpecificData.features || [];
  const matchedFeatures = requiredFeatures.filter(feature => propertyFeatures.includes(feature));

  return matchedFeatures.length / requiredFeatures.length;
}

/**
 * Calculate price coherence score
 * @param deal - Deal with budget
 * @param property - Property with price
 * @returns Score 0-1
 */
function calculatePriceCoherence(
  deal: { budgetMin?: number | null; budgetMax?: number | null },
  property: { price?: number | null }
): number {
  if (!property.price || (!deal.budgetMin && !deal.budgetMax)) {
    return 1.0;
  }

  const price = Number(property.price);
  const budgetMin = deal.budgetMin ? Number(deal.budgetMin) : 0;
  const budgetMax = deal.budgetMax ? Number(deal.budgetMax) : price * 2;

  // Price should be within budget range
  if (price >= budgetMin && price <= budgetMax) {
    return 1.0;
  }

  // Slightly outside range - partial score
  if (price < budgetMin) {
    const distance = budgetMin - price;
    const range = budgetMax - budgetMin;
    return Math.max(0.5 - (distance / range) * 0.5, 0);
  }

  if (price > budgetMax) {
    const distance = price - budgetMax;
    const range = budgetMax - budgetMin;
    return Math.max(0.5 - (distance / range) * 0.5, 0);
  }

  return 0.5;
}

/**
 * Generate match explanation text
 * @param matchResult - Match result with scores
 * @returns Human-readable explanation
 */
export function generateMatchExplanation(matchResult: PropertyMatchResult): string {
  const { explanation } = matchResult;
  const parts: string[] = [];

  if (explanation.budgetScore >= 0.8) {
    parts.push('Budget parfaitement aligné');
  } else if (explanation.budgetScore >= 0.5) {
    parts.push('Budget acceptable');
  } else if (explanation.budgetScore > 0) {
    parts.push('Budget légèrement hors limite');
  }

  if (explanation.locationScore >= 0.8) {
    parts.push('Zone recherchée');
  } else if (explanation.locationScore >= 0.5) {
    parts.push('Zone proche');
  }

  if (explanation.sizeScore >= 0.8) {
    parts.push('Taille correspondante');
  } else if (explanation.sizeScore >= 0.5) {
    parts.push('Taille acceptable');
  }

  if (explanation.featuresScore >= 0.8) {
    parts.push('Caractéristiques correspondantes');
  } else if (explanation.featuresScore >= 0.5) {
    parts.push('Caractéristiques partiellement correspondantes');
  }

  return parts.join(' • ') || 'Correspondance partielle';
}

/**
 * Add property to deal shortlist
 * @param dealId - Deal ID
 * @param propertyId - Property ID
 * @param tenantId - Tenant ID
 * @param matchScore - Match score
 * @param matchExplanation - Match explanation
 * @param sourceOwnerContactId - Source owner contact ID (optional)
 * @returns Created CrmDealProperty
 */
export async function addToShortlist(
  dealId: string,
  propertyId: string,
  tenantId: string,
  matchScore?: number,
  matchExplanation?: any,
  sourceOwnerContactId?: string | null
) {
  // Check if already exists
  const existing = await prisma.crmDealProperty.findUnique({
    where: {
      tenantId_dealId_propertyId: {
        tenantId,
        dealId,
        propertyId
      }
    }
  });

  if (existing) {
    // Update existing
    return prisma.crmDealProperty.update({
      where: { id: existing.id },
      data: {
        matchScore: matchScore || existing.matchScore,
        matchExplanationJson: matchExplanation || existing.matchExplanationJson,
        sourceOwnerContactId: sourceOwnerContactId || existing.sourceOwnerContactId
      }
    });
  }

  // Create new
  return prisma.crmDealProperty.create({
    data: {
      tenantId,
      dealId,
      propertyId,
      matchScore: matchScore || null,
      matchExplanationJson: matchExplanation || null,
      sourceOwnerContactId: sourceOwnerContactId || null,
      status: CrmDealPropertyStatus.SHORTLISTED
    }
  });
}

/**
 * Update property match status in deal
 * @param dealId - Deal ID
 * @param propertyId - Property ID
 * @param tenantId - Tenant ID
 * @param status - New status
 * @returns Updated CrmDealProperty
 */
export async function updatePropertyMatchStatus(
  dealId: string,
  propertyId: string,
  tenantId: string,
  status: CrmDealPropertyStatus
) {
  const dealProperty = await prisma.crmDealProperty.findUnique({
    where: {
      tenantId_dealId_propertyId: {
        tenantId,
        dealId,
        propertyId
      }
    }
  });

  if (!dealProperty) {
    throw new Error('Property not found in deal shortlist');
  }

  return prisma.crmDealProperty.update({
    where: { id: dealProperty.id },
    data: { status }
  });
}




