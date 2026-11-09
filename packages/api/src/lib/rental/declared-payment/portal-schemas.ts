import { z } from 'zod';
import { RENTAL_DECLARATION_PAYMENT_METHODS } from './types';

/**
 * Validation de FORME des requêtes du portail locataire (contrat 049, §1.3 et §1.4).
 * Les règles MÉTIER sont dans `createRentalDeclaration`. Le corps de création est
 * multipart à plat : anciens champs tolérés (`paymentMethod`, `paymentDate`,
 * `mobileOperator`, `transactionPhone`), jamais d'identifiant d'agence.
 */

const uuid = z.string().uuid();
const emptyToUndefined = (value: unknown) => (value === '' || value === null ? undefined : value);

export const declareBodySchema = z
  .object({
    installmentId: z.preprocess(emptyToUndefined, uuid.optional()),
    paymentMethod: z.preprocess(emptyToUndefined, z.enum(RENTAL_DECLARATION_PAYMENT_METHODS).optional()),
    receivingNumberId: z.preprocess(emptyToUndefined, uuid.optional()),
    operator: z.preprocess(emptyToUndefined, z.string().max(20).optional()),
    mobileOperator: z.preprocess(emptyToUndefined, z.string().max(20).optional()),
    reference: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(80).optional()),
    amount: z.preprocess(
      value => (typeof value === 'string' && value.trim() !== '' ? Number(value) : value),
      z.number()
    ),
    paidAt: z.preprocess(emptyToUndefined, z.string().trim().max(40).optional()),
    paymentDate: z.preprocess(emptyToUndefined, z.string().trim().max(40).optional()),
    payerPhone: z.preprocess(emptyToUndefined, z.string().trim().max(40).optional()),
    transactionPhone: z.preprocess(emptyToUndefined, z.string().trim().max(40).optional()),
    notes: z.preprocess(emptyToUndefined, z.string().max(500).optional()),
    proofReadId: z.preprocess(emptyToUndefined, uuid.optional())
  })
  .passthrough()
  // Mobile money (défaut) : numéro, opérateur et référence requis. Autres modes : facultatifs
  // (le service refuse un numéro ou un opérateur fourni avec un mode non mobile).
  .refine(body => (body.paymentMethod ?? 'MOBILE_MONEY') !== 'MOBILE_MONEY' || body.receivingNumberId !== undefined, {
    message: 'receivingNumberId requis',
    path: ['receivingNumberId']
  })
  .refine(
    body =>
      (body.paymentMethod ?? 'MOBILE_MONEY') !== 'MOBILE_MONEY' ||
      body.operator !== undefined ||
      body.mobileOperator !== undefined,
    { message: 'operator requis', path: ['operator'] }
  )
  .refine(body => (body.paymentMethod ?? 'MOBILE_MONEY') !== 'MOBILE_MONEY' || body.reference !== undefined, {
    message: 'reference requise',
    path: ['reference']
  })
  .refine(body => body.paidAt !== undefined || body.paymentDate !== undefined, {
    message: 'paidAt requis',
    path: ['paidAt']
  });

/** Date seule (ancien champ `paymentDate`) : minuit UTC ; sinon la valeur telle quelle. */
export function toPaidAtInput(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value;
}

export const myDeclarationsQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELED', 'ALL']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(50).optional()
});
