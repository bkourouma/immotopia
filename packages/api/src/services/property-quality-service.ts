import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { getTemplateByType } from './property-template-service';

/**
 * Quality score weights
 */
const QUALITY_WEIGHTS = {
  REQUIRED_FIELDS: 0.4,
  MEDIA: 0.3,
  GEOLOCATION: 0.2,
  DESCRIPTION: 0.1
};

/**
 * Calculate quality score for a property
 * @param propertyId - Property ID
 * @returns Quality score (0-100) and suggestions
 */
export async function calculateQualityScore(propertyId: string): Promise<{
  score: number;
  suggestions: string[];
  breakdown: {
    requiredFields: number;
    media: number;
    geolocation: number;
    description: number;
  };
}> {
  // Get property with related data
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    include: {
      media: true,
      documents: {
        where: {
          isRequired: true,
          isValid: true
        }
      }
    }
  });

  if (!property) {
    throw new Error('Property not found');
  }

  // Get template for required fields
  const template = await getTemplateByType(property.propertyType);

  // Calculate each component
  const requiredFieldsScore = await getRequiredFieldsCompletion(property, template);
  const mediaScore = calculateMediaScore(property.media);
  const geolocationScore = property.latitude && property.longitude ? 1.0 : 0.0;
  const descriptionScore = calculateDescriptionQuality(property.description);

  // Calculate total score
  const totalScore =
    requiredFieldsScore * QUALITY_WEIGHTS.REQUIRED_FIELDS +
    mediaScore * QUALITY_WEIGHTS.MEDIA +
    geolocationScore * QUALITY_WEIGHTS.GEOLOCATION +
    descriptionScore * QUALITY_WEIGHTS.DESCRIPTION;

  const finalScore = Math.round(totalScore * 100);

  // Generate suggestions
  const suggestions = await generateSuggestions(property, template, {
    requiredFields: requiredFieldsScore,
    media: mediaScore,
    geolocation: geolocationScore,
    description: descriptionScore
  });

  return {
    score: finalScore,
    suggestions,
    breakdown: {
      requiredFields: Math.round(requiredFieldsScore * 100),
      media: Math.round(mediaScore * 100),
      geolocation: Math.round(geolocationScore * 100),
      description: Math.round(descriptionScore * 100)
    }
  };
}

/**
 * Calculate required fields completion percentage
 * @param property - Property data
 * @param template - Property type template
 * @returns Completion percentage (0-1)
 */
async function getRequiredFieldsCompletion(property: any, template: any): Promise<number> {
  if (!template || !template.fieldDefinitions) {
    // No template = all fields optional, return 1.0
    return 1.0;
  }

  const requiredFields = template.fieldDefinitions.filter((field: any) => field.required);
  if (requiredFields.length === 0) {
    return 1.0;
  }

  let completedFields = 0;

  for (const field of requiredFields) {
    const fieldPath = field.name.split('.');
    let value = property;

    // Navigate nested path
    for (const segment of fieldPath) {
      if (value && typeof value === 'object') {
        value = value[segment];
      } else {
        value = undefined;
        break;
      }
    }

    // Check if field has value
    if (value !== null && value !== undefined && value !== '') {
      if (Array.isArray(value) && value.length > 0) {
        completedFields++;
      } else if (typeof value === 'object' && Object.keys(value).length > 0) {
        completedFields++;
      } else if (typeof value !== 'object') {
        completedFields++;
      }
    }
  }

  return completedFields / requiredFields.length;
}

/**
 * Calculate media score based on media presence
 * @param media - Property media array
 * @returns Media score (0-1)
 */
function calculateMediaScore(media: any[]): number {
  if (!media || media.length === 0) {
    return 0.0;
  }

  // Check for primary photo
  const hasPrimary = media.some(m => m.isPrimary);
  if (!hasPrimary) {
    return 0.3; // Partial score if media exists but no primary
  }

  // Score based on number of media items
  const mediaCount = media.length;
  if (mediaCount >= 10) {
    return 1.0; // Excellent
  } else if (mediaCount >= 5) {
    return 0.8; // Good
  } else if (mediaCount >= 3) {
    return 0.6; // Fair
  } else if (mediaCount >= 1) {
    return 0.4; // Basic
  }

  return 0.0;
}

/**
 * Calculate description quality score
 * @param description - Property description
 * @returns Description score (0-1)
 */
