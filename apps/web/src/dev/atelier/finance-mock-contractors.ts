/**
 * Atelier — fausse API du lot 4, sous-lot « tâcherons ».
 *
 * Modèle exact de `finance-mock-partnerships.ts` : ce fichier appartient en
 * entier à l'agent qui construit ces écrans, jeux d'essai ET réponses. Il
 * renvoie `null` quand l'URL ne le concerne pas ; `mock-api.ts` passe alors au
 * gestionnaire suivant.
 *
 * **Non câblé dans `mock-api.ts`.** Cet agent ne modifie que les fichiers de
 * son périmètre ; `mock-api.ts` — le registre qui ajoute chaque `repondreXxx`
 * à la liste consultée par l'adaptateur — est un fichier-registre réservé au
 * superviseur. `repondreContractors` est prêt à y être ajouté, sur le même
 * modèle que `repondreLot4` :
 *
 * ```ts
 * import { repondreContractors } from './finance-mock-contractors';
 * // dans la liste `for (const repondre of [...])` :
 * repondreContractors
 * ```
 *
 * ---------------------------------------------------------------------------
 * Les cas montrés, et pourquoi chacun est là
 * ---------------------------------------------------------------------------
 *
 * Quatre tâcherons, choisis pour exercer les deux soldes du contrat, qui ne se
 * confondent jamais (« marché restant » = ce qui reste à exécuter ;
 * « ce qu'on lui doit » = ce qui reste à payer) :
 *
 * - **Sékou Camara** — actif, créancier de 1 250 000. Deux marchés : l'un en
 *   cours (`marche-camara-01`, 7 500 000 situés sur 12 000 000), l'autre en
 *   **dépassement** (`marche-camara-02`, `remainingAmount` négatif et
 *   `isOverrun` vrai). Ses situations montrent les deux états : une
 *   **validée** et une en **brouillon**.
 * - **Aïssatou Bah** — actif, `accountBalance` **négatif** : elle a reçu une
 *   avance de 500 000 alors que son marché n'a encore reçu aucune situation.
 *   Le cas qui prouve qu'un marché intact n'empêche pas un compte en avance.
 * - **Mamadou Sylla** — actif, marché **soldé** (`remainingAmount` à zéro,
 *   sans dépassement) mais **créancier de 900 000** : le cas exact que l'écran
 *   ne doit jamais mélanger, et que le test dédié de
 *   `__tests__/finance/tacherons.test.tsx` épingle.
 * - **Ibrahima Touré** — **inactif**, tout soldé : il n'apparaît qu'avec le
 *   filtre « actifs uniquement » décoché, ce qui rend ce filtre démontrable.
 *
 * Les chantiers et postes sont repris par leur libellé, jamais réimportés de
 * `fixtures.ts` ni de `finance-mock-chantiers.ts` : ces fichiers appartiennent
 * à d'autres agents, même raison qu'aux sous-lots précédents.
 *
 * **Limite assumée, identique à celle de `finance-mock-partnerships.ts`.**
 * `mock-api.ts` route par le seul CHEMIN, jamais par la méthode : les paires
 * GET liste / POST création qui partagent un chemin (`contractors`,
 * `contractors/{id}/payments`, `contractor-contracts/{id}/statements`)
 * retombent donc sur la même branche et rendent la forme de la LISTE quel que
 * soit le verbe. Les créations sont couvertes par les tests d'écran, service
 * réel et `apiClient` simulé.
 */

import type {
  Contractor,
  ContractorContract,
  ContractorPayment,
  ProgressStatement
} from '../../types/finance-contractors-types';
import type { Scenario } from './mock-api';

const DEVISE = 'XOF';

// ---------------------------------------------------------------------------
// Les tâcherons
// ---------------------------------------------------------------------------

const CAMARA = 'tacheron-camara-01';
const BAH = 'tacheron-bah-02';
const SYLLA = 'tacheron-sylla-03';
const TOURE = 'tacheron-toure-04';

