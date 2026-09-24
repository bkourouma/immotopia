import { ManagementFeeBase, ManagementFeeMode, ManagementFeeSource } from '@prisma/client';
import { z } from 'zod';
import { roundMoney, roundMoneyXof } from '../finance/money';

/**
 * Conditions d'honoraires de gestion et leur calcul, sans accès à la base.
 *
 * Trois niveaux, du plus particulier au plus général : le bail, puis son
 * propriétaire, puis l'agence. Le premier niveau paramétré l'emporte.
 */

export interface FeeTerms {
  managementFeeMode: ManagementFeeMode;
  /** En pourcentage ; exigé en mode PERCENT. */
  managementFeeRate: number | null;
  /** Forfait par échéance ; exigé en mode FIXED. */
  managementFeeFixedAmount: number | null;
  managementFeeBase: ManagementFeeBase;
}

export type ResolvedFeeTerms = (FeeTerms & { source: ManagementFeeSource }) | { source: 'NONE' };

/** Un niveau n'est « paramétré » que s'il porte de quoi calculer. */
export function isUsable(terms: FeeTerms | null | undefined): terms is FeeTerms {
  if (!terms) return false;
  if (terms.managementFeeMode === ManagementFeeMode.FIXED) {
    return terms.managementFeeFixedAmount !== null && terms.managementFeeFixedAmount > 0;
  }
  return terms.managementFeeRate !== null;
}

export function resolveFeeTerms(levels: {
  lease?: FeeTerms | null;
  owner?: FeeTerms | null;
  agency?: FeeTerms | null;
}): ResolvedFeeTerms {
  if (isUsable(levels.lease)) return { ...levels.lease, source: ManagementFeeSource.LEASE };
  if (isUsable(levels.owner)) return { ...levels.owner, source: ManagementFeeSource.OWNER };
  if (isUsable(levels.agency)) return { ...levels.agency, source: ManagementFeeSource.AGENCY };
  return { source: 'NONE' };
}

type DecimalLike = { toString(): string } | number | null | undefined;
const num = (value: DecimalLike): number | null => (value === null || value === undefined ? null : Number(value));

/** Lit des conditions stockées (colonnes Decimal) ; `null` si le mode manque. */
export function feeTermsFromRow(
  row:
    | {
        managementFeeMode: ManagementFeeMode | null;
        managementFeeRate: DecimalLike;
        managementFeeFixedAmount: DecimalLike;
        managementFeeBase: ManagementFeeBase | null;
      }
    | null
    | undefined
): FeeTerms | null {
  if (!row || !row.managementFeeMode) return null;
  return {
    managementFeeMode: row.managementFeeMode,
    managementFeeRate: num(row.managementFeeRate),
    managementFeeFixedAmount: num(row.managementFeeFixedAmount),
    managementFeeBase: row.managementFeeBase ?? ManagementFeeBase.RENT_ONLY
  };
}

/**
 * Saisie de conditions d'honoraires. Le taux est exigé en pourcentage, le
 * forfait en mode forfait ; l'autre valeur est ignorée et ramenée à `null`,
 * pour qu'un forfait ne garde pas un taux fantôme d'une saisie précédente.
 */
export const feeTermsSchema = z
  .object({
    managementFeeMode: z.nativeEnum(ManagementFeeMode),
    managementFeeRate: z.coerce.number().min(0).max(100).nullish(),
    managementFeeFixedAmount: z.coerce.number().positive().nullish(),
    managementFeeBase: z.nativeEnum(ManagementFeeBase).default(ManagementFeeBase.RENT_ONLY)
  })
  .superRefine((value, ctx) => {
    if (value.managementFeeMode === ManagementFeeMode.PERCENT && (value.managementFeeRate ?? null) === null) {
      ctx.addIssue({ code: 'custom', path: ['managementFeeRate'], message: 'Le taux est requis en pourcentage' });
    }
    if (value.managementFeeMode === ManagementFeeMode.FIXED && (value.managementFeeFixedAmount ?? null) === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['managementFeeFixedAmount'],
        message: 'Le montant du forfait est requis'
      });
    }
  })
  .transform((value): FeeTerms => ({
    managementFeeMode: value.managementFeeMode,
    managementFeeRate: value.managementFeeMode === ManagementFeeMode.PERCENT ? (value.managementFeeRate ?? null) : null,
    managementFeeFixedAmount:
      value.managementFeeMode === ManagementFeeMode.FIXED ? (value.managementFeeFixedAmount ?? null) : null,
    managementFeeBase: value.managementFeeBase
  }));

export interface AllocationFeeInput {
  /** Montant affecté à l'échéance par ce règlement. */
  amount: number;
  installment: { amountRent: number; total: number };
  terms: FeeTerms;
  vat: { registered: boolean; rate: number };
  /** Part du gestionnaire en pourcentage des honoraires HT ; `null` : aucune. */
  agentSharePercent: number | null;
}

export interface AllocationFee {
  baseAmount: number;
  feeAmount: number;
  vatRate: number | null;
  vatAmount: number;
  agentShareAmount: number;
}

/**
 * Honoraires d'une affectation de règlement.
 *
 * - Pourcentage, assiette « loyer seul » : la part loyer de l'échéance soldée,
 *   au prorata. 50 000 payés sur une échéance de 90 000 de loyer et 10 000 de
 *   charges portent 45 000 d'assiette.
 * - Pourcentage, « tout l'encaissé » : le montant affecté.
 * - Forfait : le forfait de l'échéance, au prorata de ce qui en est payé. Une
 *   échéance réglée en deux fois porte le forfait une seule fois au total.
 *
 * Arrondi au franc à chaque affectation : c'est la somme qui sera due.
 */
export function computeAllocationFee(input: AllocationFeeInput): AllocationFee {
  const { amount, installment, terms } = input;
  const share = installment.total > 0 ? amount / installment.total : 0;

  let baseAmount: number;
  let feeAmount: number;
  if (terms.managementFeeMode === ManagementFeeMode.FIXED) {
    baseAmount = amount;
    feeAmount = roundMoneyXof((terms.managementFeeFixedAmount ?? 0) * share);
  } else {
    if (terms.managementFeeBase === ManagementFeeBase.ALL_COLLECTED) {
      baseAmount = amount;
    } else {
      baseAmount = installment.total > 0 ? (amount * installment.amountRent) / installment.total : 0;
    }
    feeAmount = roundMoneyXof((baseAmount * (terms.managementFeeRate ?? 0)) / 100);
  }

  const vatRate = input.vat.registered ? input.vat.rate : null;
  const vatAmount = vatRate === null ? 0 : roundMoneyXof((feeAmount * vatRate) / 100);
  const agentShareAmount =
    input.agentSharePercent === null ? 0 : roundMoneyXof((feeAmount * input.agentSharePercent) / 100);

  return { baseAmount: roundMoney(baseAmount), feeAmount, vatRate, vatAmount, agentShareAmount };
}
