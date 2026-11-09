import { z } from 'zod';
import { RENTAL_REVIEW_ALERT_BUSINESS_DAYS_MAX, RENTAL_REVIEW_ALERT_BUSINESS_DAYS_MIN } from './types';

/**
 * Corps des routes gestionnaire « numéros de réception » et « réglages »
 * (contrat §1.1 et §1.2). `.strict()` : un champ inconnu lève une ZodError
 * (400 `VALIDATION_ERROR`). Le téléphone est contrôlé à part (`INVALID_PHONE`).
 */

const OPERATORS = ['ORANGE', 'MTN', 'MOOV', 'WAVE', 'OTHER'] as const;

export const createReceivingNumberBodySchema = z
  .object({
    operator: z.enum(OPERATORS),
    phone: z.string().max(40),
    label: z.string().trim().max(60).nullable().optional(),
    active: z.boolean().optional()
  })
  .strict();

export const updateReceivingNumberBodySchema = z
  .object({
    operator: z.enum(OPERATORS).optional(),
    phone: z.string().max(40).optional(),
    label: z.string().trim().max(60).nullable().optional(),
    active: z.boolean().optional()
  })
  .strict()
  .refine(body => Object.values(body).some(value => value !== undefined), {
    message: 'Au moins un champ est requis.'
  });

export const listReceivingNumbersQuerySchema = z.object({ active: z.enum(['true', 'false']).optional() }).passthrough();

/** `payerInstructions` : ajout additif (colonne `payer_instructions`, lue par le portail). */
export const updateDeclaredSettingsBodySchema = z
  .object({
    enabled: z.boolean().optional(),
    proofRequired: z.boolean().optional(),
    aiPrefillEnabled: z.boolean().optional(),
    reviewAlertBusinessDays: z
      .number()
      .int()
      .min(RENTAL_REVIEW_ALERT_BUSINESS_DAYS_MIN)
      .max(RENTAL_REVIEW_ALERT_BUSINESS_DAYS_MAX)
      .optional(),
    payerInstructions: z.string().trim().max(500).nullable().optional()
  })
  .strict()
  .refine(body => Object.values(body).some(value => value !== undefined), {
    message: 'Au moins un champ est requis.'
  });
