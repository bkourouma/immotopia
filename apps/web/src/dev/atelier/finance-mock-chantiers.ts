/**
 * Atelier — fausse API du volet « chantiers », lot 2.
 *
 * Ce fichier appartient en entier a l'agent qui construit ces ecrans : jeux
 * d'essai ET reponses. Les gestionnaires sont separes, un par volet, pour
 * qu'aucun agent n'ait a modifier le fichier d'un autre — la lecon du lot 1.
 *
 * Il renvoie `null` quand l'URL ne le concerne pas ; `mock-api.ts` passe alors
 * au gestionnaire suivant.
 *
 * **Quatre chantiers, chacun pour une raison précise.**
 *
 * - `chantier-riche-01` (« Villa duplex — Angré Centre ») porte une vingtaine
 *   d'imputations sur sept postes, venant à la fois de factures fournisseurs
 *   et de pièces de caisse — le jeu de données qui montre un détail complet.
 * - `chantier-sans-bien-01` (« Terrain loué — Riviera ») n'a aucun `propertyId` :
 *   c'est le cas exact de la cliente, un chantier sur un terrain loué qui
 *   n'avait nulle part où s'inscrire avant `ConstructionSite`.
 * - `chantier-cloture-01` porte un statut `CLOSED`, une date de clôture et un
 *   `finalCost` égal à son coût réel.
 * - `chantier-nouveau-01` vient de démarrer : statut `PLANNED`, aucune
 *   imputation, coût réel à zéro — l'état le plus facile à confondre avec une
 *   panne si l'écran n'est pas soigné.
 *
 * **Le coût réel n'est jamais écrit à la main ici non plus.** Chaque
 * `ConstructionSite.actualCost` et chaque `SiteDetail.byCostCategory` sont
 * calculés par `construireDetail()`, à partir des imputations — exactement ce
 * que fait le serveur en production (principe P-4). Une fausse API qui
 * saisirait ces totaux à la main pourrait diverger de ses propres imputations
 * sans qu'aucun test ne le remarque.
 *
 * **Limite assumée de l'atelier**, comme le documente déjà l'en-tête de
 * `finance-mock-campagne.ts` : `mock-api.ts` route les requêtes par leur seul
 * CHEMIN, jamais par leur méthode ni leur corps. `POST .../finance/sites`
 * (création d'un chantier) retombe donc sur la même branche que
 * `GET .../finance/sites` (liste) et reçoit un tableau au lieu du chantier créé
 * — l'atelier ne peut donc pas démontrer la création d'un chantier de bout en
 * bout ; seuls les tests unitaires du composant (`__tests__/finance/chantiers.test.tsx`)
 * le vérifient, avec le service mocké. La piece de caisse n'a pas ce problème :
 * `POST .../sites/:id/cash-vouchers` et `POST .../cash-vouchers/:id/validate`
 * sont des chemins qu'aucune requête GET ne partage, la fausse API peut donc y
 * répondre pour de bon et l'atelier peut démontrer l'émission, la validation et
 * l'impression sans réserve.
 */

import type {
  CashVoucher,
  ConstructionSite,
  CostCategory,
  SiteAllocationLine,
  SiteDetail
} from '../../types/finance-lot2-types';
import type { Scenario } from './mock-api';

/** Jeu par défaut de postes de dépense (US9, spec.md — « gros œuvre, toiture,
 * plomberie, électricité, main-d'œuvre, matériaux, divers »). */
export const POSTES: CostCategory[] = [
  { id: 'poste-gros-oeuvre', label: 'Gros œuvre', position: 1, isActive: true },
  { id: 'poste-toiture', label: 'Toiture', position: 2, isActive: true },
  { id: 'poste-plomberie', label: 'Plomberie', position: 3, isActive: true },
  { id: 'poste-electricite', label: 'Électricité', position: 4, isActive: true },
  { id: 'poste-main-oeuvre', label: "Main-d'œuvre", position: 5, isActive: true },
  { id: 'poste-materiaux', label: 'Matériaux', position: 6, isActive: true },
  { id: 'poste-divers', label: 'Divers', position: 7, isActive: true }
];

