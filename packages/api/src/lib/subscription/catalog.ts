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
 * Exception : les packs Patrimoine (Essentiel, Pro) et leur bloc de biens ne
 * viennent pas du site mais des decisions de Baba du 28/09 (lot P1) ; ils
 * sont amorces par la migration 20261001101600_patrimoine_pack_catalogue.
 * L'option Inventaire WhatsApp (lot 041, W-D6 du 04/10) est amorcee par la
 * migration 20261009090200_inventaire_whatsapp_catalogue.
 *
 * Voir docs/architecture/PLAN-ABONNEMENTS.md.
 */

export type ModuleKeyCode = 'MODULE_AGENCY' | 'MODULE_SYNDIC' | 'MODULE_PROMOTER' | 'MODULE_PATRIMOINE';
export type CapacityKeyCode = 'LOTS' | 'COPROPRIETES' | 'CHANTIERS' | 'BIENS_DETENUS' | 'ACTIFS' | 'PHOTOS_INVENTAIRE';
export type CatalogItemKindCode = 'PACK' | 'EXTENSION' | 'SETUP';

export const MODULE_KEYS: readonly ModuleKeyCode[] = [
  'MODULE_AGENCY',
  'MODULE_SYNDIC',
  'MODULE_PROMOTER',
  'MODULE_PATRIMOINE'
];
export const CAPACITY_KEYS: readonly CapacityKeyCode[] = [
  'LOTS',
  'COPROPRIETES',
  'CHANTIERS',
  'BIENS_DETENUS',
  'ACTIFS',
  /** Lot 041 (W11) : photos analysees dans le mois civil UTC (consommation, sans depassement facture). */
  'PHOTOS_INVENTAIRE'
];

/** Codes stables des packs et extensions (les lignes SETUP suivent `SETUP_<PACK>`). */
export const PACK = {
  AGENCE: 'AGENCE',
  SYNDIC: 'SYNDIC',
  PROMOTEUR: 'PROMOTEUR',
  INTEGRE: 'INTEGRE',
  /** Pack Patrimoine (lot P1, 28/09) : biens detenus en propre, sans mandat pour un tiers. */
  PATRIMOINE_ESSENTIEL: 'PATRIMOINE_ESSENTIEL',
  PATRIMOINE_PRO: 'PATRIMOINE_PRO',
  /** Packs de l'espace personnel (lot 4A) : palier gratuit et palier Plus, comptes en actifs (capacite ACTIFS). */
  PARTICULIER_GRATUIT: 'PARTICULIER_GRATUIT',
  PARTICULIER_PLUS: 'PARTICULIER_PLUS'
} as const;

export const EXTENSION = {
  LOTS_10: 'EXT_LOTS_10',
  COPRO: 'EXT_COPRO',
  CHANTIER: 'EXT_CHANTIER',
  BIENS_10: 'EXT_BIENS_10',
  /** Lot 041 (W-D6) : bloc de 500 photos analysees par mois, Promoteur et Integre. */
  INVENTAIRE_WHATSAPP: 'EXT_INVENTAIRE_WHATSAPP'
} as const;

/** Palier commun aux deux packs Patrimoine : Essentiel et Pro ne se cumulent pas (`rules.tierGroup`). */
export const PATRIMOINE_TIER_GROUP = 'PATRIMOINE';

/** Packs dont l'unite de comptage est le bien detenu (capacite BIENS_DETENUS). */
export const PATRIMOINE_PACKS: readonly string[] = [PACK.PATRIMOINE_ESSENTIEL, PACK.PATRIMOINE_PRO];

/** Palier commun aux deux packs Particulier : Gratuit et Plus ne se cumulent pas (`rules.tierGroup`). */
export const PARTICULIER_TIER_GROUP = 'PARTICULIER';

