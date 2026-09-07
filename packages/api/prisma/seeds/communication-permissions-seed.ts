/**
 * Seed Communication module permissions.
 * Creates COMMUNICATION_VIEW and assigns it to TENANT_ADMIN, TENANT_MANAGER, TENANT_AGENT
 * so that admins, managers and agents can access the Communication module.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const COMMUNICATION_PERMISSION_KEY = 'COMMUNICATION_VIEW';

async function seedCommunicationPermissions() {
  console.log('📬 Seeding Communication permissions...\n');

  const perm = await prisma.permission.upsert({
    where: { key: COMMUNICATION_PERMISSION_KEY },
    update: { description: 'View and manage communication (email notifications)' },
    create: {
      key: COMMUNICATION_PERMISSION_KEY,
      description: 'View and manage communication (email notifications)'
    }
  });
  console.log(`  ✓ Permission ${COMMUNICATION_PERMISSION_KEY} created/updated\n`);

  const roles = ['TENANT_ADMIN', 'TENANT_MANAGER', 'TENANT_AGENT'];
  for (const roleKey of roles) {
    const role = await prisma.role.findUnique({ where: { key: roleKey } });
    if (!role) {
      console.warn(`  ⚠️  Role ${roleKey} not found, skipping...`);
      continue;
    }
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: role.id,
          permissionId: perm.id
        }
      },
      update: {},
      create: {
        roleId: role.id,
        permissionId: perm.id
      }
    });
    console.log(`  ✓ Assigned ${COMMUNICATION_PERMISSION_KEY} to ${roleKey}`);
  }

  console.log('\n✅ Communication permissions seeding completed.\n');
}

if (require.main === module) {
  seedCommunicationPermissions()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('Error:', e);
      process.exit(1);
    });
}

export { seedCommunicationPermissions };
