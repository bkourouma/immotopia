import { ManagementFeeBase, ManagementFeeMode, PenaltyBeneficiary, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../utils/database';

/**
 * Paramètres financiers d'une agence : fiscalité, honoraires de gestion et
 * comptes comptables de la gestion locative.
 *
 * Tant que l'agence n'a rien enregistré, la lecture renvoie les valeurs par
 * défaut ci-dessous SANS les écrire : une agence qui n'a jamais ouvert la page
 * n'a pas pris de décision, et la base ne doit pas prétendre le contraire.
 */

/**
 * Comptes proposés par défaut, selon la consolidation SYSCOHADA du
 * 23 septembre 2026 (docs/CONSOLIDATION-SYSCOHADA-IMMOTOPIA.md) :
 *
 * - 4731 « Mandants » : les fonds détenus pour les propriétaires, avec un
 *   auxiliaire par propriétaire porté par chaque ligne ;
 * - 70611 « Honoraires de gestion locative », sous 7061 ;
 * - 4432 « TVA facturée sur prestations de services » ;
 * - 6588 / 7588 : écarts de caisse, après enquête ;
 * - 4478 : retenue à la source sur loyers, reversée à la DGI.
 *
 * Tous restent modifiables : le numéro choisi vaut pour les écritures à venir.
 */
export const DEFAULT_OWNER_FUNDS_ACCOUNT = '4731';
export const DEFAULT_MANAGEMENT_FEE_ACCOUNT = '70611';
export const DEFAULT_VAT_COLLECTED_ACCOUNT = '4432';
export const DEFAULT_CASH_SHORTAGE_ACCOUNT = '6588';
export const DEFAULT_CASH_SURPLUS_ACCOUNT = '7588';
export const DEFAULT_WITHHOLDING_ACCOUNT = '4478';
export const DEFAULT_VAT_RATE = 18;
export const DEFAULT_WITHHOLDING_RATE_INDIVIDUAL = 12;
export const DEFAULT_WITHHOLDING_RATE_COMPANY = 15;

export interface AgencyFinanceSettingsDto {
  vatRegistered: boolean;
  /** En pourcentage : 18 pour 18 %. */
  vatRate: number;
  taxpayerNumber: string | null;
  /** En pourcentage. `null` : non paramétré, ce qui n'est pas zéro. */
  managementFeeRate: number | null;
  managementFeeBase: ManagementFeeBase;
  managementFeeMode: ManagementFeeMode;
  /** Forfait par échéance, en mode FIXED. */
  managementFeeFixedAmount: number | null;
  ownerFundsAccountNumber: string | null;
  managementFeeAccountNumber: string | null;
  vatCollectedAccountNumber: string | null;
  cashShortageAccountNumber: string | null;
  cashSurplusAccountNumber: string | null;
  /** À qui reviennent les pénalités de retard encaissées. */
  penaltyBeneficiary: PenaltyBeneficiary;
  /** Produit de l'agence pour les pénalités, requis quand elles lui reviennent. */
  penaltyIncomeAccountNumber: string | null;
  /** Retenue à la source sur loyers : désactivée tant que le cabinet ne l'a pas confirmée. */
  withholdingEnabled: boolean;
  /** Premier jour d'encaissement soumis à la retenue (AAAA-MM-JJ) : jamais rétroactive. */
  withholdingStartsOn: string | null;
  withholdingRateIndividual: number;
  withholdingRateCompany: number;
  withholdingAccountNumber: string | null;
  /** Vrai tant que l'agence n'a jamais enregistré ses paramètres. */
  isDefault: boolean;
  updatedAt: string | null;
}

export const DEFAULT_FINANCE_SETTINGS: AgencyFinanceSettingsDto = {
  vatRegistered: false,
  vatRate: DEFAULT_VAT_RATE,
  taxpayerNumber: null,
  managementFeeRate: null,
  managementFeeBase: ManagementFeeBase.RENT_ONLY,
  managementFeeMode: ManagementFeeMode.PERCENT,
  managementFeeFixedAmount: null,
  ownerFundsAccountNumber: DEFAULT_OWNER_FUNDS_ACCOUNT,
  managementFeeAccountNumber: DEFAULT_MANAGEMENT_FEE_ACCOUNT,
  vatCollectedAccountNumber: DEFAULT_VAT_COLLECTED_ACCOUNT,
  cashShortageAccountNumber: DEFAULT_CASH_SHORTAGE_ACCOUNT,
  cashSurplusAccountNumber: DEFAULT_CASH_SURPLUS_ACCOUNT,
  penaltyBeneficiary: PenaltyBeneficiary.OWNER,
  penaltyIncomeAccountNumber: null,
  withholdingEnabled: false,
  withholdingStartsOn: null,
  withholdingRateIndividual: DEFAULT_WITHHOLDING_RATE_INDIVIDUAL,
  withholdingRateCompany: DEFAULT_WITHHOLDING_RATE_COMPANY,
  withholdingAccountNumber: DEFAULT_WITHHOLDING_ACCOUNT,
  isDefault: true,
  updatedAt: null
};

/** Une chaîne vide venue d'un formulaire veut dire « rien ». */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform(value => (value ? value : null));

const accountNumber = z
  .string()
  .trim()
  .nullish()
  .transform(value => (value ? value : null))
  .refine(value => value === null || /^\d{2,12}$/.test(value), {
    message: 'Un numéro de compte ne contient que des chiffres (2 à 12)'
  });

const percentage = z.coerce.number().min(0).max(100);

export const updateFinanceSettingsSchema = z
  .object({
    vatRegistered: z.boolean(),
    vatRate: percentage,
    taxpayerNumber: optionalText(30),
    managementFeeRate: percentage.nullable(),
    managementFeeBase: z.nativeEnum(ManagementFeeBase),
    // Absent chez un client antérieur au mode forfait : pourcentage, comme avant.
    managementFeeMode: z.nativeEnum(ManagementFeeMode).default(ManagementFeeMode.PERCENT),
    managementFeeFixedAmount: z.coerce.number().positive().nullish(),
    ownerFundsAccountNumber: accountNumber,
    managementFeeAccountNumber: accountNumber,
    vatCollectedAccountNumber: accountNumber,
    // Lot 10. Absents chez un client antérieur : les valeurs par défaut.
    cashShortageAccountNumber: accountNumber,
    cashSurplusAccountNumber: accountNumber,
    penaltyBeneficiary: z.nativeEnum(PenaltyBeneficiary).default(PenaltyBeneficiary.OWNER),
    penaltyIncomeAccountNumber: accountNumber,
    withholdingEnabled: z.boolean().default(false),
    withholdingStartsOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ')
      .nullish()
      .transform(value => value || null),
    withholdingRateIndividual: percentage.default(DEFAULT_WITHHOLDING_RATE_INDIVIDUAL),
    withholdingRateCompany: percentage.default(DEFAULT_WITHHOLDING_RATE_COMPANY),
    withholdingAccountNumber: accountNumber
  })
  .refine(value => !value.withholdingEnabled || value.withholdingStartsOn !== null, {
    path: ['withholdingStartsOn'],
    message: 'Indiquez à partir de quelle date la retenue s’applique'
  })
  .refine(
    value => value.penaltyBeneficiary !== PenaltyBeneficiary.AGENCY || value.penaltyIncomeAccountNumber !== null,
    {
      path: ['penaltyIncomeAccountNumber'],
      message: 'Indiquez le compte de produit des pénalités revenant à l’agence'
    }
  )
  .refine(
    value => value.managementFeeMode !== ManagementFeeMode.FIXED || (value.managementFeeFixedAmount ?? null) !== null,
    {
      path: ['managementFeeFixedAmount'],
      message: 'Le montant du forfait est requis'
    }
  );

export type UpdateFinanceSettingsInput = z.infer<typeof updateFinanceSettingsSchema>;

type StoredSettings = Prisma.AgencyFinanceSettingsGetPayload<Record<string, never>>;

function toDto(row: StoredSettings): AgencyFinanceSettingsDto {
  return {
    vatRegistered: row.vatRegistered,
    vatRate: Number(row.vatRate),
    taxpayerNumber: row.taxpayerNumber,
    managementFeeRate: row.managementFeeRate === null ? null : Number(row.managementFeeRate),
    managementFeeBase: row.managementFeeBase,
    managementFeeMode: row.managementFeeMode,
    managementFeeFixedAmount: row.managementFeeFixedAmount === null ? null : Number(row.managementFeeFixedAmount),
    ownerFundsAccountNumber: row.ownerFundsAccountNumber,
    managementFeeAccountNumber: row.managementFeeAccountNumber,
    vatCollectedAccountNumber: row.vatCollectedAccountNumber,
    cashShortageAccountNumber: row.cashShortageAccountNumber,
    cashSurplusAccountNumber: row.cashSurplusAccountNumber,
    penaltyBeneficiary: row.penaltyBeneficiary,
    penaltyIncomeAccountNumber: row.penaltyIncomeAccountNumber,
    withholdingEnabled: row.withholdingEnabled,
    withholdingStartsOn: row.withholdingStartsOn ? row.withholdingStartsOn.toISOString().slice(0, 10) : null,
    withholdingRateIndividual: Number(row.withholdingRateIndividual),
    withholdingRateCompany: Number(row.withholdingRateCompany),
    withholdingAccountNumber: row.withholdingAccountNumber,
    isDefault: false,
    updatedAt: row.updatedAt.toISOString()
  };
}

export async function getAgencyFinanceSettings(tenantId: string): Promise<AgencyFinanceSettingsDto> {
  const row = await prisma.agencyFinanceSettings.findUnique({ where: { tenantId } });
  return row ? toDto(row) : { ...DEFAULT_FINANCE_SETTINGS };
}

export async function updateAgencyFinanceSettings(
  tenantId: string,
  input: UpdateFinanceSettingsInput,
  userId: string | undefined
): Promise<AgencyFinanceSettingsDto> {
  const data = {
    vatRegistered: input.vatRegistered,
    vatRate: new Prisma.Decimal(input.vatRate),
    taxpayerNumber: input.taxpayerNumber,
    managementFeeRate: input.managementFeeRate === null ? null : new Prisma.Decimal(input.managementFeeRate),
    managementFeeBase: input.managementFeeBase,
    managementFeeMode: input.managementFeeMode,
    managementFeeFixedAmount:
      input.managementFeeMode === ManagementFeeMode.FIXED && input.managementFeeFixedAmount
        ? new Prisma.Decimal(input.managementFeeFixedAmount)
        : null,
    ownerFundsAccountNumber: input.ownerFundsAccountNumber,
    managementFeeAccountNumber: input.managementFeeAccountNumber,
    vatCollectedAccountNumber: input.vatCollectedAccountNumber,
    cashShortageAccountNumber: input.cashShortageAccountNumber,
    cashSurplusAccountNumber: input.cashSurplusAccountNumber,
    penaltyBeneficiary: input.penaltyBeneficiary,
    penaltyIncomeAccountNumber: input.penaltyIncomeAccountNumber,
    withholdingEnabled: input.withholdingEnabled,
    withholdingStartsOn: input.withholdingStartsOn ? new Date(`${input.withholdingStartsOn}T00:00:00.000Z`) : null,
    withholdingRateIndividual: new Prisma.Decimal(input.withholdingRateIndividual),
    withholdingRateCompany: new Prisma.Decimal(input.withholdingRateCompany),
    withholdingAccountNumber: input.withholdingAccountNumber,
    updatedByUserId: userId ?? null
  };
  const row = await prisma.agencyFinanceSettings.upsert({
    where: { tenantId },
    create: { tenantId, ...data },
    update: data
  });
  return toDto(row);
}

/** Conditions d'honoraires de l'agence, au format commun des trois niveaux. */
export function agencyFeeTerms(settings: AgencyFinanceSettingsDto) {
  return {
    managementFeeMode: settings.managementFeeMode,
    managementFeeRate: settings.managementFeeRate,
    managementFeeFixedAmount: settings.managementFeeFixedAmount,
    managementFeeBase: settings.managementFeeBase
  };
}
