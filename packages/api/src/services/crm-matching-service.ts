import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { PropertyMatch, UpdatePropertyMatchStatusRequest } from '../types/crm-types';
import { CrmDealPropertyStatus } from '@prisma/client';

/**
 * Calculate match score for a property against deal criteria
 * Scoring weights: Budget 0-30, Zone 0-25, Size 0-25, Extras 0-20
 * @param deal - Deal with criteria
 * @param property - Property to score
 * @returns Match score (0-100) and explanation
 */
export function calculateMatchScore(
  deal: {
    budgetMin?: number | null;
    budgetMax?: number | null;
    locationZone?: string | null;
    criteriaJson?: any;
  },
  property: {
    price?: number | null;
    locationZone?: string | null;
    rooms?: number | null;
    surface?: number | null;
    type?: string | null;
    furnishingStatus?: string | null;
  }
): { score: number; explanation: PropertyMatch['matchExplanation'] } {
  let totalScore = 0;
  const explanation: PropertyMatch['matchExplanation'] = {};

  // Budget fit (0-30 points)
  if (deal.budgetMin && deal.budgetMax && property.price) {
    const price = property.price;
    const budgetMin = deal.budgetMin;
    const budgetMax = deal.budgetMax;
    const budgetRange = budgetMax - budgetMin;

    if (price >= budgetMin && price <= budgetMax) {
      // Perfect fit: 30 points
      explanation.budgetFit = 30;
      totalScore += 30;
    } else if (price < budgetMin) {
      // Below budget: partial score based on how close
      const diff = budgetMin - price;
      const percentage = Math.max(0, 1 - diff / budgetMin);
      explanation.budgetFit = Math.round(30 * percentage);
      totalScore += explanation.budgetFit;
    } else {
      // Above budget: partial score based on how close
      const diff = price - budgetMax;
      const percentage = Math.max(0, 1 - diff / budgetMax);
      explanation.budgetFit = Math.round(30 * percentage);
      totalScore += explanation.budgetFit;
    }
  } else {
    explanation.budgetFit = 0;
  }

  // Zone fit (0-25 points)
  if (deal.locationZone && property.locationZone) {
    if (deal.locationZone.toLowerCase() === property.locationZone.toLowerCase()) {
      explanation.zoneFit = 25;
      totalScore += 25;
    } else {
      // Partial match if zones are similar (simplified - could be enhanced)
      explanation.zoneFit = 10;
      totalScore += 10;
    }
  } else {
    explanation.zoneFit = 0;
  }

  // Size fit (0-25 points) - rooms and surface
  if (deal.criteriaJson) {
    const criteria = deal.criteriaJson as any;
    let sizeScore = 0;

    // Room match (up to 12.5 points)
    if (criteria.rooms && property.rooms) {
      const roomDiff = Math.abs(criteria.rooms - property.rooms);
      if (roomDiff === 0) {
        sizeScore += 12.5;
      } else if (roomDiff === 1) {
        sizeScore += 8;
      } else if (roomDiff === 2) {
        sizeScore += 4;
      }
    }

    // Surface match (up to 12.5 points)
    if (criteria.surface && property.surface) {
      const surfaceDiff = Math.abs(criteria.surface - property.surface);
      const surfacePercentage = Math.max(0, 1 - surfaceDiff / criteria.surface);
      sizeScore += 12.5 * surfacePercentage;
    }

    explanation.sizeFit = Math.round(sizeScore);
    totalScore += explanation.sizeFit;
  } else {
    explanation.sizeFit = 0;
  }

  // Extras fit (0-20 points) - furnishing, parking, etc.
  if (deal.criteriaJson) {
    const criteria = deal.criteriaJson as any;
    let extrasScore = 0;

    // Furnishing match
    if (criteria.furnishingStatus && property.furnishingStatus) {
      if (criteria.furnishingStatus === property.furnishingStatus) {
        extrasScore += 10;
      }
    }

    // Other extras (parking, balcony, etc.) - simplified
    if (criteria.extras && Array.isArray(criteria.extras)) {
      // Assume property has matching extras (would need property.extras field)
      extrasScore += 10; // Simplified
    }

    explanation.extrasFit = Math.round(extrasScore);
    totalScore += explanation.extrasFit;
  } else {
    explanation.extrasFit = 0;
  }

  // Build explanation breakdown text
  const breakdownParts: string[] = [];
  if (explanation.budgetFit && explanation.budgetFit > 0) {
    breakdownParts.push(`Budget: ${explanation.budgetFit}/30`);
  }
  if (explanation.zoneFit && explanation.zoneFit > 0) {
    breakdownParts.push(`Zone: ${explanation.zoneFit}/25`);
  }
  if (explanation.sizeFit && explanation.sizeFit > 0) {
    breakdownParts.push(`Size: ${explanation.sizeFit}/25`);
  }
  if (explanation.extrasFit && explanation.extrasFit > 0) {
    breakdownParts.push(`Extras: ${explanation.extrasFit}/20`);
  }

  explanation.breakdown = breakdownParts.join(', ') || 'No matches';

  return {
    score: Math.round(totalScore),
    explanation
  };
}

