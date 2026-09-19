import type { AxiosAdapter, AxiosRequestConfig, AxiosResponse } from 'axios';
import apiClient from '../../utils/api-client';
import {
  BIENS,
  COMMUNES,
  ECHEANCES,
  PENALITES,
  PAIEMENTS,
  DOCUMENTS,
  MODELES_DOCUMENTS,
  EVENEMENTS,
  TRAVAUX,
  APERCU_PATRIMOINE,
  TABLEAU_DE_BORD,
  APPARTEMENTS
} from './fixtures';
import { repondreBalances } from './finance-mock-balances';
import { repondreReleve } from './finance-mock-releve';
import { repondreCampagne } from './finance-mock-campagne';
import { repondreFournisseurs } from './finance-mock-fournisseurs';
import { repondreChantiers } from './finance-mock-chantiers';
import { repondreValidation } from './finance-mock-validation';
import { repondreLot3 } from './finance-mock-lot3';

/**
 * Fausse API de l'atelier.
 *
 * Elle se branche **sous** `apiClient`, au niveau de l'adaptateur axios. Ce
 * point d'insertion est délibéré : tout ce qui est au-dessus — services,
 * intercepteurs, React Query, l'écran lui-même — s'exécute exactement comme en
 * production. L'atelier montre donc le vrai écran, pas une maquette qui lui
 * ressemble.
 *
 * Elle applique aussi le filtrage et la pagination **côté « serveur »**, ce qui
 * fait de l'atelier un test de plus : un écran qui filtrerait encore en mémoire
 * s'y verrait tout de suite, puisque la fausse API, elle, filtre pour de bon.
 */

export type Scenario = 'nominal' | 'vide' | 'erreur' | 'lent' | 'partiel';

/**
 * Tableau de bord d'une agence qui vient d'ouvrir : tout est à zéro, mais rien
 * n'est interdit. C'est l'état le plus facile à rater — un écran qui n'a que
 * des zéros ne doit ni ressembler à une panne, ni à une permission manquante.
 */
function tableauVide() {
  return {
    ...TABLEAU_DE_BORD,
    properties: { total: 0, published: 0, occupancyRate: null, byStatus: [], byType: [] },
    clients: { total: 0, byStatus: [] },
    monthlyRevenue: { ...TABLEAU_DE_BORD.monthlyRevenue, amount: 0, previousAmount: 0, expected: 0 },
    transactions: { total: 0, deals: 0, leases: 0 },
    revenueSeries: TABLEAU_DE_BORD.revenueSeries.map(point => ({ ...point, encaisse: 0, attendu: 0 })),
    rental: {
      activeLeases: 0,
      leasesByStatus: [],
      installmentsByStatus: [],
      paymentsByMethod: [],
      overdue: { count: 0, amount: 0 },
      dueThisWeek: { count: 0, amount: 0 },
      pendingDeclarations: 0
    },
    pipeline: [],
    maintenance: { open: 0, byStatus: [], byPriority: [] },
    syndic: { syndicates: 0, lots: 0, chargeCallsByStatus: [], recoveryRate: null },
    patrimoine: { workProgramsByStatus: [], plannedCost: 0 },
    workQueue: [],
    recentActivity: []
  };
}

/**
 * Collaborateur sans accès au CRM, à la maintenance ni à la copropriété : ces
 * sections valent `null`, et l'écran doit alors écrire « — » et retirer les
 * cartes correspondantes — jamais afficher zéro.
 */
function tableauPartiel() {
  return {
    ...TABLEAU_DE_BORD,
    clients: null,
    pipeline: null,
    maintenance: null,
    syndic: null,
    patrimoine: null,
    transactions: { total: 25, deals: null, leases: 25 }
  };
}

function ok<T>(config: AxiosRequestConfig, data: T): AxiosResponse {
  return { data: data as never, status: 200, statusText: 'OK', headers: {}, config: config as never };
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Filtrage et pagination, comme les ferait l'API. */
function listeBiens(url: URL, scenario: Scenario) {
  if (scenario === 'vide') {
    return { success: true, data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } };
  }

  const q = url.searchParams.get('q')?.toLowerCase();
  const status = url.searchParams.get('status');
  const propertyType = url.searchParams.get('propertyType');
  const minPrice = Number(url.searchParams.get('minPrice')) || null;
  const maxPrice = Number(url.searchParams.get('maxPrice')) || null;

  const filtres = BIENS.filter(bien => {
    if (q && ![bien.title, bien.address, bien.internalReference].join(' ').toLowerCase().includes(q)) return false;
    if (status && bien.status !== status) return false;
    if (propertyType && bien.propertyType !== propertyType) return false;
    if (minPrice !== null && (bien.price ?? 0) < minPrice) return false;
    if (maxPrice !== null && (bien.price ?? 0) > maxPrice) return false;
    return true;
  });

  const page = Number(url.searchParams.get('page')) || 1;
  const limit = Number(url.searchParams.get('limit')) || 20;
  const debut = (page - 1) * limit;

  return {
    success: true,
    data: filtres.slice(debut, debut + limit),
    pagination: { page, limit, total: filtres.length, totalPages: Math.ceil(filtres.length / limit) || 0 }
  };
}

