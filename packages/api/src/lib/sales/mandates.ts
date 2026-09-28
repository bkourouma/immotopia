import { Prisma, SaleAgreementStatus, SaleMandateStatus, SaleOfferStatus } from '@prisma/client';
import { prisma } from '../../utils/database';
import type { PrismaTransactionClient } from '../../utils/database';
import { badRequest, conflict, notFound } from '../errors';
import { getPropertyForTenant } from '../../utils/property-tenant-guard';
import { assertThirdPartyAllowedForTenant } from '../../services/own-assets-barrier-service';
import { propertyLabels, tenantClientNames, userNames } from './names';
import { mandateNumber, nextSequenceTx } from './numbering';
import { createMandateSchema, revokeMandateSchema, updateMandateSchema } from './schemas';
import type { SaleCoSellerDto, SaleMandateDetailDto, SaleMandateDto } from './types';
import { closeOpenOffersTx, offerDto } from './offers';
import { agreementDto } from './agreements';
import { commissionDto } from './commissions';

/**
 * Mandats de vente (PRD §3, table `SaleMandate`).
 *
 * Un seul mandat `ACTIVE` par bien et par agence : contrôle applicatif, lu
 * avant d'écrire (règle 4 du moteur comptable, même prudence ici bien qu'il
 * n'y ait pas d'écriture) — voir le commentaire du modèle Prisma.
 */

type MandateRow = Prisma.SaleMandateGetPayload<Record<string, never>>;

function isExpired(endDate: Date | null, status: SaleMandateStatus): boolean {
  return status === SaleMandateStatus.ACTIVE && endDate != null && endDate.getTime() < Date.now();
}

async function toMandateDto(
  client: PrismaTransactionClient,
  tenantId: string,
  row: MandateRow,
  extras?: {
    propertyLabelsMap?: Map<string, { label: string; status: string }>;
    sellerNamesMap?: Map<string, string>;
    agentNamesMap?: Map<string, string>;
  }
): Promise<SaleMandateDto> {
  const props = extras?.propertyLabelsMap ?? (await propertyLabels(client, tenantId, [row.propertyId]));
  const sellers = extras?.sellerNamesMap ?? (await tenantClientNames(client, tenantId, [row.sellerClientId]));
  const agents = extras?.agentNamesMap ?? (await userNames(client, [row.agentUserId]));

  const [offersCount, openOffersCount, lastAgreement] = await Promise.all([
    client.saleOffer.count({ where: { tenantId, mandateId: row.id } }),
    client.saleOffer.count({
      where: {
        tenantId,
        mandateId: row.id,
        status: { in: ['SUBMITTED', 'COUNTERED'] },
        OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }]
      }
    }),
    client.saleAgreement.findFirst({
      where: {
        tenantId,
        mandateId: row.id,
        status: { in: [SaleAgreementStatus.DRAFT, SaleAgreementStatus.SIGNED, SaleAgreementStatus.COMPLETED] }
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true }
    })
  ]);

  const property = props.get(row.propertyId);

  return {
    id: row.id,
    number: mandateNumber(row.year, row.sequence),
    propertyId: row.propertyId,
    propertyLabel: property?.label ?? '',
    propertyStatus: property?.status ?? '',
    sellerClientId: row.sellerClientId,
    sellerName: sellers.get(row.sellerClientId) ?? '',
    mandateType: row.mandateType,
    askingPrice: Number(row.askingPrice),
    minimumPrice: row.minimumPrice == null ? null : Number(row.minimumPrice),
    commissionMode: row.commissionMode,
    commissionRate: row.commissionRate == null ? null : Number(row.commissionRate),
    commissionFixedAmount: row.commissionFixedAmount == null ? null : Number(row.commissionFixedAmount),
    commissionPayer: row.commissionPayer,
    agentUserId: row.agentUserId,
    agentName: row.agentUserId ? (agents.get(row.agentUserId) ?? null) : null,
    agentSharePercent: row.agentSharePercent == null ? null : Number(row.agentSharePercent),
    startDate: row.startDate.toISOString(),
    endDate: row.endDate ? row.endDate.toISOString() : null,
    status: row.status,
    isExpired: isExpired(row.endDate, row.status),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    revokeReason: row.revokeReason,
    notes: row.notes,
    openOffersCount,
    offersCount,
    agreementId: lastAgreement?.id ?? null,
    agreementStatus: lastAgreement?.status ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export async function listMandates(
  tenantId: string,
  filters: { status?: string; propertyId?: string; search?: string }
): Promise<SaleMandateDto[]> {
  const where: Prisma.SaleMandateWhereInput = { tenantId };
  if (filters.status) where.status = filters.status as SaleMandateStatus;
  if (filters.propertyId) where.propertyId = filters.propertyId;

  const rows = await prisma.saleMandate.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500 });
  const [props, sellers, agents] = await Promise.all([
    propertyLabels(
      prisma,
      tenantId,
      rows.map(r => r.propertyId)
    ),
    tenantClientNames(
      prisma,
      tenantId,
      rows.map(r => r.sellerClientId)
    ),
    userNames(
      prisma,
      rows.map(r => r.agentUserId)
    )
  ]);

  const dtos = await Promise.all(
    rows.map(row =>
      toMandateDto(prisma, tenantId, row, { propertyLabelsMap: props, sellerNamesMap: sellers, agentNamesMap: agents })
    )
  );

  if (!filters.search) return dtos;
  const needle = filters.search.trim().toLowerCase();
  if (!needle) return dtos;
  return dtos.filter(
    d =>
      d.number.toLowerCase().includes(needle) ||
      d.propertyLabel.toLowerCase().includes(needle) ||
      d.sellerName.toLowerCase().includes(needle)
  );
}

