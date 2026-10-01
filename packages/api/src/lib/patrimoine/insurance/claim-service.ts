import { Prisma } from '@prisma/client';
import { prisma } from '../../../utils/database';
import { getPropertyForTenant } from '../../../utils/property-tenant-guard';
import { BadRequestError, ConflictError, NotFoundError } from '../../../middleware/error-middleware';
import { logAuditEvent } from '../../../services/audit-service';
import { AuditActionKey } from '../../../types/audit-types';
import { computeOutOfPocket } from './claim-amounts';
import { canTransition, CLAIM_STATUS_TIMESTAMP_FIELD, type ClaimStatus } from './claim-status';
import { CLAIM_STATUS_LABELS } from './labels';
import {
  toClaimDocumentDto,
  toClaimDto,
  toHistoryDto,
  toNumber,
  type ClaimDocumentDto,
  type InsuranceClaimDetailDto,
  type InsuranceClaimDto
} from './dto';
import {
  assertDocumentOfProperty,
  assertExpenseOfProperty,
  assertPolicyOfProperty,
  assertTicketOfProperty
} from './references';
import type { AttachClaimDocumentInput, CreateClaimInput, TransitionClaimInput, UpdateClaimInput } from './schemas';

/**
 * Service des sinistres (lot B1, spec 032). Aucune `PropertyExpense` n'est
 * écrite ici : `expenseId` est un simple lien vérifié. Le reste à charge est
 * calculé (`dto.ts`), jamais stocké. Toute transition de statut se fait dans
 * une transaction, verrouillée sur le statut courant.
 */

const NOT_FOUND_CLAIM = 'Sinistre introuvable.';
const NOT_FOUND_LINK = 'Pièce introuvable.';
const ALREADY_ATTACHED = 'Ce document est déjà rattaché à ce sinistre.';
const DEFAULT_LIMIT = 200;

const CLAIM_INCLUDE = {
  property: { select: { internalReference: true } },
  policy: { select: { insurer: true, policyNumber: true } },
  ticket: { select: { title: true } },
  _count: { select: { documents: true } }
} as const;

/** Les pièces d'un sinistre clos sont figées. */
function assertClaimOpen(status: string): void {
  if (status === 'CLOSED') throw new ConflictError('Un sinistre clos ne peut plus être modifié.');
}

async function findClaimOrThrow(tenantId: string, claimId: string) {
  const claim = await prisma.insuranceClaim.findFirst({ where: { id: claimId, tenantId }, include: CLAIM_INCLUDE });
  if (!claim) throw new NotFoundError(NOT_FOUND_CLAIM);
  return claim;
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export async function listClaims(
  tenantId: string,
  filters: { propertyId?: string; policyId?: string; status?: ClaimStatus; limit?: number }
): Promise<InsuranceClaimDto[]> {
  const where: Prisma.InsuranceClaimWhereInput = { tenantId };
  if (filters.propertyId) where.propertyId = filters.propertyId;
  if (filters.policyId) where.policyId = filters.policyId;
  if (filters.status) where.status = filters.status;

  const rows = await prisma.insuranceClaim.findMany({
    where,
    include: CLAIM_INCLUDE,
    orderBy: { declaredAt: 'desc' },
    take: Math.min(filters.limit ?? DEFAULT_LIMIT, 500)
  });
  return rows.map(toClaimDto);
}

export async function getClaim(tenantId: string, claimId: string): Promise<InsuranceClaimDetailDto> {
  const claim = await findClaimOrThrow(tenantId, claimId);

  const [documents, history] = await Promise.all([
    prisma.insuranceClaimDocument.findMany({
      where: { claimId, tenantId },
      include: { document: { select: { fileName: true, mimeType: true } } },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.insuranceClaimStatusHistory.findMany({
      where: { claimId, tenantId },
      orderBy: { changedAt: 'asc' }
    })
  ]);

  const userIds = [...new Set(history.map(h => h.changedByUserId).filter((id): id is string => !!id))];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } })
    : [];
  const names = new Map(users.map(u => [u.id, u.fullName] as [string, string | null]));

  return {
    ...toClaimDto(claim),
    documents: documents.map(toClaimDocumentDto),
    history: history.map(h => toHistoryDto(h, names))
  };
}

// ---------------------------------------------------------------------------
// Création / modification / suppression
// ---------------------------------------------------------------------------

