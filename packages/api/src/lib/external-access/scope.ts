import { Prisma, PropertyOwnershipType } from '@prisma/client';
import { prisma } from '../../utils/database';
import { activeMandateWhere } from '../owner-portal-scope';
import { MAX_SCOPE_PROPERTIES } from './sections';

/**
 * Périmètre d'un accès tiers : la liste des biens qu'il ouvre.
 *
 * Règle UNIQUE (écriture ET consultation) : un bien est dans le périmètre s'il
 * appartient à l'agence (`tenantId`), ou s'il est un bien CLIENT sans agence
 * (`tenantId` nul) sous mandat de gestion ACTIF de CETTE agence
 * (`activeMandateWhere`, la même définition que le portail propriétaire).
 * Un identifiant d'une autre agence ou d'un bien sans mandat actif se comporte
 * comme un identifiant inexistant.
 *
 * Le périmètre n'est jamais dynamique « tout ce que possède X » : il se compose
 * de biens listés (`ExternalAccessGrantProperty`) et d'entités détentrices
 * listées (`ExternalAccessGrantEntity`), développées en biens par
 * `PropertyHolding` à chaque consultation, puis refiltrées par la règle
 * ci-dessus.
 *
 * Les lectures de `Property` ne sélectionnent jamais `tenantId` : un bien
 * CLIENT sous mandat le porte nul, et l'extension Prisma de garde y verrait
 * une fuite.
 */

/** Filtre `Property` : biens de l'agence, ou biens CLIENT sous mandat actif de l'agence. */
export function agencyPropertyWhere(tenantId: string, now: Date = new Date()): Prisma.PropertyWhereInput {
  return {
    OR: [
      { tenantId },
      {
        tenantId: null,
        ownershipType: PropertyOwnershipType.CLIENT,
        mandates: { some: activeMandateWhere(tenantId, now) }
      }
    ]
  };
}

/** Colonnes d'un bien du périmètre : identification et titres seulement. */
export const SCOPE_PROPERTY_SELECT = {
  id: true,
  internalReference: true,
  title: true,
  address: true,
  locationZone: true,
  propertyType: true,
  surfaceArea: true,
  ownershipType: true
} satisfies Prisma.PropertySelect;

export type ScopeProperty = Prisma.PropertyGetPayload<{ select: typeof SCOPE_PROPERTY_SELECT }>;

/** Entités (de CETTE agence) parmi celles demandées. */
export async function entitiesInAgency(tenantId: string, entityIds: string[]): Promise<string[]> {
  if (entityIds.length === 0) return [];
  const rows = await prisma.holdingEntity.findMany({
    where: { tenantId, id: { in: entityIds } },
    select: { id: true }
  });
  return rows.map(row => row.id);
}

/** Biens détenus par ces entités (parmi celles de l'agence), sans filtre de périmètre. */
export async function propertyIdsHeldByEntities(tenantId: string, entityIds: string[]): Promise<string[]> {
  const agencyEntityIds = await entitiesInAgency(tenantId, entityIds);
  if (agencyEntityIds.length === 0) return [];
  const holdings = await prisma.propertyHolding.findMany({
    where: { tenantId, entityId: { in: agencyEntityIds } },
    select: { propertyId: true }
  });
  // Les parts d'un actif non immobilier (propertyId nul, ADR-005) ne désignent aucun bien.
  return Array.from(new Set(holdings.map(holding => holding.propertyId).filter((id): id is string => id !== null)));
}

/** Parmi `candidateIds`, les biens réellement dans le périmètre de l'agence (tri stable par titre). */
export async function propertiesInAgencyScope(
  tenantId: string,
  candidateIds: string[],
  options: { limit?: number } = {}
): Promise<ScopeProperty[]> {
  const ids = Array.from(new Set(candidateIds));
  if (ids.length === 0) return [];
  return prisma.property.findMany({
    where: { AND: [{ id: { in: ids } }, agencyPropertyWhere(tenantId)] },
    select: SCOPE_PROPERTY_SELECT,
    orderBy: [{ title: 'asc' }, { id: 'asc' }],
    // Une ligne de plus que le plafond : sert à détecter un dépassement sans tout charger.
    take: options.limit ?? MAX_SCOPE_PROPERTIES + 1
  });
}

/**
 * Biens ouverts par un grant AU MOMENT de l'appel : liste explicite + entités
 * développées, refiltrées par la règle de périmètre. Seul `grantId` (lu du
 * lien, jamais de l'appelant) et `tenantId` (celui du grant) entrent ici.
 */
export interface GrantScope {
  /** Au plus `MAX_SCOPE_PROPERTIES` biens, triés par titre. */
  properties: ScopeProperty[];
  /** Vrai si le périmètre développé dépassait le plafond et a été tronqué. */
  truncated: boolean;
  /** Entités détentrices listées dans le grant (vide : accès par biens seulement). */
  grantEntityIds: string[];
}

export async function resolveGrantScope(tenantId: string, grantId: string): Promise<GrantScope> {
  const [propertyRows, entityRows] = await Promise.all([
    prisma.externalAccessGrantProperty.findMany({ where: { tenantId, grantId }, select: { propertyId: true } }),
    prisma.externalAccessGrantEntity.findMany({ where: { tenantId, grantId }, select: { entityId: true } })
  ]);

  const candidates = new Set(propertyRows.map(row => row.propertyId));
  if (entityRows.length > 0) {
    for (const id of await propertyIdsHeldByEntities(
      tenantId,
      entityRows.map(row => row.entityId)
    )) {
      candidates.add(id);
    }
  }
  const rows = await propertiesInAgencyScope(tenantId, Array.from(candidates));
  const truncated = rows.length > MAX_SCOPE_PROPERTIES;
  return {
    properties: truncated ? rows.slice(0, MAX_SCOPE_PROPERTIES) : rows,
    truncated,
    grantEntityIds: entityRows.map(row => row.entityId)
  };
}
