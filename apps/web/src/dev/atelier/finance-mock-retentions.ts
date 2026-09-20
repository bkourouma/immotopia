/**
 * Atelier — fausse API du lot 4, cinquième sous-lot : les retenues de
 * garantie.
 *
 * Modèle exact de `finance-mock-contractors.ts` : ce fichier appartient en
 * entier à l'agent qui construit cet écran, jeux d'essai ET réponses. Il
 * renvoie `null` quand l'URL ne le concerne pas ; `mock-api.ts` passe alors au
 * gestionnaire suivant.
 *
 * **Non câblé dans `mock-api.ts`.** Cet agent ne modifie que les fichiers de
 * son périmètre ; `mock-api.ts` — le registre qui ajoute chaque `repondreXxx`
 * à la liste consultée par l'adaptateur — est un fichier-registre réservé au
 * superviseur. `repondreRetentions` est prêt à y être ajouté, sur le même
 * modèle que `repondreLot4` :
 *
 * ```ts
 * import { repondreRetentions } from './finance-mock-retentions';
 * // dans la liste `for (const repondre of [...])` :
 * repondreRetentions
 * ```
 *
 * ---------------------------------------------------------------------------
 * Les cinq cas montrés, et pourquoi chacun est là
 * ---------------------------------------------------------------------------
 *
 * - **`ret-facture-riviera`** — sur une FACTURE FOURNISSEUR, détenue, libération
 *   prévue au 31/03/2027 : **dans les temps**. Le cas tranquille, celui qui
 *   n'appelle aucune action et qui doit le rester à l'écran.
 * - **`ret-situation-kouadio`** — sur une SITUATION DE TÂCHERON, détenue,
 *   libération prévue au 30/06/2026 : **en retard**. C'est le cas qui alimente
 *   le seul chiffre du résumé qui appelle une action.
 * - **`ret-facture-treichville`** — sur une facture **sans chantier**
 *   (`siteLabel: null`), détenue et **en retard** elle aussi : l'écran doit
 *   écrire « Hors chantier » plutôt que laisser une case vide, et le filtre
 *   par chantier ne doit pas la faire disparaître par accident.
 * - **`ret-situation-koffi`** — sur une situation, **déjà libérée** le
 *   01/09/2026 : l'argent est redevenu exigible, et aucun versement n'est né
 *   ici. La ligne ne propose plus de geste.
 * - **`ret-facture-toure`** — sur une facture, **déjà libérée** : le second
 *   libéré, pour que la carte « Déjà libéré » ne repose pas sur une seule
 *   ligne.
 *
 * Les taux sont volontairement différents (5 %, 10 %, 7,5 %) : un écran qui
 * afficherait le taux à la place du montant, ou l'inverse, se verrait tout de
 * suite.
 *
 * **Les montants ne se déduisent pas les uns des autres à l'écran.** Le résumé
 * ci-dessous est cohérent avec les cinq lignes, mais il est ÉCRIT, pas
 * calculé : c'est ainsi que le vrai serveur l'émet, et un écran qui
 * l'additionnerait lui-même ne se verrait pas ici.
 *
 * Les chantiers, fournisseurs et tâcherons sont repris par leur LIBELLÉ, sans
 * réimporter `fixtures.ts`, `finance-mock-chantiers.ts` ni
 * `finance-mock-contractors.ts` : ces fichiers appartiennent à d'autres
 * agents, même raison qu'aux sous-lots précédents. Les identifiants de
 * chantier reprennent en revanche ceux de `finance-mock-chantiers.ts`
 * (`chantier-01`, `chantier-riche-01`), pour que le filtre par chantier de
 * l'écran ait une chance de correspondre à quelque chose.
 *
 * **Limite assumée, identique à celle des autres fausses API du module.**
 * `mock-api.ts` route par le seul CHEMIN, jamais par la méthode, et ne
 * transmet pas la chaîne de requête. Deux conséquences :
 *
 * - `GET /retentions` (liste) et `POST /retentions` (pose) partagent leur
 *   chemin : la liste l'emporte, et la pose n'est donc pas démontrable de bout
 *   en bout dans l'atelier. Elle est couverte par les tests d'écran, service
 *   réel et `apiClient` simulé.
 * - les filtres (`status`, `siteId`, `dueBefore`) ne parviennent pas jusqu'ici :
 *   la liste rend les cinq retenues quel que soit l'état des filtres. L'écran
 *   en montre donc plus que le vrai serveur n'en renverrait.
 *
 * La LIBÉRATION, elle, a son propre chemin (`/retentions/{id}/release`) et est
 * pleinement démontrable : elle rend la retenue au statut `RELEASED`.
 */

