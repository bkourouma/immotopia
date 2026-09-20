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
  // Le nom du contact : accepte depuis le 20 septembre 2026. La colonne
  // existait en base et l'ecran le saisissait deja, mais ce schema ne le
  // declarait pas — Zod l'ecartait donc en silence, et la saisie etait perdue
  // sans le moindre avertissement.
  contactName: z.string().min(1).optional(),
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

/**
 * Quantité et prix unitaire : **facultatifs, additifs, jamais recalculés
 * ici** (20 septembre 2026).
 *
 * Beaucoup de dépenses n'ont pas de quantité — une prestation, un forfait :
 * la ligne se saisit alors en montant direct, exactement comme avant, et ces
 * deux champs restent absents. Quand l'écran les renseigne, il envoie le
 * montant qu'il a lui-même calculé ; le serveur le conserve tel quel. **Il
 * ne vérifie pas `amount === quantity × unitPrice`** : le montant reste la
 * donnée de référence comptable, et un contrôle d'égalité sur des arrondis
 * au franc rejetterait des saisies parfaitement légitimes.
 *
 * `.nullish()` plutôt que `.optional()` : un écran envoie volontiers `null`
 * pour un champ laissé vide au lieu d'omettre la clé, et `.optional()` seul
 * rejetterait ce `null` en 400 — silencieusement pour l'utilisateur, qui
 * verrait sa saisie refusée sans comprendre pourquoi.
 */
const supplierInvoiceLineSchema = z.object({
  label: z.string().min(1, 'Le libellé de la ligne est obligatoire.'),
  amount: z.number().positive('Le montant de la ligne doit être positif.'),
  quantity: z.number().positive('La quantité doit être positive.').nullish(),
  unitPrice: z.number().nonnegative('Le prix unitaire ne peut pas être négatif.').nullish()
});

const costAllocationInputSchema = z.object({
  // Le chantier, ligne par ligne. L'ecran le propose ainsi depuis toujours —
  // une facture peut viser deux chantiers — et le domaine l'attend ainsi. Le
  // `siteId` unique de la requete reste accepte, et sert de repli.
  siteId: z.string().uuid('Identifiant de chantier invalide.').optional(),
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
    // Le montant total de la facture. **Facultatif dès qu'il y a des lignes** :
    // il en est alors la somme, par construction. L'exiger en plus des lignes
    // faisait echouer en 400 toute saisie de l'ecran, qui calculait ce total,
    // l'affichait, et ne le transmettait pas — un refus silencieux pour une
    // redondance. Fourni, il est verifie contre la somme des lignes plutot que
    // cru sur parole.
    amount: z.number().positive('Le montant de la facture doit être positif.').optional(),
    siteId: z.string().uuid('Identifiant de chantier invalide.').nullable().optional(),
    lines: z.array(supplierInvoiceLineSchema).optional().default([]),
    allocations: z.array(costAllocationInputSchema).optional().default([])
  })
  .superRefine((value, ctx) => {
    if (value.lines.length === 0 && value.amount === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Une facture sans ligne doit porter son montant.',
        path: ['amount']
      });
    }

    if (value.amount !== undefined && value.lines.length > 0) {
      const sommeDesLignes = value.lines.reduce((somme, ligne) => somme + ligne.amount, 0);
      // Tolerance au centime : les montants viennent d'un ecran, pas d'une
      // base, et une addition en virgule flottante ne retombe pas toujours
      // juste au dernier chiffre.
      if (Math.abs(sommeDesLignes - value.amount) > 0.01) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Le montant de la facture doit égaler la somme de ses lignes.',
          path: ['amount']
        });
      }
    }

    // Le chantier peut etre porte par la requete OU par chaque imputation.
    // N'exiger que le premier refusait la seule forme que l'ecran sache
    // produire, et interdisait au passage une facture visant deux chantiers.
    const imputationSansChantier = value.allocations.some(allocation => !allocation.siteId);
    if (imputationSansChantier && !value.siteId) {
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
