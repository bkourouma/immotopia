import { prisma } from '../../../utils/database';
import { NotFoundError } from '../../../middleware/error-middleware';
import { t } from '../../../i18n';
import {
  computeRentalAlerts,
  findProbableDuplicates,
  installmentRemainingDue,
  type DuplicateProbeRow
} from './declaration-alerts';
import { loadDeclaredPaymentSettings } from './settings';
import type {
  RentalDeclarationPaymentMethod,
  RentalDeclarationRejectReason,
  RentalMobileMoneyOperator,
  RentalPaymentDeclarationDto,
  RentalPrefillField
} from './types';

/**
 * DTO gestionnaire d'une déclaration de paiement (contrat §3
 * `RentalPaymentDeclarationDto`). `toDeclarationDto` est pur ; les helpers
 * `loadDeclarationDto(s)` chargent ce qu'il faut en un nombre fixe de requêtes
 * (aucun aller-retour par ligne), toujours filtrées par agence.
 */

/** Sélection explicite : jamais d'objet `User` complet (il porte `passwordHash`). */
export const DECLARATION_DTO_INCLUDE = {
  lease: { select: { id: true, lease_number: true } },
  installment: {
    select: {
      id: true,
      period_year: true,
      period_month: true,
      due_date: true,
      amount_rent: true,
      amount_service: true,
      amount_other_fees: true,
      penalty_amount: true,
      amount_paid: true
    }
  },
  declarer: { select: { id: true, user: { select: { fullName: true } } } },
  receivingNumber: { select: { id: true, operator: true, phone: true } },
  reviewer: { select: { id: true, fullName: true } },
  proofRead: { select: { result: true } }
} as const;

export interface DeclarationDtoRow extends DuplicateProbeRow {
  lease_id: string;
  declared_by: string;
  declared_by_user_id: string | null;
  mobile_operator: string | null;
  payment_method?: string;
  reference: string | null;
  proof_file_url: string | null;
  ai_prefilled: boolean;
  ai_edited_fields: string[];
  receiving_phone: string | null;
  notes: string | null;
  review_notes: string | null;
  correction_note: string | null;
  reject_reason: string | null;
  accepted_amount: unknown;
  reviewed_at: Date | null;
  lease: { lease_number: string | null } | null;
  installment: {
    id: string;
    period_year: number;
    period_month: number;
    due_date: Date;
    amount_rent: unknown;
    amount_service: unknown;
    amount_other_fees: unknown;
    penalty_amount: unknown;
    amount_paid: unknown;
  } | null;
  declarer: { id: string; user: { fullName: string | null } | null } | null;
  receivingNumber: { id: string; operator: string; phone: string } | null;
  reviewer: { id: string; fullName: string | null } | null;
  proofRead?: { result: unknown } | null;
}

export interface DeclarationDtoContext {
  now: Date;
  reviewAlertBusinessDays: number;
  /** `User.id` → nom (déclarations saisies par un gestionnaire). */
  userNames?: Map<string, string>;
  /** id de déclaration → id du paiement créé à la validation. */
  paymentIds?: Map<string, string>;
  /** id de déclaration → id de la déclaration probablement en doublon. */
  duplicateOf?: Map<string, string>;
}

