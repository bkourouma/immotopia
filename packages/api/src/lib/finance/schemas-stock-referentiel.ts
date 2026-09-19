import { z } from 'zod';
import { uuidPathParamSchema as sharedUuidPathParamSchema } from './schemas';

/**
 * Validation Zod des neuf points d'entrée du référentiel du stock — lot 5,
 * premier sous-lot (`lib/finance/types-lot5-referentiel.ts`).
 *
 * **Toute entrée invalide sur ces schémas devient un `ZodError`**, que le
 * middleware central (`middleware/error-middleware.ts`) traduit en 400,
 * quelle que soit la route. Même discipline qu'aux lots précédents
 * (`schemas-salaries.ts`) : le contrôleur n'appelle jamais que `.parse`,
 * jamais `.safeParse` suivi d'un abandon silencieux.
 *
 * ---------------------------------------------------------------------------
 * `.strict()` partout : le corps ne répète jamais un identifiant du chemin
 * ---------------------------------------------------------------------------
 *
 * Cinq créations des lots précédents échouaient en 400 contre le vrai serveur
 * parce que leur corps répétait un identifiant que le chemin portait déjà.
 * Ici, `itemId`, `locationId` et `tenantId` ne figurent dans AUCUN schéma de
 * corps : ils viennent du chemin. Un corps qui les enverrait échoue en 400
 * avec un message explicite, plutôt que d'être silencieusement retiré par le
 * comportement par défaut de Zod (qui *jette* les clés inconnues sans le
 * dire). Mieux vaut un 400 bruyant qu'un appelant qui croit avoir envoyé un
 * champ pris en compte.
 *
 * ---------------------------------------------------------------------------
 * L'unité n'est PAS une énumération
 * ---------------------------------------------------------------------------
 *
 * Sac, tonne, barre, m³ : le PRD donne des exemples, pas une liste fermée, et
 * les unités d'une agence ivoirienne ne sont pas celles d'une agence
 * guinéenne (contrat, en-tête). `unit` est donc une `z.string().min(1)` et
 * rien d'autre — aucune normalisation, aucune conversion, aucun refus.
 *
 * ---------------------------------------------------------------------------
 * La correction d'un lieu n'accepte ni `kind` ni `siteId`
 * ---------------------------------------------------------------------------
 *
 * « Un magasin qui deviendrait le lieu d'un chantier emporterait avec lui un
 * stock qui n'y a jamais été » (contrat). `updateStockLocationSchema` est
 * `.strict()` et ne les déclare pas : un corps qui les enverrait est refusé
 * en 400, et non ignoré en silence.
 */

export const uuidPathParamSchema = sharedUuidPathParamSchema;

/**
 * `z.coerce.boolean()` transformerait `?onlyActive=false` en `true` : toute
 * chaîne non vide est « truthy ». On accepte donc explicitement les deux
 * chaînes littérales en plus du booléen déjà typé (même détour qu'aux lots
 * précédents, `schemas-salaries.ts`).
 */
const booleanQueryParam = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .optional()
  .transform(value => (typeof value === 'string' ? value === 'true' : value));

/**
 * Les deux natures de lieu du schéma Prisma (`StockLocationKind`). Écrites en
 * clair plutôt que dérivées du client généré : un schéma de frontière doit se
 * lire sans ouvrir `node_modules`.
 */
export const stockLocationKindSchema = z.enum(['WAREHOUSE', 'SITE'], {
  errorMap: () => ({ message: 'Nature de lieu de stockage invalide.' })
});

/**
 * Une seule valeur, et c'est volontaire (contrat, en-tête) : l'énumération
 * existe pour que le CHOIX soit enregistré et daté, pas pour laisser croire
 * qu'une autre méthode est disponible.
 */
export const stockValuationMethodSchema = z.enum(['WEIGHTED_AVERAGE'], {
  errorMap: () => ({ message: 'Méthode de valorisation invalide.' })
});

// ---------------------------------------------------------------------------
// POST stock/items
// ---------------------------------------------------------------------------

export const createStockItemSchema = z
  .object({
    reference: z.string().min(1, 'La référence de l’article est obligatoire.'),
    label: z.string().min(1, 'La désignation de l’article est obligatoire.'),
    unit: z.string().min(1, 'L’unité de l’article est obligatoire.'),
    category: z.string().min(1, 'La famille ne peut pas être une chaîne vide.').nullable().optional(),
    defaultCostCategoryId: z.string().uuid('Identifiant de poste de dépense invalide.').nullable().optional()
  })
  .strict();

