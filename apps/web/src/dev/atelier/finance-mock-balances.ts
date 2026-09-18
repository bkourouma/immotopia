/**
 * Atelier — fausse API de la balance clients et de la balance âgée.
 *
 * Ce fichier appartient en entier à l'agent qui construit ces deux écrans :
 * jeux d'essai ET réponses. Les trois gestionnaires financiers de l'atelier
 * sont volontairement séparés, un par écran, pour qu'aucun agent n'ait à
 * modifier le fichier d'un autre.
 *
 * Il renvoie `null` quand l'URL ne le concerne pas ; `mock-api.ts` passe
 * alors au gestionnaire suivant.
 */

import type { ClientsAgingBalance, ClientsBalance } from '../../types/finance-types';
import type { Scenario } from './mock-api';

export const BALANCE_CLIENTS: ClientsBalance = {
  lines: [],
  totalBalance: 0,
  currency: 'XOF'
};

export const BALANCE_AGEE: ClientsAgingBalance = {
  lines: [],
  totalBalance: 0,
  currency: 'XOF'
};

export function repondreBalances(chemin: string, scenario: Scenario): unknown | null {
  if (/\/tenants\/[^/]+\/finance\/clients\/balance$/.test(chemin)) {
    const data = scenario === 'vide' ? { lines: [], totalBalance: 0, currency: 'XOF' } : BALANCE_CLIENTS;
    return { success: true, data };
  }

  if (/\/tenants\/[^/]+\/finance\/clients\/balance-agee$/.test(chemin)) {
    const data = scenario === 'vide' ? { lines: [], totalBalance: 0, currency: 'XOF' } : BALANCE_AGEE;
    return { success: true, data };
  }

  return null;
}
