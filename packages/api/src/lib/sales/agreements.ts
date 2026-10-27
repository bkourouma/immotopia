import {
  CrmDealStage,
  Prisma,
  PropertyStatus,
  SaleAgreementStatus,
  SaleConditionStatus,
  SaleMandateStatus,
  SaleOfferStatus
} from '@prisma/client';
import { prisma } from '../../utils/database';
import type { PrismaTransactionClient } from '../../utils/database';
import { conflict, notFound, unprocessableEntity } from '../errors';
import { propertyLabels, tenantClientNames, crmContactNames } from './names';
import { agreementNumber, mandateNumber, nextSequenceTx } from './numbering';
import {
  cancelAgreementSchema,
  completeAgreementSchema,
  conditionInputSchema,
  conditionPatchSchema,
  createAgreementSchema,
  milestonesReplaceSchema,
  signAgreementSchema,
  updateAgreementSchema
} from './schemas';
import { setPropertyStatusTx } from './property-status';
import { markAgreementSignedTx } from './agreement-sign';
import { cancelOpenRequestsForTarget } from '../signature/cancel';
import { logger } from '../../utils/logger';
import { commissionDto, createCommissionForAgreementTx } from './commissions';
import { closeOpenOffersTx } from './offers';
import type { SaleAgreementDetailDto, SaleAgreementDto, SaleConditionDto, SaleMilestoneDto } from './types';

type AgreementRow = Prisma.SaleAgreementGetPayload<Record<string, never>>;

export async function agreementDto(
  client: PrismaTransactionClient,
  tenantId: string,
  row: AgreementRow
): Promise<SaleAgreementDto> {
  const [mandate, offer, pendingConditionsCount] = await Promise.all([
    client.saleMandate.findFirst({ where: { id: row.mandateId, tenantId } }),
    client.saleOffer.findFirst({ where: { id: row.offerId, tenantId } }),
    client.saleAgreementCondition.count({
      where: { tenantId, agreementId: row.id, status: SaleConditionStatus.PENDING }
    })
  ]);
  const [props, sellers, buyers] = await Promise.all([
    propertyLabels(client, tenantId, [row.propertyId]),
    tenantClientNames(client, tenantId, mandate ? [mandate.sellerClientId] : []),
    crmContactNames(client, tenantId, offer ? [offer.buyerContactId] : [])
  ]);

  return {
    id: row.id,
    number: agreementNumber(row.year, row.sequence),
    offerId: row.offerId,
    mandateId: row.mandateId,
    mandateNumber: mandate ? mandateNumber(mandate.year, mandate.sequence) : '',
    propertyId: row.propertyId,
    propertyLabel: props.get(row.propertyId)?.label ?? '',
    sellerName: mandate ? (sellers.get(mandate.sellerClientId) ?? '') : '',
    buyerContactId: offer?.buyerContactId ?? '',
    buyerName: offer ? (buyers.get(offer.buyerContactId) ?? '') : '',
    price: Number(row.price),
    depositAmount: row.depositAmount == null ? null : Number(row.depositAmount),
    depositHolder: row.depositHolder,
    notaryName: row.notaryName,
    signedAt: row.signedAt ? row.signedAt.toISOString() : null,
    expectedDeedDate: row.expectedDeedDate ? row.expectedDeedDate.toISOString() : null,
    deedDate: row.deedDate ? row.deedDate.toISOString() : null,
    status: row.status,
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
    cancelReason: row.cancelReason,
    pendingConditionsCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function conditionDto(row: Prisma.SaleAgreementConditionGetPayload<Record<string, never>>): SaleConditionDto {
  return {
    id: row.id,
    label: row.label,
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
    status: row.status,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null
  };
}

function milestoneDto(row: Prisma.SalePaymentMilestoneGetPayload<Record<string, never>>): SaleMilestoneDto {
  return {
    id: row.id,
    label: row.label,
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
    amount: Number(row.amount),
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    sortOrder: row.sortOrder
  };
}

export async function listAgreements(tenantId: string, filters: { status?: string }): Promise<SaleAgreementDto[]> {
  const where: Prisma.SaleAgreementWhereInput = { tenantId };
  if (filters.status) where.status = filters.status as SaleAgreementStatus;
  const rows = await prisma.saleAgreement.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500 });
  return Promise.all(rows.map(row => agreementDto(prisma, tenantId, row)));
}

