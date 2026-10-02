import { logger } from './logger';

/**
 * Crochets exécutés à l'arrêt du process, AVANT la fermeture de la base.
 *
 * Existe pour une raison précise : le journal d'audit garde ses événements en
 * mémoire (file vidée toutes les 5 s). À l'arrêt, `utils/database` ferme le
 * pool Prisma ; si la vidange de la file s'exécute en concurrence, elle peut
 * tomber sur une base déjà fermée et perdre des événements. Les modules qui ont
 * un travail en attente s'enregistrent ici ; `disconnectDatabase()` les attend
 * avant de déconnecter.
 *
 * Fichier sans dépendance vers la base, pour que les deux sens d'import restent
 * possibles sans cycle.
 */
type ShutdownHook = () => Promise<unknown> | unknown;

const hooks: Array<{ name: string; run: ShutdownHook }> = [];

/** Enregistre un crochet d'arrêt (idempotent par nom). */
export function registerShutdownHook(name: string, run: ShutdownHook): void {
  if (hooks.some(hook => hook.name === name)) {
    return;
  }
  hooks.push({ name, run });
}

/**
 * Exécute les crochets dans l'ordre d'enregistrement. Un crochet qui échoue est
 * journalisé et n'empêche ni les suivants ni la fermeture de la base.
 */
export async function runShutdownHooks(): Promise<void> {
  for (const hook of hooks) {
    try {
      await hook.run();
    } catch (error) {
      logger.error('Shutdown hook failed', { hook: hook.name, error });
    }
  }
}
