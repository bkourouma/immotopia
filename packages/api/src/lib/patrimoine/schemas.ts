import { z } from 'zod';
import { httpUrl } from '../safe-url';

const uuidSchema = z.string().uuid();

const WORK_PROGRAM_STATUSES = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;

export const createValuationSchema = z.object({
  valuatedAt: z.coerce.date(),
  estimatedValue: z.number().positive(),
  currency: z.string().default('XOF'),
  acquisitionCost: z.number().positive().optional(),
  acquisitionDate: z.coerce.date().optional(),
  method: z.enum(['MANUAL', 'MARKET_ESTIMATE', 'EXPERT_APPRAISAL']).default('MANUAL'),
  notes: z.string().optional()
});

export const updateValuationSchema = createValuationSchema.partial().refine(value => Object.keys(value).length > 0, {
  message: 'Au moins un champ est requis pour la mise a jour de la valorisation'
});

export const createLoanSchema = z.object({
  lender: z.string().min(2),
  capitalAmount: z.number().positive(),
  remainingCapital: z.number().positive(),
  // Un pret a taux zero (pret familial, pret employeur) est un cas reel.
  interestRate: z.number().nonnegative(),
  monthlyPayment: z.number().positive(),
  currency: z.string().default('XOF'),
  startDate: z.coerce.date(),
  endDate: z.coerce.date()
});

export const updateLoanSchema = createLoanSchema
  .extend({
    status: z.enum(['ACTIVE', 'CLOSED', 'DEFAULTED']).optional()
  })
  .partial()
  .refine(value => Object.keys(value).length > 0, {
    message: 'Au moins un champ est requis pour la mise a jour du pret'
  });

export const createExpenseSchema = z.object({
  category: z.enum([
    'PROPERTY_TAX',
    'CONDO_FEES',
    'INSURANCE',
    'ROUTINE_MAINTENANCE',
    'RENOVATION',
    'MANAGEMENT_FEES',
    'UTILITIES',
    'OTHER'
  ]),
  label: z.string().min(2),
  amount: z.number().positive(),
  currency: z.string().default('XOF'),
  paidAt: z.coerce.date(),
  isCapitalized: z.boolean().default(false),
  receiptUrl: httpUrl().optional(),
  notes: z.string().optional(),
  /** Lot 10 : moyen et compte de paiement reels. Absent : caisse par defaut. */
  paymentMethod: z.enum(['MOBILE_MONEY', 'BANK_TRANSFER', 'CASH', 'CHECK', 'CARD', 'OTHER']).optional().nullable(),
  treasuryAccountId: z.string().uuid().optional().nullable(),
  agencyIsBuyer: z.boolean().optional(),
  supplierName: z.string().optional().nullable(),
  /**
   * Plan de tresorerie (spec 030) : ONE_OFF (defaut) = depense ponctuelle ;
   * sinon les occurrences tombent a `paidAt + k x pas`. La coherence entre
   * `recurrence`, `recurrenceEndDate` et `paidAt` est verifiee par
   * `assertExpenseRecurrence` (queries.ts), qui voit aussi la valeur stockee.
   */
  recurrence: z.enum(['ONE_OFF', 'MONTHLY', 'QUARTERLY', 'ANNUAL']).default('ONE_OFF'),
  recurrenceEndDate: z.coerce.date().optional().nullable()
});

export const updateExpenseSchema = createExpenseSchema.partial().refine(value => Object.keys(value).length > 0, {
  message: 'Au moins un champ est requis pour la mise a jour de la depense'
});

export const createWorkProgramSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  estimatedCost: z.number().positive(),
  currency: z.string().default('XOF'),
  plannedDate: z.coerce.date(),
  isCapitalized: z.boolean().default(false)
});

// `actualCost` reste accepte ici a la forme : Zod ne connait que la requete,
// jamais l'etat existant en base d'un enregistrement precis. Le refus reel
// (409, conflit d'etat et non entree malformee) s'applique dans
// `updatePropertyWorkProgram` (lib/patrimoine/queries.ts), qui verifie si le
// programme vise porte deja un `constructionSiteId` -- des lors que le lien
// existe, son cout reel est derive du chantier (FR-024, `syncWorkProgramCostTx`
// dans lib/finance/cost-allocation.ts) et cesse d'etre saisissable. Sans lien,
// la saisie reste permise, inchangee.
export const updateWorkProgramSchema = createWorkProgramSchema
  .extend({
    actualCost: z.number().nonnegative().optional(),
    completedDate: z.coerce.date().optional(),
    status: z.enum(WORK_PROGRAM_STATUSES).optional()
  })
  .partial()
  .refine(value => Object.keys(value).length > 0, {
    message: 'Au moins un champ est requis pour la mise a jour du programme de travaux'
  });

