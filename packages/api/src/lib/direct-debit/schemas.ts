import { z } from 'zod';

/**
 * Validation des corps et requêtes du prélèvement bancaire (spec 042, P1).
 * Les montants sont des nombres (FCFA) ; `null` efface un champ facultatif.
 */

const emptyToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value);

const label = z.string().trim().min(1).max(120);
const creditorIdentifier = z.preprocess(emptyToNull, z.string().trim().min(1).max(32).nullable());
const collectionDay = z.number().int().min(1).max(28);
const prenotificationBusinessDays = z.number().int().min(0).max(30);
const rejectFeeAmount = z.number().min(0).max(100_000_000);
const maxConsecutiveRejects = z.number().int().min(1).max(10);

export const createCreditorSchema = z.object({
  treasuryAccountId: z.string().uuid(),
  label,
  creditorIdentifier: creditorIdentifier.optional(),
  collectionDay: collectionDay.optional(),
  prenotificationBusinessDays: prenotificationBusinessDays.optional(),
  rejectFeeAmount: rejectFeeAmount.optional(),
  maxConsecutiveRejects: maxConsecutiveRejects.optional()
});
export type CreateCreditorInput = z.infer<typeof createCreditorSchema>;

export const updateCreditorSchema = z
  .object({
    label: label.optional(),
    creditorIdentifier: creditorIdentifier.optional(),
    collectionDay: collectionDay.optional(),
    prenotificationBusinessDays: prenotificationBusinessDays.optional(),
    rejectFeeAmount: rejectFeeAmount.optional(),
    maxConsecutiveRejects: maxConsecutiveRejects.optional(),
    isActive: z.boolean().optional()
  })
  .strict();
export type UpdateCreditorInput = z.infer<typeof updateCreditorSchema>;

export const ibanCheckSchema = z.object({ iban: z.string().max(80) });

const maxAmount = z.number().positive().max(100_000_000_000);
const notes = z.preprocess(emptyToNull, z.string().trim().max(2000).nullable());

export const createMandateSchema = z.object({
  creditorId: z.string().uuid(),
  leaseId: z.string().uuid(),
  debtorClientId: z.string().trim().min(1).max(64),
  iban: z.string().max(80),
  holderName: z.string().trim().min(1).max(120),
  maxAmount: maxAmount.nullable().optional(),
  collectionDay: collectionDay.nullable().optional(),
  notes: notes.optional()
});
export type CreateMandateInput = z.infer<typeof createMandateSchema>;

/** Strict : tout champ bancaire (IBAN, titulaire, créancier…) est refusé (PB2-R5). */
export const updateMandateSchema = z
  .object({
    maxAmount: maxAmount.nullable().optional(),
    collectionDay: collectionDay.nullable().optional(),
    notes: notes.optional()
  })
  .strict();
export type UpdateMandateInput = z.infer<typeof updateMandateSchema>;

const isoDate = z
  .string()
  .trim()
  .refine(value => !Number.isNaN(Date.parse(value)), { message: 'Date invalide' })
  .transform(value => new Date(value));

export const activateMandateSchema = z.object({
  signedAt: isoDate.refine(date => date.getTime() <= Date.now(), {
    message: 'La date de signature ne peut pas être dans le futur'
  })
});
export type ActivateMandateInput = z.infer<typeof activateMandateSchema>;

const reason = z.string().trim().min(1).max(500);

export const suspendMandateSchema = z.object({ reason });
export type SuspendMandateInput = z.infer<typeof suspendMandateSchema>;

export const revokeMandateSchema = z.object({
  reason,
  revokedAt: isoDate
    .refine(date => date.getTime() <= Date.now(), { message: 'La date de révocation ne peut pas être dans le futur' })
    .optional()
});
export type RevokeMandateInput = z.infer<typeof revokeMandateSchema>;

export const MANDATE_STATUSES = ['DRAFT', 'ACTIVE', 'SUSPENDED', 'REVOKED'] as const;

export const listMandatesQuerySchema = z.object({
  leaseId: z.string().uuid().optional(),
  debtorClientId: z.string().trim().min(1).max(64).optional(),
  creditorId: z.string().uuid().optional(),
  status: z.enum(MANDATE_STATUSES).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});
export type ListMandatesQuery = z.infer<typeof listMandatesQuerySchema>;
