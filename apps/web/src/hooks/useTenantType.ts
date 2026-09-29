import { useEffect, useState } from 'react';
import { getTenantIdentity } from '../services/personal-space-service';

/**
 * Type de l'espace courant (`AGENCY`, `OPERATOR` ou `PARTICULIER`), tel que le
 * serveur le renvoie. C'est ce type — et non `SUBSCRIPTION_ENFORCEMENT` — qui
 * décide de la navigation d'un espace personnel : en mode `warn`, l'API laisse
 * tout passer, mais un particulier ne doit jamais voir copropriété, chantiers,
 * ventes ni mandats.
 *
 * `my-memberships` ne porte pas encore le type : à défaut, une lecture de la
 * fiche de l'espace (`GET /tenants/:tenantId`), mémorisée pour la session et
 * dans `localStorage` (le type d'un espace ne change jamais). Tant que la
 * réponse n'est pas arrivée, `null` ; un échec réseau vaut `AGENCY` pour
 * l'affichage, sans le mémoriser — l'API reste juge de chaque accès.
 */

export type TenantKind = 'AGENCY' | 'OPERATOR' | 'PARTICULIER';

const memory = new Map<string, TenantKind>();
const inflight = new Map<string, Promise<TenantKind | null>>();
const storageKey = (tenantId: string) => `immotopia.tenant-type:${tenantId}`;

function isKind(value: unknown): value is TenantKind {
  return value === 'AGENCY' || value === 'OPERATOR' || value === 'PARTICULIER';
}

function readCached(tenantId: string | null | undefined): TenantKind | null {
  if (!tenantId) return null;
  const known = memory.get(tenantId);
  if (known) return known;
  try {
    const stored = localStorage.getItem(storageKey(tenantId));
    if (isKind(stored)) {
      memory.set(tenantId, stored);
      return stored;
    }
  } catch {
    /* stockage indisponible : on relira le serveur */
  }
  return null;
}

/** Mémorise un type connu (par exemple juste après la création d'un espace personnel). */
export function rememberTenantType(tenantId: string, type: TenantKind): void {
  memory.set(tenantId, type);
  try {
    localStorage.setItem(storageKey(tenantId), type);
  } catch {
    /* sans conséquence */
  }
}

/** Vide la mémoire (tests). */
export function resetTenantTypeCache(): void {
  memory.clear();
  inflight.clear();
}

function fetchType(tenantId: string): Promise<TenantKind | null> {
  const pending = inflight.get(tenantId);
  if (pending) return pending;
  const request = getTenantIdentity(tenantId)
    .then(identity => {
      if (isKind(identity.type)) {
        rememberTenantType(tenantId, identity.type);
        return identity.type;
      }
      return null;
    })
    .finally(() => inflight.delete(tenantId));
  inflight.set(tenantId, request);
  return request;
}

/**
 * @param tenantId  Espace courant.
 * @param enabled   `false` : aucun appel (super-admin, portails).
 * @param declared  Type déjà porté par la réponse d'appartenance, s'il l'est.
 */
export function useTenantType(
  tenantId: string | null | undefined,
  enabled = true,
  declared?: TenantKind | null
): TenantKind | null {
  const [resolved, setResolved] = useState<{ tenantId: string; type: TenantKind } | null>(null);

  useEffect(() => {
    if (!enabled || !tenantId || declared || readCached(tenantId)) return;
    let cancelled = false;
    fetchType(tenantId)
      .then(type => {
        if (!cancelled) setResolved({ tenantId, type: type ?? 'AGENCY' });
      })
      .catch(() => {
        if (!cancelled) setResolved({ tenantId, type: 'AGENCY' });
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, enabled, declared]);

  if (!enabled || !tenantId) return null;
  if (declared) return declared;
  const cached = readCached(tenantId);
  if (cached) return cached;
  return resolved?.tenantId === tenantId ? resolved.type : null;
}
