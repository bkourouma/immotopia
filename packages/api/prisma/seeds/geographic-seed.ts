import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

/**
 * Seed geographic data for Côte d'Ivoire
 * Data source: ai_studio_code.txt
 */
async function seedGeographicData() {
  console.log('🌍 Seeding Geographic Data for Côte d\'Ivoire...');

  // Read the JSON data file
  // __dirname is packages/api/prisma/seeds, so we go up 4 levels to reach root
  const dataPath = path.join(__dirname, '../../../../docs/ai_studio_code.txt');
  const dataContent = fs.readFileSync(dataPath, 'utf-8');
  const regionsData = JSON.parse(dataContent);

  // Create or get Côte d'Ivoire country
  const country = await prisma.country.upsert({
    where: { code: 'CI' },
    update: {
      name: 'Côte d\'Ivoire',
      nameFr: 'Côte d\'Ivoire',
      isActive: true,
    },
    create: {
      code: 'CI',
      name: 'Côte d\'Ivoire',
      nameFr: 'Côte d\'Ivoire',
      isActive: true,
    },
  });

  console.log(`  ✓ Country: ${country.name}`);

  let totalRegions = 0;
  let totalCommunes = 0;

  // Process each region
  for (const regionData of regionsData) {
    const region = await prisma.region.upsert({
      where: {
        countryId_name: {
          countryId: country.id,
          name: regionData.region,
        },
      },
      update: {
        nameFr: regionData.region,
        capital: regionData.chef_lieu,
        isActive: true,
      },
      create: {
        countryId: country.id,
        name: regionData.region,
        nameFr: regionData.region,
        capital: regionData.chef_lieu,
        isActive: true,
      },
    });

    totalRegions++;

    // Process communes for this region
    for (const communeName of regionData.communes) {
      await prisma.commune.upsert({
        where: {
          regionId_name: {
            regionId: region.id,
            name: communeName,
          },
        },
        update: {
          nameFr: communeName,
          isActive: true,
        },
        create: {
          regionId: region.id,
          name: communeName,
          nameFr: communeName,
          isActive: true,
        },
      });
      totalCommunes++;
    }

    console.log(`  ✓ Region: ${region.name} (${regionData.communes.length} communes)`);
  }

  console.log(`✅ Geographic seeding completed:`);
  console.log(`   - 1 Country`);
  console.log(`   - ${totalRegions} Regions`);
  console.log(`   - ${totalCommunes} Communes`);
}

// Execute if run directly
if (require.main === module) {
  seedGeographicData()
    .catch((e) => {
      console.error('❌ Error seeding geographic data:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { seedGeographicData };

