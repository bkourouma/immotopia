/**
 * Atelier — fausse API du relevé de compte de tiers.
 *
 * Ce fichier appartient en entier à l'agent qui construit l'écran de relevé :
 * jeux d'essai ET réponses. Voir l'en-tête de `finance-mock-balances.ts` pour
 * le pourquoi de cette séparation.
 *
 * **Le jeu de données raconte une année.** Un locataire qui paie son loyer
 * mensuel, un règlement partiel suivi d'une pénalité, une remise commerciale,
 * un ajustement, un règlement rejeté puis re-réglé (`VOID`), et surtout une
 * avance reçue avant facturation puis imputée sur l'échéance suivante — c'est
 * le scénario que la cliente veut voir : le solde passe créditeur (négatif)
 * puis revient à zéro.
 *
 * **Le solde de chaque ligne est calculé une fois, à la main, ci-dessous** —
 * exactement ce que fait le serveur en production. L'écran ne recalcule
 * jamais `balanceAfter` : il l'affiche tel quel. Convention de signe reprise
 * de `ClientsBalanceLine.balance` : positif, le locataire nous doit ; négatif,
 * il est créditeur.
 *
 * **Imputer une avance écrit DEUX lignes, pas une.** L'avance a été créditée
 * en entier à l'encaissement (`ADVANCE_RECEIVED`, qui rend le compte
 * créditeur). L'imputer revient à reprendre ce crédit (`ADVANCE_APPLIED`, au
 * débit) puis à le reposer au titre du règlement de l'échéance (`PAYMENT`, au
 * crédit). Les deux s'annulent : le solde ne bouge pas, mais le relevé montre
 * distinctement l'avance consommée et le loyer réglé, ce qu'exige le besoin
 * B4 du PRD.
 *
 * Ce n'est pas une élégance. C'est la seule forme qui s'accorde avec
 * `rebuildThirdPartyAccount`, qui rejoue toute allocation comme un règlement
 * au crédit : une campagne qui n'écrirait pas ce crédit laisserait le rejeu
 * l'ajouter après coup, et le solde du locataire deviendrait faux sans que
 * rien ne le signale.
 *
 * **Limite connue de l'atelier** : `mock-api.ts` (partagé entre les trois
 * gestionnaires financiers) n'appelle `repondreReleve` qu'avec le CHEMIN de
 * l'URL, pas ses paramètres de requête — les bornes `from`/`to` ne sont donc
 * pas appliquées ici. Ce n'est pas un défaut de cet écran : les tests
 * unitaires du composant vérifient que `getAccountStatement` reçoit bien les
 * bornes voulues (comme le fait déjà `payments.test.tsx` pour ses filtres),
 * ce qui suffit à prouver que l'écran les porte dans l'URL.
 */

import type { AccountStatement, ThirdPartyMovementLine } from '../../types/finance-types';
import type { Scenario } from './mock-api';

export const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const BAIL = 'bail-demo-01';

