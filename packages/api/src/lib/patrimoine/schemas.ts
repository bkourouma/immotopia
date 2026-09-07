import { z } from 'zod';

const uuidSchema = z.string().uuid();

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
  interestRate: z.number().positive(),
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
  receiptUrl: z.string().url().optional(),
  notes: z.string().optional()
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

export const updateWorkProgramSchema = createWorkProgramSchema
  .extend({
    actualCost: z.number().nonnegative().optional(),
    completedDate: z.coerce.date().optional(),
    status: z.enum(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional()
  })
  .partial()
  .refine(value => Object.keys(value).length > 0, {
    message: 'Au moins un champ est requis pour la mise a jour du programme de travaux'
  });

export const createDocumentSchema = z.object({
  title: z.string().min(2),
  type: z.enum([
    'TITLE_DEED',
    'NOTARIAL_DEED',
    'TAX_DOCUMENT',
    'INSURANCE',
    'TECHNICAL_DIAGNOSIS',
    'FLOOR_PLAN',
    'BUILDING_PERMIT',
    'OTHER'
  ]),
  fileUrl: z.string().url(),
  expiresAt: z.coerce.date().optional(),
  ownerContactId: uuidSchema.optional()
});

export const updateDocumentSchema = createDocumentSchema.partial().refine(value => Object.keys(value).length > 0, {
  message: 'Au moins un champ est requis pour la mise a jour du document'
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

export const projectionQuerySchema = z.object({
  years: z.coerce.number().int().min(1).max(30).default(10),
  valueGrowthRate: z.coerce.number().min(0).max(1).default(0.03),
  rentGrowthRate: z.coerce.number().min(0).max(1).default(0.02),
  expenseGrowthRate: z.coerce.number().min(0).max(1).default(0.025),
  vacancyRate: z.coerce.number().min(0).max(1).default(0.05)
});

