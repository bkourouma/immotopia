import { env } from '../../config/env';
import { operatorFromServiceName } from './status-mapping';
import type { BuildAwayRequest, GatewayClient, GatewayCredentials, MappedGatewayState, ProviderStatus } from './types';

/**
 * Cœur générique du paiement en ligne (lot M2) : les briques qui ne dépendent
 * ni du loyer ni d'un modèle Prisma. Premier consommateur : `checkout.ts`
 * (loyers). Second consommateur prévu : les appels de fonds Syndic.
 *
 * Règle de conception : ce fichier ne lit ni n'écrit en base. Le claim
 * atomique du checkout et les écritures métier (paiement, allocations) restent
 * chez le consommateur, dans SA transaction. Le cœur dit seulement QUOI faire
 * (`decideCheckoutTransition`) ; l'appelant l'exécute.
 */

// ---------------------------------------------------------------------------
// Délais
// ---------------------------------------------------------------------------

/** Un checkout PENDING plus ancien que cela est expiré, après une dernière vérification (contrat §2.7). */
export const CHECKOUT_EXPIRE_AFTER_MS = 48 * 60 * 60 * 1000;

/** Âge minimal d'un checkout PENDING avant que la tâche planifiée ne le rapproche (contrat §2.7). */
export const CHECKOUT_RECONCILE_MIN_AGE_MS = 2 * 60 * 1000;

/** Délai minimal entre deux interrogations de l'agrégateur déclenchées par une lecture du portail. */
export const CHECKOUT_RECHECK_INTERVAL_MS = 10 * 1000;

/** Date limite de création au-delà de laquelle la tâche planifiée rapproche un checkout PENDING (`createdAt <= cutoff`). */
export function reconcileCutoff(now: number = Date.now()): Date {
  return new Date(now - CHECKOUT_RECONCILE_MIN_AGE_MS);
}

/** Date limite de création au-delà de laquelle un checkout PENDING encore en attente expire (`createdAt <= cutoff`). */
export function expiryCutoff(now: number = Date.now()): Date {
  return new Date(now - CHECKOUT_EXPIRE_AFTER_MS);
}

/** Un checkout PENDING créé à `createdAt` doit-il expirer (48 h révolues, borne incluse) ? */
export function isCheckoutExpired(createdAt: Date, now: number = Date.now()): boolean {
  return createdAt <= expiryCutoff(now);
}

/**
 * Une lecture du portail doit-elle redemander le statut à l'agrégateur ?
 * Oui si jamais vérifié, ou vérifié il y a plus de `CHECKOUT_RECHECK_INTERVAL_MS`.
 */
export function isDueForRecheck(lastCheckedAt: Date | null | undefined, now: number = Date.now()): boolean {
  if (!lastCheckedAt) return true;
  return lastCheckedAt.getTime() < now - CHECKOUT_RECHECK_INTERVAL_MS;
}

// ---------------------------------------------------------------------------
// URL renvoyée par l'agrégateur
// ---------------------------------------------------------------------------

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Hôte de boucle locale : `localhost`, 127.0.0.1, [::1] ou `*.localhost` (RFC 6761). */
function isLoopbackHost(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname) || hostname.endsWith('.localhost');
}

/**
 * URL de paiement fournie par l'agrégateur, acceptée pour une redirection
 * publique : forme normalisée (`href`) ou `null`. https obligatoire ; http
 * seulement en simulateur ET sur l'hôte local ; pas d'identifiants dans
 * l'URL, ni espace autour. Même esprit que `isSafeCheckoutUrl` côté web.
 */
export function normalizeProviderCheckoutUrl(raw: unknown, mode: 'SIMULATOR' | 'LIVE'): string | null {
  if (typeof raw !== 'string' || raw === '' || raw !== raw.trim()) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.protocol === 'https:') return url.href;
  if (url.protocol === 'http:' && mode === 'SIMULATOR' && isLoopbackHost(url.hostname)) return url.href;
  return null;
}

