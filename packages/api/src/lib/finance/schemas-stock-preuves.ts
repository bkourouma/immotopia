import { z } from 'zod';

/**
 * Validation Zod des routes des preuves du stock — lot 040, territoire API-4
 * (bons PDF et pièces jointes ; spec B4, B5 ; contrat `openapi.yaml` 2.0.0).
 *
 * Toute entrée invalide devient un `ZodError`, que le middleware central
 * traduit en 400 (`VALIDATION_ERROR`). Les champs d'un dépôt arrivent en
 * `multipart/form-data` : ce sont des chaînes, une chaîne vide vaut « absent ».
 */

const emptyToUndefined = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value);

/** Identifiant de chemin (`slipId`, `countId`, `attachmentId`). */
export const stockProofIdParamSchema = z.string().uuid('Identifiant invalide.');

export const stockAttachmentTargetSchema = z.enum(['MOVEMENT', 'SLIP', 'COUNT_LINE'], {
  errorMap: () => ({ message: 'Cible de pièce jointe invalide.' })
});

export const stockAttachmentPurposeSchema = z.enum(['GOODS_PHOTO', 'DELIVERY_NOTE', 'SIGNED_SLIP', 'OTHER'], {
  errorMap: () => ({ message: 'Finalité de pièce jointe invalide.' })
});

// ---------------------------------------------------------------------------
// POST /stock/attachments (multipart, champ « file »)
// ---------------------------------------------------------------------------

export const uploadStockAttachmentBodySchema = z
  .object({
    targetType: stockAttachmentTargetSchema,
    targetId: z.string().uuid('Identifiant de cible invalide.'),
    purpose: z.preprocess(emptyToUndefined, stockAttachmentPurposeSchema.optional()),
    caption: z.preprocess(
      emptyToUndefined,
      z.string().trim().max(500, 'La légende ne peut pas dépasser 500 caractères.').optional()
    ),
    clientRequestId: z.preprocess(emptyToUndefined, z.string().uuid('Identifiant de requête invalide.').optional())
  })
  .strict();

export type UploadStockAttachmentBody = z.infer<typeof uploadStockAttachmentBodySchema>;

// ---------------------------------------------------------------------------
// GET /stock/attachments?targetType=&targetId=
// ---------------------------------------------------------------------------

export const listStockAttachmentsQuerySchema = z
  .object({
    targetType: stockAttachmentTargetSchema,
    targetId: z.string().uuid('Identifiant de cible invalide.')
  })
  .strict();

export type ListStockAttachmentsQuery = z.infer<typeof listStockAttachmentsQuerySchema>;

// ---------------------------------------------------------------------------
// POST /stock/attachments/{attachmentId}/remove (contrat `ReasonOnlyRequest`)
// ---------------------------------------------------------------------------

export const removeStockAttachmentBodySchema = z
  .object({
    reason: z
      .string({ required_error: 'Le motif du retrait est obligatoire.' })
      .trim()
      .min(3, 'Le motif du retrait doit compter au moins 3 caractères.')
      .max(500, 'Le motif du retrait ne peut pas dépasser 500 caractères.')
  })
  .strict();

export type RemoveStockAttachmentBody = z.infer<typeof removeStockAttachmentBodySchema>;
