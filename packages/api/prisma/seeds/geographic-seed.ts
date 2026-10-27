import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Référentiel géographique de la Côte d'Ivoire (pays > régions > communes).
 *
 * Référentiel GLOBAL (sans tenantId). Source : data/ci-geographie.json, embarquée
 * avec les seeds dans l'image Docker `migrate`.
 *
 * INSERT SEULEMENT et idempotent : une ligne existante (clé naturelle) est
 * ignorée sans être modifiée, une ligne absente est créée. Relançable après une
 * interruption sans effet sur ce qui est déjà posé.
 *   - Country : code = 'CI'
 *   - Region  : (countryId, name)
 *   - Commune : (regionId, name)
 */

interface RegionData {
  region: string;
  chef_lieu: string;
  communes: string[];
}

interface LevelCount {
  inserted: number;
  skipped: number;
}

const DATA_PATH = path.join(__dirname, 'data', 'ci-geographie.json');

/** Lit et valide le JSON AVANT toute écriture ; lève une erreur claire sinon. */
export function loadGeographicData(dataPath: string = DATA_PATH): RegionData[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  } catch (e) {
    throw new Error(`Lecture impossible de ${dataPath} : ${(e as Error).message}`);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Données géographiques invalides : un tableau non vide de régions est attendu.');
  }
  parsed.forEach((item, i) => {
    const r = item as Partial<RegionData> | null;
    if (!r || typeof r.region !== 'string' || !r.region.trim()) {
      throw new Error(`Données géographiques invalides : région #${i} sans nom (champ "region").`);
    }
    if (!Array.isArray(r.communes) || r.communes.some(c => typeof c !== 'string' || !c.trim())) {
      throw new Error(`Données géographiques invalides : région « ${r.region} » sans liste "communes" valide.`);
    }
    if (r.chef_lieu !== undefined && typeof r.chef_lieu !== 'string') {
      throw new Error(`Données géographiques invalides : chef-lieu de « ${r.region} » illisible.`);
    }
  });
  return parsed as RegionData[];
}

async function seedGeographicData(prismaClient?: PrismaClient): Promise<void> {
  const prisma = prismaClient ?? new PrismaClient();
  const ownsClient = !prismaClient;
  try {
    console.log("Référentiel géographique de la Côte d'Ivoire...");

    const regionsData = loadGeographicData();
    const countries: LevelCount = { inserted: 0, skipped: 0 };
    const regions: LevelCount = { inserted: 0, skipped: 0 };
    const communes: LevelCount = { inserted: 0, skipped: 0 };

    let country = await prisma.country.findUnique({ where: { code: 'CI' } });
    if (country) {
      countries.skipped++;
    } else {
      country = await prisma.country.create({
        data: { code: 'CI', name: "Côte d'Ivoire", nameFr: "Côte d'Ivoire", isActive: true }
      });
      countries.inserted++;
    }

    for (const regionData of regionsData) {
      let region = await prisma.region.findUnique({
        where: { countryId_name: { countryId: country.id, name: regionData.region } }
      });
      if (region) {
        regions.skipped++;
      } else {
        region = await prisma.region.create({
          data: {
            countryId: country.id,
            name: regionData.region,
            nameFr: regionData.region,
            capital: regionData.chef_lieu,
            isActive: true
          }
        });
        regions.inserted++;
      }

      for (const communeName of regionData.communes) {
        const existing = await prisma.commune.findUnique({
          where: { regionId_name: { regionId: region.id, name: communeName } },
          select: { id: true }
        });
        if (existing) {
          communes.skipped++;
        } else {
          await prisma.commune.create({
            data: { regionId: region.id, name: communeName, nameFr: communeName, isActive: true }
          });
          communes.inserted++;
        }
      }
    }

    console.log(`  Pays     : ${countries.inserted} inséré(s), ${countries.skipped} ignoré(s)`);
    console.log(`  Régions  : ${regions.inserted} inséré(s), ${regions.skipped} ignoré(s)`);
    console.log(`  Communes : ${communes.inserted} inséré(s), ${communes.skipped} ignoré(s)`);
    console.log(
      `Référentiel géographique terminé : ${countries.inserted + regions.inserted + communes.inserted} ligne(s) insérée(s), ` +
        `${countries.skipped + regions.skipped + communes.skipped} ignorée(s).`
    );
  } finally {
    if (ownsClient) await prisma.$disconnect();
  }
}

// Exécution directe : ts-node prisma/seeds/geographic-seed.ts
if (require.main === module) {
  seedGeographicData().catch(e => {
    console.error('Échec du référentiel géographique :', e instanceof Error ? e.message : e);
    process.exit(1);
  });
}

export { seedGeographicData };
