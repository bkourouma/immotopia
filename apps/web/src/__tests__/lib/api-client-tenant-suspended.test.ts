import { describe, it, expect, afterEach, vi } from 'vitest';
import type { AxiosAdapter, AxiosRequestConfig } from 'axios';
import apiClient from '../../utils/api-client';
import { TENANT_SUSPENDED_EVENT } from '../../utils/tenant-events';
import { ACTIVE_TENANT_STORAGE_KEY } from '../../utils/active-tenant';

/**
 * `apiClient` — agence suspendue et en-tête de portail (lot F, plan §F3/§6).
 *
 * Même méthode que `api-client-retry.test.ts` : un adaptateur axios remplace
 * le réseau, sur l'instance RÉELLE. C'est le seul moyen de vérifier ce que
 * l'intercepteur pose sur la requête sortante (l'en-tête) et ce qu'il déclenche
 * sur la réponse refusée (l'évènement) sans doubler `api-client.ts` d'un faux
 * qui ne prouverait rien.
 */

const originalAdapter = apiClient.defaults.adapter;

function tenantSuspendedError(config: AxiosRequestConfig) {
  const error = new Error('HTTP 403') as Error & {
    isAxiosError: boolean;
    response: unknown;
    config: AxiosRequestConfig;
  };
  error.isAxiosError = true;
  error.response = {
    status: 403,
    data: { success: false, code: 'TENANT_SUSPENDED', message: 'Cette agence est suspendue.' },
    statusText: '',
    headers: {},
    config
  };
  error.config = config;
  return error;
}

function ordinaryForbiddenError(config: AxiosRequestConfig) {
  const error = new Error('HTTP 403') as Error & {
    isAxiosError: boolean;
    response: unknown;
    config: AxiosRequestConfig;
  };
  error.isAxiosError = true;
  error.response = { status: 403, data: { success: false, message: 'Interdit.' }, statusText: '', headers: {}, config };
  error.config = config;
  return error;
}

function adapterRejecting(makeError: (config: AxiosRequestConfig) => unknown): AxiosAdapter {
  return (async (config: AxiosRequestConfig) => {
    throw makeError(config);
  }) as unknown as AxiosAdapter;
}

function readOutgoingHeader(config: AxiosRequestConfig, name: string): unknown {
  const headers = config.headers as unknown as { get?: (key: string) => unknown } | Record<string, unknown> | undefined;
  if (!headers) return undefined;
  if (typeof (headers as { get?: unknown }).get === 'function') {
    return (headers as { get: (key: string) => unknown }).get(name);
  }
  return (headers as Record<string, unknown>)[name];
}

afterEach(() => {
  apiClient.defaults.adapter = originalAdapter;
  window.localStorage.removeItem(ACTIVE_TENANT_STORAGE_KEY);
});

describe('apiClient — agence suspendue', () => {
  it('émet TENANT_SUSPENDED_EVENT sur un 403 { code: TENANT_SUSPENDED }, avec l’agence tirée de l’URL', async () => {
    apiClient.defaults.adapter = adapterRejecting(tenantSuspendedError);

    const handler = vi.fn();
    window.addEventListener(TENANT_SUSPENDED_EVENT, handler as EventListener);

    await expect(apiClient.get('/tenants/agence-1/stats')).rejects.toThrow();

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({ tenantId: 'agence-1' });

    window.removeEventListener(TENANT_SUSPENDED_EVENT, handler as EventListener);
  });

  it('déduit l’agence de l’en-tête X-Portal-Tenant-Id sur une route de portail', async () => {
    window.localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, 'agence-2');
    apiClient.defaults.adapter = adapterRejecting(tenantSuspendedError);

    const handler = vi.fn();
    window.addEventListener(TENANT_SUSPENDED_EVENT, handler as EventListener);

    await expect(apiClient.get('/portal/owner/dashboard')).rejects.toThrow();

    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({ tenantId: 'agence-2' });

    window.removeEventListener(TENANT_SUSPENDED_EVENT, handler as EventListener);
  });

  it('n’émet rien sur un 403 ordinaire, sans `code: TENANT_SUSPENDED`', async () => {
    apiClient.defaults.adapter = adapterRejecting(ordinaryForbiddenError);

    const handler = vi.fn();
    window.addEventListener(TENANT_SUSPENDED_EVENT, handler as EventListener);

    await expect(apiClient.get('/tenants/agence-1/stats')).rejects.toThrow();

    expect(handler).not.toHaveBeenCalled();
    window.removeEventListener(TENANT_SUSPENDED_EVENT, handler as EventListener);
  });

  it('pose X-Portal-Tenant-Id sur une route de portail quand une agence est mémorisée', async () => {
    window.localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, 'agence-3');
    let seenHeader: unknown;
    apiClient.defaults.adapter = (async (config: AxiosRequestConfig) => {
      seenHeader = readOutgoingHeader(config, 'X-Portal-Tenant-Id');
      return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config };
    }) as unknown as AxiosAdapter;

    await apiClient.get('/portal/owner/dashboard');

    expect(seenHeader).toBe('agence-3');
  });

  it('n’envoie pas X-Portal-Tenant-Id sans agence mémorisée', async () => {
    let seenHeader: unknown = 'valeur-initiale';
    apiClient.defaults.adapter = (async (config: AxiosRequestConfig) => {
      seenHeader = readOutgoingHeader(config, 'X-Portal-Tenant-Id');
      return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config };
    }) as unknown as AxiosAdapter;

    await apiClient.get('/portal/owner/dashboard');

    expect(seenHeader).toBeFalsy();
  });

  it('n’envoie pas X-Portal-Tenant-Id hors des routes de portail', async () => {
    window.localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, 'agence-3');
    let seenHeader: unknown = 'valeur-initiale';
    apiClient.defaults.adapter = (async (config: AxiosRequestConfig) => {
      seenHeader = readOutgoingHeader(config, 'X-Portal-Tenant-Id');
      return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config };
    }) as unknown as AxiosAdapter;

    await apiClient.get('/tenants/agence-3/stats');

    expect(seenHeader).toBeFalsy();
  });
});
