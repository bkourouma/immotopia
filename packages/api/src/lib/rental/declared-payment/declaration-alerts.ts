import { prisma } from '../../../utils/database';
import { businessDaysBetween, isOverdue } from '../../payment-proof/business-days';
import { normalizeIvorianMsisdn } from '../../payment-proof/phone';
import type { RentalDeclarationAlert, RentalPrefillField } from './types';

/**
 * Alertes d'une déclaration de paiement locative (contrat §3 `RentalDeclarationAlert`).
 * Tout est CALCULÉ À LA LECTURE : aucune écriture, aucune colonne d'alerte.
 *
 * Les alertes de décision (doublon, montant différent du dû, retard) n'ont de
 * sens que pour une déclaration `PENDING`. `AI_FIELDS_EDITED` et
 * `RECIPIENT_MISMATCH` décrivent la déclaration elle-même : tout statut.
 */

/** Écart maximal de `payment_date` entre deux déclarations pour un doublon probable. */
export const RENTAL_DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

const PREFILL_FIELDS: readonly RentalPrefillField[] = ['operator', 'amount', 'paidAt', 'reference', 'payerPhone'];

export interface AlertInstallment {
  amount_rent: unknown;
  amount_service: unknown;
  amount_other_fees: unknown;
  penalty_amount: unknown;
  amount_paid: unknown;
}

export interface AlertRow {
  id: string;
  status: string;
  created_at: Date;
  amount: unknown;
  ai_edited_fields: string[];
  receiving_phone: string | null;
  installment: AlertInstallment | null;
  proofRead?: { result: unknown } | null;
}

/** Reste dû d'une échéance, pénalité comprise (même calcul que l'approbation). */
export function installmentRemainingDue(installment: AlertInstallment): number {
  const total =
    Number(installment.amount_rent ?? 0) +
    Number(installment.amount_service ?? 0) +
    Number(installment.amount_other_fees ?? 0) +
    Number(installment.penalty_amount ?? 0);
  return Math.max(0, Math.round((total - Number(installment.amount_paid ?? 0)) * 100) / 100);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Numéro destinataire lu par l'IA (racine ou conteneur usuel), sans jamais lever. */
export function readRecipientPhone(result: unknown): string | null {
  const root = asRecord(result);
  if (!root) return null;
  const containers = [root, ...['reading', 'proposal', 'result', 'values'].map(key => asRecord(root[key]))];
  for (const candidate of containers) {
    const raw = candidate?.recipientPhone;
    const wrapped = asRecord(raw)?.value;
    const text = typeof raw === 'string' ? raw : typeof wrapped === 'string' ? wrapped : null;
    if (text && text.trim()) return text.trim().slice(0, 40);
  }
  return null;
}

export function editedFieldsOf(raw: unknown): RentalPrefillField[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set(raw.filter((v): v is string => typeof v === 'string'));
  return PREFILL_FIELDS.filter(field => seen.has(field));
}

export interface AlertContext {
  now: Date;
  reviewAlertBusinessDays: number;
  /** Déclaration probablement en doublon avec celle-ci (PENDING seulement). */
  duplicateOfId?: string | null;
}

/** Fonction pure : alertes d'une déclaration chargée. */
export function computeRentalAlerts(row: AlertRow, ctx: AlertContext): RentalDeclarationAlert[] {
  const alerts: RentalDeclarationAlert[] = [];
  const pending = row.status === 'PENDING';

  if (pending && ctx.duplicateOfId) {
    alerts.push({ kind: 'DUPLICATE_SUSPECTED', otherDeclarationId: ctx.duplicateOfId });
  }
  if (pending && row.installment) {
    const due = installmentRemainingDue(row.installment);
    if (Math.round(Number(row.amount) * 100) !== Math.round(due * 100)) {
      alerts.push({ kind: 'AMOUNT_DIFFERS_FROM_DUE', due });
    }
  }
  const edited = editedFieldsOf(row.ai_edited_fields);
  if (edited.length > 0) alerts.push({ kind: 'AI_FIELDS_EDITED', fields: edited });

  const read = readRecipientPhone(row.proofRead?.result);
  if (read && row.receiving_phone) {
    const normalized = normalizeIvorianMsisdn(read);
    if (normalized !== row.receiving_phone) {
      alerts.push({ kind: 'RECIPIENT_MISMATCH', recipientPhone: normalized ?? read });
    }
  }
  if (pending && ctx.reviewAlertBusinessDays > 0 && isOverdue(row.created_at, ctx.reviewAlertBusinessDays, ctx.now)) {
    alerts.push({ kind: 'OVERDUE', businessDays: businessDaysBetween(row.created_at, ctx.now) });
  }
  return alerts;
}

export interface DuplicateProbeRow {
  id: string;
  status: string;
  amount: unknown;
  payment_date: Date;
  transaction_phone: string | null;
  receiving_number_id: string | null;
  reference_normalized: string | null;
  created_at: Date;
}

/**
 * Doublons probables des déclarations `PENDING` données : même numéro de
 * réception, même montant, même numéro payeur, `payment_date` à 10 minutes
 * près, références DIFFÉRENTES (une même référence est refusée à la création).
 * Une requête groupée pour toute la liste. Résultat : id → id de l'autre déclaration.
 */
export async function findProbableDuplicates(
  tenantId: string,
  rows: DuplicateProbeRow[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const targets = rows.filter(r => r.status === 'PENDING' && r.receiving_number_id);
  if (targets.length === 0) return result;
  const times = targets.map(r => r.payment_date.getTime());
  const pool: DuplicateProbeRow[] = await prisma.rentalPaymentDeclaration.findMany({
    where: {
      tenant_id: tenantId,
      status: { in: ['PENDING', 'APPROVED'] },
      receiving_number_id: { in: Array.from(new Set(targets.map(r => r.receiving_number_id as string))) },
      payment_date: {
        gte: new Date(Math.min(...times) - RENTAL_DUPLICATE_WINDOW_MS),
        lte: new Date(Math.max(...times) + RENTAL_DUPLICATE_WINDOW_MS)
      }
    },
    select: {
      id: true,
      status: true,
      amount: true,
      payment_date: true,
      transaction_phone: true,
      receiving_number_id: true,
      reference_normalized: true,
      created_at: true
    },
    take: 1000
  });
  for (const target of targets) {
    const cents = Math.round(Number(target.amount) * 100);
    const other = pool
      .filter(
        o =>
          o.id !== target.id &&
          o.receiving_number_id === target.receiving_number_id &&
          o.transaction_phone === target.transaction_phone &&
          o.reference_normalized !== target.reference_normalized &&
          Math.round(Number(o.amount) * 100) === cents &&
          Math.abs(o.payment_date.getTime() - target.payment_date.getTime()) <= RENTAL_DUPLICATE_WINDOW_MS
      )
      .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())[0];
    if (other) result.set(target.id, other.id);
  }
  return result;
}