/** Echeances : filtrage par statut et par retard, pagination, comme l API. */
function listeEcheances(url: URL, scenario: Scenario) {
  if (scenario === 'vide') {
    return { success: true, data: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } };
  }

  const status = url.searchParams.get('status');
  const overdue = url.searchParams.get('overdue') === 'true';

  const filtrees = ECHEANCES.filter(e => {
    if (status && e.status !== status) return false;
    if (overdue && e.status !== 'OVERDUE') return false;
    return true;
  });

  const page = Number(url.searchParams.get('page')) || 1;
  const limit = Number(url.searchParams.get('limit')) || 50;
  const debut = (page - 1) * limit;

  return {
    success: true,
    data: filtrees.slice(debut, debut + limit),
    pagination: { page, limit, total: filtrees.length, totalPages: Math.ceil(filtrees.length / limit) || 0 }
  };
}

let adaptateurOrigine: AxiosAdapter | undefined;

export function installerFausseApi(scenario: Scenario) {
  if (adaptateurOrigine === undefined) {
    adaptateurOrigine = apiClient.defaults.adapter as AxiosAdapter;
  }

  apiClient.defaults.adapter = (async (config: AxiosRequestConfig) => {
    // Le chemin peut être relatif à `baseURL` : une base factice suffit à le
    // découper, on ne s'intéresse qu'au chemin et aux paramètres.
    const url = new URL(config.url ?? '', 'http://atelier.local');

    if (scenario === 'lent') await delay(1_500);

    if (scenario === 'erreur') {
      const erreur = new Error('Atelier : panne simulée') as Error & { response: unknown; config: unknown };
      erreur.response = { status: 500, data: { error: 'Panne simulée' }, statusText: '', headers: {}, config };
      erreur.config = config;
      throw erreur;
    }

    // Tableau de bord d'accueil : un seul appel, tout l'écran (§10.1).
    if (/\/tenants\/[^/]+\/dashboard$/.test(url.pathname)) {
      const data = scenario === 'vide' ? tableauVide() : scenario === 'partiel' ? tableauPartiel() : TABLEAU_DE_BORD;
      return ok(config, { success: true, data });
    }

    if (/\/tenants\/[^/]+\/properties$/.test(url.pathname)) {
      return ok(config, listeBiens(url, scenario));
    }

    // Appartements d'un immeuble : la fiche du bien conteneur les liste.
    if (/\/properties\/[^/]+\/sub-properties$/.test(url.pathname)) {
      return ok(config, { success: true, data: scenario === 'vide' ? [] : APPARTEMENTS });
    }

    // Medias d'un bien : la fiche les charge apres le bien lui-meme. L'ordre
    // des tests compte, ce chemin etant plus long que celui de la fiche.
    if (/\/tenants\/[^/]+\/properties\/[^/]+\/media$/.test(url.pathname)) {
      return ok(config, { success: true, data: [] });
    }

    // Fiche d'un bien. L'identifiant de l'URL fait foi quand il existe dans le
    // jeu de donnees ; sinon le premier bien sert de doublure, ce qui rend la
    // scene atteignable sans connaitre les identifiants simules.
    const fiche = /\/tenants\/[^/]+\/properties\/([^/]+)$/.exec(url.pathname);
    if (fiche) {
      const bien = BIENS.find(candidat => candidat.id === fiche[1]) ?? BIENS[0];
      return ok(config, { success: true, data: bien });
    }

    if (/\/rental\/(leases\/[^/]+\/)?installments$/.test(url.pathname)) {
      return ok(config, listeEcheances(url, scenario));
    }

    // Les penalites ne sont PAS paginees par l API : elle rend tout, sans
    // enveloppe `pagination`. La fausse API reproduit ce contrat exactement,
    // faute de quoi l atelier montrerait un ecran plus capable qu il ne l est.
    if (/\/rental\/penalties$/.test(url.pathname)) {
      return ok(config, { success: true, data: scenario === 'vide' ? [] : PENALITES });
    }

    if (/\/rental\/payments$/.test(url.pathname)) {
      const liste = scenario === 'vide' ? [] : PAIEMENTS;
      const statut = url.searchParams.get('status');
      const filtres = statut ? liste.filter(p => p.status === statut) : liste;
      return ok(config, {
        success: true,
        data: filtres,
        pagination: { page: 1, limit: 50, total: filtres.length, totalPages: 1 }
      });
    }

    // Modeles de documents : l endpoint ne pagine pas, il rend la collection
    // entiere, filtree par `docType`. La fausse API reproduit ce contrat — un
    // ecran qui attendrait une enveloppe `pagination` se casserait ici.
    if (/\/tenants\/[^/]+\/documents\/templates$/.test(url.pathname)) {
      const liste = scenario === 'vide' ? [] : MODELES_DOCUMENTS;
      const type = url.searchParams.get('docType');
      return ok(config, { success: true, data: type ? liste.filter(m => m.doc_type === type) : liste });
    }

    if (/\/rental\/documents$/.test(url.pathname)) {
      const liste = scenario === 'vide' ? [] : DOCUMENTS;
      const type = url.searchParams.get('type');
      const statut = url.searchParams.get('status');
      const filtres = liste.filter(d => (!type || d.type === type) && (!statut || d.status === statut));
      return ok(config, {
        success: true,
        data: filtres,
        pagination: { page: 1, limit: 50, total: filtres.length, totalPages: 1 }
      });
    }

    // Programmes de travaux de l'agence : l'endpoint agrégé du §8.4, qui
    // remplace jusqu'à 101 requêtes. Il pagine et filtre côté serveur, et
    // joint le bien — la fausse API fait de même, sans quoi l'atelier
    // montrerait un écran plus simple qu'il ne l'est.
    if (/\/tenants\/[^/]+\/work-programs$/.test(url.pathname)) {
      const statut = url.searchParams.get('status');
      const filtres = scenario === 'vide' ? [] : TRAVAUX.filter(t => !statut || t.status === statut);
      const page = Number(url.searchParams.get('page')) || 1;
      const limit = Number(url.searchParams.get('limit')) || 25;
      const debut = (page - 1) * limit;
      return ok(config, {
        success: true,
        data: {
          items: filtres.slice(debut, debut + limit),
          total: filtres.length,
          page,
          limit,
          totalPages: Math.ceil(filtres.length / limit) || 0
        }
      });
    }

    if (/\/patrimoine\/overview$/.test(url.pathname)) {
      return ok(config, { success: true, data: APERCU_PATRIMOINE });
    }

    // Le calendrier rend une FENÊTRE de dates, pas une page : la réponse ne
    // porte pas d'enveloppe `pagination`, et sa clé est `events` et non `data`.
    if (url.pathname.includes('calendar')) {
      return ok(config, { success: true, events: scenario === 'vide' ? [] : EVENEMENTS });
    }

    // Collaborateurs de l'agence : réponse imbriquée sous `data.members`, et
    // non `data` directement. C'est en servant la mauvaise forme ici que la
    // fragilité d'`AdvancedFilters` est apparue.
    if (/\/tenants\/[^/]+\/users$/.test(url.pathname)) {
      return ok(config, {
        success: true,
        data: {
          members: [
            { id: 'u1', userId: 'u1', user: { id: 'u1', fullName: 'Aissatou Barry', email: 'a@b.c' } },
            { id: 'u2', userId: 'u2', user: { id: 'u2', fullName: 'Ibrahima Sow', email: 'i@b.c' } }
          ],
          pagination: { page: 1, limit: 100, total: 2, totalPages: 1 }
        }
      });
    }

    if (url.pathname.includes('/geographic') || url.pathname.includes('/communes')) {
      return ok(config, { success: true, data: COMMUNES });
    }

    // Module financier. Un gestionnaire par écran, dans son propre fichier :
    // trois agents les construisent en parallèle et ne se marchent pas dessus.
    // Chacun renvoie `null` quand l'URL ne le concerne pas.
    for (const repondre of [
      repondreBalances,
      repondreReleve,
      repondreCampagne,
      repondreFournisseurs,
      repondreChantiers,
      repondreValidation,
      repondreLot3
    ]) {
      const reponse = repondre(url.pathname, scenario);
      if (reponse !== null) {
        return ok(config, reponse);
      }
    }

    // Tout le reste répond « rien », plutôt que d'échouer : l'atelier ne
    // prétend pas simuler l'application entière.
    return ok(config, { success: true, data: [] });
  }) as unknown as AxiosAdapter;
}

export function retirerFausseApi() {
  if (adaptateurOrigine !== undefined) {
    apiClient.defaults.adapter = adaptateurOrigine;
  }
}
