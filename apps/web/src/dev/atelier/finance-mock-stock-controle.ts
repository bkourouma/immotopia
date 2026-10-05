/**
 * Atelier — fausse API du lot 040 : contexte terrain, carnet des preneurs,
 * alertes, indicateurs et réglages de contrôle du stock.
 *
 * Même modèle que les autres bancs du stock : il renvoie `null` quand l'URL ne
 * le concerne pas, et `mock-api.ts` passe alors au gestionnaire suivant.
 *
 * Câblé dans `mock-api.ts`, dans la liste `for (const repondre of [...])`,
 * APRÈS les quatre bancs du lot 5.
 *
 * Les identifiants d'articles et de lieux sont ceux de
 * `finance-mock-stock-referentiel.ts` : quel que soit l'ordre d'inscription,
 * l'écran reste cohérent.
 *
 * Scénarios :
 *
 * - `nominal` : un responsable du stock (alertes, valeurs, réglages, carnet) ;
 * - `partiel` : un **magasinier sans valeurs** — ni alertes, ni valeurs, ni
 *   réglages, montants des alertes masqués ; il tient le carnet des preneurs
 *   (STOCK_TAKERS_MANAGE fait partie de son rôle) ;
 * - `vide` : aucun preneur, aucune alerte, aucun indicateur.
 *
 * `mock-api.ts` route par le seul chemin, jamais par la méthode : un POST sur
 * `stock/takers` rend la liste, un PATCH sur `stock/takers/:id` rend le
 * preneur tel quel. Les écritures sont couvertes par les tests d'écran.
 */

import type {
  StockAlertView,
  StockControlsSettings,
  StockFieldContext,
  StockIndicatorRow,
  StockIndicatorsView,
  StockMeta,
  StockTakerView
} from '../../types/finance-stock-controle-types';
import type { Scenario } from './mock-api';

const AGENCE = 'agence-1';
const MAGASIN = 'lieu-magasin-01';
const DEPOT_RIVIERA = 'lieu-riviera-02';
const CHANTIER_RIVIERA = 'chantier-riviera';

// ---------------------------------------------------------------------------
// Le carnet des preneurs
// ---------------------------------------------------------------------------

const PRENEURS: StockTakerView[] = [
  {
    id: 'preneur-kone-01',
    label: 'Koné Ibrahim — Équipe maçonnerie',
    fullName: 'Koné Ibrahim',
    teamOrCompany: 'Équipe maçonnerie',
    phone: '+225 07 00 00 00 01',
    employeeId: null,
    contractorId: 'tacheron-kone',
    linkedPersonLabel: 'Koné Ibrahim (tâcheron)',
    isActive: true,
    createdAt: '2026-09-02T08:00:00.000Z'
  },
  {
    id: 'preneur-yao-02',
    label: 'Yao Serge — Électricité Yao & Fils',
    fullName: 'Yao Serge',
    teamOrCompany: 'Électricité Yao & Fils',
    phone: null,
    employeeId: null,
    contractorId: null,
    linkedPersonLabel: null,
    isActive: true,
    createdAt: '2026-09-10T08:00:00.000Z'
  },
  {
    // Désactivé : il ne se propose plus, ses sorties passées restent à son nom.
    id: 'preneur-diallo-03',
    label: 'Diallo Aminata — Équipe carrelage',
    fullName: 'Diallo Aminata',
    teamOrCompany: 'Équipe carrelage',
    phone: '+225 05 00 00 00 03',
    employeeId: 'employe-diallo',
    contractorId: null,
    linkedPersonLabel: 'Diallo Aminata (employée)',
    isActive: false,
    createdAt: '2026-08-15T08:00:00.000Z'
  }
];

// ---------------------------------------------------------------------------
// Le contexte terrain
// ---------------------------------------------------------------------------

