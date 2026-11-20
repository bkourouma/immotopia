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
  /**
   * Somme des montants déjà affectés à la même échéance par les affectations
   * précédentes (règlements réussis, dans l'ordre de création). Absent : 0.
   * Sert à l'arrondi cumulé : voir `computeAllocationFee`.
   */
  priorAmount?: number;
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
 * Arrondi CUMULÉ (FCFA : jamais de décimales, décision H3) : la part d'une
 * affectation est arrondi(F(cumul après)) - arrondi(F(cumul avant)), le cumul
 * étant plafonné au total de l'échéance. La somme des parts d'une échéance
 * soldée vaut donc exactement le forfait (ou le pourcentage) arrondi une seule
 * fois ; le reste d'arrondi tombe sur la dernière affectation. Même principe
 * pour la TVA sur honoraires et la part de l'agent, calculées sur les honoraires
 * cumulés. Sans `priorAmount`, une affectation unique donne le même résultat
 * qu'un arrondi direct.
 */
export function computeAllocationFee(input: AllocationFeeInput): AllocationFee {
  const { amount, installment, terms } = input;
  const total = installment.total;
  const cumBefore = total > 0 ? Math.min(Math.max(input.priorAmount ?? 0, 0), total) : 0;
  const cumAfter = total > 0 ? Math.min(cumBefore + amount, total) : 0;
  // Cumul avant plafonné au total : au-delà, plus rien à facturer (parts nulles).
  const isFixed = terms.managementFeeMode === ManagementFeeMode.FIXED;
  const allCollected = terms.managementFeeBase === ManagementFeeBase.ALL_COLLECTED;

  /** Honoraires HT cumulés, arrondis, une fois `cumul` payé sur l'échéance. */
  const cumulativeFee = (cumul: number): number => {
    if (total <= 0 || cumul <= 0) return 0;
    if (isFixed) return roundMoneyXof(((terms.managementFeeFixedAmount ?? 0) * cumul) / total);
    const base = allCollected ? cumul : (cumul * installment.amountRent) / total;
    return roundMoneyXof((base * (terms.managementFeeRate ?? 0)) / 100);
  };

  let baseAmount: number;
  if (isFixed || allCollected) {
    baseAmount = amount;
  } else {
    baseAmount = total > 0 ? (amount * installment.amountRent) / total : 0;
  }

  const feeBefore = cumulativeFee(cumBefore);
  const feeAfter = cumulativeFee(cumAfter);
  const feeAmount = feeAfter - feeBefore;

  const vatRate = input.vat.registered ? input.vat.rate : null;
  const cumulativeVat = (fee: number): number => (vatRate === null ? 0 : roundMoneyXof((fee * vatRate) / 100));
  const vatAmount = cumulativeVat(feeAfter) - cumulativeVat(feeBefore);

  const cumulativeShare = (fee: number): number =>
    input.agentSharePercent === null ? 0 : roundMoneyXof((fee * input.agentSharePercent) / 100);
  const agentShareAmount = cumulativeShare(feeAfter) - cumulativeShare(feeBefore);

  return { baseAmount: roundMoney(baseAmount), feeAmount, vatRate, vatAmount, agentShareAmount };
}
