import * as cron from 'node-cron';

import { logger } from '../utils/logger';
import { runMonthlyLandLeaseAccruals } from '../lib/finance/land-leases';

/**
 * Constatation mensuelle des loyers de terrain — lot 4, sous-lot 1.
 *
 * ---------------------------------------------------------------------------
 * Ce qu'il fait, et pourquoi il existe
 * ---------------------------------------------------------------------------
 *
 * L'entreprise paie ses bailleurs une fois par an, d'avance. Sans ce travail,
 * un chantier sur terrain loué porterait la totalité du loyer le mois du
 * paiement et rien les onze suivants : son coût deviendrait illisible, ce que
 * le PRD demande précisément d'éviter.
 *
 * Chaque mois, il constate un douzième du loyer annuel de chaque bail actif :
 * la charge naît, le compte du bailleur remonte d'autant, et la dépense
 * s'impute aux chantiers rattachés.
 *
 * ---------------------------------------------------------------------------
 * Pourquoi il peut se rejouer sans rien casser
 * ---------------------------------------------------------------------------
 *
 * Il est **idempotent par construction** : l'unicité `(bail, année, mois)` en
 * base, et une lecture préalable dans le service. Le relancer sur un mois déjà
 * constaté ne crée rien, ne bouge aucun solde, et ne double aucune imputation.
 *
 * C'est ce qui permet de le rattraper à la main sans précaution particulière,
 * et c'est la même discipline que la campagne de facturation du lot 1, qui se
 * rejoue sans refacturer.
 *
 * ---------------------------------------------------------------------------
 * Le 2 du mois, et non le 1er
 * ---------------------------------------------------------------------------
 *
 * Le PRD dit « le 1er de chaque mois ». Le travail tourne le 2 à 3 h UTC, et
 * constate **le mois qui vient de s'achever**.
 *
 * Deux raisons. Une constatation porte sur un mois révolu : la lancer le 1er à
 * minuit reviendrait à constater un mois qui n'a pas commencé, ou à constater
 * le précédent dans une fenêtre où les dernières pièces de ce mois ne sont
 * peut-être pas encore saisies. Et en cas de panne le 1er, le 2 laisse une
 * journée de marge avant qu'on s'en aperçoive.
 *
 * Le mois constaté est donc toujours celui d'avant la date du jour, calculé
 * explicitement plutôt que déduit d'un décalage — un décalage se lit mal en
 * janvier.
 */

let landLeaseAccrualJob: cron.ScheduledTask | null = null;

/** Le mois qui vient de s'achever, à la date donnée. */
export function moisEchu(reference: Date): { periodYear: number; periodMonth: number } {
  const annee = reference.getUTCFullYear();
  const mois = reference.getUTCMonth() + 1; // 1 à 12

  // Janvier : le mois échu est décembre de l'année précédente. Écrit
  // explicitement plutôt que par un modulo, qui se relit mal.
  if (mois === 1) {
    return { periodYear: annee - 1, periodMonth: 12 };
  }
  return { periodYear: annee, periodMonth: mois - 1 };
}

export function startLandLeaseAccrualJob(): void {
  if (landLeaseAccrualJob) {
    logger.warn('Land lease accrual job is already running');
    return;
  }

  landLeaseAccrualJob = cron.schedule(
    // Le 2 du mois, 3 h UTC. Voir l'en-tête pour le choix du 2 plutôt que du 1er.
    '0 3 2 * *',
    async () => {
      const periode = moisEchu(new Date());
      try {
        logger.info('Starting scheduled land lease accrual job', periode);
        const compteRendu = await runMonthlyLandLeaseAccruals(periode);
        logger.info('Land lease accrual job completed', {
          ...periode,
          constatees: compteRendu.constatees,
          dejaConstatees: compteRendu.dejaConstatees,
          echecs: compteRendu.echecs.length
        });

        // Les échecs sont journalisés un par un, avec le bail nommé : un
        // compte rendu qui dirait seulement « 3 échecs » n'aiderait personne
        // à les corriger.
        for (const echec of compteRendu.echecs) {
          logger.error('Land lease accrual failed for one lease', {
            ...periode,
            landLeaseId: echec.landLeaseId,
            landlordName: echec.landlordName,
            raison: echec.raison
          });
        }
      } catch (erreur) {
        logger.error('Error in land lease accrual job', {
          ...periode,
          error: erreur instanceof Error ? erreur.message : String(erreur)
        });
      }
    },
    // `scheduled: true` est la valeur par defaut de node-cron et n'est pas
    // dans les types de cette version : l'ecrire ferait echouer la
    // compilation sans rien ajouter.
    { timezone: 'UTC' }
  );

  logger.info('Land lease accrual job started (runs monthly, on the 2nd at 3:00 AM UTC)');
}

export function stopLandLeaseAccrualJob(): void {
  if (!landLeaseAccrualJob) {
    return;
  }
  landLeaseAccrualJob.stop();
  landLeaseAccrualJob = null;
  logger.info('Land lease accrual job stopped');
}

/**
 * Déclenche la constatation à la main, pour une agence ou pour toutes.
 *
 * Sans période, le mois échu à la date du jour. Rejouable sans précaution :
 * voir l'en-tête sur l'idempotence.
 */
export async function triggerLandLeaseAccruals(params?: {
  tenantId?: string;
  periodYear?: number;
  periodMonth?: number;
}) {
  const defaut = moisEchu(new Date());
  return runMonthlyLandLeaseAccruals({
    tenantId: params?.tenantId,
    periodYear: params?.periodYear ?? defaut.periodYear,
    periodMonth: params?.periodMonth ?? defaut.periodMonth
  });
}
