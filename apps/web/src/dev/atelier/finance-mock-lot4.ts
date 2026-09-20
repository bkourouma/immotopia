/**
 * Atelier — fausse API du lot 4, sous-lot « baux de terrain ».
 *
 * Modèle exact de `finance-mock-lot3.ts` : ce fichier appartient en entier à
 * l'agent qui construit ces écrans, jeux d'essai ET réponses. Il renvoie
 * `null` quand l'URL ne le concerne pas ; `mock-api.ts` passe alors au
 * gestionnaire suivant.
 *
 * **Non câblé dans `mock-api.ts`.** Cet agent ne modifie que les fichiers de
 * son périmètre ; `mock-api.ts` — le registre qui ajoute chaque `repondreXxx`
 * à la liste consultée par l'adaptateur — n'en fait pas partie.
 * `repondreLot4` est prêt à y être ajouté, sur le même modèle que
 * `repondreLot3` :
 *
 * ```ts
 * import { repondreLot4 } from './finance-mock-lot4';
 * // dans la liste `for (const repondre of [...])` :
 * repondreLot4
 * ```
 *
 * **Trois baux, trois moments du cycle décrit par `data-model.md` §2** :
 *
 * - `bail-riviera-01` (Mamadou Kouadio — Terrain de la Riviera) est **en cours de
 *   consommation** : payé d'avance, deux mois déjà constatés, rattaché à
 *   `chantier-sans-bien-01` (« Terrain loué — Riviera »), le même chantier que
 *   `finance-mock-chantiers.ts` — pour que l'atelier raconte une seule
 *   histoire cohérente d'un volet à l'autre. Son compte de tiers est donc
 *   négatif : c'est le cas nominal de l'écran.
 * - `bail-port-bouet-01` (Fatoumata Kouassi — Terrain de Port-Bouët) a **terminé son
 *   année** : douze constatations, générées ci-dessous par la même règle que
 *   le serveur (onze douzièmes arrondis, le reliquat au douzième), ramènent
 *   son compte exactement à zéro — le critère de sortie 1 de `data-model.md`
 *   §7. Il ne porte **aucun chantier actif** : chacune de ses constatations a
 *   une liste `allocations` vide, le cas que l'écran doit lire comme « rien à
 *   imputer », jamais comme une ligne manquante (§3.1 du modèle).
 * - `bail-bingerville-01` (Ousmane Konan — Terrain de Bingerville) vient d'être
 *   **enregistré** : son unique paiement est encore en BROUILLON, rien n'a
 *   bougé à son compte, et aucun chantier n'y est encore rattaché — le cas
 *   qui exerce la confirmation de validation d'un paiement.
 *
 * **Limite assumée, identique à celle de `finance-mock-lot3.ts`.**
 * `mock-api.ts` route par le seul CHEMIN, jamais par la méthode : les paires
 * GET liste / POST création qui partagent un chemin (`land-leases`,
 * `land-leases/{id}/payments`) retombent donc sur la même branche et rendent
 * la forme de la LISTE quel que soit le verbe. La création n'est donc
 * démontrable de bout en bout dans l'atelier que pour les chemins qui n'ont
 * pas ce collisionnement (les actions `/validate`, `/accruals`, et
 * `sites/{siteId}/land-lease` qui n'a pas de pendant GET) ; le reste est
 * couvert par les tests unitaires des écrans, service mocké.
 */

import type { LandLease, LandLeaseAccrual, LandLeasePayment } from '../../types/finance-lot4-types';
import type { Scenario } from './mock-api';

// Même chantier que `finance-mock-chantiers.ts` (`SITE_SANS_BIEN`), repris par
// son identifiant plutôt que réimporté : les deux fichiers appartiennent à
// des agents différents, et la frontière entre volets ne doit pas dépendre
// d'un import croisé qui romprait si l'un des deux bouge sa fixture interne.
const SITE_RIVIERA_ID = 'chantier-sans-bien-01';
const SITE_RIVIERA_LABEL = 'Terrain loué — Riviera';

