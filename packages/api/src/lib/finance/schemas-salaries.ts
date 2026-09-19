import { z } from 'zod';
import { uuidPathParamSchema as sharedUuidPathParamSchema } from './schemas';

/**
 * Validation Zod des neuf points d'entrée des salaires — lot 4, troisième
 * sous-lot (`lib/finance/types-lot4-salaries.ts`).
 *
 * **Toute entrée invalide sur ces schémas devient un `ZodError`**, que le
 * middleware central (`middleware/error-middleware.ts`) traduit en 400,
 * quelle que soit la route. Même discipline qu'aux lots précédents
 * (`lib/finance/schemas-suppliers.ts`, `lib/finance/schemas-land-leases.ts`) :
 * le contrôleur n'appelle jamais que `.parse`, jamais `.safeParse` suivi d'un
 * abandon silencieux.
 *
 * ---------------------------------------------------------------------------
 * `.strict()` partout où le chemin porte déjà un identifiant
 * ---------------------------------------------------------------------------
 *
 * Quatre créations des lots 2 et 3 échouaient en 400 contre le vrai serveur
 * parce que leur corps répétait un identifiant que le chemin portait déjà
 * (`fix(finance): quatre creations echouaient en 400 contre le vrai serveur`).
 * Ici, `createEmployeeSchema`, `createSalaryNoteSchema` et
 * `createSalaryPaymentSchema` sont volontairement `.strict()` : un corps qui
 * enverrait `employeeId` (déjà dans l'URL de `POST
 * employees/:employeeId/salary-notes`, par exemple) échoue en 400 avec un
 * message explicite, plutôt que d'être silencieusement ignoré par le
 * comportement par défaut de Zod (qui *retire* les clés inconnues sans le
 * dire). Mieux vaut un 400 bruyant qu'un appelant qui croit avoir envoyé un
 * champ pris en compte alors qu'il a été jeté.
 */

export const uuidPathParamSchema = sharedUuidPathParamSchema;

/**
 * `z.coerce.boolean()` transformerait `?onlyActive=false` en `true` : toute
 * chaîne non vide est « truthy ». On accepte donc explicitement les deux
 * chaînes littérales en plus du booléen déjà typé (même détour qu'aux lots
 * précédents, `schemas-suppliers.ts`/`schemas-land-leases.ts`).
 */
const booleanQueryParam = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .optional()
  .transform(value => (typeof value === 'string' ? value === 'true' : value));

// ---------------------------------------------------------------------------
// GET employees
// ---------------------------------------------------------------------------

export const listEmployeesQuerySchema = z
  .object({
    onlyActive: booleanQueryParam
  })
  .strict();

export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;

// ---------------------------------------------------------------------------
// POST employees
// ---------------------------------------------------------------------------

export const createEmployeeSchema = z
  .object({
    fullName: z.string().min(1, 'Le nom complet est obligatoire.'),
    role: z.string().min(1, 'Le poste ne peut pas être une chaîne vide.').nullable().optional()
  })
  .strict();

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

// ---------------------------------------------------------------------------
// GET salary-notes — filtres en query, jamais de tenantId ni d'employeeId
// imposé par le chemin ici : cette route est délibérément transversale
// (contrat, tableau des routes).
// ---------------------------------------------------------------------------

export const listSalaryNotesQuerySchema = z
  .object({
    employeeId: z.string().uuid('Identifiant d’employé invalide.').optional(),
    siteId: z.string().uuid('Identifiant de chantier invalide.').optional(),
    periodYear: z.coerce.number().int('L’année de période doit être un entier.').min(2000).max(2100).optional(),
    periodMonth: z.coerce.number().int('Le mois de période doit être un entier.').min(1).max(12).optional()
  })
  .strict();

export type ListSalaryNotesQuery = z.infer<typeof listSalaryNotesQuerySchema>;

// ---------------------------------------------------------------------------
// POST employees/:employeeId/salary-notes
//
// `employeeId` n'apparaît PAS ici : il vient du chemin (voir l'en-tête).
// ---------------------------------------------------------------------------

export const createSalaryNoteSchema = z
  .object({
    periodYear: z.number().int('L’année de période doit être un entier.').min(2000).max(2100),
    periodMonth: z.number().int('Le mois de période doit être un entier.').min(1).max(12),
    amount: z.number().positive('Le montant de la note de salaire doit être positif.'),
    siteId: z.string().uuid('Identifiant de chantier invalide.').nullable().optional(),
    costCategoryId: z.string().uuid('Identifiant de poste de dépense invalide.').nullable().optional()
  })
  .strict()
  // Vérification de forme, redondante avec le domaine (`createSalaryNoteTx`)
  // qui reste la seule autorité : cette fonction est appelée directement par
  // les tests unitaires, sans passer par ce schéma. Le refus ici n'est qu'un
  // 400 plus rapide, avant toute requête base de données.
  .superRefine((value, ctx) => {
    const hasSite = Boolean(value.siteId);
    const hasCategory = Boolean(value.costCategoryId);
    if (hasSite && !hasCategory) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Le poste de dépense est obligatoire dès qu'un chantier est renseigné.",
        path: ['costCategoryId']
      });
    }
    if (!hasSite && hasCategory) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Le poste de dépense n'est accepté que si un chantier est renseigné.",
        path: ['costCategoryId']
      });
    }
  });

export type CreateSalaryNoteInput = z.infer<typeof createSalaryNoteSchema>;

// ---------------------------------------------------------------------------
// POST employees/:employeeId/salary-payments
//
// `employeeId` n'apparaît PAS ici non plus, même raison. Pas d'affectation à
// des notes précises (contrat, `CreateSalaryPaymentTx`) : contrairement au
// règlement fournisseur du lot 2, il n'y a donc pas de tableau `allocations`.
// ---------------------------------------------------------------------------

export const createSalaryPaymentSchema = z
  .object({
    paymentDate: z.coerce.date({ errorMap: () => ({ message: 'Date de règlement invalide.' }) }),
    amount: z.number().positive('Le montant du règlement doit être positif.')
  })
  .strict();

export type CreateSalaryPaymentInput = z.infer<typeof createSalaryPaymentSchema>;
