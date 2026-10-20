/**
 * Outil d'exploitation : semis des modèles de documents globaux par défaut
 * (bail habitation / commercial, reçu de loyer, relevé locatif). Production :
 *   docker exec immotopia-prod-api node dist/scripts/seed-default-document-templates.js
 *
 * Insert-only par défaut. `--refresh` remplace le fichier d'un ancien modèle
 * livré non personnalisé ; `--force` (uniquement avec `--refresh`) remplace
 * aussi un global d'empreinte inconnue. Code de sortie non nul en cas d'erreur.
 * Aucune création d'utilisateur : le créateur est le plus ancien SUPER_ADMIN.
 */
import { disconnectDatabase } from '../utils/database';
import { flushAuditEvents } from '../services/audit-service';
import {
  errMsg,
  MissingSuperAdminError,
  seedDefaultDocumentTemplates
} from '../services/default-document-templates-seeding';

export function parseSeedArgs(argv: string[]): { refresh: boolean; force: boolean } {
  const known = new Set(['--refresh', '--force']);
  const unknown = argv.filter(arg => !known.has(arg));
  if (unknown.length > 0) throw new Error(`Option inconnue : ${unknown.join(', ')} (options : --refresh, --force)`);
  const refresh = argv.includes('--refresh');
  const force = argv.includes('--force');
  if (force && !refresh) throw new Error('--force exige --refresh.');
  return { refresh, force };
}

async function main(): Promise<void> {
  let exitCode = 0;
  try {
    const options = parseSeedArgs(process.argv.slice(2));
    console.log(`Modèles de documents par défaut (${options.refresh ? 'avec rafraîchissement' : 'insertion seule'})`);
    const report = await seedDefaultDocumentTemplates(options);
    if (report.errors.length > 0) exitCode = 1;
  } catch (error) {
    console.error(error instanceof MissingSuperAdminError ? error.message : `Échec : ${errMsg(error)}`);
    exitCode = 1;
  }
  try {
    await flushAuditEvents();
    await disconnectDatabase();
  } catch (error) {
    console.error(`Fermeture : ${errMsg(error)}`);
  }
  // audit-service garde un timer ouvert : sortie explicite.
  process.exit(exitCode);
}

if (require.main === module) {
  void main();
}