export async function createMandate(
  tenantId: string,
  _userId: string | undefined,
  body: unknown
): Promise<SaleMandateDto> {
  const input = createMandateSchema.parse(body);

  const property = await getPropertyForTenant(input.propertyId, tenantId);
  const seller = await prisma.tenantClient.findFirst({ where: { id: input.sellerClientId, tenantId } });
  if (!seller) throw badRequest('Vendeur introuvable pour cette agence');

  if (input.agentUserId) {
    const agent = await prisma.membership.findFirst({
      where: { userId: input.agentUserId, tenantId, status: 'ACTIVE' }
    });
    if (!agent) throw badRequest("Le négociateur choisi n'est pas un collaborateur actif de cette agence");
  }

  const already = await prisma.saleMandate.findFirst({
    where: { tenantId, propertyId: property.id, status: SaleMandateStatus.ACTIVE },
    select: { id: true }
  });
  if (already) throw conflict('Ce bien porte déjà un mandat de vente actif.');

  // Barriere « detenu en propre » (pack Patrimoine) : avant toute ecriture.
  await assertThirdPartyAllowedForTenant(tenantId, 'MANDATE');

  const created = await prisma.$transaction(async tx => {
    const year = input.startDate.getUTCFullYear();
    const sequence = await nextSequenceTx(tx.saleMandate, tenantId, year);
    return tx.saleMandate.create({
      data: {
        tenantId,
        year,
        sequence,
        propertyId: property.id,
        sellerClientId: seller.id,
        mandateType: input.mandateType,
        askingPrice: input.askingPrice,
        minimumPrice: input.minimumPrice ?? null,
        commissionMode: input.commissionMode,
        commissionRate: input.commissionRate ?? null,
        commissionFixedAmount: input.commissionFixedAmount ?? null,
        commissionPayer: input.commissionPayer,
        agentUserId: input.agentUserId ?? null,
        agentSharePercent: input.agentSharePercent ?? null,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        notes: input.notes ?? null
      }
    });
  });

  return toMandateDto(prisma, tenantId, created);
}

async function coSellers(tenantId: string, propertyId: string): Promise<SaleCoSellerDto[]> {
  const shares = await prisma.propertyOwnershipShare.findMany({
    where: { tenantId, propertyId },
    include: { ownerClient: { include: { user: { select: { fullName: true, email: true } } } } }
  });
  return shares.map(share => ({
    clientId: share.ownerClientId,
    name: share.ownerClient.user.fullName || share.ownerClient.user.email,
    sharePercent: Number(share.sharePercent)
  }));
}

export async function getMandateDetail(tenantId: string, mandateId: string): Promise<SaleMandateDetailDto> {
  const row = await prisma.saleMandate.findFirst({ where: { id: mandateId, tenantId } });
  if (!row) throw notFound('Mandat de vente introuvable');

  const [dto, sellers, offerRows, agreementRows, commissionRow] = await Promise.all([
    toMandateDto(prisma, tenantId, row),
    coSellers(tenantId, row.propertyId),
    prisma.saleOffer.findMany({ where: { tenantId, mandateId: row.id }, orderBy: { createdAt: 'desc' } }),
    prisma.saleAgreement.findMany({ where: { tenantId, mandateId: row.id }, orderBy: { createdAt: 'desc' } }),
    prisma.saleCommission.findFirst({ where: { tenantId, mandateId: row.id } })
  ]);

  const offers = await Promise.all(offerRows.map(o => offerDto(prisma, tenantId, o)));
  const agreements = await Promise.all(agreementRows.map(a => agreementDto(prisma, tenantId, a)));
  const commission = commissionRow ? await commissionDto(prisma, tenantId, commissionRow) : null;

  return { ...dto, coSellers: sellers, offers, agreements, commission };
}

