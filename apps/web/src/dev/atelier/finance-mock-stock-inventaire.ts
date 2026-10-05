/**
 * Atelier — fausse API des transferts entre lieux et de l'inventaire physique
 * (lot 040, ecrans §7), aux formes du contrat 2.0.0 : `{ data, meta }`,
 * comptage à l'aveugle, lignes non comptées, justification calculée par le
 * serveur, validation à quatre yeux.
 *
 * Renvoie `null` quand l'URL ne le concerne pas ; `mock-api.ts` passe alors au
 * gestionnaire suivant. `mock-api.ts` route par le seul CHEMIN, jamais par la
 * méthode : `GET /stock/counts` (liste) et `POST /stock/counts` (ouverture)
 * retombent sur la même branche, qui rend la LISTE. Les écritures sont
 * couvertes par les tests d'écran, service réel et `apiClient` simulé.
 *
 * **Le contexte terrain (`GET /stock/field-context`) n'est pas servi ici** (banc `finance-mock-stock-controle.ts`) :
 * ses lieux, articles, motifs et droits appartiennent au banc du contrôle.
 *
 * ---------------------------------------------------------------------------
 * Les cas montrés
 * ---------------------------------------------------------------------------
 *
 * - **Un comptage en cours (`DRAFT`)** sur le magasin central : attendu et
 *   écart à `null` pour tous (aveugle), deux compteurs.
 * - **Un comptage clos (`COUNTED`)** sur le dépôt de la Riviera, « Inventaire
 *   clos à justifier » : un écart à justifier, un écart justifié, une ligne
 *   d'avant le lot à motif libre, une ligne non comptée, une ligne sans écart.
 *   Les écarts sont volontairement incohérents avec la soustraction : un écran
 *   qui recalculerait tomberait ici.
 * - **Un inventaire validé** avec son procès-verbal, et **un abandonné**.
 * - **Un transfert** du magasin vers le dépôt : deux mouvements `TRANSFER`, la
 *   sortie d'abord, et **aucun chantier imputé**.
 */

import type { StockCount, StockCountLine, StockTransfer } from '../../types/finance-stock-inventaire-types';
import type { StockBalanceView, StockMeta, StockMovementView } from '../../types/finance-stock-controle-types';
import type { Scenario } from './mock-api';

const DEVISE = 'XOF';
const AGENCE = 'agence-1';

const CIMENT = 'article-ciment-01';
const FER = 'article-fer-02';
const SABLE = 'article-sable-03';
const TOLE = 'article-tole-04';

const MAGASIN = 'lieu-magasin-01';
const DEPOT_RIVIERA = 'lieu-riviera-02';

const META: StockMeta = { valuesVisible: true, blindLocationIds: [MAGASIN] };

const ARTICLES: Record<string, { reference: string; label: string; unit: string }> = {
  [CIMENT]: { reference: 'CIM-42', label: 'Ciment CPJ 42,5', unit: 'sac' },
  [FER]: { reference: 'FER-12', label: 'Fer à béton HA 12', unit: 'barre' },
  [SABLE]: { reference: 'SAB-00', label: 'Sable lavé', unit: 'm³' },
  [TOLE]: { reference: 'TOL-BA', label: 'Tôle bac alu 6 m', unit: 'tôle' }
};

function ligne(id: string, itemId: string, partiel: Partial<StockCountLine> = {}): StockCountLine {
  const article = ARTICLES[itemId];
  return {
    id,
    itemId,
    itemReference: article.reference,
    itemLabel: article.label,
    itemUnit: article.unit,
    countedQuantity: 0,
    notCounted: false,
    countedBlind: true,
    countedByUserId: 'user-magasinier',
    countedByLabel: 'Awa Traoré',
    countedAtServer: '2026-09-18T08:40:00.000Z',
    expectedQuantity: null,
    variance: null,
    varianceValue: null,
    unitCostAtValidation: null,
    reasonCode: null,
    reason: null,
    justified: false,
    justifiedByLabel: null,
    justifiedAt: null,
    setAside: null,
    movementsSinceCapture: null,
    attachmentsCount: 0,
    ...partiel
  };
}