type ChantierBase = Omit<ConstructionSite, 'actualCost'>;

/**
 * Compose un `SiteDetail` complet à partir d'un chantier sans coût et de ses
 * imputations : le coût réel et les sous-totaux par poste en sont dérivés,
 * jamais posés à la main (P-4 — voir l'en-tête du fichier).
 */
function construireDetail(base: ChantierBase, allocations: SiteAllocationLine[]): SiteDetail {
  const actualCost = allocations.reduce((somme, ligne) => somme + ligne.amount, 0);
  const byCostCategory = POSTES.map(poste => ({
    costCategoryId: poste.id,
    label: poste.label,
    amount: allocations
      .filter(ligne => ligne.costCategoryId === poste.id)
      .reduce((somme, ligne) => somme + ligne.amount, 0)
  })).filter(entree => entree.amount > 0);

  return {
    site: { ...base, actualCost },
    allocations,
    byCostCategory
  };
}

// ---------------------------------------------------------------------------
// Chantier 1 — le détail complet : vingt imputations, sept postes, factures et
// pièces de caisse mêlées.
// ---------------------------------------------------------------------------

const RICHE_BASE: ChantierBase = {
  id: 'chantier-riche-01',
  name: 'Villa duplex — Angré Centre',
  zone: 'Angré, Cocody',
  propertyId: 'bien-chantier-riche-01',
  propertyLabel: 'Villa duplex — Angré Centre (en construction)',
  managerLabel: 'Mamadou Konan',
  // Aucun bail de terrain par defaut : c'est le cas courant.
  landLeaseId: null,
  status: 'IN_PROGRESS',
  startDate: '2026-04-01',
  plannedEndDate: '2026-11-30',
  progressPercent: 70,
  closedAt: null,
  finalCost: null,
  currency: 'XOF'
};

