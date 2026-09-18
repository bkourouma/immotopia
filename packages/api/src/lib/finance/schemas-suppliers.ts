import { z } from 'zod';
import { resolveRange, uuidPathParamSchema as sharedUuidPathParamSchema } from './schemas';

/**
 * Validation Zod des dix points d'entrée fournisseurs — lot 2, dernière
 * vague (`specs/017-finance-fournisseurs-chantiers/contracts/openapi.yaml`).
 *
 * **Toute entrée invalide sur ces schémas devient un `ZodError`**, que le
 * middleware central (`middleware/error-middleware.ts`) traduit en 400,
 * quelle que soit la route. Même discipline qu'au lot 1
 * (`lib/finance/schemas.ts`) et pour la même raison : les tests de
 * caractérisation du lot 0 ont relevé qu'une entrée invalide renvoie 500 sur
 * une route du module copropriété et 400 sur une autre. Le contrôleur de ce
 * lot n'utilise donc que `.parse`, jamais `.safeParse` suivi d'un abandon
 * silencieux.
 *
 * `resolveRange` et `uuidPathParamSchema` sont réutilisés depuis
 * `lib/finance/schemas.ts` (lot 1, gelé) plutôt que redéfinis : même lecture
 * des bornes de période partout dans le module.
 */

export const uuidPathParamSchema = sharedUuidPathParamSchema;

// ---------------------------------------------------------------------------
// GET suppliers
// ---------------------------------------------------------------------------

/**
 * `z.coerce.boolean()` transformerait `?isActive=false` en `true` : toute
 * chaîne non vide est « truthy ». On accepte donc explicitement les deux
 * chaînes littérales en plus du booléen déjà typé.
 */
const booleanQueryParam = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .optional()
  .transform(value => (typeof value === 'string' ? value === 'true' : value));

export const listSuppliersQuerySchema = z.object({
  isActive: booleanQueryParam
});

export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>;

// ---------------------------------------------------------------------------
// POST suppliers
// ---------------------------------------------------------------------------

export const createSupplierSchema = z.object({
  name: z.string().min(1, 'Le nom du fournisseur est obligatoire.'),
  kind: z.enum(['MATERIALS', 'SERVICES', 'MIXED'], {
    errorMap: () => ({ message: 'La nature du fournisseur doit être MATERIALS, SERVICES ou MIXED.' })
  }),
  contactPhone: z.string().min(1).optional(),
  contactEmail: z.string().email('Adresse email invalide.').optional(),
  maintenanceVendorId: z.string().uuid('Identifiant de prestataire de maintenance invalide.').optional()
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

// ---------------------------------------------------------------------------
// GET suppliers/balance
// ---------------------------------------------------------------------------

export const suppliersBalanceQuerySchema = z
  .object({
    periodStart: z.coerce.date().optional(),
    periodEnd: z.coerce.date().optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    siteId: z.string().uuid('Identifiant de chantier invalide.').optional()
  })
  .refine(
    value => {
      const { from, to } = resolveRange(value);
      return !from || !to || from <= to;
    },
    {
      message: 'La date de début de période doit être antérieure ou égale à la date de fin.',
      path: ['periodEnd']
    }
  );

export type SuppliersBalanceQuery = z.infer<typeof suppliersBalanceQuerySchema>;

// ---------------------------------------------------------------------------
// POST suppliers/:supplierId/invoices
// ---------------------------------------------------------------------------

const supplierInvoiceLineSchema = z.object({
  label: z.string().min(1, 'Le libellé de la ligne est obligatoire.'),
  amount: z.number().positive('Le montant de la ligne doit être positif.')
});

const costAllocationInputSchema = z.object({
  costCategoryId: z.string().uuid('Identifiant de poste de dépense invalide.'),
  amount: z.number().positive('Le montant imputé doit être positif.')
});

/**
 * Le contrat expose un `siteId` unique au niveau de la requête (appliqué à
 * toute la ventilation), alors que le domaine (`CreateSupplierInvoiceTx`,
 * `types-lot2.ts`) attend un `siteId` par ligne d'imputation. Le contrôleur
 * combine les deux ; ce schéma se contente d'exiger que l'un n'aille jamais
 * sans l'autre : une imputation sans chantier ne se rattacherait à rien.
 */
export const createSupplierInvoiceSchema = z
  .object({
    invoiceDate: z.coerce.date({ errorMap: () => ({ message: 'Date de facture invalide.' }) }),
    reference: z.string().min(1, 'La référence de la facture est obligatoire.'),
    amount: z.number().positive('Le montant de la facture doit être positif.'),
    siteId: z.string().uuid('Identifiant de chantier invalide.').nullable().optional(),
    lines: z.array(supplierInvoiceLineSchema).optional().default([]),
    allocations: z.array(costAllocationInputSchema).optional().default([])
  })
  .superRefine((value, ctx) => {
    if (value.allocations.length > 0 && !value.siteId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Le chantier (siteId) est obligatoire dès qu'une imputation est fournie.",
        path: ['siteId']
      });
    }
  });

export type CreateSupplierInvoiceInput = z.infer<typeof createSupplierInvoiceSchema>;

// ---------------------------------------------------------------------------
// POST supplier-invoices/:invoiceId/void
// ---------------------------------------------------------------------------

export const voidSupplierInvoiceSchema = z.object({
  reason: z.string().min(1, "Le motif d'annulation est obligatoire.")
});

export type VoidSupplierInvoiceInput = z.infer<typeof voidSupplierInvoiceSchema>;

// ---------------------------------------------------------------------------
// POST suppliers/:supplierId/payments
// ---------------------------------------------------------------------------

const supplierPaymentAllocationSchema = z.object({
  invoiceId: z.string().uuid('Identifiant de facture invalide.'),
  amount: z.number().positive('Le montant imputé doit être positif.')
});

export const createSupplierPaymentSchema = z.object({
  paymentDate: z.coerce.date({ errorMap: () => ({ message: 'Date de règlement invalide.' }) }),
  amount: z.number().positive('Le montant du règlement doit être positif.'),
  // Colonne obligatoire en base (`SupplierPayment.method`), absente du
  // contrat gelé de `CreateSupplierPaymentTx` (voir l'en-tête de
  // `lib/finance/suppliers.ts`) : le domaine écrit toujours 'OTHER' à sa
  // place. Le champ reste exigé ici pour respecter `openapi.yaml`, même s'il
  // n'est pas transmis au domaine.
  method: z.string().min(1, 'Le mode de règlement est obligatoire.'),
  allocations: z.array(supplierPaymentAllocationSchema).optional().default([])
});

export type CreateSupplierPaymentInput = z.infer<typeof createSupplierPaymentSchema>;
