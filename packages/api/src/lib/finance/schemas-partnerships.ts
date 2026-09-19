import { z } from 'zod';
import { uuidPathParamSchema as sharedUuidPathParamSchema } from './schemas';

/**
 * Validation Zod des sept points d'entrée des associations — lot 4, deuxième
 * sous-lot (`lib/finance/types-lot4-partnerships.ts`, contrat gelé).
 *
 * Même discipline qu'aux sous-lots précédents (`schemas-land-leases.ts`) : le
 * contrôleur n'appelle jamais que `.parse`, jamais `.safeParse` suivi d'un
 * abandon silencieux, pour qu'une entrée invalide devienne toujours un 400 via
 * le middleware central.
 *
 * **LES SCHÉMAS DE CORPS SONT EN `.strict()`, ET N'ACCEPTENT JAMAIS UN
 * IDENTIFIANT QUE LE CHEMIN PORTE DÉJÀ.** Quatre créations des lots 2 et 3
 * échouaient en 400 contre le vrai serveur parce qu'un appelant renvoyait
 * l'identifiant de la ressource parente en plus de l'URL, et qu'un schéma
 * strict refuse tout champ inattendu (`fix(finance): quatre creations
 * echouaient en 400 contre le vrai serveur`, 19 septembre 2026). La discipline
 * ici va dans l'autre sens : ne JAMAIS DÉCLARER ce champ dans le schéma, pour
 * qu'aucun appelant ne puisse même être tenté de le renvoyer.
 * `addPartnershipShareSchema` ne porte donc pas `partnershipId` (il vient de
 * `req.params`), et `attachPropertyToPartnershipSchema` ne porte pas
 * `propertyId` (même raison). `.strict()` est ce qui rend cette omission
 * opposable : sans lui, un appelant qui renverrait quand même l'identifiant
 * verrait la clé silencieusement ignorée (mode `strip`, le défaut de Zod),
 * jamais un 400 qui l'alerterait de son erreur.
 */

export const uuidPathParamSchema = sharedUuidPathParamSchema;

// ---------------------------------------------------------------------------
// GET partnerships
// ---------------------------------------------------------------------------

/**
 * `z.coerce.boolean()` transformerait `?onlyActive=false` en `true` : toute
 * chaîne non vide est « truthy ». On accepte donc explicitement les deux
 * chaînes littérales en plus du booléen déjà typé (même détour qu'aux
 * sous-lots précédents, `schemas-land-leases.ts`).
 */
const booleanQueryParam = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .optional()
  .transform(value => (typeof value === 'string' ? value === 'true' : value));

export const listPartnershipsQuerySchema = z.object({
  onlyActive: booleanQueryParam
});

export type ListPartnershipsQuery = z.infer<typeof listPartnershipsQuerySchema>;

// ---------------------------------------------------------------------------
// POST partnerships
// ---------------------------------------------------------------------------

export const createPartnershipSchema = z
  .object({
    label: z.string().min(1, "Le libellé de l'association est obligatoire.")
  })
  .strict();

export type CreatePartnershipInput = z.infer<typeof createPartnershipSchema>;

// ---------------------------------------------------------------------------
// POST partnerships/:partnershipId/shares
//
// `partnershipId` vient du chemin, jamais du corps (voir l'en-tête).
// ---------------------------------------------------------------------------

export const addPartnershipShareSchema = z
  .object({
    partnerName: z.string().min(1, "Le nom de l'associé est obligatoire."),
    // Bornes larges ici : le refus « somme > 100 % » est une règle de domaine
    // qui dépend des autres parts déjà posées, pas une contrainte de forme —
    // elle se vérifie dans `lib/finance/partnerships.ts`, jamais ici.
    sharePercent: z
      .number()
      .positive('La quote-part doit être strictement positive.')
      .max(100, 'La quote-part ne peut pas dépasser cent pour cent.')
  })
  .strict();

export type AddPartnershipShareInput = z.infer<typeof addPartnershipShareSchema>;

// ---------------------------------------------------------------------------
// PUT properties/:propertyId/partnership
//
// `propertyId` vient du chemin. `partnershipId` est obligatoire dans le
// corps, mais accepte `null` : c'est la valeur `null` qui détache le bien de
// toute association (contrat, `AttachPropertyToPartnershipTx`).
// ---------------------------------------------------------------------------

export const attachPropertyToPartnershipSchema = z
  .object({
    partnershipId: z.string().uuid("Identifiant d'association invalide.").nullable()
  })
  .strict();

export type AttachPropertyToPartnershipInput = z.infer<typeof attachPropertyToPartnershipSchema>;

// ---------------------------------------------------------------------------
// GET partnership-shares/:shareId/statement
// ---------------------------------------------------------------------------

export const getPartnerStatementQuerySchema = z
  .object({
    from: z.coerce.date({ errorMap: () => ({ message: 'Date de début de période invalide.' }) }).optional(),
    to: z.coerce.date({ errorMap: () => ({ message: 'Date de fin de période invalide.' }) }).optional()
  })
  .refine(value => !value.from || !value.to || value.from <= value.to, {
    message: 'La date de début de période doit être antérieure ou égale à la date de fin.',
    path: ['to']
  });

export type GetPartnerStatementQuery = z.infer<typeof getPartnerStatementQuerySchema>;
