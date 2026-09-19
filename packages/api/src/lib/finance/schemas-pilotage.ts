import { z } from 'zod';
import { uuidPathParamSchema } from './schemas';

/**
 * Validation Zod des cinq points d'entrée « pilotage » du lot 3 : avancement
 * physique, alerte de dépassement, tableau de bord.
 *
 * Même discipline que `schemas-sites.ts` (lot 2) et pour la même raison : les
 * contrôleurs de ce lot n'utilisent que `.parse`, jamais `.safeParse` suivi
 * d'un abandon silencieux qui devinerait un statut HTTP — c'est la dérive que
 * les tests de caractérisation du lot 0 ont relevée dans le module
 * copropriété (400 sur une route, 500 sur une autre pour la même entrée
 * invalide).
 *
 * Contrat : `specs/018-finance-budget-pilotage/data-model.md` §5.
 */

/** Identifiant de chemin (chantier, alerte) : rejeté en 400 s'il n'a pas la forme d'un UUID. */
export { uuidPathParamSchema };

// ---------------------------------------------------------------------------
// POST sites/:siteId/progress
// ---------------------------------------------------------------------------

/**
 * `percent` est **strict** sur `[0, 100]` : le contrat gelé (`types-lot3.ts`,
 * `RecordSiteProgressTx`) dit « borné », et une valeur hors bornes est donc
 * refusée en 400 ici, jamais silencieusement écrêtée à 0 ou 100 — écrêter
 * changerait la saisie de la gestionnaire sans le lui dire, ce que le
 * contrôleur d'invariants ne pourrait plus distinguer d'une vraie saisie à la
 * borne.
 *
 * Un avancement qui recule reste accepté : aucune contrainte ici ne compare
 * `percent` à la saisie précédente, exactement comme le veut le contrat
 * (« un avancement qui recule est permis »).
 *
 * `.strict()` : un corps qui glisserait un champ étranger — par exemple un
 * `progressPercent` qui viserait `ConstructionSite` directement — est rejeté
 * plutôt qu'ignoré, même principe qu'au lot 2 pour `actualCost`.
 */
export const recordSiteProgressSchema = z
  .object({
    entryDate: z.coerce.date({
      required_error: "La date de saisie de l'avancement est obligatoire.",
      invalid_type_error: 'La date de saisie est invalide.'
    }),
    percent: z.coerce
      .number({ required_error: "Le pourcentage d'avancement est obligatoire." })
      .int("Le pourcentage d'avancement doit être un nombre entier.")
      .min(0, "Le pourcentage d'avancement ne peut pas être négatif.")
      .max(100, "Le pourcentage d'avancement ne peut pas dépasser 100.")
      // Un `-0` provoqué par une saisie comme `-0` reste un zéro valide : sans
      // cette normalisation, `Object.is(-0, 0)` est faux et pourrait surprendre
      // un test comme un affichage.
      .transform(value => (value === 0 ? 0 : value)),
    note: z.string().trim().min(1, 'La note ne peut pas être une chaîne vide.').nullish()
  })
  .strict("Champ inconnu : un point d'avancement ne porte que la date, le pourcentage et une note (contrat gelé).");

export type RecordSiteProgressInput = z.infer<typeof recordSiteProgressSchema>;

// ---------------------------------------------------------------------------
// GET sites/dashboard
// ---------------------------------------------------------------------------

/**
 * `z.coerce.boolean()` transformerait `?onlyOverBudget=false` en `true` :
 * toute chaîne non vide est « truthy ». Même repli qu'au lot 2
 * (`schemas-suppliers.ts`, `booleanQueryParam`) : on accepte les deux chaînes
 * littérales en plus du booléen déjà typé.
 */
const booleanQueryParam = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .optional()
  .transform(value => (typeof value === 'string' ? value === 'true' : value));

export const sitesDashboardQuerySchema = z.object({
  status: z.enum(['PLANNED', 'IN_PROGRESS', 'SUSPENDED', 'CLOSED']).optional(),
  onlyOverBudget: booleanQueryParam
});

export type SitesDashboardQuery = z.infer<typeof sitesDashboardQuerySchema>;
