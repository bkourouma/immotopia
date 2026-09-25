import { logger } from '../../../utils/logger';
import { mapProviderState } from '../status-mapping';
import { GatewayError } from '../types';
import type {
  BalanceResult,
  BuildAwayRequest,
  BuildAwayResult,
  GatewayClient,
  GatewayCredentials,
  ProviderStatus
} from '../types';

/**
 * Client réel PaySecureHub (BMI Finance CI) — voir
 * docs/integrations/paysecurehub.md.
 *
 * `fetch` natif + `AbortController` pour le délai (`PAYSECUREHUB_TIMEOUT_MS`).
 * La clé API ne quitte jamais ce fichier : elle part dans l'en-tête `ApiKey`,
 * jamais dans un journal, jamais dans un message d'erreur renvoyé au client.
 */

async function call(
  credentials: GatewayCredentials,
  path: string,
  init: { method: 'GET' | 'POST'; body?: Record<string, unknown> }
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), credentials.timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${credentials.baseUrl.replace(/\/$/, '')}${path}`, {
      method: init.method,
      headers: {
        'Content-Type': 'application/json',
        ApiKey: credentials.apiKey,
        MerchantId: credentials.merchantId
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal
    });
  } catch (error: unknown) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    // Le message d'erreur ne doit jamais porter la clé API : ni `credentials`
    // ni `error` ne la contiennent ici (fetch ne l'expose pas dans son texte
    // d'échec réseau), mais on reste explicite plutôt que de logger l'objet
    // `init` en entier.
    logger.warn('PaySecureHub : échec réseau', { path, aborted, merchantId: credentials.merchantId });
    throw new GatewayError(
      aborted ? 'PaySecureHub ne répond pas (délai dépassé).' : 'Impossible de contacter PaySecureHub.',
      error
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  if (!response.ok) {
    logger.warn('PaySecureHub : réponse en erreur', {
      path,
      status: response.status,
      merchantId: credentials.merchantId
    });
    throw new GatewayError(`PaySecureHub a répondu ${response.status}.`, json);
  }

  return json;
}

export const paySecureHubClient: GatewayClient = {
  async buildAway(credentials, request: BuildAwayRequest): Promise<BuildAwayResult> {
    const body: Record<string, unknown> = {
      code_paiement: request.codePaiement,
      nom_usager: request.nomUsager,
      prenom_usager: request.prenomUsager,
      telephone: request.telephone,
      email: request.email,
      libelle_article: request.libelleArticle,
      quantite: request.quantite,
      montant: request.montant,
      lib_order: request.libOrder,
      Url_Retour: request.urlRetour,
      Url_Callback: request.urlCallback
    };

    const json = await call(credentials, '/payhub-ws/build-away', { method: 'POST', body });
    const data = (json ?? {}) as Record<string, unknown>;
    const url = typeof data.url === 'string' ? data.url : null;
    if (!url) {
      throw new GatewayError("PaySecureHub n'a pas renvoyé d'URL de paiement.", json);
    }

    return {
      url,
      tokens: typeof data.tokens === 'string' ? data.tokens : null,
      code: typeof data.code === 'string' ? data.code : null,
      message: typeof data.message === 'string' ? data.message : null
    };
  },

  async getStatus(credentials, codePaiement: string): Promise<ProviderStatus> {
    const json = await call(credentials, '/airtime/status/transact', { method: 'POST', body: { codePaiement } });
    const data = (json ?? {}) as Record<string, unknown>;
    const payments = (data.payments ?? {}) as Record<string, unknown>;

    const rawState = typeof payments.state === 'string' ? payments.state : null;
    const amount = payments.amount === undefined || payments.amount === null ? null : Number(payments.amount);
    const fees = payments.fees === undefined || payments.fees === null ? null : Number(payments.fees);

    return {
      rawState,
      mappedState: mapProviderState(rawState),
      transactionId: typeof payments.transactionId === 'string' ? payments.transactionId : null,
      amount: Number.isFinite(amount as number) ? (amount as number) : null,
      fees: Number.isFinite(fees as number) ? (fees as number) : null,
      serviceName: typeof payments.serviceName === 'string' ? payments.serviceName : null,
      error: typeof payments.error === 'string' ? payments.error : null,
      raw: json
    };
  },

  async getBalance(credentials): Promise<BalanceResult> {
    const json = await call(credentials, '/data-ws/solde', { method: 'GET' });
    const data = (json ?? {}) as Record<string, unknown>;

    // La documentation fournisseur ne fige pas le nom exact des champs
    // (point ouvert n°... du contrat) : on accepte les variantes plausibles
    // plutôt que de supposer une seule forme, et on échoue proprement sinon.
    const rawAmount = data.solde ?? data.balance ?? data.amount ?? data.montant;
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount)) {
      throw new GatewayError('PaySecureHub a renvoyé un solde illisible.', json);
    }

    const rawCurrency = data.devise ?? data.currency;
    const currency = typeof rawCurrency === 'string' && rawCurrency ? rawCurrency : 'FCFA';

    return { amount, currency };
  }
};
