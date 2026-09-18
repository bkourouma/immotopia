import { z } from 'zod';

/**
 * Validation Zod des routes agence et portail du module financier — lot 1,
 * volet clients.
 *
 * **Toute entrée invalide sur ces schémas devient un `ZodError`**, que le
 * middleware central (`middleware/error-middleware.ts`) traduit en 400,
 * quelle que soit la route. C'est délibéré : les tests de caractérisation du
 * lot 0 ont relevé qu'un intervalle de dates invalide renvoie 500 sur une
 * route du module copropriété et 400 sur une autre, pour la même entrée —
 * une incohérence qu'on ne reproduit pas ici. Aucun contrôleur de ce module
 * ne doit donc utiliser `safeParse` puis ignorer l'échec : `parse` seul,
 * partout, garantit le même code sur toutes les routes.
 *
 * **Alias de compatibilité.** Le contrat `openapi.yaml` nomme les bornes de
 * période `periodStart`/`periodEnd` et la pagination `page`/`pageSize`. Les
 * trois écrans déjà construits contre `services/finance-service.ts` (gelé,
 * hors du territoire de cet agent) envoient en réalité `from`/`to` (et la
 * balance âgée envoie `asOf`, pas `asOfDate`). Les deux jeux de noms sont
 * acceptés ici et résolus vers une seule forme interne, pour que le contrat
 * documenté ET les écrans déjà livrés fonctionnent tous les deux sans
 * modifier de fichier hors du périmètre de cet agent.
 */

const uuidSchema = z.string().uuid();

/** Identifiant de ressource dans un paramètre de chemin (compte, campagne). */
export const uuidPathParamSchema = uuidSchema;

// ---------------------------------------------------------------------------
// Bornes de période — alias periodStart/periodEnd (contrat) et from/to (écrans)
// ---------------------------------------------------------------------------

const rangeAliasObject = z.object({
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
});

export interface ResolvedRange {
  from?: Date;
  to?: Date;
}

/** Résout les deux jeux de noms de bornes vers une seule forme `{ from, to }`. */
export function resolveRange(input: { periodStart?: Date; periodEnd?: Date; from?: Date; to?: Date }): ResolvedRange {
  return {
    from: input.periodStart ?? input.from,
    to: input.periodEnd ?? input.to
  };
}

/**
 * Ajoute la contrainte « borne basse <= borne haute » à un schéma qui étend
 * `rangeAliasObject`. Une borne basse postérieure à la borne haute est
 * rejetée en 400, quels que soient les noms de champs utilisés pour la fournir.
 */
function withRangeOrderValidation<T extends z.ZodObject<z.ZodRawShape>>(schema: T) {
  return schema.refine(
    value => {
      const { from, to } = resolveRange(value as { periodStart?: Date; periodEnd?: Date; from?: Date; to?: Date });
      return !from || !to || from <= to;
    },
    {
      message: 'La date de début de période doit être antérieure ou égale à la date de fin.',
      path: ['periodEnd']
    }
  );
}

// ---------------------------------------------------------------------------
// GET clients/balance
// ---------------------------------------------------------------------------

export const clientsBalanceQuerySchema = withRangeOrderValidation(
  rangeAliasObject.extend({
    propertyId: uuidSchema.optional(),
    format: z.enum(['json', 'csv']).optional().default('json')
  })
);

export type ClientsBalanceQuery = z.infer<typeof clientsBalanceQuerySchema>;

// ---------------------------------------------------------------------------
// GET clients/balance-agee
// ---------------------------------------------------------------------------

export const clientsAgingBalanceQuerySchema = withRangeOrderValidation(
  rangeAliasObject.extend({
    propertyId: uuidSchema.optional(),
    asOfDate: z.coerce.date().optional(),
    asOf: z.coerce.date().optional()
  })
);

export type ClientsAgingBalanceQuery = z.infer<typeof clientsAgingBalanceQuerySchema>;

/** Résout `asOfDate` (contrat) et `asOf` (écran) vers une seule date. */
export function resolveAsOf(input: { asOfDate?: Date; asOf?: Date }): Date {
  return input.asOfDate ?? input.asOf ?? new Date();
}

// ---------------------------------------------------------------------------
// GET accounts/:accountId/statement (JSON, paginé)
// ---------------------------------------------------------------------------

const paginationAliasObject = z.object({
  // Contrat : page/pageSize. Écran : skip/take (`StatementFilters`, non
  // utilisés par l'écran livré, qui ne pagine pas encore, mais présents dans
  // son contrat de types — acceptés ici par prudence.
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
  skip: z.coerce.number().int().nonnegative().optional(),
  take: z.coerce.number().int().positive().max(200).optional()
});

export const accountStatementQuerySchema = withRangeOrderValidation(rangeAliasObject.merge(paginationAliasObject));

export type AccountStatementQuery = z.infer<typeof accountStatementQuerySchema>;

/** Taille de page par défaut, alignée sur `getAccountStatement` (`lib/finance/reports.ts`). */
const DEFAULT_PAGE_SIZE = 50;

export interface ResolvedPagination {
  skip: number;
  take: number;
  page: number;
  pageSize: number;
}

/** Résout page/pageSize et skip/take vers une seule pagination interne. */
export function resolvePagination(input: {
  page?: number;
  pageSize?: number;
  skip?: number;
  take?: number;
}): ResolvedPagination {
  const take = input.pageSize ?? input.take ?? DEFAULT_PAGE_SIZE;
  const skip = input.skip ?? (input.page ? (input.page - 1) * take : 0);
  const page = input.page ?? Math.floor(skip / take) + 1;
  return { skip, take, page, pageSize: take };
}

// ---------------------------------------------------------------------------
// GET accounts/:accountId/statement.pdf (mêmes bornes, jamais paginé)
// ---------------------------------------------------------------------------

export const printAccountStatementQuerySchema = withRangeOrderValidation(rangeAliasObject);

export type PrintAccountStatementQuery = z.infer<typeof printAccountStatementQuerySchema>;

// ---------------------------------------------------------------------------
// GET billing-runs
// ---------------------------------------------------------------------------

export const billingRunListQuerySchema = z.object({
  status: z.enum(['RUNNING', 'DONE', 'FAILED']).optional()
});

export type BillingRunListQuery = z.infer<typeof billingRunListQuerySchema>;

// ---------------------------------------------------------------------------
// POST billing-runs
// ---------------------------------------------------------------------------

const currentYear = new Date().getUTCFullYear();

export const createBillingRunSchema = z.object({
  periodYear: z.coerce
    .number()
    .int('L’année de la période doit être un entier.')
    .min(2000, 'L’année de la période est invalide.')
    .max(currentYear + 5, 'L’année de la période est invalide.'),
  periodMonth: z.coerce
    .number()
    .int('Le mois de la période doit être un entier.')
    .min(1, 'Le mois de la période doit être compris entre 1 et 12.')
    .max(12, 'Le mois de la période doit être compris entre 1 et 12.'),
  label: z.string().min(1, 'Le libellé de la campagne est obligatoire.')
});

export type CreateBillingRunInput = z.infer<typeof createBillingRunSchema>;
