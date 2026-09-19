import { z } from 'zod';
import { uuidPathParamSchema } from './schemas';

/**
 * Validation Zod des routes chantiers, postes de dépense, pièces de caisse et
 * file de validation — lot 2, volet chantiers.
 *
 * Même discipline qu'au lot 1 (`lib/finance/schemas.ts`) : toute entrée
 * invalide devient un `ZodError`, que le middleware central
 * (`middleware/error-middleware.ts`) traduit en 400 sur toutes les routes,
 * sans exception. Les contrôleurs de ce fichier n'utilisent que `.parse`,
 * jamais `.safeParse` suivi d'un `try/catch` qui devinerait un statut — c'est
 * cette dérive que les tests de caractérisation du lot 0 ont relevée dans le
 * module copropriété (400 sur une route, 500 sur une autre pour la même
 * entrée invalide).
 *
 * **Principe P-4 du PRD, rendu impossible à contourner ici.** `actualCost`
 * n'apparaît dans aucun des schémas ci-dessous : ni à la création d'un
 * chantier, ni à sa mise à jour (il n'existe d'ailleurs aucune route de mise à
 * jour dans ce lot). `createConstructionSiteSchema` et
 * `createCashVoucherSchema` sont posés en `.strict()` : un corps qui glisse
 * `actualCost` (ou tout autre champ non prévu par le contrat) est rejeté en
 * 400 plutôt que silencieusement ignoré, pour qu'un test puisse constater le
 * refus plutôt que deviner qu'un champ a été jeté sans bruit.
 *
 * Contrat : `specs/017-finance-fournisseurs-chantiers/contracts/openapi.yaml`.
 */

const uuidSchema = z.string().uuid();

/** Identifiant de chemin (chantier, bon de caisse) : rejeté en 400 s'il n'a pas la forme d'un UUID. */
export { uuidPathParamSchema };

// ---------------------------------------------------------------------------
// GET sites
// ---------------------------------------------------------------------------

export const listConstructionSitesQuerySchema = z.object({
  status: z.enum(['PLANNED', 'IN_PROGRESS', 'SUSPENDED', 'CLOSED']).optional()
});

export type ListConstructionSitesQuery = z.infer<typeof listConstructionSitesQuerySchema>;

// ---------------------------------------------------------------------------
// POST sites — CreateConstructionSiteRequest
// ---------------------------------------------------------------------------

/**
 * `landLeaseId` est accepté (présent au contrat, réservé au lot 4) mais n'est
 * transmis à aucune fonction du domaine : `CreateConstructionSite` (contrat
 * gelé `types-lot2.ts`) ne l'expose pas. Il est ici pour que l'envoyer ne
 * déclenche pas le rejet `.strict()`, pas pour être exploité.
 *
 * `zone` et `startDate` sont exigés ici comme le veut le contrat gelé
 * (`CreateConstructionSiteRequest`, `required: [name, zone, startDate]`),
 * même si l'implémentation de `createConstructionSite`
 * (`lib/finance/sites.ts`) tolère leur absence par une valeur neutre — voir
 * le rapport de fin de tâche.
 */
export const createConstructionSiteSchema = z
  .object({
    name: z.string().trim().min(1, 'Le nom du chantier est obligatoire.'),
    zone: z.string().trim().min(1, 'La zone est obligatoire.'),
    propertyId: uuidSchema.nullish(),
    landLeaseId: uuidSchema.nullish(),
    managerId: uuidSchema.nullish(),
    startDate: z.coerce.date({
      required_error: 'La date de début est obligatoire.',
      invalid_type_error: 'La date de début est invalide.'
    }),
    plannedEndDate: z.coerce.date().nullish()
  })
  .strict('Champ inconnu : le coût réel d’un chantier ne se saisit jamais (principe P-4 du PRD).');

export type CreateConstructionSiteInput = z.infer<typeof createConstructionSiteSchema>;

// ---------------------------------------------------------------------------
// POST cost-categories — CreateCostCategoryRequest
// ---------------------------------------------------------------------------

export const createCostCategorySchema = z
  .object({
    label: z.string().trim().min(1, 'Le libellé du poste de dépense est obligatoire.')
  })
  .strict();

export type CreateCostCategoryInput = z.infer<typeof createCostCategorySchema>;

// ---------------------------------------------------------------------------
// POST sites/:siteId/cash-vouchers — CreateCashVoucherRequest
// ---------------------------------------------------------------------------

export const createCashVoucherSchema = z
  .object({
    beneficiaryName: z.string().trim().min(1, 'Le bénéficiaire est obligatoire.'),
    amount: z.coerce.number().positive('Le montant doit être strictement positif.'),
    voucherDate: z.coerce.date({
      required_error: 'La date du bon est obligatoire.',
      invalid_type_error: 'La date du bon est invalide.'
    }),
    costCategoryId: uuidSchema,
    reason: z.string().trim().min(1, 'Le motif est obligatoire.')
  })
  .strict('Champ inconnu : le coût réel d’un chantier ne se saisit jamais (principe P-4 du PRD).');

export type CreateCashVoucherInput = z.infer<typeof createCashVoucherSchema>;

// ---------------------------------------------------------------------------
// GET validation-queue
// ---------------------------------------------------------------------------

export const validationQueueQuerySchema = z.object({
  createdByUserId: uuidSchema.optional(),
  documentType: z.enum(['SUPPLIER_INVOICE', 'SUPPLIER_PAYMENT', 'CASH_VOUCHER']).optional()
});

export type ValidationQueueQuery = z.infer<typeof validationQueueQuerySchema>;

// ---------------------------------------------------------------------------
// POST cash-vouchers/:voucherId/void
// ---------------------------------------------------------------------------

/**
 * Le motif est obligatoire, et c'est le point.
 *
 * Une piece validee ne se modifie pas (principe P-6) : on la corrige par une
 * piece d'annulation liee, qui porte l'ecriture inverse. L'historique montre
 * alors les deux mouvements, et le motif dit pourquoi — sans quoi la lecture
 * du grand livre laisse une annulation inexpliquee.
 */
export const voidCashVoucherSchema = z.object({
  reason: z.string().min(1, "Le motif d'annulation est obligatoire.")
});

export type VoidCashVoucherInput = z.infer<typeof voidCashVoucherSchema>;
