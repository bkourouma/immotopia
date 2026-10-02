import { Prisma } from '@prisma/client';
import { prisma } from '../../../utils/database';
import { assertBelongsToTenant } from '../../../utils/tenant-ownership';
import { getPropertyForTenant } from '../../../utils/property-tenant-guard';
import { BadRequestError, ConflictError, NotFoundError } from '../../../middleware/error-middleware';
import { ownerKindOf } from '../tax/inputs';
import { ensurePropertyAsset } from '../property-asset';
import type {
  CreateEntityHoldingInput,
  CreateHoldingEntityInput,
  SetPropertyHoldingsInput,
  UpdateEntityHoldingInput,
  UpdateHoldingEntityInput
} from './schemas';
import type { EntityHolding, HoldingEntityDetail, HoldingEntitySummary, PropertyHoldingsData } from './dto';

/**
 * Service des entités détentrices et de leurs rattachements (lot P4,
 * territoire A2). Isolation : chaque lecture est un `findFirst({ id,
 * tenantId })`, chaque identifiant reçu (contact, entité mère, entités d'un
 * PUT) est vérifié avec `assertBelongsToTenant` avant écriture ; une
 * référence d'une autre agence répond la même `NotFoundError` qu'un
 * enregistrement inexistant.
 */

const NOT_FOUND_ENTITY = 'Entité introuvable.';
const NOT_FOUND_HOLDING = 'Rattachement introuvable.';

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

function contactDisplayName(contact: {
  firstName: string | null;
  lastName: string | null;
  legalName: string | null;
  email: string | null;
}): string {
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.legalName || contact.email || '';
}

async function findEntityOrThrow(tenantId: string, entityId: string) {
  const entity = await prisma.holdingEntity.findFirst({ where: { id: entityId, tenantId } });
  if (!entity) throw new NotFoundError(NOT_FOUND_ENTITY);
  return entity;
}

/** Un cycle existe si `candidateParentId` est l'entité elle-même ou un de ses descendants. */
async function assertNoCycle(tenantId: string, entityId: string, candidateParentId: string): Promise<void> {
  if (candidateParentId === entityId) {
    throw new BadRequestError('Une entité ne peut pas être sa propre entité mère.');
  }

  let currentId: string | null = candidateParentId;
  const visited = new Set<string>();
  while (currentId) {
    if (currentId === entityId) {
      throw new BadRequestError("Ce rattachement créerait une boucle dans l'organigramme des entités.");
    }
    if (visited.has(currentId)) break;
    visited.add(currentId);
    const current: { parentEntityId: string | null } | null = await prisma.holdingEntity.findFirst({
      where: { id: currentId, tenantId },
      select: { parentEntityId: true }
    });
    currentId = current?.parentEntityId ?? null;
  }
}

function toSummary(
  entity: Prisma.HoldingEntityGetPayload<{
    include: {
      parentEntity: { select: { id: true; name: true } };
      contact: { select: { id: true; firstName: true; lastName: true; legalName: true; email: true } };
      _count: { select: { holdings: { where: { propertyId: { not: null } } } } };
    };
  }>
): HoldingEntitySummary {
  return {
    id: entity.id,
    name: entity.name,
    legalForm: entity.legalForm,
    country: entity.country,
    rccm: entity.rccm,
    taxId: entity.taxId,
    isActive: entity.isActive,
    parentEntity: entity.parentEntity ? { id: entity.parentEntity.id, name: entity.parentEntity.name } : null,
    contact: entity.contact ? { id: entity.contact.id, displayName: contactDisplayName(entity.contact) } : null,
    propertiesCount: entity._count.holdings,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString()
  };
}

const ENTITY_LIST_INCLUDE = {
  parentEntity: { select: { id: true, name: true } },
  contact: { select: { id: true, firstName: true, lastName: true, legalName: true, email: true } },
  // Rattachements à un bien uniquement : une part d'un actif non immobilier
  // (assetId) n'est pas un « bien » de l'entité (lot 1).
  _count: { select: { holdings: { where: { propertyId: { not: null } } } } }
} as const;

// ---------------------------------------------------------------------------
// Entités détentrices
// ---------------------------------------------------------------------------