export function toDeclarationDto(row: DeclarationDtoRow, ctx: DeclarationDtoContext): RentalPaymentDeclarationDto {
  const alerts = computeRentalAlerts(row, {
    now: ctx.now,
    reviewAlertBusinessDays: ctx.reviewAlertBusinessDays,
    duplicateOfId: ctx.duplicateOf?.get(row.id) ?? null
  });
  const managerId = row.declared_by_user_id;
  return {
    id: row.id,
    status: row.status as RentalPaymentDeclarationDto['status'],
    leaseId: row.lease_id,
    leaseNumber: row.lease?.lease_number ?? null,
    declaredBy: managerId
      ? { type: 'MANAGER', userId: managerId, name: ctx.userNames?.get(managerId) ?? '' }
      : { type: 'TENANT', clientId: row.declared_by, name: row.declarer?.user?.fullName ?? '' },
    installment: row.installment
      ? {
          id: row.installment.id,
          periodYear: row.installment.period_year,
          periodMonth: row.installment.period_month,
          dueDate: row.installment.due_date.toISOString(),
          remainingDue: installmentRemainingDue(row.installment)
        }
      : null,
    receivingNumber: row.receivingNumber
      ? {
          id: row.receivingNumber.id,
          operator: row.receivingNumber.operator as RentalMobileMoneyOperator,
          phone: row.receivingNumber.phone
        }
      : null,
    operator: (row.mobile_operator as RentalMobileMoneyOperator | null) ?? null,
    paymentMethod: (row.payment_method ?? 'MOBILE_MONEY') as RentalDeclarationPaymentMethod,
    payerPhone: row.transaction_phone,
    amount: Number(row.amount),
    acceptedAmount: row.accepted_amount == null ? null : Number(row.accepted_amount),
    paidAt: row.payment_date.toISOString(),
    reference: row.reference,
    hasProof: Boolean(row.proof_file_url),
    aiPrefilled: row.ai_prefilled,
    aiEditedFields: (row.ai_edited_fields ?? []) as RentalPrefillField[],
    duplicateSuspected: alerts.some(alert => alert.kind === 'DUPLICATE_SUSPECTED'),
    overdue: alerts.some(alert => alert.kind === 'OVERDUE'),
    alerts,
    notes: row.notes,
    rejectReason: (row.reject_reason as RentalDeclarationRejectReason | null) ?? null,
    reviewNote: row.correction_note ?? row.review_notes ?? null,
    reviewedAt: row.reviewed_at ? row.reviewed_at.toISOString() : null,
    reviewedByName: row.reviewer?.fullName ?? null,
    paymentId: ctx.paymentIds?.get(row.id) ?? null,
    createdAt: row.created_at.toISOString()
  };
}

/** DTO de plusieurs déclarations de l'agence ; id inconnu ou d'une autre agence : absent du résultat. */
export async function loadDeclarationDtos(
  tenantId: string,
  ids: string[],
  now: Date = new Date()
): Promise<Map<string, RentalPaymentDeclarationDto>> {
  const result = new Map<string, RentalPaymentDeclarationDto>();
  if (ids.length === 0) return result;
  const rows = (await prisma.rentalPaymentDeclaration.findMany({
    where: { tenant_id: tenantId, id: { in: ids } },
    include: DECLARATION_DTO_INCLUDE
  })) as unknown as DeclarationDtoRow[];
  if (rows.length === 0) return result;

  const managerIds = Array.from(
    new Set(rows.map(r => r.declared_by_user_id).filter((id): id is string => Boolean(id)))
  );
  const [settings, users, payments, duplicateOf] = await Promise.all([
    loadDeclaredPaymentSettings(tenantId),
    managerIds.length === 0
      ? Promise.resolve([] as Array<{ id: string; fullName: string | null }>)
      : prisma.user.findMany({ where: { id: { in: managerIds } }, select: { id: true, fullName: true } }),
    prisma.rentalPayment.findMany({
      where: {
        tenant_id: tenantId,
        idempotency_key: { in: rows.filter(r => r.status === 'APPROVED').map(r => `declaration-${r.id}`) }
      },
      select: { id: true, idempotency_key: true }
    }),
    findProbableDuplicates(tenantId, rows)
  ]);

  const paymentIds = new Map<string, string>();
  for (const payment of payments) {
    if (payment.idempotency_key) paymentIds.set(payment.idempotency_key.replace(/^declaration-/, ''), payment.id);
  }
  const ctx: DeclarationDtoContext = {
    now,
    reviewAlertBusinessDays: settings.reviewAlertBusinessDays,
    userNames: new Map(users.map(u => [u.id, u.fullName ?? ''])),
    paymentIds,
    duplicateOf
  };
  for (const row of rows) result.set(row.id, toDeclarationDto(row, ctx));
  return result;
}

/** DTO d'une déclaration ; `NotFoundError` si absente ou d'une autre agence. */
export async function loadDeclarationDto(
  tenantId: string,
  declarationId: string
): Promise<RentalPaymentDeclarationDto> {
  const dto = (await loadDeclarationDtos(tenantId, [declarationId])).get(declarationId);
  if (!dto) throw new NotFoundError(t('Déclaration non trouvée'));
  return dto;
}