function calculateDescriptionQuality(description: string | null): number {
  if (!description || description.trim() === '') {
    return 0.0;
  }

  const wordCount = description.trim().split(/\s+/).length;
  const charCount = description.trim().length;

  // Score based on length and content
  if (wordCount >= 200 && charCount >= 1000) {
    return 1.0; // Excellent - detailed description
  } else if (wordCount >= 100 && charCount >= 500) {
    return 0.8; // Good - comprehensive
  } else if (wordCount >= 50 && charCount >= 250) {
    return 0.6; // Fair - adequate
  } else if (wordCount >= 20 && charCount >= 100) {
    return 0.4; // Basic - minimal
  } else if (wordCount > 0) {
    return 0.2; // Very basic
  }

  return 0.0;
}

/**
 * Generate improvement suggestions
 * @param property - Property data
 * @param template - Property type template
 * @param breakdown - Score breakdown
 * @returns Array of suggestion strings
 */
async function generateSuggestions(
  property: any,
  template: any,
  breakdown: {
    requiredFields: number;
    media: number;
    geolocation: number;
    description: number;
  }
): Promise<string[]> {
  const suggestions: string[] = [];

  // Required fields suggestions
  if (breakdown.requiredFields < 1.0 && template && template.fieldDefinitions) {
    const requiredFields = template.fieldDefinitions.filter((field: any) => field.required);
    const missingFields: string[] = [];

    for (const field of requiredFields) {
      const fieldPath = (field.key || field.name).split('.');
      let value = property;

      for (const segment of fieldPath) {
        if (value && typeof value === 'object') {
          value = value[segment];
        } else {
          value = undefined;
          break;
        }
      }

      if (value === null || value === undefined || value === '') {
        missingFields.push(field.label || field.name);
      }
    }

    if (missingFields.length > 0) {
      suggestions.push(
        `Complétez les champs requis: ${missingFields.slice(0, 5).join(', ')}${missingFields.length > 5 ? '...' : ''}`
      );
    }
  }

  // Media suggestions
  if (breakdown.media < 0.5) {
    if (!property.media || property.media.length === 0) {
      suggestions.push('Ajoutez au moins une photo principale de la propriété');
    } else {
      const hasPrimary = property.media.some((m: any) => m.isPrimary);
      if (!hasPrimary) {
        suggestions.push('Définissez une photo principale');
      }
      if (property.media.length < 5) {
        suggestions.push(
          `Ajoutez plus de photos (recommandé: au moins 5 photos, actuellement: ${property.media.length})`
        );
      }
    }
  }

  // Geolocation suggestions
  if (breakdown.geolocation < 1.0) {
    suggestions.push("Ajoutez la géolocalisation (latitude/longitude) pour l'affichage sur la carte");
  }

  // Description suggestions
  if (breakdown.description < 0.6) {
    const wordCount = property.description ? property.description.trim().split(/\s+/).length : 0;
    if (wordCount === 0) {
      suggestions.push('Ajoutez une description de la propriété');
    } else if (wordCount < 50) {
      suggestions.push(`Enrichissez la description (recommandé: au moins 100 mots, actuellement: ${wordCount})`);
    } else if (wordCount < 100) {
      suggestions.push(
        `Améliorez la description avec plus de détails (recommandé: au moins 200 mots, actuellement: ${wordCount})`
      );
    }
  }

  // Price suggestions
  if (!property.price) {
    suggestions.push('Ajoutez un prix pour améliorer la visibilité');
  }

  // Address suggestions
  if (!property.address || property.address.trim() === '') {
    suggestions.push("Ajoutez l'adresse complète de la propriété");
  }

  // Location zone suggestions
  if (!property.locationZone || property.locationZone.trim() === '') {
    suggestions.push('Ajoutez la zone/quartier pour faciliter la recherche');
  }

  return suggestions;
}

/**
 * Store quality score in database
 * @param propertyId - Property ID
 * @param score - Quality score (0-100)
 * @param suggestions - Improvement suggestions
 * @returns Stored quality score record
 */
export async function storeQualityScore(propertyId: string, score: number, suggestions: string[]) {
  return prisma.propertyQualityScore.create({
    data: {
      propertyId,
      score,
      suggestions: suggestions as any
    }
  });
}

/**
 * Get latest quality score for a property
 * @param propertyId - Property ID
 * @returns Latest quality score or null
 */
export async function getLatestQualityScore(propertyId: string) {
  const score = await prisma.propertyQualityScore.findFirst({
    where: { propertyId },
    orderBy: { calculatedAt: 'desc' }
  });

  return score;
}

/**
 * Calculate and store quality score
 * @param propertyId - Property ID
 * @returns Quality score result
 */
export async function calculateAndStoreQualityScore(propertyId: string) {
  const result = await calculateQualityScore(propertyId);
  await storeQualityScore(propertyId, result.score, result.suggestions);

  logger.info('Property quality score calculated', {
    propertyId,
    score: result.score
  });

  return result;
}