const MOUVEMENTS: ThirdPartyMovementLine[] = [
  {
    id: 'mvt-01',
    movementDate: '2026-01-01',
    type: 'OPENING_BALANCE',
    label: 'Solde initial',
    amountBilled: null,
    amountSettled: null,
    balanceAfter: 0,
    currency: 'XOF',
    leaseId: null
  },
  {
    id: 'mvt-02',
    movementDate: '2026-01-05',
    type: 'INSTALLMENT',
    label: 'Loyer de janvier 2026',
    amountBilled: 450_000,
    amountSettled: null,
    balanceAfter: 450_000,
    currency: 'XOF',
    leaseId: BAIL
  },
  {
    id: 'mvt-03',
    movementDate: '2026-01-10',
    type: 'PAYMENT',
    label: 'Règlement Mobile Money',
    amountBilled: null,
    amountSettled: 450_000,
    balanceAfter: 0,
    currency: 'XOF',
    leaseId: BAIL
  },
  {
    id: 'mvt-04',
    movementDate: '2026-02-05',
    type: 'INSTALLMENT',
    label: 'Loyer de février 2026',
    amountBilled: 450_000,
    amountSettled: null,
    balanceAfter: 450_000,
    currency: 'XOF',
    leaseId: BAIL
  },
  {
    id: 'mvt-05',
    movementDate: '2026-02-09',
    type: 'PAYMENT',
    label: 'Règlement Mobile Money',
    amountBilled: null,
    amountSettled: 450_000,
    balanceAfter: 0,
    currency: 'XOF',
    leaseId: BAIL
  },
  {
    id: 'mvt-06',
    movementDate: '2026-03-05',
    type: 'INSTALLMENT',
    label: 'Loyer de mars 2026',
    amountBilled: 450_000,
    amountSettled: null,
    balanceAfter: 450_000,
    currency: 'XOF',
    leaseId: BAIL
  },
  {
    id: 'mvt-07',
    movementDate: '2026-03-22',
    type: 'PAYMENT',
    label: 'Règlement partiel en espèces',
    amountBilled: null,
    amountSettled: 250_000,
    balanceAfter: 200_000,
    currency: 'XOF',
    leaseId: BAIL
  },
  {
    id: 'mvt-08',
    movementDate: '2026-04-01',
    type: 'PENALTY',
    label: 'Pénalité de retard — loyer de mars 2026',
    amountBilled: 20_000,
    amountSettled: null,
    balanceAfter: 220_000,
    currency: 'XOF',
    leaseId: BAIL
  },
  {
    id: 'mvt-09',
    movementDate: '2026-04-05',
    type: 'INSTALLMENT',
    label: "Loyer d'avril 2026",
    amountBilled: 450_000,
    amountSettled: null,
    balanceAfter: 670_000,
    currency: 'XOF',
    leaseId: BAIL
  },
  {
    id: 'mvt-10',
    movementDate: '2026-04-14',
    type: 'PAYMENT',
    label: 'Règlement Mobile Money',
    amountBilled: null,
    amountSettled: 670_000,
    balanceAfter: 0,
    currency: 'XOF',
    leaseId: BAIL
  },
  {
    id: 'mvt-11',
    movementDate: '2026-05-05',
    type: 'INSTALLMENT',
    label: 'Loyer de mai 2026',
    amountBilled: 450_000,
    amountSettled: null,
    balanceAfter: 450_000,
    currency: 'XOF',
    leaseId: BAIL
  },
  {
    id: 'mvt-12',
    movementDate: '2026-05-19',
    type: 'WAIVER',
    label: 'Remise commerciale — fidélité',
    amountBilled: null,
    amountSettled: 30_000,
    balanceAfter: 420_000,
    currency: 'XOF',
    leaseId: BAIL
  },
  {
    id: 'mvt-13',
    movementDate: '2026-05-20',
    type: 'PAYMENT',
    label: 'Règlement Mobile Money',
    amountBilled: null,
    amountSettled: 420_000,
    balanceAfter: 0,
    currency: 'XOF',
    leaseId: BAIL
  },
  {
    id: 'mvt-14',
    movementDate: '2026-06-05',
    type: 'INSTALLMENT',
    label: 'Loyer de juin 2026',
    amountBilled: 450_000,
    amountSettled: null,
    balanceAfter: 450_000,
    currency: 'XOF',
    leaseId: BAIL
  },
  {
    id: 'mvt-15',
    movementDate: '2026-06-11',
    type: 'PAYMENT',
    label: 'Règlement Mobile Money',
    amountBilled: null,
    amountSettled: 450_000,
    balanceAfter: 0,
    currency: 'XOF',
    leaseId: BAIL
  },
  {
    // Le locataire règle par avance, avant que juillet ne soit facturé : le
    // compte devient créditeur (§ Récit 4 du spec).
    id: 'mvt-16',
    movementDate: '2026-06-26',
    type: 'ADVANCE_RECEIVED',
    label: 'Avance reçue avant facturation de juillet',
    amountBilled: null,
    amountSettled: 450_000,
    balanceAfter: -450_000,
    currency: 'XOF',
    leaseId: null
  },
  {
    // La campagne de juillet facture normalement : le crédit de l'avance
    // absorbe mécaniquement cette facture dans le solde couran.
    id: 'mvt-17',
    movementDate: '2026-07-05',
    type: 'INSTALLMENT',
    label: 'Loyer de juillet 2026',
    amountBilled: 450_000,
    amountSettled: null,
    balanceAfter: 0,
    currency: 'XOF',
    leaseId: BAIL
  },
  {
    // Première des deux lignes de l'imputation : elle reprend le crédit posé
    // par l'avance. Voir l'en-tête du fichier pour le pourquoi de la paire.
    id: 'mvt-18',
    movementDate: '2026-07-05',
    type: 'ADVANCE_APPLIED',
    label: "Reprise de l'avance, imputée au loyer de juillet 2026",
    amountBilled: 450_000,
    amountSettled: null,
    balanceAfter: 450_000,
    currency: 'XOF',
    leaseId: BAIL
  },
  {
    // Seconde ligne : le crédit revient au titre du règlement de l'échéance.
    // Le solde retombe à zéro, et le relevé dit quelle avance a couvert quel
    // loyer — c'est ce qu'exige le besoin B4.
    id: 'mvt-18b',
    movementDate: '2026-07-05',
    type: 'PAYMENT',
    label: 'Règlement du loyer de juillet 2026',
    amountBilled: null,
    amountSettled: 450_000,
    balanceAfter: 0,
    currency: 'XOF',
    leaseId: BAIL
  },
  {
    id: 'mvt-19',
    movementDate: '2026-08-05',
    type: 'INSTALLMENT',
    label: "Loyer d'août 2026",
    amountBilled: 450_000,
    amountSettled: null,
    balanceAfter: 450_000,
    currency: 'XOF',
    leaseId: BAIL
  },
  {
    id: 'mvt-20',
    movementDate: '2026-08-13',
    type: 'PAYMENT',
    label: 'Règlement Mobile Money',
    amountBilled: null,
    amountSettled: 450_000,
    balanceAfter: 0,
    currency: 'XOF',
    leaseId: BAIL
  },
  {
    id: 'mvt-21',
    movementDate: '2026-09-05',
    type: 'INSTALLMENT',
    label: 'Loyer de septembre 2026',
    amountBilled: 450_000,
    amountSettled: null,
    balanceAfter: 450_000,
    currency: 'XOF',
    leaseId: BAIL
  },
  {
    id: 'mvt-22',
    movementDate: '2026-09-18',
    type: 'ADJUSTMENT',
    label: "Ajustement — correction d'une facturation en double",
    amountBilled: null,
    amountSettled: 450_000,
    balanceAfter: 0,
    currency: 'XOF',
    leaseId: BAIL
  },
  {
    id: 'mvt-23',
    movementDate: '2026-10-05',
    type: 'INSTALLMENT',
    label: "Loyer d'octobre 2026",
    amountBilled: 450_000,
    amountSettled: null,
    balanceAfter: 450_000,
    currency: 'XOF',
    leaseId: BAIL
  },
  {
    id: 'mvt-24',
    movementDate: '2026-10-09',
    type: 'PAYMENT',
    label: 'Règlement par chèque',
    amountBilled: null,
    amountSettled: 450_000,
    balanceAfter: 0,
    currency: 'XOF',
    leaseId: BAIL
  },
  {
    id: 'mvt-25',
    movementDate: '2026-11-05',
    type: 'INSTALLMENT',
    label: 'Loyer de novembre 2026',
    amountBilled: 450_000,
    amountSettled: null,
    balanceAfter: 450_000,
    currency: 'XOF',
    leaseId: BAIL
  },
  {
    id: 'mvt-26',
    movementDate: '2026-11-10',
    type: 'PAYMENT',
    label: 'Règlement Mobile Money',
    amountBilled: null,
    amountSettled: 450_000,
    balanceAfter: 0,
    currency: 'XOF',
    leaseId: BAIL
  },
  {
    // Le règlement du 11 novembre est rejeté par l'opérateur : le mouvement
    // inverse le rétablit au débit, exactement comme une échéance.
    id: 'mvt-27',
    movementDate: '2026-11-17',
    type: 'VOID',
    label: 'Annulation — règlement Mobile Money rejeté par l’opérateur',
    amountBilled: 450_000,
    amountSettled: null,
    balanceAfter: 450_000,
    currency: 'XOF',
    leaseId: BAIL
  },
  {
    id: 'mvt-28',
    movementDate: '2026-11-22',
    type: 'PAYMENT',
    label: 'Nouveau règlement Mobile Money',
    amountBilled: null,
    amountSettled: 450_000,
    balanceAfter: 0,
    currency: 'XOF',
    leaseId: BAIL
  },
  {
    id: 'mvt-29',
    movementDate: '2026-12-05',
    type: 'INSTALLMENT',
    label: 'Loyer de décembre 2026',
    amountBilled: 450_000,
    amountSettled: null,
    balanceAfter: 450_000,
    currency: 'XOF',
    leaseId: BAIL
  },
  {
    id: 'mvt-30',
    movementDate: '2026-12-12',
    type: 'PAYMENT',
    label: 'Règlement Mobile Money',
    amountBilled: null,
    amountSettled: 450_000,
    balanceAfter: 0,
    currency: 'XOF',
    leaseId: BAIL
  }
];

export const RELEVE: AccountStatement = {
  accountId: ACCOUNT_ID,
  label: 'Fatoumata Diallo — Villa Kipé 12',
  openingBalance: 0,
  closingBalance: MOUVEMENTS[MOUVEMENTS.length - 1].balanceAfter,
  currency: 'XOF',
  movements: MOUVEMENTS,
  total: MOUVEMENTS.length
};

export function repondreReleve(chemin: string, scenario: Scenario): unknown | null {
  if (/\/tenants\/[^/]+\/finance\/accounts\/[^/]+\/statement$/.test(chemin)) {
    const data: AccountStatement =
      scenario === 'vide' ? { ...RELEVE, openingBalance: 0, closingBalance: 0, movements: [], total: 0 } : RELEVE;
    return { success: true, data };
  }

  return null;
}
