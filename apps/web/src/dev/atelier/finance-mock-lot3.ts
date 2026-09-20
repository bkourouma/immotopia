/**
 * Atelier — fausse API du lot 3 (budget, avenants, bons de commande, engagé,
 * alertes, tableau de bord).
 *
 * Modèle exact de `finance-mock-chantiers.ts` : ce fichier appartient en
 * entier à l'agent qui construit ces écrans, jeux d'essai ET réponses, séparé
 * des autres volets pour qu'aucun agent n'ait à modifier le fichier d'un
 * autre. Il renvoie `null` quand l'URL ne le concerne pas ; `mock-api.ts`
 * passe alors au gestionnaire suivant.
 *
 * **Non câblé dans `mock-api.ts`.** Cet agent ne modifie que les fichiers de
 * son périmètre (consigne explicite du rapport) ; `mock-api.ts` — le registre
 * qui ajoute chaque `repondreXxx` à la liste consultée par l'adaptateur —
 * n'en fait pas partie. `repondreLot3` est prêt à y être ajouté, sur le même
 * modèle que `repondreChantiers` :
 *
 * ```ts
 * import { repondreLot3 } from './finance-mock-lot3';
 * // dans la liste `for (const repondre of [...])` :
 * repondreLot3
 * ```
 *
 * **Trois chantiers repris de `finance-mock-chantiers.ts`, mêmes
 * identifiants**, pour que l'atelier raconte une seule histoire cohérente
 * d'un volet à l'autre plutôt que deux jeux de données sans rapport :
 *
 * - `chantier-riche-01` (Villa duplex — Angré Centre) porte un budget VALIDÉ,
 *   un avenant validé et un second en brouillon, plusieurs bons de commande
 *   dans des états différents, et une alerte de seuil OUVERTE mais SANS
 *   dépassement (l'engagé approche le budget révisé sans le dépasser) — le
 *   cas qui distingue une alerte de seuil d'un dépassement réel.
 * - `chantier-sans-bien-01` (Terrain loué — Riviera) porte un budget plus
 *   modeste, sans avenant, et cette fois un DÉPASSEMENT réel (l'engagé
 *   dépasse le budget révisé) doublé d'une alerte ouverte — l'écart doit s'y
 *   afficher en rouge.
 * - `chantier-nouveau-01` (Extension villa — Bingerville) n'a AUCUN budget : le
 *   cas qui doit se lire comme « pas encore budgété », jamais comme une
 *   panne. `getSiteBudget` y répond par une donnée `null` — voir le
 *   commentaire de cette fonction dans `finance-lot3-service.ts` sur
 *   l'écart, assumé, avec le vrai 404 du contrat serveur.
 *
 * **Limite assumée, identique à celle de `finance-mock-chantiers.ts`.**
 * `mock-api.ts` route par le seul CHEMIN, jamais par la méthode : les paires
 * GET liste / POST création qui partagent un chemin
 * (`sites/{siteId}/budgets`, `site-budgets/{budgetId}/amendments`,
 * `purchase-orders`) retombent donc sur la même branche, et rendent la forme
 * de la LISTE quel que soit le verbe. La création n'est donc démontrable de
 * bout en bout dans l'atelier que pour les chemins qui n'ont pas ce
 * collisionnement (`sites/{siteId}/budget` au singulier, les actions
 * `/validate`, `/issue`, `/cancel`, `/acknowledge`, uniques à leur verbe) ; le
 * reste est couvert par les tests unitaires des composants, service mocké.
 */

import type {
  BudgetAmendment,
  PurchaseOrder,
  SiteBudget,
  SiteBudgetAlert,
  SiteDashboardRow,
  SiteEngagement
} from '../../types/finance-lot3-types';
import type { Scenario } from './mock-api';

const SITE_RICHE = 'chantier-riche-01';
const SITE_SANS_BIEN = 'chantier-sans-bien-01';
const SITE_NOUVEAU = 'chantier-nouveau-01';

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

