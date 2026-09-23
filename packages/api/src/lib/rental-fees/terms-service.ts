import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../utils/database';
import { badRequest, notFound } from '../errors';
import { agencyFeeTerms, getAgencyFinanceSettings } from '../settings/finance-settings';
import { FeeTerms, feeTermsFromRow, feeTermsSchema, ResolvedFeeTerms, resolveFeeTerms } from './fee-terms';

/**
 * Conditions d'honoraires par propriétaire et par bail, gestionnaire d'un bail
 * et part de commission des collaborateurs.
 */

const decimalOrNull = (value: number | null) => (value === null ? null : new Prisma.Decimal(value));

function feeTermsData(terms: FeeTerms) {
  return {
    managementFeeMode: terms.managementFeeMode,
    managementFeeRate: decimalOrNull(terms.managementFeeRate),
    managementFeeFixedAmount: decimalOrNull(terms.managementFeeFixedAmount),
    managementFeeBase: terms.managementFeeBase
  };
}

/** Collaborateurs actifs de l'agence : les seuls qui peuvent gérer un bail. */
async function activeCollaborators(tenantId: string) {
  const memberships = await prisma.membership.findMany({
    where: { tenantId, status: 'ACTIVE' },
    select: { user: { select: { id: true, fullName: true, email: true } } },
    orderBy: { user: { fullName: 'asc' } }
  });
  return memberships.map(m => ({ userId: m.user.id, fullName: m.user.fullName || m.user.email, email: m.user.email }));
}

// ---------------------------------------------------------------------------
// Propriétaires
// ---------------------------------------------------------------------------

export async function listOwnerFeeTerms(tenantId: string) {
  const owners = await prisma.tenantClient.findMany({
    where: { tenantId, OR: [{ clientType: 'OWNER' }, { ownerLeases: { some: {} } }] },
    select: {
      id: true,
      user: { select: { fullName: true, email: true } },
      managementTerms: true,
      ownerTaxStatus: true,
      _count: { select: { ownerLeases: true } }
    },
    orderBy: { user: { fullName: 'asc' } }
  });
  return owners.map(owner => ({
    ownerClientId: owner.id,
    ownerName: owner.user.fullName || owner.user.email,
    email: owner.user.email ?? null,
    leaseCount: owner._count.ownerLeases,
    terms: feeTermsFromRow(owner.managementTerms),
    /** Lot 10 : statut fiscal du proprietaire, pour la retenue a la source sur loyers. */
    ownerTaxStatus: owner.ownerTaxStatus ?? null
  }));
}

async function assertOwnerInTenant(tenantId: string, ownerClientId: string) {
  const owner = await prisma.tenantClient.findFirst({ where: { id: ownerClientId, tenantId }, select: { id: true } });
  if (!owner) throw notFound('Proprietaire introuvable');
}

/**
 * Statut fiscal du proprietaire (lot 10), pour la retenue a la source sur
 * loyers. Optionnel dans le corps de la requete : absent ou `undefined`, on
 * ne touche pas au champ deja enregistre.
 */
const ownerTaxStatusSchema = z.enum(['INDIVIDUAL', 'COMPANY', 'EXEMPT']).nullable();

export async function setOwnerFeeTerms(
  tenantId: string,
  ownerClientId: string,
  body: unknown,
  userId: string | undefined
): Promise<FeeTerms> {
  const terms = feeTermsSchema.parse(body);
  const rawOwnerTaxStatus = (body as { ownerTaxStatus?: unknown } | null | undefined)?.ownerTaxStatus;
  const ownerTaxStatus = rawOwnerTaxStatus === undefined ? undefined : ownerTaxStatusSchema.parse(rawOwnerTaxStatus);

  await assertOwnerInTenant(tenantId, ownerClientId);
  const data = { ...feeTermsData(terms), updatedByUserId: userId ?? null };
  const row = await prisma.$transaction(async tx => {
    const upserted = await tx.ownerManagementTerms.upsert({
      where: { ownerClientId },
      create: { tenantId, ownerClientId, ...data },
      update: data
    });
    if (ownerTaxStatus !== undefined) {
      await tx.tenantClient.update({ where: { id: ownerClientId }, data: { ownerTaxStatus } });
    }
    return upserted;
  });
  return feeTermsFromRow(row) as FeeTerms;
}

export async function clearOwnerFeeTerms(tenantId: string, ownerClientId: string): Promise<void> {
  await assertOwnerInTenant(tenantId, ownerClientId);
  await prisma.ownerManagementTerms.deleteMany({ where: { tenantId, ownerClientId } });
}

