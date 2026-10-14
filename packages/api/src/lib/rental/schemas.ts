import { z } from 'zod';

/**
 * Schémas Zod du corps des baux (`POST /rental/leases`, `PATCH /rental/leases/:leaseId`).
 * Module feuille : importé par `controllers/rental-controller.ts` et par la validation à sec
 * d'ImmoCopilot (`lib/ai/gateway/write-validators.ts`), sans entraîner de service ni de Prisma.
 */

// Helper function to validate datetime strings
const datetimeSchema = z.string().refine(
  val => {
    if (!val || val.trim() === '') return true; // Allow empty for optional fields
    // Check for obviously malformed dates (like +020257 instead of 2027)
    if (val.match(/^\+0+\d/)) {
      return false;
    }
    const date = new Date(val);
    const isValid = !isNaN(date.getTime());
    // Also check that it's a valid ISO-like format (should contain T for datetime)
    return isValid && (val.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(val));
  },
  {
    message: 'Format de date invalide. Utilisez le format ISO 8601 (ex: 2026-01-01T00:00:00.000Z)'
  }
);

// Validation schemas
export const createLeaseSchema = z
  .object({
    leaseNumber: z.string().min(1).optional(), // Optional - will be auto-generated if not provided
    propertyId: z.string().min(1),
    // Support both CRM contact IDs and TenantClient IDs
    primaryRenterClientId: z.string().min(1).optional(),
    primaryRenterContactId: z.string().min(1).optional(),
    ownerClientId: z.string().optional(),
    ownerContactId: z.string().optional(),
    startDate: datetimeSchema,
    endDate: datetimeSchema.optional(),
    moveInDate: datetimeSchema.optional(),
    moveOutDate: datetimeSchema.optional(),
    billingFrequency: z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL']).optional(),
    dueDayOfMonth: z.number().int().min(1).max(31).optional(),
    currency: z.string().optional().default('FCFA'),
    rentAmount: z.number().nonnegative().optional(),
    serviceChargeAmount: z.number().nonnegative().optional(),
    securityDepositAmount: z.number().nonnegative().optional(),
    penaltyGraceDays: z.number().int().nonnegative().optional(),
    penaltyMode: z.enum(['FIXED_AMOUNT', 'PERCENT_OF_RENT', 'PERCENT_OF_BALANCE']).optional(),
    penaltyRate: z.number().nonnegative().optional(),
    penaltyFixedAmount: z.number().nonnegative().optional(),
    penaltyCapAmount: z.number().nonnegative().optional(),
    notes: z.string().optional(),
    termsJson: z.record(z.any()).optional()
  })
  .refine(data => data.primaryRenterClientId || data.primaryRenterContactId, {
    message: 'Either primaryRenterClientId or primaryRenterContactId is required',
    path: ['primaryRenterClientId']
  });

export const updateLeaseSchema = z.object({
  endDate: datetimeSchema.optional(),
  moveInDate: datetimeSchema.optional(),
  moveOutDate: datetimeSchema.optional(),
  rentAmount: z.number().positive().optional(),
  serviceChargeAmount: z.number().nonnegative().optional(),
  securityDepositAmount: z.number().nonnegative().optional(),
  billingFrequency: z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL']).optional(),
  notes: z.string().optional()
});