const BUDGET_RICHE: SiteBudget = {
  id: 'budget-riche-01',
  siteId: SITE_RICHE,
  label: 'Budget initial 2026',
  status: 'VALIDATED',
  validatedAt: '2026-04-05T09:00:00.000Z',
  validatedByLabel: 'Mamadou Konan',
  currency: 'XOF',
  lines: [
    {
      id: 'ligne-riche-01',
      costCategoryId: 'poste-gros-oeuvre',
      costCategoryLabel: 'Gros œuvre',
      label: 'Fondations et murs porteurs',
      amountForecast: 8_000_000
    },
    {
      id: 'ligne-riche-02',
      costCategoryId: 'poste-toiture',
      costCategoryLabel: 'Toiture',
      label: 'Charpente et couverture',
      amountForecast: 5_000_000
    },
    {
      id: 'ligne-riche-03',
      costCategoryId: 'poste-plomberie',
      costCategoryLabel: 'Plomberie',
      label: 'Plomberie complète',
      amountForecast: 2_000_000
    },
    {
      id: 'ligne-riche-04',
      costCategoryId: 'poste-electricite',
      costCategoryLabel: 'Électricité',
      label: 'Installation électrique',
      amountForecast: 2_500_000
    },
    {
      id: 'ligne-riche-05',
      costCategoryId: 'poste-main-oeuvre',
      costCategoryLabel: "Main-d'œuvre",
      label: "Main-d'œuvre toutes équipes",
      amountForecast: 4_000_000
    },
    {
      id: 'ligne-riche-06',
      costCategoryId: 'poste-materiaux',
      costCategoryLabel: 'Matériaux',
      label: 'Matériaux de finition',
      amountForecast: 3_000_000
    },
    {
      id: 'ligne-riche-07',
      costCategoryId: 'poste-divers',
      costCategoryLabel: 'Divers',
      label: 'Imprévus',
      amountForecast: 1_000_000
    }
  ],
  // Somme des lignes ci-dessus : 25 500 000. Recopiée telle que le serveur la
  // rendrait — jamais recalculée par un écran (P-4, voir data-model.md §2).
  totalForecast: 25_500_000,
  // Initial plus les avenants VALIDÉS : 25 500 000 + 1 200 000 = 26 700 000.
  //
  // L'avenant de −300 000 est encore en brouillon et ne compte donc pour
  // rien. La scène le montre à dessein : c'est la règle qu'un écran doit
  // rendre lisible, et une maquette qui l'ignorerait mettrait au point un cas
  // qui n'arrive pas.
  revisedTotal: 26_700_000
};

const BUDGET_SANS_BIEN: SiteBudget = {
  id: 'budget-sans-bien-01',
  siteId: SITE_SANS_BIEN,
  label: 'Budget initial',
  status: 'VALIDATED',
  validatedAt: '2026-06-05T09:00:00.000Z',
  validatedByLabel: 'Ibrahima Yao',
  currency: 'XOF',
  lines: [
    {
      id: 'ligne-sb-01',
      costCategoryId: 'poste-gros-oeuvre',
      costCategoryLabel: 'Gros œuvre',
      label: 'Fondations',
      amountForecast: 2_000_000
    },
    {
      id: 'ligne-sb-02',
      costCategoryId: 'poste-main-oeuvre',
      costCategoryLabel: "Main-d'œuvre",
      label: "Main-d'œuvre fondations",
      amountForecast: 1_000_000
    },
    {
      id: 'ligne-sb-03',
      costCategoryId: 'poste-divers',
      costCategoryLabel: 'Divers',
      label: 'Location du terrain',
      amountForecast: 500_000
    }
  ],
  totalForecast: 3_500_000,
  // Aucun avenant sur ce chantier : le révisé vaut l'initial.
  revisedTotal: 3_500_000
};

const BUDGETS_PAR_SITE: Record<string, SiteBudget | null> = {
  [SITE_RICHE]: BUDGET_RICHE,
  [SITE_SANS_BIEN]: BUDGET_SANS_BIEN,
  // Aucun budget encore posé : voir l'en-tête du fichier sur l'écart 404/`null`.
  [SITE_NOUVEAU]: null
};