import type { RetentionGuarantee, RetentionSummary } from '../../types/finance-retentions-types';
import type { Scenario } from './mock-api';

// ---------------------------------------------------------------------------
// 1. Détenue, dans les temps, sur une facture fournisseur
// ---------------------------------------------------------------------------

const RET_FACTURE_RIVIERA: RetentionGuarantee = {
  id: 'ret-facture-riviera',
  tenantId: 'agence-demo',
  sourceType: 'SUPPLIER_INVOICE',
  sourceId: 'facture-riviera-014',
  sourceLabel: 'Facture F-2026-014',
  thirdPartyLabel: 'Quincaillerie du Niger',
  thirdPartyAccountId: 'compte-quincaillerie',
  siteId: 'chantier-riche-01',
  siteLabel: 'Villa de la Riviera',
  // L'ASSIETTE, pas un coût de chantier : la facture reste imputée pour ces
  // 12 000 000 entiers, retenue ou non.
  baseAmount: 12_000_000,
  ratePercent: 5,
  amount: 600_000,
  currency: 'XOF',
  plannedReleaseDate: '2027-03-31T00:00:00.000Z',
  status: 'HELD',
  releasedAt: null,
  createdAt: '2026-09-10T09:15:00.000Z'
};

// ---------------------------------------------------------------------------
// 2. Détenue, EN RETARD, sur une situation de tâcheron
// ---------------------------------------------------------------------------

const RET_SITUATION_KOUADIO: RetentionGuarantee = {
  id: 'ret-situation-kouadio',
  tenantId: 'agence-demo',
  sourceType: 'PROGRESS_STATEMENT',
  sourceId: 'situation-kouadio-03',
  sourceLabel: 'Situation n°3 — marché MAÇ-2026-07',
  thirdPartyLabel: 'Sékou Kouadio',
  thirdPartyAccountId: 'compte-kouadio',
  siteId: 'chantier-01',
  siteLabel: 'Résidence Angré',
  baseAmount: 7_500_000,
  ratePercent: 10,
  amount: 750_000,
  currency: 'XOF',
  // Dépassée : c'est elle qui fait monter « En retard » dans le résumé.
  plannedReleaseDate: '2026-06-30T00:00:00.000Z',
  status: 'HELD',
  releasedAt: null,
  createdAt: '2026-01-15T11:00:00.000Z'
};

// ---------------------------------------------------------------------------
// 3. Détenue, EN RETARD, sur une facture SANS CHANTIER
// ---------------------------------------------------------------------------

const RET_FACTURE_TREICHVILLE: RetentionGuarantee = {
  id: 'ret-facture-treichville',
  tenantId: 'agence-demo',
  sourceType: 'SUPPLIER_INVOICE',
  sourceId: 'facture-treichville-221',
  sourceLabel: 'Facture F-2026-221',
  thirdPartyLabel: 'Électricité Générale Treichville',
  thirdPartyAccountId: 'compte-elec-treichville',
  // Une facture peut n'être rattachée à aucun chantier : l'écran écrit
  // « Hors chantier », il ne laisse pas la case vide.
  siteId: null,
  siteLabel: null,
  baseAmount: 3_200_000,
  ratePercent: 5,
  amount: 160_000,
  currency: 'XOF',
  plannedReleaseDate: '2026-08-15T00:00:00.000Z',
  status: 'HELD',
  releasedAt: null,
  createdAt: '2026-02-20T08:30:00.000Z'
};

// ---------------------------------------------------------------------------
// 4. DÉJÀ LIBÉRÉE, sur une situation de tâcheron
// ---------------------------------------------------------------------------

const RET_SITUATION_KOFFI: RetentionGuarantee = {
  id: 'ret-situation-koffi',
  tenantId: 'agence-demo',
  sourceType: 'PROGRESS_STATEMENT',
  sourceId: 'situation-koffi-02',
  sourceLabel: 'Situation n°2 — marché CHA-2025-11',
  thirdPartyLabel: 'Mamadou Koffi',
  thirdPartyAccountId: 'compte-koffi',
  siteId: 'chantier-01',
  siteLabel: 'Résidence Angré',
  baseAmount: 4_000_000,
  ratePercent: 7.5,
  amount: 300_000,
  currency: 'XOF',
  plannedReleaseDate: '2026-08-31T00:00:00.000Z',
  status: 'RELEASED',
  // Libérée : le montant est redevenu exigible. Rien n'est sorti de la caisse
  // ici — le versement, s'il a eu lieu, vit sur la fiche du tâcheron.
  releasedAt: '2026-09-01T10:05:00.000Z',
  createdAt: '2025-11-05T14:20:00.000Z'
};

