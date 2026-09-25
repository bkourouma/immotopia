/**
 * Catalogue des offres par packs — definitions PURES (aucun acces base).
 *
 * `DEFAULT_CATALOG` recopie exactement la grille du site
 * (ImmoTopiaWebsite2Version2/site/src/lib/pricing.ts, 23/09/2026). C'est la
 * source du seed `prisma/seeds/catalog-seed.ts` et de l'amorcage SQL de la
 * migration 20260928090000_abonnements_packs. En base, le catalogue est
 * ensuite editable par le super-admin (D12) : le code metier lit la BASE,
 * jamais cette constante (sauf les tests et le seed).
 *
 * Voir docs/architecture/PLAN-ABONNEMENTS.md.
 */

export type ModuleKeyCode = 'MODULE_AGENCY' | 'MODULE_SYNDIC' | 'MODULE_PROMOTER';
export type CapacityKeyCode = 'LOTS' | 'COPROPRIETES' | 'CHANTIERS';
export type CatalogItemKindCode = 'PACK' | 'EXTENSION' | 'SETUP';

export const MODULE_KEYS: readonly ModuleKeyCode[] = ['MODULE_AGENCY', 'MODULE_SYNDIC', 'MODULE_PROMOTER'];
export const CAPACITY_KEYS: readonly CapacityKeyCode[] = ['LOTS', 'COPROPRIETES', 'CHANTIERS'];

/** Codes stables des packs et extensions (les lignes SETUP suivent `SETUP_<PACK>`). */
export const PACK = {
  AGENCE: 'AGENCE',
  SYNDIC: 'SYNDIC',
  PROMOTEUR: 'PROMOTEUR',
  INTEGRE: 'INTEGRE'
} as const;

export const EXTENSION = {
  LOTS_10: 'EXT_LOTS_10',
  COPRO: 'EXT_COPRO',
  CHANTIER: 'EXT_CHANTIER'
} as const;

/** L'annuel paye d'avance = 11 mensualites (12 mois pour 11). */
export const ANNUAL_MONTHS = 11;
/** Essai : premier mois offert (D8). */
export const TRIAL_DAYS = 30;
/** Jours de grace apres PAST_DUE avant la lecture seule (D8). */
export const DEFAULT_GRACE_DAYS = 7;
/** Remise de combinaison, en %, sur le prix de base du pack le moins cher (D6). */
export const DEFAULT_COMBO_DISCOUNT_PERCENT = 10;
/** TVA appliquee aux factures de la plateforme (D9). */
export const PLATFORM_TAX_RATE_PERCENT = 18;
/** Emetteur des factures de la plateforme (D9). */
export const PLATFORM_INVOICE_ISSUER = { name: 'Alliance Consultants' } as const;
/** Duree de la derogation « Reprise » accordee aux agences deja en depassement (D13). */
export const REPRISE_OVERRIDE_MONTHS = 3;

/**
 * Regles d'un element du catalogue (colonne JSON `catalog_items.rules`).
 *
 * Ordre d'evaluation du prix d'une unite : `lotTiers` (premier palier dont la
 * composition de packs correspond EXACTEMENT et dont le rang est atteint), puis
 * `byHeldPacks` (premiere regle dont un pack est detenu), puis le prix de base.
 */
export interface CatalogRules {
  /** Prix mensuel d'une unite selon les packs detenus. */
  byHeldPacks?: Array<{ anyOf: string[]; monthlyPrice: number }>;
  /**
   * Palier selon le rang du premier lot couvert par l'unite, pour une
   * composition de packs exacte. Calque de `agencePrice` du site : l'Agence
   * seule paie 75 FCFA le lot au-dela du 300e.
   */
  lotTiers?: Array<{ onlyPacks: string[]; fromLot: number; monthlyPrice: number }>;
  /** L'extension ne se vend qu'avec au moins un de ces packs. */
  requiresAnyOf?: string[];
}

export interface CatalogItemDef {
  code: string;
  kind: CatalogItemKindCode;
  name: string;
  description: string | null;
  /** Prix mensuel HT d'UNE unite, en FCFA. */
  monthlyPrice: number;
  /** Frais uniques HT, en FCFA (packs : valeur de reference ; SETUP : prix facture). */
  setupPrice: number;
  modules: ModuleKeyCode[];
  exclusiveGroup: string | null;
  rules: CatalogRules | null;
  isSellable: boolean;
  sortOrder: number;
  /** Capacite apportee par UNE unite. */
  capacities: Partial<Record<CapacityKeyCode, number>>;
}

