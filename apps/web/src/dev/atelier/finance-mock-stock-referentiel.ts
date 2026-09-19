/**
 * Atelier — fausse API du lot 5, premier sous-lot : le référentiel du stock.
 *
 * Modèle exact de `finance-mock-contractors.ts` : ce fichier appartient en
 * entier à l'agent qui construit cet écran, jeux d'essai ET réponses. Il
 * renvoie `null` quand l'URL ne le concerne pas ; `mock-api.ts` passe alors au
 * gestionnaire suivant.
 *
 * **Non câblé dans `mock-api.ts`.** Cet agent ne modifie que les fichiers de
 * son périmètre ; `mock-api.ts` — le registre qui ajoute chaque `repondreXxx`
 * à la liste consultée par l'adaptateur — est un fichier-registre réservé au
 * superviseur. `repondreStockReferentiel` est prêt à y être ajouté, sur le
 * même modèle que `repondreContractors` :
 *
 * ```ts
 * import { repondreStockReferentiel } from './finance-mock-stock-referentiel';
 * // dans la liste `for (const repondre of [...])` :
 * repondreStockReferentiel
 * ```
 *
 * ---------------------------------------------------------------------------
 * Les cas montrés, et pourquoi chacun est là
 * ---------------------------------------------------------------------------
 *
 * **Articles** — quatre, choisis pour exercer chacune des règles de l'écran :
 *
 * - **CIM-42, ciment** — actif, avec un **poste proposé** (« Gros œuvre »).
 *   Le cas qui doit se lire « poste *proposé* à la sortie », jamais « poste de
 *   dépense » : il n'a aucune autorité, et la sortie exigera le sien.
 * - **FER-12, fer à béton** — actif, **sans poste proposé**. C'est un cas
 *   NORMAL, pas une donnée manquante : l'écran doit le dire ainsi.
 * - **SAB-00, sable lavé** — actif, sans famille non plus : le minimum que le
 *   contrat exige (référence, désignation, unité).
 * - **TOL-BA, tôle bac alu** — **désactivé**. Il n'apparaît qu'avec le filtre
 *   « actifs uniquement » décoché, ce qui rend ce filtre démontrable, et il
 *   rappelle que désactiver n'est pas supprimer : son stock et son historique
 *   sont intacts.
 *
 * **Lieux** — trois, pour les trois cas du contrat :
 *
 * - **Magasin central de Kipé** — un `WAREHOUSE`, `siteId` et `siteLabel`
 *   nuls. Le cas où le formulaire ne doit montrer aucun sélecteur de chantier.
 * - **Dépôt de la Villa de Nongo** — un `SITE`, rattaché à un chantier. Un
 *   chantier n'a qu'un lieu : en créer un second sur « chantier-nongo » doit
 *   être refusé.
 * - **Ancien dépôt de Ratoma** — un `SITE` **désactivé**, sur un autre
 *   chantier. Il occupe toujours son chantier, désactivé ou non.
 *
 * **Méthode de valorisation** — une décision **arrêtée, datée et motivée**,
 * pour que l'écran montre autre chose qu'un défaut muet. Le scénario « vide »
 * rend au contraire `decisionNote: null` : c'est l'agence qui n'a jamais
 * ouvert cet écran, à qui le coût moyen pondéré s'applique en silence — et
 * l'écran doit le dire plutôt que d'afficher un blanc.
 *
 * Les chantiers et postes sont repris par leur libellé, jamais réimportés de
 * `fixtures.ts` ni de `finance-mock-chantiers.ts` : ces fichiers appartiennent
 * à d'autres agents, même raison qu'aux sous-lots précédents.
 *
 * **Limite assumée, identique à celle de `finance-mock-contractors.ts`.**
 * `mock-api.ts` route par le seul CHEMIN, jamais par la méthode, et ne
 * transmet pas les paramètres de requête : les paires GET liste / POST
 * création qui partagent un chemin (`stock/items`, `stock/locations`)
 * retombent donc sur la même branche et rendent la forme de la LISTE quel que
 * soit le verbe, sans filtrer sur `onlyActive`, `search` ni `kind`. Les
 * créations, les corrections et les filtres sont couverts par les tests
 * d'écran, service réel et `apiClient` simulé
 * (`__tests__/finance/stock-referentiel.test.tsx`).
 */

import type { StockItem, StockLocation, StockSettings } from '../../types/finance-stock-referentiel-types';
import type { Scenario } from './mock-api';

const AGENCE = 'agence-1';

// ---------------------------------------------------------------------------
// Les articles
// ---------------------------------------------------------------------------

const CIMENT = 'article-ciment-01';
const FER = 'article-fer-02';
const SABLE = 'article-sable-03';
const TOLE = 'article-tole-04';