export async function getAgreementDetail(tenantId: string, agreementId: string): Promise<SaleAgreementDetailDto> {
  const row = await prisma.saleAgreement.findFirst({ where: { id: agreementId, tenantId } });
  if (!row) throw notFound('Compromis introuvable');

  const [dto, conditionRows, milestoneRows, commission] = await Promise.all([
    agreementDto(prisma, tenantId, row),
    prisma.saleAgreementCondition.findMany({ where: { tenantId, agreementId: row.id }, orderBy: { createdAt: 'asc' } }),
    prisma.salePaymentMilestone.findMany({ where: { tenantId, agreementId: row.id }, orderBy: { sortOrder: 'asc' } }),
    prisma.saleCommission.findFirst({ where: { tenantId, agreementId: row.id } })
  ]);

  return {
    ...dto,
    conditions: conditionRows.map(conditionDto),
    milestones: milestoneRows.map(milestoneDto),
    commission: commission ? await commissionDto(prisma, tenantId, commission) : null
  };
}

export async function createAgreementFromOffer(
  tenantId: string,
  _userId: string | undefined,
  offerId: string,
  body: unknown
): Promise<SaleAgreementDto> {
  const input = createAgreementSchema.parse(body);

  const offer = await prisma.saleOffer.findFirst({ where: { id: offerId, tenantId } });
  if (!offer) throw notFound('Offre introuvable');
  if (offer.status !== SaleOfferStatus.ACCEPTED) {
    throw conflict("Le compromis ne peut naître que d'une offre acceptée.");
  }
  const already = await prisma.saleAgreement.findFirst({ where: { tenantId, offerId: offer.id } });
  if (already) throw conflict('Un compromis existe déjà pour cette offre.');

  const mandate = await prisma.saleMandate.findFirst({ where: { id: offer.mandateId, tenantId } });
  if (!mandate) throw notFound('Mandat de vente introuvable');

  const price = input.price ?? Number(offer.counterAmount ?? offer.amount);

  const created = await prisma.$transaction(async tx => {
    const year = new Date().getUTCFullYear();
    const sequence = await nextSequenceTx(tx.saleAgreement, tenantId, year);
    return tx.saleAgreement.create({
      data: {
        tenantId,
        year,
        sequence,
        offerId: offer.id,
        mandateId: mandate.id,
        propertyId: mandate.propertyId,
        price,
        depositAmount: input.depositAmount ?? null,
        depositHolder: input.depositHolder ?? null,
        notaryName: input.notaryName ?? null,
        expectedDeedDate: input.expectedDeedDate ?? null
      }
    });
  });

  return agreementDto(prisma, tenantId, created);
}

async function loadEditableAgreement(tenantId: string, id: string) {
  const row = await prisma.saleAgreement.findFirst({ where: { id, tenantId } });
  if (!row) throw notFound('Compromis introuvable');
  return row;
}

/**
 * SG-R2 : toute modification du compromis après l'envoi en signature annule la
 * demande en cours (le signataire reçoit alors le 404 uniforme). Un échec ici ne
 * défait pas la modification déjà enregistrée : `isSourceIntact` refuse de toute
 * façon la signature d'un compromis qui a changé.
 */