// ---------------------------------------------------------------------------
// Avenants — uniquement sur le chantier riche
// ---------------------------------------------------------------------------

const AVENANTS_RICHE: BudgetAmendment[] = [
  {
    id: 'avenant-riche-01',
    budgetId: BUDGET_RICHE.id,
    amendmentDate: '2026-06-01',
    reason: "Renchérissement du ciment sur le marché d'Abidjan",
    status: 'VALIDATED',
    createdByLabel: 'Mamadou Konan',
    validatedAt: '2026-06-03T08:00:00.000Z',
    lines: [
      {
        id: 'avenant-riche-01-l1',
        costCategoryId: 'poste-gros-oeuvre',
        costCategoryLabel: 'Gros œuvre',
        amountDelta: 1_200_000
      }
    ],
    totalDelta: 1_200_000
  },
  {
    id: 'avenant-riche-02',
    budgetId: BUDGET_RICHE.id,
    amendmentDate: '2026-08-10',
    reason: 'Réduction du poste divers : imprévus non consommés à ce stade',
    status: 'DRAFT',
    createdByLabel: 'Ibrahima Yao',
    validatedAt: null,
    lines: [
      { id: 'avenant-riche-02-l1', costCategoryId: 'poste-divers', costCategoryLabel: 'Divers', amountDelta: -300_000 }
    ],
    totalDelta: -300_000
  }
];

const AVENANTS_PAR_BUDGET: Record<string, BudgetAmendment[]> = {
  [BUDGET_RICHE.id]: AVENANTS_RICHE,
  [BUDGET_SANS_BIEN.id]: []
};

// ---------------------------------------------------------------------------
// Bons de commande
// ---------------------------------------------------------------------------

const BONS: PurchaseOrder[] = [
  {
    id: 'bon-riche-01',
    siteId: SITE_RICHE,
    siteLabel: 'Villa duplex — Angré Centre',
    supplierId: 'frs-ciments-afrique',
    supplierLabel: "Ciments d'Afrique CI",
    reference: 'BC-2026-0041',
    orderDate: '2026-04-02',
    status: 'ISSUED',
    currency: 'XOF',
    lines: [
      {
        id: 'bon-riche-01-l1',
        costCategoryId: 'poste-gros-oeuvre',
        costCategoryLabel: 'Gros œuvre',
        label: 'Ciment et fer à béton',
        amount: 3_500_000
      }
    ],
    totalAmount: 3_500_000,
    invoicedAmount: 3_500_000,
    remainingAmount: 0,
    invoicingState: 'SETTLED'
  },
  {
    id: 'bon-riche-02',
    siteId: SITE_RICHE,
    siteLabel: 'Villa duplex — Angré Centre',
    supplierId: 'frs-sotraco',
    supplierLabel: 'Sotraco Ivoire',
    reference: 'BC-2026-0052',
    orderDate: '2026-05-20',
    status: 'ISSUED',
    currency: 'XOF',
    lines: [
      {
        id: 'bon-riche-02-l1',
        costCategoryId: 'poste-toiture',
        costCategoryLabel: 'Toiture',
        label: 'Charpente métallique et tôles',
        amount: 4_100_000
      }
    ],
    totalAmount: 4_100_000,
    invoicedAmount: 2_000_000,
    remainingAmount: 2_100_000,
    invoicingState: 'PARTIALLY_INVOICED'
  },
  {
    id: 'bon-riche-03',
    siteId: SITE_RICHE,
    siteLabel: 'Villa duplex — Angré Centre',
    supplierId: 'frs-elec-plus',
    supplierLabel: 'Elec Plus',
    reference: 'BC-2026-0060',
    orderDate: '2026-09-01',
    status: 'DRAFT',
    currency: 'XOF',
    lines: [
      {
        id: 'bon-riche-03-l1',
        costCategoryId: 'poste-electricite',
        costCategoryLabel: 'Électricité',
        label: 'Tableau électrique',
        amount: 1_950_000
      }
    ],
    totalAmount: 1_950_000,
    invoicedAmount: 0,
    // Un brouillon n'engage rien (§3 du modèle) : ce reste à facturer ne
    // compte pas encore dans l'engagé du chantier tant qu'il n'est pas émis.
    remainingAmount: 1_950_000,
    invoicingState: 'NOT_INVOICED'
  },
  {
    id: 'bon-riche-04',
    siteId: SITE_RICHE,
    siteLabel: 'Villa duplex — Angré Centre',
    supplierId: 'frs-kouassi',
    supplierLabel: 'Quincaillerie Kouassi & Fils',
    reference: 'BC-2026-0035',
    orderDate: '2026-03-15',
    status: 'CANCELLED',
    currency: 'XOF',
    lines: [
      {
        id: 'bon-riche-04-l1',
        costCategoryId: 'poste-gros-oeuvre',
        costCategoryLabel: 'Gros œuvre',
        label: 'Parpaings',
        amount: 800_000
      }
    ],
    totalAmount: 800_000,
    invoicedAmount: 0,
    remainingAmount: 800_000,
    invoicingState: 'NOT_INVOICED'
  },
  {
    id: 'bon-sans-bien-01',
    siteId: SITE_SANS_BIEN,
    siteLabel: 'Terrain loué — Riviera',
    supplierId: 'frs-bloc-ivoire',
    supplierLabel: 'Bloc Ivoire',
    reference: 'BC-2026-0071',
    orderDate: '2026-07-01',
    status: 'ISSUED',
    currency: 'XOF',
    lines: [
      {
        id: 'bon-sans-bien-01-l1',
        costCategoryId: 'poste-gros-oeuvre',
        costCategoryLabel: 'Gros œuvre',
        label: 'Blocs de ciment',
        amount: 900_000
      }
    ],
    totalAmount: 900_000,
    invoicedAmount: 0,
    remainingAmount: 900_000,
    invoicingState: 'NOT_INVOICED'
  }
];