export type CreateStockItemInput = z.infer<typeof createStockItemSchema>;

// ---------------------------------------------------------------------------
// PATCH stock/items/:itemId
//
// `itemId` n'apparaît PAS ici : il vient du chemin (voir l'en-tête).
// `reference` non plus — elle ne se corrige pas, c'est elle qu'on lit sur les
// bons déjà imprimés (contrat, `UpdateStockItemTx`).
// ---------------------------------------------------------------------------

export const updateStockItemSchema = z
  .object({
    label: z.string().min(1, 'La désignation de l’article ne peut pas être vide.').optional(),
    // Corrigeable, et dangereux : aucune quantité déjà enregistrée n'est
    // reconvertie (contrat). Le domaine laisse faire, l'écran prévient.
    unit: z.string().min(1, 'L’unité de l’article ne peut pas être vide.').optional(),
    category: z.string().min(1, 'La famille ne peut pas être une chaîne vide.').nullable().optional(),
    defaultCostCategoryId: z.string().uuid('Identifiant de poste de dépense invalide.').nullable().optional(),
    isActive: z.boolean().optional()
  })
  .strict()
  .refine(value => Object.keys(value).length > 0, {
    message: 'Aucune correction fournie.'
  });

export type UpdateStockItemInput = z.infer<typeof updateStockItemSchema>;

// ---------------------------------------------------------------------------
// GET stock/items
// ---------------------------------------------------------------------------

export const listStockItemsQuerySchema = z
  .object({
    onlyActive: booleanQueryParam,
    search: z.string().min(1, 'La recherche ne peut pas être une chaîne vide.').optional()
  })
  .strict();

export type ListStockItemsQuery = z.infer<typeof listStockItemsQuerySchema>;

// ---------------------------------------------------------------------------
// POST stock/locations
// ---------------------------------------------------------------------------

export const createStockLocationSchema = z
  .object({
    kind: stockLocationKindSchema,
    label: z.string().min(1, 'Le libellé du lieu de stockage est obligatoire.'),
    siteId: z.string().uuid('Identifiant de chantier invalide.').nullable().optional()
  })
  .strict()
  // Vérification de forme, redondante avec le domaine
  // (`createStockLocationTx`) qui reste la seule autorité : cette fonction est
  // appelée directement par les tests unitaires, sans passer par ce schéma.
  // Le refus ici n'est qu'un 400 plus rapide, avant toute requête base.
  .superRefine((value, ctx) => {
    const hasSite = Boolean(value.siteId);
    if (value.kind === 'SITE' && !hasSite) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Le chantier est obligatoire pour un lieu de stockage de chantier.',
        path: ['siteId']
      });
    }
    if (value.kind !== 'SITE' && hasSite) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Le chantier n'est accepté que pour un lieu de stockage de chantier.",
        path: ['siteId']
      });
    }
  });

export type CreateStockLocationInput = z.infer<typeof createStockLocationSchema>;

// ---------------------------------------------------------------------------
// PATCH stock/locations/:locationId
//
// `locationId` vient du chemin. Ni `kind` ni `siteId` ne sont déclarés : voir
// l'en-tête. `.strict()` les refuse en 400.
// ---------------------------------------------------------------------------

export const updateStockLocationSchema = z
  .object({
    label: z.string().min(1, 'Le libellé du lieu de stockage ne peut pas être vide.').optional(),
    isActive: z.boolean().optional()
  })
  .strict()
  .refine(value => Object.keys(value).length > 0, {
    message: 'Aucune correction fournie.'
  });

export type UpdateStockLocationInput = z.infer<typeof updateStockLocationSchema>;

// ---------------------------------------------------------------------------
// GET stock/locations
// ---------------------------------------------------------------------------

export const listStockLocationsQuerySchema = z
  .object({
    onlyActive: booleanQueryParam,
    kind: stockLocationKindSchema.optional()
  })
  .strict();

export type ListStockLocationsQuery = z.infer<typeof listStockLocationsQuerySchema>;

// ---------------------------------------------------------------------------
// PUT stock/settings
//
// `decisionNote` est EXIGÉ, et une chaîne d'espaces n'en est pas un : le
// besoin S5 veut une décision documentée (contrat,
// `SetStockValuationMethodTx`).
// ---------------------------------------------------------------------------

export const setStockValuationMethodSchema = z
  .object({
    valuationMethod: stockValuationMethodSchema,
    decisionNote: z.string().trim().min(1, 'Le motif de la décision est obligatoire.')
  })
  .strict();

export type SetStockValuationMethodInput = z.infer<typeof setStockValuationMethodSchema>;
