import { z } from 'zod';

/**
 * Validation Zod des points d'entrée fiscaux (profil fiscal d'un bien,
 * estimations, référentiel) — lot P4, territoire A2. Contrat : section 3 de
 * `p4-contrat.md`.
 */

const FISCAL_COUNTRIES = ['CI', 'ML'] as const;
const TAX_PROPERTY_KINDS = ['BUILT', 'UNBUILT'] as const;
const TAX_OCCUPANCIES = ['MAIN_RESIDENCE', 'OWNER_OCCUPIED', 'RENTED', 'VACANT'] as const;

export const taxEstimateQuerySchema = z
  .object({
    year: z.coerce.number().int().min(2000).max(2100).optional()
  })
  .strict();

export const taxProfileSchema = z
  .object({
    country: z.enum(FISCAL_COUNTRIES).nullish(),
    builtStatus: z.enum(TAX_PROPERTY_KINDS).nullish(),
    occupancy: z.enum(TAX_OCCUPANCIES).nullish(),
    declaredRentalValue: z.coerce.number().min(0).nullish(),
    exemptUntilYear: z.coerce.number().int().min(2000).max(2100).nullish(),
    exemptionReason: z.string().trim().max(300).nullish(),
    notes: z.string().trim().max(2000).nullish()
  })
  .strict();

export const propertyTaxEstimateQuerySchema = z
  .object({
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    country: z.enum(FISCAL_COUNTRIES).optional()
  })
  .strict();

export const taxParametersQuerySchema = z
  .object({
    country: z.enum(FISCAL_COUNTRIES).default('CI'),
    year: z.coerce.number().int().min(2000).max(2100).optional()
  })
  .strict();

export type TaxProfileInput = z.infer<typeof taxProfileSchema>;