export const DEFAULT_CATALOG: readonly CatalogItemDef[] = [
  {
    code: PACK.AGENCE,
    kind: 'PACK',
    name: 'Agence',
    description: 'Transaction et gestion locative — 100 logements sous mandat de gestion',
    monthlyPrice: 29_900,
    setupPrice: 100_000,
    modules: ['MODULE_AGENCY'],
    exclusiveGroup: null,
    rules: null,
    isSellable: true,
    sortOrder: 10,
    capacities: { LOTS: 100 }
  },
  {
    code: PACK.SYNDIC,
    kind: 'PACK',
    name: 'Syndic',
    description: 'Cabinets de copropriété — 2 copropriétés actives et 100 lots principaux',
    monthlyPrice: 49_900,
    setupPrice: 150_000,
    modules: ['MODULE_SYNDIC'],
    exclusiveGroup: null,
    rules: null,
    isSellable: true,
    sortOrder: 20,
    capacities: { COPROPRIETES: 2, LOTS: 100 }
  },
  {
    code: PACK.PROMOTEUR,
    kind: 'PACK',
    name: 'Promoteur',
    description: 'Promoteurs qui construisent et commercialisent — 2 chantiers actifs et 150 lots de programme',
    monthlyPrice: 149_900,
    setupPrice: 450_000,
    modules: ['MODULE_PROMOTER'],
    exclusiveGroup: null,
    rules: null,
    isSellable: true,
    sortOrder: 30,
    capacities: { CHANTIERS: 2, LOTS: 150 }
  },
  {
    code: PACK.INTEGRE,
    kind: 'PACK',
    name: 'Opérateur intégré',
    description: 'Groupes qui construisent, vendent, louent et gèrent — 3 chantiers, 3 copropriétés et 300 lots distincts',
    monthlyPrice: 249_900,
    setupPrice: 650_000,
    modules: ['MODULE_AGENCY', 'MODULE_SYNDIC', 'MODULE_PROMOTER'],
    exclusiveGroup: 'INTEGRE',
    rules: null,
    isSellable: true,
    sortOrder: 40,
    capacities: { CHANTIERS: 3, COPROPRIETES: 3, LOTS: 300 }
  },
  {
    code: EXTENSION.LOTS_10,
    kind: 'EXTENSION',
    name: 'Bloc de 10 lots',
    description: '150 FCFA le lot ; 100 FCFA avec Promoteur ou Intégré ; 75 FCFA pour l’Agence seule au-delà du 300e lot',
    monthlyPrice: 1_500,
    setupPrice: 0,
    modules: [],
    exclusiveGroup: null,
    rules: {
      lotTiers: [{ onlyPacks: [PACK.AGENCE], fromLot: 301, monthlyPrice: 750 }],
      byHeldPacks: [{ anyOf: [PACK.PROMOTEUR, PACK.INTEGRE], monthlyPrice: 1_000 }],
      requiresAnyOf: [PACK.AGENCE, PACK.SYNDIC, PACK.PROMOTEUR, PACK.INTEGRE]
    },
    isSellable: true,
    sortOrder: 110,
    capacities: { LOTS: 10 }
  },
  {
    code: EXTENSION.COPRO,
    kind: 'EXTENSION',
    name: 'Copropriété supplémentaire',
    description: '+1 copropriété active',
    monthlyPrice: 10_000,
    setupPrice: 0,
    modules: [],
    exclusiveGroup: null,
    rules: { requiresAnyOf: [PACK.SYNDIC, PACK.INTEGRE] },
    isSellable: true,
    sortOrder: 120,
    capacities: { COPROPRIETES: 1 }
  },
  {
    code: EXTENSION.CHANTIER,
    kind: 'EXTENSION',
    name: 'Chantier supplémentaire',
    description: '+1 chantier actif ; 35 000 FCFA avec l’Intégré',
    monthlyPrice: 40_000,
    setupPrice: 0,
    modules: [],
    exclusiveGroup: null,
    rules: {
      byHeldPacks: [{ anyOf: [PACK.INTEGRE], monthlyPrice: 35_000 }],
      requiresAnyOf: [PACK.PROMOTEUR, PACK.INTEGRE]
    },
    isSellable: true,
    sortOrder: 130,
    capacities: { CHANTIERS: 1 }
  },
  ...(
    [
      [PACK.AGENCE, 'Agence', 100_000, 210],
      [PACK.SYNDIC, 'Syndic', 150_000, 220],
      [PACK.PROMOTEUR, 'Promoteur', 450_000, 230],
      [PACK.INTEGRE, 'Opérateur intégré', 650_000, 240]
    ] as const
  ).map(
    ([pack, label, price, sortOrder]): CatalogItemDef => ({
      code: `SETUP_${pack}`,
      kind: 'SETUP',
      name: `Mise en route accompagnée — ${label}`,
      description: 'Frais uniques, facultatifs',
      monthlyPrice: 0,
      setupPrice: price,
      modules: [],
      exclusiveGroup: null,
      rules: { requiresAnyOf: [pack] },
      isSellable: true,
      sortOrder,
      capacities: {}
    })
  )
];

/**
 * Reprise et compatibilite : packs correspondant a un ensemble de modules
 * (ancien format de provisioning, agences existantes).
 * {AGENCY}->AGENCE, {SYNDIC}->SYNDIC, {PROMOTER}->PROMOTEUR, deux -> les deux
 * packs, trois -> INTEGRE, aucun -> AGENCE marque « a revoir ».
 */
export function packsForModules(modules: readonly string[]): { packs: string[]; toReview: boolean } {
  const set = new Set(modules);
  if (set.has('MODULE_AGENCY') && set.has('MODULE_SYNDIC') && set.has('MODULE_PROMOTER')) {
    return { packs: [PACK.INTEGRE], toReview: false };
  }
  const packs: string[] = [];
  if (set.has('MODULE_AGENCY')) packs.push(PACK.AGENCE);
  if (set.has('MODULE_SYNDIC')) packs.push(PACK.SYNDIC);
  if (set.has('MODULE_PROMOTER')) packs.push(PACK.PROMOTEUR);
  if (packs.length === 0) {
    return { packs: [PACK.AGENCE], toReview: true };
  }
  return { packs, toReview: false };
}

/** Lecture tolerante de la colonne JSON `rules` (null, objet partiel...). */
export function parseCatalogRules(value: unknown): CatalogRules | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as CatalogRules;
}
