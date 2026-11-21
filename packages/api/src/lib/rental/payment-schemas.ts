import { z } from 'zod';
import { t } from '../../i18n';
import { isWholeUnitCurrency } from '../finance/currency-rounding';

/**
 * Schémas Zod du corps des paiements locatifs
 * (`POST /rental/payments`, `/allocate`, `PATCH /status`).
 * Module feuille : importé par `controllers/rental-payment-controller.ts` et testable sans Prisma.
 */

/** Plus grand montant que la colonne `amount` (Decimal 12,2) sait porter. */
export const MONTANT_MAX = 9_999_999_999.99;

/**
 * En FCFA/XOF/XAF, un montant est entier de bout en bout (décision H3) :
 * une saisie avec décimales est refusée, jamais arrondie en silence.
 */
export function hasForbiddenDecimals(amount: number, currency?: string | null): boolean {
  return isWholeUnitCurrency(currency) && !Number.isInteger(amount);
}

export const createPaymentSchema = z
  .object({
    leaseId: z.string().uuid().optional(),
    renterClientId: z.string().uuid().optional(),
    invoiceId: z.string().uuid().optional(),
    method: z.enum(['CASH', 'BANK_TRANSFER', 'CHECK', 'MOBILE_MONEY', 'CARD', 'OTHER']),
    // Minimum 0,01 : un montant inférieur serait arrondi à 0,00 par la colonne `Decimal(12,2)`.
    amount: z
      .number()
      .min(0.01, 'Le montant doit être supérieur à 0.')
      .max(MONTANT_MAX, 'Le montant dépasse le maximum autorisé (9 999 999 999,99).'),
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
  })
  .superRefine((data, ctx) => {
    if (hasForbiddenDecimals(data.amount, data.currency)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amount'],
        message: t('Le montant doit être un nombre entier en FCFA.')
      });
    }
  });

export const allocatePaymentSchema = z.object({
  installmentIds: z.array(z.string().uuid()).min(1),
  amounts: z.record(z.string().uuid(), z.number().min(0.01).max(MONTANT_MAX)).optional()
});

export const updatePaymentStatusSchema = z.object({
  status: z.enum(['PENDING', 'SUCCESS', 'FAILED', 'CANCELED', 'REFUNDED', 'PARTIALLY_REFUNDED'])
});
