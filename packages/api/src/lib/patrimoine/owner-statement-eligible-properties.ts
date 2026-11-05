import { prisma } from '../../utils/database';
import { propertyTenantWhere } from '../../utils/property-tenant-guard';
import { NotFoundError } from '../../middleware/error-middleware';
import { resolveOwnerPortalPropertyIds } from '../owner-portal-scope';

/** Biens que ce contact peut effectivement retenir dans un relevé de gérance. */
export async function listOwnerStatementEligibleProperties(tenantId: string, ownerContactId: string) {
  const owner = await prisma.crmContact.findFirst({
    where: { id: ownerContactId, tenantId },
    select: { id: true }
  });
  if (!owner) throw new NotFoundError('Contact propriétaire introuvable');

  // Même rattachement et même périmètre que generateOwnerStatement : comptes liés
  // au contact CRM, biens du portail/mandats/baux et quotes-parts en indivision.
  const ownerClients = await prisma.tenantClient.findMany({
    where: { tenantId, details: { path: ['crmContactId'], equals: ownerContactId } },
    select: { id: true, userId: true }
  });
  if (ownerClients.length === 0) return [];

  const [scopes, shares] = await Promise.all([
    Promise.all(
      ownerClients.map(client =>
        resolveOwnerPortalPropertyIds({
          userId: client.userId,
          tenantClientId: client.id,
          tenantId,
          restrictToTenantProperties: true
        })
      )
    ),
    prisma.propertyOwnershipShare.findMany({
      where: { tenantId, ownerClientId: { in: ownerClients.map(client => client.id) } },
      select: { propertyId: true }
    })
  ]);
  const propertyIds = Array.from(new Set([...scopes.flat(), ...shares.map(share => share.propertyId)]));
  if (propertyIds.length === 0) return [];

  // La génération ne retient que property.tenantId === tenantId : conserver
  // exactement cette frontière même si le portail peut voir un bien mandaté.
  return prisma.property.findMany({
    where: { ...propertyTenantWhere(tenantId), id: { in: propertyIds } },
    select: { id: true, title: true, internalReference: true, address: true },
    orderBy: [{ title: 'asc' }, { internalReference: 'asc' }, { id: 'asc' }]
  });
}