export async function updateMandate(tenantId: string, mandateId: string, body: unknown): Promise<SaleMandateDto> {
  const input = updateMandateSchema.parse(body);
  const row = await prisma.saleMandate.findFirst({ where: { id: mandateId, tenantId } });
  if (!row) throw notFound('Mandat de vente introuvable');
  if (row.status !== SaleMandateStatus.ACTIVE) {
    throw conflict('Seul un mandat actif peut être modifié.');
  }
  const signedAgreement = await prisma.saleAgreement.findFirst({
    where: { tenantId, mandateId: row.id, status: { in: [SaleAgreementStatus.SIGNED, SaleAgreementStatus.COMPLETED] } },
    select: { id: true }
  });
  if (signedAgreement) {
    throw conflict('Ce mandat porte un compromis signé : il ne se modifie plus.');
  }

  const commissionMode = input.commissionMode ?? row.commissionMode;
  const commissionRate =
    input.commissionRate !== undefined ? input.commissionRate : Number(row.commissionRate ?? 0) || null;
  const commissionFixedAmount =
    input.commissionFixedAmount !== undefined
      ? input.commissionFixedAmount
      : row.commissionFixedAmount == null
        ? null
        : Number(row.commissionFixedAmount);
  if (commissionMode === 'PERCENT' && commissionRate == null) {
    throw badRequest('Le taux de commission est requis en mode pourcentage');
  }
  if (commissionMode === 'FIXED' && commissionFixedAmount == null) {
    throw badRequest('Le montant forfaitaire est requis en mode forfait');
  }

  const askingPrice = input.askingPrice ?? Number(row.askingPrice);
  const minimumPrice =
    input.minimumPrice !== undefined ? input.minimumPrice : row.minimumPrice == null ? null : Number(row.minimumPrice);
  if (minimumPrice != null && minimumPrice > askingPrice) {
    throw badRequest('Le prix plancher ne peut pas dépasser le prix demandé');
  }
  const startDate = input.startDate ?? row.startDate;
  const endDate = input.endDate !== undefined ? input.endDate : row.endDate;
  if (endDate && endDate < startDate) {
    throw badRequest('La date de fin ne peut pas précéder la date de début');
  }

  if (input.agentUserId !== undefined && input.agentUserId !== null) {
    const agent = await prisma.membership.findFirst({
      where: { userId: input.agentUserId, tenantId, status: 'ACTIVE' }
    });
    if (!agent) throw badRequest("Le négociateur choisi n'est pas un collaborateur actif de cette agence");
  }

  const updated = await prisma.saleMandate.update({
    where: { id: row.id, tenantId },
    data: {
      mandateType: input.mandateType ?? undefined,
      askingPrice: input.askingPrice ?? undefined,
      minimumPrice: input.minimumPrice !== undefined ? input.minimumPrice : undefined,
      commissionMode: input.commissionMode ?? undefined,
      commissionRate: input.commissionRate !== undefined ? input.commissionRate : undefined,
      commissionFixedAmount: input.commissionFixedAmount !== undefined ? input.commissionFixedAmount : undefined,
      commissionPayer: input.commissionPayer ?? undefined,
      agentUserId: input.agentUserId !== undefined ? input.agentUserId : undefined,
      agentSharePercent: input.agentSharePercent !== undefined ? input.agentSharePercent : undefined,
      startDate: input.startDate ?? undefined,
      endDate: input.endDate !== undefined ? input.endDate : undefined,
      notes: input.notes !== undefined ? input.notes : undefined
    }
  });

  return toMandateDto(prisma, tenantId, updated);
}

export async function revokeMandate(
  tenantId: string,
  userId: string | undefined,
  mandateId: string,
  body: unknown
): Promise<SaleMandateDto> {
  const input = revokeMandateSchema.parse(body);
  const row = await prisma.saleMandate.findFirst({ where: { id: mandateId, tenantId } });
  if (!row) throw notFound('Mandat de vente introuvable');
  if (row.status !== SaleMandateStatus.ACTIVE) {
    throw conflict('Seul un mandat actif peut être révoqué.');
  }
  const signedAgreement = await prisma.saleAgreement.findFirst({
    where: { tenantId, mandateId: row.id, status: SaleAgreementStatus.SIGNED },
    select: { id: true }
  });
  if (signedAgreement) {
    throw conflict('Ce mandat porte un compromis signé : il ne peut pas être révoqué.');
  }
  // Une offre acceptée tient le bien réservé : la retirer d'abord, pour que le
  // bien retrouve son statut par le même chemin qu'ailleurs.
  const acceptedOffers = await prisma.saleOffer.findMany({
    where: { tenantId, mandateId: row.id, status: SaleOfferStatus.ACCEPTED },
    select: { id: true, agreement: { select: { status: true } } }
  });
  const liveAccepted = acceptedOffers.find(
    offer => !offer.agreement || offer.agreement.status !== SaleAgreementStatus.CANCELLED
  );
  if (liveAccepted) {
    throw conflict('Ce mandat porte une offre acceptée : retirez-la avant de révoquer le mandat.');
  }

  const updated = await prisma.$transaction(async tx => {
    const result = await tx.saleMandate.update({
      where: { id: row.id, tenantId },
      data: {
        status: SaleMandateStatus.REVOKED,
        revokedAt: new Date(),
        revokedByUserId: userId ?? null,
        revokeReason: input.reason
      }
    });
    await closeOpenOffersTx(tx, { tenantId, mandateId: row.id, userId, reason: 'Mandat révoqué' });
    return result;
  });

  return toMandateDto(prisma, tenantId, updated);
}

export { toMandateDto };
