import { z } from 'zod';
import { MONTANT_MAX } from './payment-schemas';

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

// @i18n-keys
const MESSAGE_MONTANT_MAX = 'Le montant dépasse le maximum autorisé (9 999 999 999,99).';

/** Montant ≥ 0 tenant dans la colonne Decimal(12, 2) : sans plafond, un excès finit en 500 (P2020). */
const montantBorne = () => z.number().nonnegative().max(MONTANT_MAX, MESSAGE_MONTANT_MAX);

// @i18n-keys
const MESSAGE_TAUX_MAX = 'Le taux dépasse le maximum autorisé (99 999 999,9999).';

/** Taux de pénalité : colonne Decimal(12, 4), plus grande valeur 99 999 999,9999. */
const TAUX_MAX = 99_999_999.9999;
const tauxBorne = () => z.number().nonnegative().max(TAUX_MAX, MESSAGE_TAUX_MAX);

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
    rentAmount: montantBorne().optional(),
    serviceChargeAmount: montantBorne().optional(),
    securityDepositAmount: montantBorne().optional(),
    penaltyGraceDays: z.number().int().nonnegative().optional(),
    penaltyMode: z.enum(['FIXED_AMOUNT', 'PERCENT_OF_RENT', 'PERCENT_OF_BALANCE']).optional(),
    penaltyRate: tauxBorne().optional(),
    penaltyFixedAmount: montantBorne().optional(),
    penaltyCapAmount: montantBorne().optional(),
    notes: z.string().optional(),
    termsJson: z.record(z.any()).optional()
  })
  .refine(data => data.primaryRenterClientId || data.primaryRenterContactId, {
    message: 'Either primaryRenterClientId or primaryRenterContactId is required',
    path: ['primaryRenterClientId']
  });

// `null` retire la date (bail sans fin) ; absent la laisse inchangée.
export const updateLeaseSchema = z.object({
  endDate: datetimeSchema.nullable().optional(),
  moveInDate: datetimeSchema.nullable().optional(),
  moveOutDate: datetimeSchema.nullable().optional(),
  rentAmount: z.number().positive().max(MONTANT_MAX, MESSAGE_MONTANT_MAX).optional(),
  serviceChargeAmount: montantBorne().optional(),
  securityDepositAmount: montantBorne().optional(),
  billingFrequency: z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL']).optional(),
  notes: z.string().optional()
});
