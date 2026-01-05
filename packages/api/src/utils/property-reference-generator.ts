import { prisma } from './database';
import { logger } from './logger';

/**
 * Generate unique property reference in format PROP-{YYYYMMDD}-{prefix}-{sequential}
 * @param tenantId - Tenant ID (for tenant-owned properties)
 * @param ownerId - Owner user ID (for public/private owner properties)
 * @returns Unique property reference
 */
export async function generatePropertyReference(tenantId: string | null, ownerId: string | null): Promise<string> {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  // Generate prefix from tenantId or ownerId
  let prefix: string;
  if (tenantId) {
    // Use last 4 alphanumeric characters of tenantId (remove hyphens first)
    const cleanId = tenantId.replace(/-/g, '');
    prefix = cleanId.slice(-4).toUpperCase();
  } else if (ownerId) {
    const cleanId = ownerId.replace(/-/g, '');
    prefix = cleanId.slice(-4).toUpperCase();
  } else {
    prefix = 'PUB';
  }

  // Ensure prefix is exactly 4 characters
  if (prefix.length < 4) {
    prefix = prefix.padStart(4, '0');
  } else if (prefix.length > 4) {
    prefix = prefix.slice(0, 4);
  }

  // Get the starting sequential number
  let sequential = await getNextSequentialNumber(date, prefix);
  let attempts = 0;
  const maxAttempts = 100; // Increased attempts

  while (attempts < maxAttempts) {
    const reference = `PROP-${date}-${prefix}-${sequential.toString().padStart(4, '0')}`;

    // Check for collision
    try {
      const existing = await prisma.property.findUnique({
        where: { internalReference: reference },
        select: { id: true } // Only select id for performance
      });

      if (!existing) {
        logger.debug('Generated unique property reference', { reference, attempts });
        return reference;
      }

      // Collision detected - increment sequential and try again
      sequential++;
      attempts++;

      if (attempts % 10 === 0) {
        logger.warn('Property reference collision - retrying', { reference, attempts, sequential });
      }

      // Small delay to avoid rapid retries (only after first few attempts)
      if (attempts > 5 && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5));
      }
    } catch (error: any) {
      logger.error('Error checking property reference', { error: error.message, reference, attempts });
      sequential++;
      attempts++;
    }
  }

  // Fallback: use timestamp-based reference with random component
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  const fallbackReference =
    `PROP-${date}-${prefix}-${(timestamp % 10000).toString().padStart(4, '0')}${random.toString().padStart(3, '0')}`.slice(
      0,
      25
    ); // Ensure max length

  // Final check for fallback
  try {
    const existingFallback = await prisma.property.findUnique({
      where: { internalReference: fallbackReference },
      select: { id: true }
    });

    if (!existingFallback) {
      logger.warn('Using fallback timestamp-based reference', { fallbackReference, attempts });
      return fallbackReference;
    }
  } catch (error: any) {
    logger.error('Error checking fallback reference', { error: error.message, fallbackReference });
  }

  // Last resort: use UUID-based reference (guaranteed unique)
  const uuidRef = `PROP-${date}-${prefix}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  logger.error('Using UUID-based fallback reference after all attempts failed', { uuidRef, attempts });
  return uuidRef;
}

/**
 * Get next sequential number for a given date and prefix
 * @param date - Date string in YYYYMMDD format
 * @param prefix - Tenant or owner prefix
 * @returns Next sequential number
 */
async function getNextSequentialNumber(date: string, prefix: string): Promise<number> {
  const todayStart = `PROP-${date}-${prefix}-`;

  try {
    const lastProperty = await prisma.property.findFirst({
      where: {
        internalReference: {
          startsWith: todayStart
        }
      },
      orderBy: {
        internalReference: 'desc'
      },
      select: {
        internalReference: true
      }
    });

    if (!lastProperty) {
      return 1;
    }

    // Extract sequential number from reference
    // Format: PROP-YYYYMMDD-PREFIX-XXXX
    const parts = lastProperty.internalReference.split('-');
    if (parts.length >= 4) {
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq) && lastSeq > 0) {
        return lastSeq + 1;
      }
    }

    return 1;
  } catch (error: any) {
    logger.error('Error getting next sequential number', { error: error.message, date, prefix });
    return 1; // Default to 1 on error
  }
}
