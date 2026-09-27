import { z } from 'zod';
import { checkPeriodBounds, periodBoundsFields } from './charge-allocation-schemas';
import { httpUrl } from '../safe-url';

const uuidSchema = z.string().uuid();

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20)
});

export const dateRangeQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional()
  })
  .refine(value => !value.from || !value.to || value.from <= value.to, {
    message: 'La date de debut doit etre inferieure ou egale a la date de fin'
  });

export const createSyndicateSchema = z.object({
  propertyId: z.string().uuid().optional(),
  name: z
    .string()
    .min(1, 'Le nom de la copropriete est obligatoire')
    .max(200, 'Le nom de la copropriete ne doit pas depasser 200 caracteres'),
  address: z
    .string()
    .min(1, "L'adresse de la copropriete est obligatoire")
    .max(500, "L'adresse de la copropriete ne doit pas depasser 500 caracteres")
    .optional(),
  registrationNo: z.string().max(100, "Le numero d'immatriculation ne doit pas depasser 100 caracteres").optional(),
  fiscalYear: z.number().int().min(1).max(12).optional().default(1),
  syndicManagerId: z.string().uuid().optional(),
  cadastralReference: z.string().max(100, 'La reference cadastrale ne doit pas depasser 100 caracteres').optional(),
  totalLots: z.number().int().nonnegative().default(0),
  totalBuildings: z.number().int().positive().default(1),
  // Lot S1 : agence mandante (facultative) dont l'identite figure sur les documents.
  mandatingAgencyId: z.string().uuid().nullable().optional()
});

export const updateSyndicateSchema = z
  .object({
    propertyId: z.string().uuid().optional(),
    name: z
      .string()
      .min(1, 'Le nom de la copropriete est obligatoire')
      .max(200, 'Le nom de la copropriete ne doit pas depasser 200 caracteres')
      .optional(),
    address: z
      .string()
      .min(1, "L'adresse de la copropriete est obligatoire")
      .max(500, "L'adresse de la copropriete ne doit pas depasser 500 caracteres")
      .optional(),
    registrationNo: z
      .string()
      .max(100, "Le numero d'immatriculation ne doit pas depasser 100 caracteres")
      .nullable()
      .optional(),
    fiscalYear: z.number().int().min(1).max(12).optional(),
    syndicManagerId: z.string().uuid().nullable().optional(),
    cadastralReference: z
      .string()
      .max(100, 'La reference cadastrale ne doit pas depasser 100 caracteres')
      .nullable()
      .optional(),
    totalLots: z.number().int().nonnegative().optional(),
    totalBuildings: z.number().int().positive().optional(),
    status: z.enum(['ACTIVE', 'IN_LIQUIDATION', 'IN_DISPUTE']).optional(),
    regulationDocUrl: httpUrl('Le lien du reglement doit etre une URL valide').nullable().optional(),
    // Lot S1 : null detache la copropriete de son mandant.
    mandatingAgencyId: z.string().uuid().nullable().optional()
  })
  .refine(value => Object.keys(value).length > 0, {
    message: 'Au moins un champ doit etre fourni pour la mise a jour'
  });

export const createLotSchema = z.object({
  syndicateId: z.string().uuid(),
  // Facultatif : un lot de copropriete (parking, cave...) peut exister sans
  // bien lie, cree directement au niveau de la copropriete (voir le modele
  // Prisma SyndicateLot.propertyId, deja optionnel, et
  // docs/recette/SCENARIO_SYNDIC_ABONNEMENT.md, MC1). Seuls les lots
  // principaux (Appartement, Bureau, Commercial) comptent dans le quota de
  // lots, que le bien soit renseigne ou non (voir lot-registry-service.ts).
  propertyId: z.string().uuid().optional(),
  coownerId: z.string().uuid().optional(),
  lotNumber: z.string().min(1, 'Le numero de lot est obligatoire'),
  lotType: z.enum(['APARTMENT', 'PARKING', 'CELLAR', 'OFFICE', 'COMMERCIAL', 'OTHER']),
  tantiemes: z.number().positive(),
  surface: z.number().positive().optional(),
  floor: z.number().int().optional(),
  isParkingIncluded: z.boolean().optional().default(false)
});