const RICHE_ALLOCATIONS: SiteAllocationLine[] = [
  {
    id: 'alloc-riche-01',
    allocationDate: '2026-04-03',
    costCategoryId: 'poste-gros-oeuvre',
    costCategoryLabel: 'Gros œuvre',
    sourceType: 'SUPPLIER_INVOICE',
    sourceId: 'facture-riche-01',
    sourceLabel: "Facture FC-2026-0141 — Ciments d'Afrique CI",
    amount: 3_200_000
  },
  {
    id: 'alloc-riche-02',
    allocationDate: '2026-04-10',
    costCategoryId: 'poste-gros-oeuvre',
    costCategoryLabel: 'Gros œuvre',
    sourceType: 'CASH_VOUCHER',
    sourceId: 'piece-caisse-riche-01',
    sourceLabel: 'Pièce de caisse 2026-0031 — Sable et gravier, livraison Angré',
    amount: 850_000
  },
  {
    id: 'alloc-riche-03',
    allocationDate: '2026-04-22',
    costCategoryId: 'poste-main-oeuvre',
    costCategoryLabel: "Main-d'œuvre",
    sourceType: 'CASH_VOUCHER',
    sourceId: 'piece-caisse-riche-02',
    sourceLabel: 'Pièce de caisse 2026-0032 — Salaire équipe maçons (2 semaines)',
    amount: 1_200_000
  },
  {
    id: 'alloc-riche-04',
    allocationDate: '2026-05-02',
    costCategoryId: 'poste-gros-oeuvre',
    costCategoryLabel: 'Gros œuvre',
    sourceType: 'SUPPLIER_INVOICE',
    sourceId: 'facture-riche-02',
    sourceLabel: 'Facture FC-2026-0158 — Fer à béton, Quincaillerie Kouassi & Fils',
    amount: 2_450_000
  },
  {
    id: 'alloc-riche-05',
    allocationDate: '2026-05-15',
    costCategoryId: 'poste-main-oeuvre',
    costCategoryLabel: "Main-d'œuvre",
    sourceType: 'CASH_VOUCHER',
    sourceId: 'piece-caisse-riche-03',
    sourceLabel: 'Pièce de caisse 2026-0045 — Salaire équipe maçons (2 semaines)',
    amount: 1_250_000
  },
  {
    id: 'alloc-riche-06',
    allocationDate: '2026-05-28',
    costCategoryId: 'poste-toiture',
    costCategoryLabel: 'Toiture',
    sourceType: 'SUPPLIER_INVOICE',
    sourceId: 'facture-riche-03',
    sourceLabel: 'Facture FC-2026-0172 — Charpente métallique, Sotraco Ivoire',
    amount: 4_100_000
  },
  {
    id: 'alloc-riche-07',
    allocationDate: '2026-06-05',
    costCategoryId: 'poste-toiture',
    costCategoryLabel: 'Toiture',
    sourceType: 'CASH_VOUCHER',
    sourceId: 'piece-caisse-riche-04',
    sourceLabel: 'Pièce de caisse 2026-0058 — Transport tôles bac acier',
    amount: 350_000
  },
  {
    id: 'alloc-riche-08',
    allocationDate: '2026-06-12',
    costCategoryId: 'poste-main-oeuvre',
    costCategoryLabel: "Main-d'œuvre",
    sourceType: 'CASH_VOUCHER',
    sourceId: 'piece-caisse-riche-05',
    sourceLabel: 'Pièce de caisse 2026-0061 — Salaire équipe couvreurs',
    amount: 900_000
  },
  {
    id: 'alloc-riche-09',
    allocationDate: '2026-06-20',
    costCategoryId: 'poste-plomberie',
    costCategoryLabel: 'Plomberie',
    sourceType: 'SUPPLIER_INVOICE',
    sourceId: 'facture-riche-04',
    sourceLabel: 'Facture FC-2026-0189 — Tuyauterie PVC et raccords, Plombex Abidjan',
    amount: 1_180_000
  },
  {
    id: 'alloc-riche-10',
    allocationDate: '2026-06-27',
    costCategoryId: 'poste-plomberie',
    costCategoryLabel: 'Plomberie',
    sourceType: 'CASH_VOUCHER',
    sourceId: 'piece-caisse-riche-06',
    sourceLabel: "Pièce de caisse 2026-0067 — Main-d'œuvre plombier, forfait",
    amount: 400_000
  },
  {
    id: 'alloc-riche-11',
    allocationDate: '2026-07-04',
    costCategoryId: 'poste-electricite',
    costCategoryLabel: 'Électricité',
    sourceType: 'SUPPLIER_INVOICE',
    sourceId: 'facture-riche-05',
    sourceLabel: 'Facture FC-2026-0203 — Câblage et tableau électrique, Elec Plus',
    amount: 1_950_000
  },
  {
    id: 'alloc-riche-12',
    allocationDate: '2026-07-11',
    costCategoryId: 'poste-electricite',
    costCategoryLabel: 'Électricité',
    sourceType: 'CASH_VOUCHER',
    sourceId: 'piece-caisse-riche-07',
    sourceLabel: "Pièce de caisse 2026-0074 — Main-d'œuvre électricien, forfait",
    amount: 500_000
  },
  {
    id: 'alloc-riche-13',
    allocationDate: '2026-07-18',
    costCategoryId: 'poste-materiaux',
    costCategoryLabel: 'Matériaux',
    sourceType: 'SUPPLIER_INVOICE',
    sourceId: 'facture-riche-06',
    sourceLabel: 'Facture FC-2026-0215 — Peinture et enduits, Décor Matériaux',
    amount: 980_000
  },
  {
    id: 'alloc-riche-14',
    allocationDate: '2026-07-25',
    costCategoryId: 'poste-materiaux',
    costCategoryLabel: 'Matériaux',
    sourceType: 'SUPPLIER_INVOICE',
    sourceId: 'facture-riche-07',
    sourceLabel: 'Facture FC-2026-0221 — Carrelage et faïence, Ceramica Ivoire',
    amount: 2_300_000
  },
  {
    id: 'alloc-riche-15',
    allocationDate: '2026-08-01',
    costCategoryId: 'poste-main-oeuvre',
    costCategoryLabel: "Main-d'œuvre",
    sourceType: 'CASH_VOUCHER',
    sourceId: 'piece-caisse-riche-08',
    sourceLabel: 'Pièce de caisse 2026-0082 — Salaire équipe carreleurs',
    amount: 850_000
  },
  {
    id: 'alloc-riche-16',
    allocationDate: '2026-08-08',
    costCategoryId: 'poste-divers',
    costCategoryLabel: 'Divers',
    sourceType: 'CASH_VOUCHER',
    sourceId: 'piece-caisse-riche-09',
    sourceLabel: 'Pièce de caisse 2026-0086 — Gardiennage du chantier, quinzaine',
    amount: 300_000
  },
  {
    id: 'alloc-riche-17',
    allocationDate: '2026-08-15',
    costCategoryId: 'poste-divers',
    costCategoryLabel: 'Divers',
    sourceType: 'SUPPLIER_INVOICE',
    sourceId: 'facture-riche-08',
    sourceLabel: "Facture FC-2026-0238 — Location groupe électrogène, mois d'août",
    amount: 450_000
  },
  {
    id: 'alloc-riche-18',
    allocationDate: '2026-08-22',
    costCategoryId: 'poste-gros-oeuvre',
    costCategoryLabel: 'Gros œuvre',
    sourceType: 'SUPPLIER_INVOICE',
    sourceId: 'facture-riche-09',
    sourceLabel: "Facture FC-2026-0244 — Ciments d'Afrique CI, second lot",
    amount: 1_600_000
  },
  {
    id: 'alloc-riche-19',
    allocationDate: '2026-09-01',
    costCategoryId: 'poste-main-oeuvre',
    costCategoryLabel: "Main-d'œuvre",
    sourceType: 'CASH_VOUCHER',
    sourceId: 'piece-caisse-riche-10',
    sourceLabel: 'Pièce de caisse 2026-0093 — Salaire équipe finitions',
    amount: 780_000
  },
  {
    id: 'alloc-riche-20',
    allocationDate: '2026-09-12',
    costCategoryId: 'poste-materiaux',
    costCategoryLabel: 'Matériaux',
    sourceType: 'CASH_VOUCHER',
    sourceId: 'piece-caisse-riche-11',
    sourceLabel: 'Pièce de caisse 2026-0099 — Achat quincaillerie divers, finitions',
    amount: 260_000
  }
];