export async function listHoldingEntities(
  tenantId: string,
  filters: { search?: string; legalForm?: string; country?: string; includeInactive?: boolean }
): Promise<HoldingEntitySummary[]> {
  const where: Prisma.HoldingEntityWhereInput = { tenantId };
  if (!filters.includeInactive) where.isActive = true;
  if (filters.legalForm) where.legalForm = filters.legalForm as Prisma.EnumHoldingEntityFormFilter['equals'];
  if (filters.country) where.country = filters.country as Prisma.EnumFiscalCountryFilter['equals'];
  if (filters.search) where.name = { contains: filters.search, mode: 'insensitive' };

  const entities = await prisma.holdingEntity.findMany({
    where,
    include: ENTITY_LIST_INCLUDE,
    orderBy: { name: 'asc' }
  });

  return entities.map(toSummary);
}

function toDetail(
  entity: Prisma.HoldingEntityGetPayload<{
    include: {
      parentEntity: { select: { id: true; name: true } };
      contact: { select: { id: true; firstName: true; lastName: true; legalName: true; email: true } };
      _count: { select: { holdings: { where: { propertyId: { not: null } } } } };
      children: { select: { id: true; name: true; legalForm: true } };
      holdings: {
        include: {
          property: { select: { id: true; title: true; internalReference: true; propertyType: true; status: true } };
        };
      };
    };
  }>,
  totalShareByProperty: Map<string, number>
): HoldingEntityDetail {
  // Part d'un actif non immobilier : hors consolidation immobilière, lot 1
  // (déjà écartée par la requête ; le garde de type est un filet).
  const holdings: EntityHolding[] = entity.holdings.flatMap(holding => {
    if (holding.propertyId === null || holding.property === null) return [];
    const { property, propertyId } = holding;
    return [
      {
        id: holding.id,
        propertyId,
        sharePercent: Number(holding.sharePercent),
        effectiveFrom: holding.effectiveFrom ? holding.effectiveFrom.toISOString().slice(0, 10) : null,
        notes: holding.notes,
        property: {
          id: property.id,
          title: property.title,
          internalReference: property.internalReference,
          propertyType: property.propertyType,
          status: property.status
        },
        propertyTotalSharePercent: totalShareByProperty.get(propertyId) ?? Number(holding.sharePercent)
      }
    ];
  });

  // `fiscalOwnerKind` partage l'enum Prisma `TaxOwnerKind` (CI/ML compris,
  // avec `ANY`) avec `TaxParameter`, mais sur `HoldingEntity` ce champ n'est
  // jamais `ANY` : `schemas.ts` ne l'accepte pas en saisie.
  const fiscalOwnerKind = entity.fiscalOwnerKind as 'INDIVIDUAL' | 'COMPANY' | null;

  return {
    ...toSummary(entity),
    notes: entity.notes,
    fiscalOwnerKind,
    effectiveOwnerKind: ownerKindOf({ legalForm: entity.legalForm, fiscalOwnerKind }),
    children: entity.children,
    holdings
  };
}

const ENTITY_DETAIL_INCLUDE = {
  ...ENTITY_LIST_INCLUDE,
  children: { select: { id: true, name: true, legalForm: true } },
  // Part d'un actif non immobilier : hors consolidation immobilière, lot 1.
  holdings: {
    where: { propertyId: { not: null } },
    include: {
      property: { select: { id: true, title: true, internalReference: true, propertyType: true, status: true } }
    }
  }
} as const;

async function totalShareByPropertyOf(propertyIds: string[]): Promise<Map<string, number>> {
  if (propertyIds.length === 0) return new Map();
  const rows = await prisma.propertyHolding.groupBy({
    by: ['propertyId'],
    where: { propertyId: { in: propertyIds } },
    _sum: { sharePercent: true }
  });
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (row.propertyId !== null) totals.set(row.propertyId, Number(row._sum.sharePercent ?? 0));
  }
  return totals;
}

export async function getHoldingEntityById(tenantId: string, entityId: string): Promise<HoldingEntityDetail> {
  const entity = await prisma.holdingEntity.findFirst({
    where: { id: entityId, tenantId },
    include: ENTITY_DETAIL_INCLUDE
  });
  if (!entity) throw new NotFoundError(NOT_FOUND_ENTITY);

  const totalShareByProperty = await totalShareByPropertyOf(
    entity.holdings.flatMap(h => (h.propertyId !== null ? [h.propertyId] : []))
  );
  return toDetail(entity, totalShareByProperty);
}

