import { PropertyOwnershipType, PropertyType, SiteLotAllocationMethod } from '@prisma/client';
import { z } from 'zod';

import { uuidPathParamSchema as sharedUuidPathParamSchema } from './schemas';

/**
 * Validation Zod des dix points d'entrée des lots, du coût de revient et de la
 * clôture — lot 4, sixième sous-lot (`lib/finance/types-lot4-closing.ts`).
 *
 * **Toute entrée invalide sur ces schémas devient un `ZodError`**, que le
 * middleware central (`middleware/error-middleware.ts`) traduit en 400, quelle
 * que soit la route. Même discipline qu'aux sous-lots précédents
 * (`schemas-salaries.ts`) : le contrôleur n'appelle que `.parse`, jamais un
 * `.safeParse` suivi d'un abandon silencieux.
 *
 * ---------------------------------------------------------------------------
 * `.strict()` partout, et AUCUN identifiant déjà porté par le chemin
 * ---------------------------------------------------------------------------
 *
 * Quatre créations des lots 2 et 3 échouaient en 400 contre le vrai serveur
 * parce que leur corps répétait un identifiant que le chemin portait déjà
 * (`fix(finance): quatre creations echouaient en 400 contre le vrai serveur`).
 * Ici, aucun corps ne porte `tenantId`, `siteId` ni `lotId` : tous trois
 * viennent du chemin. `.strict()` rend le refus BRUYANT — un corps qui les
 * répéterait échoue en 400 avec un message explicite, plutôt que d'être
 * silencieusement amputé par le comportement par défaut de Zod (qui *retire*
 * les clés inconnues sans le dire).
 *
 * ---------------------------------------------------------------------------
 * Les deux énumérations Prisma du bien, validées ICI
 * ---------------------------------------------------------------------------
 *
 * `Property.propertyType` et `Property.ownershipType` sont des enums Postgres.
 * Le contrat gelé les type en `string` pour ne pas imposer un import d'enum
 * dans une signature figée — ce qui laisse la validation à faire quelque part.
 * C'est ici, contre les VRAIES valeurs de l'énumération générée : une valeur
 * inconnue doit produire un 400 lisible, listant ce qui est accepté, plutôt
 * qu'une erreur Prisma brute sur une contrainte d'énumération que personne ne
 * sait lire côté écran.
 */

export const uuidPathParamSchema = sharedUuidPathParamSchema;

// ---------------------------------------------------------------------------
// POST /sites/:siteId/lots
//
// `siteId` n'apparaît PAS ici : il vient du chemin.
// ---------------------------------------------------------------------------

const surfaceAreaField = z
  .number()
  .positive('La surface du lot doit être strictement positive.')
  .max(10_000_000, 'La surface du lot est hors de toute échelle plausible.')
  .nullable()
  .optional();

const manualSharePercentField = z
  .number()
  .positive('La quote-part du lot doit être strictement positive.')
  .max(100, 'La quote-part du lot ne peut pas dépasser cent pour cent.')
  .nullable()
  .optional();

export const createSiteLotSchema = z
  .object({
    name: z.string().min(1, 'Le nom du lot est obligatoire.'),
    surfaceArea: surfaceAreaField,
    manualSharePercent: manualSharePercentField
  })
  .strict();

export type CreateSiteLotInput = z.infer<typeof createSiteLotSchema>;

// ---------------------------------------------------------------------------
// PATCH /sites/:siteId/lots/:lotId
//
// Ni `siteId` ni `lotId` : les deux viennent du chemin. Les trois champs sont
// facultatifs — une correction ne touche que ce qu'elle nomme — mais un corps
// entièrement vide est refusé, parce qu'il ne veut rien dire et qu'un appelant
// qui l'envoie s'est trompé de requête.
// ---------------------------------------------------------------------------

export const updateSiteLotSchema = z
  .object({
    name: z.string().min(1, 'Le nom du lot ne peut pas être une chaîne vide.').optional(),
    surfaceArea: surfaceAreaField,
    manualSharePercent: manualSharePercentField
  })
  .strict()
  .refine(value => Object.keys(value).length > 0, {
    message: 'Aucun champ à corriger : indiquez au moins le nom, la surface ou la quote-part.'
  });

export type UpdateSiteLotInput = z.infer<typeof updateSiteLotSchema>;

// ---------------------------------------------------------------------------
// PUT /sites/:siteId/lot-allocation-method
// ---------------------------------------------------------------------------

export const setLotAllocationMethodSchema = z
  .object({
    method: z.nativeEnum(SiteLotAllocationMethod, {
      errorMap: () => ({
        message: `Clé de répartition inconnue. Valeurs acceptées : ${Object.keys(SiteLotAllocationMethod).join(', ')}.`
      })
    })
  })
  .strict();

export type SetLotAllocationMethodInput = z.infer<typeof setLotAllocationMethodSchema>;

// ---------------------------------------------------------------------------
// POST /sites/:siteId/close
//
// Aucun corps : le chantier vient du chemin, et l'auteur de la clôture vient
// du jeton d'authentification — jamais du corps, qui laisserait clôturer au
// nom de quelqu'un d'autre.
// ---------------------------------------------------------------------------

export const closeSiteSchema = z.object({}).strict();

// ---------------------------------------------------------------------------
// POST /sites/:siteId/reopen — aucun corps non plus.
// ---------------------------------------------------------------------------

export const reopenSiteSchema = z.object({}).strict();

// ---------------------------------------------------------------------------
// POST /sites/:siteId/lots/:lotId/capitalize
//
// Tous les champs du bien viennent de l'appelant, AUCUN n'est deviné depuis le
// chantier (contrat). Ni `lotId` ni `siteId` dans le corps : ils sont dans le
// chemin. Pas non plus d'`acquisitionCost` : c'est le coût de revient dérivé
// qui le fournit, et l'accepter en entrée permettrait d'inscrire au patrimoine
// une valeur que rien ne justifie.
// ---------------------------------------------------------------------------

export const capitalizeSiteLotSchema = z
  .object({
    internalReference: z.string().min(1, 'La référence interne du bien est obligatoire.'),
    propertyType: z.nativeEnum(PropertyType, {
      errorMap: () => ({
        message: `Type de bien inconnu. Valeurs acceptées : ${Object.keys(PropertyType).join(', ')}.`
      })
    }),
    ownershipType: z.nativeEnum(PropertyOwnershipType, {
      errorMap: () => ({
        message: `Mode de détention inconnu. Valeurs acceptées : ${Object.keys(PropertyOwnershipType).join(', ')}.`
      })
    }),
    title: z.string().min(1, 'Le titre du bien est obligatoire.'),
    // Obligatoire mais possiblement vide : la colonne `Property.description`
    // est un `Text` NON NUL en base. Exiger une phrase ferait inventer une
    // description pour passer l'écran, ce qui est pire qu'une absence assumée.
    description: z.string(),
    address: z.string().min(1, "L'adresse du bien est obligatoire."),
    acquisitionDate: z.coerce.date({ errorMap: () => ({ message: "Date d'acquisition invalide." }) })
  })
  .strict();

export type CapitalizeSiteLotInput = z.infer<typeof capitalizeSiteLotSchema>;
