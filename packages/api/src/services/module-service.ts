import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { ModuleKey } from '@prisma/client';
import { UpdateTenantModulesRequest } from '../types/tenant-types';
import { logAuditEvent, AuditActionKey } from './audit-service';

/**
 * Get all modules for a tenant
 * @param tenantId - Tenant ID
 * @returns List of tenant modules with enabled status
 */
export async function getTenantModules(tenantId: string) {
  // Verify tenant exists
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId }
  });

  if (!tenant) {
    throw new Error('Tenant introuvable.');
  }

  // Get all possible modules
  const allModules = Object.values(ModuleKey);

  // Get tenant's module configurations
  const tenantModules = await prisma.tenantModule.findMany({
    where: { tenantId }
  });

  // Create a map of enabled modules
  const enabledModulesMap = new Map(tenantModules.filter(tm => tm.enabled).map(tm => [tm.moduleKey, tm]));

  // Return all modules with their enabled status
  return allModules.map(moduleKey => {
    const tenantModule = enabledModulesMap.get(moduleKey);
    return {
      moduleKey,
      enabled: tenantModule?.enabled || false,
      enabledAt: tenantModule?.enabledAt || null,
      enabledBy: tenantModule?.enabledBy || null
    };
  });
}

/**
 * Update tenant modules (enable/disable)
 * @param tenantId - Tenant ID
 * @param data - Module update data
 * @param actorUserId - User ID performing the update (for audit log)
 * @returns Updated tenant modules
 */
export async function updateTenantModules(tenantId: string, data: UpdateTenantModulesRequest, actorUserId?: string) {
  // Verify tenant exists
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId }
  });

  if (!tenant) {
    throw new Error('Tenant introuvable.');
  }

  // Validate module keys
  const validModuleKeys = Object.values(ModuleKey);
  for (const module of data.modules) {
    if (!validModuleKeys.includes(module.moduleKey as ModuleKey)) {
      throw new Error(`Module invalide: ${module.moduleKey}`);
    }
  }

  // Update modules in transaction
  const results = await prisma.$transaction(
    data.modules.map(module =>
      prisma.tenantModule.upsert({
        where: {
          tenantId_moduleKey: {
            tenantId,
            moduleKey: module.moduleKey as ModuleKey
          }
        },
        update: {
          enabled: module.enabled,
          enabledAt: module.enabled ? new Date() : null,
          enabledBy: module.enabled ? actorUserId || null : null
        },
        create: {
          tenantId,
          moduleKey: module.moduleKey as ModuleKey,
          enabled: module.enabled,
          enabledAt: module.enabled ? new Date() : null,
          enabledBy: module.enabled ? actorUserId || null : null
        }
      })
    )
  );

  // Audit log for each module change
  if (actorUserId) {
    for (const module of data.modules) {
      logAuditEvent({
        actorUserId,
        tenantId,
        actionKey: module.enabled ? AuditActionKey.MODULE_ENABLED : AuditActionKey.MODULE_DISABLED,
        entityType: 'TenantModule',
        entityId: `${tenantId}:${module.moduleKey}`,
        payload: {
          moduleKey: module.moduleKey,
          enabled: module.enabled
        }
      });
    }
  }

  logger.info('Tenant modules updated', {
    tenantId,
    modulesUpdated: data.modules.length
  });

  return results;
}

/**
 * Check if a module is enabled for a tenant
 * @param tenantId - Tenant ID
 * @param moduleKey - Module key to check
 * @returns True if module is enabled
 */
export async function isModuleEnabled(tenantId: string, moduleKey: ModuleKey): Promise<boolean> {
  const tenantModule = await prisma.tenantModule.findUnique({
    where: {
      tenantId_moduleKey: {
        tenantId,
        moduleKey
      }
    }
  });

  return tenantModule?.enabled || false;
}

/**
 * Get enabled modules for a tenant (as array of keys)
 * @param tenantId - Tenant ID
 * @returns Array of enabled module keys
 */
export async function getEnabledModules(tenantId: string): Promise<ModuleKey[]> {
  const tenantModules = await prisma.tenantModule.findMany({
    where: {
      tenantId,
      enabled: true
    },
    select: {
      moduleKey: true
    }
  });

  return tenantModules.map(tm => tm.moduleKey);
}




