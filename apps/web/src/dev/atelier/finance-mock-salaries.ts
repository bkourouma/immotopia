/**
 * Atelier — fausse API du lot 4, sous-lot « salaires ».
 *
 * Modèle exact de `finance-mock-partnerships.ts` : ce fichier appartient en
 * entier à l'agent qui construit ces écrans, jeux d'essai ET réponses. Il
 * renvoie `null` quand l'URL ne le concerne pas ; `mock-api.ts` passe alors au
 * gestionnaire suivant.
 *
 * **Non câblé dans `mock-api.ts`.** Cet agent ne modifie que les fichiers de
 * son périmètre ; `mock-api.ts` — le registre qui ajoute chaque `repondreXxx`
 * à la liste consultée par l'adaptateur — n'en fait pas partie.
 * `repondreSalaries` est prêt à y être ajouté, sur le même modèle que
 * `repondrePartnerships` :
 *
 * ```ts
 * import { repondreSalaries } from './finance-mock-salaries';
 * // dans la liste `for (const repondre of [...])` :
 * repondreSalaries
 * ```
 *
 * ---------------------------------------------------------------------------
 * Quatre salariés, quatre situations que l'écran doit distinguer
 * ---------------------------------------------------------------------------
 *
 * Le cas heureux seul ne prouve rien : un écran qui n'a jamais vu un solde
 * négatif affiche « −120 000 » sans s'en apercevoir.
 *
 * - `emp-koffi` (maçon) : **on lui doit**. Deux notes validées, un seul
 *   règlement. Son solde est positif, c'est le cas courant du mois en cours.
 * - `emp-bamba` (gardien) : **soldé**. Tout ce qui a été constaté a été
 *   réglé — l'écran doit dire « rien à lui verser », pas afficher un zéro nu.
 * - `emp-coulibaly` (chef d'équipe) : **débiteur d'une avance**. Un règlement
 *   supérieur à ce qui lui était dû a été validé, et c'est voulu (contrat
 *   gelé, `ValidateSalaryPaymentTx`). Son solde est NÉGATIF, et l'écran doit
 *   le lire comme une avance à retenir, pas comme une dette de l'agence.
 * - `emp-toure` (comptable, INACTIVE) : le salarié parti, qui n'a plus rien à
 *   recevoir. Son solde est nul et son statut se lit « Inactif ».
 *
 * **Les notes couvrent les deux états et les deux natures** : un brouillon
 * (`note-koffi-09`, pas encore validé, donc rien de constaté), une note
 * validée IMPUTÉE à un chantier avec son poste de dépense
 * (`note-koffi-08`, besoin P9 — c'est elle qui fait qu'un chantier connaît sa
 * main-d'œuvre), et une note validée SANS chantier (`note-bamba-08`, une
 * charge de structure : l'écran doit dire « aucun chantier », pas laisser un
 * blanc).
 *
 * **Aucun montant n'est recalculé ici**, pas plus qu'à l'écran : les soldes
 * sont posés à la main, comme le serveur les émettrait, et ne se déduisent pas
 * des notes et règlements listés — ceux-ci ne couvrent que deux mois, le solde
 * court sur toute l'histoire du compte.
 *
 * ---------------------------------------------------------------------------
 * Deux limites assumées, héritées de `mock-api.ts`
 * ---------------------------------------------------------------------------
 *
 * **Le verbe est ignoré.** `mock-api.ts` route par le seul CHEMIN : les paires
 * GET liste / POST création qui le partagent (`employees`,
 * `employees/{id}/salary-payments`) retombent sur la même branche et rendent
 * la forme de la LISTE quel que soit le verbe. L'enregistrement d'un salarié et
 * la saisie d'un règlement ne sont donc pas démontrables de bout en bout ici ;
 * ils sont couverts par `__tests__/finance/salaires.test.tsx`, qui épingle
 * l'adresse et le corps exacts. La saisie d'une NOTE, elle, a son propre chemin
 * (`employees/{id}/salary-notes`, distinct de la lecture transversale
 * `salary-notes`) et fonctionne dans l'atelier.
 *
 * **La chaîne de requête est perdue** : voir le commentaire de
 * `repondreSalaries` plus bas. Les filtres « actifs seulement » et « notes de
 * ce salarié » ne sont donc pas reproduits.
 */

import type { Employee, SalaryNote, SalaryPayment } from '../../types/finance-salaries-types';
import type { Scenario } from './mock-api';

const TENANT = 'agence-1';

// Chantier repris par son seul identifiant plutôt que réimporté de
// `finance-mock-chantiers.ts` : les deux fichiers appartiennent à des agents
// différents, même raison qu'aux sous-lots précédents.
const CHANTIER_RIVIERA = 'chantier-riviera-01';
const POSTE_MAIN_DOEUVRE = 'poste-main-doeuvre';

// ---------------------------------------------------------------------------
// Les salariés
// ---------------------------------------------------------------------------

const EMP_KOFFI: Employee = {
  id: 'emp-koffi',
  tenantId: TENANT,
  fullName: 'Ibrahima Koffi',
  role: 'Maçon',
  thirdPartyAccountId: 'compte-koffi',
  isActive: true,
  // On lui doit : positif. Volontairement DIFFÉRENT de la somme des notes
  // moins les règlements listés plus bas — voir l'en-tête.
  accountBalance: 275_000,
  currency: 'XOF'
};

const EMP_BAMBA: Employee = {
  id: 'emp-bamba',
  tenantId: TENANT,
  fullName: 'Aïssatou Bamba',
  role: 'Gardienne',
  thirdPartyAccountId: 'compte-bamba',
  isActive: true,
  // Soldée : rien ne lui reste dû. L'écran doit le dire en toutes lettres.
  accountBalance: 0,
  currency: 'XOF'
};

const EMP_COULIBALY: Employee = {
  id: 'emp-coulibaly',
  tenantId: TENANT,
  fullName: 'Mamadou Coulibaly',
  role: "Chef d'équipe",
  thirdPartyAccountId: 'compte-coulibaly',
  isActive: true,
  // Avance sur salaire : c'est LUI qui doit à l'agence. Négatif, et voulu.
  accountBalance: -180_000,
  currency: 'XOF'
};

const EMP_TOURE: Employee = {
  id: 'emp-toure',
  tenantId: TENANT,
  fullName: 'Fatoumata Touré',
  role: 'Comptable',
  thirdPartyAccountId: 'compte-toure',
  // Inactive : n'apparaît qu'une fois le filtre « actifs seulement » retiré.
  isActive: false,
  accountBalance: 0,
  currency: 'XOF'
};

const SALARIES: Employee[] = [EMP_KOFFI, EMP_BAMBA, EMP_COULIBALY, EMP_TOURE];

// ---------------------------------------------------------------------------
// Les notes de salaire
// ---------------------------------------------------------------------------

const NOTES: SalaryNote[] = [
  {
    // Validée ET imputée à un chantier, avec son poste : le besoin P9, c'est
    // cette note qui fait qu'un chantier connaît sa main-d'œuvre.
    id: 'note-koffi-08',
    employeeId: EMP_KOFFI.id,
    employeeLabel: EMP_KOFFI.fullName,
    periodYear: 2026,
    periodMonth: 8,
    amount: 450_000,
    currency: 'XOF',
    siteId: CHANTIER_RIVIERA,
    siteLabel: 'Villa de la Riviera — gros œuvre',
    costCategoryId: POSTE_MAIN_DOEUVRE,
    costCategoryLabel: "Main-d'œuvre",
    status: 'VALIDATED',
    createdByLabel: 'Aminata Konan',
    validatedAt: '2026-08-31T16:20:00.000Z'
  },
  {
    // Brouillon : rien n'est encore constaté, aucun mouvement de compte. La
    // seule note de ce jeu d'essai qui offre le geste « Valider ».
    id: 'note-koffi-09',
    employeeId: EMP_KOFFI.id,
    employeeLabel: EMP_KOFFI.fullName,
    periodYear: 2026,
    periodMonth: 9,
    amount: 450_000,
    currency: 'XOF',
    siteId: CHANTIER_RIVIERA,
    siteLabel: 'Villa de la Riviera — gros œuvre',
    costCategoryId: POSTE_MAIN_DOEUVRE,
    costCategoryLabel: "Main-d'œuvre",
    status: 'DRAFT',
    createdByLabel: 'Aminata Konan',
    validatedAt: null
  },
  {
    // Validée SANS chantier : une charge de structure, imputable à rien.
    // L'écran doit dire « aucun chantier », pas laisser une case vide.
    id: 'note-bamba-08',
    employeeId: EMP_BAMBA.id,
    employeeLabel: EMP_BAMBA.fullName,
    periodYear: 2026,
    periodMonth: 8,
    amount: 180_000,
    currency: 'XOF',
    siteId: null,
    siteLabel: null,
    costCategoryId: null,
    costCategoryLabel: null,
    status: 'VALIDATED',
    createdByLabel: 'Aminata Konan',
    validatedAt: '2026-08-31T16:22:00.000Z'
  },
  {
    id: 'note-coulibaly-08',
    employeeId: EMP_COULIBALY.id,
    employeeLabel: EMP_COULIBALY.fullName,
    periodYear: 2026,
    periodMonth: 8,
    amount: 620_000,
    currency: 'XOF',
    siteId: CHANTIER_RIVIERA,
    siteLabel: 'Villa de la Riviera — gros œuvre',
    costCategoryId: POSTE_MAIN_DOEUVRE,
    costCategoryLabel: "Main-d'œuvre",
    status: 'VALIDATED',
    createdByLabel: 'Aminata Konan',
    validatedAt: '2026-08-31T16:25:00.000Z'
  }
];

// ---------------------------------------------------------------------------
// Les règlements
// ---------------------------------------------------------------------------

const REGLEMENTS_PAR_SALARIE: Record<string, SalaryPayment[]> = {
  [EMP_KOFFI.id]: [
    {
      id: 'regl-koffi-08',
      employeeId: EMP_KOFFI.id,
      employeeLabel: EMP_KOFFI.fullName,
      paymentDate: '2026-09-03T00:00:00.000Z',
      amount: 450_000,
      currency: 'XOF',
      status: 'VALIDATED',
      createdByLabel: 'Aminata Konan',
      validatedAt: '2026-09-03T11:05:00.000Z'
    },
    {
      // Brouillon : offre le geste « Valider » sur la fiche.
      id: 'regl-koffi-09',
      employeeId: EMP_KOFFI.id,
      employeeLabel: EMP_KOFFI.fullName,
      paymentDate: '2026-09-18T00:00:00.000Z',
      amount: 175_000,
      currency: 'XOF',
      status: 'DRAFT',
      createdByLabel: 'Aminata Konan',
      validatedAt: null
    }
  ],
  [EMP_BAMBA.id]: [
    {
      id: 'regl-bamba-08',
      employeeId: EMP_BAMBA.id,
      employeeLabel: EMP_BAMBA.fullName,
      paymentDate: '2026-09-03T00:00:00.000Z',
      amount: 180_000,
      currency: 'XOF',
      status: 'VALIDATED',
      createdByLabel: 'Aminata Konan',
      validatedAt: '2026-09-03T11:07:00.000Z'
    }
  ],
  [EMP_COULIBALY.id]: [
    {
      // Le règlement qui DÉPASSE ce qui lui était dû, validé sans être
      // refusé : c'est ce versement qui a rendu son compte débiteur d'une
      // avance. Le serveur l'accepte délibérément.
      id: 'regl-coulibaly-avance',
      employeeId: EMP_COULIBALY.id,
      employeeLabel: EMP_COULIBALY.fullName,
      paymentDate: '2026-09-05T00:00:00.000Z',
      amount: 800_000,
      currency: 'XOF',
      status: 'VALIDATED',
      createdByLabel: 'Aminata Konan',
      validatedAt: '2026-09-05T09:40:00.000Z'
    }
  ],
  [EMP_TOURE.id]: []
};

