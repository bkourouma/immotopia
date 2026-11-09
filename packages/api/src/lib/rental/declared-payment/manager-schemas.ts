import { z } from 'zod';
import { AppError, ErrorCode } from '../../../middleware/error-middleware';
import { t } from '../../../i18n';
import { RENTAL_DECLARATION_PAYMENT_METHODS, RENTAL_DECLARATION_REJECT_REASONS } from './types';

/**
 * Validation de FORME des corps côté gestionnaire (contrat §1.6). Les règles
 * métier (montant retenu, note de correction, plafond, bornes de date…) sont
 * appliquées par les services, qui lèvent les codes `RENTAL_DECLARATION_*`.
 * Tous les schémas sont `.strict()` : un champ inconnu donne 400 `VALIDATION_ERROR`.
 */

const uuid = z.string().uuid();

/** Validation : `reviewNotes` est l'ancien nom de `note`. */
export const approveDeclarationBodySchema = z
  .object({
    acceptedAmount: z.number().finite().nullable().optional(),
    note: z.string().max(500).nullable().optional(),
    reviewNotes: z.string().max(500).nullable().optional(),
    treasuryAccountId: uuid.nullable().optional()
  })
  .strict();

/** Rejet : sans `rejectReason`, le corps ancien `{ reviewNotes }` vaut `OTHER`. */
export const rejectDeclarationBodySchema = z
  .object({
    rejectReason: z.enum(RENTAL_DECLARATION_REJECT_REASONS).optional(),
    note: z.string().max(500).nullable().optional(),
    reviewNotes: z.string().max(500).nullable().optional()
  })
  .strict();

/** Charge utile `payload` de la déclaration pour un tiers (§1.6). */
export const thirdPartyDeclarationPayloadSchema = z
  .object({
    leaseId: uuid,
    installmentId: uuid.nullable().optional(),
    paymentMethod: z.enum(RENTAL_DECLARATION_PAYMENT_METHODS).optional(),
    receivingNumberId: uuid.nullable().optional(),
    operator: z.enum(['ORANGE', 'MTN', 'MOOV', 'WAVE', 'OTHER']).nullable().optional(),
    reference: z.string().trim().min(1).max(80).nullable().optional(),
    amount: z.number().int(),
    paidAt: z.string().trim().datetime({ offset: true }),
    payerPhone: z.string().trim().min(1).max(40).nullable().optional(),
    notes: z.string().max(500).nullable().optional()
  })
  .strict()
  .refine(
    body =>
      (body.paymentMethod ?? 'MOBILE_MONEY') !== 'MOBILE_MONEY' ||
      (Boolean(body.receivingNumberId) && Boolean(body.operator) && Boolean(body.reference)),
    { message: 'receivingNumberId, operator et reference requis pour le mobile money', path: ['receivingNumberId'] }
  );

/** `payload` JSON d'un envoi multipart, validé contre `schema`. */
export function parseManagerPayload<S extends z.ZodTypeAny>(raw: unknown, schema: S): z.infer<S> {
  const unreadable = () =>
    new AppError(t('Le contenu de la déclaration est manquant ou illisible.'), 400, ErrorCode.VALIDATION_ERROR);
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 20_000) throw unreadable();
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw unreadable();
  }
  return schema.parse(json);
}
