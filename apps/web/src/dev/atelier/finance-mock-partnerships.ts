/**
 * Atelier — fausse API du lot 4, sous-lot « associations ».
 *
 * Modèle exact de `finance-mock-lot4.ts` : ce fichier appartient en entier à
 * l'agent qui construit ces écrans, jeux d'essai ET réponses. Il renvoie
 * `null` quand l'URL ne le concerne pas ; `mock-api.ts` passe alors au
 * gestionnaire suivant.
 *
 * **Non câblé dans `mock-api.ts`.** Cet agent ne modifie que les fichiers de
 * son périmètre ; `mock-api.ts` — le registre qui ajoute chaque `repondreXxx`
 * à la liste consultée par l'adaptateur — n'en fait pas partie.
 * `repondrePartnerships` est prêt à y être ajouté, sur le même modèle que
 * `repondreLot4` :
 *
 * ```ts
 * import { repondrePartnerships } from './finance-mock-partnerships';
 * // dans la liste `for (const repondre of [...])` :
 * repondrePartnerships
 * ```
 *
 * **Trois associations, trois moments du besoin B9 du PRD** :
 *
 * - `assoc-riviera-01` (Kouadio / Kouassi) totalise CENT pour cent de quotes-parts :
 *   `companySharePercent` vaut zéro. C'est le cas que l'écran ne doit jamais
 *   taire — voir `pages/finance/Association.tsx`. Rattachée au bien `'5'`
 *   (« Terrain 600 m² » de `fixtures.ts`), repris par son identifiant plutôt
 *   que réimporté : les deux fichiers appartiennent à des agents différents,
 *   même raison qu'au sous-lot 1 pour le chantier partagé.
 * - `assoc-port-bouet-01` (Konan) ne totalise que quarante-cinq pour cent : c'est le
 *   cas nominal où il reste bien quelque chose à l'agence (55 %). Rattachée au
 *   bien `'3'` (« Bureau Treichville »).
 * - `assoc-bingerville-01` vient d'être créée, sans aucun associé ni bien : le cas
 *   qui exerce le formulaire d'ajout du premier associé et le message
 *   « aucun associé ».
 *
 * **Limite assumée, identique à celle de `finance-mock-lot4.ts`.**
 * `mock-api.ts` route par le seul CHEMIN, jamais par la méthode : les paires
 * GET liste / POST création qui partagent un chemin (`partnerships`)
 * retombent donc sur la même branche et rendent la forme de la LISTE quel
 * que soit le verbe. La création n'est donc démontrable de bout en bout dans
 * l'atelier que pour les chemins qui n'ont pas ce collisionnement (l'ajout
 * d'un associé, le retrait, le rattachement d'un bien, le relevé) ; la
 * création d'une association elle-même est couverte par les tests unitaires
 * de l'écran, service mocké.
 */

import type { Partnership, PartnerStatement } from '../../types/finance-partnerships-types';
import type { Scenario } from './mock-api';

// ---------------------------------------------------------------------------
// Association 1 — cent pour cent des quotes-parts, rien pour l'agence
// ---------------------------------------------------------------------------

const PART_RIVIERA_KOUADIO = 'part-riviera-kouadio';
const PART_RIVIERA_KOUASSI = 'part-riviera-kouassi';

const ASSOC_RIVIERA: Partnership = {
  id: 'assoc-riviera-01',
  tenantId: 'agence-1',
  label: 'Villa de la Riviera — indivision Kouadio / Kouassi',
  isActive: true,
  shares: [
    { id: PART_RIVIERA_KOUADIO, partnerAccountId: 'compte-kouadio', partnerName: 'Mamadou Kouadio', sharePercent: 60 },
    { id: PART_RIVIERA_KOUASSI, partnerAccountId: 'compte-kouassi', partnerName: 'Fatoumata Kouassi', sharePercent: 40 }
  ],
  totalSharePercent: 100,
  // Cent pour cent de quotes-parts : rien ne reste à l'agence. Le cas que
  // l'écran doit rendre lisible, pas taire — voir l'en-tête de ce fichier.
  companySharePercent: 0,
  properties: [{ propertyId: '5', propertyLabel: 'Terrain 600 m²' }]
};

// ---------------------------------------------------------------------------
// Association 2 — cas nominal, il reste bien quelque chose à l'agence
// ---------------------------------------------------------------------------

const PART_PORT_BOUET_KONAN = 'part-port-bouet-konan';

const ASSOC_PORT_BOUET: Partnership = {
  id: 'assoc-port-bouet-01',
  tenantId: 'agence-1',
  label: 'Bureau Treichville — association Konan',
  isActive: true,
  shares: [
    { id: PART_PORT_BOUET_KONAN, partnerAccountId: 'compte-konan', partnerName: 'Ousmane Konan', sharePercent: 45 }
  ],
  totalSharePercent: 45,
  companySharePercent: 55,
  properties: [{ propertyId: '3', propertyLabel: 'Bureau Treichville' }]
};

// ---------------------------------------------------------------------------
// Association 3 — tout juste créée, sans associé ni bien
// ---------------------------------------------------------------------------

const ASSOC_BINGERVILLE: Partnership = {
  id: 'assoc-bingerville-01',
  tenantId: 'agence-1',
  label: 'Terrain de Bingerville — association à constituer',
  isActive: true,
  shares: [],
  totalSharePercent: 0,
  // Aucun associé : la totalité resterait à l'agence si un bien lui était
  // rattaché aujourd'hui.
  companySharePercent: 100,
  properties: []
};

const ASSOCIATIONS: Partnership[] = [ASSOC_RIVIERA, ASSOC_PORT_BOUET, ASSOC_BINGERVILLE];

