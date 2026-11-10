import { PrismaClient, GlobalRole } from '@prisma/client';
import { hashPassword } from '../../src/utils/password-utils';
import { normalizeAdminEmail, validateBootstrapPassword } from '../../src/utils/bootstrap-admin-input';

import { assertNotProduction } from './assert-not-production';

// Garde en tête : mot de passe par défaut et écrasement de compte, jamais en production.
assertNotProduction('create-super-admin.ts');

const prisma = new PrismaClient();

async function createSuperAdmin() {
  console.log('👤 Creating SUPER_ADMIN account...');

  // Aucun mot de passe par défaut : il doit être fourni explicitement.
  const rawPassword = process.env.SUPER_ADMIN_PASSWORD;
  if (!rawPassword) {
    throw new Error(
      "La variable SUPER_ADMIN_PASSWORD est obligatoire : aucun mot de passe par défaut n'est utilisé. " +
        'Définissez-la avant de relancer ce script.'
    );
  }
  const email = normalizeAdminEmail(process.env.SUPER_ADMIN_EMAIL || 'admin@immobillier.com');
  const fullName = process.env.SUPER_ADMIN_NAME || 'Super Administrator';

  // Mêmes règles que le bootstrap de production (longueur, robustesse, liste de refus).
  validateBootstrapPassword(rawPassword);
  const password = rawPassword;

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
      isActive: true
    },
    create: {
      email,
      passwordHash,
      fullName,
      globalRole: GlobalRole.SUPER_ADMIN,
      emailVerified: true,
      isActive: true
    }
  });

  // Get or create PLATFORM_SUPER_ADMIN role
  const platformSuperAdminRole = await prisma.role.findUnique({
    where: { key: 'PLATFORM_SUPER_ADMIN' }
  });

  if (platformSuperAdminRole) {
    // Assign PLATFORM_SUPER_ADMIN role to user (optional, but good for consistency)
    // Check if already assigned
    const existingUserRole = await prisma.userRole.findFirst({
      where: {
        userId: superAdmin.id,
        roleId: platformSuperAdminRole.id,
        tenantId: null
      }
    });

    if (!existingUserRole) {
      await prisma.userRole.create({
        data: {
          userId: superAdmin.id,
          roleId: platformSuperAdminRole.id,
          tenantId: null // Platform roles have null tenantId
        }
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
  console.log(`   User ID: ${superAdmin.id}`);
  console.log('');
  console.log('   Variables : SUPER_ADMIN_PASSWORD (obligatoire), SUPER_ADMIN_EMAIL, SUPER_ADMIN_NAME');

  return superAdmin;
}

createSuperAdmin()
  .catch(e => {
    console.error('❌ Error creating SUPER_ADMIN:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
