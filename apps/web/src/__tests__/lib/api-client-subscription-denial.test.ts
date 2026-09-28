import { describe, it, expect, afterEach, afterAll, beforeAll, vi } from 'vitest';
import type { AxiosAdapter, AxiosRequestConfig } from 'axios';

const warning = vi.fn();
let uninstall: () => void = () => undefined;

import apiClient from '../../utils/api-client';
import {
  installSubscriptionDenialInterceptor,
  isSubscriptionDenialCode,
  isQuotaExceededResponse,
  ownAssetsOnlyDenialText,
  subscriptionDenialText,
  quotaExceededDenialText
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

/**
 * Barrière « détenu en propre » (pack Patrimoine, lot P1) : 403
 * `OWN_ASSETS_ONLY` avec `data: { action }`. Même dédoublonnage que les
 * trois codes ci-dessus (une clé par code, pas par action).
 */
describe('apiClient — barrière « détenu en propre » (OWN_ASSETS_ONLY)', () => {
  it.each(['MANDATE', 'THIRD_PARTY_OWNER'] as const)(
    'traduit un 403 OWN_ASSETS_ONLY (action %s) en une notification claire',
    async action => {
      apiClient.defaults.adapter = rejectingWith(403, { success: false, code: 'OWN_ASSETS_ONLY', data: { action } });
      await expect(apiClient.post('/tenants/a/properties', {})).rejects.toThrow();
      expect(warning).toHaveBeenCalledTimes(1);
      expect(warning.mock.calls[0][0]).toMatchObject({
        key: 'subscription-denial:OWN_ASSETS_ONLY',
        title: ownAssetsOnlyDenialText().title
      });
    }
  );

  it('ignore un 403 OWN_ASSETS_ONLY sans action exploitable', async () => {
    apiClient.defaults.adapter = rejectingWith(403, { success: false, code: 'OWN_ASSETS_ONLY' });
    await expect(apiClient.post('/tenants/a/properties', {})).rejects.toThrow();
    expect(warning).not.toHaveBeenCalled();
  });
});

/**
 * BUG A1 — dépassement de capacité (D4, politique BLOCK) : 409
 * `QUOTA_EXCEEDED` avec `data: { capacityKey, used, limit, requested }`.
 * Distinct des trois codes ci-dessus : la notification a besoin des chiffres
 * du serveur, et le message pointe vers Paramètres › Abonnement.
 */
describe('apiClient — dépassement de capacité (QUOTA_EXCEEDED)', () => {
  it('traduit un 409 QUOTA_EXCEEDED en une notification claire avec un lien vers le réglage', async () => {
    apiClient.defaults.adapter = rejectingWith(409, {
      success: false,
      code: 'QUOTA_EXCEEDED',
      message: 'Capacité atteinte.',
      data: { capacityKey: 'LOTS', used: 50, limit: 50, requested: 5 }
    });

    await expect(apiClient.post('/tenants/tenant-1/syndics/synd-1/lots', {})).rejects.toThrow();

    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning.mock.calls[0][0]).toMatchObject({
      key: 'subscription-denial:QUOTA_EXCEEDED',
      title: 'Capacité de votre abonnement atteinte',
      description: 'Votre abonnement comprend 50 lots et 50 sont utilisés. Demandez une extension de capacité.',
      settingsPath: '/tenant/tenant-1/settings/abonnement'
    });
  });

  it('ignore un 409 QUOTA_EXCEEDED sans data exploitable', async () => {
    apiClient.defaults.adapter = rejectingWith(409, { success: false, code: 'QUOTA_EXCEEDED' });
    await expect(apiClient.post('/tenants/a/syndics', {})).rejects.toThrow();
    expect(warning).not.toHaveBeenCalled();
  });

  it('construit le message pour chaque capacité, avec ou sans tenantId', () => {
    expect(quotaExceededDenialText({ capacityKey: 'COPROPRIETES', used: 3, limit: 3, requested: 1 })).toMatchObject({
      title: 'Capacité de votre abonnement atteinte',
      description: 'Votre abonnement comprend 3 copropriétés et 3 sont utilisés. Demandez une extension de capacité.',
      settingsPath: null
    });
    expect(
      quotaExceededDenialText({ capacityKey: 'CHANTIERS', used: 2, limit: 2, requested: 1 }, 'tenant-9').settingsPath
    ).toBe('/tenant/tenant-9/settings/abonnement');
  });
});

describe('isQuotaExceededResponse — l’écran appelant ne double pas la notification', () => {
  const detail = { capacityKey: 'LOTS', used: 110, limit: 100, requested: 1 };

  it('reconnaît un 409 QUOTA_EXCEEDED porteur du détail de capacité', () => {
    expect(isQuotaExceededResponse({ response: { status: 409, data: { code: 'QUOTA_EXCEEDED', data: detail } } })).toBe(
      true
    );
  });

  it('ignore les autres erreurs, que l’intercepteur n’annonce pas', () => {
    expect(isQuotaExceededResponse({ response: { status: 409, data: { code: 'CONFLICT' } } })).toBe(false);
    expect(isQuotaExceededResponse({ response: { status: 409, data: { code: 'QUOTA_EXCEEDED' } } })).toBe(false);
    expect(isQuotaExceededResponse({ response: { status: 500, data: { code: 'INTERNAL' } } })).toBe(false);
    expect(isQuotaExceededResponse(new Error('réseau'))).toBe(false);
    expect(isQuotaExceededResponse(null)).toBe(false);
  });
});
