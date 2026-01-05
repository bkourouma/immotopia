import { PrismaClient, GlobalRole } from '@prisma/client';
import { hashPassword } from '../../src/utils/password-utils';

const prisma = new PrismaClient();

async function createSuperAdmin() {
  console.log('👤 Creating SUPER_ADMIN account...');

  // Default credentials - CHANGE THESE IN PRODUCTION!
  const email = process.env.SUPER_ADMIN_EMAIL || 'admin@immobillier.com';
  const password = process.env.SUPER_ADMIN_PASSWORD || 'Admin@123456';
  const fullName = process.env.SUPER_ADMIN_NAME || 'Super Administrator';

  // Validate password strength
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Create or update SUPER_ADMIN user
  const superAdmin = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      fullName,
      globalRole: GlobalRole.SUPER_ADMIN,
      emailVerified: true,
      isActive: true,
    },
    create: {
      email,
      passwordHash,
      fullName,
      globalRole: GlobalRole.SUPER_ADMIN,
      emailVerified: true,
      isActive: true,
    },
  });

  // Get or create PLATFORM_SUPER_ADMIN role
  const platformSuperAdminRole = await prisma.role.findUnique({
    where: { key: 'PLATFORM_SUPER_ADMIN' },
  });

  if (platformSuperAdminRole) {
    // Assign PLATFORM_SUPER_ADMIN role to user (optional, but good for consistency)
    // Check if already assigned
    const existingUserRole = await prisma.userRole.findFirst({
      where: {
        userId: superAdmin.id,
        roleId: platformSuperAdminRole.id,
        tenantId: null,
      },
    });

    if (!existingUserRole) {
      await prisma.userRole.create({
        data: {
          userId: superAdmin.id,
          roleId: platformSuperAdminRole.id,
          tenantId: null, // Platform roles have null tenantId
        },
      });
      console.log('  ✓ Assigned PLATFORM_SUPER_ADMIN role');
    } else {
      console.log('  ✓ PLATFORM_SUPER_ADMIN role already assigned');
    }
  } else {
    console.log('  ⚠️  PLATFORM_SUPER_ADMIN role not found. Run RBAC seed first.');
    console.log('     SUPER_ADMIN will still have all permissions via globalRole check.');
  }

  console.log('✅ SUPER_ADMIN account created successfully!');
  console.log(`   Email: ${email}`);
  console.log(`   Password: ${password}`);
  console.log(`   User ID: ${superAdmin.id}`);
  console.log('');
  console.log('⚠️  IMPORTANT: Change the default password after first login!');
  console.log('   You can set custom credentials using environment variables:');
  console.log('   - SUPER_ADMIN_EMAIL');
  console.log('   - SUPER_ADMIN_PASSWORD');
  console.log('   - SUPER_ADMIN_NAME');

  return superAdmin;
}

createSuperAdmin()
  .catch((e) => {
    console.error('❌ Error creating SUPER_ADMIN:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

