/**
 * Répare les fichiers (documents locatifs, modèles de l'agence) des agences de
 * test par pack déjà semées. STAGING UNIQUEMENT, mêmes gardes que le seed :
 *
 *   ./infra/scripts/seed-pack-tests.sh staging --repair-files
 *
 * Ni purge ni recréation : pour chaque ligne dont le fichier est absent ou hors
 * du volume des fichiers (`UPLOADS_DIR`), le fichier est réécrit sur le volume et
 * le chemin mis à jour (voir `pack-history/repair-files.ts`). Idempotent :
 * relancer ne répare plus rien. N'affiche que des compteurs, jamais un contenu
 * ni un chemin.
 *
 * Codes de sortie : 0 succès, 1 refus de la garde, erreur ou réparation impossible.
 */
import { env } from '../../src/config/env';
import { prisma, disconnectDatabase } from '../../src/utils/database';
import { PACK_TEST_TENANTS, checkPackTestTenantsGuard } from './pack-test-tenants';
import { repairTenantFiles } from './pack-history/repair-files';
import type { RepairCounts } from './pack-history/repair-files';

function summarize(counts: RepairCounts): string {
  const causes = Object.entries(counts.failureCodes)
    .map(([code, n]) => `${code}×${n}`)
    .join(', ');
  return (
    `${counts.repaired} réparé(s), ${counts.healthy} déjà sain(s)` +
    (counts.failed > 0 ? `, ${counts.failed} impossible(s) (${causes})` : '')
  );
}

async function main(): Promise<number> {
  // Garde EN TÊTE, avant toute requête base (identique au seed des agences de test).
  const guard = checkPackTestTenantsGuard({
    allowFlag: process.env.ALLOW_PACK_TEST_TENANTS,
    nodeEnv: env.NODE_ENV,
    origins: [env.FRONTEND_URL, env.CLIENT_URL]
  });
  if (!guard.ok) {
    console.error(guard.reason);
    return 1;
  }
  // Sans volume, les fichiers iraient dans la couche éphémère du conteneur : c'est la panne à réparer.
  if (env.NODE_ENV === 'production' && !env.UPLOADS_DIR) {
    console.error(
      'Refus : UPLOADS_DIR est absent. Les fichiers réparés seraient perdus avec le conteneur ; ' +
        'lancer la réparation par ./infra/scripts/seed-pack-tests.sh staging --repair-files.'
    );
    return 1;
  }

  const names = PACK_TEST_TENANTS.map(entry => entry.tenantName);
  const tenants = await prisma.tenant.findMany({ where: { name: { in: names } }, select: { id: true, name: true } });
  tenants.sort((a, b) => a.name.localeCompare(b.name));
  if (tenants.length === 0) {
    console.log("Aucune agence de test trouvée : rien à réparer (lancer d'abord seed-pack-tests.sh staging).");
    return 0;
  }

  let repaired = 0;
  let failed = 0;
  let withoutTemplates = 0;
  for (const tenant of tenants) {
    // eslint-disable-next-line no-await-in-loop -- séquentiel voulu : un journal lisible, une agence à la fois.
    const report = await repairTenantFiles(prisma, tenant.id);
    console.log(`Agence ${tenant.name}`);
    console.log(
      `  documents locatifs : ${report.rentalDocuments.checked} examiné(s), ${summarize(report.rentalDocuments)}`
    );
    console.log(`  modèles de l'agence : ${report.templates.checked} examiné(s), ${summarize(report.templates)}`);
    repaired += report.rentalDocuments.repaired + report.templates.repaired;
    failed += report.rentalDocuments.failed + report.templates.failed;
    if (report.withoutTemplates) withoutTemplates += 1;
  }

  console.log(
    `${tenants.length} agence(s) de test examinée(s) : ${repaired} ligne(s) réparée(s), ${failed} impossible(s).`
  );
  if (withoutTemplates > 0) {
    console.log(
      `${withoutTemplates} agence(s) sans modèle propre : relancer ./infra/scripts/seed-pack-tests.sh staging ` +
        '(il crée les modèles manquants, le dossier assets/ étant désormais monté dans le conteneur).'
    );
  }
  return failed > 0 ? 1 : 0;
}

async function run(): Promise<void> {
  let exitCode = 0;
  try {
    exitCode = await main();
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error('Erreur inattendue :', detail);
    exitCode = 1;
  }
  try {
    await disconnectDatabase();
  } catch (error) {
    console.error('Erreur lors de la déconnexion de la base :', error);
    exitCode = exitCode === 0 ? 1 : exitCode;
  }
  process.exitCode = exitCode;
}

if (require.main === module) {
  void run();
}
