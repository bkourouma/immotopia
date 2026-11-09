import { t } from '../../../i18n';
import { NotFoundError } from '../../../middleware/error-middleware';
import { prisma } from '../../../utils/database';
import { isPaymentProofVisionConfigured } from '../../payment-proof/vision';
import { isAiPrefillOffered } from './proof-read';
import { listActiveReceivingNumbers } from './receiving-numbers';
import { loadDeclaredPaymentSettings } from './settings';
import {
  RENTAL_MAX_DECLARATION_AMOUNT,
  RENTAL_DECLARATION_PAYMENT_METHODS,
  type DeclarePaymentAvailabilityDto,
  type RentalDeclarationPaymentMethod,
  type RentalDeclarationRejectReason,
  type RentalDeclarationStatus,
  type RentalMobileMoneyOperator,
  type RentalPaginated,
  type TenantPortalDeclarationDto
} from './types';

/**
 * Lecture portail locataire des déclarations de paiement (contrat 049, §1.3 et §1.4).
 * L'agence, le locataire et ses baux viennent de la session ; aucune capture n'est servie.
 */

const DECLARATION_SELECT = {
  id: true,
  status: true,
  lease_id: true,
  mobile_operator: true,
  payment_method: true,
  transaction_phone: true,
  amount: true,
  accepted_amount: true,
  payment_date: true,
  reference: true,
  reject_reason: true,
  correction_note: true,
  review_notes: true,
  reviewed_at: true,
  created_at: true,
  installment: { select: { id: true, period_year: true, period_month: true, due_date: true } },
  receivingNumber: { select: { operator: true, phone: true } }
} as const;

type DeclarationRow = {
  id: string;
  status: string;
  lease_id: string;
  mobile_operator: string | null;
  payment_method?: string;
  transaction_phone: string | null;
  amount: { toString(): string } | number;
  accepted_amount: { toString(): string } | number | null;
  payment_date: Date;
  reference: string | null;
  reject_reason: string | null;
  correction_note: string | null;
  review_notes: string | null;
  reviewed_at: Date | null;
  created_at: Date;
  installment: { id: string; period_year: number; period_month: number; due_date: Date } | null;
  receivingNumber: { operator: string; phone: string } | null;
};

export function toPortalDeclarationDto(
  row: DeclarationRow,
  extra: { duplicateSuspected?: boolean } = {}
): TenantPortalDeclarationDto {
  const operator = (row.receivingNumber?.operator ?? row.mobile_operator) as RentalMobileMoneyOperator | null;
  return {
    id: row.id,
    status: row.status as RentalDeclarationStatus,
    leaseId: row.lease_id,
    installment: row.installment
      ? {
          id: row.installment.id,
          periodYear: row.installment.period_year,
          periodMonth: row.installment.period_month,
          dueDate: row.installment.due_date.toISOString()
        }
      : null,
    receivingNumber: row.receivingNumber && operator ? { operator, phone: row.receivingNumber.phone } : null,
    paymentMethod: (row.payment_method ?? 'MOBILE_MONEY') as RentalDeclarationPaymentMethod,
    payerPhone: row.transaction_phone,
    amount: Number(row.amount),
    acceptedAmount: row.accepted_amount === null ? null : Number(row.accepted_amount),
    paidAt: row.payment_date.toISOString(),
    reference: row.reference,
    rejectReason: row.reject_reason as RentalDeclarationRejectReason | null,
    reviewNote: row.correction_note ?? row.review_notes ?? null,
    canCancel: row.status === 'PENDING',
    ...(extra.duplicateSuspected === undefined ? {} : { duplicateSuspected: extra.duplicateSuspected }),
    createdAt: row.created_at.toISOString(),
    reviewedAt: row.reviewed_at ? row.reviewed_at.toISOString() : null
  };
}

export async function getAvailability(
  tenantId: string,
  tenantClientId: string
): Promise<DeclarePaymentAvailabilityDto> {
  const rules = await loadDeclaredPaymentSettings(tenantId);
  const numbers = rules.enabled ? await listActiveReceivingNumbers(tenantId) : [];
  const hasNumbers = numbers.length > 0;
  // Extension « autres modes » : les modes non mobiles restent déclarables sans numéro de réception.
  const allowedMethods: RentalDeclarationPaymentMethod[] = !rules.enabled
    ? []
    : hasNumbers
      ? [...RENTAL_DECLARATION_PAYMENT_METHODS]
      : RENTAL_DECLARATION_PAYMENT_METHODS.filter(m => m !== 'MOBILE_MONEY');
  const available = rules.enabled;
  const aiPrefillAvailable =
    hasNumbers && isPaymentProofVisionConfigured() && (await isAiPrefillOffered(tenantId, tenantClientId, rules));
  return {
    enabled: rules.enabled,
    available,
    // Aucun numéro n'est livré quand l'agence n'accepte pas (encore) les déclarations.
    receivingNumbers: hasNumbers
      ? numbers.map(n => ({
          id: n.id,
          operator: n.operator as RentalMobileMoneyOperator,
          phone: n.phone,
          label: n.label
        }))
      : [],
    proofRequired: rules.proofRequired,
    aiPrefillAvailable,
    maxAmount: RENTAL_MAX_DECLARATION_AMOUNT,
    allowedMethods,
    instructions: rules.payerInstructions
  };
}

export async function loadPortalDeclaration(
  tenantId: string,
  declarationId: string,
  extra: { duplicateSuspected?: boolean } = {}
): Promise<TenantPortalDeclarationDto> {
  const row = await prisma.rentalPaymentDeclaration.findFirst({
    where: { id: declarationId, tenant_id: tenantId },
    select: DECLARATION_SELECT
  });
  if (!row) throw new NotFoundError(t('Déclaration introuvable.'));
  return toPortalDeclarationDto(row as unknown as DeclarationRow, extra);
}

export async function getMyDeclaration(params: {
  tenantId: string;
  tenantClientId: string;
  leaseIds: string[];
  declarationId: string;
}): Promise<TenantPortalDeclarationDto> {
  const row = await prisma.rentalPaymentDeclaration.findFirst({
    where: {
      id: params.declarationId,
      tenant_id: params.tenantId,
      declared_by: params.tenantClientId,
      lease_id: { in: params.leaseIds }
    },
    select: DECLARATION_SELECT
  });
  if (!row) throw new NotFoundError(t('Déclaration introuvable.'));
  return toPortalDeclarationDto(row as unknown as DeclarationRow);
}

export async function listMyDeclarations(params: {
  tenantId: string;
  tenantClientId: string;
  leaseIds: string[];
  status?: RentalDeclarationStatus | 'ALL';
  page?: number;
  pageSize?: number;
}): Promise<RentalPaginated<TenantPortalDeclarationDto>> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;
  const where = {
    tenant_id: params.tenantId,
    declared_by: params.tenantClientId,
    lease_id: { in: params.leaseIds },
    ...(params.status && params.status !== 'ALL' ? { status: params.status } : {})
  };
  const [rows, total] = await Promise.all([
    prisma.rentalPaymentDeclaration.findMany({
      where,
      select: DECLARATION_SELECT,
      orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.rentalPaymentDeclaration.count({ where })
  ]);
  return {
    items: rows.map(row => toPortalDeclarationDto(row as unknown as DeclarationRow)),
    total,
    page,
    pageSize
  };
}