// ---------------------------------------------------------------------------
// Engagé — dérivé des mêmes montants que les bons ci-dessus, jamais recalculé
// à l'écran (§3 du modèle : réalisé + reste à facturer des bons ÉMIS et non
// annulés).
// ---------------------------------------------------------------------------

const ENGAGEMENTS: Record<string, SiteEngagement> = {
  [SITE_RICHE]: {
    siteId: SITE_RICHE,
    actualCost: 19_500_000,
    // Reste à facturer des bons ÉMIS non annulés : bon-riche-01 (0) + bon-riche-02
    // (2 100 000). Le brouillon (bon-riche-03) et l'annulé (bon-riche-04)
    // n'y comptent pas.
    openCommitments: 2_100_000,
    engagedAmount: 21_600_000,
    currency: 'XOF'
  },
  [SITE_SANS_BIEN]: {
    siteId: SITE_SANS_BIEN,
    actualCost: 3_100_000,
    openCommitments: 900_000,
    engagedAmount: 4_000_000,
    currency: 'XOF'
  },
  [SITE_NOUVEAU]: {
    siteId: SITE_NOUVEAU,
    actualCost: 0,
    openCommitments: 0,
    engagedAmount: 0,
    currency: 'XOF'
  }
};

// ---------------------------------------------------------------------------
// Alertes — une par chantier concerné, jamais acquittée dans ce jeu d'essai
// ---------------------------------------------------------------------------

/**
 * Alerte de SEUIL, sans dépassement réel : l'engagé (21 600 000) approche le
 * budget révisé (25 500 000 + 1 200 000 d'avenant validé = 26 700 000) sans le
 * dépasser. Distingue à l'écran une alerte d'un dépassement — les deux
 * n'arrivent pas forcément ensemble (voir l'en-tête du fichier).
 */
const ALERTE_RICHE: SiteBudgetAlert = {
  id: 'alerte-riche-01',
  siteId: SITE_RICHE,
  siteLabel: 'Villa duplex — Angré Centre',
  budgetId: BUDGET_RICHE.id,
  thresholdPercent: 80,
  engagedAmount: 21_600_000,
  budgetAmount: 26_700_000,
  consumedPercent: 81,
  raisedAt: '2026-09-10T09:00:00.000Z',
  acknowledgedAt: null,
  currency: 'XOF'
};