const DETAIL_RICHE = construireDetail(RICHE_BASE, RICHE_ALLOCATIONS);

// ---------------------------------------------------------------------------
// Chantier 2 — sans bien rattaché : le cas de la cliente, un terrain loué.
// ---------------------------------------------------------------------------

const SANS_BIEN_BASE: ChantierBase = {
  id: 'chantier-sans-bien-01',
  name: 'Terrain loué — Riviera',
  zone: 'Riviera, Cocody',
  propertyId: null,
  propertyLabel: null,
  managerLabel: 'Ibrahima Yao',
  // Aucun bail de terrain par defaut : c'est le cas courant.
  landLeaseId: null,
  status: 'IN_PROGRESS',
  startDate: '2026-06-01',
  plannedEndDate: '2026-12-31',
  progressPercent: 35,
  closedAt: null,
  finalCost: null,
  currency: 'XOF'
};

const SANS_BIEN_ALLOCATIONS: SiteAllocationLine[] = [
  {
    id: 'alloc-sans-bien-01',
    allocationDate: '2026-06-10',
    costCategoryId: 'poste-gros-oeuvre',
    costCategoryLabel: 'Gros œuvre',
    sourceType: 'SUPPLIER_INVOICE',
    sourceId: 'facture-sans-bien-01',
    sourceLabel: 'Facture FC-2026-0165 — Blocs de ciment, Bloc Ivoire',
    amount: 1_800_000
  },
  {
    id: 'alloc-sans-bien-02',
    allocationDate: '2026-06-24',
    costCategoryId: 'poste-main-oeuvre',
    costCategoryLabel: "Main-d'œuvre",
    sourceType: 'CASH_VOUCHER',
    sourceId: 'piece-caisse-sans-bien-01',
    sourceLabel: 'Pièce de caisse 2026-0052 — Salaire équipe fondations',
    amount: 950_000
  },
  {
    id: 'alloc-sans-bien-03',
    allocationDate: '2026-07-15',
    costCategoryId: 'poste-divers',
    costCategoryLabel: 'Divers',
    sourceType: 'CASH_VOUCHER',
    sourceId: 'piece-caisse-sans-bien-02',
    sourceLabel: 'Pièce de caisse 2026-0071 — Location de terrain, quittance mensuelle',
    amount: 400_000
  },
  {
    id: 'alloc-sans-bien-04',
    allocationDate: '2026-08-05',
    costCategoryId: 'poste-gros-oeuvre',
    costCategoryLabel: 'Gros œuvre',
    sourceType: 'SUPPLIER_INVOICE',
    sourceId: 'facture-sans-bien-02',
    sourceLabel: 'Facture FC-2026-0230 — Fer à béton, Quincaillerie Kouassi & Fils',
    amount: 1_350_000
  }
];

