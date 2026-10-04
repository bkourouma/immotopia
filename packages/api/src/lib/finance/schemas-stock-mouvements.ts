import { StockReasonCode } from '@prisma/client';
import { z } from 'zod';
import { uuidPathParamSchema as sharedUuidPathParamSchema } from './schemas';

/**
 * Validation Zod des points d'entrée des mouvements de stock — lot 5, deuxième
 * sous-lot, étendue par le lot 040 (réceptions à prix facultatif, sorties
 * multi-lignes, retours fournisseur, rebuts, idempotence).
 *
 * **Toute entrée invalide devient un `ZodError`**, que le middleware central
 * traduit en 400. Le contrôleur n'appelle que `.parse`.
 *
 * `.strict()` partout :
 *
 * 1. **Un corps ne répète jamais un identifiant que le chemin porte déjà** :
 *    le chemin porte `tenantId`, aucun corps n'en parle.
 * 2. **Le prix d'une sortie, d'un rebut, d'un retour est dérivé, jamais saisi**
 *    (principe P-4) : aucun de ces corps n'accepte `unitCost`. Seule la
 *    réception l'accepte, et seulement pour un détenteur de STOCK_VALUES_VIEW
 *    (le service répond `403 STOCK_VALUE_FIELD_FORBIDDEN` sinon, A8-R3).
 * 3. **Les quantités sont positives, toujours** : le sens est porté par le type.
 *
 * Ce que Zod ne vérifie PAS, et pourquoi : le motif (`reasonCode`) et le
 * demandeur (`takerId` / `requestedBy`) sont facultatifs ici, parce que leur
 * absence ou leur inadéquation doit répondre par un code stable du contrat
 * (`STOCK_REASON_REQUIRED`, `STOCK_REASON_NOT_ALLOWED`,
 * `STOCK_REQUESTER_REQUIRED`, `STOCK_TAKER_REQUIRED`) — le service en est la
 * seule autorité.
 */

export const uuidPathParamSchema = sharedUuidPathParamSchema;

/** `?onlyInStock=false` ne doit pas devenir `true` (`z.coerce.boolean`). */
const booleanQueryParam = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .optional()
  .transform(value => (typeof value === 'string' ? value === 'true' : value));

/** Les six natures de mouvement (`StockMovementType`, lot 040 : retour fournisseur et rebut). */
export const stockMovementTypeSchema = z.enum(
  ['RECEIPT', 'ISSUE', 'TRANSFER', 'ADJUSTMENT', 'SUPPLIER_RETURN', 'SCRAP'],
  {
    errorMap: () => ({ message: 'Nature de mouvement de stock invalide.' })
  }
);

/** Une quantité : strictement positive, quatre décimales admises. */
export const stockQuantitySchema = z
  .number({ invalid_type_error: 'La quantité doit être un nombre.' })
  .finite('La quantité doit être un nombre fini.')
  .gt(0, 'La quantité doit être strictement positive.');

/** Clé d'idempotence tirée par l'appareil (B3-R2). */
export const clientRequestIdSchema = z.string().uuid('Identifiant de requête invalide.').optional();

/** Un motif de la liste fermée ; son adéquation au contexte est vérifiée par le service. */
export const stockReasonCodeSchema = z
  .nativeEnum(StockReasonCode, { errorMap: () => ({ message: 'Motif invalide.' }) })
  .optional();

/** La précision libre d'un motif. */
export const stockReasonTextSchema = z
  .string()
  .trim()
  .max(500, 'La précision du motif fait au plus 500 caractères.')
  .optional();

/** Preneur du carnet ou demandeur en texte (B2-R3) : au moins l'un des deux, vérifié par le service. */
export const requesterFieldsSchema = {
  takerId: z.string().uuid('Identifiant de preneur invalide.').optional(),
  requestedBy: z
    .string()
    .trim()
    .min(1, 'Le demandeur ne peut pas être vide.')
    .max(200, 'Le demandeur fait au plus 200 caractères.')
    .optional()
};

function movementDate(message: string) {
  return z.coerce.date({ errorMap: () => ({ message }) });
}

// ---------------------------------------------------------------------------
// POST /stock/receipts
// ---------------------------------------------------------------------------

export const stockReceiptLineSchema = z
  .object({
    itemId: z.string().uuid('Identifiant d’article invalide.'),
    quantity: stockQuantitySchema,
    // Facultatif (A8-R3) : absent, la chaîne de repli s'applique (ligne de
    // facture, coût moyen du lieu, dernier prix, zéro). Le zéro reste permis :
    // un don entre en stock à valeur nulle.
    unitCost: z
      .number({ invalid_type_error: 'Le prix unitaire doit être un nombre.' })
      .finite('Le prix unitaire doit être un nombre fini.')
      .min(0, 'Le prix unitaire ne peut pas être négatif.')
      .optional(),
    supplierInvoiceLineId: z.string().uuid('Identifiant de ligne de facture invalide.').optional()
  })
  .strict();