export async function createClaim(
  tenantId: string,
  input: CreateClaimInput,
  userId: string | undefined
): Promise<InsuranceClaimDetailDto> {
  await getPropertyForTenant(input.propertyId, tenantId);
  const policy = await assertPolicyOfProperty(tenantId, input.propertyId, input.policyId);
  await assertTicketOfProperty(tenantId, input.propertyId, input.ticketId);
  await assertExpenseOfProperty(tenantId, input.propertyId, input.expenseId);

  const now = new Date();
  const claim = await prisma.$transaction(async tx => {
    const created = await tx.insuranceClaim.create({
      data: {
        tenantId,
        propertyId: input.propertyId,
        policyId: input.policyId,
        ticketId: input.ticketId ?? null,
        expenseId: input.expenseId ?? null,
        occurredAt: input.occurredAt,
        declaredAt: now,
        cause: input.cause,
        description: input.description,
        status: 'DECLARED',
        claimedAmount: input.claimedAmount,
        deductible: input.deductible ?? null,
        currency: policy.currency,
        createdByUserId: userId ?? null
      }
    });
    await tx.insuranceClaimStatusHistory.create({
      data: {
        tenantId,
        claimId: created.id,
        fromStatus: null,
        toStatus: 'DECLARED',
        changedByUserId: userId ?? null,
        changedAt: now
      }
    });
    return created;
  });

  logAuditEvent({
    actorUserId: userId ?? null,
    tenantId,
    actionKey: AuditActionKey.PATRIMOINE_INSURANCE_CLAIM_DECLARED,
    entityType: 'InsuranceClaim',
    entityId: claim.id,
    payload: { propertyId: input.propertyId, policyId: input.policyId, claimedAmount: input.claimedAmount }
  });
  return getClaim(tenantId, claim.id);
}

export async function updateClaim(
  tenantId: string,
  claimId: string,
  input: UpdateClaimInput
): Promise<InsuranceClaimDetailDto> {
  const claim = await findClaimOrThrow(tenantId, claimId);
  assertClaimOpen(claim.status);

  if (input.claimedAmount !== undefined && claim.indemnifiedAmount !== null) {
    if (input.claimedAmount < toNumber(claim.indemnifiedAmount)) {
      throw new BadRequestError('Le montant réclamé ne peut pas être inférieur au montant indemnisé.');
    }
  }
  await assertTicketOfProperty(tenantId, claim.propertyId, input.ticketId);
  await assertExpenseOfProperty(tenantId, claim.propertyId, input.expenseId);

  // Jamais d'`indemnifiedAmount` ici : il ne change que par la transition vers SETTLED.
  const data: Prisma.InsuranceClaimUncheckedUpdateManyInput = {};
  if (input.description !== undefined) data.description = input.description;
  if (input.cause !== undefined) data.cause = input.cause;
  if (input.occurredAt !== undefined) data.occurredAt = input.occurredAt;
  if (input.claimedAmount !== undefined) data.claimedAmount = input.claimedAmount;
  if (input.deductible !== undefined) data.deductible = input.deductible;
  if (input.ticketId !== undefined) data.ticketId = input.ticketId;
  if (input.expenseId !== undefined) data.expenseId = input.expenseId;

  // Course : si le montant réclamé change, le where épingle les valeurs lues (réclamé et indemnisé) ;
  // une transition vers SETTLED ou un autre PATCH passés entre-temps font échouer la mise à jour (409).
  const result = await prisma.insuranceClaim.updateMany({
    where: {
      id: claimId,
      tenantId,
      status: { not: 'CLOSED' },
      ...(input.claimedAmount !== undefined
        ? { claimedAmount: claim.claimedAmount, indemnifiedAmount: claim.indemnifiedAmount }
        : {})
    },
    data
  });
  if (result.count === 0) throw new ConflictError('Le sinistre a été modifié entre-temps. Rechargez la page.');
  return getClaim(tenantId, claimId);
}

