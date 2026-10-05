/**
 * Atelier — fausse API du lot 5, quatrième et dernier sous-lot : la bascule
 * d'un chantier au stock, et le rapprochement acheté / consommé / restant.
 *
 * Modèle exact de `finance-mock-site-closing.ts` : ce fichier appartient en
 * entier à l'agent qui construit cet écran, jeux d'essai ET réponses. Il
 * renvoie `null` quand l'URL ne le concerne pas ; `mock-api.ts` passe alors au
 * gestionnaire suivant.
 *
 * **Non câblé dans `mock-api.ts`.** Cet agent ne modifie que les fichiers de
 * son périmètre ; `mock-api.ts` — le registre qui ajoute chaque `repondreXxx`
 * à la liste consultée par l'adaptateur — est réservé au superviseur.
 * `repondreStockRapprochement` est prêt à y être ajouté, sur le même modèle que
 * `repondreSiteClosing` :
 *
 * ```ts
 * import { repondreStockRapprochement } from './finance-mock-stock-rapprochement';
 * // dans la liste `for (const repondre of [...])` :
 * repondreStockRapprochement
 * ```
 *
 * ---------------------------------------------------------------------------
 * Cinq chantiers, cinq états que l'écran doit distinguer
 * ---------------------------------------------------------------------------
 *
 * Le cas heureux seul ne prouve rien : c'est en regardant un chantier
 * approvisionné uniquement par transferts qu'on voit si l'écart se trompe.
 *
 * - `chantier-non-bascule-01` — **pas passé au stock, et rien ne s'y est
 *   passé.** Aucun lieu, aucun article. L'écran doit proposer la bascule,
 *   annoncer son irréversibilité AVANT qu'on approche du bouton, et ne pas
 *   ressembler à une panne.
 * - `chantier-non-bascule-consomme-01` — **pas passé au stock, et pourtant il
 *   a consommé.** Un magasin central lui a sorti du ciment et du fer : ces
 *   sorties ont bel et bien imputé son coût. C'est la scène qui contredit le
 *   premier jet du contrat (« sans bascule tout vaut zéro ») : ici seuls le
 *   facturé et l'écart valent zéro. Un écran qui afficherait le consommé à
 *   zéro mentirait sur un chiffre qui existe.
 * - `chantier-ecart-01` — **passé au stock, avec un écart POSITIF** de
 *   900 000 FCFA : 12 000 000 facturés, 11 100 000 entrés depuis une facture.
 *   Il a de surcroît reçu 2 400 000 d'un magasin central, qui n'entrent PAS
 *   dans l'écart. C'est la scène la plus dense, et volontairement.
 * - `chantier-transferts-01` — **passé au stock, alimenté UNIQUEMENT par
 *   transferts.** Aucune facture à son nom : `invoicedAmount` vaut zéro,
 *   `receivedValue` aussi, et l'écart vaut donc **zéro**. C'est le cas le plus
 *   courant en agence, et celui où l'ancien calcul affichait −8 250 000, c'est
 *   à dire l'opposé de tout ce qu'on lui avait livré. Si l'écran mélange les
 *   deux entrées, cette scène le montre immédiatement.
 * - `chantier-sans-ecart-01` — **passé au stock, sans écart.** Facturé et
 *   reçu coïncident au franc près. Le cas où l'écran ne doit pas aller
 *   chercher un problème là où il n'y en a pas.
 *
 * **Un quart de mètre cube.** `chantier-ecart-01` porte du sable en `m³` avec
 * des quantités à quatre décimales (0,2500), précision réelle du stock
 * (`Decimal(16,4)`). Un écran qui passerait les quantités au formateur
 * monétaire afficherait « 0 » : cette scène existe pour que cela se voie.
 *
 * **Aucun montant n'est recalculé ici**, pas plus qu'à l'écran. Les totaux
 * sont posés à la main, comme le serveur les émettrait, et les scènes où
 * l'écart n'est pas la simple soustraction (`chantier-non-bascule-consomme-01`)
 * le sont tout autant : c'est le serveur qui décide de poser zéro sans
 * bascule, pas ce fichier.
 *
 * Les articles reprennent les références du référentiel (`CIM-42`, `FER-12`,
 * `SAB-00`) par leur libellé, jamais réimportées de
 * `finance-mock-stock-referentiel.ts` : ce fichier appartient à un autre agent,
 * même raison qu'aux sous-lots précédents.
 *
 * **Limite assumée.** `mock-api.ts` route par le seul CHEMIN, jamais par la
 * méthode. La bascule (`POST .../stock/enable`) a son chemin à elle et ne
 * souffre donc pas de cette limite, mais elle ne modifie aucun état : elle rend
 * un chantier basculé à l'instant, et une relecture du rapprochement montrera
 * de nouveau la scène d'origine. Le parcours « je bascule puis je relis » est
 * couvert par le test d'écran, service réel et `apiClient` simulé
 * (`__tests__/finance/stock-chantier.test.tsx`).
 */

