import type { AxiosAdapter, AxiosRequestConfig, AxiosResponse } from 'axios';
import apiClient from '../../utils/api-client';
import { BIENS, COMMUNES } from './fixtures';

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