export const importLotsFromPropertiesSchema = z.object({
  propertyIds: z.array(uuidSchema).min(1, 'Au moins une propriete doit etre selectionnee')
});

export const updateLotSchema = z
  .object({
    propertyId: z.string().uuid().nullable().optional(),
    coownerId: z.string().uuid().nullable().optional(),
    lotNumber: z.string().min(1, 'Le numero de lot est obligatoire').optional(),
    lotType: z.enum(['APARTMENT', 'PARKING', 'CELLAR', 'OFFICE', 'COMMERCIAL', 'OTHER']).optional(),
    tantiemes: z.number().positive().optional(),
    surface: z.number().positive().nullable().optional(),
    floor: z.number().int().nullable().optional(),
    isParkingIncluded: z.boolean().optional()
  })
  .refine(value => Object.keys(value).length > 0, {
    message: 'Au moins un champ doit etre fourni pour la mise a jour du lot'
  });

export const createChargeCallSchema = z
  .object({
    syndicateId: z.string().uuid(),
    lotId: z.string().uuid().optional(),
    lotIds: z.array(z.string().uuid()).optional(),
    applyToAllLots: z.boolean().optional().default(false),
    period: z.string().min(1, 'La periode est obligatoire'),
    // Lot S2 : bornes facultatives ; deduites du libelle quand elles manquent.
    ...periodBoundsFields,
    amount: z.number().positive(),
    currency: z.string().default('XOF'),
    dueDate: z.coerce.date(),
    isRecurring: z.boolean().optional().default(false),
    recurrenceFrequency: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL']).optional(),
    recurrenceCount: z.number().int().min(1).max(24).optional()
  })
  .superRefine((value, ctx) => {
    checkPeriodBounds(value, ctx);
    if (!value.applyToAllLots && !value.lotId && (!value.lotIds || value.lotIds.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Selectionnez un lot, plusieurs lots ou tous les lots',
        path: ['lotId']
      });
    }

    if (value.isRecurring && !value.recurrenceFrequency) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La frequence de recurrence est obligatoire',
        path: ['recurrenceFrequency']
      });
    }
  });

export const createChargePaymentSchema = z.object({
  chargeCallId: z.string().uuid(),
  amount: z.number().positive(),
  paidAt: z.coerce.date(),
  method: z.string().optional(),
  reference: z.string().optional()
});

export const createMeetingSchema = z.object({
  syndicateId: z.string().uuid(),
  type: z.enum(['ORDINARY', 'EXTRAORDINARY']),
  scheduledAt: z.coerce.date(),
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional(),
  location: z.string().optional()
});

