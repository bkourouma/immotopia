import { describe, it, expect, afterEach, afterAll, beforeAll, vi } from 'vitest';
import type { AxiosAdapter, AxiosRequestConfig } from 'axios';

const warning = vi.fn();
let uninstall: () => void = () => undefined;

import apiClient from '../../utils/api-client';
import {
  installSubscriptionDenialInterceptor,
  isSubscriptionDenialCode,
  subscriptionDenialText
} from '../../utils/subscription-denial-notice';

/**
 * Refus d'abonnement (vague 2) sur l'instance RÉELLE d'api-client : un
 * adaptateur axios remplace le réseau, comme api-client-tenant-suspended.
 */
const originalAdapter = apiClient.defaults.adapter;

function rejectingWith(status: number, data: unknown): AxiosAdapter {
  return (async (config: AxiosRequestConfig) => {
    const error = new Error(`HTTP ${status}`) as Error & Record<string, unknown>;
    error.isAxiosError = true;
    error.response = { status, data, statusText: '', headers: {}, config };
    error.config = config;
    throw error;
  }) as unknown as AxiosAdapter;
}

beforeAll(() => {
  uninstall = installSubscriptionDenialInterceptor(apiClient, { warning });
});

afterAll(() => uninstall());

afterEach(() => {
  apiClient.defaults.adapter = originalAdapter;
  warning.mockReset();
});

describe('apiClient — refus d’abonnement', () => {
  it.each(['MODULE_NOT_INCLUDED', 'MODULE_READ_ONLY', 'SUBSCRIPTION_READ_ONLY'] as const)(
    'traduit un 403 %s en une notification claire, et rejette toujours',
    async code => {
      apiClient.defaults.adapter = rejectingWith(403, { success: false, code, message: 'Refus.' });
      await expect(apiClient.post('/tenants/a/syndics', {})).rejects.toThrow();
      expect(warning).toHaveBeenCalledTimes(1);
      expect(warning.mock.calls[0][0]).toMatchObject({
        key: `subscription-denial:${code}`,
        title: subscriptionDenialText(code).title
      });
    }
  );

  it('ignore un 403 sans code d’abonnement et un autre statut', async () => {
    apiClient.defaults.adapter = rejectingWith(403, { success: false, code: 'TENANT_SUSPENDED' });
    await expect(apiClient.get('/tenants/a/x')).rejects.toThrow();
    apiClient.defaults.adapter = rejectingWith(409, { success: false, code: 'MODULE_READ_ONLY' });
    await expect(apiClient.post('/tenants/a/x', {})).rejects.toThrow();
    expect(warning).not.toHaveBeenCalled();
  });

  it('seuls les trois codes d’abonnement ont un message', () => {
    expect(isSubscriptionDenialCode('MODULE_READ_ONLY')).toBe(true);
    expect(isSubscriptionDenialCode('TENANT_SUSPENDED')).toBe(false);
    expect(subscriptionDenialText('SUBSCRIPTION_READ_ONLY').title).toBe('Abonnement en lecture seule');
  });
});
