import type { AvailableTenant, TenantClient, TenantMembership } from '../types/auth-types';

/**
 * Types de client qui ont un portail : propriétaire, locataire, et
 * copropriétaire (rattachement créé par l'invitation au portail
 * copropriétaire, `CO_OWNER`). `BUYER` n'en a pas.
 */
export function isPortalClientType(clientType: unknown): boolean {
  return clientType === 'OWNER' || clientType === 'RENTER' || clientType === 'CO_OWNER';
}

/** Dédoublonne par agence, en gardant l'ordre d'apparition (le plus récent d'abord, `my-memberships` trie déjà ainsi). */
function dedupeTenants(tenants: Array<{ id: string; name: string; slug: string } | undefined>): AvailableTenant[] {
  const seen = new Set<string>();
  const result: AvailableTenant[] = [];
  for (const tenant of tenants) {
    if (!tenant?.id || seen.has(tenant.id)) continue;
    seen.add(tenant.id);
    result.push({ id: tenant.id, name: tenant.name, slug: tenant.slug || tenant.id });
  }
  return result;
}

export interface TenantSelection {
  tenantClient: TenantClient | null;
  tenantMembership: TenantMembership | null;
  availableTenants: AvailableTenant[];
}

/** Construit `TenantMembership` depuis une entrée `asMember` — partagé avec `AuthContext.switchTenant`. */
export function buildTenantMembership(membership: any): TenantMembership {
  return {
    id: membership.id,
    tenantId: membership.tenant.id,
    tenant: {
      id: membership.tenant.id,
      name: membership.tenant.name,
      slug: membership.tenant.slug || membership.tenant.id,
      ...(membership.tenant.type ? { type: membership.tenant.type } : {})
    },
    status: membership.status
  };
}

/** Construit `TenantClient` depuis une entrée `asClient` — partagé avec `AuthContext.switchTenant`. */
export function buildTenantClient(client: any): TenantClient {
  return {
    id: client.id,
    tenantId: client.tenant.id,
    clientType: client.clientType as 'OWNER' | 'RENTER' | 'BUYER' | 'CO_OWNER',
    tenant: {
      id: client.tenant.id,
      name: client.tenant.name,
      slug: client.tenant.slug || client.tenant.id
    }
  };
}

/**
 * Choisit l'agence courante (collaborateur ou client de portail) et la liste
 * des agences éligibles au sélecteur, depuis la réponse brute de
 * `/tenants/my-memberships`.
 *
 * Logique pure, sans effet de bord — chargée à la demande par
 * `AuthContext.refreshMembership` (import dynamique) : elle ne sert qu'après
 * une réponse réseau déjà attendue, elle n'a donc rien à faire dans le chunk
 * d'entrée (REFONTE_UI_UX.md §8.1) alors que `refreshMembership` l'est déjà,
 * par construction, à ce point de son exécution.
 */
export function selectTenants(asMember: any[], asClient: any[], storedTenantId: string | null): TenantSelection {
  // Tenant clients: prioritize portal profiles (OWNER/RENTER/CO_OWNER) for portal routing.
  const portalCandidates = asClient.filter((client: any) => isPortalClientType(client?.clientType));
  const prioritizedClient =
    (storedTenantId && portalCandidates.find((client: any) => client?.tenant?.id === storedTenantId)) ||
    portalCandidates[0] ||
    asClient[0];

  const tenantClient: TenantClient | null =
    prioritizedClient?.tenant?.id && prioritizedClient?.clientType ? buildTenantClient(prioritizedClient) : null;

  // Tenant collaborators: prefer ACTIVE membership first.
  const activeMembers = asMember.filter((membership: any) => membership?.status === 'ACTIVE');
  const prioritizedMembership =
    (storedTenantId && activeMembers.find((membership: any) => membership?.tenant?.id === storedTenantId)) ||
    activeMembers[0] ||
    asMember[0];

  const tenantMembership: TenantMembership | null = prioritizedMembership?.tenant?.id
    ? buildTenantMembership(prioritizedMembership)
    : null;

  // Le sélecteur porte sur UNE seule liste à la fois — collaborateur ou
  // client de portail, jamais les deux : le persona ne change pas en cours de
  // session (voir `resolvePersona`), seule l'agence courante à l'intérieur du
  // persona change.
  const availableTenants = tenantMembership
    ? dedupeTenants(activeMembers.map((membership: any) => membership?.tenant))
    : tenantClient
      ? dedupeTenants(portalCandidates.map((client: any) => client?.tenant))
      : [];

  return { tenantClient, tenantMembership, availableTenants };
}
