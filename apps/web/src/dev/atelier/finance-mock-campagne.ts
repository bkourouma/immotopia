/**
 * Atelier — fausse API de la campagne de facturation.
 *
 * Ce fichier appartient en entier à l'agent qui construit cet écran : jeux
 * d'essai ET réponses. Voir l'en-tête de `finance-mock-balances.ts` pour le
 * pourquoi de cette séparation.
 *
 * Point à couvrir par les jeux d'essai : une campagne relancée rend le même
 * compte rendu que la première fois. C'est l'idempotence exigée par le besoin
 * B3 du PRD, et l'écran doit pouvoir proposer « Relancer » sans avertissement.
 */

import type { BillingRun } from '../../types/finance-types';
import type { Scenario } from './mock-api';

export const CAMPAGNES: BillingRun[] = [];

export function repondreCampagne(chemin: string, scenario: Scenario): unknown | null {
  if (/\/tenants\/[^/]+\/finance\/billing-runs$/.test(chemin)) {
    return { success: true, data: scenario === 'vide' ? [] : CAMPAGNES };
  }

  if (/\/tenants\/[^/]+\/finance\/billing-runs\/[^/]+$/.test(chemin)) {
    return { success: true, data: CAMPAGNES[0] ?? null };
  }

  return null;
}
