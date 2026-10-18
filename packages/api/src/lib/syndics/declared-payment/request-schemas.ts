import { z } from 'zod';
import { AppError, ErrorCode } from '../../../middleware/error-middleware';
import { t } from '../../../i18n';

/**
 * Validation de FORME des requêtes du paiement déclaré (spec 047, contracts §0 et §1/§2).
 *
 * Les règles MÉTIER (plafond, bornes de date, somme des parts, périmètre…) sont
 * appliquées par `createDeclaration`, qui lève les codes dédiés (`DECLARATION_*`).
 * Ici : types, longueurs et champs inconnus (`.strict()` → 400 `VALIDATION_ERROR`).
 * Les montants sont des entiers de FCFA (aucune décimale acceptée).
 */

const uuid = z.string().uuid();

const lineSchema = z
  .object({
    lotId: uuid,
    amount: z.number().int(),
    chargeCallIds: z.array(uuid).max(24).default([])
  })
  .strict();

const declarationFields = {
  receivingNumberId: uuid,
  payerPhone: z.string().trim().min(1).max(40),
  amount: z.number().int(),
  paidAt: z.string().trim().datetime({ offset: true }),
  transactionReference: z.string().trim().min(1).max(80),
  lines: z.array(lineSchema).min(1).max(10),
  comment: z.string().max(500).nullable().optional()
};

/** Charge utile du portail (`payload`, §2.4) : `syndicId` requis, lecture IA facultative. */
export const coOwnerDeclarationPayloadSchema = z
  .object({
    syndicId: uuid,
    ...declarationFields,
    proofReadId: uuid.nullable().optional()
  })
  .strict();

/** Charge utile du gestionnaire (`payload`, §1.11) : pas de `syndicId` (dans l'URL), ni de lecture IA. */
export const managerDeclarationPayloadSchema = z
  .object({
    ...declarationFields,
    declaredForContactId: uuid.nullable().optional()
  })
  .strict();

/** `POST /lecture` (§2.3, PR3) : champ texte `syndicId`. */
export const syndicIdFieldSchema = z.object({ syndicId: uuid }).strict();

/** Liste côté gestionnaire (§1.6). */
export const listDeclarationsQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELED', 'ALL']).optional(),
  receivingNumberId: uuid.optional(),
  lotId: uuid.optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  overdue: z
    .enum(['true', 'false'])
    .optional()
    .transform(value => value === 'true'),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

/** Liste côté portail (§2.5). */
export const portalListQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELED', 'ALL']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional()
});

/** Disponibilité côté portail (§2.1). */
export const availabilityQuerySchema = z.object({ syndicId: uuid });

/** Validation (§1.9). `note` est exigée par le moteur dès qu'il y a correction. */
export const approveDeclarationBodySchema = z
  .object({
    correction: z
      .object({
        paidAt: z.string().trim().datetime({ offset: true }).optional(),
        lines: z
          .array(
            z
              .object({
                lineId: uuid,
                acceptedAmount: z.number().int().min(0),
                chargeCallIds: z.array(uuid).max(24).optional()
              })
              .strict()
          )
          .max(10)
          .optional()
      })
      .strict()
      .nullable()
      .optional(),
    note: z.string().max(500).nullable().optional()
  })
  .strict();

/** Rejet (§1.10). */
export const rejectDeclarationBodySchema = z
  .object({
    reason: z.enum(['NOT_FOUND', 'AMOUNT_MISMATCH', 'REFERENCE_USED', 'WRONG_NUMBER', 'OTHER']),
    note: z.string().trim().min(10).max(500)
  })
  .strict();

/**
 * Lit le champ multipart `payload` (JSON) et le valide par `schema`.
 * Un JSON absent ou illisible est une erreur de validation, pas une panne.
 */
export function parseMultipartPayload<S extends z.ZodTypeAny>(raw: unknown, schema: S): z.infer<S> {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 20_000) {
    throw new AppError(t('Le contenu de la déclaration est manquant ou illisible.'), 400, ErrorCode.VALIDATION_ERROR);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new AppError(t('Le contenu de la déclaration est manquant ou illisible.'), 400, ErrorCode.VALIDATION_ERROR);
  }
  return schema.parse(json);
}
