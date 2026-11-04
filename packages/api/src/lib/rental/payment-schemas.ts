import { z } from 'zod';

/**
 * Schémas Zod du corps des paiements locatifs
 * (`POST /rental/payments`, `/allocate`, `PATCH /status`).
 * Module feuille : importé par `controllers/rental-payment-controller.ts` et testable sans Prisma.
 */

/** Plus grand montant que la colonne `amount` (Decimal 12,2) sait porter. */
export const MONTANT_MAX = 9_999_999_999.99;

export const createPaymentSchema = z.object({
  leaseId: z.string().uuid().optional(),
  renterClientId: z.string().uuid().optional(),
  invoiceId: z.string().uuid().optional(),
  method: z.enum(['CASH', 'BANK_TRANSFER', 'CHECK', 'MOBILE_MONEY', 'CARD', 'OTHER']),
  amount: z.number().positive().max(MONTANT_MAX, 'Le montant dépasse le maximum autorisé (9 999 999 999,99).'),
  currency: z.string().optional().default('FCFA'),
  mmOperator: z.enum(['ORANGE', 'MTN', 'MOOV', 'WAVE', 'OTHER']).optional(),
  mmPhone: z.string().optional(),
  pspName: z.string().optional(),
  pspTransactionId: z.string().optional(),
  pspReference: z.string().optional(),
  /** Date à laquelle le locataire a payé, `YYYY-MM-DD`. Absente : maintenant. */
  paidAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date du règlement attendue au format AAAA-MM-JJ')
    .optional(),
  idempotencyKey: z.string().optional(), // Auto-generated if not provided
  /** Lot 10 : compte de trésorerie réellement crédité. Absent : celui par défaut du moyen de paiement. */
  treasuryAccountId: z.string().uuid().optional().nullable()
});

export const allocatePaymentSchema = z.object({
  installmentIds: z.array(z.string().uuid()).min(1),
  amounts: z.record(z.string().uuid(), z.number().positive()).optional()
});

export const updatePaymentStatusSchema = z.object({
  status: z.enum(['PENDING', 'SUCCESS', 'FAILED', 'CANCELED', 'REFUNDED', 'PARTIALLY_REFUNDED'])
});
