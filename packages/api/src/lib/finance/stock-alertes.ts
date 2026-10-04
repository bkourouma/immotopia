/**
 * Naissance d'une alerte de stock — lot 040 (spec B7-R1, B7-R2 ; data-model
 * §2.8).
 *
 * **Une seule fonction fait naître une alerte** : `raiseStockAlertTx`, qui
 * écrit par `createMany({ data: [alerte], skipDuplicates: true })` —
 * `INSERT … ON CONFLICT (tenant_id, dedupe_key) DO NOTHING` en PostgreSQL.
 * Jamais un `create` simple : en PostgreSQL une commande en échec condamne
 * toute la transaction, et un doublon (cumul déjà alerté ce mois-ci, rejeu)
 * ferait échouer l'opération elle-même — la quatrième pièce de caisse du mois
 * ne se validerait plus. Une alerte informe, elle n'interdit rien.
 *
 * `createMany` ne rend pas l'identifiant créé : une réponse qui doit porter
 * `alertId` relit l'alerte par sa clé.
 *
 * La LECTURE des alertes, leurs titres et messages, l'e-mail et la file « À
 * traiter » ne sont pas ici (`stock-alertes-lecture.ts`, territoire API-5).
 */

import type { Prisma } from '@prisma/client';

import type { PrismaTransactionClient } from '../../utils/database';
import { toAmount } from './types';
import { STOCK_CONTROLS_DEFAULTS } from './stock-controles';
import type { PrismaLike, StockAlertInput, StockControlsSettingsValues } from './types-040-controle';

/** Devise unique du module (décision D9 du plan, actée au lot 1). */
const DEFAULT_CURRENCY = 'XOF';

/**
 * Fait naître une alerte, ou ne fait rien si sa clé existe déjà. Dans la
 * transaction de l'opération ; ne lève jamais pour cause d'alerte.
 */
export async function raiseStockAlertTx(tx: PrismaTransactionClient, input: StockAlertInput): Promise<void> {
  const data: Prisma.StockAlertCreateManyInput = {
    tenantId: input.tenantId,
    kind: input.kind,
    severity: input.severity,
    dedupeKey: input.dedupeKey,
    amount: input.amount ?? null,
    threshold: input.threshold ?? null,
    currency: input.currency ?? DEFAULT_CURRENCY,
    siteId: input.siteId ?? null,
    locationId: input.locationId ?? null,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    ...(input.details ? { details: input.details as Prisma.InputJsonValue } : {})
  };
  await tx.stockAlert.createMany({ data: [data], skipDuplicates: true });
}

/** « AAAA-MM » du mois civil UTC d'une date (clés de cumul mensuel). */
export function toYearMonthUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Constructeurs des clés anti-doublon (spec B7-R1). Une clé par événement. */
export const alertKeys = {
  countVariance: (countId: string): string => `COUNT_VARIANCE:${countId}`,
  countLineSetAside: (countId: string): string => `COUNT_LINE_SET_ASIDE:${countId}`,
  countCancelled: (countId: string): string => `COUNT_CANCELLED:${countId}`,
  countSelfValidated: (countId: string): string => `COUNT_SELF_VALIDATED:${countId}`,
  largeIssue: (slipId: string): string => `LARGE_ISSUE:${slipId}`,
  largeScrap: (movementId: string): string => `LARGE_SCRAP:${movementId}`,
  /** Cumul du mois civil des rebuts d'un lieu restés sous le seuil (A6-R6). */
  scrapCumul: (locationId: string, yyyyMm: string): string => `SCRAP_CUMUL:${locationId}:${yyyyMm}`,
  receiptRepeated: (slipId: string): string => `RECEIPT_REPEATED:${slipId}`,
  receiptOverInvoice: (slipId: string): string => `RECEIPT_OVER_INVOICE:${slipId}`,
  receiptUnvalued: (slipId: string): string => `RECEIPT_UNVALUED:${slipId}`,
  cashMaterial: (voucherId: string): string => `CASH_MATERIAL_PURCHASE:${voucherId}`,
  /** Cumul du mois civil des pièces « matériaux » d'un chantier (A9-R2). */
  cashMaterialCumul: (siteId: string, yyyyMm: string): string => `CASH_MATERIAL_CUMUL:${siteId}:${yyyyMm}`
};

/**
 * Les réglages de contrôle d'une agence, défauts appliqués EN MÉMOIRE :
 * `findUnique`, jamais `ensureStockSettingsTx`. Ne crée jamais de ligne
 * (A9-R2) — une création dans la transaction d'une pièce de caisse
 * l'exposerait à un conflit d'unicité concurrent.
 */
export async function readStockAlertSettings(db: PrismaLike, tenantId: string): Promise<StockControlsSettingsValues> {
  const row = await db.stockSettings.findUnique({
    where: { tenantId },
    select: {
      backdatingLimitDays: true,
      requireTaker: true,
      issueAlertAmount: true,
      countVarianceAlertAmount: true,
      countVarianceAlertPercent: true,
      cashMaterialAlertAmount: true,
      materialCostCategoryIds: true
    }
  });
  if (!row) {
    return {
      ...STOCK_CONTROLS_DEFAULTS,
      materialCostCategoryIds: [...STOCK_CONTROLS_DEFAULTS.materialCostCategoryIds]
    };
  }
  return {
    backdatingLimitDays: row.backdatingLimitDays,
    requireTaker: row.requireTaker,
    issueAlertAmount: toAmount(row.issueAlertAmount),
    countVarianceAlertAmount: toAmount(row.countVarianceAlertAmount),
    countVarianceAlertPercent: toAmount(row.countVarianceAlertPercent),
    cashMaterialAlertAmount: toAmount(row.cashMaterialAlertAmount),
    materialCostCategoryIds: [...(row.materialCostCategoryIds ?? [])]
  };
}