// ---------------------------------------------------------------------------
// 5. DÉJÀ LIBÉRÉE, sur une facture fournisseur
// ---------------------------------------------------------------------------

const RET_FACTURE_TOURE: RetentionGuarantee = {
  id: 'ret-facture-toure',
  tenantId: 'agence-demo',
  sourceType: 'SUPPLIER_INVOICE',
  sourceId: 'facture-toure-088',
  sourceLabel: 'Facture F-2025-088',
  thirdPartyLabel: 'Menuiserie Touré',
  thirdPartyAccountId: 'compte-toure',
  siteId: 'chantier-riche-01',
  siteLabel: 'Villa de la Riviera',
  baseAmount: 2_000_000,
  ratePercent: 5,
  amount: 100_000,
  currency: 'XOF',
  plannedReleaseDate: '2026-05-31T00:00:00.000Z',
  status: 'RELEASED',
  releasedAt: '2026-06-02T16:40:00.000Z',
  createdAt: '2025-06-01T09:00:00.000Z'
};

const RETENUES: RetentionGuarantee[] = [
  RET_FACTURE_RIVIERA,
  RET_SITUATION_KOUADIO,
  RET_FACTURE_TREICHVILLE,
  RET_SITUATION_KOFFI,
  RET_FACTURE_TOURE
];

/**
 * Le résumé, tel que le serveur l'émet : **écrit, pas déduit**.
 *
 * Détenu = 600 000 + 750 000 + 160 000. Libéré = 300 000 + 100 000. En retard
 * = les deux détenues dont la date est passée, soit 750 000 + 160 000 sur deux
 * lignes. Les chiffres concordent avec les cinq retenues ci-dessus, mais
 * l'écran ne doit jamais les recalculer : ils portent sur l'ensemble des
 * retenues de l'agence, pas sur la page affichée.
 */
const RESUME: RetentionSummary = {
  totalHeld: 1_510_000,
  totalReleased: 400_000,
  overdueHeld: 910_000,
  overdueCount: 2,
  currency: 'XOF'
};

/** Un portefeuille qui n'a encore rien retenu : tout à zéro, et rien d'anormal. */
const RESUME_VIDE: RetentionSummary = {
  totalHeld: 0,
  totalReleased: 0,
  overdueHeld: 0,
  overdueCount: 0,
  currency: 'XOF'
};

export function repondreRetentions(chemin: string, scenario: Scenario): unknown | null {
  // --- Libération (chemin propre, aucune collision) ------------------------
  const liberationMatch = /\/tenants\/[^/]+\/finance\/retentions\/([^/]+)\/release$/.exec(chemin);
  if (liberationMatch) {
    const retenue = RETENUES.find(candidate => candidate.id === liberationMatch[1]) ?? RET_SITUATION_KOUADIO;
    // Libérer ne crée aucun versement : seuls le statut et l'instant changent.
    return {
      success: true,
      data: { ...retenue, status: 'RELEASED', releasedAt: new Date().toISOString() }
    };
  }

  // --- Résumé -------------------------------------------------------------
  //
  // MONTÉ AVANT LE DÉTAIL, et l'ordre est la seule chose qui l'en protège :
  // `/retentions/summary` correspond aussi au motif `/retentions/{id}`, qui
  // rendrait alors une retenue là où l'écran attend un résumé. Le vrai routeur
  // (`packages/api/src/routes/finance-retentions-routes.ts`) porte le même
  // avertissement, pour la même raison.
  if (/\/tenants\/[^/]+\/finance\/retentions\/summary$/.test(chemin)) {
    return { success: true, data: scenario === 'vide' ? RESUME_VIDE : RESUME };
  }

  // --- Détail d'une retenue ------------------------------------------------
  const detailMatch = /\/tenants\/[^/]+\/finance\/retentions\/([^/]+)$/.exec(chemin);
  if (detailMatch) {
    const retenue = RETENUES.find(candidate => candidate.id === detailMatch[1]) ?? RETENUES[0];
    return { success: true, data: retenue };
  }

  // --- Liste ET pose partagent leur chemin (voir l'en-tête) ---------------
  if (/\/tenants\/[^/]+\/finance\/retentions$/.test(chemin)) {
    return { success: true, data: scenario === 'vide' ? [] : RETENUES };
  }

  return null;
}