// ---------------------------------------------------------------------------
// Collaborateurs
// ---------------------------------------------------------------------------

export async function listAgentCommissionRates(tenantId: string) {
  const [collaborators, rates] = await Promise.all([
    activeCollaborators(tenantId),
    prisma.agentCommissionRate.findMany({ where: { tenantId } })
  ]);
  const byUser = new Map(rates.map(rate => [rate.userId, Number(rate.sharePercent)]));
  return collaborators.map(c => ({ ...c, sharePercent: byUser.get(c.userId) ?? null }));
}

const agentShareSchema = z.object({ sharePercent: z.coerce.number().min(0).max(100).nullable() });

export async function setAgentCommissionRate(tenantId: string, userId: string, body: unknown) {
  const { sharePercent } = agentShareSchema.parse(body);
  const member = await prisma.membership.findFirst({
    where: { tenantId, userId, status: 'ACTIVE' },
    select: { id: true }
  });
  if (!member) throw notFound('Collaborateur introuvable dans cette agence');

  if (sharePercent === null) {
    await prisma.agentCommissionRate.deleteMany({ where: { tenantId, userId } });
  } else {
    await prisma.agentCommissionRate.upsert({
      where: { tenantId_userId: { tenantId, userId } },
      create: { tenantId, userId, sharePercent: new Prisma.Decimal(sharePercent) },
      update: { sharePercent: new Prisma.Decimal(sharePercent) }
    });
  }
  return { userId, sharePercent };
}

// ---------------------------------------------------------------------------
// Bail
// ---------------------------------------------------------------------------

export interface LeaseManagementTermsDto {
  leaseId: string;
  ownerClientId: string | null;
  override: FeeTerms | null;
  agentUserId: string | null;
  effective: ResolvedFeeTerms;
  agents: Array<{ userId: string; fullName: string }>;
}

export async function getLeaseManagementTerms(tenantId: string, leaseId: string): Promise<LeaseManagementTermsDto> {
  const lease = await prisma.rentalLease.findFirst({
    where: { id: leaseId, tenant_id: tenantId },
    select: { id: true, owner_client_id: true, managementTerms: true }
  });
  if (!lease) throw notFound('Bail introuvable');

  const [ownerRow, settings, collaborators] = await Promise.all([
    lease.owner_client_id
      ? prisma.ownerManagementTerms.findFirst({ where: { tenantId, ownerClientId: lease.owner_client_id } })
      : Promise.resolve(null),
    getAgencyFinanceSettings(tenantId),
    activeCollaborators(tenantId)
  ]);

  const override = feeTermsFromRow(lease.managementTerms);
  return {
    leaseId: lease.id,
    ownerClientId: lease.owner_client_id,
    override,
    agentUserId: lease.managementTerms?.agentUserId ?? null,
    effective: resolveFeeTerms({ lease: override, owner: feeTermsFromRow(ownerRow), agency: agencyFeeTerms(settings) }),
    agents: collaborators.map(c => ({ userId: c.userId, fullName: c.fullName }))
  };
}

const leaseTermsSchema = z.object({
  override: feeTermsSchema.nullable(),
  agentUserId: z.string().min(1).nullable()
});

export async function setLeaseManagementTerms(
  tenantId: string,
  leaseId: string,
  body: unknown,
  userId: string | undefined
): Promise<LeaseManagementTermsDto> {
  const input = leaseTermsSchema.parse(body);
  const lease = await prisma.rentalLease.findFirst({
    where: { id: leaseId, tenant_id: tenantId },
    select: { id: true }
  });
  if (!lease) throw notFound('Bail introuvable');

  if (input.agentUserId) {
    const member = await prisma.membership.findFirst({
      where: { tenantId, userId: input.agentUserId, status: 'ACTIVE' },
      select: { id: true }
    });
    if (!member) throw badRequest("Le gestionnaire choisi n'est pas un collaborateur actif de l'agence");
  }

  const fee = input.override
    ? feeTermsData(input.override)
    : { managementFeeMode: null, managementFeeRate: null, managementFeeFixedAmount: null, managementFeeBase: null };
  const data = { ...fee, agentUserId: input.agentUserId, updatedByUserId: userId ?? null };
  await prisma.leaseManagementTerms.upsert({
    where: { leaseId },
    create: { tenantId, leaseId, ...data },
    update: data
  });
  return getLeaseManagementTerms(tenantId, leaseId);
}
