import { z } from 'zod';
import { uuidPathParamSchema as sharedUuidPathParamSchema } from './schemas';

/**
 * Validation Zod des sept points d'entrée « bons de commande et engagé » —
 * lot 3, volet achats (`specs/018-finance-budget-pilotage/data-model.md` §5).
 *
 * Même discipline que `schemas-suppliers.ts` (lot 2) et pour la même raison :
 * **toute entrée invalide devient un `ZodError`**, que le middleware central
 * (`middleware/error-middleware.ts`) traduit en 400 quelle que soit la route.
 * Les contrôleurs de ce fichier n'utilisent donc que `.parse`, jamais
 * `.safeParse` suivi d'un abandon silencieux.
 *
 * `uuidPathParamSchema` est réutilisé depuis `lib/finance/schemas.ts`
 * (lot 1, gelé), même lecture d'un identifiant de chemin partout dans le
 * module.
 */

export const uuidPathParamSchema = sharedUuidPathParamSchema;

// ---------------------------------------------------------------------------
// GET purchase-orders
// ---------------------------------------------------------------------------

export const listPurchaseOrdersQuerySchema = z.object({
  siteId: z.string().uuid('Identifiant de chantier invalide.').optional(),
  supplierId: z.string().uuid('Identifiant de fournisseur invalide.').optional(),
  status: z
    .enum(['DRAFT', 'ISSUED', 'CANCELLED'], {
      errorMap: () => ({ message: 'Le statut doit être DRAFT, ISSUED ou CANCELLED.' })
    })
    .optional()
});

export type ListPurchaseOrdersQuery = z.infer<typeof listPurchaseOrdersQuerySchema>;

// ---------------------------------------------------------------------------
// POST purchase-orders
// ---------------------------------------------------------------------------

/**
 * Quantité et prix unitaire : **facultatifs, additifs, jamais recalculés
 * ici** (20 septembre 2026). Même parti pris que pour la ligne de facture
 * (`schemas-suppliers.ts`) : le montant reste la donnée de référence, ces
 * deux champs sont une aide à la saisie et une information conservée. Une
 * ligne peut donc encore se saisir en montant seul — un forfait de pose n'a
 * pas de quantité.
 *
 * `.nullish()` plutôt que `.optional()` : un écran envoie volontiers `null`
 * pour un champ laissé vide au lieu d'omettre la clé, et `.optional()` seul
 * rejetterait ce `null` en 400 — silencieusement pour l'utilisateur, qui
 * verrait sa saisie refusée sans comprendre pourquoi.
 */
const purchaseOrderLineSchema = z.object({
  costCategoryId: z.string().uuid('Identifiant de poste de dépense invalide.'),
  label: z.string().min(1, 'Le libellé de la ligne est obligatoire.'),
  amount: z.number().positive('Le montant de la ligne doit être positif.'),
  quantity: z.number().positive('La quantité doit être positive.').nullish(),
  unitPrice: z.number().nonnegative('Le prix unitaire ne peut pas être négatif.').nullish()
});

export const createPurchaseOrderSchema = z.object({
  siteId: z.string().uuid('Identifiant de chantier invalide.'),
  supplierId: z.string().uuid('Identifiant de fournisseur invalide.'),
  reference: z.string().min(1, 'La référence du bon de commande est obligatoire.'),
  orderDate: z.coerce.date({ errorMap: () => ({ message: 'Date de commande invalide.' }) }),
  // Un bon sans ligne n'engage rien de précis : le domaine
  // (`createPurchaseOrderTx`, `lib/finance/purchase-orders.ts`) refuse aussi
  // ce cas, mais le rejeter ici évite l'aller-retour.
  lines: z.array(purchaseOrderLineSchema).min(1, 'Un bon de commande doit porter au moins une ligne.')
});

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;

// ---------------------------------------------------------------------------
// POST purchase-orders/:orderId/cancel
// ---------------------------------------------------------------------------

export const cancelPurchaseOrderSchema = z.object({
  reason: z.string().min(1, "Le motif d'annulation est obligatoire.")
});

export type CancelPurchaseOrderInput = z.infer<typeof cancelPurchaseOrderSchema>;

// ---------------------------------------------------------------------------
// POST supplier-invoices/:invoiceId/purchase-order
// ---------------------------------------------------------------------------

/**
 * `purchaseOrderId` est nullable ET obligatoire dans le corps : c'est
 * `null`, explicitement envoyé, qui défait le rapprochement
 * (`LinkInvoiceToPurchaseOrderTx`, `types-lot3.ts`). Un corps qui omettrait
 * le champ serait ambigu — ni un rapprochement, ni un défaisage exprès — et
 * est donc rejeté en 400 plutôt que traité comme un défaisage silencieux.
 */
export const linkInvoiceToPurchaseOrderSchema = z.object({
  purchaseOrderId: z.string().uuid('Identifiant de bon de commande invalide.').nullable()
});

export type LinkInvoiceToPurchaseOrderInput = z.infer<typeof linkInvoiceToPurchaseOrderSchema>;
