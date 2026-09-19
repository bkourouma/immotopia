import { z } from 'zod';
import { uuidPathParamSchema as sharedUuidPathParamSchema } from './schemas';

/**
 * Validation Zod des neuf points d'entrée des baux de terrain — lot 4, premier
 * sous-lot (`specs/019-finance-baux-terrain/data-model.md` §5).
 *
 * Même discipline qu'aux lots 1 et 2 (`lib/finance/schemas.ts`,
 * `lib/finance/schemas-suppliers.ts`) : le contrôleur n'appelle jamais que
 * `.parse`, jamais `.safeParse` suivi d'un abandon silencieux, pour qu'une
 * entrée invalide devienne toujours un 400 via le middleware central.
 */

export const uuidPathParamSchema = sharedUuidPathParamSchema;

// ---------------------------------------------------------------------------
// GET land-leases
// ---------------------------------------------------------------------------

/**
 * `z.coerce.boolean()` transformerait `?onlyActive=false` en `true` : toute
 * chaîne non vide est « truthy ». On accepte donc explicitement les deux
 * chaînes littérales en plus du booléen déjà typé (même détour qu'au lot 2,
 * `schemas-suppliers.ts`).
 */
const booleanQueryParam = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .optional()
  .transform(value => (typeof value === 'string' ? value === 'true' : value));

export const listLandLeasesQuerySchema = z.object({
  onlyActive: booleanQueryParam
});

export type ListLandLeasesQuery = z.infer<typeof listLandLeasesQuerySchema>;

// ---------------------------------------------------------------------------
// POST land-leases
// ---------------------------------------------------------------------------

export const createLandLeaseSchema = z
  .object({
    landlordName: z.string().min(1, 'Le nom du bailleur est obligatoire.'),
    landLabel: z.string().min(1, 'Le libellé du terrain est obligatoire.'),
    annualAmount: z.number().positive('Le montant annuel du bail doit être positif.'),
    // Demandé, jamais deviné : voir `CreateLandLeaseTx.costCategoryId`
    // (types-lot4.ts) et `land-leases.ts`, `createLandLeaseTx`.
    costCategoryId: z.string().uuid('Identifiant de poste de dépense invalide.'),
    startDate: z.coerce.date({ errorMap: () => ({ message: 'Date de début de bail invalide.' }) }),
    endDate: z.coerce
      .date({ errorMap: () => ({ message: 'Date de fin de bail invalide.' }) })
      .nullable()
      .optional()
  })
  .refine(value => !value.endDate || value.endDate > value.startDate, {
    message: 'La date de fin doit être postérieure à la date de début.',
    path: ['endDate']
  });

export type CreateLandLeaseInput = z.infer<typeof createLandLeaseSchema>;

// ---------------------------------------------------------------------------
// PUT sites/:siteId/land-lease
// ---------------------------------------------------------------------------

/**
 * `landLeaseId` est obligatoire dans le corps, mais accepte `null` :
 * c'est la valeur `null` qui détache le chantier de tout bail (data-model.md
 * §5, note sous le tableau des routes).
 */
export const attachSiteToLandLeaseSchema = z.object({
  landLeaseId: z.string().uuid('Identifiant de bail invalide.').nullable()
});

export type AttachSiteToLandLeaseInput = z.infer<typeof attachSiteToLandLeaseSchema>;

// ---------------------------------------------------------------------------
// POST land-leases/:landLeaseId/payments
// ---------------------------------------------------------------------------

export const createLandLeasePaymentSchema = z
  .object({
    paymentDate: z.coerce.date({ errorMap: () => ({ message: 'Date de paiement invalide.' }) }),
    amount: z.number().positive('Le montant du paiement doit être positif.'),
    coverageStartDate: z.coerce.date({ errorMap: () => ({ message: 'Date de début de période couverte invalide.' }) }),
    coverageEndDate: z.coerce.date({ errorMap: () => ({ message: 'Date de fin de période couverte invalide.' }) })
  })
  .refine(value => value.coverageEndDate > value.coverageStartDate, {
    message: 'La période couverte doit se terminer après son début.',
    path: ['coverageEndDate']
  });

export type CreateLandLeasePaymentInput = z.infer<typeof createLandLeasePaymentSchema>;

// ---------------------------------------------------------------------------
// POST land-leases/:landLeaseId/accruals
//
// Route manuelle de rattrapage : constate un mois précis à la main, quand le
// travail programmé n'a pas tourné (data-model.md §5, dernière ligne).
// ---------------------------------------------------------------------------

export const recordLandLeaseAccrualSchema = z.object({
  periodYear: z.number().int('L’année de période doit être un entier.').min(2000).max(2100),
  periodMonth: z.number().int('Le mois de période doit être un entier.').min(1).max(12)
});

export type RecordLandLeaseAccrualInput = z.infer<typeof recordLandLeaseAccrualSchema>;
