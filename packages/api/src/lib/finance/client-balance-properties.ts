import { prisma } from '../../utils/database';
import { propertyTenantWhere } from '../../utils/property-tenant-guard';

/** Métadonnées strictement nécessaires au filtre Bien des balances clients. */
export async function listClientBalanceProperties(tenantId: string): Promise<Array<{ id: string; title: string }>> {
  const rows = await prisma.property.findMany({
    where: { ...propertyTenantWhere(tenantId), rentalLeases: { some: { tenant_id: tenantId } } },
    select: { id: true, title: true, internalReference: true }
  });

  return rows
    .map(row => ({ id: row.id, title: row.title || row.internalReference }))
    .sort((a, b) => a.title.localeCompare(b.title));
}