import type {
  SiteStockReconciliation,
  SiteStockReconciliationLine,
  SiteStockStatus
} from '../../types/finance-stock-rapprochement-types';
import type { Scenario } from './mock-api';

const DEVISE = 'XOF';

const NON_BASCULE = 'chantier-non-bascule-01';
const NON_BASCULE_CONSOMME = 'chantier-non-bascule-consomme-01';
const ECART = 'chantier-ecart-01';
const TRANSFERTS = 'chantier-transferts-01';
const SANS_ECART = 'chantier-sans-ecart-01';

/** Une ligne d'article, tous les champs à zéro sauf ceux qu'on précise. */
function ligne(
  partielle: Partial<SiteStockReconciliationLine> &
    Pick<SiteStockReconciliationLine, 'itemId' | 'itemReference' | 'itemLabel' | 'itemUnit'>
): SiteStockReconciliationLine {
  return {
    receivedQuantity: 0,
    transferredInQuantity: 0,
    issuedQuantity: 0,
    remainingQuantity: 0,
    receivedValue: 0,
    transferredInValue: 0,
    issuedValue: 0,
    remainingValue: 0,
    // Lot 040 (A6) : retours au fournisseur et rebuts, descriptifs.
    returnedToSupplierQuantity: 0,
    returnedToSupplierValue: 0,
    scrappedQuantity: 0,
    scrappedValue: 0,
    currency: DEVISE,
    ...partielle
  };
}

// ---------------------------------------------------------------------------
// Les cinq chantiers
// ---------------------------------------------------------------------------

/** Pas au stock, et rien ne s'y est encore passé. */
const RAPPROCHEMENT_NON_BASCULE: SiteStockReconciliation = {
  siteId: NON_BASCULE,
  siteLabel: "Villa d'Angré",
  stockEnabledAt: null,
  invoicedAmount: 0,
  receivedValue: 0,
  transferredInValue: 0,
  unreconciledAmount: 0,
  issuedValue: 0,
  remainingValue: 0,
  currency: DEVISE,
  lines: []
};

/**
 * Pas au stock, et pourtant il a consommé.
 *
 * Aucun lieu de chantier : rien n'est « entré » sur place, rien n'y « reste ».
 * Mais un magasin central lui a sorti de la marchandise, et ces sorties ont
 * imputé son coût. Seuls le facturé et l'écart valent zéro.
 */
const RAPPROCHEMENT_NON_BASCULE_CONSOMME: SiteStockReconciliation = {
  siteId: NON_BASCULE_CONSOMME,
  siteLabel: 'Résidence de Cocody',
  stockEnabledAt: null,
  // Pas de période de bascule : aucune facture n'est confrontée, et l'écart
  // n'est PAS la soustraction — il est posé à zéro par le serveur.
  invoicedAmount: 0,
  receivedValue: 0,
  transferredInValue: 0,
  unreconciledAmount: 0,
  // Le chiffre qui existe, et qu'un écran trop littéral afficherait à zéro.
  issuedValue: 3_150_000,
  remainingValue: 0,
  currency: DEVISE,
  lines: [
    ligne({
      itemId: 'article-ciment-01',
      itemReference: 'CIM-42',
      itemLabel: 'Ciment CPJ 42,5',
      itemUnit: 'sac',
      issuedQuantity: 240,
      issuedValue: 2_400_000
    }),
    ligne({
      itemId: 'article-fer-02',
      itemReference: 'FER-12',
      itemLabel: 'Fer à béton HA 12',
      itemUnit: 'barre',
      issuedQuantity: 90,
      issuedValue: 750_000
    })
  ]
};

/**
 * Passé au stock, avec un écart POSITIF : 12 000 000 facturés, 11 100 000
 * entrés depuis une facture.
 *
 * Il a aussi reçu 2 400 000 d'un magasin central, qui n'entrent pas dans
 * l'écart : cette matière a été payée ailleurs.
 */
