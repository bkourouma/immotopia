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
 * - **Sékou Kouadio** — actif, créancier de 1 250 000. Deux marchés : l'un en
 *   cours (`marche-kouadio-01`, 7 500 000 situés sur 12 000 000), l'autre en
 *   **dépassement** (`marche-kouadio-02`, `remainingAmount` négatif et
 *   `isOverrun` vrai). Ses situations montrent les deux états : une
 *   **validée** et une en **brouillon**.
 * - **Aïssatou Konan** — actif, `accountBalance` **négatif** : elle a reçu une
 *   avance de 500 000 alors que son marché n'a encore reçu aucune situation.
 *   Le cas qui prouve qu'un marché intact n'empêche pas un compte en avance.
 * - **Mamadou Koffi** — actif, marché **soldé** (`remainingAmount` à zéro,
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

const KOUADIO = 'tacheron-kouadio-01';
const KONAN = 'tacheron-konan-02';
const KOFFI = 'tacheron-koffi-03';
const TOURE = 'tacheron-toure-04';

const TACHERONS: Contractor[] = [
  {
    id: KOUADIO,
    tenantId: 'agence-1',
    fullName: 'Sékou Kouadio',
    trade: 'Maçonnerie',
    thirdPartyAccountId: 'compte-tiers-kouadio',
    isActive: true,
    // Créancier : des situations validées n'ont pas encore été réglées.
    accountBalance: 1_250_000,
    currency: DEVISE
  },
  {
    id: KONAN,
    tenantId: 'agence-1',
    fullName: 'Aïssatou Konan',
    trade: 'Peinture',
    thirdPartyAccountId: 'compte-tiers-konan',
    isActive: true,
    // NÉGATIF : une avance de 500 000 versée avant toute situation. Son marché
    // est pourtant intact — les deux soldes disent bien deux choses.
    accountBalance: -500_000,
    currency: DEVISE
  },
  {
    id: KOFFI,
    tenantId: 'agence-1',
    fullName: 'Mamadou Koffi',
    trade: 'Plomberie',
    thirdPartyAccountId: 'compte-tiers-koffi',
    isActive: true,
    // Son marché est SOLDÉ (voir `marche-koffi-01`) et il reste néanmoins
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

const MARCHE_KOUADIO_EN_COURS = 'marche-kouadio-01';
const MARCHE_KOUADIO_DEPASSE = 'marche-kouadio-02';
const MARCHE_KONAN = 'marche-konan-01';
const MARCHE_KOFFI = 'marche-koffi-01';
const MARCHE_TOURE = 'marche-toure-01';

const MARCHES: ContractorContract[] = [
  {
    id: MARCHE_KOUADIO_EN_COURS,
    contractorId: KOUADIO,
    contractorLabel: 'Sékou Kouadio',
    siteId: 'chantier-angre',
    siteLabel: 'Résidence Angré',
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
    id: MARCHE_KOUADIO_DEPASSE,
    contractorId: KOUADIO,
    contractorLabel: 'Sékou Kouadio',
    siteId: 'chantier-riviera',
    siteLabel: 'Villa de la Riviera',
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
    id: MARCHE_KONAN,
    contractorId: KONAN,
    contractorLabel: 'Aïssatou Konan',
    siteId: 'chantier-angre',
    siteLabel: 'Résidence Angré',
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
    id: MARCHE_KOFFI,
    contractorId: KOFFI,
    contractorLabel: 'Mamadou Koffi',
    siteId: 'chantier-riviera',
    siteLabel: 'Villa de la Riviera',
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
    siteId: 'chantier-angre',
    siteLabel: 'Résidence Angré',
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
  [MARCHE_KOUADIO_EN_COURS]: [
    {
      id: 'situation-kouadio-02',
      contractId: MARCHE_KOUADIO_EN_COURS,
      contractReference: 'MAR-2026-011',
      contractorLabel: 'Sékou Kouadio',
      statementDate: '2026-09-10',
      amount: 2_500_000,
      currency: DEVISE,
      description: 'Élévation des murs du premier niveau, 40 %',
      // BROUILLON : rien n'est encore constaté, aucun mouvement de compte.
      status: 'DRAFT',
      createdByLabel: 'Fatoumata Kouassi',
      validatedAt: null
    },
    {
      id: 'situation-kouadio-01',
      contractId: MARCHE_KOUADIO_EN_COURS,
      contractReference: 'MAR-2026-011',
      contractorLabel: 'Sékou Kouadio',
      statementDate: '2026-06-28',
      amount: 5_000_000,
      currency: DEVISE,
      description: 'Fondations et dallage du rez-de-chaussée',
      status: 'VALIDATED',
      createdByLabel: 'Fatoumata Kouassi',
      validatedAt: '2026-06-30T09:12:00.000Z'
    }
  ],
  [MARCHE_KOUADIO_DEPASSE]: [
    {
      id: 'situation-kouadio-03',
      contractId: MARCHE_KOUADIO_DEPASSE,
      contractReference: 'MAR-2026-012',
      contractorLabel: 'Sékou Kouadio',
      statementDate: '2026-08-22',
      amount: 3_400_000,
      currency: DEVISE,
      // La description explique le dépassement : c'est précisément ce que le
      // contrat exige d'elle.
      description: 'Reprise du mur de clôture effondré, hors marché initial',
      status: 'VALIDATED',
      createdByLabel: 'Ousmane Konan',
      validatedAt: '2026-08-25T11:40:00.000Z'
    }
  ],
  [MARCHE_KONAN]: [],
  [MARCHE_KOFFI]: [
    {
      id: 'situation-koffi-01',
      contractId: MARCHE_KOFFI,
      contractReference: 'MAR-2026-007',
      contractorLabel: 'Mamadou Koffi',
      statementDate: '2026-04-30',
      amount: 900_000,
      currency: DEVISE,
      description: 'Pose complète du réseau sanitaire',
      status: 'VALIDATED',
      createdByLabel: 'Fatoumata Kouassi',
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
      createdByLabel: 'Ousmane Konan',
      validatedAt: '2025-12-18T15:30:00.000Z'
    }
  ]
};

// ---------------------------------------------------------------------------
// Les règlements, par tâcheron
// ---------------------------------------------------------------------------

const REGLEMENTS_PAR_TACHERON: Record<string, ContractorPayment[]> = {
  [KOUADIO]: [
    {
      id: 'reglement-kouadio-02',
      contractorId: KOUADIO,
      contractorLabel: 'Sékou Kouadio',
      paymentDate: '2026-09-15',
      amount: 1_000_000,
      currency: DEVISE,
      status: 'DRAFT',
      createdByLabel: 'Fatoumata Kouassi',
      validatedAt: null
    },
    {
      id: 'reglement-kouadio-01',
      contractorId: KOUADIO,
      contractorLabel: 'Sékou Kouadio',
      paymentDate: '2026-07-05',
      amount: 7_150_000,
      currency: DEVISE,
      status: 'VALIDATED',
      createdByLabel: 'Fatoumata Kouassi',
      validatedAt: '2026-07-05T10:00:00.000Z'
    }
  ],
  [KONAN]: [
    {
      id: 'reglement-konan-01',
      contractorId: KONAN,
      contractorLabel: 'Aïssatou Konan',
      paymentDate: '2026-08-06',
      amount: 500_000,
      currency: DEVISE,
      // Versé avant toute situation : c'est l'acompte qui rend son compte
      // négatif, et que ses prochaines situations résorberont.
      status: 'VALIDATED',
      createdByLabel: 'Ousmane Konan',
      validatedAt: '2026-08-06T09:00:00.000Z'
    }
  ],
  // Rien n'a jamais été réglé à Koffi : son marché est pourtant soldé.
  [KOFFI]: [],
  [TOURE]: [
    {
      id: 'reglement-toure-01',
      contractorId: TOURE,
      contractorLabel: 'Ibrahima Touré',
      paymentDate: '2025-12-20',
      amount: 1_500_000,
      currency: DEVISE,
      status: 'VALIDATED',
      createdByLabel: 'Ousmane Konan',
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
