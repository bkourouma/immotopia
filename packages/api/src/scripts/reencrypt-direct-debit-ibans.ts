/**
 * Outil d'exploitation — rechiffre les IBAN des mandats de prélèvement avec la
 * clé courante (`DIRECT_DEBIT_IBAN_KEY`). Lancé dans le conteneur de l'API :
 *   docker exec immotopia-saas-api node dist/scripts/reencrypt-direct-debit-ibans.js [--dry-run]
 *
 * Toute la logique vit dans `lib/direct-debit/iban-reencryption.ts`. N'importe
 * QUE des dépendances de production. N'affiche que des compteurs, l'identifiant
 * de la clé courante et les identifiants des mandats illisibles : jamais d'IBAN,
 * de texte chiffré ni de clé.
 *
 * Codes de sortie : 0 tout est lisible, 2 il reste des mandats illisibles,
 * 1 erreur d'usage ou de configuration.
 */

import { currentIbanKeyId } from '../lib/direct-debit/iban-crypto';
import { IbanReencryptionConfigError, reencryptMandateIbans } from '../lib/direct-debit/iban-reencryption';
import { disconnectDatabase } from '../utils/database';

const USAGE = 'Usage : node dist/scripts/reencrypt-direct-debit-ibans.js [--dry-run]';

/** Analyse les arguments : seul `--dry-run` est accepté. Renvoie `null` si l'usage est invalide. */
export function parseCliArgs(argv: readonly string[]): { dryRun: boolean } | null {
  let dryRun = false;
  for (const arg of argv) {
    if (arg === '--dry-run' && !dryRun) dryRun = true;
    else return null;
  }
  return { dryRun };
}

async function main(): Promise<void> {
  let exitCode = 0;
  const args = parseCliArgs(process.argv.slice(2));
  if (!args) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  try {
    const result = await reencryptMandateIbans({ dryRun: args.dryRun });
    console.log(args.dryRun ? 'Simulation (--dry-run) : rien n’est écrit.' : 'Rechiffrement effectué.');
    console.log(`Clé courante : ${currentIbanKeyId()}`);
    console.log(`Mandats parcourus : ${result.scanned}`);
    console.log(`Déjà sur la clé courante : ${result.alreadyCurrent}`);
    console.log(`${args.dryRun ? 'À rechiffrer' : 'Rechiffrés'} : ${result.reencrypted}`);
    console.log(`Modifiés entre-temps (à relancer) : ${result.changedConcurrently}`);
    console.log(`Illisibles : ${result.unreadableIds.length}`);
    for (const id of result.unreadableIds) console.log(`  - mandat ${id}`);
    if (result.unreadableIds.length > 0) exitCode = 2;
  } catch (error) {
    if (error instanceof IbanReencryptionConfigError) {
      console.error(error.message);
    } else {
      // Seul le nom de l'erreur : un message technique pourrait citer une valeur.
      console.error('Erreur inattendue :', error instanceof Error ? error.name : 'inconnue');
    }
    exitCode = 1;
  }

  try {
    await disconnectDatabase();
  } catch {
    console.error('Erreur lors de la déconnexion de la base.');
    exitCode = exitCode === 0 ? 1 : exitCode;
  }
  process.exitCode = exitCode;
}

if (require.main === module) {
  main();
}