export const createStockReceiptSchema = z
  .object({
    locationId: z.string().uuid('Identifiant de lieu de stockage invalide.'),
    supplierInvoiceId: z.string().uuid('Identifiant de facture fournisseur invalide.'),
    receiptDate: movementDate('Date de réception invalide.'),
    lines: z
      .array(stockReceiptLineSchema)
      .min(1, 'Une réception comporte au moins une ligne.')
      .max(50, 'Une réception comporte au plus 50 lignes.'),
    clientRequestId: clientRequestIdSchema
  })
  .strict();

export type CreateStockReceiptInput = z.infer<typeof createStockReceiptSchema>;

// ---------------------------------------------------------------------------
// POST /stock/issues — multi-lignes (B3-R3), ou forme à un article (lot 5)
// ---------------------------------------------------------------------------

export const stockIssueLineSchema = z
  .object({
    itemId: z.string().uuid('Identifiant d’article invalide.'),
    quantity: stockQuantitySchema,
    // EXIGÉ, jamais deviné depuis l'article.
    costCategoryId: z.string().uuid('Identifiant de poste de dépense invalide.')
  })
  .strict();

export const createStockIssueSchema = z
  .object({
    locationId: z.string().uuid('Identifiant de lieu de stockage invalide.'),
    siteId: z.string().uuid('Identifiant de chantier invalide.'),
    issueDate: movementDate('Date de sortie invalide.'),
    lines: z
      .array(stockIssueLineSchema)
      .min(1, 'Une sortie comporte au moins une ligne.')
      .max(50, 'Une sortie comporte au plus 50 lignes.'),
    ...requesterFieldsSchema,
    clientRequestId: clientRequestIdSchema
  })
  .strict();

/** Forme à un article, acceptée et convertie en une ligne. */
export const createStockIssueSingleSchema = z
  .object({
    locationId: z.string().uuid('Identifiant de lieu de stockage invalide.'),
    itemId: z.string().uuid('Identifiant d’article invalide.'),
    quantity: stockQuantitySchema,
    siteId: z.string().uuid('Identifiant de chantier invalide.'),
    costCategoryId: z.string().uuid('Identifiant de poste de dépense invalide.'),
    issueDate: movementDate('Date de sortie invalide.'),
    ...requesterFieldsSchema,
    clientRequestId: clientRequestIdSchema
  })
  .strict();

export type CreateStockIssueInput = z.infer<typeof createStockIssueSchema>;

/**
 * Lit le corps d'une sortie sous l'une de ses deux formes (présence de
 * `lines`) et rend toujours la forme à lignes.
 */
export function parseStockIssueBody(body: unknown): CreateStockIssueInput {
  const source = (body ?? {}) as Record<string, unknown>;
  if (Array.isArray(source.lines) || !('itemId' in source)) {
    return createStockIssueSchema.parse(source);
  }
  const single = createStockIssueSingleSchema.parse(source);
  const { itemId, quantity, costCategoryId, ...rest } = single;
  return { ...rest, lines: [{ itemId, quantity, costCategoryId }] };
}

// ---------------------------------------------------------------------------
// POST /stock/supplier-returns (A6-R1)
// ---------------------------------------------------------------------------

export const createStockSupplierReturnSchema = z
  .object({
    locationId: z.string().uuid('Identifiant de lieu de stockage invalide.'),
    supplierInvoiceId: z.string().uuid('Identifiant de facture fournisseur invalide.'),
    supplierInvoiceLineId: z.string().uuid('Identifiant de ligne de facture invalide.').optional(),
    itemId: z.string().uuid('Identifiant d’article invalide.'),
    quantity: stockQuantitySchema,
    returnDate: movementDate('Date de retour invalide.'),
    reasonCode: stockReasonCodeSchema,
    reason: stockReasonTextSchema,
    clientRequestId: clientRequestIdSchema
  })
  .strict();

export type CreateStockSupplierReturnInput = z.infer<typeof createStockSupplierReturnSchema>;

// ---------------------------------------------------------------------------
// POST /stock/scraps (A6-R2)
// ---------------------------------------------------------------------------

export const createStockScrapSchema = z
  .object({
    locationId: z.string().uuid('Identifiant de lieu de stockage invalide.'),
    itemId: z.string().uuid('Identifiant d’article invalide.'),
    quantity: stockQuantitySchema,
    scrapDate: movementDate('Date de rebut invalide.'),
    reasonCode: stockReasonCodeSchema,
    reason: stockReasonTextSchema,
    clientRequestId: clientRequestIdSchema
  })
  .strict();

export type CreateStockScrapInput = z.infer<typeof createStockScrapSchema>;

// ---------------------------------------------------------------------------
// GET /stock/balances
// ---------------------------------------------------------------------------

export const listStockBalancesQuerySchema = z
  .object({
    locationId: z.string().uuid('Identifiant de lieu de stockage invalide.').optional(),
    itemId: z.string().uuid('Identifiant d’article invalide.').optional(),
    onlyInStock: booleanQueryParam
  })
  .strict();

export type ListStockBalancesQuery = z.infer<typeof listStockBalancesQuerySchema>;

// GET /stock/movements : filtres dans `schemas-stock-journal.ts` (territoire API-3).
