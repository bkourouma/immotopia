import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { logAuditEvent, recordAuditEvent } from './audit-service';
import { ConflictError } from '../middleware/error-middleware';
import { CreateVendorRequest, UpdateVendorRequest } from '../types/maintenance-types';

type ProviderRecord = {
  id: string;
  tenantId: string;
  name: string;
  phone: string | null;
  email: string | null;
  specialty: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type VendorMirrorRecord = {
  id: string;
  tenant_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  specialties: string[];
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

function vendorNameConflict(name: string): ConflictError {
  const message = `Un prestataire nommé « ${name} » existe déjà dans votre agence.`;
  return new ConflictError(message, [{ field: 'name', message }]);
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'P2002';
}

function normalizeSpecialties(values?: string[]): string[] {
  if (!values) return [];
  const cleaned = values.map(item => item.trim()).filter(item => item.length > 0);
  return Array.from(new Set(cleaned));
}

function specialtiesFromProvider(provider: ProviderRecord): string[] {
  if (!provider.specialty) return [];
  return normalizeSpecialties(provider.specialty.split(','));
}

function specialtyForProvider(specialties?: string[]): string | null {
  const normalized = normalizeSpecialties(specialties);
  return normalized.length > 0 ? normalized.join(', ') : null;
}

function toVendorRecord(provider: ProviderRecord, mirror?: VendorMirrorRecord | null): VendorMirrorRecord {
  const derivedSpecialties = mirror?.specialties?.length ? mirror.specialties : specialtiesFromProvider(provider);

  return {
    id: provider.id,
    tenant_id: provider.tenantId,
    name: provider.name,
    phone: provider.phone,
    email: provider.email,
    address: mirror?.address || null,
    specialties: derivedSpecialties,
    is_active: mirror?.is_active ?? true,
    created_at: provider.createdAt,
    updated_at: provider.updatedAt
  };
}

async function upsertVendorMirrorFromProvider(
  provider: ProviderRecord,
  options?: { address?: string | null; specialties?: string[]; isActive?: boolean }
): Promise<VendorMirrorRecord> {
  const normalizedSpecialties =
    options?.specialties !== undefined ? normalizeSpecialties(options.specialties) : specialtiesFromProvider(provider);

  return prisma.maintenanceVendor.upsert({
    where: { id: provider.id, tenant_id: provider.tenantId },
    create: {
      id: provider.id,
      tenant_id: provider.tenantId,
      name: provider.name,
      phone: provider.phone,
      email: provider.email,
      address: options?.address ?? null,
      specialties: normalizedSpecialties,
      is_active: options?.isActive ?? true
    },
    update: {
      name: provider.name,
      phone: provider.phone,
      email: provider.email,
      ...(options?.address !== undefined ? { address: options.address } : {}),
      ...(options?.specialties !== undefined ? { specialties: normalizedSpecialties } : {}),
      ...(options?.isActive !== undefined ? { is_active: options.isActive } : {})
    }
  });
}

/**
 * Create a new maintenance vendor using service_providers as the source of truth.
 */
export async function createVendor(tenantId: string, data: CreateVendorRequest, actorUserId?: string) {
  if (!data.name || data.name.trim().length < 2) {
    throw new Error('Le nom du prestataire doit contenir au moins 2 caracteres');
  }

  const trimmedName = data.name.trim();
  const existing = await prisma.serviceProvider.findFirst({
    where: {
      tenantId,
      name: { equals: trimmedName, mode: 'insensitive' }
    }
  });
  if (existing) {
    throw vendorNameConflict(trimmedName);
  }

  let provider;
  try {
    provider = await prisma.serviceProvider.create({
      data: {
        tenantId,
        name: trimmedName,
        phone: data.phone?.trim() || null,
        email: data.email?.trim() || null,
        specialty: specialtyForProvider(data.specialties)
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw vendorNameConflict(trimmedName);
    throw error;
  }

  const mirror = await upsertVendorMirrorFromProvider(provider as ProviderRecord, {
    address: data.address?.trim() || null,
    specialties: data.specialties || [],
    isActive: true
  });

  logger.info('Maintenance vendor created from service provider', {
    vendorId: provider.id,
    tenantId,
    name: provider.name
  });

  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: 'MAINTENANCE_VENDOR_CREATED',
      entityType: 'MaintenanceVendor',
      entityId: provider.id,
      payload: { name: provider.name, specialties: mirror.specialties }
    });
  }

  return toVendorRecord(provider as ProviderRecord, mirror as VendorMirrorRecord);
}

/**
 * List vendors with filters.
 */
export async function listVendors(
  tenantId: string,
  filters?: { isActive?: boolean; search?: string },
  pagination?: { page?: number; limit?: number }
) {
  const page = pagination?.page || 1;
  const limit = Math.min(pagination?.limit || 20, 100);

  const where: any = { tenantId };
  if (filters?.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { specialty: { contains: filters.search, mode: 'insensitive' } },
      { email: { contains: filters.search, mode: 'insensitive' } },
      { phone: { contains: filters.search, mode: 'insensitive' } }
    ];
  }

  const providers = (await prisma.serviceProvider.findMany({
    where,
    orderBy: { name: 'asc' }
  })) as ProviderRecord[];

  const mirrors = providers.length
    ? ((await prisma.maintenanceVendor.findMany({
        where: {
          tenant_id: tenantId,
          id: { in: providers.map(provider => provider.id) }
        }
      })) as VendorMirrorRecord[])
    : [];

  const mirrorById = new Map(mirrors.map(mirror => [mirror.id, mirror]));
  const merged = providers.map(provider => toVendorRecord(provider, mirrorById.get(provider.id)));

  const filtered =
    filters?.isActive === undefined ? merged : merged.filter(vendor => vendor.is_active === filters.isActive);

  const total = filtered.length;
  const skip = (page - 1) * limit;
  const vendors = filtered.slice(skip, skip + limit);

  return {
    vendors,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

/**
 * Get vendor by ID.
 */
export async function getVendorById(tenantId: string, vendorId: string) {
  const provider = (await prisma.serviceProvider.findFirst({
    where: {
      id: vendorId,
      tenantId
    }
  })) as ProviderRecord | null;

  if (!provider) {
    throw new Error('Prestataire introuvable');
  }

  const mirror = (await prisma.maintenanceVendor.findFirst({
    where: {
      id: vendorId,
      tenant_id: tenantId
    }
  })) as VendorMirrorRecord | null;

  return toVendorRecord(provider, mirror);
}

/**
 * Update vendor.
 */
export async function updateVendor(
  tenantId: string,
  vendorId: string,
  data: UpdateVendorRequest,
  actorUserId?: string
) {
  const existingProvider = (await prisma.serviceProvider.findFirst({
    where: {
      id: vendorId,
      tenantId
    }
  })) as ProviderRecord | null;

  if (!existingProvider) {
    throw new Error('Prestataire introuvable');
  }

  if (data.name && data.name.trim() !== existingProvider.name) {
    const duplicate = await prisma.serviceProvider.findFirst({
      where: {
        tenantId,
        name: { equals: data.name.trim(), mode: 'insensitive' },
        id: { not: vendorId }
      }
    });
    if (duplicate) {
      throw vendorNameConflict(data.name.trim());
    }
  }

  const providerUpdateData: any = {};
  if (data.name !== undefined) providerUpdateData.name = data.name.trim();
  if (data.phone !== undefined) providerUpdateData.phone = data.phone?.trim() || null;
  if (data.email !== undefined) providerUpdateData.email = data.email?.trim() || null;
  if (data.specialties !== undefined) providerUpdateData.specialty = specialtyForProvider(data.specialties);

  let provider: ProviderRecord;
  try {
    provider = (await prisma.serviceProvider.update({
      where: { id: vendorId, tenantId },
      data: providerUpdateData
    })) as ProviderRecord;
  } catch (error) {
    if (isUniqueViolation(error) && typeof providerUpdateData.name === 'string') {
      throw vendorNameConflict(providerUpdateData.name);
    }
    throw error;
  }

  const mirror = await upsertVendorMirrorFromProvider(provider, {
    ...(data.address !== undefined ? { address: data.address?.trim() || null } : {}),
    ...(data.specialties !== undefined ? { specialties: data.specialties } : {}),
    ...(data.isActive !== undefined ? { isActive: data.isActive } : {})
  });

  logger.info('Maintenance vendor updated via service provider', {
    vendorId,
    tenantId,
    actorUserId,
    updatedFields: Object.keys(data || {})
  });

  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: 'MAINTENANCE_VENDOR_UPDATED',
      entityType: 'MaintenanceVendor',
      entityId: vendorId,
      payload: {
        updatedFields: Object.keys(data || {})
      }
    });
  }

  return toVendorRecord(provider, mirror as VendorMirrorRecord);
}