export const meetingStatusSchema = z.enum(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']);

export const updateMeetingSchema = z
  .object({
    startTime: z.coerce.date().nullable().optional(),
    endTime: z.coerce.date().nullable().optional(),
    location: z.string().nullable().optional(),
    // Transition de statut (ouverture, cloture, annulation) : la coherence de la
    // transition est controlee par le service, qui repond 409 sinon.
    status: meetingStatusSchema.optional()
  })
  .refine(value => Object.keys(value).length > 0, {
    message: 'Au moins un champ doit etre fourni pour la mise a jour de l assemblee'
  });

export const createResolutionSchema = z.object({
  meetingId: z.string().uuid(),
  title: z.string().min(1, 'Le titre de la resolution est obligatoire'),
  description: z.string().optional(),
  majorityRule: z.string().optional()
});

export const createMeetingProxySchema = z.object({
  meetingId: z.string().uuid(),
  grantorContactId: z.string().min(1, 'Le mandant est obligatoire'),
  representativeContactId: z.string().min(1, 'Le mandataire est obligatoire')
});

export const castVoteSchema = z.object({
  resolutionId: z.string().uuid(),
  lotId: z.string().uuid(),
  vote: z.enum(['FOR', 'AGAINST', 'ABSTAIN'])
});

export const createAgendaItemSchema = z.object({
  meetingId: z.string().uuid(),
  title: z.string().min(1, "Le titre du point d'ordre du jour est obligatoire"),
  orderIndex: z.number().int().positive().optional(),
  discussions: z.array(z.string().min(1)).optional().default([])
});

export const updateAgendaItemSchema = z
  .object({
    title: z.string().min(1, "Le titre du point d'ordre du jour est obligatoire").optional(),
    orderIndex: z.number().int().positive().optional(),
    discussions: z.array(z.string().min(1)).optional()
  })
  .refine(value => Object.keys(value).length > 0, {
    message: "Au moins un champ doit etre fourni pour la mise a jour du point d'ordre du jour"
  });

export const createServiceProviderSchema = z.object({
  name: z.string().min(1, 'Le nom du prestataire est obligatoire'),
  specialty: z.string().min(1).optional(),
  email: z.string().email("L'email du prestataire doit etre valide").optional(),
  phone: z.string().optional()
});

export const updateServiceProviderSchema = z
  .object({
    name: z.string().min(1, 'Le nom du prestataire est obligatoire').optional(),
    specialty: z.string().nullable().optional(),
    email: z.string().email("L'email du prestataire doit etre valide").nullable().optional(),
    phone: z.string().nullable().optional()
  })
  .refine(value => Object.keys(value).length > 0, {
    message: 'Au moins un champ doit etre fourni pour la mise a jour du prestataire'
  });

export const createContractSchema = z.object({
  syndicateId: z.string().uuid(),
  providerId: z.string().uuid(),
  nature: z.string().min(1, 'La nature du contrat est obligatoire'),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  annualAmount: z.number().positive().optional(),
  currency: z.string().default('XOF'),
  renewalAlertDays: z.number().int().nonnegative().default(30)
});

export const createDocumentSchema = z.object({
  syndicateId: z.string().uuid(),
  title: z.string().min(1, 'Le titre du document est obligatoire'),
  type: z.enum(['REGULATION', 'GENERAL_MEETING_MINUTES', 'DIAGNOSTIC', 'INSURANCE', 'BUDGET', 'OTHER']),
  fileUrl: httpUrl('Le lien du document doit etre une URL valide').optional(),
  expiresAt: z.coerce.date().optional()
});

export const createLotTenantAssignmentSchema = z.object({
  tenantId: uuidSchema,
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  leaseId: uuidSchema.optional(),
  notes: z.string().optional()
});

export const linkMaintenanceRequestSchema = z.object({
  maintenanceRequestId: uuidSchema,
  lotId: uuidSchema.optional(),
  isCommonArea: z.boolean().optional().default(false),
  costImputation: z.enum(['SYNDICATE', 'LOT_OWNER', 'LOT_TENANT', 'MIXED']).optional().default('SYNDICATE'),
  imputationDetail: z.string().optional()
});

export const linkMaintenanceContractSchema = z.object({
  maintenanceContractId: uuidSchema,
  scope: z.string().optional(),
  budgetLineItemId: uuidSchema.optional()
});

export const updateContractSchema = z
  .object({
    providerId: z.string().uuid().optional(),
    nature: z.string().min(1, 'La nature du contrat est obligatoire').optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().nullable().optional(),
    annualAmount: z.number().positive().nullable().optional(),
    currency: z.string().optional(),
    renewalAlertDays: z.number().int().nonnegative().optional(),
    status: z.enum(['ACTIVE', 'EXPIRED', 'TERMINATED']).optional()
  })
  .refine(value => Object.keys(value).length > 0, {
    message: 'Au moins un champ doit etre fourni pour la mise a jour du contrat'
  });

export const createChargeCallBatchSchema = z
  .object({
    syndicateId: uuidSchema,
    label: z.string().min(1, 'Le libelle du batch est obligatoire'),
    period: z.string().min(1, 'La periode est obligatoire'),
    ...periodBoundsFields,
    dueDate: z.coerce.date(),
    batchType: z.enum(['REGULAR', 'EXCEPTIONAL']),
    budgetId: uuidSchema.optional(),
    totalAmount: z.number().positive(),
    currency: z.string().default('XOF')
  })
  .superRefine(checkPeriodBounds);

export const createReminderSchema = z.object({
  chargeCallId: uuidSchema,
  lotId: uuidSchema,
  reminderLevel: z.number().int().min(1).max(4),
  sentAt: z.coerce.date(),
  channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP', 'PUSH']),
  status: z.enum(['SENT', 'DELIVERED', 'FAILED']),
  responseAction: z.string().optional()
});

export const createPenaltySchema = z.object({
  chargeCallId: uuidSchema,
  lotId: uuidSchema,
  daysLate: z.number().int().nonnegative(),
  penaltyRate: z.number().positive(),
  penaltyAmount: z.number().nonnegative(),
  appliedAt: z.coerce.date(),
  waived: z.boolean().optional().default(false),
  waivedReason: z.string().optional()
});

export const createPaymentScheduleSchema = z.object({
  chargeCallId: uuidSchema,
  lotId: uuidSchema,
  agreedAt: z.coerce.date(),
  totalAmount: z.number().positive(),
  instalments: z
    .array(
      z.object({
        dueDate: z.coerce.date(),
        amount: z.number().positive()
      })
    )
    .min(1, 'Au moins une echeance est requise')
});

export const createBudgetSchema = z.object({
  syndicateId: uuidSchema,
  fiscalYear: z.number().int().min(2000),
  label: z.string().min(1),
  totalAmount: z.number().positive(),
  currency: z.string().default('XOF'),
  lines: z
    .array(
      z.object({
        category: z.string().min(1),
        description: z.string().min(1),
        amountForecast: z.number().positive(),
        distributionKey: z.enum(['GENERAL_SHARES', 'SPECIAL_SHARES', 'EQUAL', 'MANUAL']),
        accountId: uuidSchema.optional()
      })
    )
    .min(1, 'Au moins une ligne budgetaire est requise')
});

export const updateBudgetSchema = z
  .object({
    label: z.string().min(1).optional(),
    status: z.enum(['DRAFT', 'APPROVED', 'REVISED', 'CLOSED']).optional(),
    approvedByResolutionId: uuidSchema.nullable().optional(),
    totalAmount: z.number().positive().optional()
  })
  .refine(value => Object.keys(value).length > 0, {
    message: 'Au moins un champ doit etre fourni pour la mise a jour du budget'
  });

export const generateBudgetChargeCallsSchema = z
  .object({
    label: z.string().min(1, 'Le libelle du batch est obligatoire'),
    period: z.string().min(1, 'La periode est obligatoire'),
    ...periodBoundsFields,
    dueDate: z.coerce.date(),
    batchType: z.enum(['REGULAR', 'EXCEPTIONAL']),
    currency: z.string().default('XOF'),
    // Lot S4 : quote-part annuelle divisee par le nombre de periodes (defaut 1 = annee entiere).
    periodsPerYear: z
      .number()
      .int()
      .refine(value => [1, 2, 4, 12].includes(value), 'Nombre de periodes par an attendu : 1, 2, 4 ou 12')
      .default(1),
    periodIndex: z.number().int().min(1).max(12).optional()
  })
  .superRefine((value, ctx) => {
    checkPeriodBounds(value, ctx);
    if (value.periodIndex !== undefined && value.periodIndex > value.periodsPerYear) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Le rang de la periode depasse le nombre de periodes par an',
        path: ['periodIndex']
      });
    }
  });