function contexte(scenario: Scenario): StockFieldContext {
  const magasinier = scenario === 'partiel';
  return {
    locations: [
      {
        id: MAGASIN,
        tenantId: AGENCE,
        kind: 'WAREHOUSE',
        label: "Magasin central d'Angré",
        siteId: null,
        siteLabel: null,
        isActive: true,
        countInProgress: null,
        siteClosed: false,
        openingCountSuggested: false,
        toRecount: []
      },
      {
        id: DEPOT_RIVIERA,
        tenantId: AGENCE,
        kind: 'SITE',
        label: 'Dépôt de la Villa Riviera',
        siteId: CHANTIER_RIVIERA,
        siteLabel: 'Villa de la Riviera',
        isActive: true,
        countInProgress: null,
        siteClosed: false,
        openingCountSuggested: false,
        toRecount: []
      }
    ],
    sites: [
      {
        id: CHANTIER_RIVIERA,
        name: 'Villa de la Riviera',
        status: 'IN_PROGRESS',
        closed: false,
        stockEnabled: true,
        locationId: DEPOT_RIVIERA
      }
    ],
    costCategories: [
      { id: 'poste-gros-oeuvre', label: 'Gros œuvre' },
      { id: 'poste-couverture', label: 'Couverture' },
      { id: 'poste-electricite', label: 'Électricité' }
    ],
    items: [
      {
        id: 'article-ciment-01',
        reference: 'CIM-42',
        label: 'Ciment CPJ 42,5',
        unit: 'sac',
        category: 'Gros œuvre',
        defaultCostCategoryId: 'poste-gros-oeuvre'
      }
    ],
    takers: scenario === 'vide' ? [] : PRENEURS.filter(preneur => preneur.isActive),
    receivableInvoices: [],
    reasonCodes: {
      count: [
        'BREAKAGE',
        'DETERIORATION',
        'COUNTING_ERROR',
        'ENTRY_ERROR',
        'UNIT_CONFUSION',
        'UNRECORDED_ISSUE',
        'UNRECORDED_RECEIPT',
        'UNEXPLAINED_DISAPPEARANCE',
        'OTHER'
      ],
      scrap: ['BREAKAGE', 'DETERIORATION', 'OTHER'],
      supplierReturn: ['NON_CONFORMING', 'DAMAGED_ON_DELIVERY', 'EXCESS_DELIVERY', 'OTHER'],
      transfer: ['SITE_SUPPLY', 'RETURN_TO_WAREHOUSE', 'SITE_EVACUATION', 'REBALANCING', 'OTHER']
    },
    settings: { requireTaker: false, backdatingLimitDays: 7 },
    abilities: {
      canReceive: true,
      canIssue: true,
      canTransfer: true,
      canCount: true,
      canValidateCount: !magasinier,
      canDispose: !magasinier,
      canManageTakers: true,
      valuesVisible: !magasinier,
      canViewAlerts: !magasinier,
      canManageSettings: !magasinier
    },
    people: [
      { kind: 'CONTRACTOR', id: 'tacheron-kone', fullName: 'Koné Ibrahim' },
      { kind: 'EMPLOYEE', id: 'employe-diallo', fullName: 'Diallo Aminata' }
    ]
  };
}

function meta(scenario: Scenario, nextCursor: string | null = null): StockMeta {
  return { valuesVisible: scenario !== 'partiel', blindLocationIds: [], nextCursor };
}

// ---------------------------------------------------------------------------
// Les alertes
// ---------------------------------------------------------------------------

