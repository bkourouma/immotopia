import { disconnectDatabase } from '../../src/utils/database';
import { flushAuditEvents } from '../../src/services/audit-service';
import { seedDefaultDocumentTemplates } from '../../src/services/default-document-templates-seeding';

/**
 * Semis des modèles de documents globaux par défaut (développement).
 * La logique vit dans `src/services/default-document-templates-seeding.ts`,
 * partagée avec `src/scripts/seed-default-document-templates.ts` (production).
 * Insert-only ; `--refresh` (et `--force` avec lui) pour rafraîchir.
 */
export async function seedDocumentTemplates() {
  const refresh = process.argv.includes('--refresh');
  const force = refresh && process.argv.includes('--force');
  return seedDefaultDocumentTemplates({ refresh, force });
}

if (require.main === module) {
  seedDocumentTemplates()
    .then(report => {
      process.exitCode = report.errors.length > 0 ? 1 : 0;
    })
    .catch(e => {
      console.error('Erreur lors du semis des modèles :', e.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await flushAuditEvents().catch(() => 0);
      await disconnectDatabase().catch(() => undefined);
      // audit-service garde un setInterval ouvert : sortir explicitement
      process.exit(process.exitCode ?? 0);
    });
}
