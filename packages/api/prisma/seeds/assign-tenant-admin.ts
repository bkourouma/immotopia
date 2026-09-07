import { PrismaClient, MembershipStatus } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Script to assign TENANT_ADMIN role to a user for a specific tenant
 * Usage: 
 *   ts-node prisma/seeds/assign-tenant-admin.ts <email|userId> <tenantId>
 * Example:
 *   ts-node prisma/seeds/assign-tenant-admin.ts user@example.com e3e428d1-364b-42c9-a102-a22daa9329c5
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('❌ Usage: ts-node assign-tenant-admin.ts <email|userId> <tenantId>');
    console.error('   Example: ts-node assign-tenant-admin.ts user@example.com e3e428d1-364b-42c9-a102-a22daa9329c5');
    process.exit(1);
  }

  const userIdentifier = args[0];
  const tenantId = args[1];

  console.log(`🔧 Assigning TENANT_ADMIN role...\n`);
  console.log(`   User: ${userIdentifier}`);
  console.log(`   Tenant: ${tenantId}\n`);

  // Find user by email or ID
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: userIdentifier },
        { id: userIdentifier }
      ]
    }
  });

  if (!user) {
    console.error(`❌ User not found: ${userIdentifier}`);
    process.exit(1);
  }

  console.log(`✓ Found user: ${user.email} (${user.id})\n`);

  // Verify tenant exists
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) {
    console.error(`❌ Tenant not found: ${tenantId}`);
    process.exit(1);
  }

  console.log(`✓ Found tenant: ${tenant.name} (${tenant.id})\n`);

  // Get TENANT_ADMIN role
  const tenantAdminRole = await prisma.role.findUnique({
    where: { key: 'TENANT_ADMIN' },
  });

  if (!tenantAdminRole) {
    console.error('❌ TENANT_ADMIN role not found. Please run: npm run db:seed:rbac');
    process.exit(1);
  }

  console.log(`✓ Found role: ${tenantAdminRole.name}\n`);

  // Ensure membership exists
  let membership = await prisma.membership.findUnique({
    where: {
      userId_tenantId: {
        userId: user.id,
        tenantId: tenantId,
      },
    },
  });

  if (!membership) {
    console.log('Creating membership...');
    membership = await prisma.membership.create({
      data: {
        userId: user.id,
        tenantId: tenantId,
        status: MembershipStatus.ACTIVE,
        acceptedAt: new Date(),
      },
    });
    console.log('✓ Membership created\n');
  } else {
    console.log('✓ Membership already exists\n');
  }

  // Check if role is already assigned
  const existingRole = await prisma.userRole.findFirst({
    where: {
      userId: user.id,
      roleId: tenantAdminRole.id,
      tenantId: tenantId,
    },
  });

  if (!existingRole) {
    // Assign TENANT_ADMIN role
    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: tenantAdminRole.id,
        tenantId: tenantId,
      },
    });
    console.log('✅ TENANT_ADMIN role assigned successfully!\n');
  } else {
    console.log('ℹ️  TENANT_ADMIN role already assigned\n');
  }

  console.log('⚠️  Note: Permission cache will be cleared on next request.');
  console.log('   If the API server is running, you may need to wait up to 5 minutes');
  console.log('   or restart the server to see changes immediately.\n');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

