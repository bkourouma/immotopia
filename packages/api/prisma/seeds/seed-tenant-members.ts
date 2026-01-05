import { PrismaClient, MembershipStatus, GlobalRole } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Tenant ID
const TENANT_ID = '946f57e2-d1b1-470c-9446-f0a051b54a9a';

async function main() {
  console.log('🌱 Seeding tenant members...\n');
  console.log(`📋 Target Tenant ID: ${TENANT_ID}\n`);

  // Check if tenant exists
  const tenant = await prisma.tenant.findUnique({
    where: { id: TENANT_ID }
  });

  if (!tenant) {
    console.error(`❌ Tenant with ID ${TENANT_ID} not found!`);
    process.exit(1);
  }

  console.log(`✅ Found tenant: ${tenant.name} (${tenant.slug})\n`);

  // Get RBAC roles
  const tenantAdminRole = await prisma.role.findUnique({ where: { key: 'TENANT_ADMIN' } });
  const tenantManagerRole = await prisma.role.findUnique({ where: { key: 'TENANT_MANAGER' } });
  const tenantAgentRole = await prisma.role.findUnique({ where: { key: 'TENANT_AGENT' } });

  if (!tenantAdminRole || !tenantManagerRole || !tenantAgentRole) {
    console.error('❌ Tenant roles not found. Please run RBAC seed first.');
    console.log('💡 Run: npx ts-node prisma/seeds/rbac-seed.ts');
    process.exit(1);
  }

  // Hash password for all users
  const password = 'Test@123456';
  const passwordHash = await bcrypt.hash(password, 10);

  // Define members to create
  const membersData = [
    {
      email: 'manager1@agence-mali.com',
      fullName: 'Manager One',
      roleKey: 'TENANT_MANAGER',
      role: tenantManagerRole
    },
    {
      email: 'manager2@agence-mali.com',
      fullName: 'Manager Two',
      roleKey: 'TENANT_MANAGER',
      role: tenantManagerRole
    },
    {
      email: 'agent1@agence-mali.com',
      fullName: 'Agent One',
      roleKey: 'TENANT_AGENT',
      role: tenantAgentRole
    },
    {
      email: 'agent2@agence-mali.com',
      fullName: 'Agent Two',
      roleKey: 'TENANT_AGENT',
      role: tenantAgentRole
    },
    {
      email: 'agent3@agence-mali.com',
      fullName: 'Agent Three',
      roleKey: 'TENANT_AGENT',
      role: tenantAgentRole
    },
    {
      email: 'agent4@agence-mali.com',
      fullName: 'Agent Four',
      roleKey: 'TENANT_AGENT',
      role: tenantAgentRole
    }
  ];

  console.log('👥 Creating members...\n');

  const createdMembers = [];

  for (const memberData of membersData) {
    // Create or update user
    const user = await prisma.user.upsert({
      where: { email: memberData.email },
      update: {
        fullName: memberData.fullName,
        isActive: true
      },
      create: {
        email: memberData.email,
        passwordHash,
        fullName: memberData.fullName,
        globalRole: GlobalRole.USER,
        emailVerified: true,
        isActive: true
      }
    });

    // Check if membership already exists
    let membership = await prisma.membership.findUnique({
      where: {
        userId_tenantId: {
          userId: user.id,
          tenantId: tenant.id
        }
      }
    });

    if (!membership) {
      // Create membership
      membership = await prisma.membership.create({
        data: {
          userId: user.id,
          tenantId: tenant.id,
          status: MembershipStatus.ACTIVE,
          acceptedAt: new Date()
        }
      });
      console.log(`  ✓ Created membership for ${memberData.fullName}`);
    } else if (membership.status !== MembershipStatus.ACTIVE) {
      // Activate if not active
      membership = await prisma.membership.update({
        where: { id: membership.id },
        data: {
          status: MembershipStatus.ACTIVE,
          acceptedAt: membership.acceptedAt || new Date()
        }
      });
      console.log(`  ✓ Activated membership for ${memberData.fullName}`);
    }

    // Remove existing tenant roles for this user
    await prisma.userRole.deleteMany({
      where: {
        userId: user.id,
        tenantId: tenant.id
      }
    });

    // Assign role
    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: memberData.role.id,
        tenantId: tenant.id
      }
    });

    console.log(`  ✓ Assigned ${memberData.roleKey} to ${memberData.fullName} (${memberData.email})`);
    createdMembers.push({ user, membership, role: memberData.roleKey });
  }

  console.log('\n✅ Members seeded successfully!\n');
  console.log('📋 Summary:');
  console.log(`  • Tenant: ${tenant.name}`);
  console.log(`  • Total Members: ${createdMembers.length}`);
  console.log(`    - MANAGER: ${createdMembers.filter(m => m.role === 'TENANT_MANAGER').length}`);
  console.log(`    - AGENT: ${createdMembers.filter(m => m.role === 'TENANT_AGENT').length}`);
  console.log('\n🔑 Login Credentials (all users):');
  console.log('  Password: Test@123456\n');
  console.log('  Accounts:');
  createdMembers.forEach(m => {
    console.log(`  • ${m.user.email} - ${m.role} (${m.user.fullName})`);
  });
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding members:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });





