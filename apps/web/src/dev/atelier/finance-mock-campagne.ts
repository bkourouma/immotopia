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
 *
 * **Limite assumée de l'atelier.** `mock-api.ts` route les requêtes par leur
 * seul chemin — jamais par leur méthode ni leur corps (voir son en-tête :
 * « les mutations et leurs effets de bord » restent hors du périmètre de
 * l'atelier). Un `POST .../billing-runs` (lancement réel) retombe donc ici
 * sur la même branche qu'un `GET .../billing-runs` (historique) : l'atelier ne
 * peut pas simuler l'exécution d'une nouvelle campagne au clic. Ce que « Lancer »
 * / « Relancer » produit dans l'atelier n'est donc pas fiable — seule la
 * recette authentifiée le vérifie. Pour autant, l'écran doit savoir AFFICHER
 * un compte rendu de relance idempotente : l'historique ci-dessous en porte
 * donc un exemple déjà exécuté (`CAMPAGNE_RELANCE_OCTOBRE`), qui montre ce à
 * quoi ressemble le compte rendu d'une deuxième exécution sur une période déjà
 * traitée, sans qu'aucun clic n'ait besoin de le produire en direct.
 */

import type { BillingRun } from '../../types/finance-types';
import type { Scenario } from './mock-api';

/** Novembre 2026 — la plus récente : une campagne propre, sans aucune exclusion. */
const CAMPAGNE_NOVEMBRE: BillingRun = {
  id: 'campagne-facturation-2026-11',
  periodYear: 2026,
  periodMonth: 11,
  label: 'Loyer de novembre 2026',
  status: 'DONE',
  startedAt: '2026-11-02T08:05:00.000Z',
  finishedAt: '2026-11-02T08:05:03.000Z',
  summary: {
    billed: [
      {
        leaseId: 'BAIL-2026-0007',
        leaseLabel: 'Fatoumata Diallo — Villa Kipé 12',
        installmentId: 'ech-2026-11-0007',
        amount: 1_250_000
      },
      {
        leaseId: 'BAIL-2026-0012',
        leaseLabel: 'Mamadou Bah — Appartement Almamya B3',
        installmentId: 'ech-2026-11-0012',
        amount: 980_000
      },
      {
        leaseId: 'BAIL-2026-0015',
        leaseLabel: 'Aïssatou Barry — Duplex Ratoma 4',
        installmentId: 'ech-2026-11-0015',
        amount: 1_500_000
      },
      {
        leaseId: 'BAIL-2026-0040',
        leaseLabel: 'Mariam Camara — Villa Lambanyi 2',
        installmentId: 'ech-2026-11-0040',
        amount: 750_000
      }
    ],
    excluded: [],
    advancesApplied: []
  }
};

/**
 * Octobre 2026 — le compte rendu d'une RELANCE.
 *
 * Ce que verrait la gestionnaire en relançant une période déjà traitée : les
 * baux déjà facturés ressortent en exclusion avec le motif
 * « Une échéance existe déjà pour cette période », et seul un bail
 * nouvellement éligible (arrivé en cours de mois) est réellement facturé. Rien
 * ici ne doit se lire comme un échec — c'est la démonstration de l'idempotence
 * demandée par le récit B3.
 */
const CAMPAGNE_RELANCE_OCTOBRE: BillingRun = {
  id: 'campagne-facturation-2026-10',
  periodYear: 2026,
  periodMonth: 10,
  label: "Loyer d'octobre 2026",
  status: 'DONE',
  startedAt: '2026-10-01T07:58:00.000Z',
  finishedAt: '2026-10-01T07:58:02.000Z',
  summary: {
    billed: [
      {
        leaseId: 'BAIL-2026-0031',
        leaseLabel: 'Ibrahima Sow — Studio Dixinn 7',
        installmentId: 'ech-2026-10-0031',
        amount: 1_100_000
      }
    ],
    excluded: [
      {
        leaseId: 'BAIL-2026-0007',
        leaseLabel: 'Fatoumata Diallo — Villa Kipé 12',
        reason: 'INSTALLMENT_ALREADY_EXISTS'
      },
      {
        leaseId: 'BAIL-2026-0012',
        leaseLabel: 'Mamadou Bah — Appartement Almamya B3',
        reason: 'INSTALLMENT_ALREADY_EXISTS'
      },
      {
        leaseId: 'BAIL-2026-0015',
        leaseLabel: 'Aïssatou Barry — Duplex Ratoma 4',
        reason: 'INSTALLMENT_ALREADY_EXISTS'
      },
      {
        leaseId: 'BAIL-2026-0040',
        leaseLabel: 'Mariam Camara — Villa Lambanyi 2',
        reason: 'INSTALLMENT_ALREADY_EXISTS'
      }
    ],
    advancesApplied: []
  }
};

/**
 * Septembre 2026 — la campagne riche : plusieurs motifs d'exclusion
 * différents ET une avance imputée, les deux choses que la cliente veut voir
 * en démonstration.
 */
const CAMPAGNE_SEPTEMBRE: BillingRun = {
  id: 'campagne-facturation-2026-09',
  periodYear: 2026,
  periodMonth: 9,
  label: 'Loyer de septembre 2026',
  status: 'DONE',
  startedAt: '2026-09-01T07:30:00.000Z',
  finishedAt: '2026-09-01T07:30:05.000Z',
  summary: {
    billed: [
      {
        leaseId: 'BAIL-2026-0007',
        leaseLabel: 'Fatoumata Diallo — Villa Kipé 12',
        installmentId: 'ech-2026-09-0007',
        amount: 1_250_000
      },
      {
        leaseId: 'BAIL-2026-0012',
        leaseLabel: 'Mamadou Bah — Appartement Almamya B3',
        installmentId: 'ech-2026-09-0012',
        amount: 980_000
      },
      {
        leaseId: 'BAIL-2026-0015',
        leaseLabel: 'Aïssatou Barry — Duplex Ratoma 4',
        installmentId: 'ech-2026-09-0015',
        amount: 1_500_000
      },
      {
        leaseId: 'BAIL-2026-0040',
        leaseLabel: 'Mariam Camara — Villa Lambanyi 2',
        installmentId: 'ech-2026-09-0040',
        amount: 750_000
      }
    ],
    excluded: [
      { leaseId: 'BAIL-2026-0018', leaseLabel: 'Locataire — Bien', reason: 'LEASE_NOT_ACTIVE' },
      { leaseId: 'BAIL-2026-0025', leaseLabel: 'Locataire — Bien', reason: 'PERIOD_BEFORE_LEASE_START' },
      { leaseId: 'BAIL-2026-0033', leaseLabel: 'Locataire — Bien', reason: 'PERIOD_AFTER_LEASE_END' },
      { leaseId: 'BAIL-2026-0044', leaseLabel: 'Hadja Bangoura — Studio Coleah 3', reason: 'LEASE_WITHOUT_AMOUNT' },
      { leaseId: 'BAIL-2026-0050', leaseLabel: 'Locataire — Bien', reason: 'PERIOD_OFF_BILLING_CYCLE' }
    ],
    advancesApplied: [
      {
        tenantClientId: 'CLI-2026-0091',
        tenantLabel: 'Locataire',
        installmentId: 'ech-2026-09-0007',
        amount: 250_000,
        sourcePaymentId: 'paiement-2026-0450'
      }
    ]
  }
};

/** Août 2026 — la plus ancienne : une exécution qui a échoué, sans compte rendu. */
const CAMPAGNE_AOUT_ECHOUEE: BillingRun = {
  id: 'campagne-facturation-2026-08',
  periodYear: 2026,
  periodMonth: 8,
  label: "Loyer d'août 2026",
  status: 'FAILED',
  startedAt: '2026-08-01T07:29:00.000Z',
  finishedAt: '2026-08-01T07:29:01.000Z',
  summary: null
};

/** De la plus récente à la plus ancienne, comme le rend l'API réelle. */
export const CAMPAGNES: BillingRun[] = [
  CAMPAGNE_NOVEMBRE,
  CAMPAGNE_RELANCE_OCTOBRE,
  CAMPAGNE_SEPTEMBRE,
  CAMPAGNE_AOUT_ECHOUEE
];

export function repondreCampagne(chemin: string, scenario: Scenario): unknown | null {
  const detail = /\/tenants\/[^/]+\/finance\/billing-runs\/([^/]+)$/.exec(chemin);
  if (detail) {
    // Le detail d'une campagne inconnue retombe sur la premiere : la scene
    // reste atteignable sans connaitre les identifiants simules, comme le
    // fait deja la fiche d'un bien dans `mock-api.ts`.
    const campagne = CAMPAGNES.find(c => c.id === detail[1]) ?? CAMPAGNES[0] ?? null;
    return { success: true, data: campagne };
  }

  if (/\/tenants\/[^/]+\/finance\/billing-runs$/.test(chemin)) {
    return { success: true, data: scenario === 'vide' ? [] : CAMPAGNES };
  }

  return null;
}