/** Dépassement réel cette fois : l'engagé (4 000 000) dépasse le budget révisé (3 500 000, aucun avenant). */
const ALERTE_SANS_BIEN: SiteBudgetAlert = {
  id: 'alerte-sans-bien-01',
  siteId: SITE_SANS_BIEN,
  siteLabel: 'Terrain loué — Riviera',
  budgetId: BUDGET_SANS_BIEN.id,
  thresholdPercent: 100,
  engagedAmount: 4_000_000,
  budgetAmount: 3_500_000,
  consumedPercent: 114,
  raisedAt: '2026-09-05T09:00:00.000Z',
  acknowledgedAt: null,
  currency: 'XOF'
};

const ALERTES: SiteBudgetAlert[] = [ALERTE_RICHE, ALERTE_SANS_BIEN];

// ---------------------------------------------------------------------------
// Tableau de bord — une ligne par chantier, chiffres cohérents avec les
// budgets, bons et alertes ci-dessus.
// ---------------------------------------------------------------------------

const LIGNES_TABLEAU_DE_BORD: SiteDashboardRow[] = [
  {
    siteId: SITE_RICHE,
    siteLabel: 'Villa duplex — Angré Centre',
    zone: 'Angré, Cocody',
    status: 'IN_PROGRESS',
    initialBudget: BUDGET_RICHE.totalForecast,
    // Révisé = initial (25 500 000) + avenants VALIDÉS (1 200 000) ; l'avenant
    // en brouillon (-300 000) n'y compte pas encore.
    revisedBudget: 26_700_000,
    engagedAmount: ENGAGEMENTS[SITE_RICHE].engagedAmount,
    actualCost: ENGAGEMENTS[SITE_RICHE].actualCost,
    progressPercent: 70,
    // Positif : encore dans le budget révisé, malgré l'alerte de seuil.
    variance: 5_100_000,
    variancePercent: 19,
    openAlert: ALERTE_RICHE,
    currency: 'XOF'
  },
  {
    siteId: SITE_SANS_BIEN,
    siteLabel: 'Terrain loué — Riviera',
    zone: 'Riviera, Cocody',
    status: 'IN_PROGRESS',
    initialBudget: BUDGET_SANS_BIEN.totalForecast,
    revisedBudget: BUDGET_SANS_BIEN.totalForecast,
    engagedAmount: ENGAGEMENTS[SITE_SANS_BIEN].engagedAmount,
    actualCost: ENGAGEMENTS[SITE_SANS_BIEN].actualCost,
    progressPercent: 35,
    // Négatif : dépassement réel, à afficher en rouge.
    variance: -500_000,
    variancePercent: -14,
    openAlert: ALERTE_SANS_BIEN,
    currency: 'XOF'
  },
  {
    siteId: SITE_NOUVEAU,
    siteLabel: 'Extension villa — Bingerville',
    zone: 'Bingerville, Abidjan',
    status: 'PLANNED',
    // Pas encore de budget : les trois champs qui en dépendent sont nuls,
    // sans que ce soit une panne (même doctrine que `finance-mock-chantiers.ts`
    // pour son chantier nouvellement créé).
    initialBudget: null,
    revisedBudget: null,
    engagedAmount: 0,
    actualCost: 0,
    progressPercent: 0,
    variance: null,
    variancePercent: null,
    openAlert: null,
    currency: 'XOF'
  }
];