export const budgetListQuerySchema = z.object({
  fiscalYear: z.coerce.number().int().min(2000).optional(),
  status: z.enum(['DRAFT', 'APPROVED', 'REVISED', 'CLOSED']).optional()
});

export const createJournalEntrySchema = z
  .object({
    journalId: uuidSchema,
    entryDate: z.coerce.date(),
    reference: z.string().min(1),
    description: z.string().min(1),
    sourceType: z.enum(['CHARGE_PAYMENT', 'MANUAL', 'PENALTY', 'FUND']),
    sourceId: z.string().optional(),
    lines: z
      .array(
        z.object({
          accountId: uuidSchema,
          lotId: uuidSchema.optional(),
          debit: z.number().nonnegative().default(0),
          credit: z.number().nonnegative().default(0),
          label: z.string().min(1)
        })
      )
      .min(2, 'Une ecriture doit contenir au moins 2 lignes')
  })
  .refine(value => value.lines.some(line => (line.debit ?? 0) > 0), {
    message: 'Au moins une ligne debit > 0 est requise'
  })
  .refine(value => value.lines.some(line => (line.credit ?? 0) > 0), {
    message: 'Au moins une ligne credit > 0 est requise'
  });

export const createIncidentSchema = z.object({
  syndicateId: uuidSchema,
  reportedByContactId: uuidSchema,
  lotId: uuidSchema.optional(),
  assetId: uuidSchema.optional(),
  incidentType: z.enum(['BREAKDOWN', 'LEAK', 'VANDALISM', 'SAFETY', 'OTHER']),
  description: z.string().min(1),
  urgency: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  reportedAt: z.coerce.date().optional()
});