const DETAIL_SANS_BIEN = construireDetail(SANS_BIEN_BASE, SANS_BIEN_ALLOCATIONS);

// ---------------------------------------------------------------------------
// Chantier 3 — clôturé : coût réel figé, `finalCost` égal à la somme des
// imputations.
// ---------------------------------------------------------------------------

const CLOTURE_ALLOCATIONS: SiteAllocationLine[] = [
  {
    id: 'alloc-cloture-01',
    allocationDate: '2025-09-20',
    costCategoryId: 'poste-gros-oeuvre',
    costCategoryLabel: 'Gros œuvre',
    sourceType: 'SUPPLIER_INVOICE',
    sourceId: 'facture-cloture-01',
    sourceLabel: "Facture FC-2025-0810 — Ciments d'Afrique CI",
    amount: 5_000_000
  },
  {
    id: 'alloc-cloture-02',
    allocationDate: '2025-11-05',
    costCategoryId: 'poste-toiture',
    costCategoryLabel: 'Toiture',
    sourceType: 'SUPPLIER_INVOICE',
    sourceId: 'facture-cloture-02',
    sourceLabel: 'Facture FC-2025-0865 — Charpente et tôles, Sotraco Ivoire',
    amount: 6_200_000
  },
  {
    id: 'alloc-cloture-03',
    allocationDate: '2025-12-10',
    costCategoryId: 'poste-main-oeuvre',
    costCategoryLabel: "Main-d'œuvre",
    sourceType: 'CASH_VOUCHER',
    sourceId: 'piece-caisse-cloture-01',
    sourceLabel: 'Pièce de caisse 2025-0210 — Salaire équipe gros œuvre, solde final',
    amount: 2_100_000
  },
  {
    id: 'alloc-cloture-04',
    allocationDate: '2026-01-20',
    costCategoryId: 'poste-electricite',
    costCategoryLabel: 'Électricité',
    sourceType: 'SUPPLIER_INVOICE',
    sourceId: 'facture-cloture-03',
    sourceLabel: 'Facture FC-2026-0022 — Installation électrique complète, Elec Plus',
    amount: 3_400_000
  },
  {
    id: 'alloc-cloture-05',
    allocationDate: '2026-02-15',
    costCategoryId: 'poste-plomberie',
    costCategoryLabel: 'Plomberie',
    sourceType: 'SUPPLIER_INVOICE',
    sourceId: 'facture-cloture-04',
    sourceLabel: 'Facture FC-2026-0048 — Plomberie complète, Plombex Abidjan',
    amount: 2_600_000
  },
  {
    id: 'alloc-cloture-06',
    allocationDate: '2026-03-25',
    costCategoryId: 'poste-divers',
    costCategoryLabel: 'Divers',
    sourceType: 'CASH_VOUCHER',
    sourceId: 'piece-caisse-cloture-02',
    sourceLabel: 'Pièce de caisse 2026-0018 — Nettoyage de fin de chantier et finitions',
    amount: 500_000
  }
];

