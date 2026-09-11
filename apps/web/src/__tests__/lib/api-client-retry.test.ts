import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AxiosAdapter, AxiosRequestConfig } from 'axios';
import apiClient from '../../utils/api-client';

/**
 * `apiClient` — délai et nouvelles tentatives (REFONTE_UI_UX.md §8.4).
 *
 * Le test injecte un adaptateur axios à la place du réseau. C'est le seul point
 * où l'on peut compter les tentatives réelles : compter les appels du service
 * ne dirait rien, puisque le rejeu se fait sous lui, dans l'intercepteur.
 *
 * Le test qui compte est celui des mutations. Rejouer un `POST` d'encaissement
 * dont la réponse s'est perdue crée un doublon de paiement — risque R6 du
 * §11.1, classé critique. Si cette garde tombe, l'erreur se voit en
 * comptabilité, pas à l'écran.
 */

/**
 * Les erreurs du harnais portent leur `config`.
 *
 * En production, axios construit un `AxiosError` et y attache la configuration
 * de la requête. Quand l'adaptateur lève lui-même une erreur ordinaire, axios
 * la relaie telle quelle : sans `config`, l'intercepteur ne saurait pas de
 * quelle méthode il s'agit et ne rejouerait rien. Le harnais reproduit donc ce
 * qu'axios fait, faute de quoi il testerait autre chose que la production.
 */
function networkError(config: AxiosRequestConfig) {
  const error = new Error('Network Error') as Error & {
    isAxiosError: boolean;
    code: string;
    config: AxiosRequestConfig;
  };
  error.isAxiosError = true;
  error.code = 'ECONNABORTED';
  error.config = config;
  return error;
}

/** Réponse d'erreur portant un statut. */
function httpError(status: number) {
  return (config: AxiosRequestConfig) => {
    const error = new Error(`HTTP ${status}`) as Error & {
      isAxiosError: boolean;
      response: unknown;
      config: AxiosRequestConfig;
    };
    error.isAxiosError = true;
    error.response = { status, data: null, statusText: '', headers: {}, config };
    error.config = config;
    return error;
  };
}

let attempts: AxiosRequestConfig[] = [];
const originalAdapter = apiClient.defaults.adapter;

/**
 * Installe un adaptateur qui échoue `failures` fois puis réussit.
 * Chaque appel est enregistré, ce qui donne le compte exact de tentatives.
 */
function adapterFailing(failures: number, makeError: (config: AxiosRequestConfig) => unknown): AxiosAdapter {
  return (async (config: AxiosRequestConfig) => {
    attempts.push(config);
    if (attempts.length <= failures) throw makeError(config);
    return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config };
  }) as unknown as AxiosAdapter;
}

beforeEach(() => {
  attempts = [];
  // Les attentes de 1 s et 3 s sont simulées : le test ne dure pas 4 s.
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  apiClient.defaults.adapter = originalAdapter;
});

describe('apiClient — délai maximal', () => {
  it('pose un timeout, au lieu d’attendre indéfiniment', () => {
    // Sans cela, une requête perdue laisse l'écran sur son squelette, sans
    // erreur ni sortie possible.
    expect(apiClient.defaults.timeout).toBe(20_000);
  });
});

describe('apiClient — nouvelles tentatives', () => {
  it('rejoue un GET jusqu’à deux fois sur panne réseau', async () => {
    apiClient.defaults.adapter = adapterFailing(2, networkError);

    const promise = apiClient.get('/properties');
    await vi.advanceTimersByTimeAsync(5_000);
    const response = await promise;

    expect(response.data).toEqual({ ok: true });
    // 1 tentative initiale + 2 rejeux.
    expect(attempts).toHaveLength(3);
  });

  it('abandonne après la deuxième tentative, sans boucler', async () => {
    apiClient.defaults.adapter = adapterFailing(99, networkError);

    const promise = apiClient.get('/properties');
    const assertion = expect(promise).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;

    expect(attempts).toHaveLength(3);
  });

  it('rejoue un GET sur 503, une panne qui peut passer', async () => {
    apiClient.defaults.adapter = adapterFailing(1, httpError(503));

    const promise = apiClient.get('/properties');
    await vi.advanceTimersByTimeAsync(5_000);
    await promise;

    expect(attempts).toHaveLength(2);
  });

  it('NE rejoue JAMAIS une mutation, même sur panne réseau', async () => {
    // Le test le plus important du fichier. Un POST d'encaissement rejoué
    // crée un second paiement : le rejeu sûr des mutations passe par la file
    // hors-ligne et sa clé d'idempotence (§8.5), pas par cet intercepteur.
    apiClient.defaults.adapter = adapterFailing(1, networkError);

    const promise = apiClient.post('/payments', { amount: 500_000 });
    const assertion = expect(promise).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;

    expect(attempts).toHaveLength(1);
  });

  it('ne rejoue ni PUT, ni PATCH, ni DELETE', async () => {
    for (const call of [
      () => apiClient.put('/leases/1', {}),
      () => apiClient.patch('/leases/1', {}),
      () => apiClient.delete('/leases/1')
    ]) {
      attempts = [];
      apiClient.defaults.adapter = adapterFailing(1, networkError);
      const promise = call();
      const assertion = expect(promise).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(10_000);
      await assertion;
      expect(attempts).toHaveLength(1);
    }
  });

  it('ne rejoue pas un 404 : c’est une réponse, pas une panne', async () => {
    apiClient.defaults.adapter = adapterFailing(1, httpError(404));

    const promise = apiClient.get('/properties/inconnu');
    const assertion = expect(promise).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;

    expect(attempts).toHaveLength(1);
  });

  it('ne rejoue pas un 403 : réessayer ne donnera pas le droit', async () => {
    apiClient.defaults.adapter = adapterFailing(1, httpError(403));

    const promise = apiClient.get('/tenants/autre/properties');
    const assertion = expect(promise).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;

    expect(attempts).toHaveLength(1);
  });

  it('attend 1 s puis 3 s entre les tentatives', async () => {
    apiClient.defaults.adapter = adapterFailing(2, networkError);
    const promise = apiClient.get('/properties');

    // Rien ne se passe avant la première seconde.
    await vi.advanceTimersByTimeAsync(900);
    expect(attempts).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(200);
    expect(attempts).toHaveLength(2);

    // La deuxième attente est plus longue : toujours rien à 2 s cumulées.
    await vi.advanceTimersByTimeAsync(1_900);
    expect(attempts).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(1_200);
    expect(attempts).toHaveLength(3);

    await promise;
  });
});