export async function createHoldingEntity(
  tenantId: string,
  data: CreateHoldingEntityInput,
  actorUserId?: string
): Promise<HoldingEntityDetail> {
  await assertBelongsToTenant(prisma, 'crmContact', data.contactId ?? null, tenantId, {
    message: 'Contact introuvable.'
  });
  await assertBelongsToTenant(prisma, 'holdingEntity', data.parentEntityId ?? null, tenantId, {
    message: 'Entité mère introuvable.'
  });

  const existing = await prisma.holdingEntity.findFirst({ where: { tenantId, name: data.name } });
  if (existing) {
    throw new ConflictError('Une entité porte déjà ce nom dans votre agence.');
  }

  let created;
  try {
    created = await prisma.holdingEntity.create({
      data: {
        tenantId,
        name: data.name,
        legalForm: data.legalForm,
        country: data.country,
        rccm: data.rccm ?? null,
        taxId: data.taxId ?? null,
        contactId: data.contactId ?? null,
        parentEntityId: data.parentEntityId ?? null,
        fiscalOwnerKind: data.fiscalOwnerKind ?? null,
        notes: data.notes ?? null,
        createdByUserId: actorUserId ?? null
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError('Une entité porte déjà ce nom dans votre agence.');
    }
    throw error;
  }

  return getHoldingEntityById(tenantId, created.id);
}

export async function updateHoldingEntity(
  tenantId: string,
  entityId: string,
  data: UpdateHoldingEntityInput
): Promise<HoldingEntityDetail> {
  await findEntityOrThrow(tenantId, entityId);

  if (data.contactId !== undefined) {
    await assertBelongsToTenant(prisma, 'crmContact', data.contactId, tenantId, { message: 'Contact introuvable.' });
  }
  if (data.parentEntityId !== undefined && data.parentEntityId !== null) {
    await assertBelongsToTenant(prisma, 'holdingEntity', data.parentEntityId, tenantId, {
      message: 'Entité mère introuvable.'
    });
    await assertNoCycle(tenantId, entityId, data.parentEntityId);
  }

  if (data.name !== undefined) {
    const duplicate = await prisma.holdingEntity.findFirst({
      where: { tenantId, name: data.name, NOT: { id: entityId } }
    });
    if (duplicate) throw new ConflictError('Une entité porte déjà ce nom dans votre agence.');
  }

  try {
    await prisma.holdingEntity.update({
      where: { id: entityId, tenantId },
      data: {
        name: data.name,
        legalForm: data.legalForm,
        country: data.country,
        rccm: data.rccm,
        taxId: data.taxId,
        contactId: data.contactId,
        parentEntityId: data.parentEntityId,
        fiscalOwnerKind: data.fiscalOwnerKind,
        notes: data.notes,
        isActive: data.isActive
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError('Une entité porte déjà ce nom dans votre agence.');
    }
    throw error;
  }

  return getHoldingEntityById(tenantId, entityId);
}

export async function deleteHoldingEntity(tenantId: string, entityId: string): Promise<void> {
  const entity = await findEntityOrThrow(tenantId, entityId);
  const holdingsCount = await prisma.propertyHolding.count({ where: { entityId: entity.id, tenantId } });
  // `assets.holding_entity_id` est en SET NULL : sans ce contrôle, la
  // suppression détacherait silencieusement les actifs de l'entité.
  const assetsCount = await prisma.asset.count({ where: { holdingEntityId: entity.id, tenantId } });
  if (holdingsCount > 0 || assetsCount > 0) {
    throw new ConflictError(
      'Cette entité porte encore des rattachements à des biens ou actifs : détachez-les avant de la supprimer.'
    );
  }
  await prisma.holdingEntity.delete({ where: { id: entityId, tenantId } });
}

// ---------------------------------------------------------------------------
// Rattachements entité -> bien (routes 6-8, vue « depuis l'entité »)
// ---------------------------------------------------------------------------

async function sumOtherShares(tenantId: string, propertyId: string, excludeHoldingId?: string): Promise<number> {
  const rows = await prisma.propertyHolding.findMany({
    where: { tenantId, propertyId, ...(excludeHoldingId ? { NOT: { id: excludeHoldingId } } : {}) },
    select: { sharePercent: true }
  });
  return rows.reduce((sum, row) => sum + Number(row.sharePercent), 0);
}

function assertShareWithinLimit(existingShare: number, newShare: number): void {
  const total = existingShare + newShare;
  if (total > 100 + 0.0001) {
    throw new BadRequestError(
      `La somme des quotes-parts dépasse 100 % (actuellement ${total.toFixed(4).replace(/\.?0+$/, '')} %).`
    );
  }
}

export async function createEntityHolding(
  tenantId: string,
  entityId: string,
  data: CreateEntityHoldingInput,
  actorUserId?: string
): Promise<EntityHolding> {
  await findEntityOrThrow(tenantId, entityId);
  await getPropertyForTenant(data.propertyId, tenantId);

  const existing = await prisma.propertyHolding.findFirst({
    where: { tenantId, propertyId: data.propertyId, entityId }
  });
  if (existing) {
    throw new ConflictError('Cette entité est déjà rattachée à ce bien.');
  }

  const otherShares = await sumOtherShares(tenantId, data.propertyId);
  assertShareWithinLimit(otherShares, data.sharePercent);

  await ensurePropertyAsset(prisma, tenantId, data.propertyId);
  const holding = await prisma.propertyHolding.create({
    data: {
      tenantId,
      propertyId: data.propertyId,
      entityId,
      sharePercent: new Prisma.Decimal(data.sharePercent),
      effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : null,
      notes: data.notes ?? null,
      updatedByUserId: actorUserId ?? null
    },
    include: {
      property: { select: { id: true, title: true, internalReference: true, propertyType: true, status: true } }
    }
  });

  if (!holding.property) throw new NotFoundError('Bien introuvable.');
  const totalShareByProperty = await totalShareByPropertyOf([data.propertyId]);
  return {
    id: holding.id,
    propertyId: data.propertyId,
    sharePercent: Number(holding.sharePercent),
    effectiveFrom: holding.effectiveFrom ? holding.effectiveFrom.toISOString().slice(0, 10) : null,
    notes: holding.notes,
    property: holding.property,
    propertyTotalSharePercent: totalShareByProperty.get(data.propertyId) ?? Number(holding.sharePercent)
  };
}

async function findEntityHoldingOrThrow(tenantId: string, entityId: string, holdingId: string) {
  // Seules les parts d'un bien passent par ces routes ; une part d'actif non
  // immobilier (assetId) répond « introuvable » (territoire du lot actifs).
  const holding = await prisma.propertyHolding.findFirst({
    where: { id: holdingId, tenantId, entityId, propertyId: { not: null } }
  });
  if (!holding || holding.propertyId === null) throw new NotFoundError(NOT_FOUND_HOLDING);
  return { ...holding, propertyId: holding.propertyId };
}

export async function updateEntityHolding(
  tenantId: string,
  entityId: string,
  holdingId: string,
  data: UpdateEntityHoldingInput,
  actorUserId?: string
): Promise<EntityHolding> {
  const existing = await findEntityHoldingOrThrow(tenantId, entityId, holdingId);

  if (data.sharePercent !== undefined) {
    const otherShares = await sumOtherShares(tenantId, existing.propertyId, holdingId);
    assertShareWithinLimit(otherShares, data.sharePercent);
  }

  const updated = await prisma.propertyHolding.update({
    where: { id: holdingId, tenantId },
    data: {
      sharePercent: data.sharePercent !== undefined ? new Prisma.Decimal(data.sharePercent) : undefined,
      effectiveFrom:
        data.effectiveFrom !== undefined ? (data.effectiveFrom ? new Date(data.effectiveFrom) : null) : undefined,
      notes: data.notes,
      updatedByUserId: actorUserId ?? undefined
    },
    include: {
      property: { select: { id: true, title: true, internalReference: true, propertyType: true, status: true } }
    }
  });

  if (!updated.property) throw new NotFoundError('Bien introuvable.');
  const totalShareByProperty = await totalShareByPropertyOf([existing.propertyId]);
  return {
    id: updated.id,
    propertyId: existing.propertyId,
    sharePercent: Number(updated.sharePercent),
    effectiveFrom: updated.effectiveFrom ? updated.effectiveFrom.toISOString().slice(0, 10) : null,
    notes: updated.notes,
    property: updated.property,
    propertyTotalSharePercent: totalShareByProperty.get(existing.propertyId) ?? Number(updated.sharePercent)
  };
}

export async function deleteEntityHolding(tenantId: string, entityId: string, holdingId: string): Promise<void> {
  await findEntityHoldingOrThrow(tenantId, entityId, holdingId);
  await prisma.propertyHolding.delete({ where: { id: holdingId, tenantId } });
}

// ---------------------------------------------------------------------------
// Rattachements bien -> entités (routes 11-12, vue « depuis le bien »)
// ---------------------------------------------------------------------------

function toPropertyHoldingsData(
  propertyId: string,
  holdings: Array<{
    id: string;
    sharePercent: Prisma.Decimal;
    effectiveFrom: Date | null;
    notes: string | null;
    entity: { id: string; name: string; legalForm: string; country: string };
  }>
): PropertyHoldingsData {
  const total = holdings.reduce((sum, h) => sum + Number(h.sharePercent), 0);
  const entitiesById = new Map<string, { id: string; name: string; legalForm: string; country: string }>();
  for (const holding of holdings) entitiesById.set(holding.entity.id, holding.entity);

  return {
    propertyId,
    totalSharePercent: total,
    unassignedSharePercent: Math.max(0, 100 - total),
    holdings: holdings.map(h => ({
      id: h.id,
      entityId: h.entity.id,
      entityName: h.entity.name,
      legalForm: h.entity.legalForm as PropertyHoldingsData['holdings'][number]['legalForm'],
      country: h.entity.country as PropertyHoldingsData['holdings'][number]['country'],
      sharePercent: Number(h.sharePercent),
      effectiveFrom: h.effectiveFrom ? h.effectiveFrom.toISOString().slice(0, 10) : null,
      notes: h.notes
    })),
    entities: Array.from(entitiesById.values()).map(e => ({
      id: e.id,
      name: e.name,
      legalForm: e.legalForm as PropertyHoldingsData['entities'][number]['legalForm'],
      country: e.country as PropertyHoldingsData['entities'][number]['country']
    }))
  };
}

const PROPERTY_HOLDING_INCLUDE = {
  entity: { select: { id: true, name: true, legalForm: true, country: true } }
} as const;

export async function getPropertyHoldings(tenantId: string, propertyId: string): Promise<PropertyHoldingsData> {
  await getPropertyForTenant(propertyId, tenantId);
  const holdings = await prisma.propertyHolding.findMany({
    where: { tenantId, propertyId },
    include: PROPERTY_HOLDING_INCLUDE,
    orderBy: { createdAt: 'asc' }
  });
  return toPropertyHoldingsData(propertyId, holdings);
}

/**
 * Remplace intégralement les rattachements d'un bien. Verrou pessimiste sur
 * la ligne du bien (`FOR UPDATE`, `$queryRaw` tagué) pour sérialiser deux PUT
 * concurrents sur le même bien — même geste que
 * `lib/syndics/provider-invoices.ts`.
 */
export async function setPropertyHoldings(
  tenantId: string,
  propertyId: string,
  input: SetPropertyHoldingsInput,
  actorUserId?: string
): Promise<PropertyHoldingsData> {
  await getPropertyForTenant(propertyId, tenantId);

  const entityIds = input.holdings.map(h => h.entityId);
  const uniqueEntityIds = new Set(entityIds);
  if (uniqueEntityIds.size !== entityIds.length) {
    throw new BadRequestError('Une même entité ne peut apparaître qu’une seule fois dans les rattachements.');
  }

  const totalShare = input.holdings.reduce((sum, h) => sum + h.sharePercent, 0);
  if (totalShare > 100 + 0.0001) {
    throw new BadRequestError(
      `La somme des quotes-parts dépasse 100 % (actuellement ${totalShare.toFixed(4).replace(/\.?0+$/, '')} %).`
    );
  }

  await prisma.$transaction(async tx => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM properties WHERE id = ${propertyId} AND tenant_id = ${tenantId} FOR UPDATE
    `;
    if (locked.length === 0) {
      throw new NotFoundError('Bien introuvable.');
    }

    if (uniqueEntityIds.size > 0) {
      const known = await tx.holdingEntity.count({ where: { tenantId, id: { in: Array.from(uniqueEntityIds) } } });
      if (known !== uniqueEntityIds.size) {
        throw new NotFoundError('Entité introuvable.');
      }
    }

    await tx.propertyHolding.deleteMany({ where: { tenantId, propertyId } });

    if (input.holdings.length > 0) {
      await ensurePropertyAsset(tx, tenantId, propertyId);
      await tx.propertyHolding.createMany({
        data: input.holdings.map(h => ({
          tenantId,
          propertyId,
          entityId: h.entityId,
          sharePercent: new Prisma.Decimal(h.sharePercent),
          effectiveFrom: h.effectiveFrom ? new Date(h.effectiveFrom) : null,
          notes: h.notes ?? null,
          updatedByUserId: actorUserId ?? null
        }))
      });
    }
  });

  return getPropertyHoldings(tenantId, propertyId);
}
