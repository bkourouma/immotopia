import { PrismaClient, MembershipStatus } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Script to fix rental permissions issue
 * This ensures:
 * 1. Rental permissions are seeded
 * 2. TENANT_ADMIN role has all rental permissions
 * 3. Optionally assigns TENANT_ADMIN role to a user for a tenant
 */
async function fixRentalPermissions() {
  console.log('🔧 Fixing Rental Permissions...\n');

  // Step 1: Ensure rental permissions exist
  console.log('Step 1: Checking rental permissions...');
  const rentalPermissions = [
    { key: 'RENTAL_LEASES_VIEW', description: 'View rental leases' },
    { key: 'RENTAL_LEASES_CREATE', description: 'Create rental leases' },
    { key: 'RENTAL_LEASES_EDIT', description: 'Edit rental leases' },
    { key: 'RENTAL_INSTALLMENTS_VIEW', description: 'View rental installments' },
    { key: 'RENTAL_INSTALLMENTS_GENERATE', description: 'Generate rental installments' },
    { key: 'RENTAL_PAYMENTS_VIEW', description: 'View rental payments' },
    { key: 'RENTAL_PAYMENTS_CREATE', description: 'Create rental payments' },
    { key: 'RENTAL_PAYMENTS_ALLOCATE', description: 'Allocate rental payments' },
    { key: 'RENTAL_PENALTIES_VIEW', description: 'View rental penalties' },
    { key: 'RENTAL_PENALTIES_CALCULATE', description: 'Calculate rental penalties' },
    { key: 'RENTAL_PENALTIES_EDIT', description: 'Edit rental penalties' },
    { key: 'RENTAL_DEPOSITS_VIEW', description: 'View rental security deposits' },
    { key: 'RENTAL_DEPOSITS_CREATE', description: 'Create rental security deposits' },
    { key: 'RENTAL_DEPOSITS_EDIT', description: 'Edit rental security deposits' },
    { key: 'RENTAL_DOCUMENTS_VIEW', description: 'View rental documents' },
    { key: 'RENTAL_DOCUMENTS_GENERATE', description: 'Generate rental documents' },
    { key: 'RENTAL_DOCUMENTS_EDIT', description: 'Edit rental documents' },
  ];

  const createdPermissions = [];
  for (const perm of rentalPermissions) {
    const permission = await prisma.permission.upsert({
      where: { key: perm.key },
      update: { description: perm.description },
      create: perm,
    });
    createdPermissions.push(permission);
  }
  console.log(`  ✓ Ensured ${createdPermissions.length} rental permissions exist\n`);

  // Step 2: Ensure TENANT_ADMIN role exists and has all rental permissions
  console.log('Step 2: Assigning rental permissions to TENANT_ADMIN role...');
  const tenantAdminRole = await prisma.role.findUnique({
    where: { key: 'TENANT_ADMIN' },
  });

  if (!tenantAdminRole) {
    console.error('  ❌ TENANT_ADMIN role not found! Please run the main RBAC seed first.');
    return;
  }

  let assignedCount = 0;
  for (const perm of createdPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: tenantAdminRole.id,
          permissionId: perm.id,
        },
      },
      update: {},
      create: {
        roleId: tenantAdminRole.id,
        permissionId: perm.id,
      },
    });
    assignedCount++;
  }
  console.log(`  ✓ Assigned ${assignedCount} rental permissions to TENANT_ADMIN role\n`);

  // Step 3: Show usage instructions
  console.log('Step 3: Usage instructions');
  console.log('  To assign TENANT_ADMIN role to a user for a tenant, use:');
  console.log('  node -e "require(\'./fix-rental-permissions.ts\').assignTenantAdmin(userId, tenantId)"');
  console.log('  Or use the membership service API endpoint to assign roles.\n');

  console.log('✅ Rental permissions fix completed!\n');
}

/**
 * Assign TENANT_ADMIN role to a user for a specific tenant
 * @param userId - User ID
 * @param tenantId - Tenant ID
 */
export async function assignTenantAdmin(userId: string, tenantId: string) {
  console.log(`🔧 Assigning TENANT_ADMIN role to user ${userId} for tenant ${tenantId}...\n`);

  // Verify user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error(`User with ID ${userId} not found`);
  }

  // Verify tenant exists
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) {
    throw new Error(`Tenant with ID ${tenantId} not found`);
  }

  // Get TENANT_ADMIN role
  const tenantAdminRole = await prisma.role.findUnique({
    where: { key: 'TENANT_ADMIN' },
  });

  if (!tenantAdminRole) {
    throw new Error('TENANT_ADMIN role not found. Please run the RBAC seed first.');
  }

  // Ensure membership exists
  let membership = await prisma.membership.findUnique({
    where: {
      userId_tenantId: {
        userId,
        tenantId,
      },
    },
  });

  if (!membership) {
    console.log('  Creating membership...');
    membership = await prisma.membership.create({
      data: {
        userId,
        tenantId,
        status: MembershipStatus.ACTIVE,
        acceptedAt: new Date(),
      },
    });
    console.log('  ✓ Membership created');
  }

  // Check if role is already assigned
  const existingRole = await prisma.userRole.findFirst({
    where: {
      userId,
      roleId: tenantAdminRole.id,
      tenantId,
    },
  });

  if (!existingRole) {
    // Assign TENANT_ADMIN role
    await prisma.userRole.create({
      data: {
        userId,
        roleId: tenantAdminRole.id,
        tenantId,
      },
    });
    console.log('  ✓ TENANT_ADMIN role assigned');
  } else {
    console.log('  ✓ TENANT_ADMIN role already assigned');
  }

  console.log(`  ✓ TENANT_ADMIN role assigned to ${user.email} for tenant ${tenant.name}\n`);
  console.log('⚠️  Note: Permission cache will be cleared on next request.');
  console.log('✅ Role assignment completed!\n');
}

// Execute if run directly
if (require.main === module) {
  fixRentalPermissions()
    .catch((e) => {
      console.error('❌ Error fixing rental permissions:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { fixRentalPermissions };

