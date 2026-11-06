import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Une requête en 401 dont le rafraîchissement échoue ne renvoie vers la
 * connexion que si le rafraîchissement lui-même répond 401 ou 403. Réseau
 * coupé, 5xx, 429 du limiteur ou autre 4xx : la session n'est pas prouvée perdue.
 */
import apiClient from '../../utils/api-client';

const reponse = (config: any, status: number) => {
  const response = { data: {}, status, statusText: '', headers: {}, config };
  if (status < 400) return Promise.resolve(response);
  return Promise.reject(Object.assign(new Error(`http ${status}`), { isAxiosError: true, config, response }));
};

describe('api-client : rafraîchissement refusé', () => {
  const adapterInitial = apiClient.defaults.adapter;
  const locationInitiale = window.location;
  let href = '';

  beforeEach(() => {
    href = '';
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        pathname: '/biens',
        search: '',
        get href() {
          return href;
        },
        set href(v: string) {
          href = v;
        }
      }
    });
  });

  afterEach(() => {
    apiClient.defaults.adapter = adapterInitial;
    Object.defineProperty(window, 'location', { configurable: true, value: locationInitiale });
  });

  const lancer = async (statutRefresh: number | 'reseau') => {
    apiClient.defaults.adapter = (config: any) => {
      if (String(config.url).includes('/auth/refresh')) {
        if (statutRefresh === 'reseau') {
          return Promise.reject(Object.assign(new Error('Network Error'), { isAxiosError: true, config }));
        }
        return reponse(config, statutRefresh);
      }
      return reponse(config, 401);
    };
    await apiClient.get('/properties').catch(() => undefined);
  };

  it.each([401, 403])('refresh en %i : renvoi vers la connexion', async statut => {
    await lancer(statut);
    expect(href).toContain('/login?redirect=');
  });

  it.each([['reseau' as const], [500], [503], [429], [400], [404]])(
    'refresh en %s : pas de renvoi vers la connexion',
    async statut => {
      await lancer(statut);
      expect(href).toBe('');
    }
  );
});
