import type { Prisma } from '@prisma/client';
import { prisma } from '../../../utils/database';
import { getPropertyForTenant } from '../../../utils/property-tenant-guard';
import { BadRequestError, ConflictError, NotFoundError } from '../../../middleware/error-middleware';
import { toPolicyDto, type InsurancePolicyDto } from './dto';
import { policyStatusWhere, type PolicyStatus } from './policy-status';
import { assertDocumentOfProperty, NOT_FOUND_POLICY } from './references';
import type { CreatePolicyInput, UpdatePolicyInput } from './schemas';

/**
 * Service des polices d'assurance (lot B1, spec 032). Chaque lecture porte
 * `tenantId` ; le bien et le document reçus sont vérifiés pour l'agence avant
 * écriture (références d'une autre agence : même `NotFoundError`).
 */

const POLICY_INCLUDE = {
  property: { select: { internalReference: true } },
  _count: { select: { claims: true } }
} as const;

const MAX_POLICIES = 1000;

async function findPolicyOrThrow(tenantId: string, policyId: string) {
  const policy = await prisma.insurancePolicy.findFirst({
    where: { id: policyId, tenantId },
    include: POLICY_INCLUDE
  });
  if (!policy) throw new NotFoundError(NOT_FOUND_POLICY);
  return policy;
}

export async function listPolicies(
  tenantId: string,
  filters: { propertyId?: string; status?: PolicyStatus },
  now: Date = new Date()
): Promise<InsurancePolicyDto[]> {
  const where: Prisma.InsurancePolicyWhereInput = { tenantId };
  if (filters.propertyId) where.propertyId = filters.propertyId;
  // Le statut est dérivé des dates : traduit en plages de dates (mêmes bornes que `derivePolicyStatus`).
  if (filters.status) Object.assign(where, policyStatusWhere(filters.status, now));

  const rows = await prisma.insurancePolicy.findMany({
    where,
    include: POLICY_INCLUDE,
    orderBy: { endDate: 'asc' },
    take: MAX_POLICIES
  });
  return rows.map(row => toPolicyDto(row, now));
}

export async function getPolicy(
  tenantId: string,
  policyId: string,
  now: Date = new Date()
): Promise<InsurancePolicyDto> {
  return toPolicyDto(await findPolicyOrThrow(tenantId, policyId), now);
}

export async function createPolicy(
  tenantId: string,
  input: CreatePolicyInput,
  userId: string | undefined,
  now: Date = new Date()
): Promise<InsurancePolicyDto> {
  await getPropertyForTenant(input.propertyId, tenantId);
  await assertDocumentOfProperty(tenantId, input.propertyId, input.documentId);

  const created = await prisma.insurancePolicy.create({
    data: {
      tenantId,
      propertyId: input.propertyId,
      insurer: input.insurer,
      policyNumber: input.policyNumber,
      coverageType: input.coverageType,
      startDate: input.startDate,
      endDate: input.endDate,
      annualPremium: input.annualPremium ?? null,
      currency: input.currency ?? 'XOF',
      notes: input.notes ?? null,
      documentId: input.documentId ?? null,
      createdByUserId: userId ?? null
    },
    include: POLICY_INCLUDE
  });
  return toPolicyDto(created, now);
}

export async function updatePolicy(
  tenantId: string,
  policyId: string,
  input: UpdatePolicyInput,
  now: Date = new Date()
): Promise<InsurancePolicyDto> {
  const existing = await findPolicyOrThrow(tenantId, policyId);

  const startDate = input.startDate ?? existing.startDate;
  const endDate = input.endDate ?? existing.endDate;
  if (endDate < startDate) {
    throw new BadRequestError('La date de fin doit être postérieure ou égale à la date de début.');
  }
  if (input.currency !== undefined && input.currency !== existing.currency && existing._count.claims > 0) {
    throw new ConflictError('La devise ne peut plus changer : des sinistres sont rattachés à cette police.');
  }
  await assertDocumentOfProperty(tenantId, existing.propertyId, input.documentId);

  const data: Prisma.InsurancePolicyUncheckedUpdateManyInput = {};
  if (input.insurer !== undefined) data.insurer = input.insurer;
  if (input.policyNumber !== undefined) data.policyNumber = input.policyNumber;
  if (input.coverageType !== undefined) data.coverageType = input.coverageType;
  if (input.startDate !== undefined) data.startDate = input.startDate;
  if (input.endDate !== undefined) data.endDate = input.endDate;
  if (input.annualPremium !== undefined) data.annualPremium = input.annualPremium;
  if (input.currency !== undefined) data.currency = input.currency;
  if (input.notes !== undefined) data.notes = input.notes;
  if (input.documentId !== undefined) data.documentId = input.documentId;

  await prisma.insurancePolicy.updateMany({ where: { id: policyId, tenantId }, data });
  return getPolicy(tenantId, policyId, now);
}

export async function deletePolicy(tenantId: string, policyId: string): Promise<void> {
  await findPolicyOrThrow(tenantId, policyId);

  const claimsCount = await prisma.insuranceClaim.count({ where: { policyId, tenantId } });
  if (claimsCount > 0) {
    throw new ConflictError('Cette police ne peut pas être supprimée : des sinistres y sont rattachés.');
  }
  await prisma.insurancePolicy.deleteMany({ where: { id: policyId, tenantId } });
}
