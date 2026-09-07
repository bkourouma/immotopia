import { z } from 'zod';

export const createSyndicateSchema = z.object({
  name: z.string().min(1, 'Le nom de la copropriete est obligatoire'),
  address: z.string().min(1, "L'adresse de la copropriete est obligatoire"),
  cadastralReference: z.string().optional(),
  totalLots: z.number().int().nonnegative().default(0),
  totalBuildings: z.number().int().positive().default(1)
});

export const updateSyndicateSchema = z
  .object({
    name: z.string().min(1, 'Le nom de la copropriete est obligatoire').optional(),
    address: z.string().min(1, "L'adresse de la copropriete est obligatoire").optional(),
    cadastralReference: z.string().nullable().optional(),
    totalLots: z.number().int().nonnegative().optional(),
    totalBuildings: z.number().int().positive().optional(),
    status: z.enum(['ACTIVE', 'IN_LIQUIDATION', 'IN_DISPUTE']).optional(),
    regulationDocUrl: z.string().url('Le lien du reglement doit etre une URL valide').nullable().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Au moins un champ doit etre fourni pour la mise a jour'
  });

export const createLotSchema = z.object({
  syndicateId: z.string().uuid(),
  propertyId: z.string().uuid().optional(),
  ownerContactId: z.string().uuid().optional(),
  lotNumber: z.string().min(1, 'Le numero de lot est obligatoire'),
  lotType: z.enum(['APARTMENT', 'PARKING', 'CELLAR', 'OFFICE', 'COMMERCIAL', 'OTHER']),
  generalShares: z.number().int().positive(),
  specialShares: z.number().int().positive().optional(),
  ownerSince: z.coerce.date().optional()
});

export const createChargeCallSchema = z.object({
  syndicateId: z.string().uuid(),
  lotId: z.string().uuid(),
  period: z.string().min(1, 'La periode est obligatoire'),
  amount: z.number().positive(),
  currency: z.string().default('XOF'),
  dueDate: z.coerce.date()
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
  location: z.string().optional()
});

export const createResolutionSchema = z.object({
  meetingId: z.string().uuid(),
  title: z.string().min(1, 'Le titre de la resolution est obligatoire'),
  description: z.string().optional(),
  majorityRule: z.string().optional()
});

export const castVoteSchema = z.object({
  resolutionId: z.string().uuid(),
  lotId: z.string().uuid(),
  vote: z.enum(['FOR', 'AGAINST', 'ABSTAIN'])
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

export type CreateSyndicateInput = z.infer<typeof createSyndicateSchema>;
export type UpdateSyndicateInput = z.infer<typeof updateSyndicateSchema>;
export type CreateLotInput = z.infer<typeof createLotSchema>;
export type CreateChargeCallInput = z.infer<typeof createChargeCallSchema>;
export type CreateChargePaymentInput = z.infer<typeof createChargePaymentSchema>;
export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;
export type CreateResolutionInput = z.infer<typeof createResolutionSchema>;
export type CastVoteInput = z.infer<typeof castVoteSchema>;
export type CreateContractInput = z.infer<typeof createContractSchema>;