/**
 * `mock-api.ts` appelle chaque gestionnaire avec `url.pathname` SEUL : la
 * chaîne de requête est perdue avant d'arriver ici. Les deux filtres de ce
 * sous-lot — `onlyActive` sur la liste des salariés, `employeeId` sur la liste
 * transversale des notes — ne sont donc pas reproductibles dans l'atelier : la
 * liste montre toujours les quatre salariés, inactive comprise, et la fiche
 * montre toutes les notes du jeu d'essai. C'est une limite de l'atelier, pas de
 * l'écran ; les deux filtres partent bien en requête, et les tests
 * (`__tests__/finance/salaires.test.tsx`) épinglent l'URL exacte.
 */
export function repondreSalaries(chemin: string, scenario: Scenario): unknown | null {
  // --- Validation d'une note (chemin propre, aucune collision) -------------
  const validationNote = /\/tenants\/[^/]+\/finance\/salary-notes\/([^/]+)\/validate$/.exec(chemin);
  if (validationNote) {
    const note = NOTES.find(candidate => candidate.id === validationNote[1]) ?? NOTES[0];
    return { success: true, data: { ...note, status: 'VALIDATED', validatedAt: new Date().toISOString() } };
  }

  // --- Validation d'un règlement -------------------------------------------
  const validationReglement = /\/tenants\/[^/]+\/finance\/salary-payments\/([^/]+)\/validate$/.exec(chemin);
  if (validationReglement) {
    const tous = Object.values(REGLEMENTS_PAR_SALARIE).flat();
    const reglement = tous.find(candidate => candidate.id === validationReglement[1]) ?? tous[0];
    return { success: true, data: { ...reglement, status: 'VALIDATED', validatedAt: new Date().toISOString() } };
  }

  // --- Règlements d'un salarié (liste ET création partagent leur chemin) ---
  const reglementsMatch = /\/tenants\/[^/]+\/finance\/employees\/([^/]+)\/salary-payments$/.exec(chemin);
  if (reglementsMatch) {
    const liste = REGLEMENTS_PAR_SALARIE[reglementsMatch[1]] ?? [];
    return { success: true, data: scenario === 'vide' ? [] : liste };
  }

  // --- Notes d'un salarié : SAISIE seule. La lecture, elle, passe par la
  // route transversale `salary-notes` — les deux chemins sont distincts, il
  // n'y a donc aucune collision GET/POST ici.
  const notesEmployeMatch = /\/tenants\/[^/]+\/finance\/employees\/([^/]+)\/salary-notes$/.exec(chemin);
  if (notesEmployeMatch) {
    const premiere = NOTES.find(candidate => candidate.employeeId === notesEmployeMatch[1]) ?? NOTES[0];
    return { success: true, data: premiere };
  }

  // --- Liste transversale des notes (filtres perdus, voir plus haut) -------
  if (/\/tenants\/[^/]+\/finance\/salary-notes$/.test(chemin)) {
    return { success: true, data: scenario === 'vide' ? [] : NOTES };
  }

  // --- Détail d'un salarié --------------------------------------------------
  const detailMatch = /\/tenants\/[^/]+\/finance\/employees\/([^/]+)$/.exec(chemin);
  if (detailMatch) {
    const salarie = SALARIES.find(candidate => candidate.id === detailMatch[1]) ?? SALARIES[0];
    return { success: true, data: salarie };
  }

  // --- Liste ET création des salariés partagent leur chemin (en-tête) ------
  if (/\/tenants\/[^/]+\/finance\/employees$/.test(chemin)) {
    return { success: true, data: scenario === 'vide' ? [] : SALARIES };
  }

  return null;
}
