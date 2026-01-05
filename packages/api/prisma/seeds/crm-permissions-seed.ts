import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedCRMPermissions() {
  console.log('📋 Seeding CRM permissions...');

  // CRM permissions as specified in FR-026
  const crmPermissions = [
    // Contact permissions
    { key: 'CRM_CONTACTS_VIEW', description: 'View contacts' },
    { key: 'CRM_CONTACTS_CREATE', description: 'Create contacts' },
    { key: 'CRM_CONTACTS_EDIT', description: 'Edit contacts' },
    { key: 'CRM_CONTACTS_ARCHIVE', description: 'Archive contacts' },
    
    // Deal permissions
    { key: 'CRM_DEALS_VIEW', description: 'View deals' },
    { key: 'CRM_DEALS_CREATE', description: 'Create deals' },
    { key: 'CRM_DEALS_EDIT', description: 'Edit deals' },
    { key: 'CRM_DEALS_STAGE_CHANGE', description: 'Change deal stage' },
    
    // Activity permissions
    { key: 'CRM_ACTIVITIES_VIEW', description: 'View activities' },
    { key: 'CRM_ACTIVITIES_CREATE', description: 'Create activities' },
    
    // Appointment permissions
    { key: 'CRM_APPOINTMENTS_VIEW', description: 'View appointments' },
    { key: 'CRM_APPOINTMENTS_CREATE', description: 'Create appointments' },
    { key: 'CRM_APPOINTMENTS_EDIT', description: 'Edit appointments' },
    
    // Matching permissions
    { key: 'CRM_MATCHING_RUN', description: 'Run property matching' },
    { key: 'CRM_MATCHING_VIEW', description: 'View property matches' },
  ];

  console.log('  Creating CRM permissions...');
  for (const perm of crmPermissions) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      update: {},
      create: perm,
    });
  }
  console.log(`  ✓ Created ${crmPermissions.length} CRM permissions`);

  console.log('✅ CRM permissions seeding completed');
}

// Execute if run directly
if (require.main === module) {
  seedCRMPermissions()
    .catch((e) => {
      console.error('❌ Error seeding CRM permissions:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { seedCRMPermissions };