export function repondreLot3(chemin: string, scenario: Scenario): unknown | null {
  // --- Tableau de bord ---------------------------------------------------
  if (/\/tenants\/[^/]+\/finance\/sites\/dashboard$/.test(chemin)) {
    return { success: true, data: { rows: scenario === 'vide' ? [] : LIGNES_TABLEAU_DE_BORD, currency: 'XOF' } };
  }

  // --- Budget d'un chantier (singulier : GET seul, pas de collision) -----
  const budgetMatch = /\/tenants\/[^/]+\/finance\/sites\/([^/]+)\/budget$/.exec(chemin);
  if (budgetMatch) {
    const siteId = budgetMatch[1];
    const budget = siteId in BUDGETS_PAR_SITE ? BUDGETS_PAR_SITE[siteId] : BUDGET_RICHE;
    return { success: true, data: scenario === 'vide' ? null : budget };
  }

  // --- Historique des budgets d'un chantier (liste ET création, voir l'en-tête) ---
  if (/\/tenants\/[^/]+\/finance\/sites\/[^/]+\/budgets$/.test(chemin)) {
    return { success: true, data: scenario === 'vide' ? [] : [BUDGET_RICHE] };
  }

  if (/\/tenants\/[^/]+\/finance\/site-budgets\/[^/]+\/validate$/.test(chemin)) {
    return {
      success: true,
      data: {
        ...BUDGET_RICHE,
        status: 'VALIDATED' as const,
        validatedAt: new Date().toISOString(),
        validatedByLabel: 'Mamadou Konan'
      }
    };
  }

  // --- Avenants (liste ET création partagent leur chemin, voir l'en-tête) ---
  const avenantsMatch = /\/tenants\/[^/]+\/finance\/site-budgets\/([^/]+)\/amendments$/.exec(chemin);
  if (avenantsMatch) {
    const budgetId = avenantsMatch[1];
    const liste = budgetId in AVENANTS_PAR_BUDGET ? AVENANTS_PAR_BUDGET[budgetId] : AVENANTS_RICHE;
    return { success: true, data: scenario === 'vide' ? [] : liste };
  }

  if (/\/tenants\/[^/]+\/finance\/budget-amendments\/[^/]+\/validate$/.test(chemin)) {
    // L'avenant en brouillon du jeu d'essai (`avenant-riche-02`) : c'est
    // celui qu'un geste de validation, dans l'atelier, ferait réellement
    // passer d'un état à l'autre.
    return {
      success: true,
      data: { ...AVENANTS_RICHE[1], status: 'VALIDATED' as const, validatedAt: new Date().toISOString() }
    };
  }

  // --- Bons de commande ---------------------------------------------------
  const bonDetailMatch = /\/tenants\/[^/]+\/finance\/purchase-orders\/([^/]+)$/.exec(chemin);
  if (bonDetailMatch) {
    const bon = BONS.find(candidat => candidat.id === bonDetailMatch[1]) ?? BONS[0];
    return { success: true, data: bon };
  }

  if (/\/tenants\/[^/]+\/finance\/purchase-orders\/[^/]+\/issue$/.test(chemin)) {
    return { success: true, data: { ...BONS[2], status: 'ISSUED' as const } };
  }

  if (/\/tenants\/[^/]+\/finance\/purchase-orders\/[^/]+\/cancel$/.test(chemin)) {
    return { success: true, data: { ...BONS[1], status: 'CANCELLED' as const } };
  }

  // Liste ET création partagent leur chemin (voir l'en-tête) : la fausse API
  // rend la liste dans tous les cas, la création n'est démontrée que par les
  // tests unitaires du composant.
  if (/\/tenants\/[^/]+\/finance\/purchase-orders$/.test(chemin)) {
    return { success: true, data: scenario === 'vide' ? [] : BONS };
  }

  // --- Engagé --------------------------------------------------------------
  const engagementMatch = /\/tenants\/[^/]+\/finance\/sites\/([^/]+)\/engagement$/.exec(chemin);
  if (engagementMatch) {
    const siteId = engagementMatch[1];
    const engagement = ENGAGEMENTS[siteId] ?? ENGAGEMENTS[SITE_RICHE];
    return { success: true, data: engagement };
  }

  // --- Alertes de dépassement ----------------------------------------------
  if (/\/tenants\/[^/]+\/finance\/budget-alerts\/[^/]+\/acknowledge$/.test(chemin)) {
    return { success: true, data: { ...ALERTE_RICHE, acknowledgedAt: new Date().toISOString() } };
  }

  if (/\/tenants\/[^/]+\/finance\/budget-alerts$/.test(chemin)) {
    return { success: true, data: scenario === 'vide' ? [] : ALERTES };
  }

  return null;
}
