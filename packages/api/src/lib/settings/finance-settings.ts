import { ManagementFeeBase, Prisma } from '@prisma/client';
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
 * Comptes proposés par défaut. Numérotation SYSCOHADA : 706 « Services
 * vendus », 4432 « TVA facturée sur prestations de services ».
 *
 * Le compte des fonds des propriétaires n'a PAS de valeur par défaut : les
 * cabinets le numérotent différemment, et un numéro deviné finirait dans les
 * écritures du lot 3 sans que personne l'ait choisi.
 */
export const DEFAULT_MANAGEMENT_FEE_ACCOUNT = '706';
export const DEFAULT_VAT_COLLECTED_ACCOUNT = '4432';
export const DEFAULT_VAT_RATE = 18;

export interface AgencyFinanceSettingsDto {
  vatRegistered: boolean;
  /** En pourcentage : 18 pour 18 %. */
  vatRate: number;
  taxpayerNumber: string | null;
  /** En pourcentage. `null` : non paramétré, ce qui n'est pas zéro. */
  managementFeeRate: number | null;
  managementFeeBase: ManagementFeeBase;
  ownerFundsAccountNumber: string | null;
  managementFeeAccountNumber: string | null;
  vatCollectedAccountNumber: string | null;
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
  ownerFundsAccountNumber: null,
  managementFeeAccountNumber: DEFAULT_MANAGEMENT_FEE_ACCOUNT,
  vatCollectedAccountNumber: DEFAULT_VAT_COLLECTED_ACCOUNT,
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

export const updateFinanceSettingsSchema = z.object({
  vatRegistered: z.boolean(),
  vatRate: percentage,
  taxpayerNumber: optionalText(30),
  managementFeeRate: percentage.nullable(),
  managementFeeBase: z.nativeEnum(ManagementFeeBase),
  ownerFundsAccountNumber: accountNumber,
  managementFeeAccountNumber: accountNumber,
  vatCollectedAccountNumber: accountNumber
});

export type UpdateFinanceSettingsInput = z.infer<typeof updateFinanceSettingsSchema>;

type StoredSettings = Prisma.AgencyFinanceSettingsGetPayload<Record<string, never>>;

function toDto(row: StoredSettings): AgencyFinanceSettingsDto {
  return {
    vatRegistered: row.vatRegistered,
    vatRate: Number(row.vatRate),
    taxpayerNumber: row.taxpayerNumber,
    managementFeeRate: row.managementFeeRate === null ? null : Number(row.managementFeeRate),
    managementFeeBase: row.managementFeeBase,
    ownerFundsAccountNumber: row.ownerFundsAccountNumber,
    managementFeeAccountNumber: row.managementFeeAccountNumber,
    vatCollectedAccountNumber: row.vatCollectedAccountNumber,
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
    ownerFundsAccountNumber: input.ownerFundsAccountNumber,
    managementFeeAccountNumber: input.managementFeeAccountNumber,
    vatCollectedAccountNumber: input.vatCollectedAccountNumber,
    updatedByUserId: userId ?? null
  };
  const row = await prisma.agencyFinanceSettings.upsert({
    where: { tenantId },
    create: { tenantId, ...data },
    update: data
  });
  return toDto(row);
}
