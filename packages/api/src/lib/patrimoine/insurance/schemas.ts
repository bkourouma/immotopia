import { z } from 'zod';

/**
 * Validation Zod des polices, sinistres et pièces (lot B1, spec 032). Tous les
 * corps sont `.strict()` : un champ inconnu — notamment `outOfPocketAmount`
 * ou `indemnifiedAmount` hors transition — est rejeté. Appelés par `.parse()`
 * en tête de contrôleur.
 */

export const COVERAGE_TYPES = ['MULTIRISK_HOME', 'MULTIRISK_BUILDING', 'OWNER_LIABILITY', 'OTHER'] as const;
export const CLAIM_CAUSES = ['WATER_DAMAGE', 'FIRE', 'THEFT', 'STRUCTURAL', 'STORM', 'OTHER'] as const;
export const CLAIM_STATUSES = ['DECLARED', 'INSURER_NOTIFIED', 'EXPERTISE', 'SETTLED', 'REJECTED', 'CLOSED'] as const;
export const CLAIM_DOCUMENT_KINDS = [
  'PHOTO_BEFORE',
  'PHOTO_AFTER',
  'QUOTE',
  'EXPERT_REPORT',
  'INSURER_LETTER',
  'INVOICE'
] as const;
export const POLICY_STATUSES = ['UPCOMING', 'ACTIVE', 'EXPIRING_SOON', 'EXPIRED'] as const;

const SHORT_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const FULL_DATE = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})?$/;

/** Vrai si année-mois-jour désigne un jour du calendrier (`2026-02-31` est rejeté). */
function isCalendarDay(year: number, month: number, day: number): boolean {
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

function parseDateInput(value: string): Date | null {
  const match = SHORT_DATE.exec(value) ?? FULL_DATE.exec(value);
  if (!match || !isCalendarDay(Number(match[1]), Number(match[2]), Number(match[3]))) return null;
  // Un ISO complet sans fuseau est interprété en UTC (jamais l'heure locale du serveur).
  const hasZone = /(Z|[+-]\d{2}:\d{2})$/.test(value);
  const date = new Date(SHORT_DATE.test(value) || hasZone ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Date saisie : `AAAA-MM-JJ` strict (minuit UTC) ou ISO 8601 complet, converti
 * en `Date`. Un ISO sans fuseau est lu en UTC. Vérification aller-retour : un
 * jour inexistant (`2026-02-31`) est rejeté. Schéma unique du lot (polices,
 * sinistres, carnet d'entretien).
 */
export const dateInputSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const date = parseDateInput(value);
    if (!date) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'La date doit être au format AAAA-MM-JJ.' });
      return z.NEVER;
    }
    return date;
  });

/** Montant >= 0, deux décimales au plus. */
export const amountSchema = z
  .number({ invalid_type_error: 'Montant invalide.' })
  .finite()
  .min(0, 'Le montant ne peut pas être négatif.')
  .max(1e12, 'Montant trop élevé.')
  .refine(value => Math.abs(Math.round(value * 100) - value * 100) < 1e-6, 'Deux décimales au plus.');

export const currencySchema = z.string().regex(/^[A-Z]{3}$/, 'La devise doit comporter 3 lettres majuscules.');
export const idSchema = z.string().trim().min(1).max(64);
/** Identifiant stocké en `@db.Uuid` : un non-UUID est refusé en 400 avant d'atteindre Prisma. */
export const uuidSchema = z.string().trim().uuid('Identifiant invalide.');
const textSchema = (max: number) => z.string().trim().min(1, 'Ce champ est requis.').max(max);

function checkPolicyDates(value: { startDate?: Date; endDate?: Date }, ctx: z.RefinementCtx): void {
  if (value.startDate && value.endDate && value.endDate < value.startDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endDate'],
      message: 'La date de fin doit être postérieure ou égale à la date de début.'
    });
  }
}

export const createPolicySchema = z
  .object({
    propertyId: idSchema,
    insurer: textSchema(160),
    policyNumber: textSchema(80),
    coverageType: z.enum(COVERAGE_TYPES),
    startDate: dateInputSchema,
    endDate: dateInputSchema,
    annualPremium: amountSchema.nullable().optional(),
    currency: currencySchema.optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
    documentId: idSchema.nullable().optional()
  })
  .strict()
  .superRefine(checkPolicyDates);

export const updatePolicySchema = z
  .object({
    insurer: textSchema(160).optional(),
    policyNumber: textSchema(80).optional(),
    coverageType: z.enum(COVERAGE_TYPES).optional(),
    startDate: dateInputSchema.optional(),
    endDate: dateInputSchema.optional(),
    annualPremium: amountSchema.nullable().optional(),
    currency: currencySchema.optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
    documentId: idSchema.nullable().optional()
  })
  .strict()
  .superRefine(checkPolicyDates);

export const listPoliciesQuerySchema = z
  .object({ propertyId: idSchema.optional(), status: z.enum(POLICY_STATUSES).optional() })
  .strict();

const notInFuture = (date: Date) => date.getTime() <= Date.now() + 24 * 60 * 60 * 1000;
const occurredAtSchema = dateInputSchema.refine(notInFuture, 'La date du sinistre ne peut pas être dans le futur.');

export const createClaimSchema = z
  .object({
    propertyId: idSchema,
    policyId: uuidSchema,
    ticketId: uuidSchema.nullable().optional(),
    expenseId: uuidSchema.nullable().optional(),
    occurredAt: occurredAtSchema,
    cause: z.enum(CLAIM_CAUSES),
    description: textSchema(4000),
    claimedAmount: amountSchema,
    deductible: amountSchema.nullable().optional()
  })
  .strict();

export const updateClaimSchema = z
  .object({
    description: textSchema(4000).optional(),
    cause: z.enum(CLAIM_CAUSES).optional(),
    occurredAt: occurredAtSchema.optional(),
    claimedAmount: amountSchema.optional(),
    deductible: amountSchema.nullable().optional(),
    ticketId: uuidSchema.nullable().optional(),
    expenseId: uuidSchema.nullable().optional()
  })
  .strict();

export const listClaimsQuerySchema = z
  .object({
    propertyId: idSchema.optional(),
    policyId: uuidSchema.optional(),
    status: z.enum(CLAIM_STATUSES).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional()
  })
  .strict();

export const transitionClaimSchema = z
  .object({
    toStatus: z.enum(CLAIM_STATUSES),
    note: z.string().trim().max(2000).nullable().optional(),
    indemnifiedAmount: amountSchema.optional(),
    deductible: amountSchema.nullable().optional(),
    rejectionReason: z.string().trim().max(2000).optional()
  })
  .strict();

export const attachClaimDocumentSchema = z
  .object({ documentId: idSchema, kind: z.enum(CLAIM_DOCUMENT_KINDS) })
  .strict();

export type CreatePolicyInput = z.infer<typeof createPolicySchema>;
export type UpdatePolicyInput = z.infer<typeof updatePolicySchema>;
export type CreateClaimInput = z.infer<typeof createClaimSchema>;
export type UpdateClaimInput = z.infer<typeof updateClaimSchema>;
export type TransitionClaimInput = z.infer<typeof transitionClaimSchema>;
export type AttachClaimDocumentInput = z.infer<typeof attachClaimDocumentSchema>;
