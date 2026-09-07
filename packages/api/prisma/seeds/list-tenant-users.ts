import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Script to list all users for a specific tenant with their roles
 * Usage: 
 *   ts-node prisma/seeds/list-tenant-users.ts <tenantId>
 * Example:
 *   ts-node prisma/seeds/list-tenant-users.ts e3e428d1-364b-42c9-a102-a22daa9329c5
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('❌ Usage: ts-node list-tenant-users.ts <tenantId>');
    console.error('   Example: ts-node list-tenant-users.ts e3e428d1-364b-42c9-a102-a22daa9329c5');
    process.exit(1);
  }

  const tenantId = args[0];

  console.log(`📋 Listing users for tenant: ${tenantId}\n`);

  // Verify tenant exists
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, subdomain: true }
  });

  if (!tenant) {
    console.error(`❌ Tenant not found: ${tenantId}`);
    process.exit(1);
  }

  console.log(`Tenant: ${tenant.name} (${tenant.subdomain || 'N/A'})\n`);
  console.log('─'.repeat(80));

  // Get all memberships for this tenant
  const memberships = await prisma.membership.findMany({
    where: { tenantId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
          globalRole: true,
          isActive: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  if (memberships.length === 0) {
    console.log('\n⚠️  No users found for this tenant.\n');
    return;
  }

  console.log(`\nFound ${memberships.length} user(s):\n`);

  for (const membership of memberships) {
    const user = membership.user;
    
    // Get user roles for this tenant
    const userRoles = await prisma.userRole.findMany({
      where: {
        userId: user.id,
        tenantId: tenantId
      },
      include: {
        role: {
          select: {
            key: true,
            name: true,
            scope: true
          }
        }
      }
    });
    
    const roles = userRoles.map(ur => ur.role);

    console.log(`👤 ${user.fullName || 'N/A'} (${user.email})`);
    console.log(`   User ID: ${user.id}`);
    console.log(`   Global Role: ${user.globalRole}`);
    console.log(`   Status: ${membership.status}`);
    console.log(`   Active: ${user.isActive ? '✅' : '❌'}`);

    if (roles.length > 0) {
      console.log(`   Roles (${roles.length}):`);
      for (const role of roles) {
        const hasRentalPerms = role.key === 'TENANT_ADMIN' || role.key === 'PLATFORM_SUPER_ADMIN';
        console.log(`      - ${role.name} (${role.key}) ${hasRentalPerms ? '✅ Has rental permissions' : '❌ No rental permissions'}`);
      }
    } else {
      console.log(`   Roles: ❌ No roles assigned`);
    }

    console.log('');
  }

  console.log('─'.repeat(80));
  console.log('\n💡 To assign TENANT_ADMIN role to a user, run:');
  console.log(`   npm run db:assign:tenant-admin <email|userId> ${tenantId}\n`);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

