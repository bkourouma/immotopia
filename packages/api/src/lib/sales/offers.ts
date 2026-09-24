import { Prisma, PropertyStatus, SaleAgreementStatus, SaleMandateStatus, SaleOfferStatus } from '@prisma/client';
import { prisma } from '../../utils/database';
import type { PrismaTransactionClient } from '../../utils/database';
import { badRequest, conflict, notFound } from '../errors';
import { crmContactNames, userNames } from './names';
import { nextSequenceTx, offerNumber } from './numbering';
import { createOfferSchema, offerDecisionSchema } from './schemas';
import { setPropertyStatusTx } from './property-status';
import type { SaleOfferDto } from './types';

type OfferRow = Prisma.SaleOfferGetPayload<Record<string, never>>;

function isExpired(validUntil: Date | null): boolean {
  return validUntil != null && validUntil.getTime() < Date.now();
}

export async function offerDto(
  client: PrismaTransactionClient,
  tenantId: string,
  row: OfferRow,
  namesMap?: Map<string, string>
): Promise<SaleOfferDto> {
  const buyers = namesMap ?? (await crmContactNames(client, tenantId, [row.buyerContactId]));
  const agreement = await client.saleAgreement.findFirst({
    where: { tenantId, offerId: row.id },
    select: { id: true }
  });
  const agreedPrice = row.status === SaleOfferStatus.ACCEPTED ? Number(row.counterAmount ?? row.amount) : null;

  return {
    id: row.id,
    number: offerNumber(row.year, row.sequence),
    mandateId: row.mandateId,
    buyerContactId: row.buyerContactId,
    buyerName: buyers.get(row.buyerContactId) ?? '',
    dealId: row.dealId,
    amount: Number(row.amount),
    financing: row.financing,
    conditions: row.conditions,
    validUntil: row.validUntil ? row.validUntil.toISOString() : null,
    isExpired: isExpired(row.validUntil),
    status: row.status,
    counterAmount: row.counterAmount == null ? null : Number(row.counterAmount),
    agreedPrice,
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    decidedByName: null,
    decisionReason: row.decisionReason,
    agreementId: agreement?.id ?? null,
    createdAt: row.createdAt.toISOString()
  };
}

export async function createOffer(
  tenantId: string,
  _userId: string | undefined,
  mandateId: string,
  body: unknown
): Promise<SaleOfferDto> {
  const input = createOfferSchema.parse(body);

  const mandate = await prisma.saleMandate.findFirst({ where: { id: mandateId, tenantId } });
  if (!mandate) throw notFound('Mandat de vente introuvable');
  if (mandate.status !== SaleMandateStatus.ACTIVE) {
    throw conflict("Ce mandat n'est plus actif : impossible d'y ajouter une offre.");
  }

  const buyer = await prisma.crmContact.findFirst({ where: { id: input.buyerContactId, tenantId } });
  if (!buyer) throw badRequest('Acquéreur introuvable pour cette agence');

  if (input.dealId) {
    const deal = await prisma.crmDeal.findFirst({ where: { id: input.dealId, tenantId } });
    if (!deal) throw badRequest('Affaire CRM introuvable pour cette agence');
  }

  const created = await prisma.$transaction(async tx => {
    const year = new Date().getUTCFullYear();
    const sequence = await nextSequenceTx(tx.saleOffer, tenantId, year);
    return tx.saleOffer.create({
      data: {
        tenantId,
        year,
        sequence,
        mandateId: mandate.id,
        buyerContactId: buyer.id,
        dealId: input.dealId ?? null,
        amount: input.amount,
        financing: input.financing,
        conditions: input.conditions ?? null,
        validUntil: input.validUntil ?? null
      }
    });
  });

  return offerDto(prisma, tenantId, created);
}

const LIVE_OFFER_STATUSES: SaleOfferStatus[] = [SaleOfferStatus.SUBMITTED, SaleOfferStatus.COUNTERED];