const ALERTES: StockAlertView[] = [
  {
    id: 'alerte-ecart-01',
    kind: 'COUNT_VARIANCE',
    severity: 'WARNING',
    status: 'OPEN',
    title: 'Écart d’inventaire au-dessus du seuil',
    message: 'L’inventaire du Dépôt de la Villa Riviera du 28/09/2026 présente un écart de 184 000 FCFA (6,1 %).',
    amount: 184000,
    threshold: 100000,
    currency: 'FCFA',
    site: { id: CHANTIER_RIVIERA, name: 'Villa de la Riviera' },
    location: { id: DEPOT_RIVIERA, label: 'Dépôt de la Villa Riviera' },
    subjectType: 'StockCount',
    subjectId: 'inventaire-riviera-01',
    subjectLabel: 'Inventaire du 28/09/2026',
    mode: 'SINGLE',
    raisedAt: '2026-09-28T16:12:00.000Z',
    acknowledgedAt: null,
    acknowledgedByLabel: null,
    acknowledgeNote: null
  },
  {
    id: 'alerte-sortie-02',
    kind: 'LARGE_ISSUE',
    severity: 'WARNING',
    status: 'OPEN',
    title: 'Sortie importante',
    message: 'Le bon de sortie BS-2026-00057 atteint 640 000 FCFA.',
    amount: 640000,
    threshold: 500000,
    currency: 'FCFA',
    site: { id: CHANTIER_RIVIERA, name: 'Villa de la Riviera' },
    location: { id: MAGASIN, label: "Magasin central d'Angré" },
    subjectType: 'StockSlip',
    subjectId: 'bon-sortie-57',
    subjectLabel: 'BS-2026-00057',
    mode: 'SINGLE',
    raisedAt: '2026-10-01T09:40:00.000Z',
    acknowledgedAt: null,
    acknowledgedByLabel: null,
    acknowledgeNote: null
  },
  {
    id: 'alerte-caisse-03',
    kind: 'CASH_MATERIAL_PURCHASE',
    severity: 'INFO',
    status: 'OPEN',
    title: 'Achat de matériaux en espèces',
    message: 'Les achats de matériaux en espèces du mois sur la Villa de la Riviera atteignent 132 000 FCFA.',
    amount: 132000,
    threshold: 100000,
    currency: 'FCFA',
    site: { id: CHANTIER_RIVIERA, name: 'Villa de la Riviera' },
    location: null,
    subjectType: 'CashVoucher',
    subjectId: 'piece-caisse-12',
    subjectLabel: 'Pièce de caisse PC-2026-0012',
    mode: 'MONTHLY_CUMUL',
    raisedAt: '2026-10-02T11:05:00.000Z',
    acknowledgedAt: null,
    acknowledgedByLabel: null,
    acknowledgeNote: null
  },
  {
    id: 'alerte-validation-04',
    kind: 'COUNT_SELF_VALIDATED',
    severity: 'INFO',
    status: 'ACKNOWLEDGED',
    title: 'Inventaire validé par son compteur',
    message: 'L’inventaire du Magasin central du 15/09/2026 a été validé sans second regard, avec un motif.',
    amount: null,
    threshold: null,
    currency: 'FCFA',
    site: null,
    location: { id: MAGASIN, label: "Magasin central d'Angré" },
    subjectType: 'StockCount',
    subjectId: 'inventaire-magasin-02',
    subjectLabel: 'Inventaire du 15/09/2026',
    mode: 'SINGLE',
    raisedAt: '2026-09-15T18:00:00.000Z',
    acknowledgedAt: '2026-09-16T08:30:00.000Z',
    acknowledgedByLabel: 'Awa Traoré',
    acknowledgeNote: 'Seule personne présente ce jour-là ; recompté le lendemain.'
  }
];

function alertesMasquees(scenario: Scenario): StockAlertView[] {
  if (scenario !== 'partiel') return ALERTES;
  return ALERTES.map(alerte => ({ ...alerte, amount: null, threshold: null }));
}

// ---------------------------------------------------------------------------
// Les indicateurs
// ---------------------------------------------------------------------------

function ligne(month: string, over: Partial<StockIndicatorRow> = {}): StockIndicatorRow {
  return {
    month,
    countsValidated: 2,
    countsWithoutFrozenValues: 0,
    countedValue: 3_400_000,
    varianceValueGross: 142_000,
    setAsideVarianceValue: 0,
    varianceRate: 0.0418,
    uncountedLines: 1,
    blindLineShare: 0.92,
    issuesCount: 18,
    issuesWithTaker: 15,
    takerShare: 0.833,
    countsValidatedByOther: 2,
    otherValidatorShare: 1,
    scrapValue: 36_000,
    scrapShare: 0.011,
    movementsCount: 64,
    averageEntryLagDays: 0.6,
    sameDayShare: 0.78,
    ...over
  };
}

