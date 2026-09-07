import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedPropertyPermissions() {
  console.log('📋 Seeding Property permissions...');

  // Property permissions as specified in FR-027
  const propertyPermissions = [
    { key: 'PROPERTIES_VIEW', description: 'View properties' },
    { key: 'PROPERTIES_CREATE', description: 'Create properties' },
    { key: 'PROPERTIES_EDIT', description: 'Edit properties' },
    { key: 'PROPERTIES_DELETE', description: 'Delete/archive properties' },
    { key: 'PROPERTIES_PUBLISH', description: 'Publish/unpublish properties' },
    { key: 'PROPERTIES_MATCH', description: 'Run property matching for deals' },
    { key: 'PROPERTIES_VISITS_SCHEDULE', description: 'Schedule property visits' },
  ];

  console.log('  Creating Property permissions...');
  for (const perm of propertyPermissions) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      update: {},
      create: perm,
    });
  }
  console.log(`  ✓ Created ${propertyPermissions.length} Property permissions`);

  console.log('✅ Property permissions seeding completed');
}

// Execute if run directly
if (require.main === module) {
  seedPropertyPermissions()
    .catch((e) => {
      console.error('❌ Error seeding Property permissions:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { seedPropertyPermissions };





