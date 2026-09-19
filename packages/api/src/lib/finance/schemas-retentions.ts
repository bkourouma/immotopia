import { z } from 'zod';
import { uuidPathParamSchema as sharedUuidPathParamSchema } from './schemas';

/**
 * Validation Zod des cinq points d'entrée de la retenue de garantie — lot 4,
 * cinquième sous-lot (`lib/finance/types-lot4-retentions.ts`).
 *
 * **Toute entrée invalide sur ces schémas devient un `ZodError`**, que le
 * middleware central (`middleware/error-middleware.ts`) traduit en 400, quelle
 * que soit la route. Même discipline qu'aux sous-lots précédents
 * (`schemas-salaries.ts`, `schemas-suppliers.ts`) : le contrôleur n'appelle que
 * `.parse`, jamais `.safeParse` suivi d'un abandon silencieux.
 *
 * ---------------------------------------------------------------------------
 * `.strict()` partout, et deux raisons distinctes de l'être
 * ---------------------------------------------------------------------------
 *
 * 1. **Un corps ne répète jamais un identifiant que le chemin porte déjà.**
 *    Quatre créations des lots 2 et 3 échouaient en 400 contre le vrai serveur
 *    pour cette raison. `releaseRetentionSchema` est donc un objet VIDE et
 *    strict : `retentionId` est dans l'URL, un corps qui le répéterait est
 *    refusé bruyamment plutôt qu'ignoré en silence (le comportement par défaut
 *    de Zod *retire* les clés inconnues sans le dire).
 *
 * 2. **Le montant retenu est dérivé, jamais saisi** (principe P-4, contrat).
 *    `createRetentionSchema` n'accepte donc PAS de champ `amount`, et comme il
 *    est strict, un appelant qui en enverrait un reçoit un 400 explicite plutôt
 *    que de croire son montant pris en compte alors qu'il a été jeté. C'est la
 *    seule façon de rendre le principe visible depuis l'extérieur.
 */

export const uuidPathParamSchema = sharedUuidPathParamSchema;

/** Les deux natures de pièce sur lesquelles une retenue peut se poser. */
export const retentionSourceTypeSchema = z.enum(['SUPPLIER_INVOICE', 'PROGRESS_STATEMENT'], {
  errorMap: () => ({ message: 'La nature de la pièce doit être une facture fournisseur ou une situation.' })
});

export const retentionStatusSchema = z.enum(['HELD', 'RELEASED'], {
  errorMap: () => ({ message: 'Le statut doit être « détenue » ou « libérée ».' })
});

// ---------------------------------------------------------------------------
// POST /retentions
//
// `sourceId` EST dans le corps, et ce n'est pas une répétition : le chemin ne
// porte que `tenantId`. C'est la pièce sur laquelle on retient, et elle change
// de table selon `sourceType` — la mettre dans le chemin obligerait à deux
// routes là où une suffit.
// ---------------------------------------------------------------------------

export const createRetentionSchema = z
  .object({
    sourceType: retentionSourceTypeSchema,
    sourceId: z.string().uuid('Identifiant de pièce invalide.'),
    // Un POURCENTAGE, pas un montant. Les bornes sont exclues des deux côtés :
    // zéro n'est pas une retenue, cent pour cent est un non-paiement. Le
    // domaine (`createRetentionTx`) reste la seule autorité — il est appelé
    // directement par les tests unitaires, sans passer par ce schéma — mais ce
    // refus-ci arrive avant toute requête base de données.
    ratePercent: z
      .number({ invalid_type_error: 'Le taux de retenue doit être un nombre.' })
      .gt(0, 'Le taux de retenue doit être strictement supérieur à 0.')
      .lt(100, 'Le taux de retenue doit être strictement inférieur à 100.'),
    // Exigée, jamais optionnelle : une retenue sans échéance prévue est une
    // retenue qu'on oublie (contrat).
    plannedReleaseDate: z.coerce.date({
      errorMap: () => ({ message: 'Date de libération prévue invalide.' })
    })
  })
  .strict();

export type CreateRetentionInput = z.infer<typeof createRetentionSchema>;

// ---------------------------------------------------------------------------
// POST /retentions/:retentionId/release
//
// Aucun champ. Libérer est un acte sans paramètre : ni montant (pas de
// libération partielle, contrat), ni date (`releasedAt` est l'instant de
// l'acte), ni identifiant (il est dans le chemin).
// ---------------------------------------------------------------------------

export const releaseRetentionSchema = z.object({}).strict();

export type ReleaseRetentionInput = z.infer<typeof releaseRetentionSchema>;

// ---------------------------------------------------------------------------
// GET /retentions
// ---------------------------------------------------------------------------

export const listRetentionsQuerySchema = z
  .object({
    status: retentionStatusSchema.optional(),
    siteId: z.string().uuid('Identifiant de chantier invalide.').optional(),
    thirdPartyAccountId: z.string().uuid('Identifiant de compte de tiers invalide.').optional(),
    dueBefore: z.coerce.date({ errorMap: () => ({ message: 'Date d’échéance invalide.' }) }).optional()
  })
  .strict();

export type ListRetentionsQuery = z.infer<typeof listRetentionsQuerySchema>;

// ---------------------------------------------------------------------------
// GET /retentions/summary
// ---------------------------------------------------------------------------

export const retentionSummaryQuerySchema = z
  .object({
    siteId: z.string().uuid('Identifiant de chantier invalide.').optional()
  })
  .strict();

export type RetentionSummaryQuery = z.infer<typeof retentionSummaryQuerySchema>;