// ---------------------------------------------------------------------------
// L'état de quote-part — un relevé par part, pour la démonstration du geste
// « Voir l'état » depuis la fiche
// ---------------------------------------------------------------------------

const RELEVES_PAR_PART: Record<string, PartnerStatement> = {
  [PART_RIVIERA_KOUADIO]: {
    partnershipShareId: PART_RIVIERA_KOUADIO,
    partnerName: 'Mamadou Kouadio',
    sharePercent: 60,
    lines: [
      {
        propertyLabel: 'Terrain 600 m²',
        periodYear: 2026,
        periodMonth: 8,
        rentBilled: 500_000,
        rentCollected: 500_000,
        partnerShare: 300_000
      },
      {
        propertyLabel: 'Terrain 600 m²',
        periodYear: 2026,
        periodMonth: 9,
        rentBilled: 500_000,
        rentCollected: 350_000,
        partnerShare: 300_000
      }
    ],
    totalShare: 600_000,
    // Volontairement inférieur à `totalShare` : c'est ce qui reste dû à
    // l'associé, un solde que ce relevé ne recalcule pas (voir le contrat
    // gelé, `PartnerStatementRecord.totalPaidOut`).
    totalPaidOut: 450_000,
    // Volontairement DIFFERENT de `totalShare - totalPaidOut` (150 000).
    // Le releve est borne a deux mois ; le solde du compte court sur toute
    // l'histoire, et porte 60 000 de plus, restes d'un mois anterieur. Des
    // chiffres qui coincideraient laisseraient croire que l'un se deduit de
    // l'autre — c'est precisement ce que ce champ existe pour dementir.
    accountBalance: 210_000,
    currency: 'XOF'
  },
  [PART_RIVIERA_KOUASSI]: {
    partnershipShareId: PART_RIVIERA_KOUASSI,
    partnerName: 'Fatoumata Kouassi',
    sharePercent: 40,
    lines: [
      {
        propertyLabel: 'Terrain 600 m²',
        periodYear: 2026,
        periodMonth: 8,
        rentBilled: 500_000,
        rentCollected: 500_000,
        partnerShare: 200_000
      },
      {
        propertyLabel: 'Terrain 600 m²',
        periodYear: 2026,
        periodMonth: 9,
        rentBilled: 500_000,
        rentCollected: 350_000,
        partnerShare: 200_000
      }
    ],
    totalShare: 400_000,
    totalPaidOut: 400_000,
    // Soldee : rien ne lui reste du, ni sur la periode ni avant.
    accountBalance: 0,
    currency: 'XOF'
  },
  [PART_PORT_BOUET_KONAN]: {
    partnershipShareId: PART_PORT_BOUET_KONAN,
    partnerName: 'Ousmane Konan',
    sharePercent: 45,
    lines: [
      {
        propertyLabel: 'Bureau Treichville',
        periodYear: 2026,
        periodMonth: 9,
        rentBilled: 3_200_000,
        rentCollected: 3_200_000,
        partnerShare: 1_440_000
      }
    ],
    totalShare: 1_440_000,
    totalPaidOut: 0,
    // Rien ne lui a encore ete reverse : le solde vaut sa quote-part entiere.
    accountBalance: 1_440_000,
    currency: 'XOF'
  }
};

export function repondrePartnerships(chemin: string, scenario: Scenario): unknown | null {
  // --- Ajout d'un associé (pas de collision : aucun GET sur ce chemin) -----
  const ajoutMatch = /\/tenants\/[^/]+\/finance\/partnerships\/([^/]+)\/shares$/.exec(chemin);
  if (ajoutMatch) {
    const association = ASSOCIATIONS.find(candidate => candidate.id === ajoutMatch[1]) ?? ASSOC_RIVIERA;
    return { success: true, data: association };
  }

  // --- Retrait d'un associé (pas de collision : DELETE, chemin distinct) ---
  const retraitMatch = /\/tenants\/[^/]+\/finance\/partnership-shares\/([^/]+)$/.exec(chemin);
  if (retraitMatch && !chemin.endsWith('/statement')) {
    const association =
      ASSOCIATIONS.find(candidate => candidate.shares.some(share => share.id === retraitMatch[1])) ?? ASSOC_RIVIERA;
    return { success: true, data: association };
  }

  // --- Relevé d'une part (état de quote-part, lecture seule) --------------
  const releveMatch = /\/tenants\/[^/]+\/finance\/partnership-shares\/([^/]+)\/statement$/.exec(chemin);
  if (releveMatch) {
    const releve = RELEVES_PAR_PART[releveMatch[1]] ?? RELEVES_PAR_PART[PART_RIVIERA_KOUADIO];
    return { success: true, data: releve };
  }

  // --- Rattachement / détachement d'un bien (pas de collision) -------------
  if (/\/tenants\/[^/]+\/finance\/properties\/[^/]+\/partnership$/.test(chemin)) {
    return { success: true, data: ASSOC_RIVIERA };
  }

  // --- L'association (détail) ----------------------------------------------
  const detailMatch = /\/tenants\/[^/]+\/finance\/partnerships\/([^/]+)$/.exec(chemin);
  if (detailMatch) {
    const association = ASSOCIATIONS.find(candidate => candidate.id === detailMatch[1]) ?? ASSOCIATIONS[0];
    return { success: true, data: association };
  }

  // --- Liste ET création partagent leur chemin (voir l'en-tête) -----------
  if (/\/tenants\/[^/]+\/finance\/partnerships$/.test(chemin)) {
    return { success: true, data: scenario === 'vide' ? [] : ASSOCIATIONS };
  }

  return null;
}
