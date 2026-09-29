import { z } from 'zod';

/**
 * Validation Zod des entités détentrices et de leurs rattachements (lot P4,
 * territoire A2). Contrat : section 3 de `p4-contrat.md`.
 *
 * Motif du module (voir `.claude/rules/api-routes.md`) : schémas appelés
 * directement en tête de contrôleur avec `.parse()`, jamais `.safeParse()`
 * suivi d'un abandon silencieux. Tous les corps de requête sont `.strict()`.
 */

const HOLDING_ENTITY_FORMS = ['SCI', 'HOLDING', 'COMPANY', 'INDIVIDUAL', 'OTHER'] as const;
const FISCAL_COUNTRIES = ['CI', 'ML'] as const;
const FISCAL_OWNER_KINDS = ['INDIVIDUAL', 'COMPANY'] as const;

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La date doit être au format AAAA-MM-JJ.');

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Le nom est requis.')
  .max(160, 'Le nom ne peut pas dépasser 160 caractères.');

/** 4 décimales maximum, comme la colonne `Decimal(7, 4)`. */
const sharePercentSchema = z.coerce
  .number()
  .gt(0, 'La quote-part doit être supérieure à 0.')
  .max(100, 'La quote-part ne peut pas dépasser 100 %.')
  .refine(value => Math.round(value * 10000) === value * 10000, {
    message: 'La quote-part ne peut pas porter plus de 4 décimales.'
  });

export const listHoldingEntitiesQuerySchema = z
  .object({
    search: z.string().trim().max(160).optional(),
    legalForm: z.enum(HOLDING_ENTITY_FORMS).optional(),
    country: z.enum(FISCAL_COUNTRIES).optional(),
    includeInactive: z.enum(['true', 'false']).optional()
  })
  .strict();

export const createHoldingEntitySchema = z
  .object({
    name: nameSchema,
    legalForm: z.enum(HOLDING_ENTITY_FORMS),
    country: z.enum(FISCAL_COUNTRIES),
    rccm: z.string().trim().max(60).nullish(),
    taxId: z.string().trim().max(60).nullish(),
    contactId: z.string().trim().min(1).nullish(),
    parentEntityId: z.string().uuid().nullish(),
    fiscalOwnerKind: z.enum(FISCAL_OWNER_KINDS).nullish(),
    notes: z.string().trim().max(2000).nullish()
  })
  .strict();

export const updateHoldingEntitySchema = z
  .object({
    name: nameSchema.optional(),
    legalForm: z.enum(HOLDING_ENTITY_FORMS).optional(),
    country: z.enum(FISCAL_COUNTRIES).optional(),
    rccm: z.string().trim().max(60).nullish(),
    taxId: z.string().trim().max(60).nullish(),
    contactId: z.string().trim().min(1).nullish(),
    parentEntityId: z.string().uuid().nullish(),
    fiscalOwnerKind: z.enum(FISCAL_OWNER_KINDS).nullish(),
    notes: z.string().trim().max(2000).nullish(),
    isActive: z.boolean().optional()
  })
  .strict();

export const createEntityHoldingSchema = z
  .object({
    propertyId: z.string().trim().min(1, 'Le bien est requis.'),
    sharePercent: sharePercentSchema,
    effectiveFrom: dateOnlySchema.nullish(),
    notes: z.string().trim().max(2000).nullish()
  })
  .strict();

export const updateEntityHoldingSchema = z
  .object({
    sharePercent: sharePercentSchema.optional(),
    effectiveFrom: dateOnlySchema.nullish(),
    notes: z.string().trim().max(2000).nullish()
  })
  .strict();

const propertyHoldingInputSchema = z
  .object({
    entityId: z.string().uuid("Identifiant d'entité invalide."),
    sharePercent: sharePercentSchema,
    effectiveFrom: dateOnlySchema.nullish(),
    notes: z.string().trim().max(2000).nullish()
  })
  .strict();

export const setPropertyHoldingsSchema = z
  .object({
    holdings: z.array(propertyHoldingInputSchema).max(20, 'Vingt détenteurs au maximum par bien.')
  })
  .strict();

export type CreateHoldingEntityInput = z.infer<typeof createHoldingEntitySchema>;
export type UpdateHoldingEntityInput = z.infer<typeof updateHoldingEntitySchema>;
export type CreateEntityHoldingInput = z.infer<typeof createEntityHoldingSchema>;
export type UpdateEntityHoldingInput = z.infer<typeof updateEntityHoldingSchema>;
export type SetPropertyHoldingsInput = z.infer<typeof setPropertyHoldingsSchema>;