/** URL d'IPN donnée à l'agrégateur. Identique pour tous les consommateurs : l'IPN retrouve le checkout par son code. */
export function paySecureHubIpnUrl(): string {
  return `${env.BACKEND_URL.replace(/\/$/, '')}/api/payment-gateway/paysecurehub/ipn`;
}

/**
 * URL refusée par `normalizeProviderCheckoutUrl`. Volontairement SANS l'URL
 * dans le message (elle ne doit ni être stockée ni journalisée) et distincte
 * de `GatewayError` : l'appelant la traite comme une erreur d'agrégateur
 * générique.
 */
export class UnsafeProviderCheckoutUrlError extends Error {
  constructor() {
    super('Unsafe provider checkout URL');
    this.name = 'UnsafeProviderCheckoutUrlError';
  }
}

// ---------------------------------------------------------------------------
// Appel build-away
// ---------------------------------------------------------------------------

export interface CheckoutPayer {
  nom: string;
  prenom: string;
  telephone: string;
  email: string;
}

export interface RequestProviderCheckoutParams {
  client: GatewayClient;
  credentials: GatewayCredentials;
  mode: 'SIMULATOR' | 'LIVE';
  /** Notre référence (`IMT-…`, `IMP-…`, …), renvoyée par l'IPN. */
  codePaiement: string;
  payer: CheckoutPayer;
  libelleArticle: string;
  libOrder: string;
  /** Entier, en FCFA. */
  amount: number;
  /** Défaut : 1. */
  quantity?: number;
  returnUrl: string;
  /** Défaut : `paySecureHubIpnUrl()`. */
  callbackUrl?: string;
  /**
   * `true` : l'URL renvoyée est passée par `normalizeProviderCheckoutUrl` et
   * `UnsafeProviderCheckoutUrlError` est levée si elle est refusée (chemins
   * publics). `false` : renvoyée telle quelle.
   */
  validateUrl?: boolean;
}

export interface ProviderCheckoutRedirect {
  /** Page hébergée où rediriger le payeur (normalisée si `validateUrl`). */
  url: string;
  /** Jeton de l'agrégateur, `null` si absent. */
  token: string | null;
}

/**
 * Appelle `build-away` et rend l'URL de redirection. Les erreurs du client
 * (`GatewayError`…) remontent telles quelles : l'appelant décide comment
 * marquer son paiement en échec.
 */
export async function requestProviderCheckoutRedirect(
  params: RequestProviderCheckoutParams
): Promise<ProviderCheckoutRedirect> {
  const request: BuildAwayRequest = {
    codePaiement: params.codePaiement,
    nomUsager: params.payer.nom,
    prenomUsager: params.payer.prenom,
    telephone: params.payer.telephone,
    email: params.payer.email,
    libelleArticle: params.libelleArticle,
    quantite: params.quantity ?? 1,
    montant: params.amount,
    libOrder: params.libOrder,
    urlRetour: params.returnUrl,
    urlCallback: params.callbackUrl ?? paySecureHubIpnUrl()
  };
  const result = await params.client.buildAway(params.credentials, request);

  let url = result.url;
  if (params.validateUrl) {
    const safe = normalizeProviderCheckoutUrl(result.url, params.mode);
    if (!safe) throw new UnsafeProviderCheckoutUrlError();
    url = safe;
  }
  return { url, token: result.tokens };
}

// ---------------------------------------------------------------------------
// Statut fournisseur normalisé
// ---------------------------------------------------------------------------

export type CheckoutOperator = ReturnType<typeof operatorFromServiceName>;

export interface NormalizedProviderStatus {
  state: MappedGatewayState;
  providerTransactionId: string | null;
  /** Entier tel que renvoyé par l'agrégateur, `null` si absent. */
  amount: number | null;
  providerFees: number | null;
  serviceName: string | null;
  /** Moyen réel déduit de `serviceName` (`OTHER` si inconnu ou carte). */
  operator: CheckoutOperator;
  /** `payments.state` brut, pour le suivi et les messages. */
  rawState: string | null;
  /** Message d'erreur de l'agrégateur, le cas échéant. */
  error: string | null;
  /** Charge utile brute, conservée pour audit. */
  raw: unknown;
}

