import { SignatureDocumentKind } from '@prisma/client';
import { z } from 'zod';

/** Schémas Zod de l'API « agence » de la signature électronique (spec 044, lot S1). */

export const SIGNATURE_MAX_SIGNERS = 10;

const signerInputSchema = z
  .object({
    role: z.string().trim().min(1).max(40),
    fullName: z.string().trim().min(2).max(120),
    channel: z.enum(['EMAIL', 'WHATSAPP', 'IN_PERSON']),
    contact: z.string().trim().max(254).default(''),
    /** CrmContact.id facultatif : le consentement WhatsApp du CRM est alors exigé. */
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

export const listSignaturesSchema = z
  .object({
    status: z.enum(['DRAFT', 'SENT', 'PARTIALLY_SIGNED', 'COMPLETED', 'DECLINED', 'EXPIRED', 'CANCELED']).optional(),
    targetType: z.string().trim().min(1).max(40).optional(),
    targetId: z.string().trim().min(1).max(64).optional()
  })
  .strict();
export type ListSignaturesFilters = z.infer<typeof listSignaturesSchema>;