export async function decideOffer(
  tenantId: string,
  userId: string | undefined,
  offerId: string,
  body: unknown
): Promise<SaleOfferDto> {
  const input = offerDecisionSchema.parse(body);

  const updated = await prisma.$transaction(async tx => {
    const offer = await tx.saleOffer.findFirst({ where: { id: offerId, tenantId } });
    if (!offer) throw notFound('Offre introuvable');
    const mandate = await tx.saleMandate.findFirst({ where: { id: offer.mandateId, tenantId } });
    if (!mandate) throw notFound('Mandat de vente introuvable');
    const now = new Date();

    // Un mandat vendu ou révoqué ne reçoit plus de décision : ses offres ont
    // été closes avec lui (`closeOpenOffersTx`).
    if (mandate.status !== SaleMandateStatus.ACTIVE && input.action !== 'WITHDRAW') {
      throw conflict("Ce mandat n'est plus actif : ses offres ne se décident plus.");
    }

    if (input.action === 'COUNTER' || input.action === 'ACCEPT' || input.action === 'REJECT') {
      if (!LIVE_OFFER_STATUSES.includes(offer.status)) {
        throw conflict("Cette offre n'est plus en attente de décision.");
      }
    }

    if (input.action === 'COUNTER') {
      return tx.saleOffer.update({
        where: { id: offer.id },
        data: {
          status: SaleOfferStatus.COUNTERED,
          counterAmount: input.counterAmount,
          decidedAt: now,
          decidedByUserId: userId ?? null,
          decisionReason: input.reason ?? null
        }
      });
    }

    if (input.action === 'REJECT') {
      return tx.saleOffer.update({
        where: { id: offer.id },
        data: {
          status: SaleOfferStatus.REJECTED,
          decidedAt: now,
          decidedByUserId: userId ?? null,
          decisionReason: input.reason ?? null
        }
      });
    }

    if (input.action === 'ACCEPT') {
      // Une seule offre ACCEPTED vivante par mandat (PRD §3) : une offre
      // acceptée dont le compromis a été annulé ne compte plus.
      const siblings = await tx.saleOffer.findMany({
        where: { tenantId, mandateId: offer.mandateId, status: SaleOfferStatus.ACCEPTED, id: { not: offer.id } },
        select: { id: true }
      });
      for (const sibling of siblings) {
        const siblingAgreement = await tx.saleAgreement.findFirst({
          where: { tenantId, offerId: sibling.id },
          select: { status: true }
        });
        if (!siblingAgreement || siblingAgreement.status !== SaleAgreementStatus.CANCELLED) {
          throw conflict('Une autre offre est déjà acceptée sur ce mandat.');
        }
      }

      const result = await tx.saleOffer.update({
        where: { id: offer.id },
        data: {
          status: SaleOfferStatus.ACCEPTED,
          decidedAt: now,
          decidedByUserId: userId ?? null,
          decisionReason: null
        }
      });

      await setPropertyStatusTx(tx, {
        propertyId: mandate.propertyId,
        tenantId,
        newStatus: PropertyStatus.RESERVED,
        actorUserId: userId ?? 'system',
        notes: `Offre ${offerNumber(offer.year, offer.sequence)} acceptée`
      });

      return result;
    }

    // WITHDRAW
    if (!input.reason || input.reason.trim().length < 3) {
      throw badRequest('Un motif est requis pour retirer une offre');
    }
    if (offer.status === SaleOfferStatus.ACCEPTED) {
      const agreement = await tx.saleAgreement.findFirst({ where: { tenantId, offerId: offer.id } });
      if (agreement && agreement.status !== SaleAgreementStatus.CANCELLED) {
        throw conflict('Cette offre a un compromis en cours : elle ne peut pas être retirée.');
      }
      const result = await tx.saleOffer.update({
        where: { id: offer.id },
        data: {
          status: SaleOfferStatus.WITHDRAWN,
          decidedAt: now,
          decidedByUserId: userId ?? null,
          decisionReason: input.reason
        }
      });
      await setPropertyStatusTx(tx, {
        propertyId: mandate.propertyId,
        tenantId,
        newStatus: PropertyStatus.AVAILABLE,
        actorUserId: userId ?? 'system',
        notes: `Offre ${offerNumber(offer.year, offer.sequence)} retirée`
      });
      return result;
    }

    if (!LIVE_OFFER_STATUSES.includes(offer.status)) {
      throw conflict("Cette offre n'est plus en attente de décision.");
    }
    return tx.saleOffer.update({
      where: { id: offer.id },
      data: {
        status: SaleOfferStatus.WITHDRAWN,
        decidedAt: now,
        decidedByUserId: userId ?? null,
        decisionReason: input.reason
      }
    });
  });

  const dto = await offerDto(prisma, tenantId, updated);
  const names = await userNames(prisma, [updated.decidedByUserId]);
  return { ...dto, decidedByName: updated.decidedByUserId ? (names.get(updated.decidedByUserId) ?? null) : null };
}

/**
 * Clôt les offres encore en attente d'un mandat qui se termine (acte signé ou
 * révocation) : elles passent refusées, avec le motif, sans être effacées.
 */
export async function closeOpenOffersTx(
  tx: PrismaTransactionClient,
  params: { tenantId: string; mandateId: string; userId: string | undefined; reason: string }
): Promise<number> {
  const result = await tx.saleOffer.updateMany({
    where: { tenantId: params.tenantId, mandateId: params.mandateId, status: { in: LIVE_OFFER_STATUSES } },
    data: {
      status: SaleOfferStatus.REJECTED,
      decidedAt: new Date(),
      decidedByUserId: params.userId ?? null,
      decisionReason: params.reason
    }
  });
  return result.count;
}