/** Pure : traduit la réponse d'un `GatewayClient` en résultat normalisé. */
export function normalizeProviderStatus(ps: ProviderStatus): NormalizedProviderStatus {
  return {
    state: ps.mappedState,
    providerTransactionId: ps.transactionId,
    amount: ps.amount,
    providerFees: ps.fees,
    serviceName: ps.serviceName,
    operator: operatorFromServiceName(ps.serviceName),
    rawState: ps.rawState,
    error: ps.error,
    raw: ps.raw
  };
}

/**
 * Interroge l'agrégateur (statut faisant foi, jamais le corps d'un IPN) et
 * normalise la réponse. Les erreurs du client remontent telles quelles.
 */
export async function fetchNormalizedProviderStatus(
  client: GatewayClient,
  credentials: GatewayCredentials,
  codePaiement: string
): Promise<NormalizedProviderStatus> {
  return normalizeProviderStatus(await client.getStatus(credentials, codePaiement));
}

// ---------------------------------------------------------------------------
// Décision de transition (pure) — contrat §2.2 à §2.6
// ---------------------------------------------------------------------------

export type CheckoutDecisionAction = 'NOOP' | 'TOUCH' | 'SUCCEED' | 'FAIL' | 'CANCEL' | 'REVIEW';

export interface CheckoutDecision {
  action: CheckoutDecisionAction;
  /** Présent seulement avec `REVIEW` : motif stocké sur la tentative. */
  reviewReason?: string;
}

export interface DecideCheckoutTransitionInput {
  /** Statut courant de la tentative : PENDING, SUCCESS, FAILED, CANCELED, EXPIRED, REVIEW. */
  currentStatus: string;
  /** Montant attendu, en FCFA (arrondi à l'entier pour la comparaison). */
  expectedAmount: number;
  provider: Pick<NormalizedProviderStatus, 'state' | 'amount' | 'rawState'>;
}

/** Motif de revue « état contraire après un paiement déjà encaissé » (règle 5), réutilisable par l'appelant. */
export function contraryAfterSuccessReviewReason(rawState: string | null): string {
  return `PaySecureHub rapporte maintenant « ${rawState ?? ''} » pour un paiement déjà réussi.`;
}

/**
 * Que faire de la réponse de l'agrégateur pour une tentative dans son statut courant ?
 *
 * - `NOOP`    : tentative close (EXPIRED), rien à écrire.
 * - `TOUCH`   : en attente chez l'agrégateur, ou conclusion déjà écrite
 *               (rejeu idempotent, règle 6) : seul le suivi est mis à jour.
 * - `REVIEW`  : un succès déjà conclu ne redescend jamais (règle 5), ou le
 *               montant payé diffère du montant attendu.
 * - `SUCCEED` / `FAIL` / `CANCEL` : l'appelant exécute la transition, sous
 *               claim atomique, dans la même transaction que ses écritures métier.
 *
 * Reste à la charge de l'appelant : le cas d'une tentative en REVIEW dont le
 * paiement métier est déjà encaissé et qui reçoit FAIL/CANCEL (elle doit
 * rester en REVIEW) — il dépend de l'état du paiement, lu sous transaction.
 */
export function decideCheckoutTransition(input: DecideCheckoutTransitionInput): CheckoutDecision {
  const { currentStatus, expectedAmount, provider } = input;

  if (currentStatus === 'EXPIRED') return { action: 'NOOP' };

  if (provider.state === 'PENDING' || currentStatus === provider.state) return { action: 'TOUCH' };

  if (currentStatus === 'SUCCESS') {
    return { action: 'REVIEW', reviewReason: contraryAfterSuccessReviewReason(provider.rawState) };
  }

  if (provider.state === 'SUCCESS') {
    if (provider.amount !== null && Math.round(provider.amount) !== Math.round(expectedAmount)) {
      return {
        action: 'REVIEW',
        reviewReason: `Montant reçu (${provider.amount}) différent du montant attendu (${expectedAmount}).`
      };
    }
    return { action: 'SUCCEED' };
  }

  return { action: provider.state === 'FAILED' ? 'FAIL' : 'CANCEL' };
}
