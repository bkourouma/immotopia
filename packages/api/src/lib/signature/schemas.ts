import { SignatureDocumentKind } from '@prisma/client';
import { z } from 'zod';

/** Schémas Zod de l'API « agence » de la signature électronique (spec 044, lot S1). */

export const SIGNATURE_MAX_SIGNERS = 10;

const signerInputSchema = z
  .object({
    role: z.string().trim().min(1).max(40),
    fullName: z.string().trim().min(2).max(120),
    channel: z.enum(['EMAIL', 'WHATSAPP', 'SMS', 'IN_PERSON']),
    contact: z.string().trim().max(254).default(''),
    /** CrmContact.id : exigé pour WhatsApp (consentement du CRM) et pour SMS (contact de l'agence). */
    contactId: z.string().trim().min(1).max(64).optional()
  })
  .strict();

export const createSignatureSchema = z
  .object({
    tenantId: z.string().optional(),
    // Tout type connu est accepté ici ; un type sans source enregistrée (lib/signature/sources) est refusé
    // en 400 « Ce type de document ne peut pas encore être signé » par getSignatureSource.
    kind: z.nativeEnum(SignatureDocumentKind),
    targetId: z.string().trim().min(1).max(64),
    signers: z.array(signerInputSchema).min(1).max(SIGNATURE_MAX_SIGNERS),
    sequential: z.boolean().optional(),
    expiresInDays: z.number().int().min(1).max(30).optional()
  })
  .strict();
export type CreateSignatureInput = z.infer<typeof createSignatureSchema>;

export const SIGNATURE_STATUSES = [
  'DRAFT',
  'SENT',
  'PARTIALLY_SIGNED',
  'COMPLETED',
  'DECLINED',
  'EXPIRED',
  'CANCELED'
] as const;

/** Date ISO (jour seul ou date-heure) ; un jour seul est repris tel quel pour que `to` couvre la journée. */
const isoDateSchema = z
  .string()
  .trim()
  .refine(value => !Number.isNaN(new Date(value).getTime()), { message: 'Date ISO invalide.' });

export const listSignaturesSchema = z
  .object({
    status: z.enum(SIGNATURE_STATUSES).optional(),
    targetType: z.string().trim().min(1).max(40).optional(),
    targetId: z.string().trim().min(1).max(64).optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    kind: z.nativeEnum(SignatureDocumentKind).optional(),
    q: z.string().trim().min(1).max(100).optional(),
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
    sortBy: z.enum(['createdAt', 'expiresAt', 'status', 'title']).default('createdAt'),
    sortDir: z.enum(['asc', 'desc']).default('desc')
  })
  .strict();
export type ListSignaturesFilters = z.infer<typeof listSignaturesSchema>;

export const signatureSummarySchema = z
  .object({
    kind: z.nativeEnum(SignatureDocumentKind).optional(),
    /** Même recherche que la liste : titre ou nom d'un signataire. */
    q: z.string().trim().min(1).max(100).optional(),
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional()
  })
  .strict();
export type SignatureSummaryFilters = z.infer<typeof signatureSummarySchema>;
