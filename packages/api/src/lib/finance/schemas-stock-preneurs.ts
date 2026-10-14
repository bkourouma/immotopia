import { z } from 'zod';

/**
 * Validation Zod du carnet des preneurs — lot 040, B2 (contrat
 * `CreateTakerRequest`, `UpdateTakerRequest`).
 *
 * `.strict()` partout : un corps qui répéterait `tenantId` ou `takerId`, ou
 * enverrait un champ que le contrat ne connaît pas (pièce d'identité, note
 * libre…), est refusé en 400 plutôt qu'ignoré en silence. Le carnet est
 * minimal à dessein (spec §10) : nom, équipe, téléphone facultatif, lien
 * facultatif vers un employé OU un tâcheron.
 */

/** `z.coerce.boolean()` ferait de `?onlyActive=false` un `true` : on lit les deux chaînes littérales. */
const booleanQueryParam = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .optional()
  .transform(value => (typeof value === 'string' ? value === 'true' : value));

const fullNameSchema = z
  .string()
  .trim()
  .min(2, 'Le nom complet du preneur compte au moins 2 caractères.')
  .max(120, 'Le nom complet du preneur compte au plus 120 caractères.');

const teamSchema = z
  .string()
  .trim()
  .max(120, 'L’équipe ou l’entreprise compte au plus 120 caractères.')
  .nullable()
  .optional();

const phoneSchema = z.string().trim().max(30, 'Le téléphone compte au plus 30 caractères.').nullable().optional();

const employeeIdSchema = z.string().uuid('Identifiant d’employé invalide.').nullable().optional();
const contractorIdSchema = z.string().uuid('Identifiant de tâcheron invalide.').nullable().optional();

/** Un preneur se lie à un employé OU à un tâcheron, jamais aux deux. */
function refineSingleLink(
  value: { employeeId?: string | null; contractorId?: string | null },
  ctx: z.RefinementCtx
): void {
  if (value.employeeId && value.contractorId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Liez le preneur à un employé ou à un tâcheron, pas aux deux.',
      path: ['contractorId']
    });
  }
}

// ---------------------------------------------------------------------------
// GET /stock/takers
// ---------------------------------------------------------------------------

export const listStockTakersQuerySchema = z
  .object({
    onlyActive: booleanQueryParam,
    search: z.string().trim().max(120, 'La recherche compte au plus 120 caractères.').optional()
  })
  .strict();

export type ListStockTakersQuery = z.infer<typeof listStockTakersQuerySchema>;

// ---------------------------------------------------------------------------
// POST /stock/takers
// ---------------------------------------------------------------------------

export const createStockTakerSchema = z
  .object({
    fullName: fullNameSchema,
    teamOrCompany: teamSchema,
    phone: phoneSchema,
    employeeId: employeeIdSchema,
    contractorId: contractorIdSchema
  })
  .strict()
  .superRefine(refineSingleLink);

export type CreateStockTakerInput = z.infer<typeof createStockTakerSchema>;

// ---------------------------------------------------------------------------
// PATCH /stock/takers/:takerId
//
// `phone: null` efface le numéro (B2-R4) ; `isActive: false` désactive le
// preneur, qui ne se supprime jamais.
// ---------------------------------------------------------------------------

export const updateStockTakerSchema = z
  .object({
    fullName: fullNameSchema.optional(),
    teamOrCompany: teamSchema,
    phone: phoneSchema,
    employeeId: employeeIdSchema,
    contractorId: contractorIdSchema,
    isActive: z.boolean().optional()
  })
  .strict()
  .superRefine(refineSingleLink)
  .refine(value => Object.keys(value).length > 0, { message: 'Aucune correction fournie.' });

export type UpdateStockTakerInput = z.infer<typeof updateStockTakerSchema>;