/** Voir US12 / FR-024 : pose ou retire le lien vers un chantier financier. */
export const linkWorkProgramConstructionSiteSchema = z.object({
  constructionSiteId: uuidSchema.nullable()
});

export const generateStatementSchema = z.object({
  ownerContactId: uuidSchema,
  period: z.string().regex(/^\d{4}-\d{2}$/),
  propertyIds: z.array(uuidSchema).min(1)
});

export const updateStatementSchema = z
  .object({
    status: z.enum(['DRAFT', 'SENT', 'PAID']).optional(),
    paidAt: z.coerce.date().optional()
  })
  .refine(value => Object.keys(value).length > 0, {
    message: 'Au moins un champ est requis pour la mise a jour du releve'
  });

// Taux de croissance negatifs admis jusqu'a -50 % : un marche qui baisse ou
// un loyer renegocie a la baisse sont des hypotheses legitimes.
// Bornes factorisees : la requete (coercion de chaines) et le corps du PUT
// des hypotheses enregistrees (nombres JSON) partagent les memes regles.
const YEARS_RULE = (schema: z.ZodNumber) => schema.int().min(1).max(30);
const GROWTH_RULE = (schema: z.ZodNumber) => schema.min(-0.5).max(1);
const VACANCY_RULE = (schema: z.ZodNumber) => schema.min(0).max(1);

export const PROJECTION_DEFAULTS = {
  years: 10,
  valueGrowthRate: 0.03,
  rentGrowthRate: 0.02,
  expenseGrowthRate: 0.025,
  vacancyRate: 0.05
} as const;

export const projectionQuerySchema = z.object({
  years: YEARS_RULE(z.coerce.number()).default(PROJECTION_DEFAULTS.years),
  valueGrowthRate: GROWTH_RULE(z.coerce.number()).default(PROJECTION_DEFAULTS.valueGrowthRate),
  rentGrowthRate: GROWTH_RULE(z.coerce.number()).default(PROJECTION_DEFAULTS.rentGrowthRate),
  expenseGrowthRate: GROWTH_RULE(z.coerce.number()).default(PROJECTION_DEFAULTS.expenseGrowthRate),
  vacancyRate: VACANCY_RULE(z.coerce.number()).default(PROJECTION_DEFAULTS.vacancyRate)
});

/** Surcharges de requete : memes regles, mais un champ absent reste `undefined` (pas de defaut). */
export const projectionOverridesSchema = projectionQuerySchema.partial();

/**
 * `PUT .../yield/assumptions` : les cinq hypotheses sont obligatoires, nombres
 * JSON stricts (pas de coercion de chaine ; `z.number()` refuse NaN et
 * Infinity), aucun champ inconnu -- le `tenantId` du corps est donc refuse.
 */
export const yieldAssumptionsBodySchema = z
  .object({
    years: YEARS_RULE(z.number()),
    valueGrowthRate: GROWTH_RULE(z.number()),
    rentGrowthRate: GROWTH_RULE(z.number()),
    expenseGrowthRate: GROWTH_RULE(z.number()),
    vacancyRate: VACANCY_RULE(z.number())
  })
  .strict();

/** `GET .../patrimoine/export` (agence ou bien) : format obligatoire, PDF ou Excel. */
export const exportQuerySchema = z.object({
  format: z.enum(['pdf', 'xlsx'], { errorMap: () => ({ message: "Format attendu : 'pdf' ou 'xlsx'" }) })
});

/**
 * `GET /tenants/:tenantId/work-programs`. `upcoming=true` ne garde que les
 * programmes planifies ou en cours, par date prevue croissante.
 */
export const listTenantWorkProgramsQuerySchema = z.object({
  status: z
    .enum(WORK_PROGRAM_STATUSES, { errorMap: () => ({ message: 'Statut de programme de travaux inconnu' }) })
    .optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).optional(),
  upcoming: z
    .enum(['true', 'false'])
    .optional()
    .transform(value => value === 'true')
});