const RAPPROCHEMENT_ECART: SiteStockReconciliation = {
  siteId: ECART,
  siteLabel: 'Immeuble du Plateau',
  stockEnabledAt: '2026-06-01T08:00:00.000Z',
  invoicedAmount: 12_000_000,
  receivedValue: 11_100_000,
  transferredInValue: 2_400_000,
  unreconciledAmount: 900_000,
  issuedValue: 9_800_000,
  remainingValue: 3_700_000,
  currency: DEVISE,
  lines: [
    ligne({
      itemId: 'article-ciment-01',
      itemReference: 'CIM-42',
      itemLabel: 'Ciment CPJ 42,5',
      itemUnit: 'sac',
      receivedQuantity: 800,
      receivedValue: 8_000_000,
      transferredInQuantity: 120,
      transferredInValue: 1_200_000,
      issuedQuantity: 700,
      issuedValue: 7_000_000,
      remainingQuantity: 220,
      remainingValue: 2_200_000
    }),
    ligne({
      itemId: 'article-fer-02',
      itemReference: 'FER-12',
      itemLabel: 'Fer à béton HA 12',
      itemUnit: 'barre',
      receivedQuantity: 310,
      receivedValue: 2_600_000,
      transferredInQuantity: 140,
      transferredInValue: 1_200_000,
      issuedQuantity: 330,
      issuedValue: 2_760_000,
      remainingQuantity: 120,
      remainingValue: 1_040_000
    }),
    // Un quart de mètre cube : la précision est de QUATRE décimales, et le
    // formateur monétaire afficherait « 0 ».
    ligne({
      itemId: 'article-sable-03',
      itemReference: 'SAB-00',
      itemLabel: 'Sable lavé',
      itemUnit: 'm³',
      receivedQuantity: 18.5,
      receivedValue: 500_000,
      issuedQuantity: 18.25,
      issuedValue: 40_000,
      remainingQuantity: 0.25,
      remainingValue: 460_000
    })
  ]
};

/**
 * Passé au stock, alimenté UNIQUEMENT par transferts.
 *
 * Aucune facture à son nom, donc aucun facturé et aucun reçu : l'écart vaut
 * **zéro**, et surtout pas −8 250 000. C'est la correction que le contrat
 * gelé raconte, et la scène qui la met sous les yeux.
 */
const RAPPROCHEMENT_TRANSFERTS: SiteStockReconciliation = {
  siteId: TRANSFERTS,
  siteLabel: 'Villa de la Riviera',
  stockEnabledAt: '2026-07-15T09:30:00.000Z',
  invoicedAmount: 0,
  receivedValue: 0,
  transferredInValue: 8_250_000,
  // Zéro, et non l'opposé de ce qui a été livré : une livraison interne n'est
  // pas un achat.
  unreconciledAmount: 0,
  issuedValue: 5_400_000,
  remainingValue: 2_850_000,
  currency: DEVISE,
  lines: [
    ligne({
      itemId: 'article-ciment-01',
      itemReference: 'CIM-42',
      itemLabel: 'Ciment CPJ 42,5',
      itemUnit: 'sac',
      transferredInQuantity: 600,
      transferredInValue: 6_000_000,
      issuedQuantity: 420,
      issuedValue: 4_200_000,
      remainingQuantity: 180,
      remainingValue: 1_800_000
    }),
    ligne({
      itemId: 'article-fer-02',
      itemReference: 'FER-12',
      itemLabel: 'Fer à béton HA 12',
      itemUnit: 'barre',
      transferredInQuantity: 260,
      transferredInValue: 2_250_000,
      issuedQuantity: 140,
      issuedValue: 1_200_000,
      remainingQuantity: 120,
      remainingValue: 1_050_000
    })
  ]
};

/** Passé au stock, et le facturé coïncide avec ce qui est entré. */
const RAPPROCHEMENT_SANS_ECART: SiteStockReconciliation = {
  siteId: SANS_ECART,
  siteLabel: 'Entrepôt de Bouaké',
  stockEnabledAt: '2026-05-02T07:45:00.000Z',
  invoicedAmount: 4_500_000,
  receivedValue: 4_500_000,
  transferredInValue: 0,
  unreconciledAmount: 0,
  issuedValue: 3_000_000,
  remainingValue: 1_500_000,
  currency: DEVISE,
  lines: [
    ligne({
      itemId: 'article-ciment-01',
      itemReference: 'CIM-42',
      itemLabel: 'Ciment CPJ 42,5',
      itemUnit: 'sac',
      receivedQuantity: 450,
      receivedValue: 4_500_000,
      issuedQuantity: 300,
      issuedValue: 3_000_000,
      remainingQuantity: 150,
      remainingValue: 1_500_000
    })
  ]
};

