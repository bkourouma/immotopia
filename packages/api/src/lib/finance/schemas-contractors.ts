import { z } from 'zod';
import { uuidPathParamSchema as sharedUuidPathParamSchema } from './schemas';

/**
 * Validation Zod des onze points d'entrée des tâcherons — lot 4, quatrième
 * sous-lot (`lib/finance/types-lot4-contractors.ts`, contrat gelé).
 *
 * Même discipline qu'aux sous-lots précédents (`schemas-land-leases.ts`,
 * `schemas-salaries.ts`) : le contrôleur n'appelle jamais que `.parse`,
 * jamais `.safeParse` suivi d'un abandon silencieux, pour qu'une entrée
 * invalide devienne toujours un 400 via le middleware central.
 *
 * ---------------------------------------------------------------------------
 * `.strict()` partout où le chemin porte déjà un identifiant
 * ---------------------------------------------------------------------------
 *
 * Quatre créations des lots 2 et 3 échouaient en 400 contre le vrai serveur
 * parce que leur corps répétait un identifiant que le chemin portait déjà
 * (`fix(finance): quatre creations echouaient en 400 contre le vrai serveur`).
 * Ici, `createContractorContractSchema` ne porte pas `contractorId` (il vient
 * de `POST contractors/:contractorId/contracts`), `createProgressStatementSchema`
 * ne porte pas `contractId` (il vient de `POST
 * contractor-contracts/:contractId/statements`), et `createContractorPaymentSchema`
 * ne porte pas `contractorId` (même raison, `POST
 * contractors/:contractorId/payments`). Tous les trois sont `.strict()` : un
 * corps qui enverrait quand même l'identifiant échoue en 400 avec un message
 * explicite, plutôt que d'être silencieusement retiré par le comportement par
 * défaut de Zod.
 */

export const uuidPathParamSchema = sharedUuidPathParamSchema;

/**
 * `z.coerce.boolean()` transformerait `?onlyActive=false` en `true` : toute
 * chaîne non vide est « truthy ». On accepte donc explicitement les deux
 * chaînes littérales en plus du booléen déjà typé (même détour qu'aux
 * sous-lots précédents).
 */
const booleanQueryParam = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .optional()
  .transform(value => (typeof value === 'string' ? value === 'true' : value));

// ---------------------------------------------------------------------------
// GET contractors
// ---------------------------------------------------------------------------

export const listContractorsQuerySchema = z
  .object({
    onlyActive: booleanQueryParam
  })
  .strict();

export type ListContractorsQuery = z.infer<typeof listContractorsQuerySchema>;

// ---------------------------------------------------------------------------
// POST contractors
// ---------------------------------------------------------------------------

export const createContractorSchema = z
  .object({
    fullName: z.string().min(1, 'Le nom complet du tâcheron est obligatoire.'),
    trade: z.string().min(1, 'Le corps de métier ne peut pas être une chaîne vide.').nullable().optional()
  })
  .strict();

export type CreateContractorInput = z.infer<typeof createContractorSchema>;

// ---------------------------------------------------------------------------
// GET contractor-contracts — liste transversale, filtrée en query
// (contractorId, siteId), jamais par le chemin : cette route n'appartient à
// aucun des deux (contrat, tableau des routes).
// ---------------------------------------------------------------------------

export const listContractorContractsQuerySchema = z
  .object({
    contractorId: z.string().uuid('Identifiant de tâcheron invalide.').optional(),
    siteId: z.string().uuid('Identifiant de chantier invalide.').optional()
  })
  .strict();

export type ListContractorContractsQuery = z.infer<typeof listContractorContractsQuerySchema>;

// ---------------------------------------------------------------------------
// POST contractors/:contractorId/contracts
//
// `contractorId` n'apparaît PAS ici : il vient du chemin (voir l'en-tête).
// ---------------------------------------------------------------------------

export const createContractorContractSchema = z
  .object({
    siteId: z.string().uuid('Identifiant de chantier invalide.'),
    // Exigé, jamais deviné : voir `CreateContractorContractTx.costCategoryId`
    // (types-lot4-contractors.ts) et `contractors.ts`, `createContractorContractTx`.
    costCategoryId: z.string().uuid('Identifiant de poste de dépense invalide.'),
    reference: z.string().min(1, 'La référence du marché est obligatoire.'),
    agreedAmount: z.number().positive('Le montant convenu du marché doit être strictement positif.'),
    signedDate: z.coerce.date({ errorMap: () => ({ message: 'Date de signature du marché invalide.' }) })
  })
  .strict();

export type CreateContractorContractInput = z.infer<typeof createContractorContractSchema>;

// ---------------------------------------------------------------------------
// POST contractor-contracts/:contractId/statements
//
// `contractId` n'apparaît PAS ici : il vient du chemin (voir l'en-tête). La
// description est obligatoire — voir le contrat, `CreateProgressStatementTx`.
// ---------------------------------------------------------------------------

export const createProgressStatementSchema = z
  .object({
    statementDate: z.coerce.date({ errorMap: () => ({ message: 'Date de situation invalide.' }) }),
    // Positif, jamais borné par le marché : un dépassement est accepté, pas
    // refusé (contrat, en-tête). La borne « > 0 » n'est qu'une contrainte de
    // forme, la seule que ce niveau doit poser.
    amount: z.number().positive('Le montant de la situation doit être strictement positif.'),
    description: z.string().min(1, 'La description de la situation est obligatoire.')
  })
  .strict();

export type CreateProgressStatementInput = z.infer<typeof createProgressStatementSchema>;

// ---------------------------------------------------------------------------
// POST contractors/:contractorId/payments
//
// `contractorId` n'apparaît PAS ici : il vient du chemin (voir l'en-tête).
// Sans affectation à des situations précises (contrat, `CreateContractorPaymentTx`).
// ---------------------------------------------------------------------------

export const createContractorPaymentSchema = z
  .object({
    paymentDate: z.coerce.date({ errorMap: () => ({ message: 'Date de règlement invalide.' }) }),
    amount: z.number().positive('Le montant du règlement doit être strictement positif.')
  })
  .strict();

export type CreateContractorPaymentInput = z.infer<typeof createContractorPaymentSchema>;
