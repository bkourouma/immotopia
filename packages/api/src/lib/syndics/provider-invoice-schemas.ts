import { z } from 'zod';

/**
 * Validation des requetes du lot S6 (factures et paiements des prestataires).
 *
 * Les montants passent par `z.coerce.number()` : la creation d'une facture
 * accepte un corps JSON OU un formulaire multipart (piece jointe comprise),
 * dont tous les champs arrivent en texte.
 */

const optionalUuid = z
  .union([z.string().uuid(), z.literal(''), z.null()])
  .optional()
  .transform(value => (value ? value : undefined));

const optionalDate = z
  .union([z.coerce.date(), z.literal(''), z.null()])
  .optional()
  .transform(value => (value instanceof Date ? value : undefined));

const money = z.coerce.number().finite();

export const PAYMENT_METHODS = ['MOBILE_MONEY', 'BANK_TRANSFER', 'CASH', 'CHECK', 'CARD', 'OTHER'] as const;
export const INVOICE_STATUSES = ['RECORDED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'] as const;

export const createProviderInvoiceSchema = z
  .object({
    providerId: z.string().uuid(),
    contractId: optionalUuid,
    incidentId: optionalUuid,
    budgetLineItemId: optionalUuid,
    fundId: optionalUuid,
    expenseAccountId: optionalUuid,
    /** CURRENT : charges courantes (624). WORKS : travaux (6241). */
    expenseKind: z.enum(['CURRENT', 'WORKS']).optional().default('CURRENT'),
    number: z.string().trim().min(1, 'Le numero de facture est obligatoire').max(100),
    label: z.string().trim().min(1, 'Le libelle de la facture est obligatoire').max(300),
    invoiceDate: z.coerce.date(),
    dueDate: optionalDate,
    amountHT: money.positive('Le montant HT doit etre positif'),
    vatAmount: money.nonnegative().optional().default(0),
    amountTTC: money.positive().optional(),
    currency: z.string().trim().min(3).max(3).optional().default('XOF')
  })
  .refine(value => !value.dueDate || value.dueDate >= value.invoiceDate, {
    message: "L'echeance ne peut pas preceder la date de facture",
    path: ['dueDate']
  });

export const updateProviderInvoiceSchema = z
  .object({
    number: z.string().trim().min(1).max(100).optional(),
    label: z.string().trim().min(1).max(300).optional(),
    dueDate: z.union([z.coerce.date(), z.null()]).optional(),
    fundId: z.union([z.string().uuid(), z.null()]).optional()
  })
  .refine(value => Object.values(value).some(field => field !== undefined), {
    message: 'Aucune modification demandee'
  });

export const cancelSchema = z.object({
  reason: z.string().trim().min(1, "Le motif de l'annulation est obligatoire").max(500)
});

export const createProviderPaymentSchema = z.object({
  amount: money.positive('Le montant du paiement doit etre positif'),
  paidAt: z.coerce.date(),
  method: z.enum(PAYMENT_METHODS),
  reference: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform(value => (value ? value : undefined)),
  fundId: optionalUuid
});

export const listProviderInvoicesQuerySchema = z
  .object({
    providerId: z.string().uuid().optional(),
    contractId: z.string().uuid().optional(),
    incidentId: z.string().uuid().optional(),
    status: z.enum(INVOICE_STATUSES).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().max(100).optional().default(20)
  })
  .refine(value => !value.from || !value.to || value.from <= value.to, {
    message: 'La date de debut doit etre inferieure ou egale a la date de fin'
  });

export const fundMovementsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(50)
});

export type CreateProviderInvoiceInput = z.infer<typeof createProviderInvoiceSchema>;
export type UpdateProviderInvoiceInput = z.infer<typeof updateProviderInvoiceSchema>;
export type CreateProviderPaymentInput = z.infer<typeof createProviderPaymentSchema>;
export type ListProviderInvoicesQuery = z.infer<typeof listProviderInvoicesQuerySchema>;
