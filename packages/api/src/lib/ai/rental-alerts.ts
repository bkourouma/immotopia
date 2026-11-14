import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { t } from '../../i18n';
import { ConflictError, ForbiddenError, NotFoundError } from '../../middleware/error-middleware';
import { prisma } from '../../utils/database';
import { propertyTenantWhere } from '../../utils/property-tenant-guard';
import { isOverdue } from '../payment-proof/business-days';
import type { AssistantOwner } from './conversations';

const propertyId = z.string().uuid().optional();
const days = z.number().int().min(1).max(3660);
export const rentalAlertRule = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('lease_expiry'), propertyId, days }).strict(),
  z.object({ kind: z.literal('declaration_pending'), propertyId, days }).strict(),
  z
    .object({
      kind: z.literal('overdue_rent'),
      propertyId,
      days,
      minimumAmount: z.number().positive().max(999999999999),
      currency: z.string().regex(/^[A-Z]{3}$/)
    })
    .strict()
]);
export type RentalAlertRule = z.infer<typeof rentalAlertRule>;
export const rentalAlertPermissions = {
  lease_expiry: 'RENTAL_LEASES_VIEW',
  declaration_pending: 'RENTAL_PAYMENTS_VIEW',
  overdue_rent: 'RENTAL_INSTALLMENTS_VIEW'
} as const;

export async function alertProperty(tenantId: string, id: string) {
  const property = await prisma.property.findFirst({
    where: { ...propertyTenantWhere(tenantId), id },
    select: { id: true, title: true, internalReference: true }
  });
  if (!property) throw new NotFoundError(t('Bien introuvable.'));
  return property;
}

export function alertProperties(tenantId: string, query: string) {
  const contains = query.replace(/[\\%_]/g, glyph => '\\' + glyph);
  const match = { contains, mode: 'insensitive' as const };
  return prisma.property.findMany({
    where: { ...propertyTenantWhere(tenantId), OR: [{ title: match }, { internalReference: match }] },
    select: { id: true, title: true, internalReference: true },
    orderBy: [{ title: 'asc' }, { id: 'asc' }],
    take: 25
  });
}

export async function saveRentalAlert(owner: AssistantOwner, id: string, rule: RentalAlertRule) {
  if (rule.propertyId) await alertProperty(owner.tenantId, rule.propertyId);
  // Each confirmation keeps the same client-generated id across retries.
  const inserted = await prisma.assistantRentalAlert.createMany({ data: { ...owner, id, rule }, skipDuplicates: true });
  if (inserted.count) return;
  const existing = await prisma.assistantRentalAlert.findFirst({ where: { ...owner, id }, select: { rule: true } });
  if (!existing) throw new NotFoundError();
  const previous = rentalAlertRule.parse(existing.rule);
  if (JSON.stringify(previous) !== JSON.stringify(rule))
    throw new ConflictError(t('Cette confirmation correspond déjà à une autre alerte.'));
}

export async function listRentalAlerts(owner: AssistantOwner, permissions: Set<string>, cursor?: string) {
  if (
    cursor &&
    !(await prisma.assistantRentalAlert.findFirst({ where: { ...owner, id: cursor }, select: { id: true } }))
  )
    throw new NotFoundError();
  const rows = await prisma.assistantRentalAlert.findMany({
    where: owner,
    select: { id: true, rule: true },
    take: 51,
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
  });
  const rules = rows.slice(0, 50).map(row => {
    const rule = rentalAlertRule.parse(row.rule);
    return { id: row.id, rule: permissions.has(rentalAlertPermissions[rule.kind]) ? rule : undefined };
  });
  const propertyIds = rules.flatMap(({ rule }) => (rule?.propertyId ? [rule.propertyId] : []));
  const properties = propertyIds.length
    ? await prisma.property.findMany({
        where: { ...propertyTenantWhere(owner.tenantId), id: { in: propertyIds } },
        select: { id: true, title: true, internalReference: true }
      })
    : [];
  const byId = new Map(properties.map(({ id, ...property }) => [id, property]));
  const items = rules.map(({ id, rule }) => {
    if (!rule) return { id, unavailable: true };
    const property = rule.propertyId ? byId.get(rule.propertyId) : undefined;
    return rule.propertyId && !property ? { id, unavailable: true } : { id, rule, ...(property ? { property } : {}) };
  });
  return { items, nextCursor: rows.length > 50 ? rows[49].id : undefined };
}

export async function removeRentalAlert(owner: AssistantOwner, id: string) {
  await prisma.assistantRentalAlert.deleteMany({ where: { ...owner, id } });
}

export function assertRentalAlertPermission(permissions: Set<string>, kind: RentalAlertRule['kind']) {
  if (!permissions.has(rentalAlertPermissions[kind])) throw new ForbiddenError();
}

const dayMs = 86_400_000;
export async function rentalAlertMatches(tenantId: string, rule: RentalAlertRule, now: Date) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const lease = {
    tenant_id: tenantId,
    property: { ...propertyTenantWhere(tenantId), ...(rule.propertyId ? { id: rule.propertyId } : {}) }
  };
  if (rule.kind === 'lease_expiry') {
    return !!(await prisma.rentalLease.findFirst({
      where: {
        ...lease,
        status: 'ACTIVE',
        end_date: { gte: today, lt: new Date(today.getTime() + (rule.days + 1) * dayMs) }
      },
      select: { id: true }
    }));
  }
  if (rule.kind === 'declaration_pending') {
    const first = await prisma.rentalPaymentDeclaration.findFirst({
      where: { tenant_id: tenantId, status: 'PENDING', lease },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      select: { created_at: true }
    });
    return !!first && isOverdue(first.created_at, rule.days, today);
  }
  const currency = rule.currency === 'XOF' ? ['FCFA', 'XOF'] : [rule.currency];
  const cursorDate = new Date(today.getTime() - (rule.days - 1) * dayMs);
  let cursor: string | undefined;
  let balance = new Prisma.Decimal(0);
  for (;;) {
    const page = await prisma.rentalInstallment.findMany({
      where: {
        tenant_id: tenantId,
        due_date: { lt: cursorDate },
        currency: { in: currency },
        status: { in: ['DRAFT', 'DUE', 'PARTIAL', 'OVERDUE'] },
        lease,
        ...(cursor ? { id: { gt: cursor } } : {})
      },
      orderBy: { id: 'asc' },
      take: 500,
      select: {
        id: true,
        amount_rent: true,
        amount_service: true,
        amount_other_fees: true,
        penalty_amount: true,
        amount_paid: true
      }
    });
    for (const row of page) {
      const remainder = row.amount_rent
        .plus(row.amount_service)
        .plus(row.amount_other_fees)
        .plus(row.penalty_amount)
        .minus(row.amount_paid);
      if (remainder.gt(0)) balance = balance.plus(remainder);
      if (balance.gte(rule.minimumAmount)) return true;
    }
    if (page.length < 500) return false;
    cursor = page[page.length - 1].id;
  }
}
