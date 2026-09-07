import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Script to seed maintenance permissions
 * This ensures:
 * 1. Maintenance permissions are created
 * 2. TENANT_ADMIN and TENANT_MANAGER roles have MAINTENANCE_ADMIN permission
 * 3. All tenant roles have MAINTENANCE_TENANT permission (for tenant contacts)
 */
async function seedMaintenancePermissions() {
  console.log('🔧 Seeding Maintenance Permissions...\n');

  // Step 1: Create maintenance permissions
  console.log('Step 1: Creating maintenance permissions...');
  const maintenancePermissions = [
    { key: 'MAINTENANCE_TENANT', description: 'Create and view own maintenance tickets' },
    { key: 'MAINTENANCE_ADMIN', description: 'Manage all maintenance tickets and vendors' },
  ];

  const createdPermissions = [];
  for (const perm of maintenancePermissions) {
    const permission = await prisma.permission.upsert({
      where: { key: perm.key },
      update: { description: perm.description },
      create: perm,
    });
    createdPermissions.push(permission);
  }
  console.log(`  ✓ Created ${createdPermissions.length} maintenance permissions\n`);

  // Step 2: Get maintenance permissions
  const maintenanceTenantPerm = createdPermissions.find(p => p.key === 'MAINTENANCE_TENANT');
  const maintenanceAdminPerm = createdPermissions.find(p => p.key === 'MAINTENANCE_ADMIN');

  if (!maintenanceTenantPerm || !maintenanceAdminPerm) {
    console.error('  ❌ Failed to create maintenance permissions!');
    return;
  }

  // Step 3: Assign MAINTENANCE_ADMIN to TENANT_ADMIN and TENANT_MANAGER
  console.log('Step 2: Assigning MAINTENANCE_ADMIN permission to admin roles...');
  const adminRoles = ['TENANT_ADMIN', 'TENANT_MANAGER'];
  
  for (const roleKey of adminRoles) {
    const role = await prisma.role.findUnique({
      where: { key: roleKey },
    });

    if (!role) {
      console.warn(`  ⚠️  Role ${roleKey} not found, skipping...`);
      continue;
    }

    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: role.id,
          permissionId: maintenanceAdminPerm.id,
        },
      },
      update: {},
      create: {
        roleId: role.id,
        permissionId: maintenanceAdminPerm.id,
      },
    });
    console.log(`  ✓ Assigned MAINTENANCE_ADMIN to ${roleKey}`);
  }

  // Step 4: Assign MAINTENANCE_TENANT to all tenant roles (for tenant contacts)
  console.log('\nStep 3: Assigning MAINTENANCE_TENANT permission to all tenant roles...');
  const tenantRoles = ['TENANT_ADMIN', 'TENANT_MANAGER', 'TENANT_AGENT', 'TENANT_ACCOUNTANT'];
  
  for (const roleKey of tenantRoles) {
    const role = await prisma.role.findUnique({
      where: { key: roleKey },
    });

    if (!role) {
      console.warn(`  ⚠️  Role ${roleKey} not found, skipping...`);
      continue;
    }

    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: role.id,
          permissionId: maintenanceTenantPerm.id,
        },
      },
      update: {},
      create: {
        roleId: role.id,
        permissionId: maintenanceTenantPerm.id,
      },
    });
    console.log(`  ✓ Assigned MAINTENANCE_TENANT to ${roleKey}`);
  }

  console.log('\n✅ Maintenance permissions seeding completed!\n');
  console.log('⚠️  Note: Permission cache will be cleared on next request.');
}

/**
 * Assign MAINTENANCE_ADMIN permission to a specific role
 * @param roleKey - Role key (e.g., 'TENANT_ADMIN')
 */
export async function assignMaintenanceAdminToRole(roleKey: string) {
  console.log(`🔧 Assigning MAINTENANCE_ADMIN to role ${roleKey}...\n`);

  const role = await prisma.role.findUnique({
    where: { key: roleKey },
  });

  if (!role) {
    throw new Error(`Role with key ${roleKey} not found`);
  }

  const permission = await prisma.permission.findUnique({
    where: { key: 'MAINTENANCE_ADMIN' },
  });

  if (!permission) {
    throw new Error('MAINTENANCE_ADMIN permission not found. Please run seedMaintenancePermissions first.');
  }

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: permission.id,
      },
    },
    update: {},
    create: {
      roleId: role.id,
      permissionId: permission.id,
    },
  });

  console.log(`  ✓ MAINTENANCE_ADMIN assigned to ${roleKey}\n`);
}

// Execute if run directly
if (require.main === module) {
  seedMaintenancePermissions()
    .catch((e) => {
      console.error('❌ Error seeding maintenance permissions:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { seedMaintenancePermissions };