/**
 * Deactivate vendor for maintenance usage.
 */
export async function deactivateVendor(tenantId: string, vendorId: string, actorUserId?: string) {
  const provider = await prisma.serviceProvider.findFirst({
    where: {
      id: vendorId,
      tenantId
    }
  });
  if (!provider) {
    throw new Error('Prestataire introuvable');
  }

  const activeTickets = await prisma.maintenanceTicket.count({
    where: {
      tenant_id: tenantId,
      assigned_vendor_id: vendorId,
      status: { not: 'RESOLVED' }
    }
  });
  if (activeTickets > 0) {
    throw new Error(`Impossible de desactiver ce prestataire car il est assigne a ${activeTickets} ticket(s) actif(s)`);
  }

  const mirror = await upsertVendorMirrorFromProvider(provider as ProviderRecord, { isActive: false });

  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: 'MAINTENANCE_VENDOR_DEACTIVATED',
      entityType: 'MaintenanceVendor',
      entityId: vendorId,
      payload: {}
    });
  }

  return toVendorRecord(provider as ProviderRecord, mirror as VendorMirrorRecord);
}

/**
 * Delete vendor permanently from both maintenance and syndic provider sources.
 */
export async function deleteVendor(tenantId: string, vendorId: string, actorUserId?: string) {
  const provider = await prisma.serviceProvider.findFirst({
    where: {
      id: vendorId,
      tenantId
    }
  });
  if (!provider) {
    throw new Error('Prestataire introuvable');
  }

  const assignedTickets = await prisma.maintenanceTicket.count({
    where: {
      tenant_id: tenantId,
      assigned_vendor_id: vendorId
    }
  });
  if (assignedTickets > 0) {
    throw new Error(
      `Impossible de supprimer ce prestataire car il est assigne a ${assignedTickets} ticket(s). Veuillez d'abord reassigner ou resoudre ces tickets.`
    );
  }

  const syndicContractsCount = await prisma.maintenanceContract.count({
    where: {
      providerId: vendorId,
      provider: {
        tenantId
      }
    }
  });
  if (syndicContractsCount > 0) {
    throw new Error(
      `Impossible de supprimer ce prestataire car il est lie a ${syndicContractsCount} contrat(s) syndic.`
    );
  }

  await prisma.$transaction(
    async tx => {
      await tx.maintenanceVendor.deleteMany({
        where: {
          id: vendorId,
          tenant_id: tenantId
        }
      });
      await tx.serviceProvider.delete({
        where: { id: vendorId, tenantId }
      });

      if (actorUserId) {
        await recordAuditEvent(tx, {
          actorUserId,
          tenantId,
          actionKey: 'MAINTENANCE_VENDOR_DELETED',
          entityType: 'MaintenanceVendor',
          entityId: vendorId,
          payload: {
            vendorName: provider.name
          }
        });
      }
    },
    { timeout: 20_000 }
  );

  return { id: vendorId, name: provider.name };
}

/**
 * Get active vendors for maintenance assignment.
 */
export async function getActiveVendors(tenantId: string) {
  const providers = (await prisma.serviceProvider.findMany({
    where: { tenantId },
    orderBy: { name: 'asc' }
  })) as ProviderRecord[];

  // Ensure each shared provider can still be assigned in maintenance tickets.
  await Promise.all(
    providers.map(provider =>
      upsertVendorMirrorFromProvider(provider, {
        specialties: specialtiesFromProvider(provider),
        isActive: true
      })
    )
  );

  const mirrors = (await prisma.maintenanceVendor.findMany({
    where: {
      tenant_id: tenantId,
      id: { in: providers.map(provider => provider.id) }
    }
  })) as VendorMirrorRecord[];
  const mirrorById = new Map(mirrors.map(mirror => [mirror.id, mirror]));

  return providers
    .map(provider => toVendorRecord(provider, mirrorById.get(provider.id)))
    .filter(vendor => vendor.is_active !== false);
}