const COUT_CLOTURE = CLOTURE_ALLOCATIONS.reduce((somme, ligne) => somme + ligne.amount, 0);

const CLOTURE_BASE: ChantierBase = {
  id: 'chantier-cloture-01',
  name: 'Immeuble R+3 — Marcory',
  zone: 'Marcory, Abidjan',
  propertyId: 'bien-cloture-01',
  propertyLabel: 'Immeuble R+3 — Marcory (livré)',
  managerLabel: 'Aïssatou Brou',
  // Aucun bail de terrain par defaut : c'est le cas courant.
  landLeaseId: null,
  status: 'CLOSED',
  startDate: '2025-09-01',
  plannedEndDate: '2026-03-31',
  progressPercent: 100,
  closedAt: '2026-04-15',
  // Le seul champ de coût saisi à la main du module : `finalCost` est posé une
  // fois, à la clôture, par un geste distinct de la lecture courante — il
  // n'est ici que recopié, égal au coût réel dérivé, jamais divergent.
  finalCost: COUT_CLOTURE,
  currency: 'XOF'
};

const DETAIL_CLOTURE = construireDetail(CLOTURE_BASE, CLOTURE_ALLOCATIONS);

// ---------------------------------------------------------------------------
// Chantier 4 — vient de démarrer : aucune imputation, coût réel à zéro.
// ---------------------------------------------------------------------------

const NOUVEAU_BASE: ChantierBase = {
  id: 'chantier-nouveau-01',
  name: 'Extension villa — Bingerville',
  zone: 'Bingerville, Abidjan',
  propertyId: 'bien-nouveau-01',
  propertyLabel: 'Villa Bingerville 2 (extension)',
  managerLabel: 'Mamadou Konan',
  // Aucun bail de terrain par defaut : c'est le cas courant.
  landLeaseId: null,
  status: 'PLANNED',
  startDate: '2026-09-15',
  plannedEndDate: '2027-02-28',
  progressPercent: 0,
  closedAt: null,
  finalCost: null,
  currency: 'XOF'
};

const DETAIL_NOUVEAU = construireDetail(NOUVEAU_BASE, []);

export const SITE_DETAILS: SiteDetail[] = [DETAIL_RICHE, DETAIL_SANS_BIEN, DETAIL_CLOTURE, DETAIL_NOUVEAU];
export const SITES: ConstructionSite[] = SITE_DETAILS.map(detail => detail.site);

// ---------------------------------------------------------------------------
// Pièce de caisse — les deux chemins de mutation n'ont aucune collision avec
// une route GET (voir l'en-tête) : l'atelier peut donc démontrer l'émission et
// la validation pour de bon.
// ---------------------------------------------------------------------------

const PIECE_CAISSE_EMISE: CashVoucher = {
  id: 'piece-caisse-atelier-01',
  // Un brouillon n'a pas de numero : il lui est attribue a la validation
  // (decision du 19 septembre 2026). La maquette doit le montrer ainsi, sans
  // quoi l'ecran serait mis au point sur un cas qui n'arrive jamais.
  number: null,
  siteId: RICHE_BASE.id,
  siteLabel: RICHE_BASE.name,
  costCategoryId: 'poste-main-oeuvre',
  costCategoryLabel: "Main-d'œuvre",
  beneficiary: 'Sékou Traoré',
  amount: 450_000,
  currency: 'XOF',
  voucherDate: '2026-09-18',
  reason: 'Salaire équipe finitions, semaine du 15 septembre',
  status: 'DRAFT',
  validatedAt: null
};