const TACHERONS: Contractor[] = [
  {
    id: CAMARA,
    tenantId: 'agence-1',
    fullName: 'Sékou Camara',
    trade: 'Maçonnerie',
    thirdPartyAccountId: 'compte-tiers-camara',
    isActive: true,
    // Créancier : des situations validées n'ont pas encore été réglées.
    accountBalance: 1_250_000,
    currency: DEVISE
  },
  {
    id: BAH,
    tenantId: 'agence-1',
    fullName: 'Aïssatou Bah',
    trade: 'Peinture',
    thirdPartyAccountId: 'compte-tiers-bah',
    isActive: true,
    // NÉGATIF : une avance de 500 000 versée avant toute situation. Son marché
    // est pourtant intact — les deux soldes disent bien deux choses.
    accountBalance: -500_000,
    currency: DEVISE
  },
  {
    id: SYLLA,
    tenantId: 'agence-1',
    fullName: 'Mamadou Sylla',
    trade: 'Plomberie',
    thirdPartyAccountId: 'compte-tiers-sylla',
    isActive: true,
    // Son marché est SOLDÉ (voir `marche-sylla-01`) et il reste néanmoins
    // créancier de toute la somme : le cas que l'écran ne doit jamais
    // mélanger.
    accountBalance: 900_000,
    currency: DEVISE
  },
  {
    id: TOURE,
    tenantId: 'agence-1',
    fullName: 'Ibrahima Touré',
    trade: 'Électricité',
    thirdPartyAccountId: 'compte-tiers-toure',
    isActive: false,
    accountBalance: 0,
    currency: DEVISE
  }
];

// ---------------------------------------------------------------------------
// Les marchés
// ---------------------------------------------------------------------------

const MARCHE_CAMARA_EN_COURS = 'marche-camara-01';
const MARCHE_CAMARA_DEPASSE = 'marche-camara-02';
const MARCHE_BAH = 'marche-bah-01';
const MARCHE_SYLLA = 'marche-sylla-01';
const MARCHE_TOURE = 'marche-toure-01';

const MARCHES: ContractorContract[] = [
  {
    id: MARCHE_CAMARA_EN_COURS,
    contractorId: CAMARA,
    contractorLabel: 'Sékou Camara',
    siteId: 'chantier-kipe',
    siteLabel: 'Résidence Kipé',
    costCategoryId: 'poste-gros-oeuvre',
    costCategoryLabel: 'Gros œuvre',
    reference: 'MAR-2026-011',
    agreedAmount: 12_000_000,
    currency: DEVISE,
    signedDate: '2026-03-02',
    isActive: true,
    statementedAmount: 7_500_000,
    remainingAmount: 4_500_000,
    isOverrun: false
  },
  {
    id: MARCHE_CAMARA_DEPASSE,
    contractorId: CAMARA,
    contractorLabel: 'Sékou Camara',
    siteId: 'chantier-nongo',
    siteLabel: 'Villa de Nongo',
    costCategoryId: 'poste-gros-oeuvre',
    costCategoryLabel: 'Gros œuvre',
    reference: 'MAR-2026-012',
    agreedAmount: 3_000_000,
    currency: DEVISE,
    signedDate: '2026-05-18',
    isActive: true,
    // DÉPASSEMENT : les situations validées excèdent le marché convenu. Le
    // contrat l'expose, il ne l'interdit pas.
    statementedAmount: 3_400_000,
    remainingAmount: -400_000,
    isOverrun: true
  },
  {
    id: MARCHE_BAH,
    contractorId: BAH,
    contractorLabel: 'Aïssatou Bah',
    siteId: 'chantier-kipe',
    siteLabel: 'Résidence Kipé',
    costCategoryId: 'poste-second-oeuvre',
    costCategoryLabel: 'Second œuvre',
    reference: 'MAR-2026-020',
    agreedAmount: 2_000_000,
    currency: DEVISE,
    signedDate: '2026-08-04',
    isActive: true,
    // Rien d'exécuté, et pourtant une avance déjà versée (voir son compte).
    statementedAmount: 0,
    remainingAmount: 2_000_000,
    isOverrun: false
  },
  {
    id: MARCHE_SYLLA,
    contractorId: SYLLA,
    contractorLabel: 'Mamadou Sylla',
    siteId: 'chantier-nongo',
    siteLabel: 'Villa de Nongo',
    costCategoryId: 'poste-second-oeuvre',
    costCategoryLabel: 'Second œuvre',
    reference: 'MAR-2026-007',
    agreedAmount: 900_000,
    currency: DEVISE,
    signedDate: '2026-02-11',
    isActive: true,
    // SOLDÉ : tout a été exécuté et validé. Rien n'a été réglé pour autant —
    // son compte porte encore 900 000.
    statementedAmount: 900_000,
    remainingAmount: 0,
    isOverrun: false
  },
  {
    id: MARCHE_TOURE,
    contractorId: TOURE,
    contractorLabel: 'Ibrahima Touré',
    siteId: 'chantier-kipe',
    siteLabel: 'Résidence Kipé',
    costCategoryId: 'poste-second-oeuvre',
    costCategoryLabel: 'Second œuvre',
    reference: 'MAR-2025-044',
    agreedAmount: 1_500_000,
    currency: DEVISE,
    signedDate: '2025-11-20',
    isActive: false,
    statementedAmount: 1_500_000,
    remainingAmount: 0,
    isOverrun: false
  }
];

// ---------------------------------------------------------------------------
// Les situations d'avancement, par marché
// ---------------------------------------------------------------------------

const SITUATIONS_PAR_MARCHE: Record<string, ProgressStatement[]> = {
  [MARCHE_CAMARA_EN_COURS]: [
    {
      id: 'situation-camara-02',
      contractId: MARCHE_CAMARA_EN_COURS,
      contractReference: 'MAR-2026-011',
      contractorLabel: 'Sékou Camara',
      statementDate: '2026-09-10',
      amount: 2_500_000,
      currency: DEVISE,
      description: 'Élévation des murs du premier niveau, 40 %',
      // BROUILLON : rien n'est encore constaté, aucun mouvement de compte.
      status: 'DRAFT',
      createdByLabel: 'Fatoumata Diallo',
      validatedAt: null
    },
    {
      id: 'situation-camara-01',
      contractId: MARCHE_CAMARA_EN_COURS,
      contractReference: 'MAR-2026-011',
      contractorLabel: 'Sékou Camara',
      statementDate: '2026-06-28',
      amount: 5_000_000,
      currency: DEVISE,
      description: 'Fondations et dallage du rez-de-chaussée',
      status: 'VALIDATED',
      createdByLabel: 'Fatoumata Diallo',
      validatedAt: '2026-06-30T09:12:00.000Z'
    }
  ],
  [MARCHE_CAMARA_DEPASSE]: [
    {
      id: 'situation-camara-03',
      contractId: MARCHE_CAMARA_DEPASSE,
      contractReference: 'MAR-2026-012',
      contractorLabel: 'Sékou Camara',
      statementDate: '2026-08-22',
      amount: 3_400_000,
      currency: DEVISE,
      // La description explique le dépassement : c'est précisément ce que le
      // contrat exige d'elle.
      description: 'Reprise du mur de clôture effondré, hors marché initial',
      status: 'VALIDATED',
      createdByLabel: 'Ousmane Bah',
      validatedAt: '2026-08-25T11:40:00.000Z'
    }
  ],
  [MARCHE_BAH]: [],
  [MARCHE_SYLLA]: [
    {
      id: 'situation-sylla-01',
      contractId: MARCHE_SYLLA,
      contractReference: 'MAR-2026-007',
      contractorLabel: 'Mamadou Sylla',
      statementDate: '2026-04-30',
      amount: 900_000,
      currency: DEVISE,
      description: 'Pose complète du réseau sanitaire',
      status: 'VALIDATED',
      createdByLabel: 'Fatoumata Diallo',
      validatedAt: '2026-05-02T08:05:00.000Z'
    }
  ],
  [MARCHE_TOURE]: [
    {
      id: 'situation-toure-01',
      contractId: MARCHE_TOURE,
      contractReference: 'MAR-2025-044',
      contractorLabel: 'Ibrahima Touré',
      statementDate: '2025-12-15',
      amount: 1_500_000,
      currency: DEVISE,
      description: 'Installation électrique complète, 12 points lumineux',
      status: 'VALIDATED',
      createdByLabel: 'Ousmane Bah',
      validatedAt: '2025-12-18T15:30:00.000Z'
    }
  ]
};

// ---------------------------------------------------------------------------
// Les règlements, par tâcheron
// ---------------------------------------------------------------------------

const REGLEMENTS_PAR_TACHERON: Record<string, ContractorPayment[]> = {
  [CAMARA]: [
    {
      id: 'reglement-camara-02',
      contractorId: CAMARA,
      contractorLabel: 'Sékou Camara',
      paymentDate: '2026-09-15',
      amount: 1_000_000,
      currency: DEVISE,
      status: 'DRAFT',
      createdByLabel: 'Fatoumata Diallo',
      validatedAt: null
    },
    {
      id: 'reglement-camara-01',
      contractorId: CAMARA,
      contractorLabel: 'Sékou Camara',
      paymentDate: '2026-07-05',
      amount: 7_150_000,
      currency: DEVISE,
      status: 'VALIDATED',
      createdByLabel: 'Fatoumata Diallo',
      validatedAt: '2026-07-05T10:00:00.000Z'
    }
  ],
  [BAH]: [
    {
      id: 'reglement-bah-01',
      contractorId: BAH,
      contractorLabel: 'Aïssatou Bah',
      paymentDate: '2026-08-06',
      amount: 500_000,
      currency: DEVISE,
      // Versé avant toute situation : c'est l'acompte qui rend son compte
      // négatif, et que ses prochaines situations résorberont.
      status: 'VALIDATED',
      createdByLabel: 'Ousmane Bah',
      validatedAt: '2026-08-06T09:00:00.000Z'
    }
  ],
  // Rien n'a jamais été réglé à Sylla : son marché est pourtant soldé.
  [SYLLA]: [],
  [TOURE]: [
    {
      id: 'reglement-toure-01',
      contractorId: TOURE,
      contractorLabel: 'Ibrahima Touré',
      paymentDate: '2025-12-20',
      amount: 1_500_000,
      currency: DEVISE,
      status: 'VALIDATED',
      createdByLabel: 'Ousmane Bah',
      validatedAt: '2025-12-20T16:00:00.000Z'
    }
  ]
};

export function repondreContractors(chemin: string, scenario: Scenario): unknown | null {
  // --- Validation d'une situation (chemin propre, aucune collision) --------
  if (/\/tenants\/[^/]+\/finance\/progress-statements\/([^/]+)\/validate$/.test(chemin)) {
    const match = /\/progress-statements\/([^/]+)\/validate$/.exec(chemin) as RegExpExecArray;
    const toutes = Object.values(SITUATIONS_PAR_MARCHE).flat();
    const situation = toutes.find(s => s.id === match[1]) ?? toutes[0];
    return { success: true, data: { ...situation, status: 'VALIDATED', validatedAt: new Date().toISOString() } };
  }

  // --- Validation d'un règlement (chemin propre) ---------------------------
  if (/\/tenants\/[^/]+\/finance\/contractor-payments\/([^/]+)\/validate$/.test(chemin)) {
    const match = /\/contractor-payments\/([^/]+)\/validate$/.exec(chemin) as RegExpExecArray;
    const tous = Object.values(REGLEMENTS_PAR_TACHERON).flat();
    const reglement = tous.find(r => r.id === match[1]) ?? tous[0];
    return { success: true, data: { ...reglement, status: 'VALIDATED', validatedAt: new Date().toISOString() } };
  }

  // --- Situations d'un marché (GET liste et POST création partagent ce
  //     chemin : voir l'en-tête, la liste l'emporte) -----------------------
  const situationsMatch = /\/tenants\/[^/]+\/finance\/contractor-contracts\/([^/]+)\/statements$/.exec(chemin);
  if (situationsMatch) {
    const situations = SITUATIONS_PAR_MARCHE[situationsMatch[1]] ?? [];
    return { success: true, data: scenario === 'vide' ? [] : situations };
  }

  // --- Détail d'un marché ---------------------------------------------------
  const marcheMatch = /\/tenants\/[^/]+\/finance\/contractor-contracts\/([^/]+)$/.exec(chemin);
  if (marcheMatch) {
    const marche = MARCHES.find(candidat => candidat.id === marcheMatch[1]) ?? MARCHES[0];
    return { success: true, data: marche };
  }

  // --- Liste TRANSVERSALE des marchés. Le filtre `contractorId` voyage en
  //     paramètre de requête, que `mock-api.ts` ne transmet pas ici : la
  //     fausse API rend donc tous les marchés, et l'écran en montre plus que
  //     le vrai serveur n'en renverrait. Limite assumée du banc, notée dans
  //     le rapport de cet agent.
  if (/\/tenants\/[^/]+\/finance\/contractor-contracts$/.test(chemin)) {
    return { success: true, data: scenario === 'vide' ? [] : MARCHES };
  }

  // --- Règlements d'un tâcheron (GET et POST partagent ce chemin) ----------
  const reglementsMatch = /\/tenants\/[^/]+\/finance\/contractors\/([^/]+)\/payments$/.exec(chemin);
  if (reglementsMatch) {
    const reglements = REGLEMENTS_PAR_TACHERON[reglementsMatch[1]] ?? [];
    return { success: true, data: scenario === 'vide' ? [] : reglements };
  }

  // --- Convention d'un marché (POST seul sur ce chemin, pas de collision) --
  const nouveauMarcheMatch = /\/tenants\/[^/]+\/finance\/contractors\/([^/]+)\/contracts$/.exec(chemin);
  if (nouveauMarcheMatch) {
    const marche = MARCHES.find(candidat => candidat.contractorId === nouveauMarcheMatch[1]) ?? MARCHES[0];
    return { success: true, data: marche };
  }

  // --- Liste des tâcherons ET enregistrement partagent leur chemin ---------
  //
  // Le filtre `onlyActive` est un paramètre de requête, que `mock-api.ts` ne
  // transmet pas à ce gestionnaire : la liste rend les quatre tâcherons quel
  // que soit l'état de la case. Même limite que ci-dessus.
  if (/\/tenants\/[^/]+\/finance\/contractors$/.test(chemin)) {
    return { success: true, data: scenario === 'vide' ? [] : TACHERONS };
  }

  return null;
}