const ARTICLES: StockItem[] = [
  {
    id: CIMENT,
    tenantId: AGENCE,
    reference: 'CIM-42',
    label: 'Ciment CPJ 42,5',
    unit: 'sac',
    category: 'Gros œuvre',
    // Un poste PROPOSÉ : pré-sélectionné à la sortie, modifiable à cet
    // instant, sans aucune autorité sur elle.
    defaultCostCategoryId: 'poste-gros-oeuvre',
    defaultCostCategoryLabel: 'Gros œuvre',
    isActive: true
  },
  {
    id: FER,
    tenantId: AGENCE,
    reference: 'FER-12',
    label: 'Fer à béton HA 12',
    unit: 'barre',
    category: 'Gros œuvre',
    // AUCUN poste proposé, et c'est un cas normal : la sortie demandera le
    // sien, comme pour tout article.
    defaultCostCategoryId: null,
    defaultCostCategoryLabel: null,
    isActive: true
  },
  {
    id: SABLE,
    tenantId: AGENCE,
    reference: 'SAB-00',
    label: 'Sable lavé',
    // Le PRD donne « m³ » en exemple d'unité : texte libre, jamais une
    // énumération.
    unit: 'm³',
    category: null,
    defaultCostCategoryId: null,
    defaultCostCategoryLabel: null,
    isActive: true
  },
  {
    id: TOLE,
    tenantId: AGENCE,
    reference: 'TOL-BA',
    label: 'Tôle bac alu 6 m',
    unit: 'tôle',
    category: 'Couverture',
    defaultCostCategoryId: 'poste-couverture',
    defaultCostCategoryLabel: 'Couverture',
    // DÉSACTIVÉ : il garde son stock et son historique, il cesse seulement
    // d'être proposé. Rien ne le supprime.
    isActive: false
  }
];

// ---------------------------------------------------------------------------
// Les lieux de stockage
// ---------------------------------------------------------------------------

const MAGASIN = 'lieu-magasin-01';
const DEPOT_NONGO = 'lieu-nongo-02';
const DEPOT_RATOMA = 'lieu-ratoma-03';

const LIEUX: StockLocation[] = [
  {
    id: MAGASIN,
    tenantId: AGENCE,
    kind: 'WAREHOUSE',
    label: 'Magasin central de Kipé',
    // Un magasin n'a pas de chantier, et le serveur refuse `siteId` pour
    // cette nature plutôt que de l'ignorer.
    siteId: null,
    siteLabel: null,
    isActive: true
  },
  {
    id: DEPOT_NONGO,
    tenantId: AGENCE,
    kind: 'SITE',
    label: 'Dépôt de la Villa de Nongo',
    siteId: 'chantier-nongo',
    siteLabel: 'Villa de Nongo',
    isActive: true
  },
  {
    id: DEPOT_RATOMA,
    tenantId: AGENCE,
    kind: 'SITE',
    label: 'Ancien dépôt de Ratoma',
    siteId: 'chantier-ratoma',
    siteLabel: 'Résidence Ratoma',
    // Désactivé, et il occupe pourtant toujours son chantier : un second lieu
    // y serait refusé.
    isActive: false
  }
];

// ---------------------------------------------------------------------------
// La méthode de valorisation
// ---------------------------------------------------------------------------

/** Une décision arrêtée, datée et motivée — ce que le besoin S5 demande. */
const REGLAGES: StockSettings = {
  tenantId: AGENCE,
  valuationMethod: 'WEIGHTED_AVERAGE',
  decidedAt: '2026-03-12T10:30:00.000Z',
  decisionNote:
    'Décision du comité de gestion du 12 mars 2026 : coût moyen pondéré retenu pour tous les chantiers, les prix du ciment variant trop d’une réception à l’autre pour qu’un coût par lot soit tenable.'
};

/**
 * L'agence qui n'a jamais ouvert cet écran : la méthode par défaut s'applique
 * en silence, sans motif. L'écran doit le dire, pas afficher un blanc.
 */
const REGLAGES_PAR_DEFAUT: StockSettings = {
  tenantId: AGENCE,
  valuationMethod: 'WEIGHTED_AVERAGE',
  decidedAt: '2026-01-01T00:00:00.000Z',
  decisionNote: null
};

export function repondreStockReferentiel(chemin: string, scenario: Scenario): unknown | null {
  // --- La méthode de valorisation. Montée AVANT `stock/items/:itemId` par
  //     prudence de lecture : ici les chemins ne se recouvrent pas, mais
  //     l'ordre « littéral avant paramétré » est tenu partout, comme côté
  //     serveur.
  if (/\/tenants\/[^/]+\/finance\/stock\/settings$/.test(chemin)) {
    return { success: true, data: scenario === 'vide' ? REGLAGES_PAR_DEFAUT : REGLAGES };
  }

  // --- Liste des articles ET enregistrement partagent leur chemin ----------
  if (/\/tenants\/[^/]+\/finance\/stock\/items$/.test(chemin)) {
    return { success: true, data: scenario === 'vide' ? [] : ARTICLES };
  }

  // --- Détail et correction d'un article ----------------------------------
  const articleMatch = /\/tenants\/[^/]+\/finance\/stock\/items\/([^/]+)$/.exec(chemin);
  if (articleMatch) {
    const article = ARTICLES.find(candidat => candidat.id === articleMatch[1]) ?? ARTICLES[0];
    return { success: true, data: article };
  }

  // --- Liste des lieux ET création partagent leur chemin -------------------
  if (/\/tenants\/[^/]+\/finance\/stock\/locations$/.test(chemin)) {
    return { success: true, data: scenario === 'vide' ? [] : LIEUX };
  }

  // --- Correction d'un lieu ------------------------------------------------
  const lieuMatch = /\/tenants\/[^/]+\/finance\/stock\/locations\/([^/]+)$/.exec(chemin);
  if (lieuMatch) {
    const lieu = LIEUX.find(candidat => candidat.id === lieuMatch[1]) ?? LIEUX[0];
    return { success: true, data: lieu };
  }

  return null;
}
