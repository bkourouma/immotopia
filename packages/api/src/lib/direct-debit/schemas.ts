import { t } from '../../i18n';
import { z } from 'zod';

/**
 * Validation des corps et requêtes du prélèvement bancaire (spec 042, P1).
 * Les montants sont des nombres (FCFA) ; `null` efface un champ facultatif.
 */

const emptyToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value);

/** Caractères de contrôle : retour à la ligne, tabulation, séparateurs de ligne Unicode… */
// eslint-disable-next-line no-control-regex -- c'est précisément l'objet : refuser les caractères de contrôle
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\p{Zl}\p{Zp}]/u; // Zl, Zp : séparateurs de ligne et de paragraphe Unicode (U+2028, U+2029)
const noControlCharacters = (value: string) => !CONTROL_CHARACTERS.test(value);

const label = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine(noControlCharacters, () => ({
    message: t('Ce champ ne doit contenir ni retour à la ligne ni caractère de contrôle.')
  }));
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
  holderName: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .refine(noControlCharacters, () => ({
      message: t('Ce champ ne doit contenir ni retour à la ligne ni caractère de contrôle.')
    })),
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

// ---------------------------------------------------------------------------
// Copropriété (SYNDIC_LOT), spec 042 P4, data-model §9.3 et §9.4
// ---------------------------------------------------------------------------

const optionalText = (max: number) =>
  z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .min(1)
      .max(max)
      .refine(noControlCharacters, () => ({
        message: t('Ce champ ne doit contenir ni retour à la ligne ni caractère de contrôle.')
      }))
      .nullable()
  );

/**
 * `PUT …/creancier` : crée ou met à jour le créancier du syndicat. Strict : le
 * montant des frais de rejet (toujours 0 en copropriété) et tout autre champ
 * inconnu sont refusés.
 */
export const upsertSyndicCreditorSchema = z
  .object({
    label,
    bankName: optionalText(120).optional(),
    bankAccountRef: optionalText(64).optional(),
    creditorIdentifier: creditorIdentifier.optional(),
    collectionDay: collectionDay.optional(),
    prenotificationBusinessDays: prenotificationBusinessDays.optional(),
    maxConsecutiveRejects: maxConsecutiveRejects.optional(),
    isActive: z.boolean().optional()
  })
  .strict();
export type UpsertSyndicCreditorInput = z.infer<typeof upsertSyndicCreditorSchema>;

export const createSyndicMandateSchema = z
  .object({
    lotId: z.string().uuid(),
    debtorContactId: z.string().trim().min(1).max(64),
    iban: z.string().max(80),
    holderName: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .refine(noControlCharacters, () => ({
        message: t('Ce champ ne doit contenir ni retour à la ligne ni caractère de contrôle.')
      })),
    maxAmount: maxAmount.nullable().optional(),
    collectionDay: collectionDay.nullable().optional(),
    notes: notes.optional()
  })
  .strict();
export type CreateSyndicMandateInput = z.infer<typeof createSyndicMandateSchema>;

/** `signedAt` est facultatif : un mandat déjà daté (signature électronique) s'active sans le redonner. */
export const activateSyndicMandateSchema = z
  .object({
    signedAt: isoDate
      .refine(date => date.getTime() <= Date.now(), {
        message: 'La date de signature ne peut pas être dans le futur'
      })
      .optional()
  })
  .strict();
export type ActivateSyndicMandateInput = z.infer<typeof activateSyndicMandateSchema>;

export const listSyndicMandatesQuerySchema = z.object({
  lotId: z.string().uuid().optional(),
  status: z.enum(MANDATE_STATUSES).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});
export type ListSyndicMandatesQuery = z.infer<typeof listSyndicMandatesQuerySchema>;
