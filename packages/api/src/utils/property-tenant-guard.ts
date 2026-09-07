import { prisma } from './database';

/**
 * Load a property and assert it belongs to the given tenant.
 *
 * Property children (media, documents, status history) are not scoped by
 * tenantId in the schema, so every service that touches them must resolve the
 * parent property through this guard. Looking a property up by id alone lets a
 * user of tenant A act on tenant B's property (IDOR).
 *
 * @param propertyId - Property being acted upon
 * @param tenantId - Tenant the caller is authorised for (req.propertyTenantId)
 * @returns The property row
 * @throws Error('Property not found') when the property does not exist or
 *         belongs to another tenant (same message either way, so the endpoint
 *         does not confirm the existence of another tenant's property)
 */
export async function getPropertyForTenant(propertyId: string, tenantId: string) {
  if (!tenantId) {
    throw new Error('Tenant ID is required for property operations');
  }

  const property = await prisma.property.findFirst({
    where: { id: propertyId, tenantId }
  });

  if (!property) {
    throw new Error('Property not found');
  }

  return property;
}