export const createIncidentImputationSchema = z.object({
  incidentId: uuidSchema,
  imputationType: z.enum(['SYNDICATE_BUDGET', 'INSURANCE', 'LOT_OWNER', 'THIRD_PARTY']),
  amount: z.number().positive(),
  currency: z.string().default('XOF'),
  budgetLineId: uuidSchema.optional(),
  lotId: uuidSchema.optional(),
  contractId: uuidSchema.optional(),
  notes: z.string().optional()
});

export const updateIncidentSchema = z
  .object({
    status: z.enum(['REPORTED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
    providerId: uuidSchema.nullable().optional(),
    resolvedAt: z.coerce.date().nullable().optional(),
    description: z.string().min(1).optional()
  })
  .refine(value => Object.keys(value).length > 0, {
    message: 'Au moins un champ doit etre fourni pour la mise a jour de l incident'
  });

export const createLotOwnerProfileSchema = z.object({
  lotId: uuidSchema,
  contactId: uuidSchema,
  ownershipPercentage: z.number().positive().max(100),
  ownedSince: z.coerce.date(),
  ownedUntil: z.coerce.date().optional(),
  portalAccessEnabled: z.boolean().optional().default(false),
  notificationPrefs: z.record(z.any()).optional(),
  isActive: z.boolean().optional().default(true)
});

export const updateLotOwnerProfileSchema = z
  .object({
    ownershipPercentage: z.number().positive().max(100).optional(),
    ownedSince: z.coerce.date().optional(),
    ownedUntil: z.coerce.date().nullable().optional(),
    portalAccessEnabled: z.boolean().optional(),
    notificationPrefs: z.record(z.any()).nullable().optional(),
    isActive: z.boolean().optional()
  })
  .refine(value => Object.keys(value).length > 0, {
    message: 'Au moins un champ doit etre fourni pour la mise a jour du profil proprietaire'
  });

export const createLotTenantProfileSchema = z.object({
  lotId: uuidSchema,
  contactId: uuidSchema,
  leaseId: uuidSchema.optional(),
  tenantSince: z.coerce.date(),
  tenantUntil: z.coerce.date().optional(),
  chargesBilledToTenant: z.boolean().optional().default(false),
  isCurrent: z.boolean().optional().default(true)
});

export const updateLotTenantProfileSchema = z
  .object({
    leaseId: uuidSchema.nullable().optional(),
    tenantSince: z.coerce.date().optional(),
    tenantUntil: z.coerce.date().nullable().optional(),
    chargesBilledToTenant: z.boolean().optional(),
    isCurrent: z.boolean().optional()
  })
  .refine(value => Object.keys(value).length > 0, {
    message: 'Au moins un champ doit etre fourni pour la mise a jour du profil locataire'
  });

export const createManualReminderSchema = z.object({
  reminderLevel: z.number().int().min(1).max(4).optional().default(1),
  channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP', 'PUSH']).optional().default('EMAIL'),
  sentAt: z.coerce.date().optional(),
  status: z.enum(['SENT', 'DELIVERED', 'FAILED']).optional().default('SENT'),
  responseAction: z.string().optional()
});

export const createPenaltyRequestSchema = z.object({
  daysLate: z.number().int().nonnegative().optional(),
  penaltyRate: z.number().positive(),
  penaltyAmount: z.number().positive().optional(),
  appliedAt: z.coerce.date().optional(),
  waived: z.boolean().optional().default(false),
  waivedReason: z.string().optional()
});

export const waivePenaltySchema = z.object({
  waivedReason: z.string().min(1, 'Le motif de remise est obligatoire')
});

export const createScheduleRequestSchema = z.object({
  agreedAt: z.coerce.date().optional(),
  totalAmount: z.number().positive(),
  instalments: z
    .array(
      z.object({
        dueDate: z.coerce.date(),
        amount: z.number().positive()
      })
    )
    .min(1, 'Au moins une echeance est requise')
});

export const createChartOfAccountSchema = z.object({
  accountNumber: z.string().min(1, 'Le numero de compte est obligatoire'),
  accountName: z.string().min(1, 'Le nom de compte est obligatoire'),
  accountClass: z.number().int().min(1).max(9),
  accountType: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']),
  isAuxiliary: z.boolean().optional().default(false),
  parentAccountId: uuidSchema.nullable().optional()
});

export const createAccountingJournalSchema = z.object({
  journalType: z.enum(['GENERAL', 'BANK', 'CASH', 'CHARGES']),
  label: z.string().min(1, 'Le libelle du journal est obligatoire'),
  code: z.string().min(1, 'Le code du journal est obligatoire'),
  fiscalYear: z.number().int().min(2000)
});

export const accountingEntriesQuerySchema = z
  .object({
    journalId: uuidSchema.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().max(100).optional().default(20)
  })
  .refine(value => !value.from || !value.to || value.from <= value.to, {
    message: 'La date de debut doit etre inferieure ou egale a la date de fin'
  });

export const lockJournalEntrySchema = z.object({
  lock: z.literal(true).default(true)
});

export const accountingRangeQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    accountId: uuidSchema.optional(),
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().max(100).optional().default(20)
  })
  .refine(value => !value.from || !value.to || value.from <= value.to, {
    message: 'La date de debut doit etre inferieure ou egale a la date de fin'
  });

