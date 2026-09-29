import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Droits locatifs du rôle Comptable : LECTURE SEULE. Il consulte baux,
 * échéances, paiements, pénalités et dépôts pour ses écrans financiers ; toute
 * écriture (créer un bail, encaisser, affecter, calculer une pénalité) reste
 * réservée aux rôles de gestion.
 */
export const ACCOUNTANT_RENTAL_READ_PERMISSION_KEYS = [
  'RENTAL_LEASES_VIEW',
  'RENTAL_INSTALLMENTS_VIEW',
  'RENTAL_PAYMENTS_VIEW',
  'RENTAL_PENALTIES_VIEW',
  'RENTAL_DEPOSITS_VIEW'
];

async function seedRentalPermissions() {
  console.log('📋 Seeding Rental permissions...');

  // Rental permissions as specified in the rental RBAC middleware
  const rentalPermissions = [
    // Lease permissions
    { key: 'RENTAL_LEASES_VIEW', description: 'View rental leases' },
    { key: 'RENTAL_LEASES_CREATE', description: 'Create rental leases' },
    { key: 'RENTAL_LEASES_EDIT', description: 'Edit rental leases' },

    // Installment permissions
    { key: 'RENTAL_INSTALLMENTS_VIEW', description: 'View rental installments' },
    { key: 'RENTAL_INSTALLMENTS_GENERATE', description: 'Generate rental installments' },

    // Payment permissions
    { key: 'RENTAL_PAYMENTS_VIEW', description: 'View rental payments' },
    { key: 'RENTAL_PAYMENTS_CREATE', description: 'Create rental payments' },
    { key: 'RENTAL_PAYMENTS_ALLOCATE', description: 'Allocate rental payments' },

    // Penalty permissions
    { key: 'RENTAL_PENALTIES_VIEW', description: 'View rental penalties' },
    { key: 'RENTAL_PENALTIES_CALCULATE', description: 'Calculate rental penalties' },
    { key: 'RENTAL_PENALTIES_EDIT', description: 'Edit rental penalties' },

    // Deposit permissions
    { key: 'RENTAL_DEPOSITS_VIEW', description: 'View rental security deposits' },
    { key: 'RENTAL_DEPOSITS_CREATE', description: 'Create rental security deposits' },
    { key: 'RENTAL_DEPOSITS_EDIT', description: 'Edit rental security deposits' },

    // Document permissions
    { key: 'RENTAL_DOCUMENTS_VIEW', description: 'View rental documents' },
    { key: 'RENTAL_DOCUMENTS_GENERATE', description: 'Generate rental documents' },
    { key: 'RENTAL_DOCUMENTS_EDIT', description: 'Edit rental documents' }
  ];

  console.log('  Creating Rental permissions...');
  for (const perm of rentalPermissions) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      update: {},
      create: perm
    });
  }
  console.log(`  ✓ Created ${rentalPermissions.length} Rental permissions`);

  console.log('✅ Rental permissions seeding completed');
}

// Execute if run directly
if (require.main === module) {
  seedRentalPermissions()
    .catch(e => {
      console.error('❌ Error seeding Rental permissions:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { seedRentalPermissions };
