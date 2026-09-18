/**
 * Atelier — fausse API du relevé de compte de tiers.
 *
 * Ce fichier appartient en entier à l'agent qui construit l'écran de relevé :
 * jeux d'essai ET réponses. Voir l'en-tête de `finance-mock-balances.ts` pour
 * le pourquoi de cette séparation.
 */

import type { AccountStatement } from '../../types/finance-types';
import type { Scenario } from './mock-api';

export const RELEVE: AccountStatement = {
  accountId: '00000000-0000-4000-8000-000000000001',
  label: 'Compte de démonstration',
  openingBalance: 0,
  closingBalance: 0,
  currency: 'XOF',
  movements: [],
  total: 0
};

export function repondreReleve(chemin: string, scenario: Scenario): unknown | null {
  if (/\/tenants\/[^/]+\/finance\/accounts\/[^/]+\/statement$/.test(chemin)) {
    const data = scenario === 'vide' ? { ...RELEVE, movements: [], total: 0 } : RELEVE;
    return { success: true, data };
  }

  return null;
}