/** Packs de l'espace personnel (unite de comptage : l'actif, capacite ACTIFS). */
export const PARTICULIER_PACKS: readonly string[] = [PACK.PARTICULIER_GRATUIT, PACK.PARTICULIER_PLUS];

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
  /**
   * Palier d'une gamme (packs seulement) : deux packs portant le meme
   * `tierGroup` ne se cumulent pas (Patrimoine Essentiel / Pro) ; on passe de
   * l'un a l'autre par le changement de pack.
   */
  tierGroup?: string;
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
    description:
      'Groupes qui construisent, vendent, louent et gèrent — 3 chantiers, 3 copropriétés et 300 lots distincts',
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
    code: PACK.PATRIMOINE_ESSENTIEL,
    kind: 'PACK',
    name: 'Patrimoine Essentiel',
    description:
      'Particuliers et diaspora — 10 biens détenus en propre, loués ou non, gestion locative directe comprise, sans mandat pour un tiers',
    monthlyPrice: 9_900,
    setupPrice: 30_000,
    modules: ['MODULE_PATRIMOINE'],
    exclusiveGroup: null,
    rules: { tierGroup: PATRIMOINE_TIER_GROUP },
    isSellable: true,
    sortOrder: 50,
    capacities: { BIENS_DETENUS: 10 }
  },
  {
    code: PACK.PATRIMOINE_PRO,
    kind: 'PACK',
    name: 'Patrimoine Pro',
    description:
      'Entreprises et institutionnels — 100 biens détenus en propre, loués ou non, gestion locative directe comprise, sans mandat pour un tiers',
    monthlyPrice: 29_900,
    setupPrice: 90_000,
    modules: ['MODULE_PATRIMOINE'],
    exclusiveGroup: null,
    rules: { tierGroup: PATRIMOINE_TIER_GROUP },
    isSellable: true,
    sortOrder: 60,
    capacities: { BIENS_DETENUS: 100 }
  },
  {
    // PRIX ET PLAFOND PROVISOIRES (lot 4A, a valider par le produit) : ce sont
    // des valeurs de depart, modifiables dans le catalogue (`updateCatalogItem`,
    // ecran super-admin) SANS migration ; les abonnements en cours gardent leur
    // prix fige (SubscriptionItem). Gratuit : aucune facture periodique n'est
    // emise (voir `isFreeSubscription`, platform-invoice-service).
    code: PACK.PARTICULIER_GRATUIT,
    kind: 'PACK',
    name: 'Particulier Gratuit',
    description:
      'Espace personnel gratuit — jusqu’à 10 actifs de patrimoine (immobilier, placements, prêts…), gestion locative directe comprise',
    monthlyPrice: 0,
    setupPrice: 0,
    modules: ['MODULE_PATRIMOINE'],
    exclusiveGroup: null,
    rules: { tierGroup: PARTICULIER_TIER_GROUP },
    isSellable: true,
    sortOrder: 70,
    capacities: { ACTIFS: 10 }
  },
  {
    // PRIX ET PLAFOND PROVISOIRES : 2 900 FCFA HT/mois et 100 actifs, a valider
    // par le produit ; modifiables via `updateCatalogItem`, sans migration.
    code: PACK.PARTICULIER_PLUS,
    kind: 'PACK',
    name: 'Particulier Plus',
    description: 'Espace personnel payant — jusqu’à 100 actifs de patrimoine, gestion locative directe comprise',
    monthlyPrice: 2_900,
    setupPrice: 0,
    modules: ['MODULE_PATRIMOINE'],
    exclusiveGroup: null,
    rules: { tierGroup: PARTICULIER_TIER_GROUP },
    isSellable: true,
    sortOrder: 80,
    capacities: { ACTIFS: 100 }
  },
  {
    code: EXTENSION.LOTS_10,
    kind: 'EXTENSION',
    name: 'Bloc de 10 lots',
    description:
      '150 FCFA le lot ; 100 FCFA avec Promoteur ou Intégré ; 75 FCFA pour l’Agence seule au-delà du 300e lot',
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
  {
    // Vendu avec l'Essentiel seulement : au-dela de ~30 biens, le Pro est
    // moins cher. Le Pro ne vend pas de bloc ; son depassement est facture
    // au bien (regle `byHeldPacks`, 2 990 / 10 = 299 FCFA le bien). Au
    // passage d'Essentiel a Pro, les blocs partent avec l'Essentiel.
    code: EXTENSION.BIENS_10,
    kind: 'EXTENSION',
    name: 'Bloc de 10 biens détenus',
    description: '990 FCFA le bien avec Patrimoine Essentiel ; le dépassement du Pro est facturé 299 FCFA le bien',
    monthlyPrice: 9_900,
    setupPrice: 0,
    modules: [],
    exclusiveGroup: null,
    rules: {
      byHeldPacks: [{ anyOf: [PACK.PATRIMOINE_PRO], monthlyPrice: 2_990 }],
      requiresAnyOf: [PACK.PATRIMOINE_ESSENTIEL]
    },
    isSellable: true,
    sortOrder: 140,
    capacities: { BIENS_DETENUS: 10 }
  },
  {
    // Lot 041 (W-D6, W11-R1) : option Inventaire WhatsApp, cumulable (quantite
    // de l'element d'abonnement). Amorcee par la migration
    // 20261009090200_inventaire_whatsapp_catalogue. PHOTOS_INVENTAIRE est une
    // consommation du mois civil UTC, sans depassement facture.
    code: EXTENSION.INVENTAIRE_WHATSAPP,
    kind: 'EXTENSION',
    name: 'Inventaire WhatsApp — bloc de 500 photos',
    description: 'Comptage du stock de chantier par photo WhatsApp et IA : 500 photos analysées par mois',
    monthlyPrice: 25_000,
    setupPrice: 0,
    modules: [],
    exclusiveGroup: null,
    rules: { requiresAnyOf: [PACK.PROMOTEUR, PACK.INTEGRE] },
    isSellable: true,
    sortOrder: 150,
    capacities: { PHOTOS_INVENTAIRE: 500 }
  },
  ...(
    [
      [PACK.AGENCE, 'Agence', 100_000, 210],
      [PACK.SYNDIC, 'Syndic', 150_000, 220],
      [PACK.PROMOTEUR, 'Promoteur', 450_000, 230],
      [PACK.INTEGRE, 'Opérateur intégré', 650_000, 240],
      [PACK.PATRIMOINE_ESSENTIEL, 'Patrimoine Essentiel', 30_000, 250],
      [PACK.PATRIMOINE_PRO, 'Patrimoine Pro', 90_000, 260]
    ] as const
  ).map(([pack, label, price, sortOrder]): CatalogItemDef => ({
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
  }))
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
    // L'Integre ne se cumule avec aucun pack : Patrimoine eventuel ignore.
    return { packs: [PACK.INTEGRE], toReview: false };
  }
  const packs: string[] = [];
  if (set.has('MODULE_AGENCY')) packs.push(PACK.AGENCE);
  if (set.has('MODULE_SYNDIC')) packs.push(PACK.SYNDIC);
  if (set.has('MODULE_PROMOTER')) packs.push(PACK.PROMOTEUR);
  // Module Patrimoine seul demande : le palier d'entree (Essentiel).
  if (set.has('MODULE_PATRIMOINE')) packs.push(PACK.PATRIMOINE_ESSENTIEL);
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
