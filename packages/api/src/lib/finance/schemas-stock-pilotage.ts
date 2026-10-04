import { z } from 'zod';
import { uuidPathParamSchema as sharedUuidPathParamSchema } from './schemas';

/**
 * Validation Zod du pilotage du stock — lot 040 (alertes, indicateurs,
 * réglages de contrôle ; contrat `openapi.yaml` 2.0.0).
 *
 * Les corps sont `.strict()` : un champ inconnu (dont `tenantId`, qui vient
 * toujours du chemin) répond 400 plutôt que d'être ignoré en silence.
 */

export const uuidPathParamSchema = sharedUuidPathParamSchema;

const ALERT_KINDS = [
  'COUNT_VARIANCE',
  'COUNT_LINE_SET_ASIDE',
  'COUNT_CANCELLED',
  'COUNT_SELF_VALIDATED',
  'LARGE_ISSUE',
  'LARGE_SCRAP',
  'RECEIPT_REPEATED',
  'RECEIPT_OVER_INVOICE',
  'RECEIPT_UNVALUED',
  'CASH_MATERIAL_PURCHASE'
] as const;

/** `AAAA-MM-JJ`, jour UTC. */
const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La date doit avoir la forme AAAA-MM-JJ.')
  .transform((value, ctx) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Date invalide.' });
      return z.NEVER;
    }
    return date;
  });

/** `GET /stock/alerts`. */
export const listStockAlertsQuerySchema = z.object({
  status: z.enum(['OPEN', 'ACKNOWLEDGED']).optional(),
  kind: z.enum(ALERT_KINDS).optional(),
  siteId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  from: isoDay.optional(),
  to: isoDay.optional(),
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

/** `POST /stock/alerts/:alertId/acknowledge` : note facultative. */
export const acknowledgeStockAlertSchema = z
  .object({
    note: z.string().max(1000).nullable().optional()
  })
  .strict();

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

/** `GET /stock/indicators`. */
export const stockIndicatorsQuerySchema = z.object({
  from: z.string().regex(monthPattern, 'Le mois doit avoir la forme AAAA-MM.'),
  to: z.string().regex(monthPattern, 'Le mois doit avoir la forme AAAA-MM.'),
  locationId: z.string().uuid().optional()
});

const amount = z.number().finite().min(0).nullable();

/** `PATCH /stock/settings/controls` (contrat `ControlsSettingsPatch`, data-model §2.2). */
export const updateStockControlsSchema = z
  .object({
    backdatingLimitDays: z.number().int().min(0).max(365).optional(),
    requireTaker: z.boolean().optional(),
    issueAlertAmount: amount.optional(),
    countVarianceAlertAmount: amount.optional(),
    countVarianceAlertPercent: z.number().finite().min(0).max(100).nullable().optional(),
    cashMaterialAlertAmount: amount.optional(),
    materialCostCategoryIds: z.array(z.string().uuid()).max(100).optional()
  })
  .strict()
  .refine(value => Object.values(value).some(entry => entry !== undefined), {
    message: 'Indiquez au moins un réglage à modifier.'
  });

export type UpdateStockControlsInput = z.infer<typeof updateStockControlsSchema>;