async function invalidateSignatureRequests(
  tenantId: string,
  userId: string | undefined,
  agreementId: string
): Promise<void> {
  try {
    await cancelOpenRequestsForTarget({ tenantId, userId: userId ?? null }, 'SaleAgreement', agreementId);
  } catch (error) {
    logger.warn('Annulation des demandes de signature du compromis impossible', {
      agreementId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/** Un champ imprimé dans le PDF du compromis a-t-il changé ? (enregistrer sans rien changer n'annule rien) */
function printedFieldsChanged(before: AgreementRow, after: AgreementRow): boolean {
  const day = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);
  const money = (value: AgreementRow['price'] | null) => (value == null ? null : Number(value));
  return (
    money(before.price) !== money(after.price) ||
    money(before.depositAmount) !== money(after.depositAmount) ||
    before.depositHolder !== after.depositHolder ||
    before.notaryName !== after.notaryName ||
    day(before.expectedDeedDate) !== day(after.expectedDeedDate)
  );
}

export async function updateAgreement(
  tenantId: string,
  agreementId: string,
  body: unknown,
  userId?: string
): Promise<SaleAgreementDto> {
  const input = updateAgreementSchema.parse(body);
  const row = await loadEditableAgreement(tenantId, agreementId);
  if (row.status === SaleAgreementStatus.COMPLETED || row.status === SaleAgreementStatus.CANCELLED) {
    throw conflict('Ce compromis est définitif : il ne se modifie plus.');
  }

  const updated = await prisma.saleAgreement.update({
    where: { id: row.id, tenantId },
    data: {
      price: input.price ?? undefined,
      depositAmount: input.depositAmount !== undefined ? input.depositAmount : undefined,
      depositHolder: input.depositHolder !== undefined ? input.depositHolder : undefined,
      notaryName: input.notaryName !== undefined ? input.notaryName : undefined,
      expectedDeedDate: input.expectedDeedDate !== undefined ? input.expectedDeedDate : undefined
    }
  });
  if (printedFieldsChanged(row, updated)) await invalidateSignatureRequests(tenantId, userId, row.id);
  return agreementDto(prisma, tenantId, updated);
}

export async function signAgreement(
  tenantId: string,
  userId: string | undefined,
  agreementId: string,
  body: unknown
): Promise<SaleAgreementDto> {
  const input = signAgreementSchema.parse(body);
  const row = await loadEditableAgreement(tenantId, agreementId);
  if (row.status !== SaleAgreementStatus.DRAFT) {
    throw conflict('Seul un compromis en brouillon peut être signé.');
  }

  const updated = await prisma.$transaction(async tx => {
    const result = await markAgreementSignedTx(tx, {
      tenantId,
      agreementId: row.id,
      actorUserId: userId ?? 'system',
      signedAt: input.signedAt
    });
    if (!result) throw conflict('Seul un compromis en brouillon peut être signé.');
    return result;
  });

  // Signé à la main : une demande de signature électronique encore ouverte n'a plus d'objet.
  await invalidateSignatureRequests(tenantId, userId, row.id);
  return agreementDto(prisma, tenantId, updated);
}

export async function completeAgreement(
  tenantId: string,
  userId: string | undefined,
  agreementId: string,
  body: unknown
): Promise<SaleAgreementDto> {
  const input = completeAgreementSchema.parse(body);
  const row = await loadEditableAgreement(tenantId, agreementId);
  if (row.status !== SaleAgreementStatus.SIGNED) {
    throw conflict('Seul un compromis signé peut être conclu par un acte.');
  }

  const pendingOrFailed = await prisma.saleAgreementCondition.count({
    where: {
      tenantId,
      agreementId: row.id,
      status: { in: [SaleConditionStatus.PENDING, SaleConditionStatus.FAILED] }
    }
  });
  if (pendingOrFailed > 0) {
    throw unprocessableEntity(
      "Toutes les conditions suspensives doivent être levées (satisfaites ou renoncées) avant l'acte."
    );
  }

  const updated = await prisma.$transaction(async tx => {
    const result = await tx.saleAgreement.update({
      where: { id: row.id, tenantId },
      data: { status: SaleAgreementStatus.COMPLETED, deedDate: input.deedDate }
    });

    await setPropertyStatusTx(tx, {
      propertyId: row.propertyId,
      tenantId,
      newStatus: PropertyStatus.SOLD,
      actorUserId: userId ?? 'system',
      notes: `Acte signé — compromis ${agreementNumber(row.year, row.sequence)}`
    });

    await tx.saleMandate.updateMany({
      where: { id: row.mandateId, tenantId, status: SaleMandateStatus.ACTIVE },
      data: { status: SaleMandateStatus.COMPLETED }
    });

    await closeOpenOffersTx(tx, { tenantId, mandateId: row.mandateId, userId, reason: 'Bien vendu' });

    const offer = await tx.saleOffer.findFirst({ where: { id: row.offerId, tenantId } });
    if (offer?.dealId) {
      await tx.crmDeal.updateMany({
        where: { id: offer.dealId, tenantId },
        data: { stage: CrmDealStage.WON, closedAt: input.deedDate, closedReason: 'Vente conclue' }
      });
    }

    const mandate = await tx.saleMandate.findFirst({ where: { id: row.mandateId, tenantId } });
    if (!mandate) throw notFound('Mandat de vente introuvable');
    await createCommissionForAgreementTx(tx, tenantId, result, mandate);

    return result;
  });

  return agreementDto(prisma, tenantId, updated);
}

export async function cancelAgreement(
  tenantId: string,
  userId: string | undefined,
  agreementId: string,
  body: unknown
): Promise<SaleAgreementDto> {
  const input = cancelAgreementSchema.parse(body);
  const row = await loadEditableAgreement(tenantId, agreementId);
  if (row.status !== SaleAgreementStatus.DRAFT && row.status !== SaleAgreementStatus.SIGNED) {
    throw conflict('Seul un compromis en brouillon ou signé peut être annulé.');
  }

  const updated = await prisma.$transaction(async tx => {
    // Transition conditionnelle : une annulation concurrente, ou un compromis conclu entre-temps, n'est pas écrasé.
    const claimed = await tx.saleAgreement.updateMany({
      where: {
        id: row.id,
        tenantId,
        status: { in: [SaleAgreementStatus.DRAFT, SaleAgreementStatus.SIGNED] }
      },
      data: {
        status: SaleAgreementStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: input.reason,
        cancelledByUserId: userId ?? null
      }
    });
    if (claimed.count !== 1) throw conflict('Seul un compromis en brouillon ou signé peut être annulé.');
    const result = await tx.saleAgreement.findFirstOrThrow({ where: { id: row.id, tenantId } });
    await setPropertyStatusTx(tx, {
      propertyId: row.propertyId,
      tenantId,
      newStatus: PropertyStatus.AVAILABLE,
      actorUserId: userId ?? 'system',
      notes: `Compromis ${agreementNumber(row.year, row.sequence)} annulé`
    });
    return result;
  });

  await invalidateSignatureRequests(tenantId, userId, row.id);
  return agreementDto(prisma, tenantId, updated);
}

// ---------------------------------------------------------------------------
// Conditions suspensives
// ---------------------------------------------------------------------------

export async function addCondition(
  tenantId: string,
  agreementId: string,
  body: unknown,
  userId?: string
): Promise<SaleConditionDto> {
  const input = conditionInputSchema.parse(body);
  const agreement = await loadEditableAgreement(tenantId, agreementId);
  if (agreement.status === SaleAgreementStatus.COMPLETED || agreement.status === SaleAgreementStatus.CANCELLED) {
    throw conflict('Ce compromis est définitif : impossible d’y ajouter une condition.');
  }
  const created = await prisma.saleAgreementCondition.create({
    data: {
      tenantId,
      agreementId: agreement.id,
      label: input.label,
      dueDate: input.dueDate ?? null,
      status: input.status ?? SaleConditionStatus.PENDING,
      resolvedAt: input.status && input.status !== SaleConditionStatus.PENDING ? new Date() : null
    }
  });
  await invalidateSignatureRequests(tenantId, userId, agreement.id);
  return conditionDto(created);
}

export async function patchCondition(
  tenantId: string,
  conditionId: string,
  body: unknown,
  userId?: string
): Promise<SaleConditionDto> {
  const input = conditionPatchSchema.parse(body);
  const row = await prisma.saleAgreementCondition.findFirst({ where: { id: conditionId, tenantId } });
  if (!row) throw notFound('Condition suspensive introuvable');
  const agreement = await prisma.saleAgreement.findFirst({ where: { id: row.agreementId, tenantId } });
  if (
    agreement &&
    (agreement.status === SaleAgreementStatus.COMPLETED || agreement.status === SaleAgreementStatus.CANCELLED)
  ) {
    throw conflict('Ce compromis est définitif : ses conditions ne se modifient plus.');
  }

  const statusChanged = input.status !== undefined && input.status !== row.status;
  const updated = await prisma.saleAgreementCondition.update({
    where: { id: row.id, tenantId },
    data: {
      label: input.label ?? undefined,
      dueDate: input.dueDate !== undefined ? input.dueDate : undefined,
      status: input.status ?? undefined,
      resolvedAt: statusChanged ? (input.status === SaleConditionStatus.PENDING ? null : new Date()) : undefined
    }
  });
  // Seuls le libellé et l'échéance sont imprimés : un changement de statut seul n'invalide rien.
  const printedChanged =
    updated.label !== row.label ||
    (updated.dueDate ? updated.dueDate.toISOString().slice(0, 10) : null) !==
      (row.dueDate ? row.dueDate.toISOString().slice(0, 10) : null);
  if (printedChanged) await invalidateSignatureRequests(tenantId, userId, row.agreementId);
  return conditionDto(updated);
}

export async function deleteCondition(tenantId: string, conditionId: string, userId?: string): Promise<void> {
  const row = await prisma.saleAgreementCondition.findFirst({ where: { id: conditionId, tenantId } });
  if (!row) throw notFound('Condition suspensive introuvable');
  const agreement = await prisma.saleAgreement.findFirst({ where: { id: row.agreementId, tenantId } });
  if (!agreement || agreement.status !== SaleAgreementStatus.DRAFT) {
    throw conflict('Une condition ne se supprime que tant que le compromis est en brouillon.');
  }
  await prisma.saleAgreementCondition.delete({ where: { id: row.id, tenantId } });
  await invalidateSignatureRequests(tenantId, userId, agreement.id);
}

// ---------------------------------------------------------------------------
// Échéancier de l'acquéreur
// ---------------------------------------------------------------------------

export async function replaceMilestones(
  tenantId: string,
  agreementId: string,
  body: unknown,
  userId?: string
): Promise<SaleMilestoneDto[]> {
  const input = milestonesReplaceSchema.parse(body);
  const agreement = await loadEditableAgreement(tenantId, agreementId);
  if (agreement.status === SaleAgreementStatus.CANCELLED) {
    throw conflict('Ce compromis est annulé : son échéancier ne se modifie plus.');
  }

  // Ce que le PDF imprime d'un échéancier, dans l'ordre : libellé, échéance, montant (pas la date de paiement).
  const printed = (list: Array<{ label: string; dueDate: Date | null; amount: unknown }>) =>
    JSON.stringify(list.map(m => [m.label, m.dueDate ? m.dueDate.toISOString().slice(0, 10) : null, Number(m.amount)]));
  let before = '';
  const rows = await prisma.$transaction(async tx => {
    before = printed(
      await tx.salePaymentMilestone.findMany({
        where: { tenantId, agreementId: agreement.id },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: { label: true, dueDate: true, amount: true }
      })
    );
    await tx.salePaymentMilestone.deleteMany({ where: { tenantId, agreementId: agreement.id } });
    if (!input.length) return [];
    await tx.salePaymentMilestone.createMany({
      data: input.map((m, index) => ({
        tenantId,
        agreementId: agreement.id,
        label: m.label,
        dueDate: m.dueDate ?? null,
        amount: m.amount,
        paidAt: m.paidAt ?? null,
        sortOrder: index
      }))
    });
    return tx.salePaymentMilestone.findMany({
      where: { tenantId, agreementId: agreement.id },
      orderBy: { sortOrder: 'asc' }
    });
  });

  if (printed(rows) !== before) await invalidateSignatureRequests(tenantId, userId, agreement.id);
  return rows.map(milestoneDto);
}
