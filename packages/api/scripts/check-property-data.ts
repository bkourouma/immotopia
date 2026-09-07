import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Script to check property data for a specific lease
 * Usage: npm run check:property-data <leaseNumber>
 */
async function checkPropertyData(leaseNumber: string) {
  try {
    console.log(`\n🔍 Vérification des données de la propriété pour le bail: ${leaseNumber}\n`);

    // Find the lease
    const lease = await prisma.rentalLease.findFirst({
      where: {
        lease_number: leaseNumber
      },
      include: {
        property: true,
        tenant: true
      }
    });

    if (!lease) {
      console.log(`❌ Bail "${leaseNumber}" introuvable.`);
      return;
    }

    console.log(`📄 Bail N° ${lease.lease_number}`);
    console.log(`   Tenant: ${lease.tenant.name}`);
    console.log(`   Property ID: ${lease.property.id}`);
    console.log(`   Property Type: ${lease.property.propertyType || 'N/A'}`);
    console.log(`   Surface: ${lease.property.surfaceArea || 'N/A'} m²`);
    console.log(`   Location Zone: ${lease.property.locationZone || 'N/A'}`);
    console.log(`\n   📍 Adresse (BIEN_ADRESSE):`);
    if (lease.property.address) {
      console.log(`      ✅ "${lease.property.address}"`);
    } else {
      console.log(`      ❌ VIDE`);
    }

    console.log(`\n   🏠 Nombre de pièces (BIEN_PIECES):`);
    if (lease.property.rooms !== null && lease.property.rooms !== undefined) {
      console.log(`      ✅ ${lease.property.rooms}`);
    } else {
      console.log(`      ❌ VIDE (null ou undefined)`);
    }

    console.log(`\n   🛏️  Nombre de chambres (BIEN_CHAMBRES):`);
    if (lease.property.bedrooms !== null && lease.property.bedrooms !== undefined) {
      console.log(`      ✅ ${lease.property.bedrooms}`);
    } else {
      console.log(`      ❌ VIDE (null ou undefined)`);
    }

    console.log(`\n   🔗 URL pour modifier la propriété:`);
    console.log(`      http://localhost:3000/tenant/${lease.tenant.id}/properties/${lease.property.id}/edit`);

    // Summary
    const missingFields: string[] = [];
    if (!lease.property.address) missingFields.push('address');
    if (lease.property.rooms === null || lease.property.rooms === undefined) missingFields.push('rooms');
    if (lease.property.bedrooms === null || lease.property.bedrooms === undefined) missingFields.push('bedrooms');

    if (missingFields.length > 0) {
      console.log(`\n   ⚠️  CHAMPS MANQUANTS: ${missingFields.join(', ')}`);
      console.log(`   💡 Action: Renseigner ces champs dans l'interface d'édition de la propriété.`);
    } else {
      console.log(`\n   ✅ Tous les champs sont renseignés !`);
    }

  } catch (error) {
    console.error('❌ Erreur lors de la vérification:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Get lease number from command line arguments
const leaseNumber = process.argv[2];

if (!leaseNumber) {
  console.error('❌ Usage: npm run check:property-data <leaseNumber>');
  console.error('   Exemple: npm run check:property-data BAIL-2026-0008');
  process.exit(1);
}

checkPropertyData(leaseNumber);
