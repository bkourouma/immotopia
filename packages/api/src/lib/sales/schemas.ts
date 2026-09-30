import {
  SaleCommissionMode,
  SaleCommissionPayer,
  SaleConditionStatus,
  SaleDepositHolder,
  SaleFinancing,
  SaleMandateType
} from '@prisma/client';
import { z } from 'zod';

/**
 * Schémas zod des corps de requête du lot 9.
 *
 * Le contrat (`lib/sales/types.ts`) fait foi pour les *formes* — celui-ci n'en
 * est que la validation. `SaleOfferAction` n'est pas un enum Prisma (voir
 * `types.ts`) : zod le valide par une liste littérale plus bas.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform(v => (v ? v : null));

const money = z.coerce.number().finite();
const positiveMoney = money.positive();
const percent = z.coerce.number().min(0).max(100);

export const createMandateSchema = z
  .object({
    propertyId: z.string().trim().min(1),
    sellerClientId: z.string().trim().min(1),
    mandateType: z.nativeEnum(SaleMandateType),
    askingPrice: positiveMoney,
    minimumPrice: money.positive().nullish(),
    commissionMode: z.nativeEnum(SaleCommissionMode),
    commissionRate: z.coerce.number().gt(0).max(20).nullish(),
    commissionFixedAmount: positiveMoney.nullish(),
    commissionPayer: z.nativeEnum(SaleCommissionPayer),
    agentUserId: z.string().trim().min(1).nullish(),
    agentSharePercent: percent.nullish(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().nullish(),
    notes: optionalText(2000)
  })
  .refine(v => v.commissionMode !== SaleCommissionMode.PERCENT || v.commissionRate != null, {
    path: ['commissionRate'],
    message: 'Le taux de commission est requis en mode pourcentage'
  })
  .refine(v => v.commissionMode !== SaleCommissionMode.FIXED || v.commissionFixedAmount != null, {
    path: ['commissionFixedAmount'],
    message: 'Le montant forfaitaire est requis en mode forfait'
  })
  .refine(v => v.minimumPrice == null || v.minimumPrice <= v.askingPrice, {
    path: ['minimumPrice'],
    message: 'Le prix plancher ne peut pas dépasser le prix demandé'
  })
  .refine(v => v.endDate == null || v.endDate >= v.startDate, {
    path: ['endDate'],
    message: 'La date de fin ne peut pas précéder la date de début'
  });

export const updateMandateSchema = z
  .object({
    mandateType: z.nativeEnum(SaleMandateType).optional(),
    askingPrice: positiveMoney.optional(),
    minimumPrice: money.positive().nullish(),
    commissionMode: z.nativeEnum(SaleCommissionMode).optional(),
    commissionRate: z.coerce.number().gt(0).max(20).nullish(),
    commissionFixedAmount: positiveMoney.nullish(),
    commissionPayer: z.nativeEnum(SaleCommissionPayer).optional(),
    agentUserId: z.string().trim().min(1).nullish(),
    agentSharePercent: percent.nullish(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().nullish(),
    notes: optionalText(2000)
  })
  .partial();

export const revokeMandateSchema = z.object({
  reason: z.string().trim().min(3).max(500)
});

export const createOfferSchema = z.object({
  buyerContactId: z.string().trim().min(1),
  dealId: z.string().trim().min(1).nullish(),
  amount: positiveMoney,
  financing: z.nativeEnum(SaleFinancing),
  conditions: optionalText(2000),
  validUntil: z.coerce.date().nullish()
});

const OFFER_ACTIONS = ['COUNTER', 'ACCEPT', 'REJECT', 'WITHDRAW'] as const;

export const offerDecisionSchema = z
  .object({
    action: z.enum(OFFER_ACTIONS),
    counterAmount: positiveMoney.nullish(),
    reason: z.string().trim().max(500).nullish()
  })
  .refine(v => v.action !== 'COUNTER' || v.counterAmount != null, {
    path: ['counterAmount'],
    message: 'Le montant de la contre-offre est requis'
  })
  .refine(v => !['REJECT', 'WITHDRAW'].includes(v.action) || (v.reason && v.reason.trim().length >= 3), {
    path: ['reason'],
    message: 'Un motif est requis'
  });

export const createAgreementSchema = z.object({
  price: positiveMoney.nullish(),
  depositAmount: money.positive().nullish(),
  depositHolder: z.nativeEnum(SaleDepositHolder).nullish(),
  notaryName: optionalText(120),
  expectedDeedDate: z.coerce.date().nullish()
});

export const updateAgreementSchema = createAgreementSchema;

export const signAgreementSchema = z.object({
  signedAt: z.coerce.date()
});

export const completeAgreementSchema = z.object({
  deedDate: z.coerce.date()
});

export const cancelAgreementSchema = z.object({
  reason: z.string().trim().min(3).max(500)
});

export const conditionInputSchema = z.object({
  label: z.string().trim().min(1).max(200),
  dueDate: z.coerce.date().nullish(),
  status: z.nativeEnum(SaleConditionStatus).optional()
});

export const conditionPatchSchema = z.object({
  label: z.string().trim().min(1).max(200).optional(),
  dueDate: z.coerce.date().nullish(),
  status: z.nativeEnum(SaleConditionStatus).optional()
});

export const milestoneInputSchema = z.object({
  label: z.string().trim().min(1).max(200),
  dueDate: z.coerce.date().nullish(),
  amount: positiveMoney,
  paidAt: z.coerce.date().nullish()
});

export const milestonesReplaceSchema = z.array(milestoneInputSchema);

const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHECK', 'CARD', 'OTHER'] as const;

export const createCommissionPaymentSchema = z.object({
  amount: positiveMoney,
  paidAt: z.coerce.date(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  treasuryAccountId: z.string().trim().min(1),
  reference: optionalText(60)
});

export const voidReasonSchema = z.object({
  reason: z.string().trim().min(3).max(500)
});
