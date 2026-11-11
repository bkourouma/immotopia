import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import apiClient from '../../utils/api-client';
import { postEventStream } from '../../utils/event-stream';
import { ACTIVE_TENANT_STORAGE_KEY } from '../../utils/active-tenant';

/**
 * Contre-audit A4 : quand le flux ImmoCopilot (`postEventStream`) constate une
 * session perdue (rafraîchissement refusé en 401/403), il renvoie vers la
 * connexion ET purge les données personnelles locales, comme l'intercepteur
 * d'`api-client`. Une panne réseau ou un 5xx du rafraîchissement ne prouve
 * rien : ni renvoi, ni purge (un brouillon en cours ne doit pas disparaître).
 */

const DRAFT_KEY = 'immotopia:inspection-draft:insp-1';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('postEventStream : session perdue', () => {
  const adapterInitial = apiClient.defaults.adapter;
  const locationInitiale = window.location;
  let href = '';

  beforeEach(() => {
    href = '';
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        pathname: '/copilot',
        search: '',
        get href() {
          return href;
        },
        set href(v: string) {
          href = v;
        }
      }
    });
    window.localStorage.clear();
    window.localStorage.setItem(DRAFT_KEY, '{"brouillon":true}');
    window.localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, 'tenant-1');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { message: 'expired' })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    apiClient.defaults.adapter = adapterInitial;
    Object.defineProperty(window, 'location', { configurable: true, value: locationInitiale });
    window.localStorage.clear();
  });

  const refreshRepond = (statut: number | 'reseau') => {
    apiClient.defaults.adapter = ((config: InternalAxiosRequestConfig) => {
      if (statut === 'reseau') {
        return Promise.reject(Object.assign(new Error('Network Error'), { isAxiosError: true, config }));
      }
      const response = { data: {}, status: statut, statusText: '', headers: {}, config };
      return Promise.reject(Object.assign(new Error(`http ${statut}`), { isAxiosError: true, config, response }));
    }) as unknown as AxiosAdapter;
  };

  it.each([401, 403])('refresh en %i : renvoi vers la connexion et purge locale', async statut => {
    refreshRepond(statut);
    await expect(postEventStream('/tenants/t1/ai/chat', {}, { onEvent: () => {} })).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED'
    });
    expect(href).toContain('/login?redirect=');
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(window.localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY)).toBeNull();
  });

  it.each([['reseau' as const], [503]])('refresh en %s : ni renvoi ni purge', async statut => {
    refreshRepond(statut);
    await expect(postEventStream('/tenants/t1/ai/chat', {}, { onEvent: () => {} })).rejects.toMatchObject({
      status: 401
    });
    expect(href).toBe('');
    expect(window.localStorage.getItem(DRAFT_KEY)).not.toBeNull();
    expect(window.localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY)).toBe('tenant-1');
  });
});
