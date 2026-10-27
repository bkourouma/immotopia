/**
 * Cœur générique du paiement en ligne (lot M2) : décision de transition pure,
 * statut normalisé, appel build-away et délais. Aucune base, aucun réseau.
 */

jest.mock('../../src/config/env', () => ({
  env: { BACKEND_URL: 'https://api.example.test/' }
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

import {
  CHECKOUT_EXPIRE_AFTER_MS,
  CHECKOUT_RECHECK_INTERVAL_MS,
  CHECKOUT_RECONCILE_MIN_AGE_MS,
  UnsafeProviderCheckoutUrlError,
  decideCheckoutTransition,
  expiryCutoff,
  fetchNormalizedProviderStatus,
  isCheckoutExpired,
  isDueForRecheck,
  normalizeProviderCheckoutUrl,
  normalizeProviderStatus,
  paySecureHubIpnUrl,
  reconcileCutoff,
  requestProviderCheckoutRedirect
} from '../../src/lib/payment-gateway/checkout-core';
import type { DecideCheckoutTransitionInput } from '../../src/lib/payment-gateway/checkout-core';
import { GatewayError } from '../../src/lib/payment-gateway/types';
import type {
  GatewayClient,
  GatewayCredentials,
  MappedGatewayState,
  ProviderStatus
} from '../../src/lib/payment-gateway/types';

const credentials: GatewayCredentials = {
  tenantId: 't1',
  merchantId: 'm1',
  apiKey: 'k',
  baseUrl: 'https://psh.example.test',
  timeoutMs: 1000
};

function providerStatus(overrides: Partial<ProviderStatus> = {}): ProviderStatus {
  return {
    rawState: 'SUCCESSFUL',
    mappedState: 'SUCCESS',
    transactionId: 'TX1',
    amount: 5000,
    fees: 50,
    serviceName: 'Wave CI',
    error: null,
    raw: { payments: { state: 'SUCCESSFUL' } },
    ...overrides
  };
}

function clientWith(overrides: Partial<GatewayClient>): GatewayClient {
  return {
    buildAway: jest.fn(),
    getStatus: jest.fn(),
    getBalance: jest.fn(),
    ...overrides
  } as GatewayClient;
}

describe('decideCheckoutTransition', () => {
  const provider = (
    state: MappedGatewayState,
    amount: number | null = 5000,
    rawState: string | null = state
  ): DecideCheckoutTransitionInput['provider'] => ({ state, amount, rawState });

  const decide = (currentStatus: string, p: DecideCheckoutTransitionInput['provider'], expectedAmount = 5000) =>
    decideCheckoutTransition({ currentStatus, expectedAmount, provider: p });

  describe('tentative close', () => {
    it.each<MappedGatewayState>(['SUCCESS', 'FAILED', 'CANCELED', 'PENDING'])('EXPIRED + %s -> NOOP', state => {
      expect(decide('EXPIRED', provider(state))).toEqual({ action: 'NOOP' });
    });
  });

  describe('en attente chez le fournisseur -> TOUCH quel que soit le statut courant', () => {
    it.each(['PENDING', 'SUCCESS', 'FAILED', 'CANCELED', 'REVIEW'])('%s + PENDING', current => {
      expect(decide(current, provider('PENDING', null, 'INITIATED'))).toEqual({ action: 'TOUCH' });
    });
  });

  describe('même état (rejeu idempotent) -> TOUCH', () => {
    it.each(['SUCCESS', 'FAILED', 'CANCELED'] as const)('%s + %s', state => {
      expect(decide(state, provider(state))).toEqual({ action: 'TOUCH' });
    });

    it('un succès rejoué ne compare pas le montant', () => {
      expect(decide('SUCCESS', provider('SUCCESS', 1))).toEqual({ action: 'TOUCH' });
    });
  });

  describe('un SUCCESS ne redescend jamais -> REVIEW', () => {
    it.each(['FAILED', 'CANCELED'] as const)('SUCCESS + %s', state => {
      expect(decide('SUCCESS', provider(state, 5000, 'ECHEC'))).toEqual({
        action: 'REVIEW',
        reviewReason: 'PaySecureHub rapporte maintenant « ECHEC » pour un paiement déjà réussi.'
      });
    });

    it('un état brut absent donne un motif sans valeur', () => {
      expect(decide('SUCCESS', provider('FAILED', null, null))).toEqual({
        action: 'REVIEW',
        reviewReason: 'PaySecureHub rapporte maintenant «  » pour un paiement déjà réussi.'
      });
    });
  });

  describe('succès fournisseur', () => {
    it.each(['PENDING', 'FAILED', 'CANCELED', 'REVIEW'])('%s + SUCCESS, montant conforme -> SUCCEED', current => {
      expect(decide(current, provider('SUCCESS', 5000))).toEqual({ action: 'SUCCEED' });
    });

    it('montant absent -> SUCCEED (pas de contrôle possible)', () => {
      expect(decide('PENDING', provider('SUCCESS', null))).toEqual({ action: 'SUCCEED' });
    });

    it('comparaison à l entier : 5000.4 vs 5000 -> SUCCEED', () => {
      expect(decide('PENDING', provider('SUCCESS', 5000.4), 5000)).toEqual({ action: 'SUCCEED' });
      expect(decide('PENDING', provider('SUCCESS', 5000), 4999.7)).toEqual({ action: 'SUCCEED' });
    });

    it('écart de montant -> REVIEW avec les deux montants', () => {
      expect(decide('PENDING', provider('SUCCESS', 4000), 5000)).toEqual({
        action: 'REVIEW',
        reviewReason: 'Montant reçu (4000) différent du montant attendu (5000).'
      });
    });

    it.each(['FAILED', 'CANCELED', 'REVIEW'])('écart de montant depuis %s -> REVIEW', current => {
      expect(decide(current, provider('SUCCESS', 6000), 5000).action).toBe('REVIEW');
    });
  });

  describe('échec et annulation', () => {
    it.each(['PENDING', 'REVIEW', 'CANCELED'])('%s + FAILED -> FAIL', current => {
      expect(decide(current, provider('FAILED'))).toEqual({ action: 'FAIL' });
    });

    it.each(['PENDING', 'REVIEW', 'FAILED'])('%s + CANCELED -> CANCEL', current => {
      expect(decide(current, provider('CANCELED'))).toEqual({ action: 'CANCEL' });
    });

    it('le montant est ignoré pour un échec', () => {
      expect(decide('PENDING', provider('FAILED', 1), 5000)).toEqual({ action: 'FAIL' });
    });
  });

  it('table complète : chaque couple (statut courant, état fournisseur) donne une action définie', () => {
    const currents = ['PENDING', 'SUCCESS', 'FAILED', 'CANCELED', 'EXPIRED', 'REVIEW'];
    const states: MappedGatewayState[] = ['SUCCESS', 'FAILED', 'CANCELED', 'PENDING'];
    const expected: Record<string, Record<MappedGatewayState, string>> = {
      PENDING: { SUCCESS: 'SUCCEED', FAILED: 'FAIL', CANCELED: 'CANCEL', PENDING: 'TOUCH' },
      SUCCESS: { SUCCESS: 'TOUCH', FAILED: 'REVIEW', CANCELED: 'REVIEW', PENDING: 'TOUCH' },
      FAILED: { SUCCESS: 'SUCCEED', FAILED: 'TOUCH', CANCELED: 'CANCEL', PENDING: 'TOUCH' },
      CANCELED: { SUCCESS: 'SUCCEED', FAILED: 'FAIL', CANCELED: 'TOUCH', PENDING: 'TOUCH' },
      EXPIRED: { SUCCESS: 'NOOP', FAILED: 'NOOP', CANCELED: 'NOOP', PENDING: 'NOOP' },
      REVIEW: { SUCCESS: 'SUCCEED', FAILED: 'FAIL', CANCELED: 'CANCEL', PENDING: 'TOUCH' }
    };
    for (const current of currents) {
      for (const state of states) {
        expect(decide(current, provider(state)).action).toBe(expected[current][state]);
      }
    }
  });

  it('est pure : n altère pas ses arguments et rend le même résultat', () => {
    const input: DecideCheckoutTransitionInput = {
      currentStatus: 'PENDING',
      expectedAmount: 5000,
      provider: provider('SUCCESS', 4000)
    };
    const snapshot = JSON.parse(JSON.stringify(input));
    const first = decideCheckoutTransition(input);
    expect(decideCheckoutTransition(input)).toEqual(first);
    expect(input).toEqual(snapshot);
  });
});

describe('normalizeProviderStatus / fetchNormalizedProviderStatus', () => {
  it('traduit la réponse du client et déduit l opérateur', () => {
    expect(normalizeProviderStatus(providerStatus())).toEqual({
      state: 'SUCCESS',
      providerTransactionId: 'TX1',
      amount: 5000,
      providerFees: 50,
      serviceName: 'Wave CI',
      operator: 'WAVE',
      rawState: 'SUCCESSFUL',
      error: null,
      raw: { payments: { state: 'SUCCESSFUL' } }
    });
  });

  it.each([
    ['Orange Money CI', 'ORANGE'],
    ['MTN MoMo', 'MTN'],
    ['Moov Money', 'MOOV'],
    ['Carte bancaire', 'OTHER'],
    [null, 'OTHER']
  ])('serviceName %s -> %s', (serviceName, operator) => {
    expect(normalizeProviderStatus(providerStatus({ serviceName })).operator).toBe(operator);
  });

  it('conserve les valeurs nulles (en attente, rien reçu)', () => {
    const n = normalizeProviderStatus(
      providerStatus({
        rawState: null,
        mappedState: 'PENDING',
        transactionId: null,
        amount: null,
        fees: null,
        serviceName: null,
        raw: null
      })
    );
    expect(n).toMatchObject({
      state: 'PENDING',
      providerTransactionId: null,
      amount: null,
      providerFees: null,
      serviceName: null,
      operator: 'OTHER',
      raw: null
    });
  });

  it('interroge le client avec le code de paiement', async () => {
    const getStatus = jest.fn().mockResolvedValue(providerStatus({ mappedState: 'FAILED', rawState: 'ECHEC' }));
    const result = await fetchNormalizedProviderStatus(clientWith({ getStatus }), credentials, 'IMT-ABC');
    expect(getStatus).toHaveBeenCalledWith(credentials, 'IMT-ABC');
    expect(result.state).toBe('FAILED');
  });

  it('laisse remonter l erreur du client telle quelle', async () => {
    const error = new GatewayError('injoignable');
    const getStatus = jest.fn().mockRejectedValue(error);
    await expect(fetchNormalizedProviderStatus(clientWith({ getStatus }), credentials, 'IMT-ABC')).rejects.toBe(error);
  });
});

describe('requestProviderCheckoutRedirect', () => {
  const base = {
    credentials,
    mode: 'LIVE' as const,
    codePaiement: 'IMT-ABC',
    payer: { nom: 'Kone', prenom: 'Awa', telephone: '0102030405', email: 'awa@example.test' },
    libelleArticle: 'Loyer',
    libOrder: 'Paiement loyer IMT-ABC',
    amount: 5000,
    returnUrl: 'https://app.example.test/retour'
  };

  it('construit la requête build-away (IPN par défaut, quantité 1)', async () => {
    const buildAway = jest
      .fn()
      .mockResolvedValue({ url: 'https://pay.example.test/p', tokens: 'tok', code: null, message: null });
    const result = await requestProviderCheckoutRedirect({ ...base, client: clientWith({ buildAway }) });

    expect(buildAway).toHaveBeenCalledWith(credentials, {
      codePaiement: 'IMT-ABC',
      nomUsager: 'Kone',
      prenomUsager: 'Awa',
      telephone: '0102030405',
      email: 'awa@example.test',
      libelleArticle: 'Loyer',
      quantite: 1,
      montant: 5000,
      libOrder: 'Paiement loyer IMT-ABC',
      urlRetour: 'https://app.example.test/retour',
      urlCallback: 'https://api.example.test/api/payment-gateway/paysecurehub/ipn'
    });
    expect(result).toEqual({ url: 'https://pay.example.test/p', token: 'tok' });
  });

  it('accepte une quantité et une URL d IPN explicites', async () => {
    const buildAway = jest
      .fn()
      .mockResolvedValue({ url: 'https://pay.example.test/p', tokens: null, code: null, message: null });
    await requestProviderCheckoutRedirect({
      ...base,
      client: clientWith({ buildAway }),
      quantity: 3,
      callbackUrl: 'https://autre.example.test/ipn'
    });
    expect(buildAway.mock.calls[0][1]).toMatchObject({ quantite: 3, urlCallback: 'https://autre.example.test/ipn' });
  });

  it('sans validation, rend l URL telle quelle (chemin portail)', async () => {
    const buildAway = jest
      .fn()
      .mockResolvedValue({ url: 'http://insecure.example.test/p', tokens: null, code: null, message: null });
    const result = await requestProviderCheckoutRedirect({ ...base, client: clientWith({ buildAway }) });
    expect(result).toEqual({ url: 'http://insecure.example.test/p', token: null });
  });

  it('avec validation, rend la forme normalisée', async () => {
    const buildAway = jest
      .fn()
      .mockResolvedValue({ url: 'https://Pay.Example.test', tokens: 't', code: null, message: null });
    const result = await requestProviderCheckoutRedirect({
      ...base,
      client: clientWith({ buildAway }),
      validateUrl: true
    });
    expect(result.url).toBe('https://pay.example.test/');
  });

  it.each([
    'http://pay.example.test/p',
    'javascript:alert(1)',
    'https://u:p@pay.example.test/',
    ' https://pay.example.test/',
    ''
  ])('avec validation, refuse %p sans exposer l URL', async url => {
    const buildAway = jest.fn().mockResolvedValue({ url, tokens: null, code: null, message: null });
    const promise = requestProviderCheckoutRedirect({ ...base, client: clientWith({ buildAway }), validateUrl: true });
    await expect(promise).rejects.toBeInstanceOf(UnsafeProviderCheckoutUrlError);
    await expect(promise).rejects.toThrow('Unsafe provider checkout URL');
    await expect(promise).rejects.not.toBeInstanceOf(GatewayError);
  });

  it('http local accepté en simulateur seulement', async () => {
    const buildAway = jest
      .fn()
      .mockResolvedValue({ url: 'http://localhost:8001/sim', tokens: null, code: null, message: null });
    const client = clientWith({ buildAway });
    await expect(
      requestProviderCheckoutRedirect({ ...base, client, mode: 'SIMULATOR', validateUrl: true })
    ).resolves.toMatchObject({ url: 'http://localhost:8001/sim' });
    await expect(
      requestProviderCheckoutRedirect({ ...base, client, mode: 'LIVE', validateUrl: true })
    ).rejects.toBeInstanceOf(UnsafeProviderCheckoutUrlError);
  });

  it('laisse remonter GatewayError', async () => {
    const error = new GatewayError('boom');
    const buildAway = jest.fn().mockRejectedValue(error);
    await expect(requestProviderCheckoutRedirect({ ...base, client: clientWith({ buildAway }) })).rejects.toBe(error);
  });
});

describe('normalizeProviderCheckoutUrl', () => {
  it('refuse les valeurs qui ne sont pas des chaînes', () => {
    expect(normalizeProviderCheckoutUrl(undefined, 'LIVE')).toBeNull();
    expect(normalizeProviderCheckoutUrl(42, 'LIVE')).toBeNull();
  });

  it('refuse http hors boucle locale même en simulateur', () => {
    expect(normalizeProviderCheckoutUrl('http://pay.example.test/', 'SIMULATOR')).toBeNull();
  });

  it('accepte *.localhost en simulateur', () => {
    expect(normalizeProviderCheckoutUrl('http://api.localhost:8001/p', 'SIMULATOR')).toBe(
      'http://api.localhost:8001/p'
    );
  });
});

describe('paySecureHubIpnUrl', () => {
  it('retire la barre finale de BACKEND_URL', () => {
    expect(paySecureHubIpnUrl()).toBe('https://api.example.test/api/payment-gateway/paysecurehub/ipn');
  });
});

describe('délais', () => {
  const now = Date.UTC(2026, 0, 10, 12, 0, 0);

  it('constantes du contrat §2.7', () => {
    expect(CHECKOUT_EXPIRE_AFTER_MS).toBe(48 * 60 * 60 * 1000);
    expect(CHECKOUT_RECONCILE_MIN_AGE_MS).toBe(2 * 60 * 1000);
    expect(CHECKOUT_RECHECK_INTERVAL_MS).toBe(10 * 1000);
  });

  it('reconcileCutoff / expiryCutoff', () => {
    expect(reconcileCutoff(now).getTime()).toBe(now - 120_000);
    expect(expiryCutoff(now).getTime()).toBe(now - 172_800_000);
  });

  it('isCheckoutExpired : borne des 48 h incluse', () => {
    expect(isCheckoutExpired(new Date(now - CHECKOUT_EXPIRE_AFTER_MS), now)).toBe(true);
    expect(isCheckoutExpired(new Date(now - CHECKOUT_EXPIRE_AFTER_MS - 1), now)).toBe(true);
    expect(isCheckoutExpired(new Date(now - CHECKOUT_EXPIRE_AFTER_MS + 1), now)).toBe(false);
    expect(isCheckoutExpired(new Date(now), now)).toBe(false);
  });

  it('isDueForRecheck : jamais vérifié ou vérifié il y a plus de 10 s (borne exclue)', () => {
    expect(isDueForRecheck(null, now)).toBe(true);
    expect(isDueForRecheck(undefined, now)).toBe(true);
    expect(isDueForRecheck(new Date(now - CHECKOUT_RECHECK_INTERVAL_MS - 1), now)).toBe(true);
    expect(isDueForRecheck(new Date(now - CHECKOUT_RECHECK_INTERVAL_MS), now)).toBe(false);
    expect(isDueForRecheck(new Date(now - 1000), now)).toBe(false);
  });

  it('utilise l horloge courante par défaut', () => {
    expect(isDueForRecheck(new Date())).toBe(false);
    expect(isCheckoutExpired(new Date(0))).toBe(true);
  });
});