export const ownerAccountStatementQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional()
  })
  .refine(value => !value.from || !value.to || value.from <= value.to, {
    message: 'La date de debut doit etre inferieure ou egale a la date de fin'
  });

export const createOwnerAccountAdjustmentSchema = z.object({
  direction: z.enum(['DEBIT', 'CREDIT']),
  amount: z.number().positive(),
  label: z.string().min(1, 'Le libelle est obligatoire'),
  reference: z.string().optional(),
  transactionDate: z.coerce.date().optional()
});

// FR-013 : fonds financiers de la copropriete (SyndicateFund).
export const createSyndicateFundSchema = z.object({
  name: z.string().min(1, 'Le nom du fonds est obligatoire'),
  initialBalance: z.number().nonnegative().optional().default(0),
  currency: z.string().min(1).optional().default('XOF')
});

export const renameSyndicateFundSchema = z.object({
  name: z.string().min(1, 'Le nom du fonds est obligatoire')
});

export const adjustSyndicateFundBalanceSchema = z.object({
  direction: z.enum(['CREDIT', 'DEBIT']),
  amount: z.number().positive(),
  reason: z.string().min(1, 'Le motif de l ajustement est obligatoire')
});

export type CreateSyndicateInput = z.infer<typeof createSyndicateSchema>;
export type UpdateSyndicateInput = z.infer<typeof updateSyndicateSchema>;
export type CreateLotInput = z.infer<typeof createLotSchema>;
export type ImportLotsFromPropertiesInput = z.infer<typeof importLotsFromPropertiesSchema>;
export type UpdateLotInput = z.infer<typeof updateLotSchema>;
export type CreateChargeCallInput = z.infer<typeof createChargeCallSchema>;
export type CreateChargePaymentInput = z.infer<typeof createChargePaymentSchema>;
export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;
export type UpdateMeetingInput = z.infer<typeof updateMeetingSchema>;
export type CreateResolutionInput = z.infer<typeof createResolutionSchema>;
export type CastVoteInput = z.infer<typeof castVoteSchema>;
export type CreateMeetingProxyInput = z.infer<typeof createMeetingProxySchema>;
export type CreateAgendaItemInput = z.infer<typeof createAgendaItemSchema>;
export type UpdateAgendaItemInput = z.infer<typeof updateAgendaItemSchema>;
export type CreateServiceProviderInput = z.infer<typeof createServiceProviderSchema>;
export type UpdateServiceProviderInput = z.infer<typeof updateServiceProviderSchema>;
export type CreateContractInput = z.infer<typeof createContractSchema>;
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type CreateLotTenantAssignmentInput = z.infer<typeof createLotTenantAssignmentSchema>;
export type LinkMaintenanceRequestInput = z.infer<typeof linkMaintenanceRequestSchema>;
export type LinkMaintenanceContractInput = z.infer<typeof linkMaintenanceContractSchema>;
export type UpdateContractInput = z.infer<typeof updateContractSchema>;
export type PaginationQueryInput = z.infer<typeof paginationQuerySchema>;
export type DateRangeQueryInput = z.infer<typeof dateRangeQuerySchema>;
export type CreateChargeCallBatchInput = z.infer<typeof createChargeCallBatchSchema>;
export type CreateReminderInput = z.infer<typeof createReminderSchema>;
export type CreatePenaltyInput = z.infer<typeof createPenaltySchema>;
export type CreatePaymentScheduleInput = z.infer<typeof createPaymentScheduleSchema>;
export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;
export type GenerateBudgetChargeCallsInput = z.infer<typeof generateBudgetChargeCallsSchema>;
export type BudgetListQueryInput = z.infer<typeof budgetListQuerySchema>;
export type CreateJournalEntryInput = z.infer<typeof createJournalEntrySchema>;
export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;
export type CreateIncidentImputationInput = z.infer<typeof createIncidentImputationSchema>;
export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;
export type CreateLotOwnerProfileInput = z.infer<typeof createLotOwnerProfileSchema>;
export type UpdateLotOwnerProfileInput = z.infer<typeof updateLotOwnerProfileSchema>;
export type CreateLotTenantProfileInput = z.infer<typeof createLotTenantProfileSchema>;
export type UpdateLotTenantProfileInput = z.infer<typeof updateLotTenantProfileSchema>;
export type CreateManualReminderInput = z.infer<typeof createManualReminderSchema>;
export type CreatePenaltyRequestInput = z.infer<typeof createPenaltyRequestSchema>;
export type WaivePenaltyInput = z.infer<typeof waivePenaltySchema>;
export type CreateScheduleRequestInput = z.infer<typeof createScheduleRequestSchema>;
export type CreateChartOfAccountInput = z.infer<typeof createChartOfAccountSchema>;
export type CreateAccountingJournalInput = z.infer<typeof createAccountingJournalSchema>;
export type AccountingEntriesQueryInput = z.infer<typeof accountingEntriesQuerySchema>;
export type LockJournalEntryInput = z.infer<typeof lockJournalEntrySchema>;
export type AccountingRangeQueryInput = z.infer<typeof accountingRangeQuerySchema>;
export type OwnerAccountStatementQueryInput = z.infer<typeof ownerAccountStatementQuerySchema>;
export type CreateOwnerAccountAdjustmentInput = z.infer<typeof createOwnerAccountAdjustmentSchema>;
export type CreateSyndicateFundInput = z.infer<typeof createSyndicateFundSchema>;
export type RenameSyndicateFundInput = z.infer<typeof renameSyndicateFundSchema>;
export type AdjustSyndicateFundBalanceInput = z.infer<typeof adjustSyndicateFundBalanceSchema>;
