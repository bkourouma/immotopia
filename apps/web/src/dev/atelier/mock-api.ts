import type { AxiosAdapter, AxiosRequestConfig, AxiosResponse } from 'axios';
import apiClient from '../../utils/api-client';
import {
  BIENS,
  COMMUNES,
  ECHEANCES,
  PENALITES,
  PAIEMENTS,
  DOCUMENTS,
  EVENEMENTS,
  TRAVAUX,
  APERCU_PATRIMOINE
} from './fixtures';

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

export type Scenario = 'nominal' | 'vide' | 'erreur' | 'lent';

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

    if (/\/tenants\/[^/]+\/properties$/.test(url.pathname)) {
      return ok(config, listeBiens(url, scenario));
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