// Même poste que la ligne « Location du terrain » du budget de
// `chantier-sans-bien-01` dans `finance-mock-lot3.ts` (`poste-divers`) : les
// trois baux ci-dessous y imputent leur loyer, pour la même raison que la
// reprise du chantier — une seule histoire cohérente d'un volet à l'autre.
// Ajout au contrat du 19 septembre 2026 : `LandLease.costCategoryId` /
// `costCategoryLabel`.
const POSTE_ID = 'poste-divers';
const POSTE_LABEL = 'Divers';

// ---------------------------------------------------------------------------
// Bail 1 — en cours de consommation, rattaché à un chantier actif
// ---------------------------------------------------------------------------

const ANNUEL_RIVIERA = 4_000_000;
// Onze douzièmes arrondis ; le douzième mois porterait le reliquat, mais ce
// bail n'y est pas encore arrivé (voir plus bas) — la règle du reliquat est
// démontrée par `bail-port-bouet-01`, pas ici.
const MENSUEL_RIVIERA = Math.round(ANNUEL_RIVIERA / 12); // 333 333

const BAIL_RIVIERA: LandLease = {
  id: 'bail-riviera-01',
  landlordName: 'Mamadou Kouadio',
  landLabel: 'Terrain de la Riviera, 800 m²',
  annualAmount: ANNUEL_RIVIERA,
  costCategoryId: POSTE_ID,
  costCategoryLabel: POSTE_LABEL,
  monthlyAmount: MENSUEL_RIVIERA,
  currency: 'XOF',
  startDate: '2026-08-01',
  // Tacite reconduction : le cas courant (§2 du modèle).
  endDate: null,
  isActive: true,
  sites: [{ siteId: SITE_RIVIERA_ID, siteLabel: SITE_RIVIERA_LABEL, status: 'IN_PROGRESS' }],
  // Payé (4 000 000) moins consommé (2 × 333 333 = 666 666) : le compte est
  // débiteur du bailleur de 3 333 334, donc négatif de ce même montant côté
  // tiers — voir le commentaire de `LandLease.accountBalance` dans le contrat
  // gelé. C'est le nombre que l'écran doit lire comme « il reste 3 333 334 à
  // consommer », jamais afficher brut.
  accountBalance: -(ANNUEL_RIVIERA - 2 * MENSUEL_RIVIERA)
};

const PAIEMENTS_RIVIERA: LandLeasePayment[] = [
  {
    id: 'paiement-riviera-01',
    landLeaseId: BAIL_RIVIERA.id,
    landlordName: BAIL_RIVIERA.landlordName,
    paymentDate: '2026-08-01',
    amount: ANNUEL_RIVIERA,
    currency: 'XOF',
    coverageStartDate: '2026-08-01',
    coverageEndDate: '2027-07-31',
    status: 'VALIDATED',
    createdByLabel: 'Ibrahima Yao',
    validatedAt: '2026-08-01T09:00:00.000Z'
  }
];

const ACCRUALS_RIVIERA: LandLeaseAccrual[] = [
  {
    id: 'constat-riviera-2026-08',
    landLeaseId: BAIL_RIVIERA.id,
    landlordName: BAIL_RIVIERA.landlordName,
    periodYear: 2026,
    periodMonth: 8,
    amount: MENSUEL_RIVIERA,
    currency: 'XOF',
    allocations: [{ siteId: SITE_RIVIERA_ID, siteLabel: SITE_RIVIERA_LABEL, amount: MENSUEL_RIVIERA }],
    createdAt: '2026-08-01T02:00:00.000Z'
  },
  {
    id: 'constat-riviera-2026-09',
    landLeaseId: BAIL_RIVIERA.id,
    landlordName: BAIL_RIVIERA.landlordName,
    periodYear: 2026,
    periodMonth: 9,
    amount: MENSUEL_RIVIERA,
    currency: 'XOF',
    allocations: [{ siteId: SITE_RIVIERA_ID, siteLabel: SITE_RIVIERA_LABEL, amount: MENSUEL_RIVIERA }],
    createdAt: '2026-09-01T02:00:00.000Z'
  }
];

// ---------------------------------------------------------------------------
// Bail 2 — année complète, sans aucun chantier actif
// ---------------------------------------------------------------------------

const ANNUEL_PORT_BOUET = 3_700_000;