const INDICATEURS: StockIndicatorsView = {
  from: '2026-05',
  to: '2026-10',
  totals: [
    ligne('2026-05', {
      countsWithoutFrozenValues: 1,
      varianceRate: null,
      countsValidated: 0,
      countsValidatedByOther: 0
    }),
    ligne('2026-06'),
    ligne('2026-07', { varianceRate: 0.071, setAsideVarianceValue: 48_000 }),
    ligne('2026-08'),
    ligne('2026-09', { varianceRate: 0.061 }),
    ligne('2026-10', { varianceRate: null, countsValidated: 0, countsValidatedByOther: 0, otherValidatorShare: null })
  ],
  rows: [
    {
      ...ligne('2026-09', { varianceRate: 0.061 }),
      locationId: DEPOT_RIVIERA,
      locationLabel: 'Dépôt de la Villa Riviera'
    },
    {
      ...ligne('2026-09', { varianceRate: 0.012 }),
      locationId: MAGASIN,
      locationLabel: "Magasin central d'Angré"
    }
  ]
};

// ---------------------------------------------------------------------------
// Les réglages de contrôle
// ---------------------------------------------------------------------------

const REGLAGES: StockControlsSettings = {
  backdatingLimitDays: 7,
  requireTaker: false,
  issueAlertAmount: 500000,
  countVarianceAlertAmount: 100000,
  countVarianceAlertPercent: 5,
  cashMaterialAlertAmount: null,
  materialCostCategoryIds: [],
  effectiveMaterialCostCategoryIds: ['poste-gros-oeuvre', 'poste-couverture'],
  updatedAt: '2026-09-20T10:00:00.000Z',
  updatedByLabel: 'Awa Traoré'
};

// ---------------------------------------------------------------------------
// Le répondeur
// ---------------------------------------------------------------------------

export function repondreStockControle(chemin: string, scenario: Scenario): unknown | null {
  if (/\/tenants\/[^/]+\/finance\/stock\/field-context$/.test(chemin)) {
    return { success: true, data: contexte(scenario), meta: meta(scenario) };
  }

  if (/\/tenants\/[^/]+\/finance\/stock\/takers$/.test(chemin)) {
    return { success: true, data: scenario === 'vide' ? [] : PRENEURS };
  }
  const preneur = /\/tenants\/[^/]+\/finance\/stock\/takers\/([^/]+)$/.exec(chemin);
  if (preneur) {
    return { success: true, data: PRENEURS.find(candidat => candidat.id === preneur[1]) ?? PRENEURS[0] };
  }

  if (/\/tenants\/[^/]+\/finance\/stock\/alerts$/.test(chemin)) {
    return { success: true, data: scenario === 'vide' ? [] : alertesMasquees(scenario), meta: meta(scenario) };
  }
  const traitement = /\/tenants\/[^/]+\/finance\/stock\/alerts\/([^/]+)\/acknowledge$/.exec(chemin);
  if (traitement) {
    const alerte = ALERTES.find(candidat => candidat.id === traitement[1]) ?? ALERTES[0];
    return {
      success: true,
      data: {
        ...alerte,
        status: 'ACKNOWLEDGED',
        acknowledgedAt: new Date().toISOString(),
        acknowledgedByLabel: 'Atelier'
      }
    };
  }

  if (/\/tenants\/[^/]+\/finance\/stock\/indicators$/.test(chemin)) {
    return {
      success: true,
      data: scenario === 'vide' ? { ...INDICATEURS, totals: [], rows: [] } : INDICATEURS
    };
  }

  if (/\/tenants\/[^/]+\/finance\/stock\/settings\/controls$/.test(chemin)) {
    return { success: true, data: REGLAGES };
  }

  return null;
}