const RAPPROCHEMENTS: Record<string, SiteStockReconciliation> = {
  [NON_BASCULE]: RAPPROCHEMENT_NON_BASCULE,
  [NON_BASCULE_CONSOMME]: RAPPROCHEMENT_NON_BASCULE_CONSOMME,
  [ECART]: RAPPROCHEMENT_ECART,
  [TRANSFERTS]: RAPPROCHEMENT_TRANSFERTS,
  [SANS_ECART]: RAPPROCHEMENT_SANS_ECART
};

/**
 * Les lieux de stockage, par chantier.
 *
 * Les deux chantiers non basculés n'en ont pas : c'est justement pour cela que
 * rien n'est « entré » ni « restant » chez eux, même quand ils ont consommé.
 */
const LIEUX: Record<string, { id: string; label: string }> = {
  [ECART]: { id: 'lieu-plateau-11', label: 'Chantier Immeuble du Plateau' },
  [TRANSFERTS]: { id: 'lieu-riviera-12', label: 'Chantier Villa de la Riviera' },
  [SANS_ECART]: { id: 'lieu-bouake-13', label: 'Chantier Entrepôt de Bouaké' }
};

function rapprochementDe(siteId: string): SiteStockReconciliation {
  return RAPPROCHEMENTS[siteId] ?? { ...RAPPROCHEMENT_ECART, siteId };
}

function statutDe(siteId: string): SiteStockStatus {
  const rapprochement = rapprochementDe(siteId);
  const lieu = LIEUX[rapprochement.siteId] ?? null;
  return {
    siteId: rapprochement.siteId,
    siteLabel: rapprochement.siteLabel,
    stockEnabledAt: rapprochement.stockEnabledAt,
    stockLocationId: lieu?.id ?? null,
    stockLocationLabel: lieu?.label ?? null,
    // Lot 040 (A7-R1) : les chantiers du banc ont basculé il y a longtemps.
    openingCountSuggested: false
  };
}

/**
 * Ce que la bascule rend : le chantier daté de l'instant, et le lieu de
 * stockage que le serveur vient de créer pour lui.
 *
 * Le libellé est celui que `resolveFreeLocationLabel` produit côté serveur —
 * « Chantier <nom> » —, pour que l'écran soit lu contre le vrai texte et non
 * contre une invention de ce fichier.
 */
function basculeDe(siteId: string): SiteStockStatus {
  const rapprochement = rapprochementDe(siteId);
  const lieu = LIEUX[rapprochement.siteId] ?? null;
  return {
    siteId: rapprochement.siteId,
    siteLabel: rapprochement.siteLabel,
    // La date vient du serveur, JAMAIS de l'appelant : le corps est vide.
    stockEnabledAt: new Date().toISOString(),
    stockLocationId: lieu?.id ?? `lieu-${rapprochement.siteId}`,
    stockLocationLabel: lieu?.label ?? `Chantier ${rapprochement.siteLabel}`,
    // Lot 040 (A7-R1) : un chantier qui vient de basculer se voit proposer
    // l'inventaire d'ouverture de son lieu.
    openingCountSuggested: true
  };
}

export function repondreStockRapprochement(chemin: string, scenario: Scenario): unknown | null {
  // --- La bascule (segment LITTÉRAL `enable`, testée en premier) -----------
  const basculeMatch = /\/tenants\/[^/]+\/finance\/sites\/([^/]+)\/stock\/enable$/.exec(chemin);
  if (basculeMatch) {
    return { success: true, data: basculeDe(basculeMatch[1]) };
  }

  // --- Où en est le chantier ----------------------------------------------
  const statutMatch = /\/tenants\/[^/]+\/finance\/sites\/([^/]+)\/stock\/status$/.exec(chemin);
  if (statutMatch) {
    return { success: true, data: scenario === 'vide' ? statutDe(NON_BASCULE) : statutDe(statutMatch[1]) };
  }

  // --- Le rapprochement ----------------------------------------------------
  const rapprochementMatch = /\/tenants\/[^/]+\/finance\/sites\/([^/]+)\/stock\/reconciliation$/.exec(chemin);
  if (rapprochementMatch) {
    // Le scénario « vide » montre le chantier qui n'est pas passé au stock et
    // où rien ne s'est passé : c'est l'état vide de CET écran, pas une liste
    // vide de plus.
    return {
      success: true,
      data: scenario === 'vide' ? RAPPROCHEMENT_NON_BASCULE : rapprochementDe(rapprochementMatch[1]),
      // Lot 040 : la réponse porte son `meta` (spec §8.2).
      meta: { valuesVisible: true, blindLocationIds: [] }
    };
  }

  return null;
}