export async function deleteClaim(tenantId: string, claimId: string): Promise<void> {
  const claim = await findClaimOrThrow(tenantId, claimId);
  if (claim.status !== 'DECLARED') {
    throw new ConflictError('Seul un sinistre au statut « Déclaré » peut être supprimé.');
  }
  const result = await prisma.insuranceClaim.deleteMany({ where: { id: claimId, tenantId, status: 'DECLARED' } });
  if (result.count === 0) throw new ConflictError('Le sinistre a changé de statut entre-temps.');
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

/** Valide les champs propres à la cible et renvoie les colonnes à écrire en plus du statut. */
function buildTransitionData(
  claim: { claimedAmount: Prisma.Decimal | number | string },
  input: TransitionClaimInput
): Prisma.InsuranceClaimUncheckedUpdateManyInput {
  const { toStatus } = input;
  const data: Prisma.InsuranceClaimUncheckedUpdateManyInput = {};

  if (input.indemnifiedAmount !== undefined && toStatus !== 'SETTLED') {
    throw new BadRequestError("Le montant indemnisé ne se renseigne qu'au passage au statut « Indemnisé ».");
  }
  if (input.deductible !== undefined && toStatus !== 'SETTLED') {
    throw new BadRequestError("La franchise ne se renseigne qu'au passage au statut « Indemnisé ».");
  }
  if (input.rejectionReason !== undefined && toStatus !== 'REJECTED') {
    throw new BadRequestError("Le motif du rejet ne se renseigne qu'au passage au statut « Rejeté ».");
  }

  if (toStatus === 'SETTLED') {
    if (input.indemnifiedAmount === undefined) {
      throw new BadRequestError('Le montant indemnisé est obligatoire pour clore un sinistre indemnisé.');
    }
    if (input.indemnifiedAmount > toNumber(claim.claimedAmount)) {
      throw new BadRequestError('Le montant indemnisé ne peut pas dépasser le montant réclamé.');
    }
    data.indemnifiedAmount = input.indemnifiedAmount;
    if (input.deductible !== undefined) data.deductible = input.deductible;
  }
  if (toStatus === 'REJECTED') {
    if (!input.rejectionReason?.trim()) throw new BadRequestError('Le motif du rejet est obligatoire.');
    data.rejectionReason = input.rejectionReason.trim();
    data.indemnifiedAmount = 0;
  }
  return data;
}

export async function transitionClaim(
  tenantId: string,
  claimId: string,
  input: TransitionClaimInput,
  userId: string | undefined
): Promise<InsuranceClaimDetailDto> {
  const claim = await findClaimOrThrow(tenantId, claimId);
  const from = claim.status as ClaimStatus;
  const to = input.toStatus;

  if (!canTransition(from, to)) {
    throw new ConflictError(
      `Transition de statut impossible : « ${CLAIM_STATUS_LABELS[from]} » vers « ${CLAIM_STATUS_LABELS[to]} ».`
    );
  }
  const extra = buildTransitionData(claim, input);
  const now = new Date();
  const timestampField = CLAIM_STATUS_TIMESTAMP_FIELD[to as keyof typeof CLAIM_STATUS_TIMESTAMP_FIELD];

  await prisma.$transaction(async tx => {
    // Verrou : la mise à jour ne passe que si le statut et le montant réclamé sont ceux lus plus haut.
    const result = await tx.insuranceClaim.updateMany({
      where: { id: claimId, tenantId, status: from, claimedAmount: claim.claimedAmount },
      data: { ...extra, status: to, [timestampField]: now }
    });
    if (result.count === 0) throw new ConflictError('Le statut du sinistre a changé entre-temps. Rechargez la page.');

    await tx.insuranceClaimStatusHistory.create({
      data: {
        tenantId,
        claimId,
        fromStatus: from,
        toStatus: to,
        note: input.note ?? null,
        changedByUserId: userId ?? null,
        changedAt: now
      }
    });
  });

  logAuditEvent({
    actorUserId: userId ?? null,
    tenantId,
    actionKey: AuditActionKey.PATRIMOINE_INSURANCE_CLAIM_STATUS_CHANGED,
    entityType: 'InsuranceClaim',
    entityId: claimId,
    payload: { fromStatus: from, toStatus: to, outOfPocketAmount: outOfPocketPayload(claim, extra, to) }
  });
  return getClaim(tenantId, claimId);
}

/** Reste à charge tracé au journal pour les statuts qui tranchent le dossier. */
function outOfPocketPayload(
  claim: { claimedAmount: Prisma.Decimal | number | string },
  extra: Prisma.InsuranceClaimUncheckedUpdateManyInput,
  to: ClaimStatus
): number | null {
  if (to !== 'SETTLED' && to !== 'REJECTED') return null;
  return computeOutOfPocket(toNumber(claim.claimedAmount), extra.indemnifiedAmount as number);
}

// ---------------------------------------------------------------------------
// Pièces
// ---------------------------------------------------------------------------

export async function attachClaimDocument(
  tenantId: string,
  claimId: string,
  input: AttachClaimDocumentInput
): Promise<ClaimDocumentDto> {
  const claim = await findClaimOrThrow(tenantId, claimId);
  assertClaimOpen(claim.status);
  await assertDocumentOfProperty(tenantId, claim.propertyId, input.documentId);

  const duplicate = await prisma.insuranceClaimDocument.findFirst({
    where: { claimId, tenantId, documentId: input.documentId },
    select: { id: true }
  });
  if (duplicate) throw new ConflictError(ALREADY_ATTACHED);

  try {
    const link = await prisma.insuranceClaimDocument.create({
      data: { tenantId, claimId, documentId: input.documentId, kind: input.kind },
      include: { document: { select: { fileName: true, mimeType: true } } }
    });
    return toClaimDocumentDto(link);
  } catch (error) {
    // Rattachement concurrent du même document : la contrainte unique (claimId, documentId) tranche.
    if ((error as { code?: string } | null)?.code === 'P2002') throw new ConflictError(ALREADY_ATTACHED);
    throw error;
  }
}

export async function detachClaimDocument(tenantId: string, claimId: string, linkId: string): Promise<void> {
  const claim = await findClaimOrThrow(tenantId, claimId);
  assertClaimOpen(claim.status);
  const result = await prisma.insuranceClaimDocument.deleteMany({ where: { id: linkId, claimId, tenantId } });
  if (result.count === 0) throw new NotFoundError(NOT_FOUND_LINK);
}