/**
 * Match properties for a deal
 * @param tenantId - Tenant ID
 * @param dealId - Deal ID
 * @param threshold - Minimum score threshold (default 40)
 * @param limit - Maximum number of results (default 10)
 * @returns Ranked property matches
 */
export async function matchPropertiesForDeal(
  tenantId: string,
  dealId: string,
  threshold: number = 40,
  limit: number = 10
): Promise<PropertyMatch[]> {
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

  // Get available properties for tenant
  const properties = await prisma.property.findMany({
    where: {
      tenantId,
      status: 'available' // Only match available properties
    }
  });

  // Score each property
  const matches: PropertyMatch[] = [];

  for (const property of properties) {
    const { score, explanation } = calculateMatchScore(
      {
        budgetMin: deal.budgetMin ? Number(deal.budgetMin) : null,
        budgetMax: deal.budgetMax ? Number(deal.budgetMax) : null,
        locationZone: deal.locationZone,
        criteriaJson: deal.criteriaJson
      },
      {
        price: property.price ? Number(property.price) : null,
        locationZone: property.locationZone,
        rooms: property.rooms,
        surface: property.surface ? Number(property.surface) : null,
        type: property.type,
        furnishingStatus: property.furnishingStatus
      }
    );

    // Only include matches above threshold
    if (score >= threshold) {
      matches.push({
        propertyId: property.id,
        matchScore: score,
        matchExplanation: explanation
      });
    }
  }

  // Sort by score descending and limit
  matches.sort((a, b) => b.matchScore - a.matchScore);
  return matches.slice(0, limit);
}

/**
 * Add property to deal shortlist
 * @param tenantId - Tenant ID
 * @param dealId - Deal ID
 * @param propertyId - Property ID
 * @param matchScore - Match score
 * @param matchExplanation - Match explanation
 * @param sourceOwnerContactId - Optional owner contact ID
 * @returns Created deal property record
 */
export async function addPropertyToShortlist(
  tenantId: string,
  dealId: string,
  propertyId: string,
  matchScore: number,
  matchExplanation: PropertyMatch['matchExplanation'],
  sourceOwnerContactId?: string
) {
  // Verify deal exists
  const deal = await prisma.crmDeal.findFirst({
    where: {
      id: dealId,
      tenantId
    }
  });

  if (!deal) {
    throw new Error('Deal not found');
  }

  // Verify property exists
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      tenantId
    }
  });

  if (!property) {
    throw new Error('Property not found');
  }

  // Check if already in shortlist
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
    // Update existing record
    return prisma.crmDealProperty.update({
      where: { id: existing.id },
      data: {
        matchScore,
        matchExplanationJson: matchExplanation as any,
        status: CrmDealPropertyStatus.SHORTLISTED
      }
    });
  }

  // Create new shortlist entry
  return prisma.crmDealProperty.create({
    data: {
      tenantId,
      dealId,
      propertyId,
      sourceOwnerContactId: sourceOwnerContactId || null,
      matchScore,
      matchExplanationJson: matchExplanation as any,
      status: CrmDealPropertyStatus.SHORTLISTED
    }
  });
}

/**
 * Update property match status
 * @param tenantId - Tenant ID
 * @param dealId - Deal ID
 * @param propertyId - Property ID
 * @param status - New status
 * @returns Updated deal property record
 */
export async function updatePropertyMatchStatus(
  tenantId: string,
  dealId: string,
  propertyId: string,
  status: CrmDealPropertyStatus
) {
  // Verify deal property exists
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
    throw new Error('Property match not found');
  }

  return prisma.crmDealProperty.update({
    where: { id: dealProperty.id },
    data: { status }
  });
}

/**
 * Get property matches for a deal
 * @param tenantId - Tenant ID
 * @param dealId - Deal ID
 * @returns List of property matches
 */
export async function getDealPropertyMatches(tenantId: string, dealId: string) {
  // Verify deal exists
  const deal = await prisma.crmDeal.findFirst({
    where: {
      id: dealId,
      tenantId
    }
  });

  if (!deal) {
    throw new Error('Deal not found');
  }

  return prisma.crmDealProperty.findMany({
    where: {
      tenantId,
      dealId
    },
    include: {
      sourceOwner: {
        select: {
          id: true,
          firstName: true,
          lastName: true
        }
      }
    },
    orderBy: {
      matchScore: 'desc'
    }
  });
}