function comptage(partiel: Partial<StockCount> & Pick<StockCount, 'id' | 'status' | 'lines'>): StockCount {
  return {
    tenantId: AGENCE,
    locationId: MAGASIN,
    locationLabel: "Magasin central d'Angré",
    kind: 'REGULAR',
    blind: false,
    countedAt: '2026-09-18T00:00:00.000Z',
    createdByUserId: 'user-magasinier',
    createdByLabel: 'Awa Traoré',
    closedAt: null,
    closedByLabel: null,
    validatedAt: null,
    validatedByLabel: null,
    cancelledAt: null,
    cancelReason: null,
    selfValidated: false,
    selfValidationReason: null,
    counters: [{ userId: 'user-magasinier', label: 'Awa Traoré' }],
    linesCount: partiel.lines.filter(l => !l.notCounted).length,
    uncountedLinesCount: partiel.lines.filter(l => l.notCounted).length,
    varianceCount: null,
    countedValue: null,
    varianceValueGross: null,
    varianceValueNet: null,
    setAsideVarianceValue: null,
    currency: DEVISE,
    slip: null,
    validation: null,
    toRecount: [],
    ...partiel
  };
}

// --- En cours (DRAFT) : à l'aveugle, pour tous -------------------------------

const EN_COURS = comptage({
  id: 'comptage-en-cours-01',
  status: 'DRAFT',
  blind: true,
  counters: [
    { userId: 'user-magasinier', label: 'Awa Traoré' },
    { userId: 'user-aide', label: 'Moussa Koné' }
  ],
  lines: [
    ligne('l-encours-ciment', CIMENT, { countedQuantity: 418 }),
    ligne('l-encours-sable', SABLE, {
      countedQuantity: 12.25,
      countedByUserId: 'user-aide',
      countedByLabel: 'Moussa Koné',
      countedAtServer: '2026-09-18T09:05:00.000Z'
    })
  ]
});

// --- Clos (COUNTED) : « Inventaire clos à justifier » ------------------------

const CLOS = comptage({
  id: 'comptage-clos-03',
  status: 'COUNTED',
  locationId: DEPOT_RIVIERA,
  locationLabel: 'Dépôt de la Villa Riviera',
  countedAt: '2026-09-25T00:00:00.000Z',
  closedAt: '2026-09-25T16:10:00.000Z',
  closedByLabel: 'Awa Traoré',
  varianceCount: 3,
  varianceValueNet: -612_500,
  validation: { callerIsCounter: false, selfValidationAllowed: false },
  lines: [
    // Écart à justifier : −7 annoncé par le serveur (188 − 200 ferait −12).
    ligne('l-clos-fer', FER, {
      expectedQuantity: 200,
      countedQuantity: 188,
      variance: -7,
      varianceValue: -490_000
    }),
    // Écart justifié par un motif de la liste.
    ligne('l-clos-ciment', CIMENT, {
      expectedQuantity: 80,
      countedQuantity: 75,
      variance: -5,
      varianceValue: -400_000,
      reasonCode: 'BREAKAGE',
      reason: 'Cinq sacs éventrés au déchargement.',
      justified: true,
      justifiedByLabel: 'Awa Traoré',
      justifiedAt: '2026-09-25T16:30:00.000Z',
      attachmentsCount: 1
    }),
    // Ligne d'avant le lot : motif libre, qui vaut justification.
    ligne('l-clos-tole', TOLE, {
      expectedQuantity: 57,
      countedQuantity: 60,
      variance: 3,
      varianceValue: 277_500,
      reason: 'Trois tôles retrouvées derrière la réserve.',
      justified: true
    }),
    // Non comptée à la clôture : à écarter par une personne habilitée.
    ligne('l-clos-sable', SABLE, {
      countedQuantity: null,
      notCounted: true,
      countedBlind: null,
      countedByUserId: null,
      countedByLabel: null,
      countedAtServer: null,
      expectedQuantity: 4.5
    })
  ]
});