const PIECE_CAISSE_VALIDEE: CashVoucher = {
  ...PIECE_CAISSE_EMISE,
  // Le numero apparait ici, et nulle part avant.
  number: '2026-0107',
  status: 'VALIDATED',
  validatedAt: '2026-09-18T10:00:00.000Z'
};

/**
 * Met une maquette à la forme du réseau, celle du contrat gelé.
 *
 * L'atelier répondait jusqu'au 20 septembre 2026 avec la forme que le front
 * souhaitait (`{ site, allocations, byCostCategory }`), et non celle que le
 * serveur envoie (`{ siteId, site, actualCost, allocations,
 * subtotalsByCategory }`). Une maquette qui imite le vœu du client plutôt que
 * la réponse du serveur ne démontre rien : elle a masqué pendant tout un lot
 * le défaut qui faisait tomber la fiche d'un chantier en conditions réelles.
 */
function versLeReseau(detail: SiteDetail) {
  return {
    siteId: detail.site.id,
    site: detail.site,
    actualCost: detail.site.actualCost,
    allocations: detail.allocations,
    subtotalsByCategory: detail.byCostCategory.map(poste => ({
      costCategoryId: poste.costCategoryId,
      label: poste.label,
      total: poste.amount
    }))
  };
}

export function repondreChantiers(chemin: string, scenario: Scenario): unknown | null {
  const detailMatch = /\/tenants\/[^/]+\/finance\/sites\/([^/]+)\/detail$/.exec(chemin);
  if (detailMatch) {
    // Un identifiant inconnu retombe sur le premier chantier, comme le fait
    // déjà la fiche d'un bien dans `mock-api.ts` : la scène reste atteignable
    // sans connaître les identifiants simulés.
    const detail = SITE_DETAILS.find(candidat => candidat.site.id === detailMatch[1]) ?? SITE_DETAILS[0];
    const scene: SiteDetail = scenario === 'vide' ? { ...detail, allocations: [], byCostCategory: [] } : detail;
    return { success: true, data: versLeReseau(scene) };
  }

  if (/\/tenants\/[^/]+\/finance\/sites\/[^/]+\/cash-vouchers$/.test(chemin)) {
    return { success: true, data: PIECE_CAISSE_EMISE };
  }

  if (/\/tenants\/[^/]+\/finance\/cash-vouchers\/[^/]+\/validate$/.test(chemin)) {
    return { success: true, data: PIECE_CAISSE_VALIDEE };
  }

  // Annulation d'une pièce validée. Elle garde son numéro : une pièce annulée
  // reste au carnet, avec sa pièce d'annulation en face, sinon le carnet
  // aurait un trou et l'annulation serait invisible.
  if (/\/tenants\/[^/]+\/finance\/cash-vouchers\/[^/]+\/void$/.test(chemin)) {
    return { success: true, data: { ...PIECE_CAISSE_VALIDEE, status: 'VOIDED' as const } };
  }

  // Voir l'en-tête du fichier : cette branche répond aussi bien à
  // `GET .../finance/sites` (liste) qu'à `POST .../finance/sites` (création),
  // l'atelier ne distinguant pas les méthodes. La création n'y est donc pas
  // démontrable de bout en bout ; les tests unitaires du composant le sont.
  if (/\/tenants\/[^/]+\/finance\/sites$/.test(chemin)) {
    return { success: true, data: scenario === 'vide' ? [] : SITES };
  }

  if (/\/tenants\/[^/]+\/finance\/cost-categories$/.test(chemin)) {
    return { success: true, data: scenario === 'vide' ? [] : POSTES };
  }

  return null;
}
