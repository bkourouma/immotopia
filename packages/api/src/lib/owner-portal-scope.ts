import { Prisma, PropertyOwnershipType } from '@prisma/client';
import { prisma } from '../utils/database';

/**
 * Périmètre du portail propriétaire : UNE seule fonction décide quels biens
 * un propriétaire connecté voit sur le portail d'UNE agence (BUG-057).
 * `req.ownerPortal.propertyIds` en est le résultat ; tous les écrans
 * (biens, tableau de bord, revenus, documents, incidents, rapports, exports,
 * patrimoine) filtrent sur cette liste — un identifiant hors liste se
 * comporte comme un objet inexistant.
 *
 * Règle :
 * - bien de l'agence (ownershipType TENANT) rattaché au propriétaire
 *   (`ownerUserId`) ;
 * - bien CLIENT du propriétaire (`tenantId` nul en général) sous mandat de
 *   gestion ACTIF de CETTE agence : `isActive`, non révoqué, commencé et non
 *   échu ;
 * - bien loué par un bail de cette agence dont le propriétaire est ce client ;
 * - un bien CLIENT sans mandat actif de cette agence est toujours exclu
 *   (mandat résilié, échu, ou mandat d'une autre agence).
 */
export function activeMandateWhere(tenantId: string, now: Date = new Date()): Prisma.PropertyMandateWhereInput {
  return {
    tenantId,
    isActive: true,
    revokedAt: null,
    startDate: { lte: now },
    OR: [{ endDate: null }, { endDate: { gte: now } }]
  };
}

export async function resolveOwnerPortalPropertyIds(params: {
  userId: string;
  tenantClientId: string;
  tenantId: string;
  now?: Date;
}): Promise<string[]> {
  const { userId, tenantClientId, tenantId } = params;
  const now = params.now ?? new Date();

  // Mandats de gestion ACTIFS de cette agence pour ce propriétaire.
  const mandates = await prisma.propertyMandate.findMany({
    where: { ...activeMandateWhere(tenantId, now), ownerUserId: userId },
    select: { propertyId: true }
  });
  const mandatedIds = new Set(mandates.map(m => m.propertyId));

  const [direct, mandatedProps, leased] = await Promise.all([
    prisma.property.findMany({
      where: { ownerUserId: userId, tenantId, ownershipType: { not: PropertyOwnershipType.CLIENT } },
      select: { id: true }
    }),
    mandatedIds.size
      ? prisma.property.findMany({
          where: {
            id: { in: Array.from(mandatedIds) },
            ownerUserId: userId,
            ownershipType: PropertyOwnershipType.CLIENT
          },
          select: { id: true }
        })
      : Promise.resolve([] as { id: string }[]),
    prisma.rentalLease.findMany({
      where: { owner_client_id: tenantClientId, tenant_id: tenantId },
      select: { property_id: true },
      distinct: ['property_id']
    })
  ]);

  // Un bien CLIENT loué reste exclu sans mandat actif de cette agence.
  const leasedIds = leased.map(l => l.property_id);
  let leasedAllowed = leasedIds;
  if (leasedIds.length > 0) {
    const clientProps = await prisma.property.findMany({
      where: { id: { in: leasedIds }, ownershipType: PropertyOwnershipType.CLIENT },
      select: { id: true }
    });
    const clientIds = new Set(clientProps.map(p => p.id));
    leasedAllowed = leasedIds.filter(id => !clientIds.has(id) || mandatedIds.has(id));
  }

  return Array.from(new Set([...direct.map(p => p.id), ...mandatedProps.map(p => p.id), ...leasedAllowed]));
}

/**
 * Filtre `Property` du portail. `propertyIds` est déjà le périmètre strict ;
 * la clause `OR` sur `tenantId` nomme le champ pour le garde-fou Prisma tout
 * en acceptant un bien CLIENT (`tenantId` nul, rattaché par mandat).
 */
export function ownerPortalPropertyWhere(propertyIds: string[], tenantId: string): Prisma.PropertyWhereInput {
  return { id: { in: propertyIds }, OR: [{ tenantId }, { tenantId: null }] };
}