// --- Validé ------------------------------------------------------------------

const VALIDE = comptage({
  id: 'comptage-valide-04',
  status: 'VALIDATED',
  locationId: DEPOT_RIVIERA,
  locationLabel: 'Dépôt de la Villa Riviera',
  countedAt: '2026-08-31T00:00:00.000Z',
  closedAt: '2026-08-31T17:00:00.000Z',
  closedByLabel: 'Awa Traoré',
  validatedAt: '2026-09-01T09:15:00.000Z',
  validatedByLabel: 'Ibrahima Kouadio',
  varianceCount: 1,
  countedValue: 6_000_000,
  varianceValueGross: 400_000,
  varianceValueNet: -400_000,
  setAsideVarianceValue: 0,
  slip: {
    id: 'bon-pvi-01',
    kind: 'COUNT_REPORT',
    number: 'PVI-2026-00007',
    documentDate: '2026-09-01T00:00:00.000Z',
    createdAt: '2026-09-01T09:15:00.000Z'
  },
  lines: [
    ligne('l-valide-ciment', CIMENT, {
      expectedQuantity: 80,
      countedQuantity: 75,
      variance: -5,
      varianceValue: -400_000,
      unitCostAtValidation: 80_000,
      reasonCode: 'BREAKAGE',
      justified: true,
      justifiedByLabel: 'Awa Traoré',
      justifiedAt: '2026-08-31T17:10:00.000Z',
      movementsSinceCapture: 2
    }),
    ligne('l-valide-fer', FER, {
      expectedQuantity: 40,
      countedQuantity: 40,
      variance: 0,
      varianceValue: 0,
      countedBlind: false,
      countedByLabel: 'Ibrahima Kouadio',
      movementsSinceCapture: 0
    })
  ]
});

// --- Abandonné ---------------------------------------------------------------

const ABANDONNE = comptage({
  id: 'comptage-abandonne-05',
  status: 'CANCELLED',
  blind: true,
  countedAt: '2026-09-10T00:00:00.000Z',
  cancelledAt: '2026-09-10T11:00:00.000Z',
  cancelReason: 'Comptage commencé sur le mauvais lieu.',
  lines: [ligne('l-abandon-ciment', CIMENT, { countedQuantity: 30 })]
});

const COMPTAGES: StockCount[] = [EN_COURS, CLOS, VALIDE, ABANDONNE];

/** La liste rend les inventaires sans leurs lignes (`withLines` jamais envoyé). */
function sansLignes(source: StockCount): StockCount {
  return { ...source, lines: [] };
}

// --- Soldes (le lieu en comptage est masqué) ---------------------------------

function solde(itemId: string, locationId: string, quantity: number | null, value: number | null): StockBalanceView {
  const article = ARTICLES[itemId];
  return {
    itemId,
    itemReference: article.reference,
    itemLabel: article.label,
    itemUnit: article.unit,
    locationId,
    locationLabel: locationId === MAGASIN ? "Magasin central d'Angré" : 'Dépôt de la Villa Riviera',
    quantity,
    value,
    averageUnitCost: quantity === null ? null : value !== null && quantity ? value / quantity : null,
    currency: DEVISE
  };
}

const SOLDES: StockBalanceView[] = [
  // Magasin central en comptage : quantités masquées (aveugle).
  solde(CIMENT, MAGASIN, null, null),
  solde(SABLE, MAGASIN, null, null),
  solde(CIMENT, DEPOT_RIVIERA, 75, 6_000_000),
  solde(TOLE, DEPOT_RIVIERA, 60, 7_200_000)
];

// --- Le transfert ------------------------------------------------------------