/**
 * Reproduit la règle du serveur (§3.2 du modèle) pour fabriquer les douze
 * constatations d'une année complète : onze mois à l'arrondi du douzième, le
 * reliquat porté par le douzième. Ce calcul a lieu ICI, dans la fixture — pas
 * dans un écran — exactement comme un vrai serveur l'aurait fait avant de
 * persister ces lignes. Aucun écran de ce lot ne refait cette division : voir
 * `pages/finance/BailDeTerrain.tsx`.
 */
function genererConstatationsAnneeComplete(bail: LandLease, moisDebut: { year: number; month: number }) {
  const standard = Math.round(bail.annualAmount / 12);
  const dernier = bail.annualAmount - 11 * standard;
  const lignes: LandLeaseAccrual[] = [];
  let { year, month } = moisDebut;

  for (let i = 0; i < 12; i += 1) {
    const montant = i === 11 ? dernier : standard;
    lignes.push({
      id: `constat-port-bouet-${year}-${String(month).padStart(2, '0')}`,
      landLeaseId: bail.id,
      landlordName: bail.landlordName,
      periodYear: year,
      periodMonth: month,
      amount: montant,
      currency: bail.currency,
      // Aucun chantier actif sur ce bail : la charge a bien eu lieu, elle
      // n'est simplement imputable à rien (§3.1 du modèle). L'écran doit le
      // dire, jamais laisser un blanc qui se lirait comme une ligne oubliée.
      allocations: [],
      createdAt: `${year}-${String(month).padStart(2, '0')}-01T02:00:00.000Z`
    });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return lignes;
}

const BAIL_PORT_BOUET: LandLease = {
  id: 'bail-port-bouet-01',
  landlordName: 'Fatoumata Kouassi',
  landLabel: 'Terrain de Port-Bouët, 1200 m²',
  annualAmount: ANNUEL_PORT_BOUET,
  costCategoryId: POSTE_ID,
  costCategoryLabel: POSTE_LABEL,
  monthlyAmount: Math.round(ANNUEL_PORT_BOUET / 12),
  currency: 'XOF',
  startDate: '2025-06-01',
  // Bail à durée fixe, non reconduit — à la différence du cas courant
  // (`bail-riviera-01`) : il ne l'a pas été, ce qui explique l'absence de
  // chantier actif ci-dessous.
  endDate: '2026-05-31',
  isActive: false,
  sites: [],
  // Douze constatations complètes ramènent le compte exactement à zéro —
  // critère de sortie 1 de `data-model.md` §7.
  accountBalance: 0
};

const PAIEMENTS_PORT_BOUET: LandLeasePayment[] = [
  {
    id: 'paiement-port-bouet-01',
    landLeaseId: BAIL_PORT_BOUET.id,
    landlordName: BAIL_PORT_BOUET.landlordName,
    paymentDate: '2025-06-01',
    amount: ANNUEL_PORT_BOUET,
    currency: 'XOF',
    coverageStartDate: '2025-06-01',
    coverageEndDate: '2026-05-31',
    status: 'VALIDATED',
    createdByLabel: 'Mamadou Konan',
    validatedAt: '2025-06-01T09:00:00.000Z'
  }
];

const ACCRUALS_PORT_BOUET = genererConstatationsAnneeComplete(BAIL_PORT_BOUET, { year: 2025, month: 6 });

// ---------------------------------------------------------------------------
// Bail 3 — tout juste enregistré, paiement encore en brouillon
// ---------------------------------------------------------------------------

const ANNUEL_BINGERVILLE = 2_400_000;

const BAIL_BINGERVILLE: LandLease = {
  id: 'bail-bingerville-01',
  landlordName: 'Ousmane Konan',
  landLabel: 'Terrain de Bingerville, 500 m²',
  annualAmount: ANNUEL_BINGERVILLE,
  costCategoryId: POSTE_ID,
  costCategoryLabel: POSTE_LABEL,
  monthlyAmount: Math.round(ANNUEL_BINGERVILLE / 12),
  currency: 'XOF',
  startDate: '2026-09-01',
  endDate: null,
  isActive: true,
  // Rien n'y est encore rattaché : le bail vient d'être créé.
  sites: [],
  // Le paiement ci-dessous est un BROUILLON : tant qu'il n'est pas validé,
  // rien ne bouge au compte du bailleur (§2 et §3.3 du modèle).
  accountBalance: 0
};

const PAIEMENTS_BINGERVILLE: LandLeasePayment[] = [
  {
    id: 'paiement-bingerville-01',
    landLeaseId: BAIL_BINGERVILLE.id,
    landlordName: BAIL_BINGERVILLE.landlordName,
    paymentDate: '2026-09-01',
    amount: ANNUEL_BINGERVILLE,
    currency: 'XOF',
    coverageStartDate: '2026-09-01',
    coverageEndDate: '2027-08-31',
    status: 'DRAFT',
    createdByLabel: 'Ibrahima Yao',
    validatedAt: null
  }
];

// ---------------------------------------------------------------------------

const BAUX: LandLease[] = [BAIL_RIVIERA, BAIL_PORT_BOUET, BAIL_BINGERVILLE];

const PAIEMENTS_PAR_BAIL: Record<string, LandLeasePayment[]> = {
  [BAIL_RIVIERA.id]: PAIEMENTS_RIVIERA,
  [BAIL_PORT_BOUET.id]: PAIEMENTS_PORT_BOUET,
  [BAIL_BINGERVILLE.id]: PAIEMENTS_BINGERVILLE
};

const ACCRUALS_PAR_BAIL: Record<string, LandLeaseAccrual[]> = {
  [BAIL_RIVIERA.id]: ACCRUALS_RIVIERA,
  [BAIL_PORT_BOUET.id]: ACCRUALS_PORT_BOUET,
  [BAIL_BINGERVILLE.id]: []
};

export function repondreLot4(chemin: string, scenario: Scenario): unknown | null {
  // --- Rattachement d'un chantier (pas de collision : aucun GET sur ce chemin) ---
  if (/\/tenants\/[^/]+\/finance\/sites\/[^/]+\/land-lease$/.test(chemin)) {
    return { success: true, data: BAIL_RIVIERA };
  }

  // --- Le bail (détail) ----------------------------------------------------
  const detailMatch = /\/tenants\/[^/]+\/finance\/land-leases\/([^/]+)$/.exec(chemin);
  if (detailMatch) {
    const bail = BAUX.find(candidat => candidat.id === detailMatch[1]) ?? BAUX[0];
    return { success: true, data: bail };
  }

  // --- Liste ET création partagent leur chemin (voir l'en-tête) -----------
  if (/\/tenants\/[^/]+\/finance\/land-leases$/.test(chemin)) {
    return { success: true, data: scenario === 'vide' ? [] : BAUX };
  }

  // --- Validation d'un paiement ---------------------------------------------
  if (/\/tenants\/[^/]+\/finance\/land-lease-payments\/[^/]+\/validate$/.test(chemin)) {
    // Le seul brouillon du jeu d'essai : c'est celui qu'un geste de
    // validation, dans l'atelier, ferait réellement passer d'un état à
    // l'autre.
    return {
      success: true,
      data: { ...PAIEMENTS_BINGERVILLE[0], status: 'VALIDATED' as const, validatedAt: new Date().toISOString() }
    };
  }

  // --- Paiements d'un bail (liste ET création partagent leur chemin) -------
  const paiementsMatch = /\/tenants\/[^/]+\/finance\/land-leases\/([^/]+)\/payments$/.exec(chemin);
  if (paiementsMatch) {
    const bailId = paiementsMatch[1];
    const liste = bailId in PAIEMENTS_PAR_BAIL ? PAIEMENTS_PAR_BAIL[bailId] : PAIEMENTS_RIVIERA;
    return { success: true, data: scenario === 'vide' ? [] : liste };
  }

  // --- Constatation manuelle (pas de collision : la liste vit sur le même
  // chemin, mais l'atelier ne distingue pas GET de POST — voir l'en-tête ;
  // câbler cette action ne se démontre donc pas de bout en bout ici) --------

  // --- Constatations d'un bail (liste) --------------------------------------
  const accrualsMatch = /\/tenants\/[^/]+\/finance\/land-leases\/([^/]+)\/accruals$/.exec(chemin);
  if (accrualsMatch) {
    const bailId = accrualsMatch[1];
    const liste = bailId in ACCRUALS_PAR_BAIL ? ACCRUALS_PAR_BAIL[bailId] : ACCRUALS_RIVIERA;
    return { success: true, data: scenario === 'vide' ? [] : liste };
  }

  return null;
}
