import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Une requête en 401 dont le rafraîchissement échoue ne renvoie vers la
 * connexion que si le rafraîchissement lui-même répond 401 ou 403. Réseau
 * coupé, 5xx, 429 du limiteur ou autre 4xx : la session n'est pas prouvée perdue.
 */
import apiClient from '../../utils/api-client';
import { ACTIVE_TENANT_STORAGE_KEY } from '../../utils/active-tenant';
import { LANGUAGE_STORAGE_KEY } from '../../i18n/config';

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

  const DRAFT_KEY = 'immotopia:inspection-draft:insp-1';
  const semer = () => {
    window.localStorage.clear();
    window.localStorage.setItem(DRAFT_KEY, '{"brouillon":true}');
    window.localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, 'tenant-1');
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'ar');
  };

  it.each([401, 403])('refresh en %i : renvoi vers la connexion', async statut => {
    await lancer(statut);
    expect(href).toContain('/login?redirect=');
  });

  it.each([401, 403])(
    'refresh en %i : purge les données personnelles locales, garde la langue (contre-audit A4)',
    async statut => {
      semer();
      await lancer(statut);
      expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
      expect(window.localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY)).toBeNull();
      expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('ar');
      window.localStorage.clear();
    }
  );

  it.each([['reseau' as const], [500], [503], [429], [400], [404]])(
    'refresh en %s : pas de renvoi vers la connexion, rien de purgé',
    async statut => {
      semer();
      await lancer(statut);
      expect(href).toBe('');
      expect(window.localStorage.getItem(DRAFT_KEY)).not.toBeNull();
      expect(window.localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY)).toBe('tenant-1');
      window.localStorage.clear();
    }
  );
});
