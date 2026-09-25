import type { InternalAxiosRequestConfig } from 'axios';

/**
 * Déduit l'agence d'une requête refusée, pour le bandeau d'agence suspendue.
 *
 * L'URL le dit directement sur les routes d'agence (`/tenants/:id/...`,
 * `/admin/tenants/:id/...`) ; sur une route de portail, l'URL ne porte pas
 * l'agence — on relit alors l'en-tête `X-Portal-Tenant-Id` posé par
 * l'intercepteur de requête d'`api-client.ts`.
 *
 * Module à part, chargé à la demande par l'intercepteur de réponse : il ne
 * sert que sur un 403 `TENANT_SUSPENDED`, une réponse d'erreur rare — il n'a
 * donc rien à faire dans le chunk d'entrée (REFONTE_UI_UX.md §8.1).
 */
export function deduireTenantIdSuspendu(config?: InternalAxiosRequestConfig): string | null {
  const url = config?.url ?? '';
  const match = url.match(/\/(?:admin\/)?tenants\/([^/?]+)/);
  if (match) return match[1];

  const header = config?.headers?.get?.('X-Portal-Tenant-Id');
  return typeof header === 'string' ? header : null;
}
