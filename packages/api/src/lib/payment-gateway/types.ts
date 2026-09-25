/**
 * Interface commune à toutes les implémentations d'agrégateur de paiement en
 * ligne (lot 7). Aujourd'hui : PaySecureHub (réel) et le simulateur. Toute
 * nouvelle implémentation (`GatewayClient`) doit passer par cette forme pour
 * que `service.ts` reste indépendant du fournisseur.
 */

export interface GatewayCredentials {
  /**
   * Agence propriétaire de ce compte marchand. Le client réel ne l'envoie pas
   * à l'agrégateur ; le simulateur s'en sert pour filtrer ses lectures par
   * agence (garde multi-tenant, utils/prisma-tenant-guard-extension.ts).
   */
  tenantId: string;
  merchantId: string;
  /** Clé API en clair — jamais journalisée, jamais renvoyée par l'API. */
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
}

export interface BuildAwayRequest {
  /** Notre référence, renvoyée par l'agrégateur dans l'IPN. */
  codePaiement: string;
  nomUsager: string;
  prenomUsager: string;
  telephone: string;
  email: string;
  libelleArticle: string;
  quantite: number;
  /** Entier, en FCFA. */
  montant: number;
  libOrder: string;
  urlRetour: string;
  urlCallback: string;
}

export interface BuildAwayResult {
  /** Page hébergée où rediriger le locataire. */
  url: string;
  tokens: string | null;
  code: string | null;
  message: string | null;
}

/** États bruts possibles après normalisation — voir le contrat §2.2. */
export type MappedGatewayState = 'SUCCESS' | 'FAILED' | 'CANCELED' | 'PENDING';

export interface ProviderStatus {
  /** `payments.state` brut, non normalisé. */
  rawState: string | null;
  mappedState: MappedGatewayState;
  transactionId: string | null;
  /** Entier, tel que renvoyé par l'agrégateur. */
  amount: number | null;
  fees: number | null;
  serviceName: string | null;
  error: string | null;
  /** Charge utile brute, conservée dans `lastProviderPayload` pour audit. */
  raw: unknown;
}

export interface BalanceResult {
  amount: number;
  currency: string;
}

export interface GatewayClient {
  buildAway(credentials: GatewayCredentials, request: BuildAwayRequest): Promise<BuildAwayResult>;
  /** Statut faisant foi — jamais le corps de l'IPN. Voir le contrat §2.1. */
  getStatus(credentials: GatewayCredentials, codePaiement: string): Promise<ProviderStatus>;
  getBalance(credentials: GatewayCredentials): Promise<BalanceResult>;
}

/** Erreur levée par un `GatewayClient` quand l'agrégateur ne peut pas être contacté ou répond en erreur. */
export class GatewayError extends Error {
  public readonly causeDetail?: unknown;

  constructor(message: string, causeDetail?: unknown) {
    super(message);
    this.name = 'GatewayError';
    this.causeDetail = causeDetail;
  }
}