function moitie(id: string, locationId: string, isDecrease: boolean, quantityAfter: number | null): StockMovementView {
  const article = ARTICLES[CIMENT];
  return {
    id,
    type: 'TRANSFER',
    itemId: CIMENT,
    itemReference: article.reference,
    itemLabel: article.label,
    itemUnit: article.unit,
    locationId,
    locationLabel: locationId === MAGASIN ? "Magasin central d'Angré" : 'Dépôt de la Villa Riviera',
    movementDate: '2026-09-19T00:00:00.000Z',
    quantity: 50,
    isDecrease,
    unitCost: 80_000,
    totalValue: 4_000_000,
    currency: DEVISE,
    quantityAfter,
    valueAfter: quantityAfter === null ? null : quantityAfter * 80_000,
    siteId: null,
    siteLabel: null,
    costCategoryLabel: null,
    requestedBy: 'Koné Ibrahim — Équipe maçonnerie',
    takerId: 'preneur-01',
    takerLabel: 'Koné Ibrahim — Équipe maçonnerie',
    supplierInvoiceId: null,
    supplierInvoiceReference: null,
    transferGroupId: 'transfert-01',
    stockCountId: null,
    slipId: null,
    slipNumber: null,
    reasonCode: 'SITE_SUPPLY',
    reason: null,
    valuationSource: null,
    supplierCreditValue: null,
    createdByUserId: 'user-magasinier',
    createdByLabel: 'Awa Traoré',
    createdAt: '2026-09-19T10:42:00.000Z',
    entryLagDays: 0,
    attachmentsCount: 0
  };
}

const TRANSFERT: StockTransfer = {
  transferGroupId: 'transfert-01',
  movements: [
    moitie('mouvement-sortie-01', DEPOT_RIVIERA, true, 25),
    moitie('mouvement-entree-01', MAGASIN, false, null)
  ],
  fromLocationLabel: 'Dépôt de la Villa Riviera',
  toLocationLabel: "Magasin central d'Angré",
  quantity: 50,
  // La valeur DÉPLACÉE, pas une dépense.
  value: 4_000_000,
  currency: DEVISE
};

// ---------------------------------------------------------------------------

const BASE = String.raw`\/tenants\/[^/]+\/finance\/stock`;

function trouver(id: string): StockCount {
  return COMPTAGES.find(candidat => candidat.id === id) ?? EN_COURS;
}

export function repondreStockInventaire(chemin: string, scenario: Scenario): unknown | null {
  if (new RegExp(`${BASE}/transfers$`).test(chemin)) {
    return { success: true, data: TRANSFERT, meta: META };
  }

  // Écritures sur un inventaire : AVANT le détail paramétré.
  const ecriture = new RegExp(`${BASE}/counts/([^/]+)/(validate|close|cancel|set-aside-uncounted)$`).exec(chemin);
  if (ecriture) {
    const source = trouver(ecriture[1]);
    const statut =
      ecriture[2] === 'validate'
        ? 'VALIDATED'
        : ecriture[2] === 'close'
          ? 'COUNTED'
          : ecriture[2] === 'cancel'
            ? 'CANCELLED'
            : source.status;
    return { success: true, data: { ...source, status: statut } };
  }

  // Saisie, retrait, justification, mise à l'écart d'une ligne.
  const ligneDe = new RegExp(`${BASE}/counts/([^/]+)/lines(?:/([^/]+))?(?:/(justification|set-aside))?$`).exec(chemin);
  if (ligneDe) {
    const source = trouver(ligneDe[1]);
    if (ligneDe[3] === 'set-aside' || (ligneDe[2] && !ligneDe[3])) {
      return { success: true, data: source };
    }
    const visee = source.lines.find(candidate => candidate.itemId === ligneDe[2]) ?? source.lines[0];
    return { success: true, data: visee };
  }

  if (new RegExp(`${BASE}/counts$`).test(chemin)) {
    return { success: true, data: scenario === 'vide' ? [] : COMPTAGES.map(sansLignes), meta: META };
  }

  const detail = new RegExp(`${BASE}/counts/([^/]+)$`).exec(chemin);
  if (detail) {
    return { success: true, data: trouver(detail[1]) };
  }

  if (new RegExp(`${BASE}/balances$`).test(chemin)) {
    return { success: true, data: scenario === 'vide' ? [] : SOLDES, meta: META };
  }

  return null;
}
